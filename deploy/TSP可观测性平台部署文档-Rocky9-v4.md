# TSP 可观测性平台部署文档（测试环境 - 自研版）

> 操作系统：Rocky Linux 9.6 (Blue Onyx)
> 服务器规格：8C 16G × 2
> 版本：v4.0（自研版，摒弃 SigNoz，自定义 ClickHouse 表结构）
> 更新日期：2026-04-09

---

## 与 v3.2 的核心变更

| 变更项 | v3.2（旧） | v4.0（当前） | 原因 |
|--------|---------|-----------|------|
| Trace 可视化 | SigNoz UI (:3301) | 自研前端看板（tsp-monitor-gateway :8085） | SigNoz 字段扩展困难，不支持业务定制分析 |
| ClickHouse 表结构 | `signoz_traces.*`（SigNoz 专用） | `platform.*`（自定义业务字段） | 自研看板需要 VIN/commandType/tenantId 等字段 |
| OTel Collector | `signoz/signoz-otel-collector` | `otel/opentelemetry-collector-contrib:v0.149.0` | 通用版，不依赖 SigNoz 私有 exporter |
| ClickHouse 写入 | SigNoz 自定义 clickhouse exporter | `clickhouseexporter`（OTel 官方）+ ClickHouse MV | 标准表 otel_traces → MV 桥接到自定义 platform 表 |
| Metrics 存储 | 存入 ClickHouse | VictoriaMetrics 独立存储 | Metrics 长期保留，Prometheus 兼容 |
| 后端 API | 无 | tsp-monitor-gateway | 统一数据接口，对接前端看板 |
| Kafka Topic | `signoz-spans`（单个） | `tsp-spans/tsp-metrics/tsp-logs/tsp-events`（4个） | 按信号类型分离，支持事件流分析 |
| HAProxy | 无 | 2（Edge Collector 负载均衡） | Edge Collector 高可用 |

---

## 1. 架构总览

### 1.1 数据流

```
                     ┌──────────────────────────────────────────────────────┐
                     │          Kafka（单节点 KRaft 模式）                     │
                     │                                                      │
  Java Agent ──OTLP──▶  │  tsp-spans     ──▶ Central Collector ──▶ ClickHouse     │
  Kong OTel ───OTLP──▶  │  tsp-metrics  ──▶ Central Collector ──▶ VictoriaMetrics│
  HAProxy (LB)       │  tsp-logs     ──▶ Central Collector ──▶ ClickHouse     │
                     │  tsp-events   ──▶ Central Collector ──▶ Kafka(回写)   │
                     │                                └──▶ Flink(后续)      │
                     └──────────────────────────────────────────────────────┘
                                                               │
                     ┌──────────────────────────────────────────────────────┐
                     │  ClickHouse 数据流（clickhouseexporter + MV 桥接）      │
                     │                                                      │
                     │  clickhouseexporter ──写入──▶ otel.otel_traces         │
                     │     （标准 OTel 格式）           │                      │
                     │                                 ▼ ClickHouse MV        │
                     │                          platform.tsp_spans            │
                     │     （自定义业务字段）            │                      │
                     │                                 ▼ 已有 MV              │
                     │  tsp_span_events / tsp_errors / tsp_service_topology  │
                     └──────────────────────────────────────────────────────┘
                                                               │
                     ┌──────────────────────────────────────────────────────┐
                     │  tsp-monitor-gateway (:8085) ←─ 查询 ClickHouse/VM    │
                     │  部署在 Server2，宿主机 java -jar（无需 Nginx/Docker） │
                     │    ├─ /               → 前端看板（Spring Boot 静态）    │
                     │    └─ /monitor/*      → 后端 API                     │
                     └──────────────────────────────────────────────────────┘
```

### 1.2 Server1 组件清单

```
┌─────────────────────────────────────────────────────────────┐
│  Server 1  (可观测性平台核心)                                 │
│                                                              │
│  ┌──────────┐      ┌────────┐      ┌───────────┐           │
│  │HAProxy   │      │ Edge   │      │ Edge     │           │
│  │ :4317    │─────▶│Collector│      │Collector │           │
│  │ :4318    │      │ #1     │      │ #2       │           │
│  │ :8404    │      └───┬────┘      └─────┬────┘           │
│  └──────────┘          │               │                     │
│                      ▼               ▼                     │
│               ┌────────────────────────────┐                  │
│               │   Kafka (bitnami/kafka:3.8.0)  │                  │
│               │   :9092 KRaft 单节点          │                  │
│               └───────────────┬──────────────┘                  │
│                           │                                  │
│                      ┌────────▼───────────┐                  │
│                      │ Central Collector │ 2 实例        │
│                      │ #1 #2              │ Consumer Group  │
│                      └──┬───┬───┬───────┘                  │
│                         │   │   │                           │
│               ┌───────────┘   │   └───────────────────┐    │
│               ▼                   ▼                   ▼    │
│  ┌─────────────┐  ┌──────────────┐                         │
│  │ClickHouse  │  │Victoria    │                         │
│  │:8123/:9000 │  │Metrics     │                         │
│  │24.3 LTS    │  │:8428       │                         │
│  │            │  │(含 VMui)   │                         │
│  └─────────────┘  └──────────────┘                         │
└──────────────────────────────────────┬──────────────────────┘
                                   │
                    OTLP gRPC/HTTP│  ClickHouse:8123
┌──────────────────────────────────────┼──────────────────────┐
│  Server 2  (Java 应用 + 网关 + 监控看板)                     │
│                                                      │
│  ┌──────────────┐                                       │
│  │Kong Gateway│  OTel Plugin ───────────────────────────┘
│  │ :8000/:8001  │  (Docker 容器)                         │
│  │ Kong DB      │                                       │
│  └──────┬───────┘                                       │
│         │ HTTP                                             │
│  ┌──────▼───────────┐  OTel Java Agent──────────────────┘
│  │ Java Service #1  │
│  │    :8091         │
│  │  (宿主机 java -jar)│
│  ├──┬───────────────┤
│  │  │ JDBC / Redis  │
│  │  ▼               ▼
│  │ ┌────────┐  ┌────────┐
│  │ │MySQL 8.0│  │Redis 7 │   (Docker 容器)
│  │ │ :3306  │  │ :6379  │
│  │ └────────┘  └────────┘
│  └──────────────────┘
│  ┌──────────────────┐  OTel Java Agent──────────────┘
│  │ Java Service #2  │
│  │    :8092         │
│  │  (宿主机 java -jar)│
│  └──────────────────┘
│
│  ┌────────────────────────────┐  查询 Server1 ClickHouse/VM
│  │ tsp-monitor-gateway       │
│  │    :8085                   │  (React 前端 + 后端 API)
│  │    ├─ /  → 前端看板        │
│  │    └─ /monitor/* → 后端 API│
│  │  (宿主机 java -jar)        │
│  └────────────────────────────┘
└──────────────────────────────────────────────────────┘
```

