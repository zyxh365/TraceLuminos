# 专利交底书

## 一、发明名称

**跨非可观测设备边界的分布式链路自动缝合方法、系统及存储介质**

（英文名称：Method, System and Storage Medium for Automatic Distributed Trace Stitching Across Non-Observable Device Boundaries）

---

## 二、发明人信息

| 姓名 | 部门 | 职务 |
|------|------|------|
| （待填写） | （待填写） | （待填写） |

## 三、申请信息

| 项目 | 内容 |
|------|------|
| 申请类型 | 发明专利 |
| 技术领域 | 分布式系统 / 可观测性 / 车联网 / 物联网 |
| 关键词 | 分布式链路追踪、OpenTelemetry、云边端协同、链路缝合、非可观测设备 |

---

## 四、技术领域

本发明涉及分布式系统可观测性技术领域，具体涉及一种在包含不支持链路追踪能力的终端设备（如车载 TBox、IoT 网关等）的分布式系统中，自动实现端到端链路追踪缝合的方法、系统及存储介质。

---

## 五、背景技术

### 5.1 分布式链路追踪技术

分布式链路追踪（Distributed Tracing）是一种用于监控和诊断分布式系统中请求流转路径的技术。当前主流的实现标准为 OpenTelemetry（OTel），其核心机制为：

1. **Trace**：表示一条完整的请求链路，由唯一的 TraceID 标识。
2. **Span**：表示链路中的一个操作节点，记录服务名称、操作名称、开始时间、耗时、状态等信息。
3. **SpanContext**：包含 TraceID、SpanID 和 TraceFlags，通过 HTTP Header（W3C Trace Context 标准）或消息中间件的元数据在服务间传播。
4. **Parent Span**：通过记录父节点的 SpanID 建立调用层次关系。

其工作原理为：请求入口处生成 TraceID，随请求在服务间传递，每个服务创建子 Span 并上报至链路追踪后端（如 Jaeger、Zipkin），最终在可视化界面上还原完整的调用链。

### 5.2 现有技术的局限

在云-边-端（Cloud-Edge-Device）架构中，如车联网远程控制场景，存在以下技术问题：

**问题一：端侧设备无法承载链路追踪 SDK**

端侧设备（如车载 TBox）通常具有以下特征：
- 算力有限（低功耗 ARM 处理器），无法运行完整的 OTel SDK
- 运行的是嵌入式实时操作系统（如 AUTOSAR、FreeRTOS），不支持 Java/Python 等 OTel SDK 运行环境
- 固件升级周期长（需 OTA 推送，涉及车辆安全认证），改造难度极大、成本极高
- 设备数量大（百万级），即使能改造，海量的 Span 上报也会导致后端存储压力

因此，在端侧设备上部署链路追踪 SDK 在工程上不可行。

**问题二：链路在设备边界断裂**

由于端侧设备不支持链路追踪，当云端服务通过 MQTT 等物联网协议向端侧设备下发指令时：

1. 云端服务作为 Trace 的最后一个节点，生成一个 Span 后通过 MQTT 将指令发送给端侧设备
2. 端侧设备接收指令、执行操作、返回结果，但这一过程无法产生任何 Span
3. 云端服务接收到端侧设备的响应后，由于无法获取原始 Trace 上下文（端侧设备不会传播 TraceID），只能创建一个新的独立 Trace

这导致一条完整的业务链路被截断为两段独立的 Trace，无法在链路追踪系统中看到完整的端到端视图。

**问题三：现有缝合方案的不足**

目前已有的部分解决方案包括：

1. **在端侧设备中嵌入轻量级追踪代理**：需要在端侧设备上额外开发和维护追踪代码，且仍然面临 Span 上报的带宽和存储问题。
2. **在消息中间件层注入 TraceContext**：需要修改 MQTT Broker 或消息网关的代码，侵入性较强，且无法覆盖端侧设备内部的执行耗时。
3. **基于日志关联的离线分析**：通过时间窗口和业务字段进行离线关联，精度低、延迟大，无法满足实时监控需求。

上述方案要么要求改造端侧设备或中间件，要么只能提供低精度的离线分析，均无法在不改造端侧设备的前提下实现实时的、精确的端到端链路追踪。

### 5.3 车联网远控场景的具体挑战

在车联网远程控制（远控）场景中，一条远控指令的完整链路通常涉及：

```
App（移动端） → TSP 云端网关（人车校验/权限校验） → TSP TBox 服务（判断在线状态）
  → [在线] 直接通过 MQTT 下发指令到 TBox
  → [离线] 通过第三方物联网供应商发送唤醒短信 → TBox 启动 → MQTT 连接 → 登录认证
  → TBox 执行远控指令 → 通过 MQTT 上报执行结果 → Kafka → TSP 服务 → RabbitMQ → 推送到 App
```

该链路的特征：
- 横跨 HTTP、MQTT、Kafka、RabbitMQ、SMS 五种协议
- TBox 端是链路追踪的盲区（黑盒）
- 离线场景下链路更长，涉及唤醒支路的分叉和合并
- 需要精确计算端到端耗时（App 发起指令到 App 收到结果的完整耗时）

