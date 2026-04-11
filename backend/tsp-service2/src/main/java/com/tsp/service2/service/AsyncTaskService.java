package com.tsp.service2.service;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * 异步任务服务 —— 验证线程池中的 TraceId / SpanId 传播
 *
 * ══════════════════════════════════════════════════════════════
 * 核心知识点：
 *
 * ① OTel Agent 自动传播（无需任何代码改动）
 *    Agent 在 submit/execute 时把 Context 包装进任务，
 *    异步线程执行时自动恢复，所以 traceId 完全一致。
 *
 * ② SpanId 的变化：
 *    - 父线程 SpanId：HTTP 请求产生的 Span（如 POST /core/command）
 *    - 异步线程 SpanId：如果在异步方法里创建了新 Span，则是新的 SpanId
 *    - 如果异步方法里没有创建新 Span，则 Span.current() 仍是父 Span
 *
 * ③ 日志里的 traceId / spanId：
 *    - traceId 全程一致（TraceId 不变）
 *    - spanId 随 Span 边界变化（每个 Span 有自己的 SpanId）
 * ══════════════════════════════════════════════════════════════
 */
@Slf4j
@Service
public class AsyncTaskService {

    /**
     * 场景 A：@Async 注解方式
     * OTel Agent 自动传播 Context，无需任何改动
     *
     * 观察：日志里 traceId 和调用方（HTTP 线程）完全一致
     */
    @Async("taskExecutor")
    public CompletableFuture<Map<String, Object>> asyncTaskWithAnnotation(
            String taskName, String parentTraceId, String parentSpanId) {

        // ★ 这里是新线程（tsp-async-x），但 traceId 和父线程一致
        Span currentSpan = Span.current();
        String asyncTraceId = currentSpan.getSpanContext().getTraceId();
        String asyncSpanId  = currentSpan.getSpanContext().getSpanId();

        log.info("[AsyncTask-@Async] 任务开始 | thread={} | traceId={} | spanId={}",
                Thread.currentThread().getName(), asyncTraceId, asyncSpanId);

        // 在异步线程里创建子 Span
        var span = GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("async.task." + taskName)
                .setSpanKind(SpanKind.INTERNAL)
                .setAttribute("task.name", taskName)
                .setAttribute("async.type", "@Async")
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            // 模拟异步处理耗时
            Thread.sleep(100);

            String newSpanId = span.getSpanContext().getSpanId();

            log.info("[AsyncTask-@Async] 任务处理中 | thread={} | traceId={} | 子SpanId={}",
                    Thread.currentThread().getName(), asyncTraceId, newSpanId);

            Map<String, Object> result = new java.util.LinkedHashMap<>();
            result.put("asyncType",         "@Async 注解");
            result.put("thread",            Thread.currentThread().getName());
            result.put("traceId",           asyncTraceId);
            result.put("spanId_in_async",   newSpanId);
            result.put("parent_traceId",    parentTraceId);
            result.put("parent_spanId",     parentSpanId);
            result.put("traceId_match",     asyncTraceId.equals(parentTraceId));
            result.put("spanId_different",  !newSpanId.equals(parentSpanId));
            result.put("结论", asyncTraceId.equals(parentTraceId)
                    ? "✅ traceId 一致，链路传播成功"
                    : "❌ traceId 不一致，传播失败");

            span.setStatus(StatusCode.OK);
            return CompletableFuture.completedFuture(result);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            span.setStatus(StatusCode.ERROR, e.getMessage());
            throw new RuntimeException(e);
        } finally {
            span.end();
            log.info("[AsyncTask-@Async] 任务结束 | thread={} | traceId={}",
                    Thread.currentThread().getName(), asyncTraceId);
        }
    }

    /**
     * 场景 B：手动 CompletableFuture + Context.makeCurrent()
     * 演示如果不用 Agent 的自动传播，手动传播应该怎么写
     *
     * 用途：帮助理解 OTel Context 传播的底层原理
     */
    public CompletableFuture<Map<String, Object>> asyncTaskManualContext(
            String taskName, String parentTraceId, String parentSpanId) {

        // ★ 在提交任务前，先捕获当前 Context
        Context capturedContext = Context.current();

        log.info("[AsyncTask-Manual] 提交任务 | thread={} | traceId={}",
                Thread.currentThread().getName(),
                Span.current().getSpanContext().getTraceId());

        return CompletableFuture.supplyAsync(() -> {
            // ★ 在新线程里手动恢复 Context
            try (Scope scope = capturedContext.makeCurrent()) {
                Span currentSpan = Span.current();
                String asyncTraceId = currentSpan.getSpanContext().getTraceId();
                String asyncSpanId  = currentSpan.getSpanContext().getSpanId();

                log.info("[AsyncTask-Manual] 任务执行 | thread={} | traceId={} | spanId={}",
                        Thread.currentThread().getName(), asyncTraceId, asyncSpanId);

                // 创建子 Span
                var span = GlobalOpenTelemetry.getTracer("tsp-service2")
                        .spanBuilder("async.manual." + taskName)
                        .setAttribute("task.name", taskName)
                        .setAttribute("async.type", "Manual-Context")
                        .startSpan();

                try (Scope innerScope = span.makeCurrent()) {
                    Thread.sleep(80);
                    String newSpanId = span.getSpanContext().getSpanId();

                    Map<String, Object> result = new java.util.LinkedHashMap<>();
                    result.put("asyncType",        "手动 Context 传播");
                    result.put("thread",           Thread.currentThread().getName());
                    result.put("traceId",          asyncTraceId);
                    result.put("spanId_in_async",  newSpanId);
                    result.put("parent_traceId",   parentTraceId);
                    result.put("parent_spanId",    parentSpanId);
                    result.put("traceId_match",    asyncTraceId.equals(parentTraceId));
                    result.put("spanId_different", !newSpanId.equals(parentSpanId));
                    result.put("结论", "手动 Context.makeCurrent() 同样实现了 traceId 传播");
                    span.setStatus(StatusCode.OK);
                    return result;

                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    span.setStatus(StatusCode.ERROR, e.getMessage());
                    throw new RuntimeException(e);
                } finally {
                    span.end();
                }
            }
        });
    }
}
