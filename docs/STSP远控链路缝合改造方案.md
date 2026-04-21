# STSP远控链路缝合改造方案（sendId 关联）

> 版本：v1.0 | 日期：2026-04-21

---

## 一、背景与现状

### 1.1 当前远控流程

本方案针对的远控流程如下（基于实际时序图梳理）：

**参与者**：APP、app-vehicle（TSP远控网关）、remote-service（TSP TBox远控服务）、login-status（TSP登录服务）、evgb-gateway（TSP认证网关）、lion-pushagent（TSP消息推送服务）、mno-mobile-sms（TSP短信服务）、log-service（TSP日志服务）、EMQX（MQTT Broker）、TBox（车载终端）

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         sendId 远控指令完整链路                                    │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────┐  ①HTTP          ┌──────────────┐                                      │
│  │ App  │ ──────────────► │ app-vehicle   │ 人车关系校验 / 车控权限校验            │
│  └──────┘  /remoteControl  │ (TSP远控网关) │                                      │
│                             └──────┬───────┘                                      │
│                                    │ 进入loading                                   │
│                                    │ ②HTTP                                        │
│                                    ▼                                              │
│                           ┌──────────────┐                                        │
│                           │remote-service │                                       │
│                           │(TSP TBox远控  │                                       │
│                           │     服务)     │                                       │
│                           └──────┬───────┘                                        │
│                                  │                                                │
│              ③rabbitMQ(ev_remote_routing_key)                                     │
│                                  │ ──► RabbitMQ队列（远控指令缓存）                 │
│                                  │                                                │
│              ④HTTP /vlfstatus/getStatus                                           │
│                                  │ ──► login-status（查询车辆在线状态）              │
│                                  │                                                │
│              ┌───────────────────┼───────────────────┐                             │
│              │ 车辆离线           │         │ 车辆在线  │                             │
│              ▼                   │         ▼         │                             │
│  ┌─────────────────────┐         │ (跳过唤醒)        │                             │
│  │ ⑤mno-mobile-sms     │         │                   │                             │
│  │ POST /api/msg/sendMsg│         │                   │                             │
│  │ (短信唤醒TBox)       │         │                   │                             │
│  └─────────┬───────────┘         │                   │                             │
│            │ TBox收到短信         │                   │                             │
│            │ 启动 → MQTT连接      │                   │                             │
│            ▼                     │                   │                             │
│  ┌──────────────────┐            │                   │                             │
│  │     EMQX         │◄───────────┴───────────────────┘                             │
│  │  (MQTT Broker)   │ ⑥TBox MQTT Connect / 认证                               │
│  └────────┬─────────┘                                                            │
│           │ ⑦认证校验(evgb-gateway)                                               │
│           │ 认证网关校验通过，TBox登录成功                                          │
│           │                                                                      │
│           │ EMQX桥接 → Kafka                                                      │
│           ▼                                                                      │
│  kafka(gb_login_status) → login-status 消费 ⑧                                    │
│           │                                                                      │
│           │ login-status → lion-pushagent: 推送登录消息通知 ⑨                      │
│           │                                                                      │
│  remote-service → Redis: ⑩ remote_retry_send_<N>（获取缓存的远控命令）             │
│           │                                                                      │
│  remote-service → EMQX: ⑪ MQTT Publish(evnode-xxx)（下发远控指令，携带sendId）     │
│           │                                                                      │
│  ┌──────┐ ⑫TBox订阅并执行远控指令                                                  │
│  │ TBox │                                                                        │
│  └──┬───┘                                                                        │
│     │ ⑬上报执行结果（携带sendId）                                                   │
│     │  EMQX桥接 → Kafka                                                           │
│     ▼                                                                             │
│  ┌────────────────────────────────────┐                                           │
│  │ Kafka Topics:                      │                                           │
│  │  - kafka(vehicle_login) ⑭          │  TBox登录结果                              │
│  │  - kafka(events/remote_signal_data)│  远控信号数据 ⑮                            │
│  │  - kafka(remote_control_data) ⑯    │  远控执行结果                              │
│  └────────────────┬───────────────────┘                                           │
│                   │                                                               │
│                   │ remote-service 消费，校验sendId                                 │
│                   ▼                                                               │
│           ┌──────────────┐                                                        │
│           │remote-service │ ⑰发送推送消息                                          │
│           │ kafka         │ ──► kafka(push_msg_data)                               │
│           └──────┬───────┘                                                        │
│                  │                                                                │
│                  ▼                                                                │
│          ┌────────────────┐                                                       │
│          │lion-pushagent   │ ⑱消费推送消息                                        │
│          │(消息推送服务)    │                                                      │
│          └───────┬────────┘                                                       │
│                  │ ⑲推送远控结果                                                   │
│                  ▼                                                                │
│             ┌──────┐                                                              │
│             │ App  │                                                              │
│             └──────┘                                                              │
│                                                                                  │
│  [opt 远控下发失败]  → 失败消息处理，记录日志(log-service)                           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 与现有 seqNo 方案的关系

