# 远控全链路 Trace 贯通方案

> 版本：v1.0 | 日期：2026-04-14

---

## 一、背景与问题

### 1.1 当前远控流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         远控指令完整链路                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────┐    ①HTTP     ┌──────────────────┐                                │
│  │ App  │ ──────────► │ TSP 远控网关服务   │ 人车关系校验 / 车控权限校验      │
│  └──────┘              └────────┬─────────┘                                │
│                                 │ ②HTTP                                    │
│                                 ▼                                          │
│                        ┌──────────────────┐                                │
│                        │ TSP TBox 远控服务  │ 判断车辆是否在线                │
│                        └────────┬─────────┘                                │
│                                 │                                          │
│              ┌──────────────────┼──────────────────┐                        │
│              │ 车辆离线          │        │ 车辆在线   │                        │
│              ▼                  │        ▼          │                        │
│   ┌──────────────────┐          │  (跳过唤醒，直接下发) │                        │
│   │ ③第三方短信唤醒    │          │                    │                        │
│   │ 物联网供应商 SMS  │          │                    │                        │
│   └────────┬─────────┘          │                    │                        │
│            │ TBox 收到短信       │                    │                        │
│            │ 启动 → MQTT 连接    │                    │                        │
│            ▼                  │                    │                        │
│   ┌──────────────────┐          │                    │                        │
│   │ MQTT Broker      │◄─────────┴────────────────────┘                        │
│   │ 认证网关校验      │  ④ MQTT Connect / 认证授权                              │
│   └────────┬─────────┘                                                    │
│            │ 连接建立，TBox 登录                                             │
│            ▼                                                               │
│   ┌──────────────────┐    桥接     ┌──────────────────┐                     │
│   │ MQTT Broker      │ ────────► │ Kafka            │                     │
│   └──────────────────┘            └────────┬─────────┘                     │
│                                           │ ⑤消费                          │
│                                           ▼                                │
│   ┌──────────────────┐  ⑥补发指令  ┌──────────────────┐                     │
│   │ TSP 登录服务      │◄──────────│ TSP TBox 远控服务  │ ←─────────────┐    │
│   └──────────────────┘            └────────┬─────────┘               │    │
│                                           │                          │    │
│                                           │ ⑦MQTT 下发指令(seqNo)    │    │
│                                           ▼                          │    │
│                                  ┌──────────────────┐                 │    │
│                                  │ MQTT Broker      │ ────────────►  │    │
│                                  └──────────────────┘                 │    │
│                                                                      │    │
│   ┌──────┐    ⑧执行指令         ┌──────────────────┐   ⑨上报结果     │    │
│   │ TBox │ ──────────────────► │ TBox 执行远控指令  │ ──────────► │    │    │
│   └──────┘                    └──────────────────┘   (携带seqNo)  │    │
│                                                            │      │    │
│                                                            ▼      │    │
│                                                  ┌──────────────┐   │    │
│                                                  │ MQTT Broker  │───┘    │
│                                                  └──────┬───────┘        │
│                                                         │ 桥接            │
│                                                         ▼                │
│                                                  ┌──────────────┐        │
│                                                  │ Kafka        │        │
│                                                  └──────┬───────┘        │
│                                                         │ ⑩消费          │
│                                                         ▼                │
│                                            ┌──────────────────────┐      │
│                                            │ TSP TBox 远控服务      │      │
│                                            │ 校验 seqNo → 合法     │      │
│                                            └──────────┬───────────┘      │
│                                                       │ ⑪转发            │
│                                                       ▼                  │
│                                            ┌──────────────────────┐      │
│                                            │ RabbitMQ             │      │
│                                            └──────────┬───────────┘      │
│                                                       │ ⑫消费            │
│                                                       ▼                  │
│                                            ┌──────────────────────┐      │
│                                            │ TSP 推送服务          │      │
│                                            └──────────┬───────────┘      │
│                                                       │ ⑬推送            │
│                                                       ▼                  │
│                                                   ┌──────┐              │
│                                                   │ App  │              │
│                                                   └──────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心问题

