# 远控链路缝合改造点清单

> 版本：v2.0（合并 Span Link + 复用 TraceID 方案）
> 日期：2026-04-15

---

## 一、整体架构图

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                          远控链路缝合 — 整体架构                                         ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  ┌──────┐  HTTP    ┌──────────────────┐  HTTP   ┌──────────────────┐          ║
║  │      │────────►│  TSP 远控网关服务  │────────►│ TSP TBox 远控服务  │          ║
║  │ App  │         │  ┌──────────────┐│         │                  │          ║
║  │      │         │  │ ①手动 Span   ││         │  ┌──────────────┐│          ║
║  └──────┘         │  │   埋点       ││         │  │ ②Redis 关联  ││          ║
║     ▲              │  └──────────────┘│         │  │   存储写入    ││          ║
║     │              │                  │         │  └──────┬───────┘│          ║
║     │              └──────────────────┘         │         │         │          ║
║     │                                       │    ▼         │         │          ║
║     │              ④push Span               │  ┌─────────┐    │          ║
║     │◄──────────────────────────────────────│──│  Redis  │    │          ║
║     │                                       │  │ seqNo→ │    │          ║
║     │              ┌──────────────────┐      │  │ traceId │    │          ║
║     │              │  TSP 推送服务      │      │  └─────────┘    │          ║
║     │              │  ┌──────────────┐│      │   TTL: 24h     │          ║
║     │              │  │ ③推送 Span   ││      │                  │          ║
║     │              │  └──────────────┘│      │                  │          ║
║     │              └────────┬─────────┘      │                  │          ║
║     │                       │RabbitMQ        │                  │          ║
║     │                       │                │  ┌──────────────┐ │          ║
║     │                       │                │  │ Kafka        │ │          ║
║     │                       │                │  │ Consumer     │ │          ║
║     │                       ▼                │  │ ②链路缝合     │ │          ║
║     │              ┌──────────────────┐      │  │ getCorrelation│ │          ║
║     │              │  TSP 登录服务      │      │  │ setParent    │ │          ║
║     │              │  ┌──────────────┐│      │  │ addLink      │ │          ║
║     │              │  │ ④TBox上线    ││      │  └──────────────┘ │          ║
║     │              │  │ Redis回写    ││      │                  │          ║
║     │              │  └──────────────┘│      │                  │          ║
║     │              └────────┬─────────┘      │                  │          ║
║     │                       │Kafka          │                  │          ║
║     │                       │                │                  │          ║
║     │                       ▼                │                  │          ║
║     │              ┌──────────────────┐      │                  │          ║
║     │              │  MQTT Broker      │◄─────┘  ②MQTT下发Span │          ║
║     │              │  (认证网关)        │         + Redis写入     │          ║
║     │              └────────┬─────────┘                        │          ║
║     │                       │                                │          ║
║     │              ┌────────┴─────────┐                        │          ║
║     │              │  TBox (不改造)    │                        │          ║
║     │              │  收seqNo→执行→   │                        │          ║
║     │              │  回seqNo          │                        │          ║
║     │              └──────────────────┘                        │          ║
║     │                                                            ║
╠═════╪══════════════════════════════════════════════════════════╪════════╣
║     │              数 据 上 报                                     │          ║
╠═════╪══════════════════════════════════════════════════════════╪════════╣
║     │                                                            ║          ║
║     │         -javaagent:opentelemetry-javaagent.jar            │          ║
║     │              │                                            │          ║
║     │              ▼                                            │          ║
║     │      OTel Collector                                      │          ║
║     │         ┌────────────────┐                                │          ║
║     │         │ 自动增强采集    │                                │          ║
║     │         │ + 手动Span上报  │                                │          ║
║     │         └───────┬────────┘                                │          ║
║     │                 │                                         │          ║
║     │                 ▼                                         │          ║
║     │         ClickHouse                                          │          ║
║     │         ┌─────────────────────────────────────┐            │          ║
║     │         │ otel_traces.otlp_spans              │            │          ║
║     │         │   ↓ mv_otel_to_spans (物化视图)     │            │          ║
║     │         │ platform.tsp_spans                 │            │          ║
║     │         │   ↓ mv_rc_minute (物化视图)         │            │          ║
║     │         │ platform.rc_minute_metrics          │            │          ║
║     │         │                                      │            │          ║
║     │         │ attributes_map['rc.seq_no']        │            │          ║
║     │         │ attributes_map['biz.vin']           │            │          ║
║     │         │ attributes_map['rc.direction']      │◄── seqNo   │          ║
║     │         │ attributes_map['rc.link.type']     │    在这里   │          ║
║     │         └─────────────────────────────────────┘            │          ║
║     │                          │                                  │          ║
╠═════╪══════════════════════╪══════════════════════════════════╪════════╣
║     │              查 询 展 示  │            ⑤ Gateway API      │          ║
╠═════╪══════════════════════╪══════════════════════════════════╪════════╣
║     │                          │                                  │          ║
║     │              tsp-monitor-gateway                         │          ║
║     │         ┌─────────────────────────────────────┐            │          ║
║     │         │ GET /remote-control/trace           │ 按seqNo查  │          ║
║     │         │ GET /remote-control/trace/by-vin   │ 按VIN查    │          ║
║     │         │ GET /remote-control/topology       │ 拓扑数据   │          ║
║     │         │ GET /remote-control/trace/duration │ 耗时分解   │          ║
║     │         └──────────────────┬──────────────────┘            │          ║
║     │                            │                               │          ║
║     │                            ▼                               │          ║
║     │         ┌─────────────────────────────────────┐            │          ║
║     │         │ ⑥ React 前端                        │            │          ║
║     │         │                                     │            │          ║
║     │         │  ┌─────────┐  ┌─────────┐  ┌──────┐│            │          ║
║     │         │  │ 远控拓扑 │  │ 链路搜索 │  │ 监控 ││            │          ║
║     │         │  │ 组件     │  │ 页面     │  │ 看板 ││            │          ║
║     │         │  └─────────┘  └─────────┘  └──────┘│            │          ║
║     │         └─────────────────────────────────────┘            │          ║
║     │                                                            ║
╚═════╧════════════════════════════════════════════════════════════╝
```

## 二、改造概览

```
┌──────────────────────────────────────────────────────────────────┐
│                     需要改造的服务/组件                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  App 端               无需改造（traceId 由 App 侧生成即可）        │
│                                                                    │
│  TSP 远控网关服务      改造点 1：增加手动 Span 埋点                  │
│                                                                    │
│  TSP TBox 远控服务    ★ 改造点 2：核心改造（Redis + Span + 链路缝合）│
│                                                                    │
│  TSP 推送服务          改造点 3：增加推送 Span                       │
│                                                                    │
│  TSP 登录服务          改造点 4：TBox 上线回调 + Redis 回写           │
│                                                                    │
│  tsp-monitor-gateway   改造点 5：新增查询 API（拓扑/链路搜索）       │
│                                                                    │
│  前端                  改造点 6：远控拓扑组件 + 链路搜索入口           │
│                                                                    │
│  TBox 端               无需改造（保持现有 seqNo 逻辑）              │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 三、各服务改造点