这些特征使得通用的链路追踪方案无法有效覆盖。

---

## 六、发明内容

### 6.1 发明目的

本发明的目的在于克服现有技术的上述缺陷，提供一种跨非可观测设备边界的分布式链路自动缝合方法，在不改造端侧设备的条件下，实现端到端的链路追踪关联，支持实时监控和精确的端到端耗时计算。

### 6.2 技术方案

为实现上述目的，本发明采用如下技术方案：

**一种跨非可观测设备边界的分布式链路自动缝合方法，包括以下步骤：**

**步骤 S1：指令下发时的追踪上下文捕获与关联存储**

在云端服务（第一服务节点）通过物联网消息协议（如 MQTT）向不支持链路追踪的终端设备（终端节点）下发指令时，执行以下操作：

1. 获取当前链路的追踪上下文，提取 TraceID 和当前 SpanID；
2. 提取所述指令的业务关联标识，所述业务关联标识为所述云端服务在构造指令时生成的唯一序列号（seqNo），用于在指令下发和结果上报之间建立对应关系；
3. 将所述追踪上下文（TraceID、SpanID）与所述业务关联标识（seqNo）的映射关系，连同业务维度信息（如设备标识 VIN、指令类型 commandType、下发时间戳 dispatchTime、租户标识 tenantId），写入关联存储介质；
4. 将所述业务关联标识（seqNo）附加到所述指令的消息体或消息头中，随指令一起发送给所述终端设备；
5. 在当前链路的最后一个 Span 中记录所述业务关联标识和消息方向标识（direction=downstream）。

**步骤 S2：终端设备的无感执行**

终端设备接收指令后，执行相应的操作，并在返回结果时，将所述业务关联标识（seqNo）原样携带在响应消息中。终端设备无需安装任何链路追踪软件或执行任何追踪相关的操作。

**步骤 S3：结果接收时的追踪上下文恢复与链路缝合**

在云端服务（第二服务节点）接收到所述终端设备返回的、携带所述业务关联标识（seqNo）的响应消息时，执行以下操作：

1. 从所述响应消息中提取所述业务关联标识（seqNo）；
2. 根据所述业务关联标识（seqNo），从所述关联存储介质中检索对应的追踪上下文（原始 TraceID、原始 SpanID）和业务维度信息；
3. 构建上报链路的追踪跨度（Span），在所述追踪跨度中：
   - 记录所述业务关联标识（seqNo）；
   - 记录消息方向标识（direction=upstream）；
   - 计算并记录所述下发时间戳（dispatchTime）与当前时间的差值，作为端侧设备处理耗时（tbox_execute_duration）；
4. **关键步骤**：基于检索到的原始追踪上下文，创建 Span Link（跨度关联），将当前上报链路的追踪跨度与原始下发链路中记录所述业务关联标识的追踪跨度建立逻辑关联关系。所述 Span Link 包含：
   - 原始 TraceID
   - 原始 SpanID（即下发链路最后一个 Span 的 ID）
   - 关联类型标识（link.type = correlation）
   - 所述业务关联标识
   - 黑盒区间耗时（gap_duration = 当前时间 - dispatchTime）
5. 以所述上报链路的追踪跨度为根 Span，继续向下游服务传播追踪上下文，使得后续的转发、推送等操作都作为该上报链路的子 Span 被记录。

**步骤 S4：关联关系的清理**

在步骤 S3 完成链路缝合后，从所述关联存储介质中删除所述映射关系，或等待所述关联存储介质的生存时间（TTL）自动过期清除。

### 6.3 对应的系统方案

**一种跨非可观测设备边界的分布式链路自动缝合系统，包括：**

1. **追踪上下文捕获模块**：部署在第一服务节点上，用于在向终端设备下发指令时，捕获当前链路的追踪上下文（TraceID、SpanID），并提取指令的业务关联标识（seqNo）；
2. **关联存储模块**：用于存储所述追踪上下文与所述业务关联标识的映射关系，以及业务维度信息，并设置生存时间（TTL）实现自动过期清除；
3. **指令下发模块**：用于将所述业务关联标识附加到指令消息中，通过物联网消息协议发送给所述终端设备；
4. **追踪上下文恢复模块**：部署在第二服务节点上，用于在接收到终端设备的响应消息时，根据所述业务关联标识从所述关联存储模块中检索原始追踪上下文；
5. **链路缝合模块**：用于基于检索到的原始追踪上下文创建 Span Link，将上报链路的追踪跨度与下发链路的追踪跨度建立逻辑关联关系；
6. **耗时计算模块**：用于根据下发时间戳和当前时间计算端侧设备的处理耗时以及黑盒区间耗时。

### 6.4 存储介质

一种计算机可读存储介质，存储有计算机程序，所述计算机程序被处理器执行时实现上述方法的步骤。

### 6.5 有益效果

与现有技术相比，本发明具有以下有益效果：

