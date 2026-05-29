# TSP 可观测性平台 — 华为云 Docker 部署运维手册

> 版本：v6.0 | 环境：测试 | 更新日期：2026-05-15

---

## 1. 架构总览

```
                         华为云 ELB（内网）
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────────┐
│  Server A (8C16G)        │   │  Server B (8C16G)            │
│  172.26.17.121           │   │  172.26.17.91                │
│                          │   │                              │
│  Edge-1  :4317/4318      │   │  Central-2                   │
│  Edge-2  :4319/4320      │   │  VictoriaMetrics  :8428      │
│  Edge-3  :4321/4322      │   │  ClickHouse       :9000/8123 │
│  Central-1               │   │                              │
│                          │   │                              │
│  已用: 5C/10Gi           │   │  已用: 5C/10Gi               │
│  剩余: 3C/6Gi            │   │  剩余: 3C/6Gi                │
└──────────┬───────────────┘   └──────────────┬───────────────┘
           │                                  │
           │    华为云 DMS Kafka               │
           │    172.26.17.53:9092              │
           │    172.26.17.9:9092               │
           │    172.26.17.54:9092              │
           └────────────────┬─────────────────┘
                            │
                    Central Collector 消费
```

### 组件清单

| 组件 | 镜像 | 用途 | Server |
|---|---|---|---|
| Edge Collector ×3 | `swr.cn-east-4.../otel/opentelemetry-collector-contrib:v0.149.0` | 接收 OTLP → Kafka | A |
| Central Collector ×2 | 同上 | Kafka → ClickHouse / VM | A×1, B×1 |
| VictoriaMetrics | `swr.cn-east-4.../victoriametrics/victoria-metrics:v1.139.0` | 指标存储 + VMui | B |
| ClickHouse | `swr.cn-east-4.../clickhouse/clickhouse-server:24.3.12.75-alpine` | 链路存储 | B |

### 数据流

```
Java Agent / APP
  │ OTLP (traceparent + baggage)
  ▼
ELB → Edge Collector (A) → Kafka (DMS)
                              │
                              ▼
                      Central Collector (A+B)
                         │              │
                         ▼              ▼
                    ClickHouse    VictoriaMetrics
                      (B)            (B)
```

---

## 2. 前置准备

### 2.1 服务器环境

| 项目 | 要求 |
|---|---|
| OS | Rocky Linux 9 / CentOS 9 |
| CPU | 8C |
| 内存 | 16Gi |
| 系统盘 | 40GB+ |
| 数据盘 | 200GB+ SSD（挂载到 /opt） |
| 网络 | VPC 内网互通 |

### 2.2 网络互通确认

```bash
# 两台服务器之间互通
ping -c 3 172.26.17.91   # 在 A 上执行
ping -c 3 172.26.17.121  # 在 B 上执行

# 到 Kafka 互通
telnet 172.26.17.53 9092
```

### 2.3 华为云 DMS Kafka 准备

| 项目 | 值 |
|---|---|
| 接入地址 | `172.26.17.53:9092,172.26.17.9:9092,172.26.17.54:9092` |
| 认证方式 | PLAINTEXT（无认证） |

创建 Topic（在 DMS 控制台操作）：

| Topic | 分区数 | 保留时间 |
|---|---|---|
| `tsp-test-otel-traces` | 24 | 72h |
| `tsp-test-otel-metrics` | 12 | 72h |

### 2.4 华为云 SWR 镜像准备

将以下镜像推送到华为云 SWR 组织 `stsp`：

```bash
# 在能出网的机器上拉取并推送
docker pull otel/opentelemetry-collector-contrib:v0.149.0
docker pull victoriametrics/victoria-metrics:v1.139.0
docker pull clickhouse/clickhouse-server:24.3.12.75-alpine

# 打标签并推送
docker tag otel/opentelemetry-collector-contrib:v0.149.0 swr.cn-east-4.myhuaweicloud.com/stsp/otel/opentelemetry-collector-contrib:v0.149.0
docker tag victoriametrics/victoria-metrics:v1.139.0 swr.cn-east-4.myhuaweicloud.com/stsp/victoriametrics/victoria-metrics:v1.139.0
docker tag clickhouse/clickhouse-server:24.3.12.75-alpine swr.cn-east-4.myhuaweicloud.com/stsp/clickhouse/clickhouse-server:24.3.12.75-alpine

# 推送
docker push swr.cn-east-4.myhuaweicloud.com/stsp/otel/opentelemetry-collector-contrib:v0.149.0
docker push swr.cn-east-4.myhuaweicloud.com/stsp/victoriametrics/victoria-metrics:v1.139.0
docker push swr.cn-east-4.myhuaweicloud.com/stsp/clickhouse/clickhouse-server:24.3.12.75-alpine
```