### 改造点 1：TSP 远控网关服务

**服务**：接收 App 远控指令的网关服务
**改造内容**：在人车关系校验、权限校验等关键节点增加手动 Span

**2.1 pom.xml 新增依赖**

```xml
<!-- OTel API（手动埋点用） -->
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-api</artifactId>
    <version>1.39.0</version>
</dependency>
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-context</artifactId>
    <version>1.39.0</version>
</dependency>
```

**2.2 手动埋点位置**

| 埋点位置 | Span Name | 关键 Attribute |
|---------|-----------|---------------|
| 接收 App 请求入口 | `rc.command.request` | biz.vin, biz.command_type, biz.user_id |
| 人车关系校验 | `rc.command.validate` | rc.validate.type=vehicle_relation, rc.validate.result |
| 车控权限校验 | `rc.command.validate` | rc.validate.type=permission, rc.validate.result |
| 转发到 TBox 服务 | `rc.command.forward` | rc.target=tbox_service |

**2.3 代码示例**

```java
@Resource
private Tracer tracer;

public RemoteControlResult handleCommand(Request req) {
    // 入口 Span
    Span rootSpan = tracer.spanBuilder("rc.command.request")
        .setAttribute("biz.vin", req.getVin())
        .setAttribute("biz.command_type", req.getCommandType())
        .startSpan();
    try (Scope scope = rootSpan.makeCurrent()) {

        // 人车关系校验
        Span validateSpan = tracer.spanBuilder("rc.command.validate")
            .setAttribute("rc.validate.type", "vehicle_relation")
            .startSpan();
        try (Scope s = validateSpan.makeCurrent()) {
            validateVehicleRelation(req.getVin(), req.getUserId());
        } finally {
            validateSpan.setAttribute("rc.validate.result", "PASS");
            validateSpan.end();
        }

        // 转发到 TBox 服务
        return tboxServiceClient.dispatch(req);
    } finally {
        rootSpan.end();
    }
}
```

