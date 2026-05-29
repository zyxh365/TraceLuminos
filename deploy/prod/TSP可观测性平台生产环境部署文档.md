# TSP 可观测性平台 - 生产环境部署文档（自研版）

> 版本：v3.2（clickhouseexporter + ClickHouse MV 桥接架构 + 冷热数据分离）
> 更新日期：2026-04-10
> 范围：可观测性基础设施（不含应用侧 Java/MySQL/Redis/Kong）

---

## 1. 架构总览

### 1.1 设计决策

| 决策项 | 方案 | 原因 |
|--------|------|------|
| Trace 可视化 | 自研前端监控看板 | SigNoz 字段扩展困难、不支持 TSP 业务定制分析、UI 扩展性差 |
| Trace 后端 | tsp-monitor-gateway | 统一数据接口，对接 ClickHouse / VictoriaMetrics / 华为云 APM |
| Trace 存储 | ClickHouse（标准表 + MV 桥接） | `otel.otel_traces` 标准表 → ClickHouse MV → 自定义 `platform.tsp_spans` |
| Metrics 存储 | VictoriaMetrics | 长期指标存储，Prometheus 兼容 API |
| 事件流 | Kafka tsp-events topic | 供 Flink 实时消费，支持业务事件处理和告警 |
| SigNoz | **不再使用** | 替换为自研方案 |

### 1.2 数据流架构

```
                         ┌──────────────────────────────────────────────────────────────────────────┐
                         │                      Kafka Cluster (3 节点 KRaft)                           │
                         │                                                                          │
                         │  tsp-spans    ──▶ Central Collector ──▶ ClickHouse（via clickhouseexporter）│
  Java Agent ──OTLP──▶   │  tsp-logs     ──▶ Central Collector ──▶ ClickHouse (暂不启用)           │
  Kong OTel ───OTLP──▶   │  tsp-metrics ──▶ Central Collector ──▶ VictoriaMetrics                  │
  LB (HAProxy)           │  tsp-events  ──▶ Central Collector ──▶ Kafka tsp-events (独立 topic)      │
                         │                                └──▶ Flink 实时消费（告警/业务分析）         │
                         └──────────────────────────────────────────────────────────────────────────┘
                                                              │
                         ┌────────────────────────────────────▼────────────────────────────────────┐
                         │             ClickHouse 数据流（clickhouseexporter + MV 桥接）              │
                         │                                                                        │
                         │  clickhouseexporter ──写入──▶ otel.otel_traces（标准 OTel 格式）           │
                         │                                          │                              │
                         │                             ClickHouse MV（C++ 层自动转换）               │
                         │                                          │                              │
                         │                            platform.tsp_spans（自定义业务字段）             │
                         │                                          │                              │
                         │                   已有 MV 聚合 → tsp_span_events / tsp_errors /          │
                         │                              tsp_service_topology / tsp_span_metrics       │
                         └────────────────────────────────────────────────────────────────────────┘
                                                              │
                         ┌────────────────────────────────────▼────────────────────────────────────┐
                         │                      tsp-monitor-gateway (后端)                           │
                         │   /api/traces/*     链路查询（读 ClickHouse platform）                     │
                         │   /api/metrics/*    指标查询（读 VictoriaMetrics）                        │
                         │   /api/dashboard/*  仪表盘聚合 API                                      │
                         │   /api/alerts/*     告警规则 + 告警事件                                   │
                         │   /api/topology/*   服务拓扑                                           │
                         │   /api/apm/*        华为云 APM 代理（历史兼容）                            │
                         └────────────────────────────────────┬────────────────────────────────────┘
                                                              │
                         ┌────────────────────────────────────▼────────────────────────────────────┐
                         │                     前端监控看板 (Spring Boot 静态资源)                   │
                         │   /dashboard    概览仪表盘                                             │
                         │   /traces       链路追踪                                               │
                         │   /metrics      指标监控                                               │
                         │   /topology     服务拓扑                                               │
                         │   /alerts       告警中心                                               │
                         │   /analysis     业务分析（VIN/租户/指令维度）                            │
                         └────────────────────────────────────────────────────────────────────────┘
```

### 1.3 生产环境拓扑

```
                        ┌──────────────────────────────────────────────────────┐
                        │              LB (HAProxy)                              │
                        │         :4317(gRPC)  :4318(HTTP)                     │
                        └───────────┬──────────────────┬───────────────────────┘
                                    │                  │
                        ┌───────────▼───┐    ┌──────────▼────┐
                        │ Edge Collector│    │ Edge Collector│    (2+ 实例)
                        │   #1          │    │   #2          │
                        └───────┬───────┘    └───────┬────────┘
                                │                    │
                        ┌───────▼────────────────────▼────────┐
                        │         Kafka Cluster (3 节点)       │
                        │  Broker1  Broker2  Broker3          │
                        └───────┬────────────────────┬────────┘
                                │                    │
                        ┌───────▼───┐    ┌──────────▼────┐
                        │  Central   │    │  Central       │   (2+ 实例，Consumer Group)
                        │  Collector │    │  Collector     │
                        │  #1        │    │  #2            │
                        └──┬──┬──┬──┘    └──┬──┬──┬───────┘
                           │  │  │          │  │  │
              ┌────────────┘  │  └────┐─────┘  │  └────────────┐
              ▼               ▼        ▼        ▼               ▼
        ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐
        │Victoria  │  │ ClickHouse   │  │              │  │  Kafka   │
        │Metrics   │  │ otel(标准表) │  │  tsp-events  │  │          │
        │(含 VMui) │  │    +         │  │              │  │  ┌─────┐  │
        │          │  │ platform(业务)│  │ Span Events  │  │  │Flink│  │
        │- vminsert│  │              │  │ (实时消费)    │  │  └─────┘  │
        │- vmselect│  │ otel_traces  │  │              │  │  ┌─────┐  │
        │          │  │    ↓ MV      │  │              │  │  │告警  │  │
        │          │  │ tsp_spans    │  │              │  │  │引擎  │  │
        │          │  │ tsp_alert_*  │  │              │  │  └─────┘  │
        └──────────┘  └──────┬───────┘  └──────────────┘  └──────────┘
                             │
                    ┌────────▼──────────┐
                    │tsp-monitor-gateway│ (Spring Boot)
                    │  后端 API 服务      │
                    └────────┬──────────┘
                             │
                    ┌────────▼──────────┐
                    │  前端监控看板        │ (React, Spring Boot 静态资源)
                    │  自研 UI            │
                    └───────────────────┘
```