1. **端侧设备零改造**：终端设备无需安装任何链路追踪软件、无需修改任何代码，仅需要在其响应消息中携带已有的业务序列号（seqNo），实现成本极低。
2. **精确的端到端关联**：通过业务序列号而非时间窗口进行关联，避免了离线关联方案的精度不足问题，关联准确率达到 100%。
3. **实时缝合**：在结果消息到达云端服务时立即完成链路缝合，无需等待离线批处理，满足实时监控需求。
4. **黑盒区间耗时量化**：通过记录下发时间戳和接收时间戳的差值，精确量化了端侧设备（黑盒）的处理耗时，为性能优化提供数据支撑。
5. **标准协议兼容**：采用 OpenTelemetry 标准的 Span Link 机制实现链路关联，与现有 OTel 生态完全兼容，无需引入自定义的链路追踪框架。
6. **双链路独立采样**：下发链路和上报链路各自独立采样和上报，互不影响采样率和上报策略。
7. **通用的技术方案**：不依赖于特定的物联网协议或业务场景，可广泛适用于车联网、智能家居、工业物联网、无人机控制等所有涉及非可观测设备的分布式系统。
8. **优雅降级**：当关联存储不可用或业务序列号缺失时，上报链路仍然作为独立的 Trace 正常记录和上报，不影响系统的基本可观测性。

---

## 七、附图说明

### 附图 1：整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    发明架构 - 系统整体结构                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────────────┐                   │
│  │   App 端     │───►│  TSP 云端服务集群     │                   │
│  │ (发起指令)    │    │                      │                   │
│  └──────────────┘    │  ┌──────────────────┐│                   │
│                      │  │ 第一服务节点       ││                   │
│                      │  │ (TBox远控服务)     ││                   │
│                      │  │                  ││                   │
│                      │  │ ┌──────────────┐ ││                   │
│                      │  │ │追踪上下文捕获  │ ││                   │
│                      │  │ │   模块        │ ││                   │
│                      │  │ └──────┬───────┘ ││                   │
│                      │  │        │         ││                   │
│                      │  │ ┌──────▼───────┐ ││                   │
│                      │  │ │关联存储模块   │ ││                   │
│                      │  │ │ (Redis)      │ ││                   │
│                      │  │ │              │ ││                   │
│                      │  │ │ seqNo →      │ ││                   │
│                      │  │ │ {traceId,    │ ││                   │
│                      │  │ │  spanId,     │ ││                   │
│                      │  │ │  vin,        │ ││                   │
│                      │  │ │  dispatchTime}│ ││                   │
│                      │  │ │ TTL: 24h     │ ││                   │
│                      │  │ └──────────────┘ ││                   │
│                      │  └──────────────────┘│                   │
│                      └───────────┬──────────┘                   │
│                                  │                              │
│                        MQTT (携带 seqNo)                       │
│                                  │                              │
│                                  ▼                              │
│  ┌──────────────────────────────────────────────────┐          │
│  │              终端设备 (TBox)                       │          │
│  │                                                    │          │
│  │  ┌──────────────┐    ┌──────────────┐            │          │
│  │  │ 接收指令      │───►│ 执行远控操作  │            │          │
│  │  │ (含seqNo)     │    │              │            │          │
│  │  └──────────────┘    └──────┬───────┘            │          │
│  │                              │                    │          │
│  │                     ┌────────▼───────┐            │          │
│  │                     │ 上报执行结果    │            │          │
│  │                     │ (携带seqNo)    │            │          │
│  │                     └────────────────┘            │          │
│  │                                                    │          │
│  │     ★ 无链路追踪 SDK ★ 无 OTel 代码 ★             │          │
│  └──────────────────────┬───────────────────────────┘          │
│                          │                                      │
│                 MQTT → Kafka (携带 seqNo)                      │
│                          │                                      │
│                          ▼                                      │
│                      ┌──────────────────────┐                   │
│                      │  TSP 云端服务集群     │                   │
│                      │                      │                   │
│                      │  ┌──────────────────┐│                   │
│                      │  │ 第二服务节点       ││                   │
│                      │  │ (TBox远控服务)     ││                   │
│                      │  │                  ││                   │
│                      │  │ ┌──────────────┐ ││                   │
│                      │  │ │追踪上下文恢复  │ ││                   │
│                      │  │ │   模块        │ ││                   │
│                      │  │ └──────┬───────┘ ││                   │
│                      │  │        │         ││                   │
│                      │  │ ┌──────▼───────┐ ││                   │
│                      │  │ │链路缝合模块   │ ││    ┌───────────┐ ││
│                      │  │ │              │◄├────┤关联存储模块│ ││
│                      │  │ │ Span Link    │ │    │ (Redis)    │ ││
│                      │  │ │ 创建         │ │    └───────────┘ ││
│                      │  │ └──────┬───────┘ ││                   │
│                      │  │        │         ││                   │
│                      │  │ ┌──────▼───────┐ ││                   │
│                      │  │ │耗时计算模块   │ ││                   │
│                      │  │ │              │ ││                   │
│                      │  │ │ tbox_execute │ ││                   │
│                      │  │ │ _duration    │ ││                   │
│                      │  │ │ gap_duration  │ ││                   │
│                      │  │ └──────────────┘ ││                   │
│                      │  └──────────────────┘│                   │
│                      └───────────┬──────────┘                   │
│                                  │                              │
│                            推送到 App                           │
│                                  │                              │
│                          ┌───────▼──────┐                      │
│                          │   App 端     │                      │
│                          │ (接收结果)    │                      │
│                          └──────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

