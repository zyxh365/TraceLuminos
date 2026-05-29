# TSP 可观测性平台 - 测试环境部署文档

> 版本：v1.0（K8s + 华为云托管服务）
> 更新日期：2026-04-16
> 参考文档：TSP可观测性平台部署文档-Rocky9-v4.md、TSP可观测性平台生产环境部署文档.md

---

## 1. 架构概览

### 1.1 与生产环境的差异

| 组件 | 生产环境 | 测试环境 |
|------|---------|---------|
| Edge Collector | Docker Compose + HAProxy | **K8s Deployment (2 副本) + LoadBalancer Service** |
| Central Collector | Docker Compose | **K8s Deployment (2 副本)** |
| Kafka | 3 节点 Docker Compose 集群 | **华为云 DMS Kafka**（托管服务） |
| ClickHouse | Docker Compose（自运维） | **华为云 CloudTable ClickHouse**（托管服务） |
| VictoriaMetrics | Docker Compose | **K8s Deployment**（emptyDir 存储，测试用） |
| HAProxy | Docker Compose（Edge 负载均衡） | **不需要**（K8s Service 替代） |
| tsp-monitor-gateway | 宿主机 java -jar（systemd） | 宿主机 java -jar（systemd） |

### 1.2 数据流

```
Java Agent（业务服务）
  │ OTLP gRPC/HTTP
  ▼
K8s Service: otel-edge (LoadBalancer)
  │ :4317(gRPC) :4318(HTTP)
  ▼
Edge Collector (2 副本, K8s Pod)
  │ kafka exporter
  ▼
华为云 DMS Kafka
  │ tsp-spans / tsp-metrics / tsp-logs
  ▼
Central Collector (2 副本, K8s Pod, Consumer Group)
  │ clickhouseexporter / prometheusremotewrite
  ├──▶ 华为云 ClickHouse (otel.otel_traces → MV → platform.tsp_spans)
  └──▶ VictoriaMetrics (K8s Pod, :8428)
```

### 1.3 文件结构

```
deploy/test/
├── README.md                          ← 本文档
└── k8s/
    ├── namespace.yaml                  # K8s 命名空间
    ├── infra-env-configmap.yaml        # 华为云基础设施地址配置
    ├── edge-collector-configmap.yaml   # Edge Collector 配置
    ├── edge-collector-deployment.yaml  # Edge Collector 部署 + Service
    ├── central-collector-configmap.yaml # Central Collector 配置
    ├── central-collector-deployment.yaml # Central Collector 部署
    └── victoriametrics-deployment.yaml  # VictoriaMetrics 部署 + Service
```

---

## 2. 前置条件

### 2.1 华为云资源准备

在华为云控制台创建以下资源，并记录连接信息：

| 资源 | 服务 | 所需信息 | 用途 |
|------|------|---------|------|
| Kafka 实例 | 分布式消息服务 DMS | 接入地址（bootstrap.servers）、SASL 用户名密码 | 遥测数据缓冲 |
| ClickHouse 实例 | 云数据库 CloudTable | TCP 地址（:9000）、HTTP 地址（:8123）、用户名密码 | Trace/Metrics 存储 |

> **注意**：华为云 DMS Kafka 默认开启 SASL 认证。如果开启，需要在 Collector 配置中增加 SASL 配置（见 4.2 节）。

### 2.2 K8s 集群

已有一套可用的 Kubernetes 集群（华为云 CCE 或自建），`kubectl` 已配置可连接。

```bash
kubectl version --short
kubectl get nodes
```

### 2.3 tsp-monitor-gateway 部署机

一台能访问 K8s 集群和华为云资源的机器，用于部署 tsp-monitor-gateway。

---

## 3. 部署步骤

### 3.1 创建命名空间

```bash
kubectl apply -f k8s/namespace.yaml
kubectl get namespace tsp-observability
```

### 3.2 配置华为云基础设施地址

编辑 `k8s/infra-env-configmap.yaml`，替换为实际地址：

```yaml
KAFKA_BOOTSTRAP_SERVERS: "kafka-xxx.dms.huaweicloud.com:9092"
CLICKHOUSE_HOST: "clickhouse-xxx.cloudtable.huaweicloud.com"
CLICKHOUSE_NATIVE_PORT: "9000"
CLICKHOUSE_HTTP_PORT: "8123"
```

应用配置：

```bash
kubectl apply -f k8s/infra-env-configmap.yaml
```

### 3.3 部署 Edge Collector

```bash
kubectl apply -f k8s/edge-collector-configmap.yaml
kubectl apply -f k8s/edge-collector-deployment.yaml

# 验证
kubectl -n tsp-observability get pods -l app=otel-edge
kubectl -n tsp-observability get svc otel-edge
```

### 3.4 部署 Central Collector

