# 远控链路缝合 — Agent 自动增强方案

> 版本：v1.0 | 日期：2026-04-15
> 与 [remote-control-trace-stitching-modification.md](remote-control-trace-stitching-modification.md)（手动埋点方案）对比

---

## 一、两种方案对比

| 对比项 | 方案 A：手动埋点（之前方案） | 方案 B：Agent 自动增强（本方案） |
|--------|:-------------------------:|:-----------------------------:|
| Span 创建 | 代码中 `tracer.spanBuilder().startSpan()` | Agent 自动创建，无需写代码 |
| 业务属性 | 代码中 `span.setAttribute()` | 需通过 Interceptor/Filter 注入 |
| Span 命名 | 自定义名称（如 `rc.command.dispatch`） | 库方法名（如 `mqtt.publish`、`kafka.consume`） |
| Redis 关联 | 在 Span 代码中调用 | 在 Interceptor 中调用 |
| 链路缝合 | 在 Span 代码中 `setParent + addLink` | 在 Interceptor 中 `setParent + addLink` |
| 代码侵入性 | 中（每个埋点都改业务代码） | **低**（Interceptor 和业务代码解耦） |
| Span 粒度 | 精细（可以只记录关键节点） | **更细**（所有 HTTP/Kafka/MQTT 调用都有 Span） |
| 维护成本 | 高（业务代码改动多） | **低**（Interceptor 集中管理） |
| 灵活性 | 高（可以精确控制 Span 位置） | 中（依赖 Agent 支持的库） |

---