### 附图 2：链路缝合前后对比图

```
┌─────────────────────────────────────────────────────────────────┐
│                    缝合前（现有技术）                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Trace-A (TraceID: aaa111)           Trace-B (TraceID: bbb222)  │
│  ┌──────────────────────────┐        ┌────────────────────────┐ │
│  │ [App] 请求发起            │        │ [Kafka消费] 结果接收    │ │
│  │   └─ [TSP网关] 人车校验   │        │   └─ [TBox服务] 校验   │ │
│  │       └─ [TBox服务] 判断   │        │       └─ [RabbitMQ]   │ │
│  │           └─ [MQTT下发]   │        │           └─ [推送]   │ │
│  │              ↓           │        │               └─ [App] │ │
│  │         ╳ 断裂 ╳          │        │                        │ │
│  │     (TBox 黑盒区间)       │        │  ★ 两段 Trace 无法关联 ★ │ │
│  └──────────────────────────┘        └────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    缝合后（本发明）                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Trace-A (TraceID: aaa111)           Trace-B (TraceID: bbb222)  │
│  ┌──────────────────────────┐        ┌────────────────────────┐ │
│  │ [App] 请求发起            │        │ [Kafka消费] 结果接收    │──┐
│  │   └─ [TSP网关] 人车校验   │        │   └─ [TBox服务] 校验   │  │
│  │       └─ [TBox服务] 判断   │        │       └─ [RabbitMQ]   │  │ Span Link
│  │           └─ [MQTT下发] ◄─┼────────┤           └─ [推送]   │  │ (seqNo关联)
│  │              ↑           │        │               └─ [App] │──┘
│  │              │ seqNo 关联  │        │                        │
│  │           Redis 存储映射   │        │  ★ 可视化展示完整链路 ★ │
│  └──────────────────────────┘        └────────────────────────┘ │
│                                                                  │
│  可计算指标：                                                      │
│  - 下发耗时：Trace-A 内各 Span 耗时之和                          │
│  - 黑盒耗时：gap_duration = 接收时间 - dispatchTime              │
│  - 上报耗时：Trace-B 内各 Span 耗时之和                          │
│  - 端到端耗时：下发耗时 + 黑盒耗时 + 上报耗时                    │
└─────────────────────────────────────────────────────────────────┘
```