```bash
kubectl apply -f k8s/central-collector-configmap.yaml
kubectl apply -f k8s/central-collector-deployment.yaml

# 验证
kubectl -n tsp-observability get pods -l app=otel-central
```

### 3.5 部署 VictoriaMetrics

```bash
kubectl apply -f k8s/victoriametrics-deployment.yaml

# 验证
kubectl -n tsp-observability get pods -l app=victoriametrics
kubectl -n tsp-observability get svc victoriametrics
```

> **注意**：测试环境 VictoriaMetrics 使用 `emptyDir` 存储，Pod 重启后数据丢失。生产环境应改用 PVC。

### 3.6 华为云 ClickHouse 初始化

通过华为云 ClickHouse 控制台或客户端工具执行建表 SQL：

```bash
# 通过华为云 ClickHouse HTTP 接口执行（替换为实际地址）
curl "<CLICKHOUSE_HTTP_URL>:8123/" --user default --password "" \
  --multiquery --max-time 60 \
  -d @../../scripts/clickhouse-schema/01_init_database.sql
```

或者使用 ClickHouse 客户端工具（DBeaver / clickhouse-client）连接后手动执行。

验证：

```sql
-- 标准表
SELECT table FROM system.tables WHERE database = 'otel' ORDER BY table;

-- 业务表
SELECT table FROM system.tables WHERE database = 'platform' ORDER BY table;
```

### 3.7 华为云 Kafka 创建 Topic

通过华为云 DMS Kafka 控制台创建以下 Topic：

| Topic | 分区数 | 副本数 | 保留时间 |
|-------|--------|--------|---------|
| `tsp-spans` | 3 | 1 | 72h |
| `tsp-metrics` | 3 | 1 | 72h |
| `tsp-logs` | 3 | 1 | 72h |
| `tsp-events` | 3 | 1 | 48h |

或通过 Kafka 客户端工具创建（需要 SASL 认证信息）：

```bash
kafka-topics.sh --bootstrap-server <KAFKA_BOOTSTRAP_SERVERS> \
  --command-config <client.properties> \
  --create --topic tsp-spans --partitions 3 --replication-factor 1 \
  --config retention.ms=259200000 --config compression.type=lz4
```

---

## 4. 配置说明

### 4.1 华为云 Kafka SASL 认证（如需）

华为云 DMS Kafka 默认开启 SASL_PLAIN 认证。如果是，需修改 Edge 和 Central Collector 的 Kafka receiver/exporter 配置：

**Edge Collector `config.yaml` 中 Kafka exporter 改为：**

```yaml
exporters:
  kafka/traces:
    brokers: ["${KAFKA_BOOTSTRAP_SERVERS}"]
    topic: tsp-spans
    encoding: otlp_proto
    authentication:
      sasl:
        mechanism: PLAIN
        username: "${KAFKA_SASL_USERNAME}"
        password: "${KAFKA_SASL_PASSWORD}"
    ...
```

**Central Collector `config.yaml` 中 Kafka receiver 改为：**

```yaml
receivers:
  kafka/traces:
    brokers: ["${KAFKA_BOOTSTRAP_SERVERS}"]
    topics: [tsp-spans]
    encoding: otlp_proto
    initial_offset: latest
    group_id: central-traces-consumer
    authentication:
      sasl:
        mechanism: PLAIN
        username: "${KAFKA_SASL_USERNAME}"
        password: "${KAFKA_SASL_PASSWORD}"
```

在 `infra-env-configmap.yaml` 中添加 SASL 凭据：

```yaml
KAFKA_SASL_USERNAME: "your_username"
KAFKA_SASL_PASSWORD: "your_password"
```

### 4.2 华为云 ClickHouse TLS（如需）

华为云 ClickHouse 可能要求 TLS 连接。修改 Central Collector 的 clickhouse exporter：

```yaml
exporters:
  clickhouse:
    endpoint: tcp://${CLICKHOUSE_HOST}:${CLICKHOUSE_NATIVE_PORT}?secure=true&skip_verify=true
    database: otel
    tls:
      insecure: true
      insecure_skip_verify: true
```

### 4.3 Java Agent OTLP 上报地址

Java 服务的 OTLP endpoint 指向 K8s Edge Collector 的 LoadBalancer Service 外部 IP：

```bash
-Dotel.exporter.otlp.endpoint=http://<EDGE_LB_IP>:4317
```

获取 LoadBalancer IP：

```bash
kubectl -n tsp-observability get svc otel-edge -o wide
# 如果是 NodePort，使用 <K8S_NODE_IP>:<NODE_PORT>
# 如果是 LoadBalancer，使用 EXTERNAL-IP
```

---

## 5. 全链路验证

### 5.1 发送测试 Trace

