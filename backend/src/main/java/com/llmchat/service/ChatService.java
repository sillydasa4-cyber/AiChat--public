package com.llmchat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.llmchat.dto.ChatRequest;
import com.llmchat.entity.Conversation;
import com.llmchat.entity.Message;
import com.llmchat.entity.User;
import com.llmchat.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.Disposable;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatService {

    private final ConversationService conversationService;
    private final DeepSeekService deepSeekService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    /**
     * 核心方法：创建 SseEmitter，异步流式返回 DeepSeek 响应
     */
    public SseEmitter chat(String username, ChatRequest request) {
        // 3 分钟超时
        SseEmitter emitter = new SseEmitter(180_000L);

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        // 1. 获取或新建会话
        Conversation conversation = conversationService.getOrCreate(
                request.conversationId(), user, request.content()
        );
        Long conversationId = conversation.getId();

        // 2. 保存用户消息（重新生成时跳过，避免重复写入历史）
        if (!Boolean.TRUE.equals(request.regenerate())) {
            conversationService.saveMessage(conversation, Message.Role.USER, request.content());
        }

        // 3. 获取完整历史（含刚保存的用户消息）
        List<Message> history = conversationService.getMessages(conversation);

        // 4. 调用 DeepSeek 并流式转发
        StringBuilder fullResponse = new StringBuilder();

        Disposable subscription = deepSeekService.streamChat(history)
                .subscribe(
                        // onNext: 收到一个 content delta
                        delta -> {
                            log.debug("onDelta: [{}]", delta);
                            fullResponse.append(delta);
                            try {
                                String event = objectMapper.writeValueAsString(Map.of(
                                        "type", "content",
                                        "delta", delta
                                ));
                                emitter.send(SseEmitter.event().data(event));
                                log.debug("SSE sent OK");
                            } catch (Exception e) {
                                log.warn("Failed to send SSE event: {}", e.getMessage());
                            }
                        },
                        // onError: API 调用出错
                        error -> {
                            log.error("DeepSeek API error", error);
                            try {
                                String event = objectMapper.writeValueAsString(Map.of(
                                        "type", "error",
                                        "message", "AI service error: " + error.getMessage()
                                ));
                                emitter.send(SseEmitter.event().data(event));
                            } catch (Exception ignored) {}
                            emitter.completeWithError(error);
                        },
                        // onComplete: 流结束
                        () -> {
                            // 5. 保存完整的 AI 回复
                            if (!fullResponse.isEmpty()) {
                                conversationService.saveMessage(
                                        conversation, Message.Role.ASSISTANT, fullResponse.toString()
                                );
                            }
                            try {
                                String event = objectMapper.writeValueAsString(Map.of(
                                        "type", "done",
                                        "conversationId", conversationId
                                ));
                                emitter.send(SseEmitter.event().data(event));
                            } catch (Exception ignored) {}
                            emitter.complete();
                        }
                );

        // 5. 客户端断开连接时取消 DeepSeek 流，避免后端继续空跑
        emitter.onCompletion(subscription::dispose);
        emitter.onTimeout(subscription::dispose);
        emitter.onError(e -> subscription.dispose());

        return emitter;
    }
}