**Trace 断裂点**：步骤 ⑦ TSP TBox 远控服务通过 MQTT 下发指令到 TBox 时，OTel TraceContext 无法传递到 TBox 端。TBox 侧没有 OTel SDK，无法继续同一个 trace。当前方案使用 `seqNo` 作为指令关联标识：

- **下发时**：TSP 生成 `seqNo`，随指令一起通过 MQTT 发给 TBox
- **上报时**：TBox 执行完后，在结果消息中携带 `seqNo` 返回

因此整条链路在 TBox 边界被切成了 **两段独立 Trace**：

```
Trace-A (App → TSP网关 → TBox服务 → MQTT下发)    ← seqNo: "20260414143000001"
        ╳ 断裂 ╳
Trace-B (TBox上报 → MQTT → Kafka → TBox服务 → RabbitMQ → 推送服务 → App)
```

### 1.3 目标

**在不改造 TBox 的前提下**，通过 TSP 侧的改造，实现：
1. 两段 Trace 能够通过 `seqNo` 关联，支持在链路追踪界面上查看完整链路
2. 下发链路和上报链路的每个服务环节都有 Span 记录
3. 端到端耗时可计算（从 App 发起指令到 App 收到执行结果）
4. 与现有 OTel 体系无缝集成，不引入新的追踪框架

---

## 二、方案设计

### 2.1 核心思路：seqNo 关联 + Span Link + 虚拟跨度

```
┌─────────────────────────────────────────────────────────────────┐
│                    Trace 贯通策略                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ① 下发链路 (Trace-A)                                            │
│     App → TSP网关 → TBox服务 → [MQTT下发]                         │
│     └─ 最后一个 Span 记录 seqNo + traceId 到 Redis               │
│                                                                  │
│  ② TBox 侧 (黑盒，无 Trace)                                      │
│     TBox 收到指令 → 执行 → 上报结果(携带seqNo)                     │
│                                                                  │
│  ③ 上报链路 (Trace-B)                                            │
│     [Kafka消费] → TBox服务(seqNo校验) → RabbitMQ → 推送 → App     │
│     └─ 入口处从 Redis 查出原始 traceId                            │
│     └─ 创建 Span Link 关联到 Trace-A                              │
│     └─ 整条上报链路作为 Trace-A 的逻辑延续                         │
│                                                                  │
│  ④ ClickHouse 查询层                                              │
│     通过 seqNo 字段关联两段 Trace，展示完整链路                     │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 关联存储设计

#### Redis 存储结构

```
Key:   rc:trace:{seqNo}
Value: {
  "traceId":        "abc123...",        // 原始 Trace ID
  "parentSpanId":   "span456...",       // MQTT 下发 Span 的 Span ID
  "vin":            "LSVAU2A37N...",    // 车辆 VIN
  "commandType":    "DOOR_UNLOCK",      // 指令类型
  "dispatchTime":   1713056400000,      // 下发时间戳(ms)
  "tenantId":       "SA_OEM_A"          // 租户 ID
}
TTL:   24 小时（远控指令超时回收）
```

#### 存储时机

在 TBox 远控服务通过 MQTT 下发指令时，将 `traceId ↔ seqNo` 映射写入 Redis。

---

### 2.3 TSP 侧改造点详解

#### 改造点 1：MQTT 下发时记录关联关系

**服务**：TSP TBox 远控服务
**位置**：MQTT 指令下发拦截器 / AOP 切面

```java
/**
 * MQTT 指令下发拦截器
 * 在下发指令到 MQTT 时，将 traceId 与 seqNo 的映射存入 Redis
 */
@Component
public class RcTraceCorrelationInterceptor {

    @Resource
    private RedisTemplate<String, String> redisTemplate;

    @Resource
    private Tracer tracer;