---

## 3. 安装 Docker

### 3.1 安装步骤

```bash
# 1. 卸载旧版本
sudo dnf remove -y podman podman-docker docker docker-client 2>/dev/null

# 2. 添加 Docker CE 仓库（华为云环境用阿里云镜像）
sudo tee /etc/yum.repos.d/docker-ce.repo << 'EOF'
[docker-ce-stable]
name=Docker CE Stable - $basearch
baseurl=https://mirrors.aliyun.com/docker-ce/linux/centos/9/$basearch/stable
enabled=1
gpgcheck=1
gpgkey=https://mirrors.aliyun.com/docker-ce/linux/centos/gpg
EOF

# 3. 安装 Docker
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 4. 启动并设置自启
sudo systemctl enable docker --now

# 5. 验证
docker --version
# 期望: Docker version 26.x.x ...
docker compose version
# 期望: Docker Compose version v2.x.x ...
```

> **注意**：如果阿里云镜像源超时，可改用离线安装：
> 在能出网的机器上下载 RPM 包（`containerd.io`、`docker-ce`、`docker-ce-cli`、`docker-compose-plugin`），scp 到服务器后用 `rpm -ivh *.rpm` 安装。

### 3.2 配置 Docker

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "data-root": "/opt/docker-data"
}
EOF
sudo systemctl restart docker
```

---

## 4. 部署文件

### 4.1 上传部署包

```bash
# 在开发机上执行，上传整个部署目录到两台服务器
scp -r deploy/test/docker2/ root@172.26.17.121:/opt/tsp-observability/
scp -r deploy/test/docker2/ root@172.26.17.91:/opt/tsp-observability/
```

上传后目录结构：

```
/opt/tsp-observability/docker/
├── .env.example                    # 共享环境变量
├── otel-edge/config.yaml           # Edge Collector 配置
├── otel-central/config.yaml        # Central Collector 配置
├── otel-clickhouse/
│   ├── config.xml                  # ClickHouse 配置
│   ├── users.xml                   # ClickHouse 用户
│   └── init.d/01_init_database.sql # 自动化建库建表
├── server-a/
│   ├── docker-compose.yml          # Server A: Edge×3 + Central×1
│   └── .env.example                # Server A 环境变量
└── server-b/
    ├── docker-compose.yml          # Server B: Central + VM + ClickHouse
    └── .env.example                # Server B 环境变量
```

### 4.2 配置环境变量

**两台服务器上都执行：**

```bash
cd /opt/tsp-observability/docker

# 复制共享 .env
cp .env.example .env
# 检查并修改 Kafka / ClickHouse 参数（Kafka 地址确认正确）
vi .env
```

**Server A（172.26.17.121）：**

```bash
cd /opt/tsp-observability/docker/server-a

cp .env.example .env
# 把 <SERVER_B_IP> 替换为 172.26.17.91
sed -i 's/<SERVER_B_IP>/172.26.17.91/' .env
cat .env
# 确认: CLICKHOUSE_HOST=172.26.17.91
```

**Server B（172.26.17.91）：**

```bash
cd /opt/tsp-observability/docker/server-b

cp .env.example .env
# 本机 ClickHouse，使用容器名解析
# CLICKHOUSE_HOST=clickhouse，无需修改
cat .env
```

### 4.3 创建数据目录

**Server A：**

```bash
mkdir -p /opt/tsp-observability/docker/server-a/data/{edge-1-queue,edge-2-queue,edge-3-queue,central-queue}
chmod -R 777 /opt/tsp-observability/docker/server-a/data
```

**Server B：**

```bash
mkdir -p /opt/tsp-observability/docker/server-b/data/{central-queue,vm-data,clickhouse-data,clickhouse-logs}
chmod -R 777 /opt/tsp-observability/docker/server-b/data
```

### 4.4 拉取镜像

```bash
# Server A
cd /opt/tsp-observability/docker/server-a
docker compose pull

# Server B
cd /opt/tsp-observability/docker/server-b
docker compose pull
```

### 4.5 启动服务

**先启动 Server B（ClickHouse 需要先启动以便 A 上的 Central 连接）：**

```bash
# Server B
cd /opt/tsp-observability/docker/server-b
docker compose up -d

# 等待 ClickHouse 和 VM 启动
sleep 20
docker compose ps
```

**再启动 Server A：**

```bash
# Server A
cd /opt/tsp-observability/docker/server-a
docker compose up -d

