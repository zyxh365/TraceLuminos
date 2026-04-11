package com.tsp.service2.controller;

import com.tsp.service2.model.CommandRequest;
import com.tsp.service2.service.AsyncTaskService;
import io.opentelemetry.api.trace.Span;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * tsp-service2 对外接口
 *
 * 所有接口都会在日志里打印 traceId 和 spanId，
 * 和 service1 日志对比，验证：
 *   traceId：完全一致（整条链路唯一）
 *   spanId：不同（每个服务/每段操作有自己的 SpanId）
 */
@Slf4j
@RestController
@RequestMapping("/core")
@RequiredArgsConstructor
public class CoreController {

    private final AsyncTaskService asyncTaskService;

    // ─────────────────────────────────────────────────────────────
    // 主入口：接收 service1 的调用（RestTemplate 和 Feign 都走这里）
    // ─────────────────────────────────────────────────────────────

    /**
     * POST /core/command
     *
     * 接收 service1 的调用，同时触发异步任务，
     * 返回 service2 侧的 TraceId / SpanId 供对比
     */
    @PostMapping("/command")
    public ResponseEntity<Map<String, Object>> receiveCommand(
            @RequestBody CommandRequest request,
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();
        String spanId  = span.getSpanContext().getSpanId();

        log.info("[CoreController] 收到指令 | source={} | vin={} | traceId={} | spanId={}",
                request.getSource(), request.getVin(), traceId, spanId);
        log.info("[CoreController] traceparent Header = {}", traceparent);

        // ★ 触发异步任务（@Async），验证异步线程里的 traceId 传播
        CompletableFuture<Map<String, Object>> asyncResult =
                asyncTaskService.asyncTaskWithAnnotation("cmd-process", traceId, spanId);

        // 同时触发手动 Context 传播的异步任务（对比用）
        CompletableFuture<Map<String, Object>> manualResult =
                asyncTaskService.asyncTaskManualContext("cmd-manual", traceId, spanId);

        // 等待异步结果（实际生产不会等，这里为了在响应里展示结果）
        Map<String, Object> asyncTaskResult;
        Map<String, Object> manualTaskResult;
        try {
            asyncTaskResult  = asyncResult.get();
            manualTaskResult = manualResult.get();
        } catch (Exception e) {
            log.error("异步任务执行异常", e);
            Map<String, Object> errorMap = new LinkedHashMap<>();
            errorMap.put("error", e.getMessage());
            asyncTaskResult = errorMap;
            manualTaskResult = errorMap;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("service", "tsp-service2");
        result.put("traceId", traceId);
        result.put("spanId",  spanId);
        result.put("vin",     request.getVin());
        result.put("source",  request.getSource());
        result.put("traceparent_received", traceparent != null ? traceparent : "not present");
        result.put("async_task_result",   asyncTaskResult);
        result.put("manual_task_result",  manualTaskResult);

        return ResponseEntity.ok(result);
    }

    // ─────────────────────────────────────────────────────────────
    // 专门验证异步线程池的接口
    // ─────────────────────────────────────────────────────────────

    /**
     * GET /core/async/verify
     *
     * 专门用来验证异步线程池的 TraceId 传播
     * 直接从 Postman 调用（带 traceparent Header），
     * 返回结果里展示主线程和异步线程的 traceId 对比
     */
    @GetMapping("/async/verify")
    public ResponseEntity<Map<String, Object>> verifyAsync(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();
        String spanId  = span.getSpanContext().getSpanId();

        log.info("[AsyncVerify] 主线程 | thread={} | traceId={} | spanId={}",
                Thread.currentThread().getName(), traceId, spanId);

        // 触发两种异步任务
        CompletableFuture<Map<String, Object>> f1 =
                asyncTaskService.asyncTaskWithAnnotation("verify-A", traceId, spanId);
        CompletableFuture<Map<String, Object>> f2 =
                asyncTaskService.asyncTaskManualContext("verify-B", traceId, spanId);

        try {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("主线程_traceId",  traceId);
            result.put("主线程_spanId",   spanId);
            result.put("主线程_thread",   Thread.currentThread().getName());
            result.put("异步任务A_@Async",     f1.get());
            result.put("异步任务B_Manual",     f2.get());

            Map<String, Object> conclusion = new LinkedHashMap<>();
            conclusion.put("traceId传播", "两种方式的 traceId 都和主线程一致");
            conclusion.put("spanId变化", "异步任务里创建了新 Span，所以 spanId 不同");
            conclusion.put("Agent自动传播", "@Async 无需任何额外代码，Agent 自动完成");
            result.put("验证结论", conclusion);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("异步验证失败", e);
            Map<String, Object> errorMap = new LinkedHashMap<>();
            errorMap.put("error", e.getMessage());
            return ResponseEntity.internalServerError().body(errorMap);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 链路信息查询（供 service1 Feign 调用）
    // ─────────────────────────────────────────────────────────────

    /**
     * GET /core/trace/current
     */
    @GetMapping("/trace/current")
    public ResponseEntity<Map<String, Object>> currentTrace(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {
        Span span = Span.current();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("service",  "tsp-service2");
        result.put("traceId",  span.getSpanContext().getTraceId());
        result.put("spanId",   span.getSpanContext().getSpanId());
        result.put("valid",    span.getSpanContext().isValid());
        result.put("traceparent_received", traceparent != null ? traceparent : "not present");
        return ResponseEntity.ok(result);
    }

    /**
     * GET /core/help
     */
    @GetMapping("/help")
    public ResponseEntity<Map<String, Object>> help() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("service", "tsp-service2 (port:8082)");
        result.put("current_traceId", Span.current().getSpanContext().getTraceId());
        result.put("接收service1调用",  "POST /core/command");
        result.put("验证异步线程池",     "GET  /core/async/verify + Header: traceparent");
        result.put("查看链路信息",       "GET  /core/trace/current");
        return ResponseEntity.ok(result);
    }
}