本方案与现有的 [remote-control-trace-stitching.md](remote-control-trace-stitching.md) 方案（基于 `seqNo` + Redis）采用相同的链路缝合技术（Span Link + 关联存储），核心差异在于：

| 对比项 | seqNo 方案（已有） | sendId 方案（本方案） |
|--------|:-----------------:|:--------------------:|
| 关联字段 | `seqNo`（序列号） | `sendId`（下发 ID） |
| 关联存储 | Redis | MongoDB（当前）/ Redis（推荐） |
| MQTT Broker | 通用 MQTT Broker | EMQX |
| 指令队列 | 无 | RabbitMQ（ev_remote_routing_key） |
| 命令缓存 | 无 | Redis（remote_retry_send_<N>） |
| 消息推送 | RabbitMQ → 推送服务 | Kafka(push_msg_data) → lion-pushagent |
| 认证网关 | 通用认证网关 | evgb-gateway |
| 登录服务 | TSP 登录服务（Kafka） | login-status（kafka: gb_login_status） |
| 短信服务 | 第三方短信 | mno-mobile-sms |
| sendId 存储位置 | 无 | MongoDB（sendId ↔ VIN 映射） |

### 1.3 核心问题

**Trace 断裂点**：步骤 ⑪ remote-service 通过 EMQX MQTT Publish 下发指令到 TBox 时，OTel TraceContext 无法传递到 TBox 端。TBox 没有链路追踪能力，导致整条链路在 TBox 边界断裂为两段独立 Trace：

```
Trace-A (App → app-vehicle → remote-service → RabbitMQ → Redis → EMQX下发)    ← sendId: "send_xxx_001"
        ╳ 断裂 ╳
Trace-B (TBox上报 → EMQX → Kafka → remote-service → lion-pushagent → App)
```

### 1.4 目标

1. 通过 `sendId` 关联两段 Trace，在链路追踪界面上查看完整链路
2. 下发链路和上报链路的每个服务环节都有 Span 记录
3. 端到端耗时可计算（从 App 发起指令到 App 收到执行结果）
4. 对比 MongoDB 与 Redis 作为关联存储的选型

---

## 二、关联存储选型：MongoDB vs Redis

### 2.1 当前现状

当前系统中，`sendId` 与 `VIN` 码的关联关系存储在 **MongoDB** 中。这是业务侧远控指令管理的数据存储，记录了每条远控指令的发送状态。

### 2.2 两种方案对比

| 对比维度 | Redis（推荐） | MongoDB（现状） |
|---------|:-------------:|:---------------:|
| **读写延迟** | 亚毫秒级（~0.1ms） | 毫秒级（~1-5ms），存在网络+序列化开销 |
| **吞吐量** | 10万+ QPS（单节点） | 1万+ QPS（单节点） |
| **数据结构** | Key-Value / Hash，天然适合关联映射 | 文档模型，字段丰富但过于重量级 |
| **TTL 支持** | 原生 Key 级别 TTL，自动过期清除 | 需要额外 TTL 索引 + 后台定时任务清理过期数据 |
| **内存占用** | 纯内存（小数据量无压力） | 内存映射文件 + 磁盘 I/O |
| **可用性风险** | 主从切换时短暂不可用（秒级） | 主从切换时短暂不可用（秒级） |
| **运维复杂度** | 低（已有 Redis 集群） | 中（已有 MongoDB 集群，但 TTL 清理需额外维护） |
| **与现有方案一致性** | 与 seqNo 方案一致，统一用 Redis | 与 seqNo 方案不一致，需维护两套关联存储 |
| **功能扩展性** | 仅适合简单关联查询 | 可存储更多业务字段，支持复杂查询 |

### 2.3 选型建议

**推荐 Redis**，理由如下：

