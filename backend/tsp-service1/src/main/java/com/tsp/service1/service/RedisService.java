package com.tsp.service1.service;

import io.opentelemetry.api.trace.Span;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Redis 操作服务
 *
 * ★ OTel Agent 自动插桩 Lettuce（Redis 客户端底层）：
 *   每次 get/set 操作自动生成 Span，无需任何代码改动
 *   Span 名称格式：redis SET / redis GET / redis DEL
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RedisService {

    private final StringRedisTemplate redisTemplate;

    private static final String VIN_CACHE_PREFIX   = "tsp:vin:";
    private static final String STATUS_CACHE_PREFIX = "tsp:status:";
    private static final Duration CACHE_TTL         = Duration.ofMinutes(10);

    /**
     * 缓存 VIN 信息（模拟车辆状态缓存）
     * ★ Agent 自动生成 redis SET Span
     */
    public void cacheVinInfo(String vin, String commandType) {
        String key   = VIN_CACHE_PREFIX + vin;
        String value = commandType + "|" + System.currentTimeMillis();
        redisTemplate.opsForValue().set(key, value, CACHE_TTL);

        String traceId = Span.current().getSpanContext().getTraceId();
        log.info("[Redis] SET key={} value={} traceId={}", key, value, traceId);
    }

    /**
     * 读取 VIN 缓存
     * ★ Agent 自动生成 redis GET Span
     */
    public String getVinCache(String vin) {
        String key   = VIN_CACHE_PREFIX + vin;
        String value = redisTemplate.opsForValue().get(key);
        String traceId = Span.current().getSpanContext().getTraceId();
        log.info("[Redis] GET key={} hit={} traceId={}", key, value != null, traceId);
        return value;
    }

    /**
     * 缓存指令状态（供查询接口读取）
     */
    public void cacheCommandStatus(String traceId, String status) {
        String key = STATUS_CACHE_PREFIX + traceId;
        redisTemplate.opsForValue().set(key, status, CACHE_TTL);
        log.info("[Redis] SET status key={} status={}", key, status);
    }

    /**
     * 查询指令状态缓存
     */
    public String getCommandStatus(String traceId) {
        String key = STATUS_CACHE_PREFIX + traceId;
        return redisTemplate.opsForValue().get(key);
    }

    /**
     * 验证接口：展示 Redis 读写的完整链路信息
     */
    public Map<String, Object> verifyRedis(String vin) {
        Span span = Span.current();
        String traceId = span.getSpanContext().getTraceId();
        String spanId  = span.getSpanContext().getSpanId();

        // ★ 触发两次 Redis 操作，Agent 自动生成两个 Span
        cacheVinInfo(vin, "VERIFY");
        String cached = getVinCache(vin);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("traceId",     traceId);
        result.put("spanId",      spanId);
        result.put("operation",   "Redis SET + GET");
        result.put("key",         VIN_CACHE_PREFIX + vin);
        result.put("cached_value", cached);
        result.put("tip",         "在 Jaeger 里查看此 traceId，能看到 redis SET 和 redis GET 两个子 Span");
        return result;
    }
}
