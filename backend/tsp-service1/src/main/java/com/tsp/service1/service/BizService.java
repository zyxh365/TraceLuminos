package com.tsp.service1.service;

import com.tsp.service1.entity.CommandRecord;
import com.tsp.service1.feign.Service2FeignClient;
import com.tsp.service1.model.CommandRequest;
import com.tsp.service1.repository.CommandRecordRepository;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Scope;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.LinkedHashMap;
import java.util.Map;
/**
 * 业务逻辑层
 *
 * 每次调用触发完整链路：
 *   Redis 读缓存 → MySQL 写记录 → HTTP 调用 service2 → Kafka 发消息
 *
 * ★ 所有 Redis / MySQL / Kafka / HTTP 操作均由 OTel Agent 自动插桩
 *   无需任何额外代码，Jaeger 里能看到完整的 Span 树
 */

@Slf4j
@Service
@RequiredArgsConstructor
public class BizService {
    
    private final RestTemplate restTemplate;
    private final Service2FeignClient service2FeignClient;
    private final CommandRecordRepository commandRecordRepository;
    private final RedisService              redisService;
    private final KafkaProducerService      kafkaProducerService;


    @Value("${tsp.service2.url}")
    private String service2Url;

    // ─────────────────────────────────────────────────────────────
    // 场景 1：RestTemplate 调用 service2
    // Agent 自动拦截 RestTemplate，注入 traceparent Header
    // ─────────────────────────────────────────────────────────────
    public Map<String, Object> callViaRestTemplate(CommandRequest request) {
        // 当前 Span 信息（service1 这侧）
        Span currentSpan = Span.current();
        String traceId = currentSpan.getSpanContext().getTraceId();
        String spanId  = currentSpan.getSpanContext().getSpanId();

        log.info("[RestTemplate] 发起调用 service2 | traceId={} spanId={} vin={} type={}",
                traceId, spanId, request.getVin(), request.getCommandType());

        // ★ 手动创建业务 Span，标记这是 RestTemplate 调用阶段
        var span = GlobalOpenTelemetry.getTracer("tsp-service1")
                .spanBuilder("biz.call.rest")
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute("tsp.vin", request.getVin())
                .setAttribute("tsp.call.type", "RestTemplate")
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            // ① Redis：读缓存（Agent 自动生成 redis GET Span）
            String cached = redisService.getVinCache(request.getVin());
            log.info("[BizService-REST] Redis 缓存 hit={}", cached != null);

            // ② Redis：写缓存（Agent 自动生成 redis SET Span）
            redisService.cacheVinInfo(request.getVin(), request.getCommandType());

            // ③ MySQL：写记录（Agent 自动生成 INSERT Span）
            CommandRecord record = commandRecordRepository.save(
                    CommandRecord.builder()
                            .vin(request.getVin())
                            .commandType(request.getCommandType())
                            .callType("RestTemplate")
                            .traceId(traceId)
                            .spanId(spanId)
                            .status("CREATED")
                            .build()
            );
            log.info("[BizService-REST] MySQL 写入成功 id={}", record.getId());

            // ④ HTTP：调用 service2（Agent 自动注入 traceparent Header）
            request.setSource("RestTemplate");
            @SuppressWarnings("unchecked")
            Map<String, Object> service2Response = restTemplate.postForObject(
                    service2Url + "/core/command", request, Map.class);

            log.info("[RestTemplate] service2 响应 | traceId={}", traceId);

            // ⑤ Kafka：发布事件（Agent 自动注入 traceparent 到 Message Header）
            kafkaProducerService.sendCommandEvent(request, traceId, spanId);

            // ⑥ MySQL：更新状态
            record.setStatus("DISPATCHED");
            commandRecordRepository.save(record);

            // ⑦ Redis：缓存最终状态
            redisService.cacheCommandStatus(traceId, "DISPATCHED");

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("callType",          "RestTemplate");
            result.put("service1_traceId",           traceId);
            result.put("service1_spanId",            spanId);
            result.put("mysql_record_id",   record.getId());
            result.put("redis_cache_hit",   cached != null);
            result.put("kafka_topic",       "tsp.command.events");
            result.put("service2_response", service2Response);
            result.put("tip", "service1_traceId 应该和 service2_response 里的 traceId 完全一致");
            result.put("span_tree_tip",     "Jaeger 里此 traceId 下应看到：redis GET/SET + INSERT + HTTP + kafka.produce 等多个子 Span");

            span.setStatus(StatusCode.OK);
            return result;

        } catch (Exception e) {
            span.setStatus(StatusCode.ERROR, e.getMessage());
            span.recordException(e);
            log.error("[RestTemplate] 调用 service2 失败", e);
            throw e;
        } finally {
            span.end();
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 场景 2：OpenFeign 调用 service2
    // Agent 自动拦截 Feign HTTP 请求，注入 traceparent Header
    // ─────────────────────────────────────────────────────────────
    public Map<String, Object> callViaFeign(CommandRequest request) {
        Span currentSpan = Span.current();
        String traceId = currentSpan.getSpanContext().getTraceId();
        String spanId  = currentSpan.getSpanContext().getSpanId();

        log.info("[Feign] 发起调用 service2 | traceId={} spanId={} vin={} type={}",
                traceId, spanId, request.getVin(), request.getCommandType());

        var span = GlobalOpenTelemetry.getTracer("tsp-service1")
                .spanBuilder("biz.call.feign")
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute("tsp.vin", request.getVin())
                .setAttribute("tsp.call.type", "OpenFeign")
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            // ① Redis 读
            String cached = redisService.getVinCache(request.getVin());

            // ② Redis 写
            redisService.cacheVinInfo(request.getVin(), request.getCommandType());

            // ③ MySQL 写
            CommandRecord record = commandRecordRepository.save(
                    CommandRecord.builder()
                            .vin(request.getVin())
                            .commandType(request.getCommandType())
                            .callType("OpenFeign")
                            .traceId(traceId)
                            .spanId(spanId)
                            .status("CREATED")
                            .build()
            );

            // ④ Feign 调用 service2
            request.setSource("OpenFeign");
            Map<String, Object> service2Response = service2FeignClient.sendCommand(request);

            // ⑤ Kafka 发消息
            kafkaProducerService.sendCommandEvent(request, traceId, spanId);

            // ⑥ MySQL 更新
            record.setStatus("DISPATCHED");
            commandRecordRepository.save(record);

            // ⑦ Redis 更新状态
            redisService.cacheCommandStatus(traceId, "DISPATCHED");

            span.setStatus(StatusCode.OK);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("callType",          "OpenFeign");
            result.put("traceId",           traceId);
            result.put("spanId",            spanId);
            result.put("mysql_record_id",   record.getId());
            result.put("redis_cache_hit",   cached != null);
            result.put("kafka_topic",       "tsp.command.events");
            result.put("service2_response", service2Response);
            return result;


        } catch (Exception e) {
            span.setStatus(StatusCode.ERROR, e.getMessage());
            span.recordException(e);
            log.error("[Feign] 调用 service2 失败", e);
            throw e;
        } finally {
            span.end();
        }
    }
}
