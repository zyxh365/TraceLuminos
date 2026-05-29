# TSP 可观测性平台 — 华为云Docker 部署运维手册

> **版本**：v5.0
> **日期**：2026-05-13
> **适用环境**：华为云 ECS × 2（Rocky 9）+ 华为云 DMS Kafka + 华为云 CloudTable ClickHouse

---

## 1. 架构概述

### 1.1 部署拓扑

```
                         ELB (OTLP 接入)
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
┌─────────────────────────┐  ┌─────────────────────────┐
│  Server A (8C16G)       │  │  Server B (8C16G)       │
│                         │  │                         │
│  edge-1  :4317,:4318    │  │  edge-3  :4317,:4318    │
│  edge-2  :4319,:4320    │  │                         │
│  central-1              │  │  central-2              │
│                         │  │  victoriametrics :8428  │
│  Docker: 4C/8Gi         │  │  Docker: 3C/6Gi         │
│  + gateway java -jar    │  │  + gateway java -jar    │
└───────────┬─────────────┘  └───────────┬─────────────┘
            │                            │
            └──────────┬─────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
  华为云 DMS Kafka            华为云 CloudTable
  (172.26.17.53:9092,        ClickHouse
   172.26.17.9:9092,         (待提供地址)
   172.26.17.54:9092)
```

### 1.2 数据流

```
APP / Java Agent / Kong
  │ OTLP gRPC/HTTP
  ▼
ELB（TCP 负载均衡）
  │
  ▼
Edge Collector（3 副本）
  │ 过滤、打标、压缩
  ▼
Kafka（华为云 DMS）
  ├── tsp-test-otel-traces
  └── tsp-test-otel-metrics
  │
  ▼
Central Collector（2 副本）
  ├── clickhouseexporter → ClickHouse otel.otel_traces → MV → platform.tsp_spans
  └── prometheusremotewrite → VictoriaMetrics
  │
  ▼
tsp-monitor-gateway（2 副本）
  ├── /monitor → React 前端看板
  ├── /api     → REST API
  │   ├── 查 ClickHouse（链路数据）
  │   └── 查 VictoriaMetrics（指标数据）
  │
  ▼
ELB（HTTP 80/443 → Gateway :8085）→ 浏览器
```

### 1.3 组件清单

| 组件                  | 镜像                                                                                   | 副本数 | 单副本资源  | 部署位置                |
| ------------------- | ------------------------------------------------------------------------------------ | --- | ------ | ------------------- |
| Edge Collector      | `swr.cn-east-4.myhuaweicloud.com/stsp/otel/opentelemetry-collector-contrib:v0.149.0` | 3   | 1C/2Gi | A×2, B×1            |
| Central Collector   | `swr.cn-east-4.myhuaweicloud.com/stsp/otel/opentelemetry-collector-contrib:v0.149.0` | 2   | 2C/4Gi | A×1, B×1            |
| VictoriaMetrics     | `swr.cn-east-4.myhuaweicloud.com/stsp/victoriametrics/victoria-metrics:v1.139.0`     | 1   | 2C/4Gi | B                   |
| tsp-monitor-gateway | 自建 jar                                                                               | 2   | 1C/1Gi | A×1, B×1（java -jar） |
| Kafka               | 华为云 DMS Kafka 3.x                                                                    | —   | —      | 华为云 PaaS            |
| ClickHouse          | 华为云 CloudTable 24.x                                                                  | —   | —      | 华为云 PaaS            |

### 1.4 文件结构

```
deploy/test/docker/
├── .env.example                    # 环境变量模板
├── .gitignore                      # 忽略 .env 和敏感文件
├── otel-edge/
│   └── config.yaml                 # Edge Collector 配置（Server A/B 共用）
├── otel-central/
│   └── config.yaml                 # Central Collector 配置（Server A/B 共用）
├── server-a/
│   ├── docker-compose.yml          # Server A 启动编排
│   └── .env.example                # Central 连 Server B 的 VM
├── server-b/
│   ├── docker-compose.yml          # Server B 启动编排
│   └── .env.example                # Central 连同机 VM（Docker DNS）
└── TSP可观测性平台-华为云Docker部署运维手册.md  # 本文档
```

---

## 2. 前置条件

### 2.1 服务器配置

