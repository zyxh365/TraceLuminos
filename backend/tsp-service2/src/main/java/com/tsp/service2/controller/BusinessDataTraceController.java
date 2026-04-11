package com.tsp.service2.controller;

import com.tsp.service2.service.TraceWithBusinessDataService;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Scope;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 业务数据链路追踪验证接口
 *
 * 功能：验证 Baggage 和 Attributes 是否正确保存到 ClickHouse
 *
 * 前端调用示例：
 * <pre>
 * fetch('http://localhost:8092/business/baggage', {
 *   headers: {
 *     'traceparent': '00-test0011223344556677889900-aaaaaaaaaa-01',
 *     'baggage': userId=123,vin=TEST_VIN_001,tenantId=TENANT_ABC'
 *   }
 * })
 * </pre>
 */
@Slf4j
@RestController
@RequestMapping("/business")
@RequiredArgsConstructor
public class BusinessDataTraceController {

    private final TraceWithBusinessDataService businessDataService;

    /**
     * 场景 1：使用 Baggage 传递业务上下文
     *
     * 测试命令：
     * curl -H "traceparent: 00-bagg0011223344556677889900-aaaaaaaaaa-01" \
     *   "http://localhost:8092/business/baggage?userId=123&vin=TEST_VIN_001&tenantId=TENANT_ABC"
     *
     * 期望在 ClickHouse 中查询到：
     * SELECT * FROM otel_traces.otlp_spans
     * WHERE baggage_user_id = '123' AND baggage_vin = 'TEST_VIN_001';
     */
    @GetMapping("/baggage")
    public Map<String, Object> testBaggage(
            @RequestParam(defaultValue = "user-123") String userId,
            @RequestParam(defaultValue = "VIN-TEST-001") String vin,
            @RequestParam(defaultValue = "tenant-default") String tenantId,
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        log.info("[Controller] 测试 Baggage | userId={} | vin={} | tenantId={}", userId, vin, tenantId);

        var span = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("controller.test.baggage")
                .setSpanKind(SpanKind.SERVER)
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            Map<String, Object> result = businessDataService.demonstrateBaggage(userId, vin, tenantId);
            result.put("endpoint", "/business/baggage");
            result.put("✅ ClickHouse 查询示例",
                    "SELECT * FROM otel_traces.otlp_spans WHERE baggage_user_id = '" + userId + "'");
            span.setStatus(StatusCode.OK);
            return result;
        } finally {
            span.end();
        }
    }

    /**
     * 场景 2：使用 Attributes 附加业务数据
     *
     * 测试命令：
     * curl -H "traceparent: 00-attr0011223344556677889900-bbbbbbbbbbb-01" \
     *   "http://localhost:8092/business/attributes?orderId=ORDER-001&productId=PROD-001&amount=99.99"
     *
     * 期望在 ClickHouse 中查询到：
     * SELECT * FROM otel_traces.otlp_spans
     * WHERE business_order_id = 'ORDER-001' AND business_amount > 50;
     */
    @GetMapping("/attributes")
    public Map<String, Object> testAttributes(
            @RequestParam(defaultValue = "ORDER-TEST-001") String orderId,
            @RequestParam(defaultValue = "PROD-TEST-001") String productId,
            @RequestParam(defaultValue = "100.00") Double amount,
            @RequestParam(defaultValue = "ecommerce,vip,priority") List<String> tags,
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        log.info("[Controller] 测试 Attributes | orderId={} | amount={}", orderId, amount);

        var span = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("controller.test.attributes")
                .setSpanKind(SpanKind.SERVER)
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            String[] tagsArray = tags.toArray(new String[0]);
            Map<String, Object> result = businessDataService.demonstrateAttributes(orderId, productId, amount, tagsArray);
            result.put("endpoint", "/business/attributes");
            result.put("✅ ClickHouse 查询示例",
                    "SELECT * FROM otel_traces.otlp_spans WHERE business_order_id = '" + orderId + "'");
            span.setStatus(StatusCode.OK);
            return result;
        } finally {
            span.end();
        }
    }

    /**
     * 场景 3：Baggage + Attributes 混合使用（最佳实践）
     *
     * 测试命令：
     * curl -H "traceparent: 00-mixed0011223344556677889900-cccccccccc-01" \
     *   "http://localhost:8092/business/mixed?userId=user-123&orderId=ORDER-001&amount=199.99"
     *
     * 期望在 ClickHouse 中查询到：
     * SELECT trace_id, baggage_user_id, business_order_id, business_amount
     * FROM otel_traces.otlp_spans
     * WHERE baggage_user_id = 'user-123';
     */
    @GetMapping("/mixed")
    public Map<String, Object> testMixed(
            @RequestParam(defaultValue = "user-mixed-001") String userId,
            @RequestParam(defaultValue = "ORDER-MIXED-001") String orderId,
            @RequestParam(defaultValue = "299.99") Double amount,
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        log.info("[Controller] 测试混合模式 | userId={} | orderId={} | amount={}", userId, orderId, amount);

        var span = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("controller.test.mixed")
                .setSpanKind(SpanKind.SERVER)
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            Map<String, Object> result = businessDataService.demonstrateMixed(userId, orderId, amount);
            result.put("endpoint", "/business/mixed");
            result.put("✅ ClickHouse 查询示例",
                    "SELECT * FROM otel_traces.otlp_spans " +
                    "WHERE baggage_user_id = '" + userId + "' AND business_order_id = '" + orderId + "'");
            span.setStatus(StatusCode.OK);
            return result;
        } finally {
            span.end();
        }
    }

    /**
     * 场景 4：从 HTTP Header 中提取 Baggage（实际生产场景）
     *
     * 测试命令（前端调用）：
     * curl -H "traceparent: 00-readb0011223344556677889900-dddddddddd-01" \
     *   -H "baggage: userId=front-user-123,vin=FRONT-VIN-001,tenantId=FRONT-TENANT" \
     *   "http://localhost:8092/business/read-baggage"
     *
     * Otel Agent 会自动从 baggage header 提取数据并传播
     */
    @GetMapping("/read-baggage")
    public Map<String, Object> testReadBaggageFromHeader(
            @RequestHeader(value = "baggage", required = false) String baggageHeader,
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        log.info("[Controller] 测试从 Header 读取 Baggage | baggage={}", baggageHeader);

        var span = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("controller.test.read.baggage")
                .setSpanKind(SpanKind.SERVER)
                .setAttribute("http.baggage.header", baggageHeader)
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            Map<String, Object> result = businessDataService.demonstrateReadBaggageFromHeader();
            result.put("endpoint", "/business/read-baggage");
            result.put("http_baggage_header", baggageHeader);
            result.put("说明", "OTel Agent 自动从 HTTP Header 提取 baggage，无需手动解析");
            result.put("✅ 前端使用方式",
                    "fetch(url, { headers: { 'baggage': 'userId=123,vin=TEST' } })");
            span.setStatus(StatusCode.OK);
            return result;
        } finally {
            span.end();
        }
    }

    /**
     * 场景 5：在异步线程中验证 Baggage 传播
     *
     * 测试命令：
     * curl -H "traceparent: 00-asyncb0011223344556677889900-eeeeeeeeee-01" \
     *   "http://localhost:8092/business/async-baggage"
     *
     * 验证：Baggage 随 Context 自动传播到异步线程池
     */
    @GetMapping("/async-baggage")
    public Map<String, Object> testBaggageInAsync(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        log.info("[Controller] 测试异步线程中 Baggage 传播");

        var span = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("controller.test.async.baggage")
                .setSpanKind(SpanKind.SERVER)
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            Map<String, Object> result = businessDataService.demonstrateBaggageInThreadPool();
            result.put("endpoint", "/business/async-baggage");
            result.put("✅ 验证点", "async_baggage 中的数据应该等于 parent_baggage");
            span.setStatus(StatusCode.OK);
            return result;
        } finally {
            span.end();
        }
    }

    /**
     * 一键测试所有场景
     *
     * 测试命令：
     * curl -H "traceparent: 00-allbiz00112233445566778899-ffffffffffff-01" \
     *   "http://localhost:8092/business/all"
     */
    @GetMapping("/all")
    public Map<String, Object> testAllScenarios(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        Span currentSpan = Span.current();
        String traceId = currentSpan.getSpanContext().getTraceId();

        log.info("[Controller] 一键测试所有业务数据场景 | traceId={}", traceId);

        var span = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("controller.test.business.all")
                .setSpanKind(SpanKind.SERVER)
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            Map<String, Object> result = new java.util.LinkedHashMap<>();
            result.put("traceId", traceId);
            result.put("说明", "此 traceId 包含所有业务数据场景的 Span");
            result.put("场景1_Baggage", testBaggage("user-all-001", "VIN-ALL-001", "tenant-all", traceparent));
            result.put("场景2_Attributes", testAttributes("ORDER-ALL-001", "PROD-ALL-001", Double.valueOf(199.99),
                    Arrays.asList("all-scenario", "test"), traceparent));
            result.put("场景3_Mixed", testMixed("user-mix-all", "ORDER-MIX-ALL", Double.valueOf(299.99), traceparent));
            result.put("场景4_ReadBaggage", testReadBaggageFromHeader("userId=read-all,vin=READ-ALL", traceparent));
            result.put("场景5_AsyncBaggage", testBaggageInAsync(traceparent));

            result.put("✅ ClickHouse 完整查询示例",
                    "SELECT trace_id, service_name, name, baggage_user_id, business_order_id " +
                    "FROM otel_traces.otlp_spans WHERE trace_id = '" + traceId + "'");

            span.setStatus(StatusCode.OK);
            return result;

        } finally {
            span.end();
        }
    }
}
