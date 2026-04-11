package com.tsp.service2.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tsp.service2.entity.ProcessedCommand;
import com.tsp.service2.repository.ProcessedCommandRepository;
import io.opentelemetry.api.trace.Span;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Kafka 消费者服务
 *
 * ★ OTel Agent 自动插桩 @KafkaListener：
 *   消费消息时自动从 Message Header 提取 traceparent
 *   恢复 Context，生成 Consumer Span
 *
 * 效果：
 *   service1 kafka.produce Span（traceId: abc）
 *   └── service2 kafka.consume Span（traceId: abc，同一个！）
 *         └── INSERT INTO s2_processed_command（自动 Span）
 *               └── redis SET（自动 Span）
 *
 * 这就是跨服务、跨消息队列的完整链路追踪
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class KafkaConsumerService {

    private final ProcessedCommandRepository processedCommandRepository;
    private final RedisService               redisService;
    private final ObjectMapper               objectMapper = new ObjectMapper();

    /**
     * ★ Agent 自动：
     *   1. 从 ConsumerRecord Header 提取 traceparent
     *   2. 恢复 Context，使当前线程的 traceId = 生产者的 traceId
     *   3. 生成 kafka.consume Span（父Span是 kafka.produce Span）
     *   4. 后续所有操作（MySQL/Redis）都在这个 Span 树下
     */
    @KafkaListener(topics = "${tsp.kafka.topic.command}", groupId = "tsp-service2-group")
    public void consume(ConsumerRecord<String, byte[]> record) {
        // ★ 此处 traceId 和 service1 的 traceId 完全一致（Agent 已恢复 Context）
        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();
        String spanId  = span.getSpanContext().getSpanId();

        log.info("[KafkaConsumer] 收到消息 topic={} partition={} offset={} key={} traceId={}",
                record.topic(), record.partition(), record.offset(), record.key(), traceId);

        try {
            String message = new String(record.value(), StandardCharsets.UTF_8);
            @SuppressWarnings("unchecked")
            Map<String, Object> event = objectMapper.readValue(message, Map.class);

            String vin         = (String) event.get("vin");
            String commandType = (String) event.get("commandType");
            String source      = (String) event.get("source");
            String producerTraceId = (String) event.get("traceId"); // 消息体里的 traceId

            log.info("[KafkaConsumer] 处理事件 vin={} commandType={} source={}", vin, commandType, source);
            log.info("[KafkaConsumer] 消息体traceId={} 当前traceId={} 是否一致={}",
                    producerTraceId, traceId, traceId.equals(producerTraceId));

            // ★ MySQL 写入（Agent 自动生成 INSERT Span，traceId 仍是生产者的）
            ProcessedCommand processed = processedCommandRepository.save(
                ProcessedCommand.builder()
                    .vin(vin)
                    .commandType(commandType)
                    .source("kafka:" + source)
                    .traceId(traceId)       // 用 Agent 恢复的 traceId（和 service1 一致）
                    .spanId(spanId)
                    .status("CONSUMED")
                    .build()
            );

            // ★ Redis 写入（Agent 自动生成 redis SET Span）
            redisService.markProcessed(traceId, "kafka-consumed");

            log.info("[KafkaConsumer] 处理完成 mysqlId={} traceId={}", processed.getId(), traceId);

        } catch (Exception e) {
            log.error("[KafkaConsumer] 处理失败 traceId={}", traceId, e);
        }
    }
}