| 项目             | 要求                                         |
| -------------- | ------------------------------------------ |
| OS             | Rocky 9 / CentOS Stream 9                  |
| CPU            | 8 核                                        |
| 内存             | 16 GiB                                     |
| 磁盘             | ≥ 100 GiB SSD                              |
| Docker         | ≥ 24.0                                     |
| Docker Compose | ≥ v2.20                                    |
| 内网互通           | Server A ↔ Server B ↔ 华为云 Kafka/ClickHouse |

### 2.2 华为云资源

#### DMS Kafka 实例

| 所需信息 | 说明                                                     |
| ---- | ------------------------------------------------------ |
| 接入地址 | `172.26.17.53:9092,172.26.17.9:9092,172.26.17.54:9092` |
| 认证方式 | PLAINTEXT（无认证）                                         |

**创建 Topic：**（华为云 DMS 控制台创建）

| Topic                   | 分区数 | 副本数 | 保留时间 | 用途      |
| ----------------------- | --- | --- | ---- | ------- |
| `tsp-test-otel-traces`  | 24  | 3   | 72h  | Traces  |
| `tsp-test-otel-metrics` | 12  | 3   | 72h  | Metrics |

> 分区数说明：生产 200 万车场景推荐 traces 24 分区、metrics 12 分区。测试按需下调。

#### CloudTable ClickHouse 实例

| 所需信息      | 说明                                               |
| --------- | ------------------------------------------------ |
| 内网地址      | `clickhouse-xxx.cloudtable.huaweicloud.com`（待提供） |
| Native 端口 | `9000`                                           |
| HTTP 端口   | `8123`                                           |
| 数据库       | `otel`（需提前创建）                                    |

> 建表 SQL 见 `scripts/clickhouse-schema/06_init_database_v3.sql`

### 2.3 华为云 ELB

需要创建 **两个 ELB**：

| ELB     | 类型   | 监听端口       | 后端目标                                     |
| ------- | ---- | ---------- | ---------------------------------------- |
| OTLP 接入 | TCP  | 4317, 4318 | ServerA:4317, ServerA:4319, ServerB:4317 |
| 前端看板    | HTTP | 80/443     | ServerA:8085, ServerB:8085               |

---

## 3. 部署步骤

### 3.1 服务器基础环境

```bash
# 两台服务器都执行

# 1. 卸载 podman（Rocky 9 默认带的，会冒充 docker 但 compose 用不了）
sudo dnf remove -y podman podman-docker 2>/dev/null || true

# 2. 安装 Docker CE
# 优先用阿里云镜像源（国内机器访问 download.docker.com 可能被墙）
sudo tee /etc/yum.repos.d/docker-ce.repo << 'EOF'
[docker-ce-stable]
name=Docker CE Stable - $basearch
baseurl=https://mirrors.aliyun.com/docker-ce/linux/centos/9/$basearch/stable
enabled=1
gpgcheck=1
gpgkey=https://mirrors.aliyun.com/docker-ce/linux/centos/gpg
EOF

sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin curl git
sudo systemctl enable docker --now

# 3. 非 root 用户加 docker 组
sudo usermod -aG docker $USER

# 4. 验证（必须显示 Docker，不是 Podman）
docker --version
# 期望：Docker version 26.x.x ...

docker compose version
# 期望：Docker Compose version v2.x.x ...

# 5. 重新登录使 docker 组生效
exit
```

### 3.2 拉取镜像

```bash
# 两台服务器都执行

# 使用华为云 SWR 镜像（内网免流）
docker pull swr.cn-east-4.myhuaweicloud.com/stsp/otel/opentelemetry-collector-contrib:v0.149.0
docker pull swr.cn-east-4.myhuaweicloud.com/stsp/victoriametrics/victoria-metrics:v1.139.0

# 如拉取失败，用 SWR 控制台确认镜像已推送后重试
```

### 3.3 上传部署文件

```bash
# 将 deploy/test/docker/ 目录分别上传到两台服务器的 /opt/tsp-observability/ 下
# Server A:
scp -r deploy/test/docker/ root@<SERVER_A_IP>:/opt/tsp-observability/

# Server B:
scp -r deploy/test/docker/ root@<SERVER_B_IP>:/opt/tsp-observability/
```

### 3.4 配置环境变量

```bash
# 两台服务器都执行 — 公共 .env
cd /opt/tsp-observability/docker
cp .env.example .env
vi .env        # 改 CLICKHOUSE_HOST / CLICKHOUSE_PASSWORD 等

# Server A — Central 跨机连 VM（用 Server B 实际 IP）
cd /opt/tsp-observability/docker/server-a
cp .env.example .env
vi .env        # VM_ENDPOINT=<SERVER_B_IP>

# Server B — Central 连同机 VM（用 Docker 网络内 DNS）
cd /opt/tsp-observability/docker/server-b
cp .env.example .env
# server-b 的 VM_ENDPOINT=victoriametrics 无需改
```