# 查看状态
docker compose ps
```

---

## 5. 验证部署

### 5.1 容器运行状态

```bash
# Server A（期望 4 个容器: tsp-edge-1, tsp-edge-2, tsp-edge-3, tsp-central-1）
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Server B（期望 3 个容器: tsp-central-2, tsp-vm, tsp-clickhouse）
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 5.2 Edge Collector

```bash
# 健康检查
curl -s http://localhost:13133/
# 期望: Server A available

# 日志（无 Error）
docker logs --tail=10 tsp-edge-1
```

### 5.3 Central Collector

```bash
# 健康检查（A 上）
curl -s http://localhost:13134/
# 期望: Server B available（宿主机端口已重映射）

# 日志确认 Kafka 连接和 ClickHouse 写入
docker logs --tail=20 tsp-central-1 | grep -i "kafka\|clickhouse"
```

### 5.4 ClickHouse

```bash
# 健康检查
docker exec tsp-clickhouse clickhouse-client --query "SELECT 1"

# 确认数据库和表
docker exec tsp-clickhouse clickhouse-client --query "SHOW DATABASES"
# 期望包含: otel, platform

docker exec tsp-clickhouse clickhouse-client --query "SHOW TABLES FROM platform"
# 期望包含: tsp_spans, mv_otel_to_spans
```

### 5.5 VictoriaMetrics

```bash
curl -s http://localhost:8428/health
# 期望: OK

# VMui 可访问
curl -s -o /dev/null -w "%{http_code}" http://localhost:8428/vmui/
# 期望: 200
```

### 5.6 端到端验证

```bash
# 发送测试 trace（在 A 上执行）
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "test-trace"}}
        ]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
          "spanId": "00f067aa0ba902b7",
          "name": "test.verify",
          "kind": 1,
          "startTimeUnixNano": "'$(date +%s)000000000'",
          "endTimeUnixNano": "'$(($(date +%s)+1))000000000'"
        }]
      }]
    }]
  }'

# 确认 ClickHouse 中可见（等待 10-30 秒后查询）
docker exec tsp-clickhouse clickhouse-client --query "SELECT trace_id, name FROM platform.tsp_spans WHERE trace_id = '4bf92f3577b34da6a3ce929d0e0e4736'"
```

---

## 6. ELB 配置

### 6.1 Edge Collector 负载均衡

| 项目 | 值 |
|---|---|
| ELB 类型 | 内网 |
| 协议 | TCP |
| 后端端口 | 4317, 4318 |
| 后端服务器 | 172.26.17.121 |

**后端服务器组（Server A 三个 Edge 实例）：**

| 实例 | gRPC 端口 | HTTP 端口 | 健康检查端口 |
|---|---|---|---|
| Edge-1 | 4317 | 4318 | 13133 |
| Edge-2 | 4319 | 4320 | - |
| Edge-3 | 4321 | 4322 | - |

> ELB 健康检查配置：TCP，端口 13133，检查 Edge-1。Edge-1 健康代表整机 OK（三实例共享同一 Docker 网络）。

### 6.2 对外暴露

| 服务 | ELB 类型 | 端口 |
|---|---|---|
| OTLP gRPC（Agent 上报） | 内网 ELB | 4317 |
| OTLP HTTP | 内网 ELB | 4318 |
| ClickHouse HTTP（自研看板查询） | 内网 IP | 172.26.17.91:8123 |
| VMui（指标看板） | 内网 IP | 172.26.17.91:8428 |

---

## 7. 日常运维

### 7.1 启停命令

```bash
# Server A
cd /opt/tsp-observability/docker/server-a
docker compose up -d          # 启动
docker compose stop           # 停止
docker compose restart        # 重启

# Server B
cd /opt/tsp-observability/docker/server-b
docker compose up -d
docker compose stop
docker compose restart
```

> **停启顺序**：停止时先 A 后 B，启动时先 B 后 A（保证 ClickHouse 先就绪）。

### 7.2 查看日志

```bash
# 实时日志
docker logs -f --tail=50 tsp-edge-1
docker logs -f --tail=50 tsp-central-1
docker logs -f --tail=50 tsp-clickhouse

# 按时间过滤日志
docker logs --since 10m tsp-central-1
```

### 7.3 ClickHouse 运维

```bash
# 进入 ClickHouse 客户端
docker exec -it tsp-clickhouse clickhouse-client

# 常用查询
SELECT count() FROM platform.tsp_spans;                          -- Span 总量
SELECT count() FROM platform.tsp_spans WHERE start_time > now() - INTERVAL 1 HOUR; -- 最近1小时
SELECT database, table, formatReadableSize(sum(bytes_on_disk))   -- 表大小
FROM system.parts WHERE active = 1 GROUP BY database, table;

# 查看磁盘使用
docker exec tsp-clickhouse du -sh /var/lib/clickhouse

# 手动备份
docker exec tsp-clickhouse clickhouse-backup create
```

