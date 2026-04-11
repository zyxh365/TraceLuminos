package com.tsp.service2.controller;

import com.tsp.service2.service.RedisService;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Scope;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 组件追踪验证接口
 *
 * 用于验证 Redis、MySQL、线程池等组件的链路追踪是否正常工作
 */
@Slf4j
@RestController
@RequestMapping("/verify")
@RequiredArgsConstructor
public class ComponentTraceVerifyController {

    private final RedisService redisService;
    private final DataSource dataSource;

    /**
     * 验证 Redis 追踪
     *
     * 测试命令：
     * curl -H "traceparent: 00-test00112233445566778899001122-aaaaaaaaaa-01" \
     *   http://localhost:8092/verify/redis
     *
     * 期望在 Jaeger 中看到：
     * - tsp-service2 : GET /verify/redis (SERVER)
     *   └── tsp-service2 : redis SET (CLIENT)
     *   └── tsp-service2 : redis GET (CLIENT)
     */
    @GetMapping("/redis")
    public Map<String, Object> verifyRedis(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        Span currentSpan = Span.current();
        String traceId = currentSpan.getSpanContext().getTraceId();

        log.info("[Verify-Redis] 开始验证 Redis 追踪 | traceId={}", traceId);

        // 创建验证 Span
        var span = GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("verify.redis.operations")
                .setSpanKind(SpanKind.INTERNAL)
                .setAttribute("verify.type", "redis")
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            // 触发 Redis 操作
            redisService.markProcessed(traceId, "verify-redis-test");
            String result = redisService.getProcessedStatus(traceId);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("traceId", traceId);
            response.put("component", "Redis");
            response.put("operations", "SET + GET");
            response.put("key", "tsp:processed:" + traceId);
            response.put("result", result);
            response.put("✅ Jaeger 验证",
                    "在 Jaeger 搜索此 traceId，应看到 'redis SET' 和 'redis GET' 两个子 Span");

            span.setStatus(StatusCode.OK);
            return response;

        } catch (Exception e) {
            span.setStatus(StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            span.end();
        }
    }