关键变量：

| 变量                        | 说明              | 示例值                                                    |
| ------------------------- | --------------- | ------------------------------------------------------ |
| `SERVER_A_IP`             | Server A 内网 IP  | `172.26.17.121`                                        |
| `SERVER_B_IP`             | Server B 内网 IP  | `172.26.17.91`                                         |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka 接入地址      | `172.26.17.53:9092,172.26.17.9:9092,172.26.17.54:9092` |
| `CLICKHOUSE_HOST`         | ClickHouse 内网地址 | CloudTable 控制台获取                                       |
| `CLICKHOUSE_PASSWORD`     | ClickHouse 密码   | CloudTable 控制台获取                                       |

### 3.5 启动 Server A

```bash
cd /opt/tsp-observability/docker/server-a
docker compose up -d
docker compose ps
docker compose logs --tail=20
```

期望：3 个容器 Running

```
NAME            STATUS
tsp-edge-1      Up
tsp-edge-2      Up
tsp-central-1   Up
```

### 3.6 启动 Server B

```bash
cd /opt/tsp-observability/docker/server-b
docker compose up -d
docker compose ps
docker compose logs --tail=20
```

期望：3 个容器 Running

```
NAME            STATUS
tsp-edge-3      Up
tsp-central-2   Up
tsp-vm          Up
```

---

## 4. tsp-monitor-gateway 部署（java -jar）

Gateway 为自研 Spring Boot 应用，前后端一体，直接在宿主机以 `java -jar` 运行。

### 4.1 上传 jar 包

```bash
# 两台服务器都执行
mkdir -p /opt/tsp-observability/gateway

# scp 上传 jar 包到两台服务器
scp backend/tsp-monitor-gateway/target/tsp-monitor-gateway-1.0.0.jar root@<SERVER_A_IP>:/opt/tsp-observability/gateway/
scp backend/tsp-monitor-gateway/target/tsp-monitor-gateway-1.0.0.jar root@<SERVER_B_IP>:/opt/tsp-observability/gateway/
```

### 4.2 启动 Gateway

```bash
# Server A 和 Server B 都执行
java -Xms512m -Xmx1024m \
  -Dspring.profiles.active=test \
  -Dclickhouse.host=<CLICKHOUSE_HOST> \
  -Dclickhouse.http.port=8123 \
  -Dclickhouse.user=default \
  -Dclickhouse.password=<CLICKHOUSE_PASSWORD> \
  -Dvictoria.metrics.endpoint=http://<SERVER_B_IP>:8428 \
  -jar /opt/tsp-observability/gateway/tsp-monitor-gateway-1.0.0.jar &
```

### 4.3 验证 Gateway

```bash
curl -s http://localhost:8085/actuator/health
# 期望：{"status":"UP"}
```

### 4.4 配置为 systemd 服务（生产建议）

```bash
sudo tee /etc/systemd/system/tsp-gateway.service << 'EOF'
[Unit]
Description=TSP Monitor Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tsp-observability/gateway
ExecStart=java -Xms512m -Xmx1024m \
  -Dspring.profiles.active=test \
  -Dclickhouse.host=CLICKHOUSE_HOST_PLACEHOLDER \
  -Dclickhouse.http.port=8123 \
  -Dclickhouse.user=default \
  -Dclickhouse.password=CLICKHOUSE_PASSWORD_PLACEHOLDER \
  -Dvictoria.metrics.endpoint=http://SERVER_B_IP_PLACEHOLDER:8428 \
  -jar /opt/tsp-observability/gateway/tsp-monitor-gateway-1.0.0.jar
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 替换实际值后，启动服务
sudo systemctl daemon-reload
sudo systemctl enable tsp-gateway --now
sudo systemctl status tsp-gateway
```

---

## 5. ClickHouse 初始化

连接 ClickHouse 执行建表 SQL：

```bash
# 方式 1：curl（推荐）
curl "http://<CLICKHOUSE_HOST>:8123/" --user default --password "" \
  --multiquery --max-time 60 \
  -d @scripts/clickhouse-schema/06_init_database_v3.sql

# 方式 2：clickhouse-client
clickhouse-client --host <CLICKHOUSE_HOST> --port 9000 --user default \
  --password "" --multiquery < scripts/clickhouse-schema/06_init_database_v3.sql
```