### 1.4 ClickHouse 双数据库架构

摒弃 SigNoz 的固定表结构（`signoz_traces.signoz_index_v3`），采用 **标准表 + MV 桥接**的双数据库架构：

```
clickhouseexporter → otel.otel_traces（标准表）→ ClickHouse MV → platform.tsp_spans（业务表）
```

**otel 数据库（标准 OTel 格式）**：clickhouseexporter 写入目标，表结构由 OTel 官方定义

| 表名 | 用途 | 说明 |
|------|------|------|
| `otel_traces` | Span 标准表 | clickhouseexporter 直接写入，Map(LowCardinality(String), String) 存储全部属性 |

**platform 数据库（自定义业务字段）**：通过 ClickHouse MV 自动从 otel_traces 桥接

| 表名 | 用途 | 保留期 | 说明 |
|------|------|--------|------|
| `tsp_spans` | Span 主表 | 90 天 | 含 TSP 业务字段（VIN/commandType/tenantId 等），由 MV 自动填充 |
| `tsp_span_events` | Span 事件表 | 30 天 | 独立存储 exception/log 事件，由 MV 自动填充 |
| `tsp_span_metrics` | 聚合统计表 | 365 天 | 按小时聚合，供仪表盘使用 |
| `tsp_errors` | 错误明细表 | 180 天 | 自动从 tsp_spans 提取 ERROR 状态 |
| `tsp_service_topology` | 服务拓扑表 | 90 天 | 每小时快照调用关系 |
| `tsp_alert_rules` | 告警规则表 | 永久 | 用户配置的告警规则 |
| `tsp_alert_events` | 告警事件表 | 365 天 | 触发的告警记录 |

**桥接物化视图（MV）**：

| MV 名 | 源表 | 目标表 | 说明 |
|-------|------|--------|------|
| `mv_otel_to_spans` | `otel.otel_traces` | `platform.tsp_spans` | 标准表 → 业务表字段映射（81 列） |
| `mv_otel_to_span_events` | `otel.otel_traces` (ARRAY JOIN Events) | `platform.tsp_span_events` | 嵌套事件展开为独立行 |

> tsp-monitor-gateway 保持纯查询角色，不消费 Kafka，无性能瓶颈。数据转换由 ClickHouse MV 引擎在 C++ 层完成。
>
> 建表 SQL 见：`docs/Clickhouse/clickhouse-schema/01_init_database.sql`

---

## 2. 组件版本一览

| 组件 | 版本 | 说明 |
|------|------|------|
| Kafka | `bitnami/kafka:3.8.0` | 3 节点 KRaft 集群 |
| OTel Collector | `otel/opentelemetry-collector-contrib:v0.149.0` | 通用版（非 SigNoz 定制版） |
| ClickHouse | `clickhouse/clickhouse-server:24.3.12.75-alpine` | 24.3 LTS |
| VictoriaMetrics | `victoriametrics/victoria-metrics:v1.139.0` | 单机版（含 VMui） |
| HAProxy | `haproxy:2.8` | Edge Collector 负载均衡 |
| tsp-monitor-gateway | 自研 | Spring Boot 2.7 / JDK 11 |
| 前端监控看板 | 自研 | React + Ant Design / Vite |

| ~~SigNoz~~ | ~~已移除~~ | 替换为自研方案 |

---

## 3. 目录结构

```
/opt/tsp-deploy/
├── edge/                              # Edge Collector + HAProxy
│   ├── docker-compose.yml
│   └── otel-collector/
│       └── config.yaml
├── kafka/                             # Kafka 3 节点集群
│   ├── docker-compose.yml
│   └── .env
├── storage/                           # ClickHouse + VictoriaMetrics
│   ├── docker-compose.yml
│   ├── clickhouse/
│   │   ├── config.xml
│   │   └── users.xml
│   └── victoria-metrics/
│       └── vmargs.conf
├── central/                           # Central Collector（2 实例）
│   ├── docker-compose.yml
│   └── otel-collector/
│       └── config.yaml
└── monitor/                           # tsp-monitor-gateway（含 React 前端静态资源）
    ├── tsp-monitor-gateway.jar
    ├── frontend/                      # React 构建产物
    │   └── index.html
    ├── logs/
    └── tsp-monitor-gateway.service    # systemd 服务文件
```

---

## 4. Kafka 集群部署（3 节点 KRaft）

与 v1.0 相同，见上一版文档 4.1~4.4 节。Topic 创建改为：

```bash
# 创建 4 个 topic
docker exec tsp-kafka-1 kafka-topics.sh --bootstrap-server kafka-1:9092 --create \
  --topic tsp-spans --partitions 12 --replication-factor 2 \
  --config retention.hours=72 --config compression.type=lz4

docker exec tsp-kafka-1 kafka-topics.sh --bootstrap-server kafka-1:9092 --create \
  --topic tsp-logs --partitions 6 --replication-factor 2 \
  --config retention.hours=72 --config compression.type=lz4

docker exec tsp-kafka-1 kafka-topics.sh --bootstrap-server kafka-1:9092 --create \
  --topic tsp-metrics --partitions 6 --replication-factor 2 \
  --config retention.hours=72 --config compression.type=lz4

docker exec tsp-kafka-1 kafka-topics.sh --bootstrap-server kafka-1:9092 --create \
  --topic tsp-events --partitions 6 --replication-factor 2 \
  --config retention.hours=48 --config compression.type=lz4
```

---

## 5. Edge Collector 部署

### 5.1 docker-compose.yml

