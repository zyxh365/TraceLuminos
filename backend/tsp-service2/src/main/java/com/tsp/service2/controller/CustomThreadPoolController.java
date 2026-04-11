package com.tsp.service2.controller;

import com.tsp.service2.service.CustomThreadPoolTraceService;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.context.Scope;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * 自定义线程池 Trace 透传验证接口
 *
 * 使用方法：
 * 1. 确保 Java Agent 已启用
 * 2. 发送请求时带上 traceparent header
 * 3. 观察 traceId 是否在不同线程间一致
 */
@Slf4j
@RestController
@RequestMapping("/custom-threadpool")
@RequiredArgsConstructor
public class CustomThreadPoolController {

    private final CustomThreadPoolTraceService customThreadPoolService;

    /**
     * 场景①：Agent 自动传播（推荐）
     *
     * Postman:
     * GET http://localhost:8092/custom-threadpool/auto
     * Header: traceparent: 00-aabbccddeeff00112233445566778899-1122334455667788-01
     */
    @GetMapping("/auto")
    public Map<String, Object> testAutoPropagation(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();

        log.info("[Controller] /auto 接口调用 | traceId={}", traceId);

        // 创建子 Span
        var childSpan = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("controller.test-auto-propagation")
                .setSpanKind(SpanKind.SERVER)
                .startSpan();

        try (Scope scope = childSpan.makeCurrent()) {
            Map<String, Object> result = customThreadPoolService.executeWithAutoPropagation();
            result.put("http_traceId", traceId);
            result.put("说明", "OTel Agent 自动传播 Context 到线程池，无需任何手动代码");
            return result;
        } finally {
            childSpan.end();
        }
    }

    /**
     * 场景②：手动 Context 传播（兜底方案）
     *
     * Postman:
     * GET http://localhost:8092/custom-threadpool/manual
     * Header: traceparent: 00-aabbccddeeff00112233445566778899-1122334455667788-01
     */
    @GetMapping("/manual")
    public Map<String, Object> testManualPropagation(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();

        log.info("[Controller] /manual 接口调用 | traceId={}", traceId);

        var childSpan = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("controller.test-manual-propagation")
                .setSpanKind(SpanKind.SERVER)
                .startSpan();

        try (Scope scope = childSpan.makeCurrent()) {
            Map<String, Object> result = customThreadPoolService.executeWithManualPropagation();
            result.put("http_traceId", traceId);
            result.put("说明", "手动捕获 Context 并在子线程恢复，适用于 Agent 未覆盖的场景");
            return result;
        } finally {
            childSpan.end();
        }
    }

    /**
     * 场景③：CompletableFuture 自动传播
     *
     * Postman:
     * GET http://localhost:8092/custom-threadpool/completable
     * Header: traceparent: 00-aabbccddeeff00112233445566778899-1122334455667788-01
     */
    @GetMapping("/completable")
    public CompletableFuture<Map<String, Object>> testCompletableFuture(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();

        log.info("[Controller] /completable 接口调用 | traceId={}", traceId);

        var childSpan = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("controller.test-completable-future")
                .setSpanKind(SpanKind.SERVER)
                .startSpan();

        try (Scope scope = childSpan.makeCurrent()) {
            return customThreadPoolService.executeWithCompletableFuture()
                    .thenApply(result -> {
                        result.put("http_traceId", traceId);
                        result.put("说明", "CompletableFuture 自动传播 Context");
                        childSpan.end();
                        return result;
                    });
        }
    }

    /**
     * 场景④：自定义 Callable 包装
     *
     * Postman:
     * GET http://localhost:8092/custom-threadpool/callable
     * Header: traceparent: 00-aabbccddeeff00112233445566778899-1122334455667788-01
     */
    @GetMapping("/callable")
    public Map<String, Object> testWrappedCallable(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();

        log.info("[Controller] /callable 接口调用 | traceId={}", traceId);

        var childSpan = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("controller.test-wrapped-callable")
                .setSpanKind(SpanKind.SERVER)
                .startSpan();

        try (Scope scope = childSpan.makeCurrent()) {
            Map<String, Object> result = customThreadPoolService.executeWithWrappedCallable();
            result.put("http_traceId", traceId);
            result.put("说明", "自定义包装 Callable 传播 Context，最底层的方式");
            return result;
        } finally {
            childSpan.end();
        }
    }

    /**
     * 验证 Baggage 传播
     *
     * Postman:
     * GET http://localhost:8092/custom-threadpool/baggage
     * Header:
     *   traceparent: 00-aabbccddeeff00112233445566778899-1122334455667788-01
     *   baggage: userId=12345,vin=TEST_VIN_001
     */
    @GetMapping("/baggage")
    public Map<String, Object> testBaggagePropagation(
            @RequestHeader(value = "traceparent", required = false) String traceparent,
            @RequestHeader(value = "baggage", required = false) String baggage) {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();

        log.info("[Controller] /baggage 接口调用 | traceId={} | baggage={}", traceId, baggage);

        var childSpan = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("controller.test-baggage-propagation")
                .setSpanKind(SpanKind.SERVER)
                .setAttribute("baggage.header", baggage)
                .startSpan();

        try (Scope scope = childSpan.makeCurrent()) {
            Map<String, Object> result = customThreadPoolService.verifyBaggagePropagation();
            result.put("http_traceId", traceId);
            result.put("http_baggage", baggage);
            result.put("说明", "Baggage 随 Context 一起传播到子线程，可用于传递业务上下文");
            return result;
        } finally {
            childSpan.end();
        }
    }

    /**
     * 一键测试所有场景
     *
     * Postman:
     * GET http://localhost:8092/custom-threadpool/all
     * Header: traceparent: 00-aabbccddeeff00112233445566778899-1122334455667788-01
     */
    @GetMapping("/all")
    public Map<String, Object> testAllScenarios(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();

        log.info("[Controller] /all 接口调用 | traceId={}", traceId);

        Map<String, Object> allResults = new java.util.concurrent.ConcurrentHashMap<>();
        allResults.put("http_traceId", traceId);
        allResults.put("场景①_Agent自动传播", customThreadPoolService.executeWithAutoPropagation());
        allResults.put("场景②_手动Context传播", customThreadPoolService.executeWithManualPropagation());
        allResults.put("场景④_包装Callable", customThreadPoolService.executeWithWrappedCallable());

        // CompletableFuture 需要等待
        try {
            Map<String, Object> completableResult =
                    customThreadPoolService.executeWithCompletableFuture().get();
            allResults.put("场景③_CompletableFuture", completableResult);
        } catch (Exception e) {
            allResults.put("场景③_CompletableFuture", "执行失败: " + e.getMessage());
        }

        allResults.put("说明", "所有场景的 traceId 都应该和 http_traceId 一致");
        return allResults;
    }
}