### 1.3 组件版本一览

| 组件 | 版本 | 说明 | 变更 |
|------|------|------|------|
| ClickHouse | `clickhouse/clickhouse-server:24.3.12.75-alpine` | 24.3 LTS | 复用 |
| Kafka | `bitnami/kafka:3.8.0` | KRaft 单节点 | 复用 |
| OTel Collector | `otel/opentelemetry-collector-contrib:0.149.0` | 通用版 | **新增**（替代 SigNoz 版） |
| VictoriaMetrics | `victoriametrics/victoria-metrics:v1.139.0` | Metrics 存储（含 VMui） | **新增** |
| HAProxy | `haproxy:2.8` | Edge 负载均衡 | **新增** |
| tsp-monitor-gateway | 自研 jar | 后端 API + React 前端（:8085） | **新增**，部署在 Server2 |
| MySQL | `mysql:8.0` | 业务数据库 | 复用 |
| Redis | `redis:7-alpine` | 缓存 | 复用 |
| Kong Gateway | `kong:3.6` | API 网关 | 复用 |
| Kong DB | `postgres:15-alpine` | Kong 配置存储 | 复用 |
| JDK (Server 2 宿主机) | OpenJDK 11 | Java 服务运行时 | 复用 |
| ~~SigNoz~~ | ~~`signoz/signoz:v0.115.0`~~ | ~~单体镜像~~ | **移除** |
| ~~signoz-otel-collector~~ | ~~`signoz/signoz-otel-collector:v0.144.2`~~ | ~~SigNoz 定制版~~ | **移除** |

---

## 目录