```yaml
# /opt/tsp-deploy/edge/docker-compose.yml

networks:
  edge-net:
    driver: bridge

services:
  haproxy:
    image: haproxy:2.8
    container_name: tsp-haproxy
    restart: unless-stopped
    ports:
      - "4317:4317"
      - "4318:4318"
      - "8404:8404"
    volumes:
      - ./haproxy/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro
    deploy:
      resources:
        limits: { cpus: "0.5", memory: "512m" }
    networks:
      - edge-net

  otel-edge-1:
    image: otel/opentelemetry-collector-contrib:v0.149.0
    container_name: tsp-otel-edge-1
    restart: unless-stopped
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./otel-collector/config.yaml:/etc/otelcol/config.yaml:ro
    deploy:
      resources:
        limits: { cpus: "1", memory: "1g" }
    networks:
      - edge-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:13133/"]
      interval: 10s
      timeout: 5s
      retries: 3

  otel-edge-2:
    image: otel/opentelemetry-collector-contrib:v0.149.0
    container_name: tsp-otel-edge-2
    restart: unless-stopped
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./otel-collector/config.yaml:/etc/otelcol/config.yaml:ro
    deploy:
      resources:
        limits: { cpus: "1", memory: "1g" }
    networks:
      - edge-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:13133/"]
      interval: 10s
      timeout: 5s
      retries: 3
```

> **注意**：OTel Collector 镜像从 `signoz/signoz-otel-collector` 改为 `otel/opentelemetry-collector-contrib`（通用版），不再依赖 SigNoz 定制版。

### 5.2 Edge Collector 配置

```yaml
# /opt/tsp-deploy/edge/otel-collector/config.yaml

receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins: ["*"]

processors:
  batch:
    timeout: 5s
    send_batch_size: 2048

  memory_limiter:
    check_interval: 1s
    limit_mib: 1500
    spike_limit_mib: 512

  # ── 过滤 Kong 内部 Span ─────────────────────────────────────
  filter/kong_internal:
    error_mode: ignore
    traces:
      span:
        - 'name == "kong.router"'
        - 'name == "kong.access.plugin.opentelemetry"'
        - 'name == "kong.header_filter.plugin.opentelemetry"'

  # ── Span 属性变换 ────────────────────────────────────────────
  # 1. peer.service 映射（拓扑图需要）
  # 2. Baggage 字段标准化（加上 baggage. 前缀，便于 Central Collector 映射为 biz.*）
  transform/traces:
    error_mode: ignore
    trace_statements:
      - context: span
        statements:
          # kind 数值：2=SERVER 3=CLIENT 4=PRODUCER 5=CONSUMER
          - 'set(attributes["peer.service"], "MySQL") where attributes["db.system"] == "mysql" and kind == 3'
          - 'set(attributes["peer.service"], "Redis") where attributes["db.system"] == "redis" and kind == 3'
          - 'set(attributes["peer.service"], "Kafka") where attributes["messaging.system"] == "kafka" and kind == 4'
          - 'set(attributes["peer.service"], "Kafka") where attributes["messaging.system"] == "kafka" and kind == 5'
          # baggage 字段加前缀
          - 'set(attributes["baggage.userId"],   attributes["userId"])   where attributes["userId"] != nil'
          - 'set(attributes["baggage.vin"],      attributes["vin"])      where attributes["vin"] != nil'
          - 'set(attributes["baggage.tenantId"], attributes["tenantId"]) where attributes["tenantId"] != nil'
          - 'set(attributes["baggage.platform"], attributes["platform"]) where attributes["platform"] != nil'

exporters:
  kafka/traces:
    brokers: ["<KAFKA_BROKER1>:9092", "<KAFKA_BROKER2>:9092", "<KAFKA_BROKER3>:9092"]
    topic: tsp-spans
    encoding: otlp_proto
    sending_queue:
      enabled: true
      num_consumers: 10
      queue_size: 5000
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s

  kafka/metrics:
    brokers: ["<KAFKA_BROKER1>:9092", "<KAFKA_BROKER2>:9092", "<KAFKA_BROKER3>:9092"]
    topic: tsp-metrics
    encoding: otlp_proto
    sending_queue:
      enabled: true
      num_consumers: 4
      queue_size: 2000

  kafka/logs:
    brokers: ["<KAFKA_BROKER1>:9092", "<KAFKA_BROKER2>:9092", "<KAFKA_BROKER3>:9092"]
    topic: tsp-logs
    encoding: otlp_proto

extensions:
  health_check:
    endpoint: 0.0.0.0:13133

service:
  extensions: [health_check]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, filter/kong_internal, transform/traces, batch]
      exporters: [kafka/traces]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [kafka/metrics]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [kafka/logs]
```

### 5.3 HAProxy 配置

与 v1.0 相同（见上一版文档 5.3 节）。

---

## 6. Central Collector 部署

### 6.1 docker-compose.yml

```yaml
# /opt/tsp-deploy/central/docker-compose.yml

networks:
  central-net:
    driver: bridge

services:
  otel-central-1:
    image: otel/opentelemetry-collector-contrib:v0.149.0
    container_name: tsp-otel-central-1
    restart: unless-stopped
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./otel-collector/config.yaml:/etc/otelcol/config.yaml:ro
    deploy:
      resources:
        limits: { cpus: "2", memory: "2g" }
    networks:
      - central-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:13133/"]
      interval: 10s
      timeout: 5s
      retries: 3

  otel-central-2:
    image: otel/opentelemetry-collector-contrib:v0.149.0
    container_name: tsp-otel-central-2
    restart: unless-stopped
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./otel-collector/config.yaml:/etc/otelcol/config.yaml:ro
    deploy:
      resources:
        limits: { cpus: "2", memory: "2g" }
    networks:
      - central-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:13133/"]
      interval: 10s
      timeout: 5s
      retries: 3
```

### 6.2 Central Collector 配置

