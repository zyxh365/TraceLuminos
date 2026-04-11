package com.tsp.service2.service;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 自定义线程池 TraceContext 传播示例
 *
 * ══════════════════════════════════════════════════════════════
 * 验证场景：
 *
 * ① ThreadPoolExecutor + Agent 自动传播（推荐）
 * ② ThreadPoolExecutor + 手动 Context 传播（兜底方案）
 * ③ CompletableFuture + Context 包装
 * ④ 自定义 Runnable 包装 Context
 * ══════════════════════════════════════════════════════════════
 */
@Slf4j
@Service
public class CustomThreadPoolTraceService {

    /**
     * 场景①：直接使用 ThreadPoolExecutor（OTel Agent 自动传播）
     *
     * 原理：Agent 在 execute() 时自动包装 Runnable，保留 Context
     * 无需任何手动代码，traceId 会自动传播到子线程
     */
    private final ExecutorService autoPropagatedExecutor = new ThreadPoolExecutor(
            2, 4,
            60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(100),
            new ThreadFactory() {
                private final AtomicInteger counter = new AtomicInteger(1);
                @Override
                public Thread newThread(Runnable r) {
                    return new Thread(r, "custom-pool-auto-" + counter.getAndIncrement());
                }
            },
            new ThreadPoolExecutor.CallerRunsPolicy()
    );

    /**
     * 场景②④：手动传播 Context 的线程池（兜底方案）
     *
     * 用途：如果 Agent 没有自动覆盖你的执行器，手动包装 Runnable
     */
    private final ExecutorService manualPropagatedExecutor = new ThreadPoolExecutor(
            2, 4,
            60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(100),
            r -> new Thread(r, "custom-pool-manual-" + System.nanoTime()),
            new ThreadPoolExecutor.AbortPolicy()
    );