    /**
     * 在 MQTT 下发前调用
     */
    public void beforeMqttDispatch(String seqNo, String vin, String commandType) {
        // 从 OTel 上下文获取当前 traceId 和 spanId
        SpanContext spanContext = Span.current().getSpanContext();
        String traceId = spanContext.getTraceId();
        String spanId = spanContext.getSpanId();

        // 构建关联数据
        Map<String, String> correlation = Map.of(
            "traceId", traceId,
            "parentSpanId", spanId,
            "vin", vin,
            "commandType", commandType,
            "dispatchTime", String.valueOf(System.currentTimeMillis()),
            "tenantId", TenantContext.getTenantId()
        );

        // 写入 Redis，TTL 24h
        String key = "rc:trace:" + seqNo;
        redisTemplate.opsForValue().set(key,
            JSON.toJSONString(correlation),
            24, TimeUnit.HOURS);

        // 在当前 Span 中记录 seqNo（便于后续查询）
        Span.current().setAttribute("rc.seq_no", seqNo);
    }
}
```

#### 改造点 2：创建"指令下发"虚拟 Span

**服务**：TSP TBox 远控服务
**目的**：标记下发链路的终点，便于查询

```java
/**
 * 在 MQTT 下发时创建一个 Span，标记指令已离站
 */
@SpanName("rc.command.dispatch")
public void dispatchCommand(String seqNo, String vin, String commandType) {
    Span span = tracer.spanBuilder("rc.command.dispatch")
        .setAttribute("rc.seq_no", seqNo)
        .setAttribute("biz.vin", vin)
        .setAttribute("biz.command_type", commandType)
        .setAttribute("rc.direction", "downstream")
        .setAttribute("rc.protocol", "mqtt")
        .startSpan();

    try (Scope scope = span.makeCurrent()) {
        // 记录关联关系到 Redis
        correlationInterceptor.beforeMqttDispatch(seqNo, vin, commandType);
        // 实际 MQTT 下发逻辑
        mqttTemplate.send(topic, message);
    } finally {
        span.end();
    }
}
```

#### 改造点 3：Kafka 消费时恢复 Trace 上下文

**服务**：TSP TBox 远控服务（Kafka Consumer）
**目的**：收到 TBox 上报结果时，关联回原始 Trace

```java
/**
 * Kafka 消费者 - TBox 上报结果处理
 * 通过 seqNo 从 Redis 查出原始 traceId，创建 Span Link 关联
 */
@KafkaListener(topics = "tbox-command-result")
public void onTBoxResult(ConsumerRecord<String, String> record) {
    String seqNo = extractSeqNo(record.value());
    if (seqNo == null) return;

    // ① 从 Redis 查原始 Trace 信息
    String correlationJson = redisTemplate.opsForValue().get("rc:trace:" + seqNo);
    RedisTraceCorrelation correlation = JSON.parseObject(correlationJson, RedisTraceCorrelation.class);

    // ② 构建上报链路的 Trace
    Tracer tracer = OpenTelemetry.getGlobalTracer("tsp-tbox-remote-control");

    SpanBuilder builder = tracer.spanBuilder("rc.command.receive")
        .setAttribute("rc.seq_no", seqNo)
        .setAttribute("biz.vin", correlation.getVin())
        .setAttribute("biz.command_type", correlation.getCommandType())
        .setAttribute("rc.direction", "upstream")
        .setAttribute("rc.protocol", "mqtt+kafka")
        .setAttribute("rc.tbox_execute_duration_ms",
            System.currentTimeMillis() - correlation.getDispatchTime());

    // ③ ★ 关键：通过 Span Link 关联到下发链路
    if (correlation != null && correlation.getTraceId() != null) {
        SpanContext upstreamContext = SpanContext.createFromRemoteParent(
            correlation.getTraceId(),
            correlation.getParentSpanId(),
            TraceFlags.getSampled(),
            TraceState.getDefault()
        );
        builder.addLink(upstreamContext, Attributes.of(
            AttributeKey.stringKey("rc.link.type"), "seq_no_correlation",
            AttributeKey.stringKey("rc.seq_no"), seqNo,
            AttributeKey.longKey("rc.gap_duration_ms"),
            System.currentTimeMillis() - correlation.getDispatchTime()
        ));
    }

    Span span = builder.startSpan();
    try (Scope scope = span.makeCurrent()) {
        // 校验 seqNo
        validateSeqNo(seqNo);
        // 转发到 RabbitMQ
        forwardToRabbitMQ(record.value());
    } finally {
        span.end();
        // 清理 Redis
        redisTemplate.delete("rc:trace:" + seqNo);
    }
}
```

#### 改造点 4：推送服务 → App 的 Trace 闭合

**服务**：TSP 推送服务
**目的**：标记整条链路的终点

```java
/**
 * 推送结果到 App 时创建闭合 Span
 */
