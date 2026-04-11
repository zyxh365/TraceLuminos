package com.tsp.service2.service;

import io.opentelemetry.api.trace.Span;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * Service2 Redis 操作
 * ★ OTel Agent 自动插桩 Lettuce，每次操作自动生成 Span
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RedisService {

    private final StringRedisTemplate redisTemplate;
    private static final String PROCESSED_PREFIX = "tsp:processed:";
    private static final Duration TTL = Duration.ofMinutes(30);

    public void markProcessed(String traceId, String source) {
        String key = PROCESSED_PREFIX + traceId;
        redisTemplate.opsForValue().set(key, source + "|" + System.currentTimeMillis(), TTL);
        log.info("[Redis-S2] SET processed key={} source={} traceId={}",
                key, source, Span.current().getSpanContext().getTraceId());
    }

    public String getProcessedStatus(String traceId) {
        String key = PROCESSED_PREFIX + traceId;
        String val = redisTemplate.opsForValue().get(key);
        log.info("[Redis-S2] GET key={} hit={} traceId={}",
                key, val != null, Span.current().getSpanContext().getTraceId());
        return val;
    }
}