**2.4 JVM 启动参数**

```bash
-javaagent:/opt/otel/opentelemetry-javaagent.jar
-Dotel.service.name=tsp-remote-control-gateway
-Dotel.traces.exporter=otlp
-Dotel.exporter.otlp.endpoint=http://otel-collector:4317
```

---

### 改造点 2：TSP TBox 远控服务（★ 核心）

**服务**：向 TBox 下发指令 + 消费 TBox 上报结果的 Kafka 消息
**改造内容**：Redis 关联存储 + MQTT 下发 Span + Kafka 消费链路缝合

**2.1 pom.xml 新增依赖**

```xml
<!-- OTel API -->
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-api</artifactId>
    <version>1.39.0</version>
</dependency>
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-context</artifactId>
    <version>1.39.0</version>
</dependency>

<!-- Redis（如果服务中还没有的话） -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

**2.2 Redis 配置**

```yaml
# application.yml
spring:
  redis:
    host: ${REDIS_HOST:localhost}
    port: ${REDIS_PORT:6379}
    database: 0
```

**2.3 新增类：RcTraceCorrelationService**

```java
@Component
@Slf4j
public class RcTraceCorrelationService {

    private static final String KEY_PREFIX = "rc:trace:";
    private static final String PENDING_PREFIX = "rc:pending:";
    private static final long TTL_HOURS = 24;

    @Resource
    private RedisTemplate<String, String> redisTemplate;

    /**
     * 下发时写入关联关系
     */
    public void saveCorrelation(String seqNo, String traceId, String spanId,
                                 String vin, String commandType, String tenantId) {
        Map<String, String> data = new HashMap<>();
        data.put("traceId", traceId);
        data.put("parentSpanId", spanId);
        data.put("vin", vin);
        data.put("commandType", commandType);
        data.put("tenantId", tenantId);
        data.put("dispatchTime", String.valueOf(System.currentTimeMillis()));

        redisTemplate.opsForValue().set(
            KEY_PREFIX + seqNo,
            JSON.toJSONString(data),
            TTL_HOURS, TimeUnit.HOURS
        );
        log.debug("保存链路关联: seqNo={}, traceId={}", seqNo, traceId);
    }

    /**
     * 离线场景：写入待执行指令队列
     */
    public void savePendingCommand(String vin, String seqNo) {
        redisTemplate.opsForValue().set(
            PENDING_PREFIX + vin, seqNo,
            TTL_HOURS, TimeUnit.HOURS
        );
    }

    /**
     * 上报时查询关联关系
     */
    public CorrelationData getCorrelation(String seqNo) {
        String json = redisTemplate.opsForValue().get(KEY_PREFIX + seqNo);
        if (json == null) return null;
        return JSON.parseObject(json, CorrelationData.class);
    }

    /**
     * 查询 VIN 的待执行指令
     */
    public String getPendingSeqNo(String vin) {
        return redisTemplate.opsForValue().get(PENDING_PREFIX + vin);
    }

    /**
     * 回写 TBox 上线时间（离线唤醒场景）
     */
    public void updateTboxOnlineTime(String seqNo, long onlineTime) {
        String key = KEY_PREFIX + seqNo;
        // 检查 key 是否存在
        if (Boolean.TRUE.equals(redisTemplate.hasKey(key))) {
            redisTemplate.opsForHash().put(key, "tboxOnlineTime",
                String.valueOf(onlineTime));
            redisTemplate.expire(key, TTL_HOURS, TimeUnit.HOURS);
        }
    }

    /**
     * 清理关联关系
     */
    public void cleanup(String seqNo) {
        redisTemplate.delete(KEY_PREFIX + seqNo);
    }

    /**
     * 清理待执行指令队列
     */
    public void cleanupPending(String vin) {
        redisTemplate.delete(PENDING_PREFIX + vin);
    }
}
```

**2.4 新增类：CorrelationData（DTO）**

```java
@Data
public class CorrelationData {
    private String traceId;
    private String parentSpanId;
    private String vin;
    private String commandType;
    private String tenantId;
    private long dispatchTime;
    private Long wakeupSmsTime;
    private Long tboxOnlineTime;
}
```

**2.5 改造：MQTT 下发方法**

```java
@Resource
private Tracer tracer;