## 二、整体架构图

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                    Agent 自动增强方案 — 整体架构                                     ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  ┌──────┐  HTTP    ┌──────────────────┐  HTTP   ┌──────────────────┐          ║
║  │      │────────►│  TSP 远控网关服务  │────────►│ TSP TBox 远控服务  │          ║
║  │ App  │         │                  │         │                  │          ║
║  └──────┘         │  OTel Agent 自动  │         │  OTel Agent 自动  │          ║
║     ▲              │  创建 HTTP Span   │         │  创建 HTTP Span   │          ║
║     │              │                  │         │                  │          ║
║     │              │  ①Filter 注入:   │         │  ③Interceptor 注入:│          ║
║     │              │    biz.vin        │         │    biz.vin         │          ║
║     │              │    biz.command_type│         │    rc.seq_no      │          ║
║     │              └──────────────────┘         │    写 Redis 关联   │          ║
║     │                                       │                  │          ║
║     │              ┌──────────────────┐      │  ④Interceptor 链路缝合│          ║
║     │              │  TSP 推送服务      │      │    setParent       │          ║
║     │              │  OTel Agent 自动  │      │    addLink         │          ║
║     │              │  创建 MQ Span     │      │                  │          ║
║     │              │                  │      │                  │          ║
║     │              │  ②Filter 注入:   │      │                  │          ║
║     │              │    rc.seq_no      │      │                  │          ║
║     │              └──────────────────┘      │                  │          ║
║     │                                       │                  │          ║
║     │              ┌──────────────────┐      │                  │          ║
║     │              │  TSP 登录服务      │      │                  │          ║
║     │              │  OTel Agent 自动  │      │                  │          ║
║     │              │  创建 Kafka Span  │      │                  │          ║
║     │              │                  │      │                  │          ║
║     │              │  ⑤Interceptor:    │      │                  │          ║
║     │              │    回写 tboxOnline │      │                  │          ║
║     │              └──────────────────┘      │                  │          ║
║     │                                       │                  │          ║
║     │              ┌──────────────────┐      │                  │          ║
║     │              │  MQTT Broker      │◄─────┘                  │          ║
║     │              │  (认证网关)        │                          │          ║
║     │              └────────┬─────────┘                          │          ║
║     │                       │                                    │          ║
║     │              ┌────────┴─────────┐                        │          ║
║     │              │  TBox (不改造)    │                        │          ║
║     │              └──────────────────┘                        │          ║
║     │                                                            ║
╠═════╪══════════════════════════════════════════════════════════╪════════╣
║     │              OTel Agent 自动增强的 Span（无需手动代码）            │          ║
╠═════╪══════════════════════════════════════════════════════════╪════════╣
║     │                                                            ║
║     │   HTTP Server (Tomcat/Spring MVC)                          │          ║
║     │     └─ App请求 → 网关接收        Span: "GET /api/rc/command"  │          ║
║     │     └─ 网关 → TBox服务          Span: "POST /api/tbox/dispatch"│          ║
║     │     └─ 推送 → App              Span: "POST /api/push/result"   │          ║
║     │                                                            ║
║     │   Kafka Producer                                            │          ║
║     │     └─ 下发到 Kafka Topic       Span: "kafka.produce"       │          ║
║     │     └─ 消费 Kafka Topic         Span: "kafka.consume"       │          ║
║     │                                                            ║
║     │   MQTT (Eclipse Paho / HiveMQ)                            │          ║
║     │     └─ 发布到 MQTT Topic        Span: "mqtt.publish"        │          ║
║     │     └─ 订阅 MQTT Topic          Span: "mqtt.subscribe"      │          ║
║     │                                                            ║
║     │   MySQL/JDBC                                               │          ║
║     │     └─ SQL 查询                Span: "SELECT tsp_commands"   │          ║
║     │                                                            ║
║     │   Redis                                                   │          ║
║     │     └─ Redis 操作              Span: "redis.GET" / "SET"   │          ║
║     │                                                            ║
║     │   RabbitMQ                                                │          ║
║     │     └─ 发布消息                Span: "rabbitmq.publish"     │          ║
║     │     └─ 消费消息                Span: "rabbitmq.consume"     │          ║
║     │                                                            ║
║     │   ★ 以上全部自动创建，无需写任何 Span 代码                    │          ║
║     │                                                            ║
╚═════╧══════════════════════════════════════════════════════════════════╝
```

---

## 三、与手动埋点方案的改造点差异

### 不变的部分

| 内容 | 说明 |
|------|------|
| Redis 依赖 | 仍需引入 `spring-boot-starter-data-redis` |
| Redis 关联逻辑 | `RcTraceCorrelationService` 仍然需要（存储/查询/清理 seqNo 映射） |
| CorrelationData DTO | 不变 |
| OTel API 依赖 | 仍需 `opentelemetry-api` + `opentelemetry-context`（用于 Interceptor 中操作 Span） |
| ClickHouse 存储 | 不变（seqNo 自动随 Span attributes 写入 `attributes_map`） |
| Gateway 查询 API | 不变 |
| 前端拓扑/搜索 | 不变 |
| JVM 启动参数 | 不变（`-javaagent` 参数相同） |

### 变化的部分

| 改造点 | 手动埋点方案 | Agent 自动增强方案 |
|--------|-----------|-----------------|
| **网关服务** | 在每个方法中手动创建 Span + setAttribute | **不需要改业务代码**，新增一个 Filter 注入业务属性 |
| **TBox 服务 — 下发** | 手动创建 `rc.command.dispatch` Span + 写 Redis | **不需要改业务代码**，新增一个 Interceptor 拦截 MQTT publish 注入属性 + 写 Redis |
| **TBox 服务 — 上报** | 手动创建 `rc.command.receive` Span + setParent + addLink | **不需要改业务代码**，新增一个 Interceptor 拦截 Kafka consume 执行链路缝合 |
| **推送服务** | 手动创建 `rc.command.push` Span | **不需要改业务代码**，新增一个 Filter/Interceptor 注入 seqNo |
| **登录服务** | 手动写 Redis 回写代码 | **不需要改业务代码**，新增一个 Interceptor 拦截 Kafka consume 回写 Redis |
| **pom.xml** | 需要 `opentelemetry-api` | 需要 `opentelemetry-api`（Interceptor 中需要 `Span.current()`） |
| **业务代码改动量** | 改动每个业务方法 | **业务代码零改动**，只新增 Interceptor/Filter 类 |

---

## 四、各服务改造点

### 改造点 1：TSP 远控网关服务 — Filter 注入业务属性

**改动方式**：不修改任何 Controller/Service 代码，新增一个 Servlet Filter

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RcBusinessContextFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response,
                         FilterChain chain) throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;

        // 从请求参数中提取业务属性
        String vin = httpRequest.getParameter("vin");
        String commandType = httpRequest.getParameter("commandType");
        String userId = httpRequest.getHeader("X-User-Id");

        // 注入到当前 OTel Span（Agent 自动创建的 HTTP Span）
        Span currentSpan = Span.current();
        if (currentSpan.isRecording()) {
            if (vin != null) currentSpan.setAttribute("biz.vin", vin);
            if (commandType != null) currentSpan.setAttribute("biz.command_type", commandType);
            if (userId != null) currentSpan.setAttribute("biz.user_id", userId);
            currentSpan.setAttribute("rc.service_role", "gateway");
        }

        chain.doFilter(request, response);
    }
}
```