    /**
     * ══════════════════════════════════════════════════════════════
     * 场景①：Agent 自动传播（无需任何代码，推荐）
     * ══════════════════════════════════════════════════════════════
     */
    public Map<String, Object> executeWithAutoPropagation() {
        Span parentSpan = Span.current();
        String parentTraceId = parentSpan.getSpanContext().getTraceId();
        String parentSpanId = parentSpan.getSpanContext().getSpanId();

        log.info("[Auto-Propagate] 主线程提交任务 | thread={} | traceId={}",
                Thread.currentThread().getName(), parentTraceId);

        Future<Map<String, Object>> future = autoPropagatedExecutor.submit(() -> {
            // ★ 这里是新线程，但 traceId 和父线程完全一致（Agent 自动传播）
            Span asyncSpan = Span.current();
            String asyncTraceId = asyncSpan.getSpanContext().getTraceId();

            // 创建子 Span
            var span = GlobalOpenTelemetry.getTracer("tsp-service2")
                    .spanBuilder("custom-pool.auto-task")
                    .setSpanKind(SpanKind.INTERNAL)
                    .setAttribute("thread.pool", "auto-propagated")
                    .startSpan();

            try (Scope scope = span.makeCurrent()) {
                Thread.sleep(50);

                String newSpanId = span.getSpanContext().getSpanId();

                log.info("[Auto-Propagate] 子线程执行 | thread={} | traceId={} | spanId={}",
                        Thread.currentThread().getName(), asyncTraceId, newSpanId);

                Map<String, Object> result = new ConcurrentHashMap<>();
                result.put("场景", "Agent 自动传播");
                result.put("主线程", Thread.currentThread().getName());
                result.put("parent_traceId", parentTraceId);
                result.put("parent_spanId", parentSpanId);
                result.put("async_traceId", asyncTraceId);
                result.put("async_spanId", newSpanId);
                result.put("traceId一致", asyncTraceId.equals(parentTraceId));
                result.put("结论", "✅ Agent 自动传播，无需任何代码");

                span.setStatus(StatusCode.OK);
                return result;

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                span.setStatus(StatusCode.ERROR, e.getMessage());
                throw new RuntimeException(e);
            } finally {
                span.end();
            }
        });

        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new RuntimeException("任务执行失败", e);
        }
    }

    /**
     * ══════════════════════════════════════════════════════════════
     * 场景②：手动 Context 传播（兜底方案）
     * ══════════════════════════════════════════════════════════════
     */
    public Map<String, Object> executeWithManualPropagation() {
        Span parentSpan = Span.current();
        String parentTraceId = parentSpan.getSpanContext().getTraceId();
        String parentSpanId = parentSpan.getSpanContext().getSpanId();

        // ★ 关键：在提交任务前，捕获当前 Context
        Context capturedContext = Context.current();

        log.info("[Manual-Propagate] 主线程提交任务 | thread={} | traceId={}",
                Thread.currentThread().getName(), parentTraceId);

        Future<Map<String, Object>> future = manualPropagatedExecutor.submit(() -> {
            // ★ 关键：在新线程里手动恢复 Context
            try (Scope scope = capturedContext.makeCurrent()) {
                Span asyncSpan = Span.current();
                String asyncTraceId = asyncSpan.getSpanContext().getTraceId();

                // 创建子 Span
                var span = GlobalOpenTelemetry.getTracer("tsp-service2")
                        .spanBuilder("custom-pool.manual-task")
                        .setSpanKind(SpanKind.INTERNAL)
                        .setAttribute("thread.pool", "manual-propagated")
                        .startSpan();

                try (Scope innerScope = span.makeCurrent()) {
                    Thread.sleep(50);

                    String newSpanId = span.getSpanContext().getSpanId();

                    log.info("[Manual-Propagate] 子线程执行 | thread={} | traceId={} | spanId={}",
                            Thread.currentThread().getName(), asyncTraceId, newSpanId);

                    Map<String, Object> result = new ConcurrentHashMap<>();
                    result.put("场景", "手动 Context 传播");
                    result.put("主线程", Thread.currentThread().getName());
                    result.put("parent_traceId", parentTraceId);
                    result.put("parent_spanId", parentSpanId);
                    result.put("async_traceId", asyncTraceId);
                    result.put("async_spanId", newSpanId);
                    result.put("traceId一致", asyncTraceId.equals(parentTraceId));
                    result.put("结论", "✅ 手动 Context.makeCurrent() 传播成功");

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

        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new RuntimeException("任务执行失败", e);
        }
    }

    /**
     * ══════════════════════════════════════════════════════════════
     * 场景③：CompletableFuture + Agent 自动传播
     * ══════════════════════════════════════════════════════════════
     */
    public CompletableFuture<Map<String, Object>> executeWithCompletableFuture() {
        Span parentSpan = Span.current();
        String parentTraceId = parentSpan.getSpanContext().getTraceId();
        String parentSpanId = parentSpan.getSpanContext().getSpanId();

        log.info("[CompletableFuture] 主线程提交任务 | thread={} | traceId={}",
                Thread.currentThread().getName(), parentTraceId);

        // Agent 会自动传播 Context 到 CompletableFuture
        return CompletableFuture.supplyAsync(() -> {
            Span asyncSpan = Span.current();
            String asyncTraceId = asyncSpan.getSpanContext().getTraceId();

            var span = GlobalOpenTelemetry.getTracer("tsp-service2")
                    .spanBuilder("custom-pool.completable-future")
                    .setSpanKind(SpanKind.INTERNAL)
                    .startSpan();

            try (Scope scope = span.makeCurrent()) {
                Thread.sleep(50);

                String newSpanId = span.getSpanContext().getSpanId();

                log.info("[CompletableFuture] 子线程执行 | thread={} | traceId={} | spanId={}",
                        Thread.currentThread().getName(), asyncTraceId, newSpanId);

                Map<String, Object> result = new ConcurrentHashMap<>();
                result.put("场景", "CompletableFuture 自动传播");
                result.put("主线程", Thread.currentThread().getName());
                result.put("parent_traceId", parentTraceId);
                result.put("parent_spanId", parentSpanId);
                result.put("async_traceId", asyncTraceId);
                result.put("async_spanId", newSpanId);
                result.put("traceId一致", asyncTraceId.equals(parentTraceId));
                result.put("结论", "✅ CompletableFuture 自动传播");

                span.setStatus(StatusCode.OK);
                return result;

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                span.setStatus(StatusCode.ERROR, e.getMessage());
                throw new RuntimeException(e);
            } finally {
                span.end();
            }
        }, autoPropagatedExecutor); // 使用自定义线程池
    }

    /**
     * ══════════════════════════════════════════════════════════════
     * 场景④：自定义 Callable 包装 Context（最底层的方式）
     * ══════════════════════════════════════════════════════════════
     */
    public Map<String, Object> executeWithWrappedCallable() {
        Span parentSpan = Span.current();
        String parentTraceId = parentSpan.getSpanContext().getTraceId();
        String parentSpanId = parentSpan.getSpanContext().getSpanId();

        log.info("[Wrapped-Callable] 主线程提交任务 | thread={} | traceId={}",
                Thread.currentThread().getName(), parentTraceId);

        // 创建一个包装了 Context 的 Callable
        Context capturedContext = Context.current();
        Callable<Map<String, Object>> wrappedTask = contextWrappedCallable(() -> {
            Span asyncSpan = Span.current();
            String asyncTraceId = asyncSpan.getSpanContext().getTraceId();

            var span = GlobalOpenTelemetry.getTracer("tsp-service2")
                    .spanBuilder("custom-pool.wrapped-callable")
                    .setSpanKind(SpanKind.INTERNAL)
                    .startSpan();

            try (Scope scope = span.makeCurrent()) {
                Thread.sleep(50);

                String newSpanId = span.getSpanContext().getSpanId();

                log.info("[Wrapped-Callable] 子线程执行 | thread={} | traceId={} | spanId={}",
                        Thread.currentThread().getName(), asyncTraceId, newSpanId);

                Map<String, Object> result = new ConcurrentHashMap<>();
                result.put("场景", "自定义 Callable 包装");
                result.put("主线程", Thread.currentThread().getName());
                result.put("parent_traceId", parentTraceId);
                result.put("parent_spanId", parentSpanId);
                result.put("async_traceId", asyncTraceId);
                result.put("async_spanId", newSpanId);
                result.put("traceId一致", asyncTraceId.equals(parentTraceId));
                result.put("结论", "✅ 包装 Callable 传播成功");

                span.setStatus(StatusCode.OK);
                return result;

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                span.setStatus(StatusCode.ERROR, e.getMessage());
                throw new RuntimeException(e);
            } finally {
                span.end();
            }
        }, capturedContext);

        try {
            return manualPropagatedExecutor.submit(wrappedTask).get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new RuntimeException("任务执行失败", e);
        }
    }

    /**
     * ══════════════════════════════════════════════════════════════
     * 工具方法：包装 Callable 以传播 Context
     * ══════════════════════════════════════════════════════════════
     */
    private <T> Callable<T> contextWrappedCallable(Callable<T> delegate, Context context) {
        return () -> {
            try (Scope scope = context.makeCurrent()) {
                return delegate.call();
            }
        };
    }

    /**
     * ══════════════════════════════════════════════════════════════
     * 验证 Baggage 传播
     * ══════════════════════════════════════════════════════════════
     */
    public Map<String, Object> verifyBaggagePropagation() {
        Span parentSpan = Span.current();
        String parentTraceId = parentSpan.getSpanContext().getTraceId();

        // 获取当前 Baggage
        var baggage = io.opentelemetry.api.baggage.Baggage.current();

        log.info("[Baggage] 主线程 | traceId={} | baggage={}", parentTraceId, baggage);

        Future<Map<String, Object>> future = autoPropagatedExecutor.submit(() -> {
            // Baggage 也会自动传播
            var asyncBaggage = io.opentelemetry.api.baggage.Baggage.current();
            String asyncTraceId = Span.current().getSpanContext().getTraceId();

            log.info("[Baggage] 子线程 | traceId={} | baggage={}", asyncTraceId, asyncBaggage);

            Map<String, Object> result = new ConcurrentHashMap<>();
            result.put("parent_traceId", parentTraceId);
            result.put("async_traceId", asyncTraceId);
            result.put("traceId一致", asyncTraceId.equals(parentTraceId));

            // 提取 Baggage 中的值
            Map<String, String> baggageData = new ConcurrentHashMap<>();
            asyncBaggage.forEach((key, value) -> baggageData.put(key, value.getValue()));
            result.put("baggage", baggageData);
            result.put("结论", "✅ Baggage 随 Context 一起传播");

            return result;
        });

        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new RuntimeException("任务执行失败", e);
        }
    }

    /**
     * 关闭线程池（应用关闭时调用）
     */
    public void shutdown() {
        log.info("关闭自定义线程池...");
        autoPropagatedExecutor.shutdown();
        manualPropagatedExecutor.shutdown();
    }
}