@Resource
private RcTraceCorrelationService correlationService;

/**
 * MQTT 下发远控指令
 * 改造点：创建 Span + 写 Redis 关联
 */
public void dispatchCommand(String vin, String commandType, String seqNo, String payload) {
    Span span = tracer.spanBuilder("rc.command.dispatch")
        .setAttribute("rc.seq_no", seqNo)
        .setAttribute("biz.vin", vin)
        .setAttribute("biz.command_type", commandType)
        .setAttribute("rc.direction", "downstream")
        .setAttribute("rc.protocol", "mqtt")
        .startSpan();

    try (Scope scope = span.makeCurrent()) {
        // ★ 写入 Redis 关联
        SpanContext ctx = Span.current().getSpanContext();
        correlationService.saveCorrelation(
            seqNo,
            ctx.getTraceId(),
            ctx.getSpanId(),
            vin,
            commandType,
            TenantContext.getTenantId()
        );

        // 实际 MQTT 下发
        MqttMessage message = new MqttMessage(payload.getBytes());
        message.getProperties().put("seqNo", seqNo);
        mqttTemplate.publish("tbox/command/" + vin, message);
    } finally {
        span.end();
    }
}
```

**2.6 改造：离线场景 - 判断离线 + 触发唤醒**

```java
/**
 * 判断车辆在线状态并下发
 * 改造点：离线时写入 Redis 待执行队列
 */
public void dispatchOrWakeup(String vin, String commandType, String seqNo, String payload) {
    boolean isOnline = checkTBoxOnlineStatus(vin);

    Span span = tracer.spanBuilder("rc.command.check")
        .setAttribute("biz.vin", vin)
        .setAttribute("rc.tbox_status", isOnline ? "online" : "offline")
        .setAttribute("rc.seq_no", seqNo)
        .startSpan();

    try (Scope scope = span.makeCurrent()) {
        if (isOnline) {
            // 在线：直接下发
            dispatchCommand(vin, commandType, seqNo, payload);
        } else {
            // 离线：写入 Redis 待执行队列 + 触发短信唤醒
            SpanContext ctx = Span.current().getSpanContext();
            correlationService.saveCorrelation(
                seqNo, ctx.getTraceId(), ctx.getSpanId(),
                vin, commandType, TenantContext.getTenantId()
            );
            correlationService.savePendingCommand(vin, seqNo);

            // 在 Redis 中标记为需要唤醒
            redisTemplate.opsForHash().put("rc:trace:" + seqNo,
                "wakeupRequired", "true");
            redisTemplate.opsForHash().put("rc:trace:" + seqNo,
                "wakeupSmsTime", String.valueOf(System.currentTimeMillis()));

            // 调用短信唤醒服务
            smsWakeupService.sendWakeupSms(vin);
        }
    } finally {
        span.end();
    }
}
```

**2.7 改造：Kafka 消费 - 链路缝合（★ 最关键）**

```java
@KafkaListener(topics = "tbox-command-result")
public void onTBoxResult(ConsumerRecord<String, String> record) {
    String seqNo = extractSeqNo(record.value());
    if (seqNo == null) {
        log.warn("seqNo 缺失，无法缝合链路");
        return;
    }

    CorrelationData correlation = correlationService.getCorrelation(seqNo);

    if (correlation == null) {
        // 降级：Redis 不可用或已过期，创建独立 Span
        log.warn("关联关系丢失: seqNo={}", seqNo);
        handleWithoutCorrelation(record.value());
        return;
    }

    // ★ 构造原始下发 Span 的上下文
    SpanContext dispatchCtx = SpanContext.createFromRemoteParent(
        correlation.getTraceId(),
        correlation.getParentSpanId(),
        TraceFlags.getSampled(),
        TraceState.getDefault()
    );

    // ★ 创建上报 Span：
    //   setParent → 复用原始 TraceID（按 traceId 查可以看完整链路）
    //   addLink  → 标注关联关系（拓扑图上标虚线 + 黑盒耗时）
    Span span = tracer.spanBuilder("rc.command.receive")
        .setParent(Context.root().with(dispatchCtx))
        .addLink(dispatchCtx, Attributes.of(
            AttributeKey.stringKey("rc.link.type"), "seq_no_correlation",
            AttributeKey.stringKey("rc.seq_no"), seqNo,
            AttributeKey.longKey("rc.gap_duration_ms"),
            System.currentTimeMillis() - correlation.getDispatchTime()
        ))
        .setAttribute("rc.seq_no", seqNo)
        .setAttribute("biz.vin", correlation.getVin())
        .setAttribute("biz.command_type", correlation.getCommandType())
        .setAttribute("rc.direction", "upstream")
        .setAttribute("rc.protocol", "mqtt+kafka")
        .setAttribute("rc.tbox_execute_duration_ms",
            System.currentTimeMillis() - correlation.getDispatchTime())
        .startSpan();

    try (Scope scope = span.makeCurrent()) {
        // 校验 seqNo
        validateSeqNo(seqNo);
        // 转发到 RabbitMQ
        forwardToRabbitMQ(record.value());
    } finally {
        span.end();
        // 清理 Redis
        correlationService.cleanup(seqNo);
    }
}