1. **性能敏感场景**：链路缝合在远控结果上报的关键路径上，延迟要求亚毫秒级。Redis 读取延迟 ~0.1ms，MongoDB ~1-5ms，在高并发场景下差异更明显
2. **TTL 自动清理**：远控指令的关联关系具有时效性（正常 < 60s，最大 24h）。Redis 原生支持 Key 级别 TTL 自动过期，无需额外维护清理任务；MongoDB 需要：
   - 创建 TTL 索引
   - 后台 mongod 进程每 60 秒扫描一次
   - 不能保证精确的过期时间
3. **方案统一**：与现有的 seqNo 方案保持一致，降低维护成本和认知负担
4. **数据量可控**：远控指令 QPS 通常不高（百~千级），Redis 内存占用极小

**MongoDB 的适用场景**（不推荐用于链路缝合，但可以保留）：

1. 业务侧的指令全量记录（含状态流转历史）
2. 需要按 VIN + 时间范围查询历史指令列表
3. 需要存储复杂的指令参数和执行结果

### 2.4 推荐方案：Redis 关联 + MongoDB 业务记录

```
┌─────────────────────────────────────────────────────────────────┐
│                    存储职责分离                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐         ┌──────────────────────┐               │
│  │  Redis       │         │  MongoDB              │               │
│  │  ★ 链路缝合用 │         │  ★ 业务管理用          │               │
│  │              │         │                      │               │
│  │ rc:trace:    │         │ remote_commands       │               │
│  │  {sendId}    │         │  ├─ sendId            │               │
│  │  → {         │         │  ├─ vin               │               │
│  │    traceId,  │         │  ├─ commandType       │               │
│  │    spanId,   │         │  ├─ status            │               │
│  │    vin,      │         │  ├─ sendTime          │               │
│  │    dispatch  │         │  ├─ receiveTime       │               │
│  │    Time,     │         │  ├─ result            │               │
│  │    ...       │         │  └─ ...               │               │
│  │  }           │         │                      │               │
│  │              │         │  历史指令查询           │               │
│  │  TTL: 24h   │         │  指令状态流转           │               │
│  │  亚毫秒读写  │         │  复杂业务查询           │               │
│  └──────────────┘         └──────────────────────┘               │
│                                                                  │
│  写入时机：MQTT 下发前        写入时机：指令创建时（业务逻辑）      │
│  读取时机：Kafka 消费上报结果时  读取时机：业务查询指令状态时        │
│  清理时机：链路缝合后/TTL过期   清理时机：业务归档策略              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.5 如果选择 MongoDB 的方案

如果团队决定继续使用 MongoDB 作为链路关联存储，改造方式如下：

```java
// MongoDB 关联写入
@Component
public class RcTraceCorrelationService {

    @Resource
    private MongoTemplate mongoTemplate;

    /**
     * 下发时写入关联关系到 MongoDB
     * Collection: rc_trace_correlation
     */
    public void saveCorrelation(String sendId, String traceId, String spanId,
                                String vin, String commandType) {
        Document doc = new Document()
            .append("_id", sendId)
            .append("traceId", traceId)
            .append("parentSpanId", spanId)
            .append("vin", vin)
            .append("commandType", commandType)
            .append("dispatchTime", System.currentTimeMillis())
            .append("createdAt", new Date());  // 用于 TTL 索引

        mongoTemplate.save(doc, "rc_trace_correlation");
    }

    /**
     * 上报时从 MongoDB 查询关联关系
     */
    public CorrelationData getCorrelation(String sendId) {
        Document doc = mongoTemplate.findById(sendId, Document.class, "rc_trace_correlation");
        if (doc == null) return null;
        return convertToCorrelation(doc);
    }

    /**
     * 清理关联关系
     */
    public void cleanup(String sendId) {
        mongoTemplate.remove(new Query(Criteria.where("_id").is(sendId)), "rc_trace_correlation");
    }
}
```

MongoDB TTL 索引创建：

```javascript
// 在 MongoDB 中创建 TTL 索引，24 小时后自动删除过期文档
db.rc_trace_correlation.createIndex(
    { "createdAt": 1 },
    { expireAfterSeconds: 86400 }
)
```

---

## 三、sendId 关联存储设计（推荐 Redis）

### 3.1 Redis 存储结构

```
# 主关联 Key
Key:   rc:trace:{sendId}
Value: JSON {
  "traceId":        "abc123...",        // 原始下发链路的 TraceID
  "parentSpanId":   "span456...",       // EMQX 下发 Span 的 SpanID
  "vin":            "LSVAU2A37N...",    // 车辆 VIN
  "commandType":    "DOOR_UNLOCK",      // 指令类型
  "dispatchTime":   1713056400000,      // 下发时间戳(ms)
  "tenantId":       "SA_OEM_A"          // 租户 ID
}
TTL:   24 小时（远控指令超时回收）