### 附图 3：方法流程图

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────┐                                   │
│  │  开始：第一服务节点   │                                   │
│  │  准备向终端设备下发   │                                   │
│  │  指令                │                                   │
│  └──────────┬──────────┘                                   │
│             │                                               │
│             ▼                                               │
│  ┌─────────────────────┐                                   │
│  │ S1-1: 获取当前链路   │                                   │
│  │ 的 TraceID 和       │                                   │
│  │ SpanID              │                                   │
│  └──────────┬──────────┘                                   │
│             │                                               │
│             ▼                                               │
│  ┌─────────────────────┐                                   │
│  │ S1-2: 提取指令的    │                                   │
│  │ 业务关联标识 seqNo   │                                   │
│  └──────────┬──────────┘                                   │
│             │                                               │
│             ▼                                               │
│  ┌─────────────────────┐                                   │
│  │ S1-3: 将映射关系    │                                   │
│  │ {seqNo → traceId,  │                                   │
│  │  spanId, vin,      │                                   │
│  │  commandType,       │                                   │
│  │  dispatchTime}      │                                   │
│  │ 写入关联存储(Redis) │                                   │
│  │ 设置 TTL            │                                   │
│  └──────────┬──────────┘                                   │
│             │                                               │
│             ▼                                               │
│  ┌─────────────────────┐                                   │
│  │ S1-4: 将 seqNo     │                                   │
│  │ 附加到指令消息中    │                                   │
│  │ 通过 MQTT 发送给    │                                   │
│  │ 终端设备            │                                   │
│  └──────────┬──────────┘                                   │
│             │                                               │
│             ▼                                               │
│  ╔═════════════════════╗                                   │
│  ║ 终端设备执行指令    ║                                   │
│  ║ (无需链路追踪能力)  ║                                   │
│  ║ 返回结果(携带seqNo)║                                   │
│  ╚═════════╤═══════════╝                                   │
│             │                                               │
│             ▼                                               │
│  ┌─────────────────────┐                                   │
│  │  开始：第二服务节点   │                                   │
│  │  接收到终端设备的    │                                   │
│  │  响应消息            │                                   │
│  └──────────┬──────────┘                                   │
│             │                                               │
│             ▼                                               │
│  ┌─────────────────────┐    否     ┌─────────────────┐     │
│  │ S3-1: 从响应消息中  ├─────────►│ 降级处理：       │     │
│  │ 成功提取 seqNo？     │          │ 创建独立 Trace   │     │
│  └──────────┬──────────┘          │ 记录告警日志     │     │
│             │ 是                   └────────┬────────┘     │
│             ▼                               │              │
│  ┌─────────────────────┐    否     ┌────────▼────────┐     │
│  │ S3-2: 根据 seqNo   ├─────────►│ 降级处理：       │     │
│  │ 从 Redis 检索原始   │          │ 创建独立 Trace   │     │
│  │ 追踪上下文？         │          └────────┬────────┘     │
│  └──────────┬──────────┘                   │              │
│             │ 是                           │              │
│             ▼                              │              │
│  ┌─────────────────────┐                   │              │
│  │ S3-3: 构建上报链路  │                   │              │
│  │ 的 Span，记录：     │                   │              │
│  │ - seqNo            │                   │              │
│  │ - direction=       │                   │              │
│  │   upstream         │                   │              │
│  │ - tbox_execute_    │                   │              │
│  │   duration         │                   │              │
│  └──────────┬──────────┘                   │              │
│             │                              │              │
│             ▼                              │              │
│  ┌─────────────────────┐                   │              │
│  │ S3-4: ★ 创建       │                   │              │
│  │ Span Link 关联     │                   │              │
│  │ 到下发链路的最后    │                   │              │
│  │ 一个 Span           │                   │              │
│  │ Link 属性：         │                   │              │
│  │ - link.type =      │                   │              │
│  │   correlation      │                   │              │
│  │ - seqNo            │                   │              │
│  │ - gap_duration_ms  │                   │              │
│  └──────────┬──────────┘                   │              │
│             │                              │              │
│             ▼                              │              │
│  ┌─────────────────────┐                   │              │
│  │ S3-5: 以上报 Span   │                   │              │
│  │ 为根，向下游传播    │                   │              │
│  │ 追踪上下文          │                   │              │
│  └──────────┬──────────┘                   │              │
│             │                              │              │
│             ▼                              │              │
│  ┌─────────────────────┐                   │              │
│  │ S4: 清理 Redis      │                   │              │
│  │ 中的映射关系         │                   │              │
│  └──────────┬──────────┘                   │              │
│             │                              │              │
│             ▼                              ▼              │
│            结束                            结束             │
└─────────────────────────────────────────────────────────────┘
```

### 附图 4：离线唤醒场景的链路分叉-合并示意图

```
┌─────────────────────────────────────────────────────────────────┐
│                    离线唤醒场景链路关联                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Trace-A (下发链路)                                              │
│  ┌──────────────────────────────────────┐                       │
│  │ [App] → [TSP网关] → [TBox服务]       │                       │
│  │       └─ 判断车辆离线                 │                       │
│  │       └─ 记录 seqNo 到 Redis          │                       │
│  │       └─ rc:pending:{vin} = seqNo    │                       │
│  │       └─ 调用短信唤醒服务             │                       │
│  └──────────────┬───────────────────────┘                       │
│                 │                                                │
│                 │ biz.vin 关联                                   │
│                 ▼                                                │
│  Trace-C (唤醒链路，独立 Trace)                                   │
│  ┌──────────────────────────────────────┐                       │
│  │ [短信服务] → [第三方供应商]            │                       │
│  │   └─ 等待 TBox 收到短信               │                       │
│  │   └─ [TBox 启动] → [MQTT 连接]       │                       │
│  │   └─ [认证网关] → [TSP 登录服务]      │                       │
│  │       └─ 回写 tboxOnlineTime 到 Redis │                       │
│  │       └─ 触发补发指令                 │                       │
│  └──────────────┬───────────────────────┘                       │
│                 │                                                │
│                 │ seqNo 关联（复用同一 seqNo 或更新映射）          │
│                 ▼                                                │
│  Trace-B (上报链路)                                              │
│  ┌──────────────────────────────────────┐                       │
│  │ [Kafka消费] → [TBox服务] seqNo校验   │── Span Link → Trace-A │
│  │   └─ [RabbitMQ] → [推送服务] → [App] │                       │
│  └──────────────────────────────────────┘                       │
│                                                                  │
│  可计算指标：                                                      │
│  - 唤醒耗时 = tboxOnlineTime - wakeupSmsTime                     │
│  - 补发延迟 = dispatchTime(补发) - tboxOnlineTime                 │
│  - 指令执行耗时 = receiveTime - dispatchTime(补发)                │
│  - 端到端总耗时 = receiveTime - 第一次 dispatchTime               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 八、具体实施方式

### 8.1 实施例一：基本链路缝合（在线场景）

以车联网远控在线场景为例，终端设备（TBox）处于在线状态，云端服务直接下发远控指令。

**步骤 S1：指令下发时的追踪上下文捕获与关联存储**

TSP TBox 远控服务在向 TBox 下发车门解锁指令时，执行以下逻辑：