验证：

```sql
-- 标准表（Collector 直接写入）
SELECT table FROM system.tables WHERE database = 'otel' ORDER BY table;

-- 业务表（物化视图自动桥接）
SELECT table FROM system.tables WHERE database = 'platform' ORDER BY table;
```

---

## 6. 华为云 ELB 配置

### 6.1 OTLP 接入 ELB

| 配置项   | 值                                        |
| ----- | ---------------------------------------- |
| 类型    | TCP                                      |
| 监听端口  | 4317, 4318                               |
| 后端服务器 | ServerA:4317, ServerA:4319, ServerB:4317 |
| 健康检查  | TCP，端口 13133（Edge-1/Edge-3）/ 检查 Edge 进程  |

> 注意：Server A 的 edge-2 用的是 4319 端口，ELB 后端必须填 `ServerA_IP:4319`

### 6.2 前端看板 ELB

| 配置项   | 值                                   |
| ----- | ----------------------------------- |
| 类型    | HTTP/HTTPS                          |
| 监听端口  | 80/443                              |
| 后端服务器 | ServerA:8085, ServerB:8085          |
| 健康检查  | HTTP GET `/actuator/health`，端口 8085 |

---

## 7. Java 业务服务接入

### 7.1 启动参数

```bash
java -javaagent:/opt/tsp-observability/javaagent/opentelemetry-javaagent.jar \
  -Dotel.service.name=tsp-service1 \
  -Dotel.resource.attributes=biz.system=STSP \
  -Dotel.exporter.otlp.endpoint=http://<OTLP_ELB_IP>:4317 \
  -Dotel.propagators=tracecontext,baggage \
  -Dotel.traces.sampler=always_on \
  -Dotel.exporter.otlp.protocol=grpc \
  -Dotel.traces.exporter=otlp \
  -Dotel.metrics.exporter=otlp \
  -Dotel.logs.exporter=otlp \
  -Dotel.java.experimental.span-attributes.copy-from-baggage.include=* \
  -Xms512m -Xmx1024m \
  -jar tsp-service.jar
```

| 参数                                         | 说明                                         |
| ------------------------------------------ | ------------------------------------------ |
| `otel.exporter.otlp.endpoint`              | 指向 **OTLP 接入 ELB 内网 IP**，端口 4317           |
| `otel.resource.attributes=biz.system=NTSP` | 业务系统标识（NTSP/STSP 按实际）                      |
| `otel.propagators=tracecontext,baggage`    | 启用 W3C TraceContext + Baggage 传播           |
| `copy-from-baggage.include=*`              | 把 APP 透传的 biz.* baggage 写入 Span Attributes |

### 7.2 验证数据到达

```bash
# 进入 ClickHouse HTTP 接口查询
curl "http://<CLICKHOUSE_HOST>:8123/" --user default --password "" \
  --data "SELECT count() FROM otel.otel_traces WHERE Timestamp > now() - INTERVAL 5 MINUTE"

# 查询业务字段
curl "http://<CLICKHOUSE_HOST>:8123/" --user default --password "" \
  --data "SELECT trace_id, service_name, biz_platform, biz_app_version FROM platform.tsp_spans WHERE biz_platform != '' ORDER BY start_time DESC LIMIT 10 FORMAT Pretty"
```

---

## 8. 运维操作

### 8.1 常用命令

```bash
# 查看容器运行状态
cd /opt/tsp-observability/docker/server-a && docker compose ps

# 查看实时日志
cd /opt/tsp-observability/docker/server-a && docker compose logs -f --tail=50

# 查看特定容器日志
docker logs -f tsp-edge-1 --tail=100

# 重启某个容器
docker compose restart otel-edge-1

# 重启所有容器
docker compose restart

# 停止所有容器
docker compose down

# 更新镜像后重启
docker compose pull
docker compose up -d
```

### 8.2 端口速查

| 端口    | 组件                  | 用途                    |
| ----- | ------------------- | --------------------- |
| 4317  | Edge Collector      | OTLP gRPC 接入          |
| 4318  | Edge Collector      | OTLP HTTP 接入          |
| 4319  | Edge-2 (Server A)   | OTLP gRPC 接入（第二实例）    |
| 8428  | VictoriaMetrics     | Ingest + Query + VMui |
| 8085  | tsp-monitor-gateway | 前端看板 + REST API       |
| 13133 | Edge Collector      | 健康检查                  |
| 13134 | Central Collector   | 健康检查                  |

