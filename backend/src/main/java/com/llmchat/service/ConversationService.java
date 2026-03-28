package com.llmchat.service;

import com.llmchat.entity.Conversation;
import com.llmchat.entity.Message;
import com.llmchat.entity.User;
import com.llmchat.repository.ConversationRepository;
import com.llmchat.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;

    @Transactional
    public Conversation getOrCreate(Long conversationId, User user, String firstMessage) {
        if (conversationId != null) {
            return conversationRepository.findByIdAndUser(conversationId, user)
                    .orElseThrow(() -> new IllegalArgumentException("Conversation not found"));
        }
        // 用第一条消息前 50 字符作标题
        String title = firstMessage.length() > 50
                ? firstMessage.substring(0, 50) + "..."
                : firstMessage;

        return conversationRepository.save(
                Conversation.builder().user(user).title(title).build()
        );
    }

    @Transactional
    public Message saveMessage(Conversation conversation, Message.Role role, String content) {
        // 更新会话的 updatedAt
        conversationRepository.save(conversation);
        return messageRepository.save(
                Message.builder()
                        .conversation(conversation)
                        .role(role)
                        .content(content)
                        .build()
        );
    }

    @Transactional(readOnly = true)
    public List<Message> getMessages(Conversation conversation) {
        return messageRepository.findByConversationOrderByCreatedAtAsc(conversation);
    }

    @Transactional(readOnly = true)
    public List<Conversation> getUserConversations(User user) {
        return conversationRepository.findByUserOrderByUpdatedAtDesc(user);
    }

    @Transactional
    public void deleteConversation(Long id, User user) {
        Conversation conv = conversationRepository.findByIdAndUser(id, user)
                .orElseThrow(() -> new IllegalArgumentException("Conversation not found"));
        messageRepository.deleteByConversation(conv);   // 先删消息，避免外键约束报错
        conversationRepository.delete(conv);
    }
}