/**
 * 降级处理：关联关系丢失时创建独立 Span
 */
private void handleWithoutCorrelation(String payload) {
    Span span = tracer.spanBuilder("rc.command.receive")
        .setAttribute("rc.correlation.lost", "true")
        .startSpan();
    try (Scope scope = span.makeCurrent()) {
        forwardToRabbitMQ(payload);
    } finally {
        span.end();
    }
}
```

**2.8 JVM 启动参数**

```bash
-javaagent:/opt/otel/opentelemetry-javaagent.jar
-Dotel.service.name=tsp-tbox-remote-control
-Dotel.traces.exporter=otlp
-Dotel.exporter.otlp.endpoint=http://otel-collector:4317
```

---

### 改造点 3：TSP 推送服务

**服务**：消费 RabbitMQ 消息，推送结果到 App
**改造内容**：增加推送 Span

**3.1 pom.xml**

```xml
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-api</artifactId>
    <version>1.39.0</version>
</dependency>
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-context</artifactId>
    <version>1.39.0</version>
</dependency>
```

**3.2 改造：推送方法**

```java
@Resource
private Tracer tracer;

public void pushResultToApp(String seqNo, String vin, String result) {
    Span span = tracer.spanBuilder("rc.command.push")
        .setAttribute("rc.seq_no", seqNo)
        .setAttribute("biz.vin", vin)
        .setAttribute("rc.result", result)
        .setAttribute("rc.direction", "upstream")
        .startSpan();

    try (Scope scope = span.makeCurrent()) {
        pushService.sendToApp(result);
    } finally {
        span.end();
    }
}
```

---

### 改造点 4：TSP 登录服务

**服务**：消费 TBox MQTT 登录事件的 Kafka 消息
**改造内容**：TBox 上线时回写 Redis + 补发待执行指令

**4.1 新增依赖**

```xml
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-api</artifactId>
    <version>1.39.0</version>
</dependency>
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-context</artifactId>
    <version>1.39.0</version>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

**4.2 改造：TBox 上线回调**

```java
@Resource
private RcTraceCorrelationService correlationService;

@KafkaListener(topics = "tbox-login-event")
public void onTBoxLogin(String vin) {
    log.info("TBox 上线: vin={}", vin);

    // ★ 查找该 VIN 的待执行指令
    String seqNo = correlationService.getPendingSeqNo(vin);
    if (seqNo == null) {
        return; // 没有待执行的远控指令
    }

    // ★ 回写上线时间到 Redis
    correlationService.updateTboxOnlineTime(seqNo, System.currentTimeMillis());

    // 清理待执行队列
    correlationService.cleanupPending(vin);

    // 触发补发指令（调用 TBox 远控服务）
    tboxRemoteControlService.redispatchCommand(seqNo, vin);
}
```

---

### 改造点 5：tsp-monitor-gateway

**服务**：监控看板后端
**改造内容**：新增远控链路拓扑查询 + seqNo/VIN 搜索 API

**5.1 新增 Controller 方法**