@SpanName("rc.command.push")
public void pushResultToApp(String seqNo, String vin, String result) {
    Span span = tracer.spanBuilder("rc.command.push")
        .setAttribute("rc.seq_no", seqNo)
        .setAttribute("biz.vin", vin)
        .setAttribute("rc.result", result)
        .setAttribute("rc.direction", "upstream")
        .startSpan();

    try (Scope scope = span.makeCurrent()) {
        pushService.send(appId, result);
    } finally {
        span.end();
    }
}
```

---

### 2.4 Span Link 机制说明

OTel 的 **Span Link** 是专门为这种"逻辑关联但非父子关系"的场景设计的：

```
Trace-A (下发链路)                     Trace-B (上报链路)
┌─────────────────────┐               ┌─────────────────────┐
│ App发起              │               │ Kafka消费            │
│   └─ TSP网关         │               │   └─ seqNo校验       │── Link ──► Trace-A 的最后一个 Span
│       └─ TBox服务     │               │       └─ RabbitMQ    │
│           └─ MQTT下发 │ ◄── Link ──  │           └─ 推送    │
│              (seqNo)  │               │               └─ App │
└─────────────────────┘               └─────────────────────┘

Link 包含：
- trace-id: 原始下发链路的 traceId
- span-id: MQTT下发 Span 的 spanId
- attributes: {link.type: "seq_no_correlation", seq_no: "xxx", gap_duration_ms: 3200}
```

**与 Parent Span 的区别**：
- Parent Span 表示直接调用关系（同步/异步）
- Link 表示逻辑关联，两段 Trace 独立采样、独立上报
- 在链路追踪 UI 上，Link 会显示为"关联链路"，可点击跳转查看完整链路

---

### 2.5 离线唤醒链路的 Trace 处理

离线场景涉及短信唤醒，链路更长。关键改造点：

```
┌─ 下发链路 Trace-A ─┐     ┌─ 唤醒链路 Trace-C ─┐     ┌─ 上报链路 Trace-B ─┐
│ App → TSP网关 →     │     │ TBox服务 → 短信服务  │     │ Kafka消费 → ...    │
│ TBox服务(判断离线)  │────►│ → 等待TBox上线       │────►│ → 推送 → App       │
│ → [seqNo暂存Redis]  │     │ → TBox登录 → 补发   │     │                    │
└────────────────────┘     └────────────────────┘     └────────────────────┘
```

**处理策略**：
1. TBox 服务判断车辆离线时，当前 Span 记录 `rc.tbox_status = "offline"`
2. 短信唤醒是独立流程（Trace-C），通过 `biz.vin` 关联
3. TBox 登录成功后，TSP 登录服务消费 Kafka 消息 → 调用 TBox 服务补发指令
4. 补发指令复用同一个 `seqNo`（或重新生成并更新 Redis 映射）
5. 后续上报流程与在线场景一致

Redis 存储更新：

```
Key:   rc:trace:{seqNo}
Value: {
  "traceId":        "abc123...",
  "parentSpanId":   "span456...",
  "vin":            "LSVAU2A37N...",
  "commandType":    "DOOR_UNLOCK",
  "dispatchTime":   1713056400000,
  "tenantId":       "SA_OEM_A",
  "wakeupRequired": true,              // ★ 新增：是否需要唤醒
  "wakeupSmsTime":  1713056405000,     // ★ 新增：短信发送时间
  "tboxOnlineTime": 1713056423000      // ★ 新增：TBox 上线时间（登录时回写）
}
```

#### 改造点 5：TSP 登录服务记录 TBox 上线

```java
/**
 * TBox 登录成功回调
 * 如果该 VIN 有待执行的远控指令，更新 Redis 中的上线时间
 */