```bash
# 替换 <EDGE_LB_IP> 为实际地址
curl -s -X POST http://<EDGE_LB_IP>:4318/v1/traces \
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
          "startTimeUnixNano": "1744771200000000000",
          "endTimeUnixNano": "1744771202000000000",
          "status": {"code": 1},
          "attributes": [
            {"key":"http.method","value":{"stringValue":"POST"}},
            {"key":"http.route","value":{"stringValue":"/api/commands"}},
            {"key":"baggage.vin","value":{"stringValue":"TEST_VIN_001"}},
            {"key":"baggage.tenantId","value":{"stringValue":"TEST_TENANT"}}
          ]
        }]}]
    }]
  }'
# 期望：HTTP 200（无输出即成功）
```

### 5.2 ClickHouse 数据验证

```bash
# 等待 Central 消费写入（约 15-30 秒）
sleep 20

# 验证标准表
curl "<CLICKHOUSE_HTTP_URL>:8123/" --user default --password "" \
  --data "SELECT count() FROM otel.otel_traces WHERE toDateTime(Timestamp) > now() - INTERVAL 5 MINUTE"

# 验证业务表（MV 自动桥接）
curl "<CLICKHOUSE_HTTP_URL>:8123/" --user default --password "" \
  --data "SELECT count() FROM platform.tsp_spans WHERE start_time > now() - INTERVAL 5 MINUTE"

# 验证业务字段
curl "<CLICKHOUSE_HTTP_URL>:8123/" --user default --password "" \
  --data "SELECT biz_vin, service_name, name, duration_ns/1000000 AS ms FROM platform.tsp_spans WHERE biz_vin != '' ORDER BY start_time DESC LIMIT 10 FORMAT Pretty"
```

### 5.3 VictoriaMetrics 数据验证

```bash
# 通过 kubectl port-forward 访问 VM
kubectl -n tsp-observability port-forward svc/victoriametrics 8428:8428 &

# 查询当前指标
curl -s "http://localhost:8428/api/v1/query?query=up" | python3 -m json.tool

# 查看数据写入
curl -s "http://localhost:8428/api/v1/status/tsdb" | python3 -m json.tool
```

### 5.4 Pod 日志检查

```bash
# Edge Collector 日志
kubectl -n tsp-observability logs -l app=otel-edge --tail=50

# Central Collector 日志
kubectl -n tsp-observability logs -l app=otel-central --tail=50

# 查看是否有错误
kubectl -n tsp-observability logs -l app=otel-edge --tail=100 | grep -i error
kubectl -n tsp-observability logs -l app=otel-central --tail=100 | grep -i error
```

---

## 6. tsp-monitor-gateway 部署

### 6.1 配置连接地址

tsp-monitor-gateway 的 Spring 配置中，ClickHouse 和 VictoriaMetrics 地址指向华为云和 K8s：

```yaml
# application-test.yml
spring:
  datasource:
    clickhouse:
      url: jdbc:clickhouse://<CLICKHOUSE_HOST>:<CLICKHOUSE_HTTP_PORT>/platform
      username: default
      password: ""

victoria-metrics:
  endpoint: http://<K8S_NODE_IP>:31234  # 或 NodePort
  # 如果配置了 Ingress，用 Ingress 地址
```

### 6.2 启动服务

```bash
# 创建目录
mkdir -p /opt/tsp-deploy/monitor/frontend
mkdir -p /opt/tsp-deploy/monitor/logs

# 上传 jar 包和前端构建产物（从开发机）
scp tsp-monitor-gateway.jar <MONITOR_HOST>:/opt/tsp-deploy/monitor/
scp -r frontend/build/* <MONITOR_HOST>:/opt/tsp-deploy/monitor/frontend/

# 创建 systemd 服务
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
  --spring.profiles.active=test > /opt/tsp-deploy/monitor/logs/gateway.log 2>&1 &
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tsp-monitor-gateway
systemctl start tsp-monitor-gateway
```

---

## 7. 日常运维

### 7.1 K8s 组件运维

```bash
# 查看所有 Pod
kubectl -n tsp-observability get pods

# 查看 Pod 详情
kubectl -n tsp-observability describe pod <pod-name>

# 查看 Pod 日志
kubectl -n tsp-observability logs -l app=otel-edge -f
kubectl -n tsp-observability logs -l app=otel-central -f

# 重启 Collector
kubectl -n tsp-observability rollout restart deployment/otel-edge
kubectl -n tsp-observability rollout restart deployment/otel-central

# 扩缩副本数
kubectl -n tsp-observability scale deployment/otel-edge --replicas=3

# 查看 ConfigMap
kubectl -n tsp-observability get configmaps

# 更新 ConfigMap（修改后自动生效，需重启 Pod）
kubectl -n tsp-observability rollout restart deployment/otel-edge
```

