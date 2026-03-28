package com.llmchat.controller;

import com.llmchat.dto.ChatRequest;
import com.llmchat.service.ChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    /**
     * POST /api/chat/stream
     * 发送消息，SSE 流式返回 AI 回复
     *
     * 事件格式:
     *   {"type":"content","delta":"..."}  — 内容片段
     *   {"type":"done","conversationId":1} — 完成
     *   {"type":"error","message":"..."}  — 错误
     */
    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(
            @RequestBody ChatRequest request,
            @AuthenticationPrincipal UserDetails userDetails
    ) {
        return chatService.chat(userDetails.getUsername(), request);
    }
}
