package com.tsp.service2.service;

import io.opentelemetry.api.baggage.Baggage;
import io.opentelemetry.api.baggage.BaggageBuilder;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 带业务数据的链路追踪服务
 *
 * 核心功能：
 * 1. 演示如何在 Span 中添加业务数据（通过 Attributes）
 * 2. 演示如何使用 Baggage 传递业务上下文
 * 3. 这些数据会被 OTel Agent 采集并保存到 ClickHouse
 *
 * ══════════════════════════════════════════════════════════════
 * Baggage vs Attributes 的区别：
 *
 * Baggage：
 *   - 用于跨服务传递业务上下文
 *   - 会自动传播到子 Span 和下游服务
 *   - 适合：userId、tenantId、vin、orderId 等业务标识
 *
 * Attributes：
 *   - 附加到单个 Span 上的属性
 *   - 不会传播到下游
 *   - 适合：SQL 语句、HTTP URL、方法参数等技术细节
 * ══════════════════════════════════════════════════════════════
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TraceWithBusinessDataService {

    /**
     * ══════════════════════════════════════════════════════════════
     * 示例 1：使用 Baggage 传递业务上下文
     *
     * 适用场景：需要在整个链路中传递的业务标识
     * ══════════════════════════════════════════════════════════════
     */
    public Map<String, Object> demonstrateBaggage(String userId, String vin, String tenantId) {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();

        log.info("[Baggage] 演示开始 | traceId={} | userId={} | vin={}", traceId, userId, vin);

        // ===== 方式 1：使用 Baggage API 设置业务上下文 =====
        // Baggage 会自动传播到所有子 Span 和下游服务
        Baggage currentBaggage = Baggage.current();

        // 创建新的 Baggage（包含业务数据）
        BaggageBuilder baggageBuilder = currentBaggage.toBuilder();

        // 设置业务数据
        baggageBuilder.put("userId", userId);
        baggageBuilder.put("vin", vin);
        baggageBuilder.put("tenantId", tenantId);
        baggageBuilder.put("platform", "web");
        baggageBuilder.put("userType", "premium");  // 可添加任意业务字段

        // 构建 Baggage 并保存到 Context
        Baggage updatedBaggage = baggageBuilder.build();
        Context contextWithBaggage = Context.current().with(updatedBaggage);

        // 在新 Context 中创建子 Span
        var childSpan = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("business.process.with.baggage")
                .setSpanKind(SpanKind.INTERNAL)
                .setParent(contextWithBaggage)  // 设置包含 Baggage 的 Context
                .startSpan();

        try (Scope scope = childSpan.makeCurrent()) {
            // 在这个 Scope 中，Baggage 已自动生效
            Baggage baggageInChild = Baggage.current();
            String retrievedUserId = baggageInChild.getEntryValue("userId");
            String retrievedVin = baggageInChild.getEntryValue("vin");

            log.info("[Baggage] 子 Span 读取业务数据 | userId={} | vin={}", retrievedUserId, retrievedVin);

            // 模拟业务处理
            processBusinessLogic(userId, vin);

            childSpan.setStatus(StatusCode.OK);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("traceId", traceId);
            result.put("说明", "Baggage 数据会自动传播到所有子 Span 和下游服务");

            Map<String, Object> businessData = new LinkedHashMap<>();
            businessData.put("userId", userId);
            businessData.put("vin", vin);
            businessData.put("tenantId", tenantId);
            businessData.put("platform", "web");
            businessData.put("userType", "premium");
            result.put("businessData", businessData);

            result.put("✅ ClickHouse 保存字段",
                    "baggage_user_id, baggage_vin, baggage_tenant_id, baggage_platform, baggage_all");
            return result;

        } finally {
            childSpan.end();
        }
    }

    /**
     * ══════════════════════════════════════════════════════════════
     * 示例 2：使用 Attributes 附加业务数据
     *
     * 适用场景：不需要传播的 Span 级别业务数据
     * ══════════════════════════════════════════════════════════════
     */
    public Map<String, Object> demonstrateAttributes(
            String orderId,
            String productId,
            Double amount,
            String[] tags) {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();

        log.info("[Attributes] 演示开始 | traceId={} | orderId={}", traceId, orderId);

        var businessSpan = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("business.order.process")
                .setSpanKind(SpanKind.INTERNAL)
                .startSpan();

        try (Scope scope = businessSpan.makeCurrent()) {
            // ===== 通过 Span Attributes 添加业务数据 =====
            // 这些数据只会附加到当前 Span，不会传播到下游

            // 订单信息
            businessSpan.setAttribute("business.order.id", orderId);
            businessSpan.setAttribute("business.product.id", productId);
            businessSpan.setAttribute("business.amount", amount);
            businessSpan.setAttribute("business.currency", "CNY");

            // 业务标签
            for (String tag : tags) {
                businessSpan.setAttribute("business.tag", tag);
            }

            // 订单状态
            businessSpan.setAttribute("business.order.status", "PROCESSING");
            businessSpan.setAttribute("business.order.type", "E-COMMERCE");

            // 其他业务维度
            businessSpan.setAttribute("business.payment.method", "ALIPAY");
            businessSpan.setAttribute("business.shipping.region", "华东");

            log.info("[Attributes] 业务数据已附加到 Span | orderId={} | amount={}", orderId, amount);

            // 模拟订单处理
            Thread.sleep(50);

            businessSpan.setStatus(StatusCode.OK);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("traceId", traceId);
            result.put("说明", "Attributes 附加到当前 Span，不会传播，但会保存到 ClickHouse");

            // 创建业务数据 Map
            Map<String, Object> businessData = new LinkedHashMap<>();
            businessData.put("orderId", orderId);
            businessData.put("productId", productId);
            businessData.put("amount", amount);
            businessData.put("tags", Arrays.asList(tags));
            result.put("businessData", businessData);

            result.put("✅ ClickHouse 保存字段",
                    "business_order_id, business_product_id, business_amount, business_tags");
            return result;

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            businessSpan.setStatus(StatusCode.ERROR, e.getMessage());
            throw new RuntimeException(e);
        } finally {
            businessSpan.end();
        }
    }

    /**
     * ══════════════════════════════════════════════════════════════
     * 示例 3：Baggage + Attributes 混合使用
     *
     * 最佳实践：
     *   - Baggage：传递需要下游知道的业务标识（userId, tenantId）
     *   - Attributes：记录当前 Span 的详细业务数据（orderId, amount）
     * ══════════════════════════════════════════════════════════════
     */
    public Map<String, Object> demonstrateMixed(String userId, String orderId, Double amount) {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();

        log.info("[Mixed] 演示开始 | traceId={} | userId={} | orderId={}", traceId, userId, orderId);

        // 1. 设置 Baggage（会传播到下游）
        Baggage baggage = Baggage.current().toBuilder()
                .put("userId", userId)
                .put("orderId", orderId)  // 订单 ID 也需要传播（下游服务可能需要）
                .put("tenantId", "tenant-001")
                .build();

        Context contextWithBaggage = Context.current().with(baggage);

        var childSpan = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("business.mixed.example")
                .setParent(contextWithBaggage)
                .setSpanKind(SpanKind.INTERNAL)
                .startSpan();

        try (Scope scope = childSpan.makeCurrent()) {
            // 2. 设置 Attributes（只记录到当前 Span）
            childSpan.setAttribute("business.order.id", orderId);
            childSpan.setAttribute("business.amount", amount);
            childSpan.setAttribute("business.currency", "CNY");
            childSpan.setAttribute("business.payment.channel", "WECHAT_PAY");

            // 3. 模拟调用下游服务
            callDownstreamService();

            childSpan.setStatus(StatusCode.OK);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("traceId", traceId);

            Map<String, Object> bestPractice = new LinkedHashMap<>();
            bestPractice.put("Baggage（传播）", Arrays.asList("userId", "orderId", "tenantId"));
            bestPractice.put("Attributes（不传播）", Arrays.asList("amount", "currency", "payment.channel"));
            result.put("最佳实践", bestPractice);

            result.put("✅ ClickHouse 保存",
                    "Baggage 保存到 baggage_* 字段，Attributes 保存到 business_* 字段");
            return result;

        } catch (Exception e) {
            childSpan.setStatus(StatusCode.ERROR, e.getMessage());
            throw new RuntimeException(e);
        } finally {
            childSpan.end();
        }
    }

    /**
     * ══════════════════════════════════════════════════════════════
     * 示例 4：从 HTTP Header 中提取 Baggage（实际场景）
     *
     * 前端调用时在 HTTP Header 中传递 baggage：
     *   baggage: userId=123,vin=TEST001,tenantId=tenant-abc
     *
     * OTel Agent 会自动提取并传播，无需手动处理
     * ══════════════════════════════════════════════════════════════
     */
    public Map<String, Object> demonstrateReadBaggageFromHeader() {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();

        // 直接读取当前 Context 中的 Baggage
        // （如果前端传递了 baggage header，Agent 已自动提取）
        Baggage baggage = Baggage.current();

        var childSpan = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                .spanBuilder("business.read.baggage")
                .setSpanKind(SpanKind.INTERNAL)
                .startSpan();

        try (Scope scope = childSpan.makeCurrent()) {
            // 提取 Baggage 中的业务数据
            // Baggage API: getEntryValue(String key) 直接返回值，如果不存在返回 null
            String userId = baggage.getEntryValue("userId") != null
                    ? baggage.getEntryValue("userId")
                    : "未设置";
            String vin = baggage.getEntryValue("vin") != null
                    ? baggage.getEntryValue("vin")
                    : "未设置";
            String tenantId = baggage.getEntryValue("tenantId") != null
                    ? baggage.getEntryValue("tenantId")
                    : "未设置";

            log.info("[Baggage] 从 Header 提取业务数据 | userId={} | vin={} | tenantId={}",
                    userId, vin, tenantId);

            // 将 Baggage 转为 Map（便于保存到 Span Attributes）
            Map<String, String> baggageMap = new java.util.HashMap<>();
            baggage.forEach((key, baggageEntry) -> baggageMap.put(key, baggageEntry.getValue()));

            childSpan.setAttribute("business.baggage.extracted", true);
            childSpan.setAttribute("business.baggage.size", baggageMap.size());

            childSpan.setStatus(StatusCode.OK);

            Map<String, Object> result = new java.util.LinkedHashMap<>();
            result.put("traceId", traceId);
            result.put("说明", "OTel Agent 自动从 HTTP Header 提取 baggage，无需手动处理");
            result.put("extractedBaggage", baggageMap);
            result.put("✅ 使用方式",
                    "前端调用时设置 Header: baggage: userId=123,vin=TEST001");

            return result;

        } finally {
            childSpan.end();
        }
    }

    /**
     * ══════════════════════════════════════════════════════════════
     * 示例 5：在异步线程中传递业务数据
     *
     * 验证 Baggage 在线程池中的传播
     * ══════════════════════════════════════════════════════════════
     */
    public Map<String, Object> demonstrateBaggageInThreadPool() {

        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();

        // 在主线程设置 Baggage
        Baggage parentBaggage = Baggage.current().toBuilder()
                .put("userId", "user-async-001")
                .put("vin", "VIN-ASYNC-TEST")
                .put("taskId", "task-" + System.currentTimeMillis())
                .build();

        Context contextWithBaggage = Context.current().with(parentBaggage);

        log.info("[Async-Baggage] 主线程设置 Baggage | traceId={}", traceId);

        var executor = java.util.concurrent.Executors.newFixedThreadPool(2,
                r -> new Thread(r, "business-async-pool-" + System.nanoTime()));

        try {
            var future = java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                // 在子线程中读取 Baggage
                var asyncSpan = io.opentelemetry.api.GlobalOpenTelemetry.getTracer("tsp-service2")
                        .spanBuilder("business.async.task")
                        .setParent(contextWithBaggage)
                        .setSpanKind(SpanKind.INTERNAL)
                        .startSpan();

                try (io.opentelemetry.context.Scope scope = asyncSpan.makeCurrent()) {
                    Baggage asyncBaggage = Baggage.current();

                    Map<String, String> baggageData = new java.util.HashMap<>();
                    asyncBaggage.forEach((k, v) -> baggageData.put(k, v.getValue()));

                    log.info("[Async-Baggage] 子线程读取 Baggage | data={}", baggageData);

                    asyncSpan.setAttribute("business.async.thread", Thread.currentThread().getName());
                    asyncSpan.setStatus(StatusCode.OK);

                    return baggageData;

                } finally {
                    asyncSpan.end();
                }
            }, executor);

            Map<String, String> asyncBaggageData = future.get();

            Map<String, Object> result = new java.util.LinkedHashMap<>();
            result.put("traceId", traceId);
            result.put("说明", "Baggage 随 Context 自动传播到异步线程池");

            Map<String, Object> expectedBaggage = new LinkedHashMap<>();
            expectedBaggage.put("userId", "user-async-001");
            expectedBaggage.put("vin", "VIN-ASYNC-TEST");
            result.put("parent_baggage", expectedBaggage);

            result.put("async_baggage", asyncBaggageData);
            result.put("✅ 验证", "async_baggage 应该等于 parent_baggage");

            return result;

        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            executor.shutdown();
        }
    }

    // ===== 私有辅助方法 =====

    private void processBusinessLogic(String userId, String vin) {
        // 模拟业务处理
        log.info("[Business] 处理业务逻辑 | userId={} | vin={}", userId, vin);

        // 这里可以调用其他服务、操作数据库、Redis、Kafka 等
        // Baggage 会自动传播到所有子操作
    }

    private void callDownstreamService() {
        // 模拟调用下游服务
        // Baggage 会自动通过 HTTP Header 传播到下游
        log.info("[Business] 调用下游服务 | Baggage 已自动传播");
    }
}