**效果**：Agent 自动创建的 HTTP Span 自动带上 `biz.vin`、`biz.command_type` 等属性，业务代码无需任何改动。

---

### 改造点 2：TSP TBox 远控服务 — Interceptor 注入下发属性 + Redis

**改动方式**：不修改 MQTT 下发方法，新增一个 AOP Interceptor

**2.1 pom.xml（同手动方案）**

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

**2.2 RcTraceCorrelationService（同手动方案，完全不变）**

```java
// 与手动方案完全相同，此处省略
```

**2.3 AOP Interceptor — 拦截 MQTT 下发方法**

```java
@Aspect
@Component
@Slf4j
public class RcDispatchInterceptor {

    @Resource
    private RcTraceCorrelationService correlationService;

    /**
     * 拦截所有 MQTT 下发方法
     * 切入点：所有向 TBox 发送指令的方法
     */
    @AfterReturning(pointcut = "execution(* com.tsp..*.*dispatch*(..))", returning = "result")
    public void afterDispatch(JoinPoint joinPoint, Object result) {
        Span currentSpan = Span.current();
        if (!currentSpan.isRecording()) return;

        // 从方法参数中提取业务信息
        Object[] args = joinPoint.getArgs();
        String seqNo = extractSeqNo(args);
        String vin = extractVin(args);
        String commandType = extractCommandType(args);

        if (seqNo == null) {
            log.warn("MQTT 下发方法中未提取到 seqNo，跳过链路关联");
            return;
        }

        // 注入业务属性到 Agent 自动创建的 Span
        currentSpan.setAttribute("rc.seq_no", seqNo);
        currentSpan.setAttribute("biz.vin", vin);
        currentSpan.setAttribute("biz.command_type", commandType);
        currentSpan.setAttribute("rc.direction", "downstream");
        currentSpan.setAttribute("rc.protocol", "mqtt");
        currentSpan.setAttribute("rc.service_role", "tbox_dispatch");

        // 写入 Redis 关联
        SpanContext ctx = currentSpan.getSpanContext();
        correlationService.saveCorrelation(
            seqNo, ctx.getTraceId(), ctx.getSpanId(),
            vin, commandType, TenantContext.getTenantId()
        );

        log.debug("下发链路关联已保存: seqNo={}, traceId={}", seqNo, ctx.getTraceId());
    }

    /**
     * 离线场景：拦截短信唤醒调用
     */
    @AfterReturning(pointcut = "execution(* com.tsp..*.*wakeup*(..)) || " +
                       "execution(* com.tsp..*.*sendSms*(..))")
    public void afterWakeup(JoinPoint joinPoint) {
        Span currentSpan = Span.current();
        if (!currentSpan.isRecording()) return;

        String vin = extractVin(joinPoint.getArgs());
        String seqNo = correlationService.getPendingSeqNo(vin);

        if (seqNo != null) {
            currentSpan.setAttribute("rc.seq_no", seqNo);
            currentSpan.setAttribute("rc.direction", "downstream");
            currentSpan.setAttribute("rc.protocol", "sms");
        }
    }

    private String extractSeqNo(Object[] args) {
        // 根据实际方法签名提取 seqNo
        // 方式1：从方法的某个参数中取
        // 方式2：从 ThreadLocal 上下文中取
        // 方式3：从 MDC 中取（如果业务代码设置了 MDC）
        return MDC.get("rc.seqNo"); // 推荐：业务方法中 MDC.put("rc.seqNo", seqNo)
    }

    private String extractVin(Object[] args) { return MDC.get("biz.vin"); }
    private String extractCommandType(Object[] args) { return MDC.get("biz.command_type"); }
}
```