    /**
     * 验证 MySQL 追踪
     *
     * 测试命令：
     * curl -H "traceparent: 00-test00112233445566778899001122-bbbbbbbbbbb-01" \
     *   http://localhost:8092/verify/mysql
     *
     * 期望在 Jaeger 中看到：
     * - tsp-service2 : GET /verify/mysql (SERVER)
     *   └── tsp-service2 : SELECT (CLIENT)
     *     └── db.statement: SELECT 1
     */
    @GetMapping("/mysql")
    public Map<String, Object> verifyMySQL(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        Span currentSpan = Span.current();
        String traceId = currentSpan.getSpanContext().getTraceId();

        log.info("[Verify-MySQL] 开始验证 MySQL 追踪 | traceId={}", traceId);

        var span = GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("verify.mysql.operations")
                .setSpanKind(SpanKind.INTERNAL)
                .setAttribute("verify.type", "mysql")
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            // 执行简单的 SQL 查询
            try (Connection conn = dataSource.getConnection();
                 Statement stmt = conn.createStatement()) {

                // 这个查询会被 Agent 自动捕获
                var rs = stmt.executeQuery("SELECT 1 as test_column, NOW() as current_time");
                rs.next();
                String result = rs.getString("current_time");

                Map<String, Object> response = new LinkedHashMap<>();
                response.put("traceId", traceId);
                response.put("component", "MySQL");
                response.put("operation", "SELECT");
                response.put("db.system", "mysql");
                response.put("result", result);
                response.put("✅ Jaeger 验证",
                        "在 Jaeger 搜索此 traceId，应看到 'SELECT' Span 和 db.statement 属性");

                span.setStatus(StatusCode.OK);
                return response;

            } catch (Exception e) {
                span.setStatus(StatusCode.ERROR, e.getMessage());
                throw new RuntimeException("MySQL 查询失败: " + e.getMessage(), e);
            }

        } finally {
            span.end();
        }
    }

    /**
     * 验证线程池追踪
     *
     * 测试命令：
     * curl -H "traceparent: 00-test00112233445566778899001122-cccccccccc-01" \
     *   http://localhost:8092/verify/threadpool
     *
     * 期望在 Jaeger 中看到：
     * - tsp-service2 : GET /verify/threadpool (SERVER)
     *   └── tsp-service2 : async.threadpool.verify (INTERNAL)
     *     └── thread.pool: verify-executor
     */
    @GetMapping("/threadpool")
    public Map<String, Object> verifyThreadPool(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        Span currentSpan = Span.current();
        String traceId = currentSpan.getSpanContext().getTraceId();

        log.info("[Verify-ThreadPool] 开始验证线程池追踪 | traceId={}", traceId);

        var span = GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("verify.threadpool.operations")
                .setSpanKind(SpanKind.INTERNAL)
                .setAttribute("verify.type", "threadpool")
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            // 使用 CompletableFuture 模拟线程池任务
            var executor = java.util.concurrent.Executors.newFixedThreadPool(2,
                    r -> new Thread(r, "verify-pool-" + System.nanoTime()));

            var future = java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                // 在新线程中创建子 Span
                var asyncSpan = GlobalOpenTelemetry.getTracer("tsp-service2")
                        .spanBuilder("async.threadpool.verify")
                        .setSpanKind(SpanKind.INTERNAL)
                        .setAttribute("thread.pool", "verify-executor")
                        .setAttribute("async.type", "CompletableFuture")
                        .startSpan();

                try (Scope asyncScope = asyncSpan.makeCurrent()) {
                    try {
                        Thread.sleep(100);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        asyncSpan.setStatus(StatusCode.ERROR, "Interrupted");
                        throw new RuntimeException(e);
                    }

                    String asyncTraceId = Span.current().getSpanContext().getTraceId();

                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("thread", Thread.currentThread().getName());
                    result.put("traceId", asyncTraceId);
                    result.put("traceId一致", asyncTraceId.equals(traceId));
                    result.put("✅ Jaeger 验证",
                            "在 Jaeger 搜索此 traceId，应看到 'async.threadpool.verify' Span");

                    asyncSpan.setStatus(StatusCode.OK);
                    return result;

                } finally {
                    asyncSpan.end();
                }
            }, executor);

            Map<String, Object> response = future.get();
            response.put("parent_traceId", traceId);

            executor.shutdown();
            span.setStatus(StatusCode.OK);

            return response;

        } catch (Exception e) {
            span.setStatus(StatusCode.ERROR, e.getMessage());
            throw new RuntimeException("线程池验证失败: " + e.getMessage(), e);
        } finally {
            span.end();
        }
    }

    /**
     * 一键验证所有组件
     *
     * 测试命令：
     * curl -H "traceparent: 00-test00112233445566778899001122-dddddddddd-01" \
     *   http://localhost:8092/verify/all
     */
    @GetMapping("/all")
    public Map<String, Object> verifyAll(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {

        Span currentSpan = Span.current();
        String traceId = currentSpan.getSpanContext().getTraceId();

        log.info("[Verify-All] 开始验证所有组件 | traceId={}", traceId);

        var span = GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("verify.all.components")
                .setSpanKind(SpanKind.INTERNAL)
                .setAttribute("verify.type", "all")
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("traceId", traceId);
            response.put("说明", "此 traceId 应包含所有组件的 Span");
            response.put("✅ Redis", verifyRedis(traceparent));
            response.put("✅ MySQL", verifyMySQL(traceparent));
            response.put("✅ ThreadPool", verifyThreadPool(traceparent));

            span.setStatus(StatusCode.OK);
            return response;

        } catch (Exception e) {
            span.setStatus(StatusCode.ERROR, e.getMessage());
            throw new RuntimeException("验证失败: " + e.getMessage(), e);
        } finally {
            span.end();
        }
    }
}