public void onTBoxOnline(String vin) {
    // 查找该 VIN 待执行的指令（可通过另一个 Redis Key 维护）
    String pendingKey = "rc:pending:" + vin;
    String seqNo = redisTemplate.opsForValue().get(pendingKey);

    if (seqNo != null) {
        String traceKey = "rc:trace:" + seqNo;
        // 更新 TBox 上线时间（Hash 操作）
        redisTemplate.opsForHash().put(traceKey, "tboxOnlineTime",
            String.valueOf(System.currentTimeMillis()));
    }
}
```

---

### 2.6 ClickHouse 查询支持

#### 物化视图改造

现有 `mv_rc_minute` 需要增加 `seqNo` 相关字段的提取，确保上报链路的 Span 也能被正确聚合到 `rc_minute_metrics`：

```sql
-- 上报链路的 Span 通过 rc.seq_no 属性标记
-- 在物化视图中需要同时处理下发和上报两个方向
```

#### 端到端链路查询（新增）

```sql
-- 通过 seqNo 关联下发和上报两段 Trace
-- 查询某条远控指令的完整链路
SELECT
    trace_id,
    span_id,
    parent_span_id,
    start_time,
    duration_ns / 1000000 AS duration_ms,
    service_name,
    name AS span_name,
    status_code,
    attributes_map['rc.seq_no'] AS seq_no,
    attributes_map['rc.direction'] AS direction
FROM platform.tsp_spans
WHERE attributes_map['rc.seq_no'] = '{seqNo}'
   OR trace_id = '{original_trace_id}'
ORDER BY start_time;
```

#### 链路断裂点标记查询

```sql
-- 查询所有远控链路的下发→上报间隔
-- 用于监控 TBox 响应延迟
SELECT
    attributes_map['rc.seq_no'] AS seq_no,
    attributes_map['biz.vin'] AS vin,
    attributes_map['biz.command_type'] AS command_type,
    max(start_time) - min(start_time) AS e2e_duration_ns
FROM platform.tsp_spans
WHERE attributes_map['rc.seq_no'] != ''
  AND start_time > now() - INTERVAL 24 HOUR
GROUP BY seq_no, vin, command_type
ORDER BY e2e_duration_ns DESC
LIMIT 50;
```

---

## 三、完整 Span 模型

### 3.1 下发链路 (Trace-A)

| # | Span Name | Service | 关键 Attributes |
|---|-----------|---------|----------------|
| 1 | `rc.command.request` | tsp-remote-control-gateway | biz.vin, biz.command_type, biz.user_id |
| 2 | `rc.command.validate` | tsp-remote-control-gateway | rc.validate.result, rc.tbox_status(online/offline) |
| 3 | `rc.command.dispatch.prepare` | tsp-tbox-remote-control | rc.seq_no, rc.tbox_status |
| 4 | `rc.sms.send` (离线时) | sms-wakeup-service | rc.seq_no, rc.mno_provider |
| 5 | `rc.tbox.login` (离线时) | tsp-login-service | rc.seq_no, biz.vin |
| 6 | **`rc.command.dispatch`** | tsp-tbox-remote-control | **rc.seq_no, rc.direction=downstream** |

### 3.2 上报链路 (Trace-B)

| # | Span Name | Service | 关键 Attributes |
|---|-----------|---------|----------------|
| 1 | **`rc.command.receive`** | tsp-tbox-remote-control | rc.seq_no, rc.direction=upstream, **Span Link → Trace-A** |
| 2 | `rc.command.validate` | tsp-tbox-remote-control | rc.seq_no, rc.validate.result |
| 3 | `rc.command.forward` | tsp-tbox-remote-control | rc.seq_no, rc.forward.target=rabbitmq |
| 4 | `rc.command.push` | tsp-push-service | rc.seq_no, rc.push.channel, rc.result |

### 3.3 Span Link 示例

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
      "rc.link.type": "seq_no_correlation",
      "rc.seq_no": "20260414143000001",
      "rc.gap_duration_ms": 3200
    }
  }]
}
```

