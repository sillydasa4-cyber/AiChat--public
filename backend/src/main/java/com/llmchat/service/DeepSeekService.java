package com.llmchat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.llmchat.entity.Message;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class DeepSeekService {

    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    @Value("${deepseek.api-key}")
    private String apiKey;

    @Value("${deepseek.api-url}")
    private String apiUrl;

    @Value("${deepseek.model}")
    private String model;

    /**
     * 调用 DeepSeek 流式 API，返回 content delta 的 Flux<String>
     * allMessages 包含完整历史（含最新的用户消息）
     */
    public Flux<String> streamChat(List<Message> allMessages) {
        List<Map<String, String>> apiMessages = buildApiMessages(allMessages);

        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("messages", apiMessages);
        body.put("stream", true);

        log.info("→ Calling DeepSeek API, messages={}, model={}", allMessages.size(), model);

        return webClient.post()
                .uri(apiUrl)
                .header("Authorization", "Bearer " + apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .bodyToFlux(DataBuffer.class)
                .doOnSubscribe(s -> log.info("→ DeepSeek stream subscribed"))
                .doOnNext(buf -> log.debug("→ chunk {} bytes", buf.readableByteCount()))
                .doOnComplete(() -> log.info("→ DeepSeek stream completed"))
                .doOnError(e -> log.error("→ DeepSeek stream error: {}", e.getMessage()))
                // DataBuffer → String
                .map(buffer -> {
                    byte[] bytes = new byte[buffer.readableByteCount()];
                    buffer.read(bytes);
                    DataBufferUtils.release(buffer);
                    return new String(bytes, StandardCharsets.UTF_8);
                })
                // 按换行拆分，处理粘包
                .flatMap(chunk -> Flux.fromArray(chunk.split("\n")))
                .map(String::trim)
                // 只处理 "data: ..." 行
                .filter(line -> line.startsWith("data: "))
                .doOnNext(line -> log.debug("→ data line: {}", line.length() > 80 ? line.substring(0, 80) : line))
                .map(line -> line.substring(6).trim())
                // 过滤结束标记
                .filter(data -> !data.isEmpty() && !"[DONE]".equals(data))
                // 解析 JSON，提取 content delta
                .mapNotNull(this::parseContentDelta)
                .doOnNext(delta -> log.debug("→ parsed delta: [{}]", delta));
    }

    private String parseContentDelta(String json) {
        try {
            JsonNode node = objectMapper.readTree(json);
            JsonNode choices = node.path("choices");
            if (choices.isEmpty()) return null;
            String content = choices.get(0).path("delta").path("content").asText(null);
            return (content != null && !content.isEmpty()) ? content : null;
        } catch (Exception e) {
            log.debug("Skipping unparseable chunk: {}", json);
            return null;
        }
    }

    private List<Map<String, String>> buildApiMessages(List<Message> messages) {
        List<Map<String, String>> result = new ArrayList<>();
        result.add(Map.of("role", "system", "content", "You are a helpful assistant. Please respond in the same language the user uses."));

        // 限制最近 40 条，避免超出上下文长度
        int start = Math.max(0, messages.size() - 40);
        for (Message msg : messages.subList(start, messages.size())) {
            result.add(Map.of(
                    "role", msg.getRole().getValue(),
                    "content", msg.getContent()
            ));
        }
        return result;
    }
}
