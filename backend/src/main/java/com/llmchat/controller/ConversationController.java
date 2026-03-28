package com.llmchat.controller;

import com.llmchat.entity.Conversation;
import com.llmchat.entity.Message;
import com.llmchat.entity.User;
import com.llmchat.repository.UserRepository;
import com.llmchat.service.ConversationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
public class ConversationController {

    private final ConversationService conversationService;
    private final UserRepository userRepository;

    /** 获取当前用户所有会话列表 */
    @GetMapping
    public ResponseEntity<List<Conversation>> list(@AuthenticationPrincipal UserDetails userDetails) {
        User user = getUser(userDetails);
        return ResponseEntity.ok(conversationService.getUserConversations(user));
    }

    /** 获取指定会话的消息历史 */
    @GetMapping("/{id}/messages")
    public ResponseEntity<List<Message>> messages(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails
    ) {
        User user = getUser(userDetails);
        Conversation conversation = conversationService.getOrCreate(id, user, "");
        return ResponseEntity.ok(conversationService.getMessages(conversation));
    }

    /** 删除指定会话 */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails
    ) {
        User user = getUser(userDetails);
        conversationService.deleteConversation(id, user);
        return ResponseEntity.noContent().build();
    }

    private User getUser(UserDetails userDetails) {
        return userRepository.findByUsername(userDetails.getUsername())
                .orElseThrow(() -> new RuntimeException("User not found"));
    }
}