```java
/**
 * 按 seqNo 查询完整链路
 */
@GetMapping("/remote-control/trace")
public Result getTraceBySeqNo(@RequestParam String seqNo) {
    String sql = "SELECT trace_id, span_id, parent_span_id, service_name, name, " +
            "kind, status_code, duration_ns / 1000000 AS duration_ms, start_time, " +
            "attributes_map['rc.seq_no'] AS seq_no, " +
            "attributes_map['rc.direction'] AS direction, " +
            "attributes_map['biz.vin'] AS vin, " +
            "attributes_map['biz.command_type'] AS command_type, " +
            "attributes_map['rc.protocol'] AS protocol " +
            "FROM platform.tsp_spans " +
            "WHERE attributes_map['rc.seq_no'] = ? " +
            "ORDER BY start_time";
    List<Map<String, Object>> spans = clickHouseService.queryList(sql, seqNo);
    return Result.success(spans);
}

/**
 * 按 VIN 查询远控链路（支持时间范围）
 */
@GetMapping("/remote-control/trace/by-vin")
public Result getTracesByVin(@RequestParam String vin,
                               @RequestParam Long startTime,
                               @RequestParam Long endTime) {
    String sql = "SELECT trace_id, span_id, parent_span_id, service_name, name, " +
            "kind, status_code, duration_ns / 1000000 AS duration_ms, start_time, " +
            "attributes_map['rc.seq_no'] AS seq_no, " +
            "attributes_map['rc.direction'] AS direction, " +
            "attributes_map['biz.command_type'] AS command_type " +
            "FROM platform.tsp_spans " +
            "WHERE attributes_map['biz.vin'] = ? " +
            "AND start_time >= fromUnixTimestamp64Milli(?) " +
            "AND start_time <= fromUnixTimestamp64Milli(?) " +
            "ORDER BY start_time DESC";
    List<Map<String, Object>> spans = clickHouseService.queryList(sql, vin, startTime, endTime);
    return Result.success(spans);
}

/**
 * 远控链路拓扑数据（按 VIN + 时间范围）
 */
@GetMapping("/remote-control/topology")
public Result getRcTopology(@RequestParam String vin,
                             @RequestParam Long startTime,
                             @RequestParam Long endTime) {
    String sql = "SELECT " +
            "service_name, name AS operation, " +
            "count() AS call_count, " +
            "sum(if(status_code='ERROR',1,0)) AS error_count, " +
            "avg(duration_ns) / 1000000 AS avg_duration_ms, " +
            "attributes_map['rc.direction'] AS direction, " +
            "attributes_map['rc.protocol'] AS protocol " +
            "FROM platform.tsp_spans " +
            "WHERE attributes_map['biz.vin'] = ? " +
            "AND start_time >= fromUnixTimestamp64Milli(?) " +
            "AND start_time <= fromUnixTimestamp64Milli(?) " +
            "GROUP BY service_name, operation, direction, protocol " +
            "ORDER BY call_count DESC";
    List<Map<String, Object>> topology = clickHouseService.queryList(sql, vin, startTime, endTime);
    return Result.success(topology);
}

/**
 * 按 seqNo 查询端到端耗时分解
 */
@GetMapping("/remote-control/trace/duration")
public Result getTraceDuration(@RequestParam String seqNo) {
    String sql = "SELECT " +
            "attributes_map['rc.direction'] AS direction, " +
            "attributes_map['rc.protocol'] AS protocol, " +
            "sum(duration_ns) / 1000000 AS total_duration_ms, " +
            "count() AS span_count, " +
            "min(start_time) AS first_span_time, " +
            "max(start_time) AS last_span_time " +
            "FROM platform.tsp_spans " +
            "WHERE attributes_map['rc.seq_no'] = ? " +
            "GROUP BY direction, protocol " +
            "ORDER BY first_span_time";
    List<Map<String, Object>> durations = clickHouseService.queryList(sql, seqNo);
    return Result.success(durations);
}
```

---

### 改造点 6：前端

**改造内容**：远控拓扑组件 + 链路搜索入口

**6.1 新增/修改文件**

| 文件 | 说明 |
|------|------|
| `src/remote-control/components/RcTopology.jsx` | 新增远控专属拓扑组件 |
| `src/remote-control/api.js` | 新增拓扑和链路查询 API |
| `src/remote-control/RemoteControlDashboard.jsx` | 增加"链路拓扑"Tab |

**6.2 RcTopology 组件核心逻辑**

