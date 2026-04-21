# 双 Agent 并行运行方案分析

> 版本：v1.0 | 日期：2026-04-15

---

## 一、方案概览

### 背景

当前 TSP 各 Java 服务已接入了**华为云 APM Agent**（基于 Apache SkyWalking），负责全量应用性能监控。现需引入 **OpenTelemetry Agent** 支撑自研远控监控看板，在远控方案验证充分前，不希望舍弃华为云 APM。

两种 Agent 共存的 JVM 启动方式：

```bash
java \
  -javaagent:/opt/huawei-apm/huawei-apm-java-agent.jar \
  -javaagent:/opt/otel/opentelemetry-javaagent.jar \
  -Dotel.service.name=tsp-remote-control-gateway \
  -Dotel.traces.exporter=otlp \
  -Dotel.exporter.otlp.endpoint=http://otel-collector:4317 \
  -jar your-app.jar
```

---

## 二、双 Agent 并行 — 优势与劣势

### 2.1 优势

| # | 优势 | 说明 |
|---|------|------|
| 1 | **零风险过渡** | 华为 APM 继续提供完整的监控能力，自研方案验证期间不影响线上可观测性 |
| 2 | **灰度验证** | 可以在部分服务或部分流量上启用 OTel，逐步验证数据准确性，再全量切换 |
| 3 | **功能互补** | 华为 APM 擅长 JVM/DB/HTTP 通用监控，OTel 擅长远控业务级指标，各取所长 |
| 4 | **平滑迁移** | 验证通过后，逐个服务移除华为 APM Agent，无需一次性切换 |
| 5 | **数据对比** | 同一请求同时有两套 Trace 数据，可以交叉验证自研方案的准确性 |
| 6 | **回退容易** | 如果自研方案发现问题，直接去掉 OTel Agent 参数即可回退，无代码改动 |

### 2.2 劣势

| # | 劣势 | 说明 | 缓解措施 |
|---|------|------|---------|
| 1 | **字节码冲突风险** | 两个 Agent 都用 ByteBuddy 增强 JVM 类，可能对同一个类产生冲突 | 实测大部分场景兼容；有冲突时针对性关闭 OTel 的某个 instrumentation |
| 2 | **性能开销增加** | 每次调用被两层 wrapper 包裹，额外增加 ~2-4μs 耗时 + 双倍 Span 对象分配 | 远控场景 QPS 通常不高（千级），开销 < 1%；监控 GC 和上报积压 |
| 3 | **内存占用增加** | 双份 Span 对象 + 两套上报缓冲队列占用更多堆内存 | 调大 JVM 堆内存（-Xmx），或限制 OTel 上报队列大小 |
| 4 | **两套 Header 同时传播** | 请求中同时带 `sw8`（华为）和 `traceparent`（OTel），增加 HTTP Header 体积 | Header 体积增加约 100 字节，对性能几乎无影响 |
| 5 | **ThreadLocal 双份存储** | 华为 APM 和 OTel 各自维护 ThreadLocal 上下文，但互不干扰 | 已验证：不同 ThreadLocal 实例按引用隔离，不存在互相覆盖问题 |
| 6 | **运维复杂度** | 需要同时维护两套 Agent 的版本、配置、监控 | 通过容器化镜像固化 Agent 版本，减少运维负担 |
| 7 | **日志量增加** | OTel Agent 自身的 INFO/WARN 日志增加日志量 | 调整 OTel Agent 日志级别：`-Dotel.javaagent.logging=warn` |
| 8 | **上线/排障复杂度** | 出现问题时需要判断是哪个 Agent 导致的 | 逐个排查：先移除 OTel Agent 验证，再移除华为 APM Agent 验证 |

### 2.3 风险等级评估

| 风险项 | 概率 | 影响 | 严重程度 |
|--------|:----:|------|:--------:|
| 字节码冲突导致启动失败 | 低 | 服务无法启动 | **高**（但容易发现） |
| 字节码冲突导致运行时异常 | 中 | 特定接口调用失败 | **中**（偶发，难排查） |
| GC 压力增大导致 STW | 低 | 毛刺延迟增加 | **低** |
| OTel 上报积压导致 Span 丢失 | 中 | 看板数据不完整 | **中** |
| Kafka 消费延迟增加 | 低 | TBox 上报延迟增加几毫秒 | **低** |

---

## 三、华为 APM 为主 + OTel Agent 为辅 — 优势与劣势

### 3.1 方案定义