# 待执行指令队列 Key（离线场景）
Key:   rc:pending:{vin}
Value: "{sendId}"
TTL:   24 小时
```

### 3.2 sendId 唯一性保障

sendId 由业务侧生成，通常格式为 `send_{timestamp}_{random}`。需确认：
- sendId 在同一条远控指令的下发和上报之间保持一致
- sendId 全局唯一，不会出现重复
- TBox 上报结果时原样携带 sendId

如果业务侧 sendId 存在重复风险，可在 Redis 写入时使用 `SET NX`（仅当 Key 不存在时写入）+ 唯一性校验。

---

## 四、TSP 侧改造点详解

### 4.1 改造概览

```
┌──────────────────────────────────────────────────────────────────┐
│                     需要改造的服务/组件                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  App 端               无需改造                                     │
│                                                                    │
│  TSP 远控网关服务      改造点 1：增加手动 Span 埋点                  │
│                                                                    │
│  TSP TBox 远控服务    ★ 改造点 2：核心改造（Redis + Span + 链路缝合）│
│                                                                    │
│  消息推送服务          改造点 3：增加推送 Span                       │
│                                                                    │
│  TSP 登录服务          改造点 4：TBox 上线回调 + Redis 回写           │
│                                                                    │
│  tsp-monitor-gateway   改造点 5：新增查询 API                       │
│                                                                    │
│  前端                  改造点 6：远控拓扑组件 + 链路搜索入口           │
│                                                                    │
│  TBox 端               无需改造（保持现有 sendId 逻辑）              │
│                                                                    │
│  Redis                改造点 7：关联存储（新增或复用现有）            │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 改造点 1：TSP 远控网关服务 — 入口 Span 埋点

**服务**：接收 App 远控指令的网关服务
**改造内容**：在接收 App 请求、人车关系校验、权限校验等关键节点增加 Span

**新增依赖**：

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

**代码改造**：

```java
@Resource
private Tracer tracer;

public RemoteControlResult handleCommand(Request req) {
    Span rootSpan = tracer.spanBuilder("rc.command.request")
        .setAttribute("biz.vin", req.getVin())
        .setAttribute("biz.command_type", req.getCommandType())
        .setAttribute("biz.user_id", req.getUserId())
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

---

### 4.3 改造点 2：TSP TBox 远控服务（★ 核心）

**服务**：向 TBox 下发指令 + 消费 TBox 上报结果的 Kafka 消息
**改造内容**：Redis 关联存储 + EMQX 下发 Span + Kafka 消费链路缝合

#### 4.3.1 新增依赖

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

<!-- Redis -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

#### 4.3.2 新增类：RcTraceCorrelationService

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
    public void saveCorrelation(String sendId, String traceId, String spanId,
                                 String vin, String commandType, String tenantId) {
        Map<String, String> data = new HashMap<>();
        data.put("traceId", traceId);
        data.put("parentSpanId", spanId);
        data.put("vin", vin);
        data.put("commandType", commandType);
        data.put("tenantId", tenantId);
        data.put("dispatchTime", String.valueOf(System.currentTimeMillis()));

        redisTemplate.opsForValue().set(
            KEY_PREFIX + sendId,
            JSON.toJSONString(data),
            TTL_HOURS, TimeUnit.HOURS
        );
        log.debug("保存链路关联: sendId={}, traceId={}", sendId, traceId);
    }

    /**
     * 上报时查询关联关系
     */
    public CorrelationData getCorrelation(String sendId) {
        String json = redisTemplate.opsForValue().get(KEY_PREFIX + sendId);
        if (json == null) return null;
        return JSON.parseObject(json, CorrelationData.class);
    }

    /**
     * 离线场景：写入待执行指令队列
     */
    public void savePendingCommand(String vin, String sendId) {
        redisTemplate.opsForValue().set(
            PENDING_PREFIX + vin, sendId,
            TTL_HOURS, TimeUnit.HOURS
        );
    }

    public String getPendingSendId(String vin) {
        return redisTemplate.opsForValue().get(PENDING_PREFIX + vin);
    }

    /**
     * 回写 TBox 上线时间（离线唤醒场景）
     */
    public void updateTboxOnlineTime(String sendId, long onlineTime) {
        String key = KEY_PREFIX + sendId;
        if (Boolean.TRUE.equals(redisTemplate.hasKey(key))) {
            redisTemplate.opsForHash().put(key, "tboxOnlineTime",
                String.valueOf(onlineTime));
            redisTemplate.expire(key, TTL_HOURS, TimeUnit.HOURS);
        }
    }

    public void cleanup(String sendId) {
        redisTemplate.delete(KEY_PREFIX + sendId);
    }

    public void cleanupPending(String vin) {
        redisTemplate.delete(PENDING_PREFIX + vin);
    }
}
```