**2.4 业务代码改动：仅需加 MDC**

业务方法中**只需加一行 MDC**，不改业务逻辑：

```java
public void dispatchToTBox(String vin, String commandType, String payload) {
    String seqNo = generateSeqNo();

    MDC.put("rc.seq_no", seqNo);           // ★ 仅加这一行
    MDC.put("biz.vin", vin);
    MDC.put("biz.command_type", commandType);

    // 原有业务逻辑完全不动
    mqttClient.publish("tbox/command/" + vin, payload);
}
```

---

### 改造点 3：TSP TBox 远控服务 — Interceptor 链路缝合（★ 核心）

**改动方式**：不修改 Kafka 消费方法，新增 Interceptor 在方法执行前设置 OTel 上下文

```java
@Aspect
@Component
@Slf4j
public class RcTraceStitchInterceptor {

    @Resource
    private RcTraceCorrelationService correlationService;

    /**
     * 在 Kafka 消费方法执行前，恢复 Trace 上下文
     * 这是最关键的一步：setParent 使得 Agent 自动创建的 Kafka Span 复用原始 TraceID
     */
    @Around("execution(* com.tsp..*.*onTBoxResult*(..)) || " +
             "execution(* com.tsp..*.*consume*(..)) && @annotation(org.springframework.kafka.annotation.KafkaListener)")
    public Object stitchTrace(ProceedingJoinPoint joinPoint) throws Throwable {
        Object[] args = joinPoint.getArgs();
        String seqNo = extractSeqNo(args);

        if (seqNo == null) {
            log.warn("Kafka 消费方法中未提取到 seqNo，跳过链路缝合");
            return joinPoint.proceed();
        }

        CorrelationData correlation = correlationService.getCorrelation(seqNo);

        if (correlation != null) {
            // ★ 构造原始下发 Span 的上下文
            SpanContext dispatchCtx = SpanContext.createFromRemoteParent(
                correlation.getTraceId(),
                correlation.getParentSpanId(),
                TraceFlags.getSampled(),
                TraceState.getDefault()
            );

            // ★ 设置为当前线程的上下文
            // Agent 随后会在此上下文下创建 Kafka Consumer Span
            // 该 Span 自动继承原始 TraceID，并认 dispatch Span 为父
            Context parentContext = Context.root().with(dispatchCtx);
            Scope scope = parentContext.makeCurrent();

            try {
                // Agent 在 joinPoint.proceed() 内部自动创建 Span 时
                // 会自动使用我们设置的 parentContext
                Object result = joinPoint.proceed();

                // ★ 在 Agent 的 Span 创建后，给它加 Link 和业务属性
                Span agentSpan = Span.current();
                if (agentSpan.isRecording()) {
                    agentSpan.addLink(dispatchCtx, Attributes.of(
                        AttributeKey.stringKey("rc.link.type"), "seq_no_correlation",
                        AttributeKey.stringKey("rc.seq_no"), seqNo,
                        AttributeKey.longKey("rc.gap_duration_ms"),
                        System.currentTimeMillis() - correlation.getDispatchTime()
                    ));
                    agentSpan.setAttribute("rc.seq_no", seqNo);
                    agentSpan.setAttribute("biz.vin", correlation.getVin());
                    agentSpan.setAttribute("biz.command_type", correlation.getCommandType());
                    agentSpan.setAttribute("rc.direction", "upstream");
                    agentSpan.setAttribute("rc.protocol", "mqtt+kafka");
                    agentSpan.setAttribute("rc.service_role", "tbox_receive");
                }

                return result;
            } finally {
                scope.close();
                correlationService.cleanup(seqNo);
            }
        }

        // 降级：无关联关系，正常执行
        return joinPoint.proceed();
    }

    private String extractSeqNo(Object[] args) {
        // 从 Kafka ConsumerRecord 的 value 中提取 seqNo
        if (args[0] instanceof ConsumerRecord) {
            String value = ((ConsumerRecord<?, String>) args[0]).value();
            // 按实际消息格式解析 seqNo
            return parseSeqNoFromMessage(value);
        }
        return MDC.get("rc.seq_no");
    }
}
```