```yaml
# /opt/tsp-deploy/central/otel-collector/config.yaml

receivers:
  kafka/traces:
    brokers: ["<KAFKA_BROKER1>:9092", "<KAFKA_BROKER2>:9092", "<KAFKA_BROKER3>:9092"]
    topics: [tsp-spans]
    encoding: otlp_proto
    initial_offset: latest
    group_id: central-traces-consumer

  kafka/metrics:
    brokers: ["<KAFKA_BROKER1>:9092", "<KAFKA_BROKER2>:9092", "<KAFKA_BROKER3>:9092"]
    topics: [tsp-metrics]
    encoding: otlp_proto
    initial_offset: latest
    group_id: central-metrics-consumer

processors:
  batch:
    timeout: 5s
    send_batch_size: 2048

  memory_limiter:
    check_interval: 1s
    limit_mib: 1500
    spike_limit_mib: 512

  # 属性映射：将 OTel 标准属性 + Baggage 转为 TSP 业务字段
  # 例如 baggage.userId → biz.user_id, baggage.vin → biz.vin
  # 这里使用 transform processor 做映射

  transform/traces:
    error_mode: ignore
    trace_statements:
      - context: span
        statements:
          # Baggage → biz.* 业务字段映射
          - set(attributes["biz.vin"], attributes["baggage.vin"]) where attributes["baggage.vin"] != nil
          - set(attributes["biz.user_id"], attributes["baggage.userId"]) where attributes["baggage.userId"] != nil
          - set(attributes["biz.tenant_id"], attributes["baggage.tenantId"]) where attributes["baggage.tenantId"] != nil
          - set(attributes["biz.platform"], attributes["baggage.platform"]) where attributes["baggage.platform"] != nil
          - set(attributes["biz.command_type"], attributes["baggage.commandType"]) where attributes["baggage.commandType"] != nil
          # 部署环境
          - set(attributes["deploy.env"], attributes["deployment.environment"]) where attributes["deployment.environment"] != nil
          # 标记根 span
          - set(attributes["is_root"], "1") where parent_span_id == ""

exporters:
  # ── Traces → ClickHouse（通过 clickhouseexporter 写入标准表）──
  # clickhouseexporter 使用固定表结构 otel_traces（otel 数据库），
  # 通过 ClickHouse MV 自动桥接到 platform.tsp_spans（见 01_init_database.sql）
  clickhouse:
    endpoint: tcp://<CLICKHOUSE_HOST>:9000
    database: otel
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
      max_elapsed_time: 300s

  # ── Metrics → VictoriaMetrics（Prometheus Remote Write）──
  prometheusremotewrite/vm:
    endpoint: http://<VICTORIA_METRICS_HOST>:8428/api/v1/write
    resource_to_telemetry_conversion:
      enabled: true

  # ── Span Events → Kafka tsp-events（供 Flink 实时消费）──
  kafka/events:
    brokers: ["<KAFKA_BROKER1>:9092", "<KAFKA_BROKER2>:9092", "<KAFKA_BROKER3>:9092"]
    topic: tsp-events
    encoding: otlp_proto

extensions:
  health_check:
    endpoint: 0.0.0.0:13133

service:
  extensions: [health_check]
  pipelines:
    traces:
      receivers: [kafka/traces]
      processors: [memory_limiter, transform/traces, batch]
      exporters: [clickhouse]
    metrics:
      receivers: [kafka/metrics]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite/vm]

  telemetry:
    logs:
      level: warn
```

> **关于 ClickHouse 写入方式**：
>
> clickhouseexporter 使用固定表结构（`otel_traces`），无法直接写入自定义业务表。本方案采用 **clickhouseexporter + ClickHouse MV 桥接**架构：
>
> ```
> Central Collector (clickhouseexporter) → otel.otel_traces（标准表）
>     → ClickHouse MV（C++ 层自动转换）→ platform.tsp_spans（自定义业务字段）
> ```
>
> 优势：
> - tsp-monitor-gateway 保持纯查询角色，不消费 Kafka，无性能瓶颈
> - 数据转换由 ClickHouse MV 引擎在 C++ 层完成，零 Java 代码
> - 标准表 `otel.otel_traces` 兼容 OTel 生态工具（如 Coralogix、Grafana Tempo 等）
> - MV 自动触发，写入 otel_traces 后即刻桥接到 tsp_spans，无延迟

---

## 7. ClickHouse 部署（标准表 + MV 桥接架构）

### 7.1 docker-compose.yml

```yaml
# /opt/tsp-deploy/storage/docker-compose.yml（ClickHouse 部分）

services:
  clickhouse:
    image: clickhouse/clickhouse-server:24.3.12.75-alpine
    container_name: tsp-clickhouse
    restart: unless-stopped
    ports:
      - "8123:8123"    # HTTP
      - "9000:9000"    # Native
    volumes:
      - clickhouse-data:/var/lib/clickhouse
      - ./clickhouse/config.xml:/etc/clickhouse-server/config.xml:ro
      - ./clickhouse/users.xml:/etc/clickhouse-server/users.xml:ro
      - ../../docs/Clickhouse/clickhouse-schema:/docker-entrypoint-initdb.d:ro
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    deploy:
      resources:
        limits: { cpus: "4", memory: "8g" }
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8123/ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - storage-net

volumes:
  clickhouse-data:

networks:
  storage-net:
    driver: bridge
```

> **注意**：ClickHouse 24.3 没有内置 OTLP Receiver，必须通过 OTel Collector 的 `clickhouseexporter` 写入标准表 `otel_traces`，再通过 ClickHouse MV 桥接到自定义业务表。

### 7.2 ClickHouse config.xml（关键配置）

```xml
<clickhouse>
  <logger>
    <level>warning</level>
  </logger>

  <max_memory_usage>5368709120</max_memory_usage>
  <max_concurrent_queries>100</max_concurrent_queries>
  <background_pool_size>16</background_pool_size>
</clickhouse>
```

### 7.3 初始化 Schema

将 `docs/Clickhouse/clickhouse-schema/01_init_database.sql` 放入 ClickHouse 的 init 目录，首次启动自动执行。该脚本会创建：

1. **`otel` 数据库** + `otel_traces` 标准表（DDL 与 clickhouseexporter 源码一致）
2. **`platform` 数据库** + 7 张自定义业务表 + 2 个视图 + 3 个聚合 MV
3. **2 个桥接 MV**：`mv_otel_to_spans`（otel_traces → tsp_spans）、`mv_otel_to_span_events`（Events 展开）

```bash
# 验证 otel 数据库（标准表）
docker exec tsp-clickhouse clickhouse-client --query "
  SELECT table FROM system.tables WHERE database = 'otel' ORDER BY table"

# 验证 platform 数据库（业务表 + 物化视图）
docker exec tsp-clickhouse clickhouse-client --query "
  SELECT table FROM system.tables WHERE database = 'platform' ORDER BY table"
```

### 7.4 启动与验证