1. [整体架构](#1-整体架构)
2. [环境准备（两台服务器均执行）](#2-环境准备两台服务器均执行)
3. [Server 1 部署](#3-server-1-部署)
4. [Server 2 部署](#4-server-2-部署)
5. [全链路验证](#5-全链路验证)
6. [端口速查表](#6-端口速查表)
7. [日常运维命令](#7-日常运维命令)
8. [常见问题](#8-常见问题)
9. [版本兼容性说明](#9-版本兼容性说明)

---

## 2. 环境准备（两台服务器均执行）

> **说明**：如果从 v3.2 升级，大部分步骤已完成，只需确认即可。

### 2.1 安装基础工具

```bash
sudo dnf install -y \
  curl wget tar git \
  bind-utils net-tools lsof \
  policycoreutils-python-utils
```

### 2.2 安装 Docker

```bash
sudo dnf config-manager \
  --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf install -y \
  docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker --version
docker compose version
```

### 2.3 将当前用户加入 docker 组

```bash
sudo usermod -aG docker $USER
newgrp docker
docker ps
```

### 2.4 配置国内镜像加速

```bash
sudo tee /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.1panel.live",
    "https://dockerhub.icu",
    "docker.rainbond.cc",
    "docker.unsee.tech",
    "dockerpull.org",
    "docker.chenby.cn",
    "docker.awsl9527.cn"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  },
  "max-concurrent-downloads": 10,
  "max-download-attempts": 5
}
EOF

sudo systemctl daemon-reload
sudo systemctl restart docker
docker info | grep -A 10 "Registry Mirrors"
```

### 2.5 处理 SELinux

```bash
sudo setenforce 0
getenforce   # 期望：Permissive
sudo sed -i 's/^SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config
grep ^SELINUX= /etc/selinux/config
```

### 2.6 调整内核参数

```bash
sudo tee /etc/sysctl.d/99-tsp.conf << 'EOF'
vm.max_map_count = 262144
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
vm.overcommit_memory = 1
EOF

sudo sysctl --system
sysctl vm.max_map_count
```

### 2.7 配置防火墙

**Server 1 执行：**

```bash
sudo firewall-cmd --permanent --add-port=4317/tcp    # OTel gRPC
sudo firewall-cmd --permanent --add-port=4318/tcp    # OTel HTTP
sudo firewall-cmd --permanent --add-port=8123/tcp    # ClickHouse HTTP + Play UI
sudo firewall-cmd --permanent --add-port=9092/tcp    # Kafka
sudo firewall-cmd --permanent --add-port=8428/tcp    # VictoriaMetrics API + VMui
sudo firewall-cmd --permanent --add-port=8404/tcp    # HAProxy Stats
sudo firewall-cmd --permanent --zone=trusted --add-interface=docker0
sudo firewall-cmd --reload
sudo firewall-cmd --list-ports
```

**Server 2 执行：**

```bash
sudo firewall-cmd --permanent --add-port=3306/tcp
sudo firewall-cmd --permanent --add-port=6379/tcp
sudo firewall-cmd --permanent --add-port=8000/tcp
sudo firewall-cmd --permanent --add-port=8001/tcp
sudo firewall-cmd --permanent --add-port=8085/tcp    # tsp-monitor-gateway（前端看板 + API）
sudo firewall-cmd --permanent --add-port=8091/tcp
sudo firewall-cmd --permanent --add-port=8092/tcp
sudo firewall-cmd --permanent --zone=trusted --add-interface=docker0
sudo firewall-cmd --reload
```

### 2.8 安装 JDK 11（仅 Server 2）

```bash
sudo dnf install -y java-11-openjdk java-11-openjdk-devel
java -version
echo 'export JAVA_HOME=/usr/lib/jvm/java-11-openjdk' >> ~/.bashrc
source ~/.bashrc
```

### 2.9 创建部署目录

```bash
sudo mkdir -p /opt/tsp-deploy
sudo chown $USER:$USER /opt/tsp-deploy
```

---

## 3. Server 1 部署

### 3.0 预拉取新镜像

```bash
# OTel Collector 通用版（替代 SigNoz 定制版）
docker pull otel/opentelemetry-collector-contrib:v0.149.0
# OTel Collector 国内镜像
docker pull docker.1ms.run/otel/opentelemetry-collector-contrib:latest
# 拉下来后 tag 回原名
docker tag docker.1ms.run/otel/opentelemetry-collector-contrib:latest otel/opentelemetry-collector-contrib:v0.149.0


# VictoriaMetrics（含 VMui，无需单独拉取 vmui 镜像）
docker pull victoriametrics/victoria-metrics:v1.139.0
# VictoriaMetrics 国内镜像
docker pull docker.1ms.run/victoriametrics/victoria-metrics:v1.139.0
# 或者
docker pull docker.m.daocloud.io/victoriametrics/victoria-metrics:v1.139.0
docker pull docker.1panel.live/victoriametrics/victoria-metrics:v1.139.0
docker pull docker-0.unsee.tech/victoriametrics/victoria-metrics:v1.139.0
# 拉下来后 tag 回原名
docker tag docker.m.daocloud.io/victoriametrics/victoria-metrics:v1.139.0 victoriametrics/victoria-metrics:v1.139.0

# HAProxy
docker pull haproxy:2.8

# 如果以上镜像拉取失败，使用代理：
# docker pull docker.1panel.live/otel/opentelemetry-collector-contrib:0.149.0
# docker tag docker.1panel.live/otel/opentelemetry-collector-contrib:0.149.0 otel/opentelemetry-collector-contrib:0.149.0
```

### 3.1 停止旧组件（从 v3.2 升级时执行）

```bash
cd /opt/tsp-deploy/server1

# 1. 停止并移除旧组件
docker compose stop signoz otel-collector
docker compose rm -f signoz otel-collector

# 2. 确认旧容器已移除
docker compose ps
# 期望：只看到 clickhouse 和 kafka（或无输出）
```

### 3.2 创建新配置文件目录

```bash
cd /opt/tsp-deploy/server1
mkdir -p haproxy otel-edge otel-central
```

### 3.3 上传配置文件

将以下配置文件从开发机上传到 Server 1 对应目录：

```
/opt/tsp-deploy/server1/
├── docker-compose.yml          ← 替换为 v4.0 版本（下方提供）
├── .env                        ← 替换为 v4.0 版本（下方提供）
├── haproxy/
│   └── haproxy.cfg
├── otel-edge/
│   └── config.yaml
├── otel-central/
│   └── config.yaml
├── clickhouse/                  ← 保留原有配置文件
│   ├── config.xml
│   └── users.xml
```

### 3.4 ClickHouse Schema 初始化（otel + platform）

> **重要**：此操作会创建 `otel` 数据库（标准表）和 `platform` 数据库（自定义业务表），不影响已有的 `signoz_traces` 数据库。
>
> **数据流**：clickhouseexporter → `otel.otel_traces`（标准表）→ ClickHouse MV → `platform.tsp_spans`（业务表）

```bash
# 执行建表 SQL（包含两个数据库 + 物化视图桥接）
docker exec -i tsp-clickhouse clickhouse-client --multiquery < /path/to/01_init_database.sql

# 建表 SQL 文件路径：docs/Clickhouse/clickhouse-schema/01_init_database.sql
# 可通过 scp 上传到服务器后执行

# 验证 otel 数据库（clickhouseexporter 标准表）
docker exec tsp-clickhouse clickhouse-client --query "
  SELECT table FROM system.tables WHERE database = 'otel' ORDER BY table"

# 期望输出：
# otel_traces
# otel_traces_trace_id_ts
# otel_traces_trace_id_ts_mv

# 验证 platform 数据库（自定义业务表 + 物化视图）
docker exec tsp-clickhouse clickhouse-client --query "
  SELECT table FROM system.tables WHERE database = 'platform' ORDER BY table"

# 期望输出：
# mv_errors
# mv_otel_to_span_events          ← 新增：桥接 otel_traces → tsp_span_events
# mv_otel_to_spans                ← 新增：桥接 otel_traces → tsp_spans
# mv_service_topology_hourly
# mv_spans_hourly
# tsp_alert_events
# tsp_alert_rules
# tsp_errors
# tsp_service_topology
# tsp_span_events
# tsp_span_metrics
# tsp_spans
# v_trace_detail
# v_trace_summary
```

> 如果将来确认不再需要 SigNoz 的旧数据，可以清理：
> ```bash
> docker exec tsp-clickhouse clickhouse-client --query "DROP DATABASE IF EXISTS signoz_traces"
> docker exec tsp-clickhouse clickhouse-client --query "DROP DATABASE IF EXISTS signoz_metrics"
> docker exec tsp-clickhouse clickhouse-client --query "DROP DATABASE IF EXISTS signoz_logs"
> ```

### 3.5 Kafka Topic 创建

```bash
# Kafka 已在运行，只需创建新的 topic

# 删除旧的 signoz topic（可选）
docker exec tsp-kafka kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic signoz-spans 2>/dev/null || true

# 创建新 topic（测试环境保留因子=1，简化部署）
docker exec tsp-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create \
  --topic tsp-spans --partitions 3 --replication-factor 1 \
  --config retention.ms=172800000 --config compression.type=lz4

docker exec tsp-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create \
  --topic tsp-metrics --partitions 3 --replication-factor 1 \
  --config retention.ms=172800000 --config compression.type=lz4

docker exec tsp-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create \
  --topic tsp-logs --partitions 3 --replication-factor 1 \
  --config retention.ms=172800000 --config compression.type=lz4

docker exec tsp-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create \
  --topic tsp-events --partitions 3 --replication-factor 1 \
  --config retention.ms=172800000 --config compression.type=lz4

# 验证
docker exec tsp-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list
# 期望：tsp-events, tsp-logs, tsp-metrics, tsp-spans
```

### 3.6 启动全部服务

```bash
cd /opt/tsp-deploy/server1

# 1. ClickHouse 已在运行（跳过）

# 2. Kafka 已在运行（跳过）

# 3. 启动新组件
docker compose up -d

# 查看所有容器状态
docker compose ps
```

### 3.7 验证 Server 1

```bash
# 1. 容器状态（全部 Running）
docker compose ps

# 2. HAProxy 健康检查
curl -s -o /dev/null -w "HAProxy: %{http_code}\n" http://localhost:4317
# 期望：HAProxy: 000

# 3. Edge Collector 健康检查
curl -s http://localhost:13133/
# 期望：Collector is alive

# 4. ClickHouse 标准表（clickhouseexporter 写入目标）
docker exec tsp-clickhouse clickhouse-client --query "SELECT count() FROM otel.otel_traces"

# 5. ClickHouse 业务表（MV 自动桥接）
docker exec tsp-clickhouse clickhouse-client --query "SELECT count() FROM platform.tsp_spans"

# 5. VictoriaMetrics 健康检查
curl -s http://localhost:8428/health
# 期望：ok

# 6. VMui 可访问（内置在 VictoriaMetrics 中）
curl -s -o /dev/null -w "VMui: %{http_code}\n" http://localhost:8428/vmui/
# 期望：VMui: 200

# 7. ClickHouse Play UI 可访问
curl -s -o /dev/null -w "Play UI: %{http_code}\n" http://localhost:8123/play
# 期望：Play UI: 200
```

---

## 4. Server 2 部署

> **说明**：Server 2 新增 tsp-monitor-gateway（后端 API + React 前端看板），端口 8085。需要准备 jar 包和前端构建产物。

### 4.1 确认 OTel 上报地址

Java Agent 的 OTLP endpoint 指向 Server1 的 HAProxy，无需改动：

```
-Dotel.exporter.otlp.endpoint=http://<SERVER1_IP>:4317
```

### 4.2 Server2 部署（首次部署时执行，已部署跳过）

以下步骤与 v3.2 完全一致，不再重复。参考原 `TSP可观测性平台部署文档-Rocky9-v3.md` 的 4.1~4.7 节。

核心配置确认：
- `.env` 中 `SERVER1_IP` 指向 Server1 IP
- Java 服务端口：Service1 = 8091，Service2 = 8092
- MySQL 用户：`chery-alert@%`，数据库：`trace_demo`
- Redis：无密码，db0/db1

### 4.3 创建 Java 服务启动脚本

为每个 Java 服务创建 systemd 服务文件，实现开机自启和进程管理：

**Java Service #1 (`/etc/systemd/system/tsp-java1.service`)：**

```ini
[Unit]
Description=TSP Java Service #1
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tsp-deploy/server2/java-services

ExecStart=nohup java -javaagent:/opt/tsp-deploy/server2/java-services/opentelemetry-javaagent.jar \
  -Dotel.service.name=tsp-service-1 \
  -Dotel.exporter.otlp.endpoint=http://172.25.100.135:4317 \
  -Dotel.propagators=tracecontext,baggage \
  -Dotel.traces.sampler=always_on \
  -Dotel.exporter.otlp.protocol=grpc \
  -Dotel.traces.exporter=otlp \
  -Dotel.metrics.exporter=otlp \
  -Dotel.logs.exporter=otlp \
  -Dotel.instrumentation.http.server.capture-request-headers=baggage \
  -Dotel.java.experimental.span-attributes.copy-from-baggage.include=userId,vin,tenantId,platform \
  -Dotel.resource.attributes=deployment.environment=tsp-test,team=tsp \
  -jar /opt/tsp-deploy/server2/java-services/tsp-service1.jar \
  --spring.profiles.active=test > /opt/tsp-deploy/server2/java-services/logs/service1.log 2>&1 &
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Java Service #2 (`/etc/systemd/system/tsp-java2.service`)：**

```ini
[Unit]
Description=TSP Java Service #2
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tsp-deploy/server2/java-services
ExecStart=nohup java -javaagent:/opt/tsp-deploy/server2/java-services/opentelemetry-javaagent.jar \
  -Dotel.service.name=tsp-service-2 \
  -Dotel.exporter.otlp.endpoint=http://172.25.100.135:4317 \
  -Dotel.propagators=tracecontext,baggage \
  -Dotel.traces.sampler=always_on \
  -Dotel.exporter.otlp.protocol=grpc \
  -Dotel.traces.exporter=otlp \
  -Dotel.metrics.exporter=otlp \
  -Dotel.logs.exporter=otlp \
  -Dotel.instrumentation.http.server.capture-request-headers=baggage \
  -Dotel.java.experimental.span-attributes.copy-from-baggage.include=userId,vin,tenantId,platform \
  -Dotel.resource.attributes=deployment.environment=tsp-test,team=tsp \
  -jar /opt/tsp-deploy/server2/java-services/tsp-service2.jar \
  --spring.profiles.active=test > /opt/tsp-deploy/server2/java-services/logs/service2.log 2>&1 &
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

> **注意**：`${SERVER1_IP}` 需要替换为 Server 1 的实际 IP。Java Service #1 端口为 8091，Java Service #2 端口为 8092（在各自的 application.yml 中配置）。

### 4.4 部署 tsp-monitor-gateway（v4.0 新增）

tsp-monitor-gateway 采用与 Java Service 相同的 `java -jar` 方式部署，无需 Docker/Nginx。

```bash
# 1. 创建目录
mkdir -p /opt/tsp-deploy/server2/monitor

# 2. 上传 jar 包和前端构建产物
scp tsp-monitor-gateway.jar server2:/opt/tsp-deploy/server2/monitor/
scp -r frontend/build/* server2:/opt/tsp-deploy/server2/monitor/frontend/

# 3. 确保 .env 中 SERVER1_IP 正确
cat /opt/tsp-deploy/server2/.env
# 期望：SERVER1_IP=172.25.100.135

# 4. 创建 systemd 服务（开机自启）
cat > /etc/systemd/system/tsp-monitor-gateway.service << 'EOF'
[Unit]
Description=TSP Monitor Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tsp-deploy/server2/monitor
ExecStart=nohup java -Xms512m -Xmx1024m \
  -jar /opt/tsp-deploy/server2/java-services/tsp-monitor-gateway.jar \
  --spring.profiles.active=test > /opt/tsp-deploy/server2/java-services/logs/gateway.log 2>&1 &
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /opt/tsp-deploy/server2/monitor/logs

# 5. 启动服务
systemctl daemon-reload
systemctl enable tsp-monitor-gateway
systemctl start tsp-monitor-gateway

# 6. 等待启动完成（约 30 秒）
sleep 30

# 7. 验证
curl -s -o /dev/null -w "Gateway API: %{http_code}\n" http://localhost:8085/monitor/analysis/topology
# 期望：Gateway API: 200

curl -s -o /dev/null -w "前端看板: %{http_code}\n" http://localhost:8085
# 期望：前端看板: 200
```

> **跨机查询**：monitor-gateway 通过 `<SERVER1_IP>:8123` 查询 ClickHouse、`<SERVER1_IP>:8428` 查询 VictoriaMetrics，需确保两台机器网络互通。

---

## 5. 全链路验证

### 5.1 发送测试 Trace

```bash
# 通过 HAProxy 发送（模拟 Java Agent 上报）
curl -s -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [
          {"key":"service.name","value":{"stringValue":"tsp-service-1"}},
          {"key":"deployment.environment","value":{"stringValue":"test"}}
        ]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "aaaabbbbccccddddeeeeffffaaaabbbb",
          "spanId": "1111222233334444",
          "name": "POST /api/commands",
          "startTimeUnixNano": "1744262400000000000",
          "endTimeUnixNano":   "1744262402000000000",
          "status": {"code": 1},
          "attributes": [
            {"key":"http.method","value":{"stringValue":"POST"}},
            {"key":"http.route","value":{"stringValue":"/api/commands"}},
            {"key":"baggage.vin","value":{"stringValue":"TEST_VIN_001"}},
            {"key":"baggage.tenantId","value":{"stringValue":"TEST_TENANT"}},
            {"key":"baggage.commandType","value":{"stringValue":"LOCK_CAR"}}
          ]
        }]}]
    }]
  }'
# 期望：HTTP 200（无输出即成功）
```

### 5.2 验证数据流转

```bash
# 等待 Central 消费写入
sleep 15

# ClickHouse 数据验证
docker exec tsp-clickhouse clickhouse-client --query "
  SELECT trace_id, service_name, name, duration_ns/1000000 AS ms,
         biz_vin, biz_command_type, status_code
  FROM platform.tsp_spans
  WHERE start_time > now() - INTERVAL 5 MINUTE
  ORDER BY start_time DESC
  LIMIT 10"

# 链路汇总视图
docker exec tsp-clickhouse clickhouse-client --query "
  SELECT trace_id, start_time, span_count, has_error,
         services, biz_vin, biz_tenant_id
  FROM platform.v_trace_summary
  WHERE start_time > now() - INTERVAL 5 MINUTE
  LIMIT 10"
```

### 5.3 前端看板验证

1. 浏览器访问 `http://<SERVER2_IP>:8085`
2. 进入 **Dashboard** 页面，确认 QPS、错误率等指标数据
3. 进入 **Traces** 页面，确认能看到测试链路数据
4. 在搜索框输入 `TEST_VIN_001`，验证业务字段过滤

### 5.4 完整链路验证

```bash
# 通过 Kong 代理调用（验证 Kong OTel 插件 → HAProxy → Kafka → ClickHouse 全链路）
curl -v http://localhost:8000/api/svc1/biz/help

# 通过 Kong 代理调用
curl -v http://localhost:8000/api/svc2/biz/help

# 在 ClickHouse 中查询完整链路
docker exec tsp-clickhouse clickhouse-client --query "
  SELECT trace_id, service_name, name, duration_ns/1000000 AS ms,
         biz_vin, biz_command_type, status_code
  FROM platform.v_trace_detail
  WHERE start_time > now() - INTERVAL 5 MINUTE
  ORDER BY start_time DESC
  LIMIT 50"
```

---

## 6. 端口速查表

### Server 1

| 端口 | 组件 | 用途 | 对外 |
|------|------|------|------|
| `4317` | HAProxy → Edge | OTLP gRPC 入口 | 是 |
| `4318` | HAProxy → Edge | OTLP HTTP 入口 | 是 |
| `8404` | HAProxy | Stats 监控页 | 否 |
| `9092` | Kafka | Broker (KRaft) | 按需 |
| `8123` | ClickHouse | HTTP 接口 + Play UI | 是 |
| `9000` | ClickHouse | Native 协议 | 否 |
| `8428` | VictoriaMetrics | Ingest + Query API + VMui | 是 |
| `13133` | OTel Collector | 健康检查 | 否 |

### Server 2

| 端口 | 组件 | 用途 |
|------|------|------|
| `3306` | MySQL 8.0 | 业务数据库 |
| `6379` | Redis 7 | 缓存 |
| `8000` | Kong Gateway | HTTP 代理入口 |
| `8001` | Kong Admin API | 路由/插件管理 |
| `8085` | tsp-monitor-gateway | 前端看板 + 后端 API |
| `8091` | Java Service #1 | 宿主机运行 |
| `8092` | Java Service #2 | 宿主机运行 |

---

## 7. 日常运维命令

### 7.1 ClickHouse 运维

```bash
# 进入交互式客户端
docker exec -it tsp-clickhouse clickhouse-client

# 常用查询（在 clickhouse-client 内执行）
USE platform;
SHOW TABLES;
SELECT count() FROM tsp_spans;
SELECT count() FROM tsp_spans WHERE start_time > now() - INTERVAL 1 HOUR;
SELECT count() FROM tsp_errors WHERE time > now() - INTERVAL 1 HOUR;
```

**Play UI（浏览器查询）**：

浏览器访问 `http://<SERVER1_IP>:8123/play`，即可在 Web 界面中执行 SQL 查询。

- 默认用户名 `default`，无密码
- 支持自动补全、格式化、导出 CSV/JSON
- HTTP API 跨域查询：`curl "http://<SERVER1_IP>:8123/?query=SELECT%20count()%20FROM%20platform.tsp_spans"`

### 7.2 OTel Collector 运维

```bash
# 查看 Edge Collector 状态
docker compose ps otel-edge-1 otel-edge-2

# 查看 Central Collector 状态
docker compose ps otel-central-1 otel-central-2

# Collector 日志
docker compose logs otel-edge-1 --tail 50
docker compose logs otel-central-1 --tail 50

# 健康检查
curl -s http://localhost:13133/
```

### 7.3 VictoriaMetrics 运维

```bash
# 健康检查
curl -s http://localhost:8428/health

# 查询当前指标
curl -s "http://localhost:8428/api/v1/query?query=up"

# 查看数据写入量
curl -s "http://localhost:8428/api/v1/status/tsdb" | python3 -m json.tool
```

**VMui（Metrics 可视化查询）**：

浏览器访问 `http://<SERVER1_IP>:8428/vmui`，即可使用 Metrics 查询和图表功能。

- VMui 已内置在 VictoriaMetrics 单节点版中，无需单独部署
- 支持 PromQL 查询、图表展示、数据导出

### 7.4 Kafka 运维

```bash
# Topic 列表
docker exec tsp-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list

# 消费者组 lag
docker exec tsp-kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --all-groups

# 查看 Topic 占用
docker exec tsp-kafka kafka-log-dirs.sh \
  --bootstrap-server localhost:9092 --describe --topic-list tsp-spans
```

### 7.5 tsp-monitor-gateway 运维

> tsp-monitor-gateway 部署在 Server2（宿主机 java -jar），在 Server2 上执行以下命令。

```bash
# 查看服务状态
systemctl status tsp-monitor-gateway

# 查看日志（最近 100 行）
journalctl -u tsp-monitor-gateway --no-pager -n 100

# 实时查看日志
journalctl -u tsp-monitor-gateway -f

# 重启
systemctl restart tsp-monitor-gateway

# 停止
systemctl stop tsp-monitor-gateway
```

### 7.6 完整重启

```bash
cd /opt/tsp-deploy/server1

# 停止所有服务
docker compose down

# 重新启动
docker compose up -d

# 查看状态
docker compose ps
```

---

## 8. 常见问题

### Q1：OTel Collector 启动报 `unknown type: "clickhouse"`

**原因**：使用了 `signoz-otel-collector` 镜像（SigNoz 定制版），该镜像包含 `signozclickhousemetrics`、`clickhousetraces` 等 SigNoz 私有 exporter 类型，通用版 collector 不认识。

**解决**：确保使用 `otel/opentelemetry-collector-contrib` 镜像，配置中 exporter 类型改为 `clickhouse`（官方标准类型）。

### Q2：clickhouseexporter 写入 ClickHouse 失败 `table not found`

**原因**：ClickHouse 中没有 `otel` 数据库或 `otel_traces` 标准表（01_init_database.sql 未执行）。

**解决**：先执行 3.4 节的建表 SQL，确认 `otel.otel_traces` 表存在。

### Q3：前端看板访问 8085 端口空白页

**原因**：前端构建产物未正确放入 tsp-monitor-gateway 的静态资源目录。

**解决**：
```bash
# 检查静态资源目录
ls /opt/tsp-deploy/server2/monitor/frontend/

# 确认 index.html 存在
cat /opt/tsp-deploy/server2/monitor/frontend/index.html | head -5

# 查看启动日志确认静态资源加载情况
journalctl -u tsp-monitor-gateway --no-pager | grep -i "static\|resource"
```

### Q4：VictoriaMetrics 写不进 Metrics

**原因**：Central Collector 的 `prometheusremotewrite` 配置有误，或 VictoriaMetrics 未启动。

**解决**：
```bash
# 检查 VictoriaMetrics 状态
curl -s http://localhost:8428/health

# 检查 Central Collector 日志中是否有 prometheusremotewrite 相关错误
docker compose logs otel-central-1 | grep -i "remote\|victoria\|vm"
```

### Q5：HAProxy 后端健康检查失败

**原因**：Edge Collector 的健康检查端点可能未监听在预期地址。

**解决**：HAProxy 健康检查配置中应使用 `httpchk GET /` 方式，而非 TCP 检查。

### Q6：从 v3.2 升级时 ClickHouse 数据保留问题

旧 `signoz_traces` 数据库的数据会被保留，不受影响。新数据写入 `platform` 数据库。如果确认旧数据不再需要，可以手动删除旧库释放磁盘空间。

### Q7：Java 服务启动报 OTLP endpoint 连接失败

**原因**：Server1 上的 HAProxy 或 Edge Collector 未启动。

**解决**：先确认 Server1 上 Edge Collector 状态：
```bash
curl -s -o /dev/null -w "%{http_code}" http://<SERVER1_IP>:4317
# 期望：000（HAProxy 接受但代理后端不通）或 200
```

---

## 9. 版本兼容性说明

### 9.1 OTel Collector 版本选择

| 版本 | 类型 | 说明 | 推荐场景 |
|------|------|------|---------|
| `otel/opentelemetry-collector-contrib:0.149.0` | 通用版 | 包含所有标准 exporter/processor | **推荐** |
| `signoz/signoz-otel-collector:v0.144.2` | SigNoz 定制版 | 包含 SigNoz 私有 exporter | 已弃用 |

选择通用版的原因：
- SigNoz 定制版的 exporter 类型（如 `signozclickhousemetrics`）不被通用版识别
- 通用版的 `clickhouseexporter` 写入标准 `otel_traces` 表，通过 ClickHouse MV 桥接到自定义业务表
- 通用版的 `transform` processor 功能更完整
- 不再依赖 SigNoz 的版本发布周期

### 9.2 ClickHouse 与 OTel Collector 的数据写入方式

ClickHouse 24.3 **没有内置 OTLP Receiver**（不能直接接收 OTLP 协议的数据）。必须通过 OTel Collector 的 `clickhouseexporter` 写入标准表，再通过 ClickHouse MV 桥接到自定义业务表：

```
OTLP 数据 → OTel Collector (clickhouseexporter) → otel.otel_traces → ClickHouse MV → platform.tsp_spans
```

因此测试环境和生产环境的数据写入方式完全一致，无兼容性问题。

### 9.3 Kafka 编码格式

OTel Collector 的 Kafka exporter 支持 `otlp_proto` 编码，这是测试环境和生产环境统一使用的编码格式。Kafka broker 版本 3.8 完全兼容。

### 9.4 OTel Java Agent 兼容性

当前使用的 OTel Java Agent 版本（v1.32.0）通过标准 OTLP gRPC/HTTP 协议上报数据，与 OTel Collector 版本无关。Agent 端无需任何变更。

---

## 附录 A：v3.2 → v4.0 升级检查清单

| 检查项 | 命令 | 期望结果 |
|--------|------|---------|
| 旧组件已停止 | `docker compose ps` | 无 signoz/otel-collector 容器 |
| 新镜像已拉取 | `docker images \| grep -E "contrib\|victoria\|haproxy"` | 3 个新镜像 |
| ClickHouse 新库已创建 | `docker exec tsp-clickhouse clickhouse-client --query "SELECT count() FROM system.tables WHERE database IN ('otel','platform')"` | otel 1张 + platform 9张 + MV 5个 |
| Kafka 新 topic 已创建 | `docker exec tsp-kafka kafka-topics.sh --list` | 4 个 topic |
| Edge Collector 正常 | `curl -s http://localhost:13133/` | Collector is alive |
| HAProxy 正常 | `curl -s http://localhost:4317` | 连接成功 |
| VictoriaMetrics 正常 | `curl -s http://localhost:8428/health` | ok |
| Gateway + 前端可访问 | `curl -s http://localhost:8085` (Server2) | 200 |
| Gateway API 正常 | `curl -s http://localhost:8085/monitor/analysis/topology` (Server2) | 200 |
| Gateway 服务状态 | `systemctl status tsp-monitor-gateway` (Server2) | active (running) |
| Java 服务 OTel 无报错 | `journalctl -u tsp-java1 --no-pager \| grep -i error` | 无 OTel 连接错误 |

---

## 附录 B：配置文件清单

### B.1 HAProxy 配置

文件路径：`/opt/tsp-deploy/server1/haproxy/haproxy.cfg`

```haproxy
global
  log stdout format raw local0
  maxconn 4096

defaults
  log     global
  mode    tcp
  option  tcplog
  option  dontlognull
  timeout connect 5s
  timeout client  30s
  timeout server  30s

frontend otel_grpc
  bind *:4317
  default_backend otel_edge_grpc

backend otel_edge_grpc
  balance roundrobin
  option httpchk GET /
  server edge1 otel-edge-1:4317 check
  server edge2 otel-edge-2:4317 check

frontend otel_http
  bind *:4318
  default_backend otel_edge_http

backend otel_edge_http
  balance roundrobin
  option httpchk GET /
  http-check expect status 200
  server edge1 otel-edge-1:4318 check
  server edge2 otel-edge-2:4318 check

frontend stats
  bind *:8404
  mode http
  stats enable
  stats uri /
  stats refresh 10s
```

### B.2 Edge Collector 配置

文件路径：`/opt/tsp-deploy/server1/otel-edge/config.yaml`

```yaml
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

exporters:
  kafka/traces:
    brokers: ["localhost:9092"]
    topic: tsp-spans
    encoding: otlp_proto
    sending_queue:
      enabled: true
      num_consumers: 4
      queue_size: 2000
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s

  kafka/metrics:
    brokers: ["localhost:9092"]
    topic: tsp-metrics
    encoding: otlp_proto
    sending_queue:
      enabled: true
      num_consumers: 4
      queue_size: 2000

  kafka/logs:
    brokers: ["localhost:9092"]
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
      processors: [memory_limiter, batch]
      exporters: [kafka/traces]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [kafka/metrics]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [kafka/logs]
  telemetry:
    logs:
      level: info
```

### B.3 Central Collector 配置

文件路径：`/opt/tsp-deploy/server1/otel-central/config.yaml`

```yaml
receivers:
  kafka/traces:
    brokers: ["localhost:9092"]
    topics: [tsp-spans]
    encoding: otlp_proto
    initial_offset: latest
    group_id: central-traces-consumer

  kafka/metrics:
    brokers: ["localhost:9092"]
    topics: [tsp-metrics]
    encoding: otlp_proto
    initial_offset: latest
    group_id: central-metrics-consumer

  kafka/logs:
    brokers: ["localhost:9092"]
    topics: [tsp-logs]
    encoding: otlp_proto
    initial_offset: latest
    group_id: central-logs-consumer

processors:
  batch:
    timeout: 5s
    send_batch_size: 2048
  memory_limiter:
    check_interval: 1s
    limit_mib: 1500
    spike_limit_mib: 512

  # Baggage → biz.* 字段映射
  transform/traces:
    error_mode: ignore
    trace_statements:
      - context: span
        statements:
          - set(attributes["biz.vin"], attributes["baggage.vin"]) where attributes["baggage.vin"] != nil
          - set(attributes["biz.user_id"], attributes["baggage.userId"]) where attributes["baggage.userId"] != nil
          - set(attributes["biz.tenant_id"], attributes["baggage.tenantId"]) where attributes["baggage.tenantId"] != nil
          - set(attributes["biz.platform"], attributes["baggage.platform"]) where attributes["baggage.platform"] != nil
          - set(attributes["biz.command_type"], attributes["baggage.commandType"]) where attributes["baggage.commandType"] != nil
          - set(attributes["deploy.env"], attributes["deployment.environment"]) where attributes["deployment.environment"] != nil
          - set(attributes["is_root"], "1") where parent_span_id == ""

exporters:
  clickhouse:
    endpoint: localhost:9000
    database: otel
    # clickhouseexporter 使用固定表结构 otel_traces，
    # 通过 ClickHouse MV 自动桥接到 platform.tsp_spans（见 01_init_database.sql）
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
      max_elapsed_time: 300s

  prometheusremotewrite/vm:
    endpoint: http://localhost:8428/api/v1/write
    resource_to_telemetry_conversion:
      enabled: true

  kafka/events:
    brokers: ["localhost:9092"]
    topic: tsp-events
    encoding: otlp_proto
    retry_on_failure:
      enabled: true
      initial_interval: 5s

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
    logs:
      receivers: [kafka/logs]
      processors: [memory_limiter, batch]
      exporters: []
  telemetry:
    logs:
      level: warn
```

---

**文档版本历史：**
- v4.1 (2026-04-10) - tsp-monitor-gateway 改为宿主机 java -jar 部署（systemd），移除 Docker
- v4.0 (2026-04-09) - 摒弃 SigNoz，clickhouseexporter + MV 桥接，tsp-monitor-gateway 迁移至 Server2（:8085），去掉 Nginx
- v3.2 (2026-04-07) - Server 2 新增 MySQL 8.0 + Redis 7 + Kong，Java 服务宿主机运行
- v3.1 (2025-12-15) - SigNoz 微服务架构，Kafka Zookeeper 模式
- v3.0 (2025-10-01) - 初始版本