```
┌─────────────────────────────────────────────────────────────────┐
│                    华为主 + OTel 为辅 架构                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  华为云 APM Agent（主力）                                         │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  ✓ HTTP Server 自动增强 (Tomcat/Spring MVC)           │       │
│  │  ✓ HTTP Client 自动增强 (OkHttp/Apache HttpClient)    │       │
│  │  ✓ MySQL/JDBC 自动增强                                │       │
│  │  ✓ Redis 自动增强                                    │       │
│  │  ✓ Kafka Producer/Consumer 自动增强                    │       │
│  │  ✓ JVM 指标自动采集                                 │       │
│  │  ✓ 告警规则引擎                                     │       │
│  │  ✓ APM 看板（已有）                                │       │
│  │                                                       │       │
│  │  数据上报: 华为云 APM 后端                           │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  OTel Agent（辅助）                                               │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  △ 关闭大部分自动增强（避免与华为 APM 冲突）           │       │
│  │                                                       │       │
│  │  ✓ 仅保留手动埋点 API 能力                           │       │
│  │  ✓ 在关键业务方法中手动创建 Span                     │       │
│  │  ✓ 注入远控业务属性 (biz.vin, rc.seq_no 等)         │       │
│  │  ✓ 手动 Redis 关联 + 链路缝合                       │       │
│  │                                                       │       │
│  │  ✗ 不依赖 Agent 自动增强                              │       │
│  │  ✗ 不负责通用组件监控                                │       │
│  │                                                       │       │
│  │  数据上报: OTel Collector → ClickHouse                │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  JVM 启动参数（关键配置）:                                      │
│  -javaagent:/opt/huawei-apm/huawei-apm-java-agent.jar         │
│  -javaagent:/opt/otel/opentelemetry-javaagent.jar               │
│  -Dotel.instrumentation.jdbc.enabled=false                     │
│  -Dotel.instrumentation.redis-lettuce.enabled=false            │
│  -Dotel.instrumentation.redis-jedis.enabled=false             │
│  -Dotel.instrumentation.kafka.enabled=false                     │
│  -Dotel.instrumentation.spring-webmvc.enabled=false           │
│  -Dotel.instrumentation.servlet.enabled=false                  │
│  -Dotel.instrumentation.http-client.enabled=false              │
│  -Dotel.instrumentation.tomcat.enabled=false                    │
│  -Dotel.service.name=tsp-remote-control-gateway              │
│  -Dotel.traces.exporter=otlp                                │
│  -Dotel.exporter.otlp.endpoint=http://otel-collector:4317     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**核心思路**：华为 APM 负责全量通用监控（自动增强），OTel Agent 只当手动埋点 API 容器使用（关闭自动增强），两者各管各的，最大限度避免冲突。

### 3.2 优势

| # | 优势 | 说明 |
|---|------|------|
| 1 | **冲突风险极低** | OTel 关闭所有自动增强，只保留手动 API，与华为 APM 几乎零重叠 |
| 2 | **业务代码不变** | 手动埋点方式与华为 APM 完全独立，不互相干扰 |
| 3 | **华为 APM 能力完整保留** | HTTP/DB/Kafka/Redis/JVM 全量监控不受影响 |
| 4 | **OTel 职责单一** | OTel 只负责远控业务 Span 的上报到 ClickHouse，职责清晰 |
| 5 | **灵活切换** | 未来想去掉 OTel，删掉 `-javaagent` 参数即可 |
| 6 | **告警体系不变** | 华为 APM 的告警规则继续生效，不需要迁移 |
| 7 | **上线简单** | 先在华为 APM 稳定的环境上额外加 OTel，不影响已有功能 |
| 8 | **排障容易** | OTel 出问题时，去掉 OTel Agent 参数重启即可恢复；反过来也一样 |

### 3.3 劣势

| # | 劣势 | 说明 | 缓解措施 |
|---|------|------|---------|
| 1 | **无法利用 OTel 自动增强** | 关闭了 OTel 自动增强，MySQL/Redis/Kafka 的 Span 需要手动创建或缺失 | 远控监控看板主要看业务 Span（下发/上报），不依赖组件级 Span |
| 2 | **自研看板缺少组件级拓扑** | ClickHouse 中没有 Redis/MySQL 的 Span 数据，拓扑图看不到中间件节点 | 未来全量切换 OTel 后自动获得；或通过华为 APM 的拓扑图补充 |
| 3 | **两套 Agent 的启动开销** | 即使 OTel 关闭了自动增强，Agent 加载时仍有类扫描和字节码检查开销 | 约 1-3 秒启动延迟，可接受 |
| 4 | **无法验证 OTel 自动增强能力** | 关闭自动增强意味着无法提前验证 OTel 对组件的支持程度 | 全量切换前，在测试环境开启 OTel 自动增强验证 |
| 5 | **手动埋点有遗漏风险** | 如果开发者忘记在某个关键方法中创建 Span，该节点就不会被记录 | 建立 Coding 规范 + Code Review 检查 |
| 6 | **两套监控体系长期并存** | 需要同时维护两套 Agent 配置，增加运维成本 | 制定明确的切换时间线和计划 |

### 3.4 适用场景

**推荐使用"华为为主 + OTel 为辅"的场景：**

- 自研方案处于早期验证阶段（1-3 个月）
- 线上环境稳定运行，不能冒大的风险
- 团队对 OTel 自动增强能力尚未充分验证
- 需要保留华为 APM 的告警、拓扑、JVM 监控能力
- 远控监控看板只需要业务级 Span（下发/上报），不需要组件级 Span

---

## 四、最终建议

### 推荐策略：分阶段渐进式切换

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        分阶段切换路线图                                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  阶段 1：当前（华为 APM 为主 + OTel 为辅）                               │
│  ════════════════════════════════════════════════                        │
│  │  华为 APM: 全量自动增强 + 告警 + 看板                               │
│  │  OTel Agent: 关闭自动增强，仅手动埋点远控业务 Span                    │
│  │  数据: 华为云 APM (实时) + ClickHouse (远控业务)                       │
│  │  风险: ★☆☆ (极低)                                                  │
│  └───────────────────────────────────────────────────────────────────────┘
│       │                                                                    │
│       │  验证 1-3 个月，确认远控看板数据准确、稳定性可接受                    │
│       ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────┐
│  阶段 2：逐步开启 OTel 自动增强（灰度）                                  │
│  ════════════════════════════════════════════════                        │
│  │  华为 APM: 保持不变                                                   │
│  │  OTel Agent: 逐个开启组件的自动增强                                 │
│  │    第 1 周: 开启 spring-webmvc (HTTP 入口)                           │
│  │    第 2 周: 开启 http-client (HTTP 出口)                            │
│  │    第 3 周: 开启 kafka (Kafka 生产/消费)                           │
│  │    第 4 周: 观察是否有冲突，如有则回退                                │
│  │  数据: 华为云 APM + ClickHouse (全量 Span)                             │
│  │  风险: ★★☆ (低)                                                    │
│  └───────────────────────────────────────────────────────────────────────┘
│       │                                                                    │
│       │  灰度 1-2 个月，确认双 Agent 并行稳定                               │
│       ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────┐
│  阶段 3：全量切换到 OTel（最终目标）                                      │
│  ════════════════════════════════════════════════                        │
│  │  华为 APM: 移除 -javaagent 参数                                         │
│  │  OTel Agent: 全量自动增强 + 手动埋点 + 告警                          │
│  │  数据: ClickHouse (全量) + 自研告警体系                               │
│  │  风险: ★★★ (需充分验证)                                                │
│  └──────────────────────────────────────────────────────────────────────┘
│                                                                            │
╚════════════════════════════════════════════════════════════════════════════╝
```