### 8.3 查看 VictoriaMetrics

浏览器访问：`http://<SERVER_B_IP>:8428/vmui/`，输入 PromQL 查询：

```promql
# QPS
sum(rate(http_server_duration_count{service_name="tsp-service1"}[1m]))

# P99 延迟
histogram_quantile(0.99, sum(rate(http_server_duration_bucket[5m])) by (le))

# JVM 堆内存
jvm_memory_used_bytes{area="heap"} / jvm_memory_max_bytes{area="heap"} * 100
```

### 8.4 日志查看

```bash
# Edge 日志：检查是否有 gRPC 连接错误或 Kafka 写入失败
docker logs tsp-edge-1 --tail=100 | grep -i "error\|warn"

# Central 日志：检查 ClickHouse 写入或 Kafka 消费错误
docker logs tsp-central-1 --tail=100 | grep -i "error\|warn"

# VM 日志：检查写入失败
docker logs tsp-vm --tail=50
```

### 8.5 资源监控

```bash
# 容器资源使用
docker stats --no-stream

# 磁盘使用（file_storage 队列 + VM 数据卷）
docker system df -v | grep tsp
```

---

## 9. 健康检查与告警

### 9.1 检查清单

| 组件                | 健康检查                                            | 期望                |
| ----------------- | ----------------------------------------------- | ----------------- |
| Edge Collector    | `curl -s http://localhost:13133/`               | HTTP 200          |
| Central Collector | `curl -s http://localhost:13134/`               | HTTP 200          |
| VictoriaMetrics   | `curl -s http://localhost:8428/health`          | `OK`              |
| Gateway           | `curl -s http://localhost:8085/actuator/health` | `{"status":"UP"}` |
| Kafka             | 华为云 DMS 控制台查看                                   | 实例正常              |
| ClickHouse        | `curl -s http://<CH>:8123/`                     | `Ok.`             |

### 9.2 告警建议

| 告警项             | 条件                                | 严重级别     |
| --------------- | --------------------------------- | -------- |
| 容器停止            | container != running              | Critical |
| CPU > 80%       | docker stats                      | Warning  |
| 磁盘 > 85%        | df -h                             | Warning  |
| Kafka 消费延迟      | Central 日志 `records_delay` > 5min | Warning  |
| ClickHouse 写入失败 | Central 日志 error                  | Critical |

---

## 10. 故障排查

### Q1：Edge 容器启动后立即退出

```bash
docker logs tsp-edge-1 --tail=50
```

常见原因：配置文件 YAML 缩进错误、env 变量未替换。

### Q2：Central 消费不到数据

```bash
# 确认 Kafka topic 有数据
# 华为云 DMS 控制台 → 消息查询 → topic

# 确认 consumer group 存在
docker logs tsp-central-1 --tail=100 | grep "consumer"
```

### Q3：ClickHouse 写入失败

```bash
# 检查 ClickHouse 连通性
docker exec tsp-central-1 curl -s "http://<CLICKHOUSE_HOST>:8123/"

# 确认用户名密码正确
docker exec tsp-central-1 curl -s "http://<CLICKHOUSE_HOST>:8123/" --user default --password ""
# 期望输出：Ok.
```

### Q4：Gateway 查不到数据

1. 确认 ClickHouse 和 VictoriaMetrics 有数据
2. 确认 Gateway `.env` 中 CLICKHOUSE_HOST / CLICKHOUSE_HTTP_PORT 正确
3. 查看 Gateway 日志：`docker logs tsp-gateway-1 --tail=50`

### Q5：VictoriaMetrics 内存占用过高

```bash
# 降低允许的内存百分比（重启后生效）
# docker-compose.yml 中修改：
#   - "--memory.allowedPercent=60"
```

---

## 11. 生产环境待办

- [ ] ELB 配置 HTTPS 证书（前端看板）
- [ ] VictoriaMetrics 数据卷改为 hostPath 或 NFS（当前为 named volume，容器删除数据丢失）
- [ ] Edge/Central file_storage 队列卷改为 hostPath（确保重启不丢数据）
- [ ] Gateway 构建标准 Docker 镜像并推送到华为云 SWR
- [ ] 接入 Grafana（从 VM 读取 PromQL，统一看板管理）
- [ ] 配置 DingTalk / 飞书 / 企微告警通道