---

## 四、改造清单

### 4.1 TSP 侧改造文件

| 序号 | 服务 | 改造内容 | 优先级 |
|------|------|----------|--------|
| 1 | TSP TBox 远控服务 | 新增 `RcTraceCorrelationInterceptor`：MQTT 下发前写入 Redis | P0 |
| 2 | TSP TBox 远控服务 | 改造 MQTT 下发方法：创建 `rc.command.dispatch` Span + 写入 Redis | P0 |
| 3 | TSP TBox 远控服务 | 改造 Kafka 消费方法：读取 Redis 关联关系 + 创建 Span Link | P0 |
| 4 | TSP TBox 远控服务 | 新增 `rc:pending:{vin}` Redis Key 维护待执行指令 | P1 |
| 5 | TSP 推送服务 | 改造推送方法：创建 `rc.command.push` Span，携带 seqNo | P1 |
| 6 | TSP 登录服务 | TBox 上线回调：更新 Redis 中 TBox 上线时间 | P2 |
| 7 | tsp-monitor-gateway | 新增 ClickHouse 跨 Trace 关联查询 API | P2 |

### 4.2 基础设施

| 序号 | 内容 | 说明 |
|------|------|------|
| 1 | Redis | 确认 Redis 可用，Key 设计 TTL 24h |
| 2 | OTel SDK | 确认 TSP 各服务的 OTel SDK 版本支持 Span Link（>= 1.20） |
| 3 | ClickHouse | tsp_spans 表已有 attributes_map Map 字段，无需改表 |

### 4.3 TBox 侧（不改造）

TBox 完全不感知 OTel，只保持现有逻辑：
- 接收 MQTT 指令（包含 seqNo）
- 执行远控指令
- 上报结果（携带 seqNo）

---

## 五、链路追踪 UI 展示

### 5.1 链路详情页

在现有的 Trace 详情页上，通过 Span Link 展示关联：

```
═══ Trace-A: 下发链路 ═══
 [App] ──► [TSP网关] ──► [TBox服务] ──► [MQTT下发] ◄── Link
                                                  │
                                                  │ seqNo: 20260414143000001
                                                  │ gap: 3200ms
                                                  ▼
═══ Trace-B: 上报链路 (点击 Link 跳转) ═══
 [Kafka消费] ──► [TBox服务] ──► [RabbitMQ] ──► [推送服务] ──► [App]
```

### 5.2 远控监控看板增强

在现有的远控监控 Tab 中，增加端到端链路查询功能：

- 输入 VIN 或 seqNo → 查询完整链路
- 展示下发→上报端到端耗时
- 标注链路断裂点（TBox 黑盒区间）和耗时

---

## 六、风险评估与回退

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Redis 不可用导致关联丢失 | 上报链路无法关联到下发链路 | Kafka 消费时降级为独立 Trace，记录告警 |
| seqNo 重复 | 关联错误 | seqNo 采用 `时间戳+VIN+随机数` 保证唯一 |
| TTL 过期（指令执行超 24h） | Redis Key 被清除 | TTL 设为 24h，远控指令正常超时 < 60s |
| TBox 上报时 seqNo 丢失 | 无法关联 | Kafka 消费时降级处理，记录异常日志 |

---

## 七、实施计划

### Phase 1：核心贯通（P0，预计 3 天）
1. TBox 远控服务：新增 Redis 关联存储 + MQTT 下发 Span
2. TBox 远控服务：Kafka 消费时创建 Span Link + 恢复上下文
3. 联调测试：验证两段 Trace 通过 seqNo 正确关联

### Phase 2：链路完善（P1，预计 2 天）
4. 推送服务：增加推送 Span
5. Redis Key 维护：待执行指令队列
6. 端到端联调：在线 + 离线两条完整链路

### Phase 3：可观测增强（P2，预计 2 天）
7. ClickHouse 跨 Trace 关联查询 API
8. 远控看板增加链路查询入口
9. 告警：关联丢失、超时等异常场景