#### 4.3.3 新增类：CorrelationData（DTO）

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

#### 4.3.4 改造：EMQX 下发方法 — Span + Redis 写入

```java
@Resource
private Tracer tracer;

@Resource
private RcTraceCorrelationService correlationService;

/**
 * EMQX 下发远控指令
 * 改造点：创建 Span + 写 Redis 关联（sendId）
 */
public void dispatchCommand(String vin, String commandType, String sendId, String payload) {
    Span span = tracer.spanBuilder("rc.command.dispatch")
        .setAttribute("rc.send_id", sendId)
        .setAttribute("biz.vin", vin)
        .setAttribute("biz.command_type", commandType)
        .setAttribute("rc.direction", "downstream")
        .setAttribute("rc.protocol", "mqtt")
        .setAttribute("rc.mqtt_broker", "emqx")
        .startSpan();

    try (Scope scope = span.makeCurrent()) {
        // ★ 写入 Redis 关联（sendId → traceId）
        SpanContext ctx = Span.current().getSpanContext();
        correlationService.saveCorrelation(
            sendId,
            ctx.getTraceId(),
            ctx.getSpanId(),
            vin,
            commandType,
            TenantContext.getTenantId()
        );

        // 实际 EMQX 下发（业务代码不变）
        MqttMessage message = new MqttMessage(payload.getBytes());
        message.getProperties().put("sendId", sendId);
        mqttTemplate.publish("tbox/command/" + vin, message);
    } finally {
        span.end();
    }
}
```

#### 4.3.5 改造：离线场景 — 判断离线 + 触发唤醒

```java
/**
 * 判断车辆在线状态并下发
 * 改造点：离线时写入 Redis 待执行队列（sendId）
 */
public void dispatchOrWakeup(String vin, String commandType, String sendId, String payload) {
    boolean isOnline = checkTBoxOnlineStatus(vin);

    Span span = tracer.spanBuilder("rc.command.check")
        .setAttribute("biz.vin", vin)
        .setAttribute("rc.tbox_status", isOnline ? "online" : "offline")
        .setAttribute("rc.send_id", sendId)
        .startSpan();

    try (Scope scope = span.makeCurrent()) {
        if (isOnline) {
            dispatchCommand(vin, commandType, sendId, payload);
        } else {
            // 离线：写入 Redis 关联 + 待执行队列
            SpanContext ctx = Span.current().getSpanContext();
            correlationService.saveCorrelation(
                sendId, ctx.getTraceId(), ctx.getSpanId(),
                vin, commandType, TenantContext.getTenantId()
            );
            correlationService.savePendingCommand(vin, sendId);

            // 调用短信唤醒服务
            smsWakeupService.sendWakeupSms(vin);
        }
    } finally {
        span.end();
    }
}
```

#### 4.3.6 改造：Kafka 消费 — 链路缝合（★ 最关键）

```java
@KafkaListener(topics = "tbox-command-result")
public void onTBoxResult(ConsumerRecord<String, String> record) {
    String sendId = extractSendId(record.value());
    if (sendId == null) {
        log.warn("sendId 缺失，无法缝合链路");
        return;
    }

    CorrelationData correlation = correlationService.getCorrelation(sendId);

    if (correlation == null) {
        // 降级：Redis 不可用或已过期
        log.warn("关联关系丢失: sendId={}", sendId);
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
    //   setParent → 复用原始 TraceID（按 traceId 查可看完整链路）
    //   addLink  → 标注关联关系（拓扑图上标虚线 + 黑盒耗时）
    Span span = tracer.spanBuilder("rc.command.receive")
        .setParent(Context.root().with(dispatchCtx))
        .addLink(dispatchCtx, Attributes.of(
            AttributeKey.stringKey("rc.link.type"), "send_id_correlation",
            AttributeKey.stringKey("rc.send_id"), sendId,
            AttributeKey.longKey("rc.gap_duration_ms"),
            System.currentTimeMillis() - correlation.getDispatchTime()
        ))
        .setAttribute("rc.send_id", sendId)
        .setAttribute("biz.vin", correlation.getVin())
        .setAttribute("biz.command_type", correlation.getCommandType())
        .setAttribute("rc.direction", "upstream")
        .setAttribute("rc.protocol", "mqtt+kafka")
        .setAttribute("rc.mqtt_broker", "emqx")
        .setAttribute("rc.tbox_execute_duration_ms",
            System.currentTimeMillis() - correlation.getDispatchTime())
        .startSpan();

    try (Scope scope = span.makeCurrent()) {
        // 校验 sendId
        validateSendId(sendId);
        // 转发到消息推送服务
        forwardToPushService(record.value());
    } finally {
        span.end();
        // 清理 Redis
        correlationService.cleanup(sendId);
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
        forwardToPushService(payload);
    } finally {
        span.end();
    }
}
```