```bash
cd /opt/tsp-deploy/storage
docker compose up -d clickhouse

# 等待就绪
sleep 15

# 验证
docker exec tsp-clickhouse clickhouse-client --query "SELECT version()"
docker exec tsp-clickhouse clickhouse-client --query "SELECT count() FROM platform.system.tables"
```

---

## 8. VictoriaMetrics 部署

### 8.1 docker-compose.yml（追加到 storage/docker-compose.yml）

```yaml
  # ── VictoriaMetrics（含 VMui，无需单独部署）──
  victoriametrics:
    image: victoriametrics/victoria-metrics:v1.139.0
    container_name: tsp-victoria-metrics
    restart: unless-stopped
    ports:
      - "8428:8428"    # Ingest + Query API + VMui（/vmui）
    command:
      - "--storageDataPath=/var/lib/victoria-metrics"
      - "--retentionPeriod=90d"
      - "--memory.allowedPercent=80"
      - "--maxInsertRequestSize=16777216"
    volumes:
      - victoria-metrics-data:/var/lib/victoria-metrics
    deploy:
      resources:
        limits: { cpus: "2", memory: "4g" }
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8428/health"]
      interval: 15s
      timeout: 5s
      retries: 5
    networks:
      - storage-net

volumes:
  victoria-metrics-data:
```

---

## 9. tsp-monitor-gateway + 前端监控看板 部署

### 9.1 部署步骤（宿主机 java -jar）

tsp-monitor-gateway 采用 `java -jar` 方式部署，与 Java 应用服务一致，无需 Docker/Nginx。

```bash
# 1. 创建目录
mkdir -p /opt/tsp-deploy/monitor/frontend
mkdir -p /opt/tsp-deploy/monitor/logs

# 2. 上传 jar 包和前端构建产物
scp tsp-monitor-gateway.jar <MONITOR_HOST>:/opt/tsp-deploy/monitor/
scp -r frontend/build/* <MONITOR_HOST>:/opt/tsp-deploy/monitor/frontend/

# 3. 创建 systemd 服务（开机自启、进程管理）
cat > /etc/systemd/system/tsp-monitor-gateway.service << 'EOF'
[Unit]
Description=TSP Monitor Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tsp-deploy/monitor
ExecStart=java -Xms512m -Xmx1024m \
  -jar /opt/tsp-deploy/monitor/tsp-monitor-gateway.jar \
  --spring.profiles.active=prod > /opt/tsp-deploy/monitor/logs/gateway.log 2>&1 &
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 4. 启动服务
systemctl daemon-reload
systemctl enable tsp-monitor-gateway
systemctl start tsp-monitor-gateway

# 5. 等待启动完成
sleep 30

# 6. 验证
systemctl status tsp-monitor-gateway
curl -s http://localhost:8085/monitor/analysis/topology
```

> tsp-monitor-gateway 直接 serve React 前端静态资源（`src/main/resources/static/`），无需 Nginx。

### 9.2 运维命令

```bash
# 查看服务状态
systemctl status tsp-monitor-gateway

# 查看日志
journalctl -u tsp-monitor-gateway --no-pager -n 100

# 实时查看日志
journalctl -u tsp-monitor-gateway -f

# 重启
systemctl restart tsp-monitor-gateway

# 停止
systemctl stop tsp-monitor-gateway
```

---

## 10. 全链路验证

### 10.1 Edge → Kafka

```bash
# 发送测试 Trace
curl -s -X POST http://<EDGE_LB_IP>:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [
          {"key":"service.name","value":{"stringValue":"tsp-service-1"}},
          {"key":"deployment.environment","value":{"stringValue":"production"}}
        ]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "aaaabbbbccccddddeeeeffffaaaabbbb",
          "spanId": "1111222233334444",
          "name": "POST /api/commands",
          "startTimeUnixNano": "1700000000000000000",
          "endTimeUnixNano": "1700000002000000000",
          "status": {"code": 1},
          "attributes": [
            {"key":"http.method","value":{"stringValue":"POST"}},
            {"key":"http.route","value":{"stringValue":"/api/commands"}},
            {"key":"baggage.vin","value":{"stringValue":"TEST_VIN_001"}},
            {"key":"baggage.tenantId","value":{"stringValue":"SA_OEM_A"}}
          ]
        }]}]
    }]
  }'
```

### 10.2 ClickHouse 数据验证

```bash
# 等待 Central 消费
sleep 30

# 验证标准表写入（clickhouseexporter 目标）
docker exec tsp-clickhouse clickhouse-client --query "
  SELECT count() FROM otel.otel_traces
  WHERE toDateTime(Timestamp) > now() - INTERVAL 5 MINUTE"

# 验证 MV 桥接到业务表（应与标准表 count 一致）
docker exec tsp-clickhouse clickhouse-client --query "
  SELECT count() FROM platform.tsp_spans
  WHERE start_time > now() - INTERVAL 5 MINUTE"

# 验证链路汇总视图
docker exec tsp-clickhouse clickhouse-client --query "
  SELECT trace_id, services, has_error, biz_vin, biz_tenant_id
  FROM platform.v_trace_summary
  WHERE start_time > now() - INTERVAL 5 MINUTE
  LIMIT 10"

# 验证业务字段
docker exec tsp-clickhouse clickhouse-client --query "
  SELECT biz_vin, biz_tenant_id, service_name, name, duration_ns/1000000 AS ms
  FROM platform.tsp_spans
  WHERE biz_vin != ''
  ORDER BY start_time DESC
  LIMIT 10"
```

### 10.3 tsp-monitor-gateway 验证

```bash
# 服务状态
systemctl status tsp-monitor-gateway

# 链路列表 API
curl -s http://localhost:8085/monitor/analysis/traces?limit=10 | python3 -m json.tool

# 仪表盘概览 API
curl -s http://localhost:8085/monitor/dashboard/overview | python3 -m json.tool

# 服务拓扑 API
curl -s http://localhost:8085/monitor/analysis/topology | python3 -m json.tool
```

### 10.4 前端看板验证

1. 浏览器访问 `http://<MONITOR_IP>:8085`
2. 进入 **Dashboard** 页面，确认指标数据
3. 进入 **Traces** 页面，确认链路列表和详情
4. 进入 **Topology** 页面，确认服务拓扑图

---

## 11. ClickHouse 常用运维命令

