package com.tsp.service1.controller;

import com.tsp.service1.model.CommandRequest;
import com.tsp.service1.model.TraceContext;
import com.tsp.service1.service.BizService;
import io.opentelemetry.api.trace.Span;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * tsp-service1 对外接口
 *
 * ★ 验证方法：
 *   用 Postman 调用，在 Headers 手动加入：
 *     traceparent: 00-{32位traceId}-{16位spanId}-01
 *   例如：
 *     traceparent: 00-0af7651916cd43dd8448eb211c80319c-b9c7c989f97918e1-01
 *
 *   然后观察：
 *   1. service1 日志里的 traceId 和 Postman Header 里的一致
 *   2. service2 日志里的 traceId 也和 Postman Header 里的一致
 *   3. service1 spanId ≠ service2 spanId（每段链路 SpanId 不同）
 *   4. Jaeger 里能看到完整链路：你的 traceId → service1 → service2
 */
@Slf4j
@RestController
@RequestMapping("/biz")
@RequiredArgsConstructor
public class BizController {

    private final BizService bizService;


    // ─────────────────────────────────────────────────────────────
    // 场景 1：RestTemplate 调用 service2
    // ─────────────────────────────────────────────────────────────
    /**
     * POST /biz/rest/command
     *
     * Postman Headers:
     *   Content-Type: application/json
     *   traceparent: 00-0af7651916cd43dd8448eb211c80319c-b9c7c989f97918e1-01
     *
     * Postman Body (JSON):
     *   {"vin": "VIN001", "commandType": "AC_ON"}
     *
     * 观察点：
     *   响应里 service1_traceId == service2_response.traceId（TraceId 贯通）
     *   service1_spanId ≠ service2_response.spanId（SpanId 每段独立）
     */
    @PostMapping("/rest/command")
    public ResponseEntity<Map<String, Object>> callViaRest(@RequestBody CommandRequest request,
                                                           @RequestHeader(value = "baggage", required = false) String baggageHeader) {
        log.info("[BizController] REST 入口 | traceId={} vin={}",
                Span.current().getSpanContext().getTraceId(), request.getVin());
        log.info("[Baggage] 收到 baggage Header = {}", baggageHeader);
        return ResponseEntity.ok(bizService.callViaRestTemplate(request));
    }

    // ─────────────────────────────────────────────────────────────
    // 场景 2：OpenFeign 调用 service2
    // ─────────────────────────────────────────────────────────────
    /**
     * POST /biz/feign/command
     *
     * 和 REST 场景一样的请求格式，只是底层换成 OpenFeign
     *
     * 观察点：和 RestTemplate 场景结果完全一致
     * 说明 OTel Agent 对两种 HTTP 客户端的插桩效果相同
     */
    @PostMapping("/feign/command")
    public ResponseEntity<Map<String, Object>> callViaFeign(@RequestBody CommandRequest request) {
        log.info("[BizController] Feign 入口 | traceId={} vin={}",
                Span.current().getSpanContext().getTraceId(), request.getVin());
        return ResponseEntity.ok(bizService.callViaFeign(request));
    }


    // ─────────────────────────────────────────────────────────────
    // 辅助：查看当前请求的链路信息
    // ─────────────────────────────────────────────────────────────

    /**
     * GET /biz/trace/current
     *
     * 用 Postman 带 traceparent Header 调用，
     * 返回的 traceId 应该和 Header 里的一致（说明 Agent 正确提取了上游 Context）
     */
    @GetMapping("/trace/current")
    public ResponseEntity<TraceContext> currentTrace(
            @RequestHeader(value = "traceparent", required = false) String traceparent,
            @RequestHeader(value = "baggage", required = false) String baggage) {
        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();
        boolean valid  = span.getSpanContext().isValid();

        log.info("[TraceCheck] 收到请求 | traceparent_header={} | 解析后 traceId={}",
                traceparent, traceId);
        log.info("[BaggageCheck] baggage header = {}", baggage);

        return ResponseEntity.ok(TraceContext.builder()
                .serviceName("tsp-service1")
                .traceId(traceId)
                .spanId(span.getSpanContext().getSpanId())
                .valid(valid)
                .message(traceparent != null
                        ? "✅ 收到上游 traceparent，traceId 已继承"
                        : "⚠️ 未收到 traceparent，这是链路起点")
                .build());
    }

    /**
     * GET /biz/help
     * 列出所有验证接口
     */
    @GetMapping("/help")
    public ResponseEntity<Map<String, Object>> help() {
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("service", "tsp-service1 (port:8081)");
        result.put("current_traceId", Span.current().getSpanContext().getTraceId());
        result.put("场景1_RestTemplate", "POST /biz/rest/command  + Header: traceparent");
        result.put("场景2_OpenFeign",    "POST /biz/feign/command + Header: traceparent");
        result.put("查看链路信息",        "GET  /biz/trace/current + Header: traceparent");
        result.put("Postman_traceparent示例",
                "traceparent: 00-0af7651916cd43dd8448eb211c80319c-b9c7c989f97918e1-01");
        return ResponseEntity.ok(result);
    }
}