```
与现有 TopologyView 类似，但有以下差异：

1. 查询条件：VIN + 时间范围（不是 traceId）
2. 节点渲染：
   - direction=downstream 的节点用实线箭头
   - direction=upstream 的节点用实线箭头
   - 两个方向之间（TBox 黑盒区间）用虚线连接，标注 gap_duration
3. 节点信息弹窗：
   - 显示 seqNo、vin、command_type、direction
   - 显示 Span Link 关联关系
4. 搜索入口：
   - 顶部搜索框支持输入 VIN 或 seqNo
```

---

## 四、改造优先级与依赖关系

```
Phase 1（核心贯通，3天）
┌─────────────────────────────────────────┐
│  改造点 2（TBox 远控服务）                 │
│  ├─ 2.1 pom.xml 依赖                    │
│  ├─ 2.2 Redis 配置                      │
│  ├─ 2.3 RcTraceCorrelationService       │
│  ├─ 2.4 CorrelationData DTO             │
│  ├─ 2.5 MQTT 下发 Span + Redis 写入     │
│  └─ 2.7 Kafka 消费链路缝合（★ 核心）     │
└─────────────────────────────────────────┘

Phase 2（链路完善，2天）
┌─────────────────────────────────────────┐
│  改造点 1（远控网关）入口 Span 埋点       │
│  改造点 3（推送服务）推送 Span           │
│  改造点 4（登录服务）TBox 上线回写       │
└─────────────────────────────────────────┘

Phase 3（可观测增强，3天）
┌─────────────────────────────────────────┐
│  改造点 5（gateway）查询 API             │
│  改造点 6（前端）拓扑 + 搜索            │
└─────────────────────────────────────────┘
```

---

## 五、Span 完整模型（最终版）

```
Trace (traceId = aaa111，所有 Span 共享此 traceId)

[App]
  └─ rc.command.request          biz.vin, biz.command_type
      └─ rc.command.validate        rc.validate.type=vehicle_relation
          └─ rc.command.forward     rc.target=tbox_service
              └─ [TSP TBox 远控服务]
                  ├─ rc.command.check       rc.tbox_status=online/offline
                  │   └─ rc.sms.send        (离线时) rc.seq_no, rc.mno_provider
                  │       └─ [短信服务]
                  │
                  └─ rc.command.dispatch     rc.seq_no, rc.direction=downstream ← Span Link 起点
                          │
                          │ ═══ MQTT ═══
                          │    TBox (黑盒)
                          │
                      rc.command.receive     rc.seq_no, rc.direction=upstream ← Span Link 终点
                      └─ rc.command.validate   rc.seq_no, rc.validate.result
                          └─ rc.command.forward  rc.forward.target=rabbitmq
                              └─ [TSP 推送服务]
                                  └─ rc.command.push  rc.seq_no, rc.result
                                      └─ [App]
```

---

## 六、验证检查清单

### 功能验证

| # | 验证项 | 预期结果 | 验证方式 |
|---|--------|---------|---------|
| 1 | Redis 写入 | `rc:trace:{seqNo}` 有数据，TTL=24h | `redis-cli GET rc:trace:xxx` |
| 2 | Span 上报 | ClickHouse 中有 `rc.seq_no` 属性的 Span | `SELECT ... WHERE attributes_map['rc.seq_no'] != ''` |
| 3 | TraceID 复用 | 下发 Span 和上报 Span 的 trace_id 相同 | 按 traceId 查，能看到完整链路 |
| 4 | Span Link | 上报 Span 有 link 指向下发 Span | 检查 Span 的 links 字段 |
| 5 | 按 VIN 查拓扑 | 拓扑图展示下发 + 上报完整链路 | 前端拓扑页面 |
| 6 | 按 seqNo 查链路 | 能搜到完整的下发和上报所有 Span | 前端搜索页面 |
| 7 | 降级处理 | Redis 不可用时，上报链路仍正常记录为独立 Trace | 关闭 Redis 后发送指令，检查 ClickHouse |
| 8 | 离线唤醒 | 唤醒后 TBox 上线时间回写到 Redis | 检查 Redis 中 `tboxOnlineTime` 字段 |

### 性能验证

| # | 验证项 | 预期结果 |
|---|--------|---------|
| 1 | 单次 Redis 读写耗时 | < 1ms |
| 2 | 手动 Span 创建耗时 | < 0.1ms |
| 3 | 双 Agent 启动 | 无 ClassCastException，无 StackOverflowError |
| 4 | Kafka 消费 QPS 5000 | 无异常 GC，无上报积压 |
| 5 | Redis 不可用 | 业务不受影响，Span 正常上报 |