### 11.1 进入 ClickHouse 客户端

```bash
# 方式一：交互式客户端（推荐）
docker exec -it tsp-clickhouse clickhouse-client
# 进入后提示符为 tsp-clickhouse :)>

# 方式二：执行单条 SQL
docker exec tsp-clickhouse clickhouse-client --query "SELECT 1"

# 方式三：执行多条 SQL
docker exec -i tsp-clickhouse clickhouse-client --multiquery << 'SQL'
SELECT 1;
SELECT 2;
SQL

# 方式四：指定数据库进入
docker exec -it tsp-clickhouse clickhouse-client --database platform

# 方式五：从宿主机远程连接（需 ClickHouse 开放了 8123 端口）
# 先安装 clickhouse-client
# curl https://clickhouse.com/ | sh
clickhouse-client --host <CLICKHOUSE_HOST> --port 9000
# 或通过 HTTP
curl "http://<CLICKHOUSE_HOST>:8123/" --data "SELECT 1"
```

### 11.2 数据库操作

```sql
-- 查看所有数据库
SHOW DATABASES;

-- 创建数据库
CREATE DATABASE IF NOT EXISTS platform;

-- 切换数据库
USE platform;

-- 删除数据库（危险！会删除所有表和数据）
-- DROP DATABASE platform;
```

### 11.3 表操作

```sql
-- 查看当前数据库的所有表
SHOW TABLES;

-- 查看指定数据库的所有表
SHOW TABLES FROM platform;

-- 查看表结构（字段定义、类型、注释）
DESCRIBE TABLE platform.tsp_spans;

-- 查看建表语句（完整 DDL）
SHOW CREATE TABLE platform.tsp_spans;

-- 查看表的行数
SELECT count() FROM platform.tsp_spans;

-- 查看表的大小（磁盘占用）
SELECT
    table,
    formatReadableSize(sum(bytes)) AS size,
    sum(rows) AS rows,
    count() AS parts
FROM system.parts
WHERE active AND database = 'platform'
GROUP BY table
ORDER BY sum(bytes) DESC;
```

### 11.4 索引操作

```sql
-- 查看表的所有索引
SHOW INDEX FROM platform.tsp_spans;

-- 查看索引详情
SELECT name, type, expr, granularity
FROM system.data_skipping_indices
WHERE database = 'platform' AND table = 'tsp_spans';
```

### 11.5 数据查询（常用业务查询）

```sql
-- 查看最近 1 小时的 Span 数量
SELECT count() FROM platform.tsp_spans
WHERE start_time > now() - INTERVAL 1 HOUR;

-- 查看最近 10 条 Span（按时间倒序）
SELECT trace_id, service_name, name, duration_ns / 1000000 AS ms, status_code
FROM platform.tsp_spans
ORDER BY start_time DESC
LIMIT 10;

-- 按 TraceID 查询完整链路
SELECT span_id, parent_span_id, start_time, duration_ns / 1000000 AS ms,
       service_name, name, status_code, biz_vin
FROM platform.v_trace_detail
WHERE trace_id = 'aabbccddeeff00112233445566778899'
ORDER BY start_time;

-- 查看链路汇总（每个 Trace 一行）
SELECT trace_id, start_time, span_count, has_error, services, biz_vin
FROM platform.v_trace_summary
ORDER BY start_time DESC
LIMIT 20;

-- 按服务统计 QPS 和错误率
SELECT
    service_name,
    count() AS total,
    sum(if(status_code = 'ERROR', 1, 0)) AS errors,
    avg(duration_ns) / 1000000 AS avg_ms
FROM platform.tsp_spans
WHERE start_time > now() - INTERVAL 1 HOUR
  AND is_root = 1
GROUP BY service_name
ORDER BY total DESC;

-- 按车辆 VIN 查询
SELECT trace_id, start_time, service_name, name, biz_command_type, duration_ns / 1000000 AS ms
FROM platform.tsp_spans
WHERE biz_vin = 'LSVAU2A37N1234567'
ORDER BY start_time DESC;

-- 查看最近错误
SELECT time, trace_id, service_name, span_name, error_type, biz_vin
FROM platform.tsp_errors
ORDER BY time DESC
LIMIT 20;

-- 查看聚合统计（每小时）
SELECT time, service_name, span_count, error_count, duration_p99 / 1000000 AS p99_ms
FROM platform.tsp_span_metrics
WHERE window = 'hour'
  AND time > now() - INTERVAL 24 HOUR
ORDER BY time DESC;
```

### 11.6 分区管理

```sql
-- 查看分区信息
SELECT
    table, partition,
    formatReadableSize(sum(bytes)) AS size,
    sum(rows) AS rows
FROM system.parts
WHERE active AND database = 'platform'
GROUP BY table, partition
ORDER BY partition DESC;

-- 手动删除旧分区（超出 TTL 的数据会自动删除，一般无需手动操作）
ALTER TABLE platform.tsp_spans DROP PARTITION '202601';

-- 手动触发分区合并优化（会消耗 IO，建议低峰期执行）
OPTIMIZE TABLE platform.tsp_spans PARTITION tuple() FINAL;
```

### 11.7 视图和物化视图

```sql
-- 查看所有视图和物化视图
SELECT name, type FROM system.tables
WHERE database IN ('otel', 'platform') AND engine LIKE '%View%'
ORDER BY name;

-- 查看普通视图定义
SHOW CREATE VIEW platform.v_trace_detail;
SHOW CREATE VIEW platform.v_trace_summary;

-- 查看桥接物化视图（otel → platform）
SHOW CREATE TABLE platform.mv_otel_to_spans;
SHOW CREATE TABLE platform.mv_otel_to_span_events;

-- 查看聚合物化视图（platform 内部）
SHOW CREATE TABLE platform.mv_spans_hourly;
SHOW CREATE TABLE platform.mv_errors;
SHOW CREATE TABLE platform.mv_service_topology_hourly;
```

### 11.8 系统信息查询

```sql
-- ClickHouse 版本
SELECT version();

-- 当前时间
SELECT now();

-- 查看当前连接
SELECT query_id, user, query, elapsed
FROM system.processes
ORDER BY started;

-- 查看配置项
SELECT name, value FROM system.settings
WHERE name LIKE '%max_memory%';

-- 查看磁盘使用
SELECT name, path, formatReadableSize(free_space) AS free,
       formatReadableSize(total_space) AS total
FROM system.disks;
```