---

### 4.4 改造点 3：消息推送服务

**服务**：消费消息，推送结果到 App
**改造内容**：增加推送 Span，携带 sendId

```java
@Resource
private Tracer tracer;

public void pushResultToApp(String sendId, String vin, String result) {
    Span span = tracer.spanBuilder("rc.command.push")
        .setAttribute("rc.send_id", sendId)
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

### 4.5 改造点 4：TSP 登录服务 — TBox 上线回调

**服务**：消费 TBox MQTT 登录事件的 Kafka 消息
**改造内容**：TBox 上线时回写 Redis + 补发待执行指令

```java
@Resource
private RcTraceCorrelationService correlationService;

@KafkaListener(topics = "tbox-login-event")
public void onTBoxLogin(String vin) {
    log.info("TBox 上线: vin={}", vin);

    // ★ 查找该 VIN 的待执行指令（sendId）
    String sendId = correlationService.getPendingSendId(vin);
    if (sendId == null) {
        return; // 没有待执行的远控指令
    }

    // ★ 回写上线时间到 Redis
    correlationService.updateTboxOnlineTime(sendId, System.currentTimeMillis());

    // 清理待执行队列
    correlationService.cleanupPending(vin);

    // 触发补发指令（调用 TBox 远控服务）
    tboxRemoteControlService.redispatchCommand(sendId, vin);
}
```

---

### 4.6 改造点 5：tsp-monitor-gateway — 查询 API

**服务**：监控看板后端
**改造内容**：新增 sendId 链路查询 API

```java
/**
 * 按 sendId 查询完整链路
 */