---

### 改造点 4：TSP 推送服务 — Filter 注入 seqNo

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RcPushContextFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response,
                         FilterChain chain) throws IOException, ServletException {
        chain.doFilter(request, response);

        // 在请求处理后注入 seqNo
        Span currentSpan = Span.current();
        if (currentSpan.isRecording()) {
            String seqNo = MDC.get("rc.seq_no");
            if (seqNo != null) {
                currentSpan.setAttribute("rc.seq_no", seqNo);
                currentSpan.setAttribute("rc.direction", "upstream");
                currentSpan.setAttribute("rc.service_role", "push");
            }
        }
    }
}
```

---

### 改造点 5：TSP 登录服务 — Interceptor 回写 Redis

```java
@Aspect
@Component
@Slf4j
public class RcTBoxLoginInterceptor {

    @Resource
    private RcTraceCorrelationService correlationService;

    /**
     * 拦截 TBox 登录成功事件
     */
    @AfterReturning("execution(* com.tsp..*.*onTBoxLogin*(..)) || " +
                     "execution(* com.tsp..*.*handleLogin*(..))")
    public void afterTBoxLogin(JoinPoint joinPoint) {
        String vin = extractVin(joinPoint.getArgs());
        if (vin == null) return;

        // 查找待执行指令
        String seqNo = correlationService.getPendingSeqNo(vin);
        if (seqNo == null) return;

        // 回写上线时间
        correlationService.updateTboxOnlineTime(seqNo, System.currentTimeMillis());
        correlationService.cleanupPending(vin);

        log.info("TBox 上线链路更新: vin={}, seqNo={}", vin, seqNo);
    }
}
```

---

## 五、Agent 自动生成的 Span 模型

```
Trace (traceId = aaa111，所有 Span 自动共享)

[App]
  └─ GET /api/rc/command              ← Agent 自动创建（Tomcat/Spring MVC）
      └─ POST /api/tbox/dispatch        ← Agent 自动创建（HTTP Client）
          └─ [TSP TBox 远控服务]
              ├─ kafka.produce              ← Agent 自动创建（Kafka Producer）
              │   rc.seq_no = xxx            ← Interceptor 注入
              │   biz.vin = LSV...           ← Interceptor 注入
              │   rc.direction = downstream   ← Interceptor 注入
              │   Redis 写入关联             ← Interceptor 执行
              │
              ├─ mqtt.publish              ← Agent 自动创建（MQTT Client）
              │   rc.seq_no = xxx            ← 复用上文的 MDC
              │
              │ ═══ MQTT ═══
              │    TBox (黑盒)
              │
              ├─ kafka.consume              ← Agent 自动创建（Kafka Consumer）
              │   traceId = aaa111            ← Interceptor setParent（复用原始）
              │   parentSpanId = mqtt.pub    ← Interceptor setParent（指向下发 Span）
              │   Link → mqtt.publish Span    ← Interceptor addLink
              │   rc.seq_no = xxx            ← Interceptor 注入
              │   rc.direction = upstream     ← Interceptor 注入
              │   rc.gap_duration_ms = 3200   ← Interceptor 注入
              │
              ├─ POST /api/push/result      ← Agent 自动创建（HTTP Client）
              │   rc.seq_no = xxx            ← Filter 注入
              │   rc.direction = upstream     ← Filter 注入
              │
              └─ [App] 收到推送结果