---

## 12. ClickHouse 冷热数据分离

### 12.1 设计思路

> **核心原则：不改 traceId、不改 OTel Agent、不改 Java/前端代码，完全依赖 ClickHouse 原生能力。**

`tsp_spans` 表已有 `start_time` 字段和按月分区（`PARTITION BY toYYYYMM(start_time)`），ClickHouse 查询时自动做分区裁剪（partition pruning），只扫描命中时间范围的分区。冷热分离在此基础上，通过 **多磁盘存储策略 + TTL 自动迁移** 实现。

| 数据温度 | 时间范围 | 存储介质 | 查询延迟 | 说明 |
|----------|---------|---------|---------|------|
| **热数据** | 最近 7 天 | NVMe SSD | < 100ms | 线上排查、实时告警 |
| **温数据** | 7~30 天 | SATA SSD / HDD | 100ms~1s | 问题回溯、趋势分析 |
| **冷数据** | 30~90 天 | 对象存储 / 大容量 HDD | 1s~5s | 合规审计、历史统计 |
| **过期** | > 90 天 | 自动删除 | — | TTL 自动清理 |

### 12.2 方案一：ClickHouse 多磁盘存储策略（推荐，需服务器支持多磁盘）

适用于服务器有 NVMe SSD + SATA SSD + HDD（或对象存储）的场景。

#### 步骤 1：配置 ClickHouse 多磁盘

修改 ClickHouse 的 `config.xml`，在 `<clickhouse>` 节点内添加：

```xml
<storage_configuration>
  <disks>
    <hot>
      <path>/data/clickhouse/hot/</path>
      <keep_free_space_bytes>10737418240</keep_free_space_bytes>  <!-- 保留 10GB 空闲 -->
    </hot>
    <warm>
      <path>/data/clickhouse/warm/</path>
      <keep_free_space_bytes>10737418240</keep_free_space_bytes>
    </warm>
    <cold>
      <path>/data/clickhouse/cold/</path>
      <keep_free_space_bytes>53687091200</keep_free_space_bytes>  <!-- 保留 50GB -->
    </cold>
  </disks>
  <policies>
    <hot_warm_cold>
      <volumes>
        <volume name="hot">
          <disk>hot</disk>
          <max_data_part_size_bytes>10737418240</max_data_part_size_bytes>  <!-- 单分区 >10GB 时迁移到下一级 -->
        </volume>
        <volume name="warm">
          <disk>warm</disk>
          <max_data_part_size_bytes>107374182400</max_data_part_size_bytes>  <!-- 单分区 >100GB 时迁移 -->
        </volume>
        <volume name="cold">
          <disk>cold</disk>
        </volume>
      </volumes>
      <move_factor>0.2</move_factor>
    </hot_warm_cold>
  </policies>
</storage_configuration>
```

> `move_factor=0.2` 表示当磁盘可用空间低于 20% 时，自动触发数据迁移到下一级磁盘。

#### 步骤 2：创建磁盘目录并重启

```bash
# 在 ClickHouse 容器宿主机上执行（如果 ClickHouse 是 Docker 部署，需挂载对应目录）
mkdir -p /data/clickhouse/{hot,warm,cold}
chown -R clickhouse:clickhouse /data/clickhouse/

# 重启 ClickHouse
docker restart tsp-clickhouse
```

#### 步骤 3：修改表存储策略

```bash
docker exec -i tsp-clickhouse clickhouse-client --multiquery << 'SQL'
-- 将 tsp_spans 切换为多级存储策略
ALTER TABLE platform.tsp_spans MODIFY SETTING storage_policy = 'hot_warm_cold';

-- 更新 TTL：7天内 hot，30天内 warm，90天过期
ALTER TABLE platform.tsp_spans MODIFY TTL
  toDateTime(start_time) + INTERVAL 7 DAY MOVE TO VOLUME 'warm',
  toDateTime(start_time) + INTERVAL 30 DAY MOVE TO VOLUME 'cold',
  toDateTime(start_time) + INTERVAL 90 DAY DELETE;
SQL
```

#### 步骤 4：验证

```sql
-- 查看表的存储策略
SELECT name, engine, primary_key, partition_key,
       parts_type, metadata_modification_time
FROM system.tables
WHERE name = 'tsp_spans' AND database = 'platform';

-- 查看各磁盘的分区分布（迁移完成后观察）
SELECT
    disk_name,
    partition,
    formatReadableSize(sum(bytes_on_disk)) AS size,
    sum(rows) AS rows
FROM system.parts
WHERE database = 'platform' AND table = 'tsp_spans' AND active
GROUP BY disk_name, partition
ORDER BY partition DESC, disk_name;

-- 查看 TTL 进度
SELECT
    partition,
    min(start_time) AS min_time,
    max(start_time) AS max_time,
    name AS ttl_rule
FROM system.parts
WHERE database = 'platform' AND table = 'tsp_spans' AND active
GROUP BY partition, name
ORDER BY partition DESC;
```

#### 磁盘空间规划参考

| 存储 | 介质 | 容量建议 | 说明 |
|------|------|---------|------|
| hot | NVMe SSD | 100GB+ | 最近 7 天，高频查询 |
| warm | SATA SSD / HDD | 500GB+ | 7~30 天，中频查询 |
| cold | HDD / 对象存储 | 1TB+ | 30~90 天，低频审计 |
| 系统盘 | SSD | 50GB | ClickHouse 系统 + 日志 |

### 12.3 方案二：单磁盘 + TTL + 查询层时间范围控制（无需多磁盘）

适用于服务器只有一块磁盘的场景。利用已有的 `PARTITION BY toYYYYMM(start_time)` + `TTL`，查询时通过时间范围参数控制是否命中冷分区。

#### 现有配置（无需改动）

当前 `tsp_spans` 表已配置：

```sql
PARTITION BY toYYYYMM(start_time)   -- 按月分区，查询时自动裁剪
TTL toDateTime(start_time) + INTERVAL 90 DAY  -- 90 天后自动删除
```

#### 查询优化