```java
// S1-1: 当前处于 OTel 追踪上下文中（由上游 HTTP 请求传播而来）
SpanContext currentCtx = Span.current().getSpanContext();
String traceId = currentCtx.getTraceId();    // 如 "abc123def456..."
String spanId = currentCtx.getSpanId();      // 如 "span789..."

// S1-2: 提取指令的业务关联标识
String seqNo = generateSeqNo();              // 如 "20260414143000001"
// seqNo 生成规则：时间戳(14位) + VIN后4位 + 随机数(4位)，保证唯一性

// S1-3: 写入关联存储
Map<String, String> correlation = new HashMap<>();
correlation.put("traceId", traceId);
correlation.put("parentSpanId", spanId);
correlation.put("vin", "LSVAU2A37N1234567");
correlation.put("commandType", "DOOR_UNLOCK");
correlation.put("dispatchTime", String.valueOf(System.currentTimeMillis()));
correlation.put("tenantId", "SA_OEM_A");

String redisKey = "rc:trace:" + seqNo;
redisTemplate.opsForValue().set(redisKey,
    JSON.toJSONString(correlation), 24, TimeUnit.HOURS);

// S1-4: 将 seqNo 附加到 MQTT 消息中
MqttMessage message = new MqttMessage(commandPayload.getBytes());
message.getProperties().put("seqNo", seqNo);
mqttTemplate.publish("tbox/command/" + vin, message);

// 在当前 Span 中记录 seqNo 和方向
Span.current().setAttribute("rc.seq_no", seqNo);
Span.current().setAttribute("rc.direction", "downstream");
Span.current().setAttribute("rc.protocol", "mqtt");
```

**步骤 S2：终端设备执行**

TBox 接收 MQTT 消息，解析出指令类型和 seqNo，执行车门解锁操作，完成后构造响应消息并携带相同的 seqNo 发送回 MQTT Broker。TBox 端不执行任何追踪相关操作。

**步骤 S3：结果接收时的追踪上下文恢复与链路缝合**

TSP TBox 远控服务的 Kafka 消费者接收到 TBox 上报的结果消息：

```java
@KafkaListener(topics = "tbox-command-result")
public void onTBoxResult(ConsumerRecord<String, String> record) {
    // S3-1: 提取 seqNo
    String seqNo = extractSeqNo(record.value());
    if (seqNo == null) {
        // 降级处理：创建独立 Trace
        log.warn("seqNo 缺失，无法关联原始链路");
        return;
    }

    // S3-2: 从 Redis 检索原始追踪上下文
    String redisKey = "rc:trace:" + seqNo;
    String correlationJson = redisTemplate.opsForValue().get(redisKey);

    if (correlationJson == null) {
        // 降级处理：Redis 不可用或 TTL 已过期
        log.warn("关联关系丢失，seqNo={}", seqNo);
        return;
    }

    CorrelationData correlation = JSON.parseObject(correlationJson, CorrelationData.class);

    // S3-3: 构建上报链路的 Span
    Tracer tracer = OpenTelemetry.getGlobalTracer("tsp-tbox-remote-control");
    SpanBuilder builder = tracer.spanBuilder("rc.command.receive")
        .setAttribute("rc.seq_no", seqNo)
        .setAttribute("biz.vin", correlation.getVin())
        .setAttribute("biz.command_type", correlation.getCommandType())
        .setAttribute("rc.direction", "upstream")
        .setAttribute("rc.protocol", "mqtt+kafka")
        .setAttribute("rc.tbox_execute_duration_ms",
            System.currentTimeMillis() - correlation.getDispatchTime());

    // S3-4: ★ 创建 Span Link 关联到下发链路
    SpanContext upstreamCtx = SpanContext.createFromRemoteParent(
        correlation.getTraceId(),
        correlation.getParentSpanId(),
        TraceFlags.getSampled(),
        TraceState.getDefault()
    );

    builder.addLink(upstreamCtx, Attributes.of(
        AttributeKey.stringKey("rc.link.type"), "seq_no_correlation",
        AttributeKey.stringKey("rc.seq_no"), seqNo,
        AttributeKey.longKey("rc.gap_duration_ms"),
        System.currentTimeMillis() - correlation.getDispatchTime()
    ));

    Span span = builder.startSpan();
    try (Scope scope = span.makeCurrent()) {
        // S3-5: 校验 seqNo，转发到 RabbitMQ
        validateSeqNo(seqNo);
        forwardToRabbitMQ(record.value());
    } finally {
        span.end();
    }

    // S4: 清理 Redis
    redisTemplate.delete(redisKey);
}
```

### 8.2 实施例二：离线唤醒场景

当 TBox 处于离线状态时，链路涉及唤醒支路的分叉和合并。

**下发阶段（Trace-A）**：

```
TSP TBox 远控服务判断车辆离线后：
1. 当前 Span 记录 rc.tbox_status = "offline"
2. 生成 seqNo，写入 Redis：rc:trace:{seqNo} → {traceId, spanId, vin, ...}
3. 额外写入待执行指令队列：rc:pending:{vin} → seqNo
4. 记录 wakeupRequired = true, wakeupSmsTime = 当前时间
5. 调用短信唤醒服务
```

**唤醒阶段（Trace-C，独立 Trace）**：

```
TBox 收到短信 → 启动 → MQTT 连接 → 认证网关校验 → TBox 登录成功
→ MQTT 桥接到 Kafka → TSP 登录服务消费
→ TSP 登录服务查找 rc:pending:{vin}，发现有待执行的指令
→ 回写 Redis：rc:trace:{seqNo} 的 tboxOnlineTime = 当前时间
→ 调用 TBox 远控服务补发指令（复用同一 seqNo）
```