### 7.2 tsp-monitor-gateway 运维

```bash
systemctl status tsp-monitor-gateway
journalctl -u tsp-monitor-gateway -f
systemctl restart tsp-monitor-gateway
```

---

## 8. 端口速查

| 端口 | 组件 | 位置 | 用途 |
|------|------|------|------|
| 4317 | otel-edge Service | K8s LoadBalancer | OTLP gRPC 入口 |
| 4318 | otel-edge Service | K8s LoadBalancer | OTLP HTTP 入口 |
| 8428 | victoriametrics Service | K8s ClusterIP | VM Ingest + Query + VMui |
| 9000 | 华为云 ClickHouse | 华为云 | Native 协议（clickhouseexporter） |
| 8123 | 华为云 ClickHouse | 华为云 | HTTP 接口 |
| 9092 | 华为云 DMS Kafka | 华为云 | Broker |
| 8085 | tsp-monitor-gateway | 宿主机 | 前端看板 + 后端 API |

---

## 9. 故障排查

### Q1：Edge Collector 收到请求但 Central 没有数据

```bash
# 1. 检查 Edge 日志是否有 Kafka 写入错误
kubectl -n tsp-observability logs -l app=otel-edge --tail=50 | grep -i "kafka\|error"

# 2. 检查 Kafka Topic 是否存在
# 通过华为云 DMS 控制台确认

# 3. 检查 SASL 认证是否配置
# 如果华为云 Kafka 开启了 SASL，检查 4.1 节配置
```

### Q2：Central Collector 连 ClickHouse 失败

```bash
# 查看 Central 日志
kubectl -n tsp-observability logs -l app=otel-central --tail=100 | grep -i "clickhouse\|error"

# 常见原因：
# 1. 华为云 ClickHouse 未开通外网访问，需通过 VPC 内网访问
# 2. 用户名密码错误
# 3. otel 数据库或 otel_traces 表未创建（见 3.6 节）
# 4. 华为云安全组未放行 K8s 子网的 9000 端口
```

### Q3：Java Agent 连不上 Edge Collector

```bash
# 1. 确认 LoadBalancer IP 或 NodePort 可达
curl -v http://<EDGE_LB_IP>:4318/

# 2. 如果是 NodePort
kubectl -n tsp-observability get svc otel-edge
# 确认 NodePort 端口号，然后用 <K8S_NODE_IP>:<NODE_PORT> 访问
```

### Q4：VictoriaMetrics 无 Metrics 数据

```bash
# 1. 确认 Central Collector 的 prometheusremotewrite exporter 正常
kubectl -n tsp-observability logs -l app=otel-central --tail=50 | grep -i "remote\|vm\|victoria"

# 2. 确认 VictoriaMetrics Service DNS 在 K8s 集群内可解析
kubectl -n tsp-observability run --rm -it curlimages/curl -- curl -s http://victoriametrics:8428/health
```

---

## 10. 从测试环境迁移到生产环境的差异点

| 改造项 | 测试环境 | 生产环境 |
|--------|---------|---------|
| Edge Collector | K8s LoadBalancer | K8s + 内网 LB / Nginx Ingress |
| VictoriaMetrics 存储 | emptyDir（Pod 重启丢失） | **PVC（持久化存储）** |
| Kafka | 华为云 DMS 单实例 | 华为云 DMS 3 副本 |
| ClickHouse | 华为云 CloudTable 单节点 | 华为云 CloudTable 集群 + 冷热分离 |
| Collector 副本数 | 各 2 | 各 3-5 |
| HAProxy | 不需要（K8s Service 替代） | 按 Ingress / 内网 LB 配置 |
| 日志管道 | logs pipeline 未消费 | 接入日志平台（华为云 LTS） |
| Flink 事件消费 | 未启用 | 启用 tsp-events Topic → Flink |

### 生产环境 VictoriaMetrics PVC 示例

```yaml
# 将 victoriametrics-deployment.yaml 的 emptyDir 替换为 PVC
volumes:
  - name: data
    persistentVolumeClaim:
      claimName: vm-data
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: vm-data
  namespace: tsp-observability
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: cce-evs  # 华为云 CCE EVS 云硬盘
  resources:
    requests:
      storage: 200Gi
```

---

## 附录：一键部署命令

```bash
# 全量部署
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/infra-env-configmap.yaml
kubectl apply -f k8s/edge-collector-configmap.yaml
kubectl apply -f k8s/edge-collector-deployment.yaml
kubectl apply -f k8s/central-collector-configmap.yaml
kubectl apply -f k8s/central-collector-deployment.yaml
kubectl apply -f k8s/victoriametrics-deployment.yaml

# 验证所有 Pod Running
kubectl -n tsp-observability get pods -o wide

# 全量删除
kubectl delete namespace tsp-observability
```
