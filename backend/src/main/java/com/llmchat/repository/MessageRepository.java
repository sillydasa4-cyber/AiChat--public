package com.llmchat.repository;

import com.llmchat.entity.Conversation;
import com.llmchat.entity.Message;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findByConversationOrderByCreatedAtAsc(Conversation conversation);
    void deleteByConversation(Conversation conversation);
}