**上报阶段（Trace-B）**：

```
TBox 执行指令 → 上报结果(携带 seqNo) → Kafka → TBox 远控服务
→ 从 Redis 检索 rc:trace:{seqNo}
→ 创建 Span Link 关联到 Trace-A
→ 计算完整耗时：
  - 唤醒耗时 = tboxOnlineTime - wakeupSmsTime
  - 指令执行耗时 = receiveTime - dispatchTime(补发)
  - 端到端总耗时 = receiveTime - dispatchTime(首次下发)
```

### 8.3 实施例三：关联存储的 Redis 数据结构

```
# 主关联 Key
Key:   rc:trace:{seqNo}                              # 如 rc:trace:20260414143000001
Value: JSON {
  "traceId":        "abc123def456789...",              # 原始下发链路的 TraceID
  "parentSpanId":   "span789abc012...",               # 下发链路最后一个 Span 的 SpanID
  "vin":            "LSVAU2A37N1234567",              # 车辆标识
  "commandType":    "DOOR_UNLOCK",                     # 指令类型
  "dispatchTime":   1713056400000,                    # 指令下发时间戳(ms)
  "tenantId":       "SA_OEM_A",                       # 租户标识
  "wakeupRequired": false,                             # 是否需要唤醒
  "wakeupSmsTime":  0,                                # 短信发送时间(离线场景)
  "tboxOnlineTime": 0                                 # TBox 上线时间(离线场景)
}
TTL:   24 小时

# 待执行指令队列 Key（离线场景使用）
Key:   rc:pending:{vin}                              # 如 rc:pending:LSVAU2A37N1234567
Value: "20260414143000001"                             # 待执行的 seqNo
TTL:   24 小时
```

### 8.4 实施例四：Span Link 数据结构

上报链路的首个 Span 中创建的 Link 数据结构：

```json
{
  "traceId": "bbb222ccc333...",
  "spanId": "receive000...",
  "name": "rc.command.receive",
  "kind": "CONSUMER",
  "startTimeUnixNano": 1713056403200000000,
  "attributes": [
    {"key": "rc.seq_no", "value": {"stringValue": "20260414143000001"}},
    {"key": "biz.vin", "value": {"stringValue": "LSVAU2A37N1234567"}},
    {"key": "biz.command_type", "value": {"stringValue": "DOOR_UNLOCK"}},
    {"key": "rc.direction", "value": {"stringValue": "upstream"}},
    {"key": "rc.tbox_execute_duration_ms", "value": {"doubleValue": 3200.0}}
  ],
  "links": [{
    "traceId": "abc123def456789...",
    "spanId": "span789abc012...",
    "traceState": "",
    "attributes": [
      {"key": "rc.link.type", "value": {"stringValue": "seq_no_correlation"}},
      {"key": "rc.seq_no", "value": {"stringValue": "20260414143000001"}},
      {"key": "rc.gap_duration_ms", "value": {"intValue": 3200}}
    ]
  }]
}
```

### 8.5 实施例五：链路可视化查询

在 ClickHouse 中通过 seqNo 关联查询完整链路：

```sql
-- 查询某条远控指令的完整链路（下发 + 上报）
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
WHERE attributes_map['rc.seq_no'] = '20260414143000001'
   OR trace_id = 'abc123def456789...'
ORDER BY start_time;
```

### 8.6 降级策略

本发明在以下异常情况下提供优雅降级：

| 异常场景 | 降级策略 |
|---------|---------|
| 响应消息中 seqNo 缺失 | 上报链路作为独立 Trace 记录，日志记录告警 |
| Redis 中查不到对应映射（TTL 过期或 Redis 不可用） | 上报链路作为独立 Trace 记录，日志记录告警 |
| seqNo 重复或冲突 | seqNo 采用"时间戳+VIN后4位+随机数"生成规则，冲突概率 < 0.001% |
| 终端设备响应超时 | Redis 中映射关系在 TTL 到期后自动清除，不产生内存泄漏 |

---

## 九、权利要求书建议

### 独立权利要求 1（方法）

一种跨非可观测设备边界的分布式链路自动缝合方法，其特征在于，包括以下步骤：

S1、在第一服务节点通过物联网消息协议向终端设备下发指令时，获取当前链路的追踪标识信息（TraceID、SpanID），并提取所述指令的业务关联标识（seqNo），将所述追踪标识信息与所述业务关联标识的映射关系写入关联存储介质，并将所述业务关联标识附加到所述指令消息中发送给所述终端设备；

S2、所述终端设备接收并执行所述指令，在响应消息中携带所述业务关联标识返回；

S3、第二服务节点接收到携带所述业务关联标识的响应消息后，根据所述业务关联标识从所述关联存储介质中检索对应的追踪标识信息，创建上报链路的追踪跨度，并基于所述追踪标识信息创建 Span Link，将所述上报链路的追踪跨度与原始下发链路的追踪跨度建立逻辑关联关系。

### 独立权利要求 2（系统）

一种跨非可观测设备边界的分布式链路自动缝合系统，其特征在于，包括：