### 7.4 VictoriaMetrics 运维

```bash
# 查看指标量
curl -s http://localhost:8428/api/v1/status/tsdb | python3 -m json.tool

# 查询 samples 总数
curl -s "http://localhost:8428/api/v1/query?query=sum(vm_rows{type=\"indexdb\"})"
```

### 7.5 日志清理

```bash
# 限制 Docker 日志大小（daemon.json 已配置 10m × 3 文件）
docker system prune -a --volumes -f   # 谨慎执行，会删未使用镜像/卷
```

---

## 8. 故障排查

### 8.1 容器无法启动

```bash
# 查看退出状态
docker ps -a

# 查看启动日志
docker logs tsp-edge-1 2>&1 | tail -50
```

### 8.2 Edge → Kafka 不通

```bash
# 确认网络
docker exec tsp-edge-1 curl -v telnet://172.26.17.53:9092 --max-time 5

# 确认 topic 存在（DMS 控制台检查）
```

### 8.3 Central → ClickHouse 不通

```bash
# Server A 上确认到 B 的 9000 端口
telnet 172.26.17.91 9000

# B 上确认 ClickHouse 监听
docker exec tsp-clickhouse clickhouse-client --query "SELECT 1"

# 查看 Central 日志中 ClickHouse 相关错误
docker logs tsp-central-1 2>&1 | grep -i "clickhouse\|error"
```

### 8.4 ClickHouse 数据未写入

```bash
# 1. 确认 otel.otel_traces 有数据
docker exec tsp-clickhouse clickhouse-client --query "SELECT count() FROM otel.otel_traces"

# 2. 确认物化视图存在且活跃
docker exec tsp-clickhouse clickhouse-client --query "SELECT name, total_rows FROM system.tables WHERE database = 'platform' AND engine = 'MaterializedView'"

# 3. 查看 ClickHouse 日志
docker logs --tail=50 tsp-clickhouse 2>&1 | grep -i error
```

---

## 9. 环境变量参考

### 共享 .env

| 变量 | 默认值 | 说明 |
|---|---|---|
| `BUSINESS` | `tsp` | 业务标识，用于 Kafka topic 前缀 |
| `DEPLOY_ENV` | `test` | 部署环境 |
| `REGION` | `cn-east-4` | 区域标识 |
| `KAFKA_BOOTSTRAP_SERVERS` | `172.26.17.53:9092,...` | Kafka 接入地址 |
| `CLICKHOUSE_NATIVE_PORT` | `9000` | ClickHouse Native 端口 |
| `CLICKHOUSE_HTTP_PORT` | `8123` | ClickHouse HTTP 端口 |
| `CLICKHOUSE_USER` | `default` | ClickHouse 用户 |
| `CLICKHOUSE_PASSWORD` | `tsp123456` | ClickHouse 密码 |
| `CLICKHOUSE_DATABASE` | `platform` | ClickHouse 业务库 |

### Server A .env

| 变量 | 值 | 说明 |
|---|---|---|
| `CLICKHOUSE_HOST` | `172.26.17.91` | ClickHouse 在 B 上，跨机访问 |

### Server B .env

| 变量 | 值 | 说明 |
|---|---|---|
| `CLICKHOUSE_HOST` | `clickhouse` | ClickHouse 在 Docker 网络内 |
| `VM_ENDPOINT` | `victoriametrics` | VM 在 Docker 网络内 |

---

## 10. Java 服务接入

### 10.1 启动命令

```bash
java -javaagent:/opt/tsp-observability/javaagent/opentelemetry-javaagent.jar \
  -Dotel.service.name=tsp-service1 \
  -Dotel.resource.attributes=biz.system=NTSP \
  -Dotel.exporter.otlp.endpoint=http://<ELB_INTERNAL_IP>:4317 \
  -Dotel.propagators=tracecontext,baggage \
  -Dotel.traces.sampler=always_on \
  -Dotel.exporter.otlp.protocol=grpc \
  -Dotel.traces.exporter=otlp \
  -Dotel.java.experimental.span-attributes.copy-from-baggage.include=* \
  -jar /opt/tsp-observability/tsp-service1.jar
```

> `<ELB_INTERNAL_IP>` 替换为 ELB 的实际内网 IP。

### 10.2 pom.xml 依赖

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>io.opentelemetry</groupId>
            <artifactId>opentelemetry-bom</artifactId>
            <version>1.54.0</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>

<dependencies>
    <dependency>
        <groupId>io.opentelemetry</groupId>
        <artifactId>opentelemetry-api</artifactId>
    </dependency>
</dependencies>
```