```

---

## 六、两种方案改造量对比

| 服务 | 手动埋点方案 | Agent 自动增强方案 |
|------|-----------|-----------------|
| **TSP 远控网关** | 改 3-4 个方法，每个加 Span 创建代码 | 新增 1 个 Filter，业务代码 **0 改动** |
| **TSP TBox 远控服务** | 改 dispatch 方法 + Kafka consume 方法 | 新增 2 个 Interceptor + 业务方法加 1 行 MDC |
| **TSP 推送服务** | 改 push 方法 | 新增 1 个 Filter，业务代码 **0 改动** |
| **TSP 登录服务** | 改 login 方法 | 新增 1 个 Interceptor，业务代码 **0 改动** |
| **新增类数量** | 6 个（Service + DTO） | **10 个**（4 Interceptor + 2 Filter + 1 Service + 1 DTO + 2 AOP Config） |
| **业务代码侵入** | 中 | **低** |

---

## 七、Agent 自动增强方案的优势与限制

### 优势

1. **业务代码几乎不动** — 只需要在关键方法加 `MDC.put()` 一行
2. **Span 覆盖更全** — 自动覆盖 HTTP、Kafka、MQTT、Redis、MySQL、RabbitMQ 的所有调用
3. **升级方便** — OTel Agent 升级自动获得新库的增强支持
4. **统一风格** — 所有服务的 Span 风格一致（由 Agent 决定），不依赖开发者个人习惯

### 限制

1. **Span 命名不可控** — Agent 生成的 Span 名是库方法名（如 `kafka.produce`），不是业务名称（如 `rc.command.dispatch`），需要通过 `rc.service_role` 属性区分业务含义
2. **依赖 Agent 支持的库** — 如果 MQTT/Kafka/RabbitMQ 客户端库不在 Agent 支持列表中，该组件不会自动增强
3. **Interceptor 切入点需确认** — AOP 切入点的表达式需要根据实际代码调整，且 Kafka 消费场景下 `@Around` 的上下文设置时机需验证
4. **MDC 传播** — 需要确保 MDC 在线程池（Kafka 消费线程）中正确传递

### Agent 支持的组件库（常用）

| 组件 | 支持的库 | 自动 Span 名 |
|------|---------|-------------|
| HTTP Server | Tomcat, Undertow, Jetty | `GET /api/xxx`, `POST /api/xxx` |
| HTTP Client | OkHttp, Apache HttpClient, Spring WebClient | `HTTPClient.GET /api/xxx` |
| Kafka | Spring Kafka, Apache Kafka Client | `kafka.produce`, `kafka.consume` |
| RabbitMQ | Spring RabbitMQ, RabbitMQ Java Client | `rabbitmq.publish`, `rabbitmq.consume` |
| MQTT | Eclipse Paho, HiveMQ Client | `mqtt.publish`, `mqtt.subscribe` |
| MySQL | JDBC, HikariCP | `SELECT xxx`, `INSERT xxx` |
| Redis | Lettuce, Jedis | `redis.GET`, `redis.SET` |
| gRPC | gRPC Java | `pkg.service/Method` |

---

## 八、建议

- **优先用 Agent 自动增强方案**，业务代码侵入最小
- 关键方法是 Kafka 消费的 `@Around` Interceptor，需要重点验证 Agent Span 创建时机是否受 `setParent` 影响
- 如果发现 Agent 自动增强的 Span 不满足业务需求（如需要精确控制 Span 边界），可以在个别方法上退化回手动埋点
- 两种方案**可以混用**：大部分用 Agent 自动增强，个别关键节点用手动 Span