@GetMapping("/remote-control/trace")
public Result getTraceBySendId(@RequestParam String sendId) {
    String sql = "SELECT trace_id, span_id, parent_span_id, service_name, name, " +
            "kind, status_code, duration_ns / 1000000 AS duration_ms, start_time, " +
            "attributes_map['rc.send_id'] AS send_id, " +
            "attributes_map['rc.direction'] AS direction, " +
            "attributes_map['biz.vin'] AS vin, " +
            "attributes_map['biz.command_type'] AS command_type, " +
            "attributes_map['rc.protocol'] AS protocol " +
            "FROM platform.tsp_spans " +
            "WHERE attributes_map['rc.send_id'] = ? " +
            "ORDER BY start_time";
    List<Map<String, Object>> spans = clickHouseService.queryList(sql, sendId);
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
            "attributes_map['rc.send_id'] AS send_id, " +
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
 * 按 sendId 查询端到端耗时分解
 */
@GetMapping("/remote-control/trace/duration")
public Result getTraceDuration(@RequestParam String sendId) {
    String sql = "SELECT " +
            "attributes_map['rc.direction'] AS direction, " +
            "attributes_map['rc.protocol'] AS protocol, " +
            "sum(duration_ns) / 1000000 AS total_duration_ms, " +
            "count() AS span_count, " +
            "min(start_time) AS first_span_time, " +
            "max(start_time) AS last_span_time " +
            "FROM platform.tsp_spans " +
            "WHERE attributes_map['rc.send_id'] = ? " +
            "GROUP BY direction, protocol " +
            "ORDER BY first_span_time";
    List<Map<String, Object>> durations = clickHouseService.queryList(sql, sendId);
    return Result.success(durations);
}
```

---

### 4.7 改造点 6：前端

与 seqNo 方案类似，新增/修改：

| 文件 | 说明 |
|------|------|
| 远控拓扑组件 | 远控专属拓扑图（按 VIN + 时间范围查询） |
| 链路搜索 API | 新增 sendId 查询接口 |
| 远控看板 | 增加"链路拓扑"Tab 和搜索入口 |

---

## 五、完整 Span 模型

### 5.1 下发链路 (Trace-A)

| # | Span Name | Service | 关键 Attributes |
|---|-----------|---------|----------------|
| 1 | `rc.command.request` | tsp-remote-control-gateway | biz.vin, biz.command_type, biz.user_id |
| 2 | `rc.command.validate` | tsp-remote-control-gateway | rc.validate.type, rc.validate.result |
| 3 | `rc.command.check` | tsp-tbox-remote-control | rc.send_id, rc.tbox_status(online/offline) |
| 4 | `rc.sms.send` (离线时) | sms-wakeup-service | rc.send_id, rc.mno_provider |
| 5 | `rc.tbox.login` (离线时) | tsp-login-service | rc.send_id, biz.vin |
| 6 | **`rc.command.dispatch`** | tsp-tbox-remote-control | **rc.send_id, rc.direction=downstream, rc.mqtt_broker=emqx** |

### 5.2 上报链路 (Trace-B)

| # | Span Name | Service | 关键 Attributes |
|---|-----------|---------|----------------|
| 1 | **`rc.command.receive`** | tsp-tbox-remote-control | rc.send_id, rc.direction=upstream, **Span Link → Trace-A** |
| 2 | `rc.command.validate` | tsp-tbox-remote-control | rc.send_id, rc.validate.result |
| 3 | `rc.command.push` | push-service | rc.send_id, rc.push.channel, rc.result |

### 5.3 Span Link 示例

```json
{
  "traceId": "abc123...",
  "spanId": "def456...",
  "name": "rc.command.receive",
  "kind": "CONSUMER",
  "links": [{
    "traceId": "xyz789...",
    "spanId": "last098...",
    "attributes": {
      "rc.link.type": "send_id_correlation",
      "rc.send_id": "send_20260421_001",
      "rc.gap_duration_ms": 3200
    }
  }]
}
```

### 5.4 Span 树状模型

```
Trace (traceId = aaa111，所有 Span 共享此 traceId)

[App]
  └─ rc.command.request          biz.vin, biz.command_type
      └─ rc.command.validate      rc.validate.type=vehicle_relation
          └─ [TSP TBox 远控服务]
              ├─ rc.command.check       rc.send_id, rc.tbox_status=online/offline
              │   └─ rc.sms.send        (离线时) rc.send_id, rc.mno_provider
              │
              └─ rc.command.dispatch    rc.send_id, rc.direction=downstream ← Span Link 起点
                      │
                      │ ═══ EMQX (MQTT) ═══
                      │    TBox (黑盒)
                      │
                  rc.command.receive      rc.send_id, rc.direction=upstream ← Span Link 终点
                  └─ rc.command.validate  rc.send_id, rc.validate.result
                      └─ rc.command.push  rc.send_id, rc.result
                          └─ [App]
```

---

## 六、ClickHouse 查询支持

### 6.1 按 sendId 查询完整链路

```sql
-- 通过 sendId 关联下发和上报两段 Trace
SELECT
    trace_id,
    span_id,
    parent_span_id,
    start_time,
    duration_ns / 1000000 AS duration_ms,
    service_name,
    name AS span_name,
    status_code,
    attributes_map['rc.send_id'] AS send_id,
    attributes_map['rc.direction'] AS direction
FROM platform.tsp_spans
WHERE attributes_map['rc.send_id'] = '{sendId}'
   OR trace_id = '{original_trace_id}'
ORDER BY start_time;
```

### 6.2 链路断裂点标记查询

```sql
-- 查询所有远控链路的下发→上报间隔（TBox 黑盒耗时）
SELECT
    attributes_map['rc.send_id'] AS send_id,
    attributes_map['biz.vin'] AS vin,
    attributes_map['biz.command_type'] AS command_type,
    max(start_time) - min(start_time) AS e2e_duration_ns
FROM platform.tsp_spans
WHERE attributes_map['rc.send_id'] != ''
  AND start_time > now() - INTERVAL 24 HOUR
GROUP BY send_id, vin, command_type
ORDER BY e2e_duration_ns DESC
LIMIT 50;
```

---

## 七、改造清单与优先级

### 7.1 改造优先级

```
Phase 1（核心贯通，P0，预计 3 天）
┌─────────────────────────────────────────┐
│  改造点 2（TBox 远控服务）                 │
│  ├─ Redis 依赖引入                       │
│  ├─ RcTraceCorrelationService            │
│  ├─ CorrelationData DTO                 │
│  ├─ EMQX 下发 Span + Redis 写入          │
│  └─ Kafka 消费链路缝合（★ 核心）          │
└─────────────────────────────────────────┘

Phase 2（链路完善，P1，预计 2 天）
┌─────────────────────────────────────────┐
│  改造点 1（远控网关）入口 Span 埋点       │
│  改造点 3（推送服务）推送 Span            │
│  改造点 4（登录服务）TBox 上线回写        │
└─────────────────────────────────────────┘

Phase 3（可观测增强，P2，预计 3 天）
┌─────────────────────────────────────────┐
│  改造点 5（gateway）查询 API             │
│  改造点 6（前端）拓扑 + 搜索             │
│  改造点 7（Redis）关联存储配置            │
└─────────────────────────────────────────┘
```

### 7.2 改造文件清单

| 序号 | 服务 | 改造内容 | 改动方式 | 优先级 |
|------|------|----------|---------|--------|
| 1 | TSP TBox 远控服务 | 新增 `RcTraceCorrelationService` | 新增类 | P0 |
| 2 | TSP TBox 远控服务 | 新增 `CorrelationData` DTO | 新增类 | P0 |
| 3 | TSP TBox 远控服务 | 改造 EMQX 下发方法：Span + Redis 写入 | 修改方法 | P0 |
| 4 | TSP TBox 远控服务 | 改造 Kafka 消费方法：链路缝合 | 修改方法 | P0 |
| 5 | TSP 远控网关 | 入口 Span 埋点 | 修改方法 + 新增依赖 | P1 |
| 6 | 消息推送服务 | 推送 Span 埋点 | 修改方法 + 新增依赖 | P1 |
| 7 | TSP 登录服务 | TBox 上线回调 + Redis 回写 | 修改方法 + 新增依赖 | P1 |
| 8 | tsp-monitor-gateway | sendId 查询 API | 新增接口 | P2 |
| 9 | 前端 | 远控拓扑 + 链路搜索 | 新增/修改组件 | P2 |
| 10 | Redis | 确认可用性，Key 设计 TTL 24h | 配置 | P0 |

### 7.3 TBox 侧（不改造）

TBox 完全不感知链路追踪，只保持现有逻辑：
- 接收 EMQX 指令（包含 sendId）
- 执行远控指令
- 上报结果（携带 sendId）

---

## 八、风险评估与回退

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Redis 不可用导致关联丢失 | 上报链路无法关联到下发链路 | 降级为独立 Trace，记录告警日志 |
| sendId 重复 | 关联错误 | 业务侧确保 sendId 唯一，Redis 写入时做校验 |
| TTL 过期（指令执行超 24h） | Redis Key 被清除 | 远控指令正常超时 < 60s，24h TTL 充足 |
| TBox 上报时 sendId 丢失 | 无法关联 | 降级处理，记录异常日志 |
| EMQX 桥接 Kafka 延迟 | 上报链路 Span 时间偏差 | 使用 sendId 关联而非时间窗口，不受延迟影响 |

---

## 九、与 seqNo 方案的统一建议

如果两套远控系统同时运行，建议：

1. **统一关联字段命名**：将 `rc.seq_no` 和 `rc.send_id` 统一为一个通用字段（如 `rc.correlation_id`），或在代码层面做兼容映射
2. **统一 Redis Key 设计**：使用统一的 Key 前缀（`rc:trace:`），区分 seqNo 和 sendId 只需在 Value 中增加 `idType` 字段
3. **统一查询 API**：Gateway 查询 API 同时支持 seqNo 和 sendId，通过参数区分

```java
// 统一的关联数据结构
@Data
public class CorrelationData {
    private String correlationId;   // seqNo 或 sendId
    private String idType;          // "SEQ_NO" 或 "SEND_ID"
    private String traceId;
    private String parentSpanId;
    private String vin;
    private String commandType;
    private String tenantId;
    private long dispatchTime;
}
```

---

## 十、总结

本方案基于 sendId 关联标识，采用 **Redis 关联存储 + OTel Span Link** 的技术路线，实现远控链路在 TBox 边界的自动缝合。核心优势：

1. **TBox 零改造**：仅利用现有的 sendId 字段，TBox 侧无需任何改动
2. **精确关联**：通过 sendId 精确匹配，关联准确率 100%
3. **实时缝合**：Kafka 消费时立即完成链路关联，无需离线批处理
4. **黑盒耗时量化**：精确计算 TBox 侧的处理耗时（gap_duration）
5. **优雅降级**：Redis 不可用时降级为独立 Trace，不影响业务
6. **方案统一**：推荐 Redis 作为关联存储，与 seqNo 方案保持一致