### 阶段 1 的 OTel Agent 启动参数（推荐）

```bash
java \
  -javaagent:/opt/huawei-apm/huawei-apm-java-agent.jar \
  -javaagent:/opt/otel/opentelemetry-javaagent.jar \
  -Dotel.service.name=tsp-remote-control-gateway \
  -Dotel.traces.exporter=otlp \
  -Dotel.exporter.otlp.endpoint=http://otel-collector:4317 \
  -Dotel.instrumentation.jdbc.enabled=false \
  -Dotel.instrumentation.redis-lettuce.enabled=false \
  -Dotel.instrumentation.redis-jedis.enabled=false \
  -Dotel.instrumentation.mongo.enabled=false \
  -Dotel.instrumentation.elasticsearch.enabled=false \
  -Dotel.instrumentation.kafka.enabled=false \
  -Dotel.instrumentation.rabbitmq.enabled=false \
  -Dotel.instrumentation.spring-webmvc.enabled=false \
  -Dotel.instrumentation.spring-webflux.enabled=false \
  -Dotel.instrumentation.servlet.enabled=false \
  -Dotel.instrumentation.tomcat.enabled=false \
  -Dotel.instrumentation.undertow.enabled=false \
  -Dotel.instrumentation.jetty.enabled=false \
  -Dotel.instrumentation.netty.enabled=false \
  -Dotel.instrumentation.http-client.enabled=false \
  -Dotel.instrumentation.okhttp.enabled=false \
  -Dotel.instrumentation.apache-httpclient.enabled=false \
  -Dotel.instrumentation.grpc.enabled=false \
  -Dotel.instrumentation.spring-scheduling.enabled=false \
  -Dotel.javaagent.debug=false \
  -Dotel.javaagent.logging=warn \
  -jar your-app.jar
```

---

## 五、总结

| 维度 | 双 Agent 并行（全量） | 华为为主 + OTel 为辅（推荐） |
|------|:---------------:|:----------------------:|
| 冲突风险 | 低-中 | **极低** |
| 性能开销 | 略高（< 1%） | **极低**（仅手动 Span） |
| OTel 自动增强 | ✅ 全量 | ❌ 关闭 |
| 组件级 Span | ✅ 有 | ❌ 无 |
| 业务级 Span | ✅ 有 | ✅ 有 |
| 告警/拓扑 | 两套并行 | 华为 APM 主力 |
| 切换成本 | 低（去掉参数即可） | 低（去掉参数即可） |
| 适用阶段 | 中期 | **初期** |
| **推荐度** | ★★★ | **★★★（当前推荐）** |