ClickHouse 的 `WHERE start_time >= ... AND start_time <= ...` 会自动跳过不匹配的月份分区（partition pruning）。因此：

- 查最近 1 小时 → 只扫描当月分区，毫秒级
- 查最近 7 天 → 只扫描当月分区，毫秒级
- 查最近 30 天 → 最多扫描 2 个月分区，毫秒级
- 查最近 90 天 → 最多扫描 4 个月分区，百毫秒级

#### 扩展 TTL（可选）

如果需要更长时间的数据保留，可以调整 TTL：

```sql
-- 保留 180 天（6 个月）
ALTER TABLE platform.tsp_spans
  MODIFY TTL toDateTime(start_time) + INTERVAL 180 DAY;

-- 保留 365 天（1 年）
ALTER TABLE platform.tsp_spans
  MODIFY TTL toDateTime(start_time) + INTERVAL 365 DAY;
```

> **注意**：延长 TTL 会增加磁盘占用。建议根据实际日均数据量评估：
> - 假设每天 1000 万条 span，每条约 1KB → 每天 ~10GB
> - 90 天 = 900GB，180 天 = 1.8TB，365 天 = 3.6TB

### 12.4 冷热数据查询对比

| 查询场景 | 时间范围 | 命中分区数 | 预期延迟 | 前端时间选项 |
|----------|---------|-----------|---------|-------------|
| 实时排查 | 最近 1 小时 | 1 | < 100ms | 已有 |
| 当日分析 | 最近 24 小时 | 1 | < 100ms | 新增"24小时" |
| 近期回溯 | 最近 7 天 | 1 | < 200ms | 新增"7天" |
| 趋势统计 | 最近 30 天 | 1~2 | 100ms~1s | 新增"30天" |
| 合规审计 | 最近 90 天 | 1~4 | 1s~5s | 新增"90天" |

### 12.5 热数据优化的额外建议

```sql
-- 1. 对高频查询字段增加跳数索引（已有 trace_id，确认 biz_vin 也有）
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_biz_vin biz_vin
  TYPE bloom_filter(0.01) GRANULARITY 1;

-- 2. 对 status_code 增加跳数索引（错误查询场景）
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_status_code status_code
  TYPE set(100) GRANULARITY 4;

-- 3. 对聚合表 tsp_span_metrics 也可配置 TTL
-- 聚合表数据量小得多，可以保留更长时间
ALTER TABLE platform.tsp_span_metrics
  MODIFY TTL toDateTime(time) + INTERVAL 365 DAY;
```

---

## 13. 资源规划

### 13.1 最小生产环境

| 节点 | 组件 | CPU | 内存 | 磁盘 | 数量 |
|------|------|-----|------|------|------|
| Edge | HAProxy + 2x OTel Collector | 2C | 3G | 50G SSD | 1 |
| Kafka | Kafka Broker | 2C | 4G | 200G SSD | 3 |
| Storage | ClickHouse (hot/warm/cold) | 4C | 8G | 100G NVMe + 500G SSD + 1T HDD | 1 |
| Storage | VictoriaMetrics | 2C | 4G | 200G SSD | 1 |
| Central | 2x OTel Collector | 4C | 4G | 50G | 1 |
| Monitor | tsp-monitor-gateway（java -jar，含前端） | 2C | 2G | 20G | 1 |

> **磁盘规划**：ClickHouse 冷热分离存储需求见 [12.2 方案一](#122-方案一clickhouse-多磁盘存储策略推荐需服务器支持多磁盘)，单磁盘方案只需 500G SSD。

---

## 14. 端口速查表

| 端口 | 组件 | 用途 | 对外 |
|------|------|------|------|
| `4317` | HAProxy (Edge) | OTLP gRPC 入口 | 是 |
| `4318` | HAProxy (Edge) | OTLP HTTP 入口 | 是 |
| `8404` | HAProxy | Stats 监控页 | 否 |
| `9092` | Kafka | 集群内部通信 | 否 |
| `19092` | Kafka | 外部访问 | 按需 |
| `8123` | ClickHouse | HTTP 接口 | 否 |
| `9000` | ClickHouse | Native 协议（clickhouseexporter 写入） | 否 |
| `8428` | VictoriaMetrics | Ingest + Query API + VMui | 是 |
| `8085` | tsp-monitor-gateway | 前端看板 + 后端 API | 是 |
| `13133` | OTel Collector | 健康检查 | 否 |

---

## 15. 与 v1.0（SigNoz 版）的差异

| 变更项 | v1.0（SigNoz 版） | v3.0（当前） |
|--------|-------------------|---------------|
| Trace 可视化 | SigNoz UI (:3301) | 自研前端看板 (:8085，Spring Boot serve) |
| ClickHouse 表 | `signoz_traces.signoz_index_v3` 等 | `otel.otel_traces`（标准表）+ `platform.*`（业务表，MV 桥接） |
| ClickHouse 写入 | SigNoz 自定义 exporter | `clickhouseexporter`（OTel 官方）+ ClickHouse MV |
| OTel Collector | `signoz/signoz-otel-collector` | `otel/opentelemetry-collector-contrib` |
| 后端 API | 无 | tsp-monitor-gateway（纯查询，不消费 Kafka） |
| 业务字段 | 仅 baggage 映射 | VIN/commandType/tenantId/platform 等一一字段 |
| 告警 | 无 | tsp_alert_rules + tsp_alert_events |
| 拓扑 | SigNoz 内置 | tsp_service_topology（MV 自动聚合） |
| Metrics | 不支持独立存储 | VictoriaMetrics |

---

**文档版本历史：**
- v3.2 (2026-04-10) - 新增 ClickHouse 冷热数据分离方案（多磁盘存储策略 + TTL 自动迁移）
- v3.1 (2026-04-10) - tsp-monitor-gateway 改为宿主机 java -jar 部署（systemd），移除 Docker/Nginx
- v3.0 (2026-04-09) - clickhouseexporter + ClickHouse MV 桥接架构，Edge Collector 增加 peer.service/topology 支持
- v2.0 (2026-04-09) - 摒弃 SigNoz，自研监控看板 + tsp-monitor-gateway，ClickHouse 自定义表结构
- v1.0 (2026-04-07) - 初始版本（SigNoz + ClickHouse + VictoriaMetrics）
