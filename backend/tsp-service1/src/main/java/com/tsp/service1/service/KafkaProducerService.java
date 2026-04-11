package com.tsp.service1.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tsp.service1.model.CommandRequest;
import io.opentelemetry.api.trace.Span;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;
import org.springframework.util.concurrent.ListenableFutureCallback;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Kafka 生产者服务
 *
 * ★ OTel Agent 自动插桩 KafkaTemplate：
 *   每次 send() 自动生成 Producer Span
 *   自动在 Kafka Message Header 里注入 traceparent
 *   Consumer 端 Agent 自动提取 traceparent，实现跨服务链路贯通
 *
 * 链路效果：
 *   service1 Producer Span
 *   └── (Kafka 传输)
 *       └── service2 Consumer Span（traceId 完全一致）
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class KafkaProducerService {

    private final KafkaTemplate<String, byte[]> kafkaTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${tsp.kafka.topic.command}")
    private String commandTopic;

    /**
     * 发送指令事件到 Kafka
     * ★ Agent 自动生成 kafka.produce Span，并注入 traceparent 到 Message Header
     */
    public void sendCommandEvent(CommandRequest request, String traceId, String spanId) {
        try {
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("vin",         request.getVin());
            event.put("commandType", request.getCommandType());
            event.put("source",      request.getSource());
            event.put("traceId",     traceId);   // 业务层也在消息体里带上 traceId
            event.put("spanId",      spanId);
            event.put("timestamp",   System.currentTimeMillis());

            String message = objectMapper.writeValueAsString(event);

            // ★ Agent 拦截这个 send()，生成 Producer Span
            //   并在 Kafka Header 里注入：traceparent / tracestate
            byte[] messageBytes = message.getBytes(StandardCharsets.UTF_8);
            var future = kafkaTemplate.send(commandTopic, request.getVin(), messageBytes);

            future.addCallback(new ListenableFutureCallback<SendResult<String, byte[]>>() {
                @Override
                public void onSuccess(SendResult<String, byte[]> result) {
                    log.info("[Kafka] 发送成功 topic={} partition={} offset={} traceId={}",
                            commandTopic,
                            result.getRecordMetadata().partition(),
                            result.getRecordMetadata().offset(),
                            traceId);
                }
                @Override
                public void onFailure(Throwable ex) {
                    log.error("[Kafka] 发送失败 topic={} traceId={}", commandTopic, traceId, ex);
                }
            });

            log.info("[Kafka] 消息已提交 topic={} key={} traceId={}", commandTopic, request.getVin(), traceId);

        } catch (Exception e) {
            log.error("[Kafka] 序列化失败", e);
            throw new RuntimeException("Kafka 发送失败", e);
        }
    }

    /**
     * 验证接口：单独触发一条 Kafka 消息，验证链路传播
     */
    public Map<String, Object> verifyKafka(String vin) {
        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();
        String spanId  = span.getSpanContext().getSpanId();

        CommandRequest req = CommandRequest.builder()
                .vin(vin).commandType("VERIFY").source("KafkaVerify").build();

        sendCommandEvent(req, traceId, spanId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("traceId",   traceId);
        result.put("spanId",    spanId);
        result.put("topic",     commandTopic);
        result.put("key",       vin);
        result.put("tip",       "在 Jaeger 里查看此 traceId，能看到 kafka.produce Span；service2 消费后会产生 kafka.consume Span，traceId 完全一致");
        return result;
    }
}
