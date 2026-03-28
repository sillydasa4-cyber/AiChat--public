package com.llmchat.dto;

public record ChatRequest(Long conversationId, String content, Boolean regenerate) {}