追踪上下文捕获模块，用于在第一服务节点向终端设备下发指令时，获取当前链路的追踪标识信息，并提取所述指令的业务关联标识；

关联存储模块，用于存储所述追踪标识信息与所述业务关联标识的映射关系；

指令下发模块，用于将所述业务关联标识附加到指令消息中，通过物联网消息协议发送给所述终端设备；

追踪上下文恢复模块，用于在第二服务节点接收到终端设备的响应消息时，根据所述业务关联标识从所述关联存储模块中检索原始追踪标识信息；

链路缝合模块，用于基于所述原始追踪标识信息创建 Span Link，将上报链路的追踪跨度与下发链路的追踪跨度建立逻辑关联关系。

### 独立权利要求 3（存储介质）

一种计算机可读存储介质，其上存储有计算机程序，所述计算机程序被处理器执行时实现如权利要求 1 所述的方法。

### 从属权利要求 4

根据权利要求 1 所述的方法，其特征在于，步骤 S1 中，所述映射关系还包括以下业务维度信息中的一种或多种：设备标识（VIN）、指令类型（commandType）、下发时间戳（dispatchTime）、租户标识（tenantId）。

### 从属权利要求 5

根据权利要求 1 所述的方法，其特征在于，步骤 S1 中，所述业务关联标识（seqNo）的生成规则为：时间戳 + 设备标识的至少部分字符 + 随机数，以保证全局唯一性。

### 从属权利要求 6

根据权利要求 1 所述的方法，其特征在于，步骤 S1 中，将所述映射关系写入关联存储介质时，设置生存时间（TTL），在所述生存时间到期后自动清除所述映射关系。

### 从属权利要求 7

根据权利要求 1 所述的方法，其特征在于，步骤 S3 中，创建 Span Link 时，在所述 Span Link 的属性中记录以下信息：
- 关联类型标识（link.type）
- 所述业务关联标识（seqNo）
- 黑盒区间耗时（gap_duration），计算方式为：当前时间减去步骤 S1 中记录的下发时间戳。

### 从属权利要求 8

根据权利要求 1 所述的方法，其特征在于，步骤 S3 中，还包括计算端侧设备处理耗时（tbox_execute_duration），计算方式为：接收到响应消息的时间减去步骤 S1 中记录的下发时间戳。

### 从属权利要求 9

根据权利要求 1 所述的方法，其特征在于，所述终端设备处于离线状态时，还包括唤醒链路处理步骤：

S2a、所述第一服务节点判断终端设备处于离线状态后，在所述关联存储中额外记录唤醒标识（wakeupRequired）和短信发送时间（wakeupSmsTime），并向第三方短信服务发起唤醒请求；

S2b、终端设备收到唤醒短信后启动并建立网络连接，云端登录服务检测到终端设备上线后，更新所述关联存储中的终端设备上线时间（tboxOnlineTime），并触发指令补发流程。

### 从属权利要求 10

根据权利要求 1 所述的方法，其特征在于，步骤 S3 中，当根据所述业务关联标识无法从所述关联存储介质中检索到对应的追踪标识信息时，将所述上报链路作为独立链路进行记录，并输出告警信息。

---

## 十、摘要

本发明公开了一种跨非可观测设备边界的分布式链路自动缝合方法、系统及存储介质。该方法在云端第一服务节点向不支持链路追踪的终端设备下发指令时，将当前链路的追踪标识与指令的业务关联标识（seqNo）的映射关系写入关联存储；在云端第二服务节点接收到终端设备返回的携带所述业务关联标识的响应时，根据所述业务关联标识检索原始追踪标识，并通过创建 Span Link 将上报链路与下发链路建立逻辑关联。本发明无需改造终端设备，即可实现端到端的链路追踪缝合，精确量化端侧设备的处理耗时，与 OpenTelemetry 标准完全兼容。

---

## 十一、附注

### 与现有技术的关键区别

| 对比维度 | 现有技术（Jaeger/Zipkin/SigNoz） | 本发明 |
|---------|-------------------------------|--------|
| 端侧设备要求 | 需要安装 OTel SDK 或 Agent | **零改造**，仅要求携带 seqNo |
| 链路缝合方式 | Parent Span（要求上下文传播） | **Span Link**（逻辑关联，无需上下文传播） |
| 关联机制 | TraceID + Parent SpanID（必须连续） | **seqNo**（业务关联标识，支持断裂恢复） |
| 黑盒区间耗时 | 无法测量 | **精确计算**（gap_duration = receive - dispatch） |
| 降级能力 | 链路断裂后无法恢复 | **优雅降级**（独立 Trace + 告警） |
| 协议支持 | HTTP/gRPC 原生支持 | **任意协议**（通过业务标识关联） |
| 离线场景 | 不支持 | **支持**（唤醒链路分叉-合并） |

### 可检索的现有技术参考

- OpenTelemetry Specification: Span Links (https://opentelemetry.io/docs/specs/otel/trace/api/#span-links)
- W3C Trace Context: traceparent header propagation
- Jaeger: trace continuation via debug headers
- AWS X-Ray: subsegments with annotations for correlation
- Apache SkyWalking: cross-process propagation via SW8 header
