# TSP 可观测性平台 — K8s 部署运维手册

> **版本**：v1.0
> **更新日期**：2026-04-20
> **适用环境**：华为云 CCE / 自建 K8s 测试环境

---

## 1. 架构概述

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        K8s 集群 (tsp-observability)                      │
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────────────┐  │
│  │  otel-edge   │    │ otel-central │    │    victoria-metrics       │  │
│  │  (2 副本)     │    │  (2 副本)    │     │    (1 副本)               │  │
│  │  :4317/:4318 │    │              │    │    :8428                  │  │
│  └──────┬───────┘    └──────┬───────┘    └────────────▲──────────────┘  │
│         │                   │                          │                 │
└─────────┼───────────────────┼──────────────────────────┼─────────────────┘
          │ OTLP              │                          │
          │                   ▼                          │ Prometheus RW
          │            ┌──────────┐                      │
          │            │  Kafka   │  ◄── 华为云 DMS       │
          │            └────┬─────┘                      │
          │                 │                            │
          │                 ▼                            │
          │          ┌────────────┐                      │
          │          │ ClickHouse │  ◄── 华为云 CloudTable│
          │          └────┬───────┘                      │
          │               │                              │
          │               ▼                              │
          │        ┌──────────────┐                      │
          │        │ tsp-monitor  │  ◄── K8s Deployment  │
          │        │  -gateway    │      (本集群或另一集群)│
          │        │  :8085       │                      │
          │        └──────────────┘                      │
          │                                              │
┌─────────┴──────────────────────────────────────────────┴────────────────┐
│                        Java Agent（业务服务）                             │
│    tsp-service1  ·  tsp-service2  ·  其他微服务                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 数据流

```
① Java Agent 自动埋点 → OTLP gRPC/HTTP
② ──────────────────→ Edge Collector（接收 + 变换 + 过滤）
③                        │ kafka exporter（otlp_proto 编码）
④                        ▼
                    华为云 DMS Kafka
                    ├── tsp-spans   (Traces)
                    ├── tsp-metrics (Metrics)
                    ├── tsp-logs    (Logs)
                    └── tsp-events  (Span Events，Central 写入)
⑤                        │
⑥                        ▼
                    Central Collector（Kafka Consumer Group）
                        │
                        ├──▶ ClickHouse（clickhouseexporter → otel.otel_traces → MV → platform.tsp_spans）
                        └──▶ VictoriaMetrics（prometheusremotewrite → 指标存储）
⑦                            │
                             ▼
                    tsp-monitor-gateway（查询 ClickHouse + VM → REST API → 前端看板）
```

**数据量参考（测试环境预估）：**

| 信号 | Kafka Topic | 写入 ClickHouse/VM | 保留时间 |
|------|-------------|-------------------|---------|
| Traces | tsp-spans | ClickHouse otel.otel_traces | 90 天 |
| Metrics | tsp-metrics | VictoriaMetrics | 90 天 |
| Logs | tsp-logs | Kafka 暂存（未消费） | 72 小时 |
| Events | tsp-events | Kafka 暂存（供 Flink） | 48 小时 |

### 1.3 所有组件及版本

| 组件 | 版本 | 镜像 / 依赖 | K8s 资源类型 | 部署位置 |
|------|------|------------|-------------|---------|
| **Edge Collector** | otelcol-contrib **v0.149.0** | `otel/opentelemetry-collector-contrib:v0.149.0` | Deployment + LoadBalancer Service | K8s |
| **Central Collector** | otelcol-contrib **v0.149.0** | `otel/opentelemetry-collector-contrib:v0.149.0` | Deployment | K8s |
| **VictoriaMetrics** | **v1.139.0** | `victoriametrics/victoria-metrics:v1.139.0` | Deployment + ClusterIP Service | K8s |
| **tsp-monitor-gateway** | Spring Boot **2.7.18** / JDK **11** | 自建镜像（需 CI 构建） | Deployment + NodePort Service | K8s |
| **Kafka** | 华为云 DMS Kafka **3.x** | 华为云托管服务 | — | 华为云 |
| **ClickHouse** | 华为云 CloudTable **24.x** | 华为云托管服务 | — | 华为云 |
| **OTel Java Agent** | opentelemetry-javaagent **1.39.0** | `opentelemetry-javaagent.jar` | — | 业务服务 JVM |

### 1.4 文件结构

```
deploy/test/
├── TSP可观测性平台-K8s部署运维手册.md        ← 本文档（运维手册）
├── TSP 可观测性平台 - 测试环境部署文档.md      ← 详细部署文档（参考）
└── k8s/
    ├── namespace.yaml                         # K8s 命名空间 tsp-observability
    ├── infra-env-configmap.yaml               # 华为云基础设施地址（Kafka/ClickHouse）
    ├── edge-collector-configmap.yaml          # Edge Collector Pipeline 配置
    ├── edge-collector-deployment.yaml         # Edge Collector 部署 + LoadBalancer Service
    ├── central-collector-configmap.yaml       # Central Collector Pipeline 配置
    ├── central-collector-deployment.yaml      # Central Collector 部署
    ├── victoriametrics-deployment.yaml        # VictoriaMetrics 部署 + ClusterIP Service
    ├── gateway-configmap.yaml                 # [新增] Gateway Spring 配置
    └── gateway-deployment.yaml                # [新增] Gateway 部署 + NodePort Service
```

---

## 2. 前置条件

### 2.1 华为云资源准备

在华为云控制台创建以下托管资源，并记录连接信息（填入 `infra-env-configmap.yaml`）：

#### 2.1.1 DMS Kafka 实例

| 所需信息 | 在哪获取 | 填入位置 |
|----------|---------|---------|
| 接入地址（bootstrap.servers） | DMS 控制台 → 实例详情 → 连接地址 | `KAFKA_BOOTSTRAP_SERVERS` |
| SASL 用户名 | DMS 控制台 → 实例详情 → 用户管理 | `KAFKA_SASL_USERNAME` |
| SASL 密码 | 同上 | `KAFKA_SASL_PASSWORD` |
| 安全协议 | DMS 控制台 → 实例详情（SASL_PLAIN / SASL_SSL） | `KAFKA_SECURITY_PROTOCOL` |

> **说明**：华为云 DMS Kafka 默认开启 SASL_PLAIN 认证。内网 VPC 环境推荐使用 `SASL_PLAIN`（认证但明文传输）；跨公网环境必须使用 `SASL_SSL`。

**创建 Topic：**

| Topic | 分区数 | 副本数 | 保留时间 | 用途 |
|-------|--------|--------|---------|------|
| `tsp-spans` | 3 | 1 | 72h | OTel Traces |
| `tsp-metrics` | 3 | 1 | 72h | OTel Metrics |
| `tsp-logs` | 3 | 1 | 72h | OTel Logs |
| `tsp-events` | 3 | 1 | 48h | Span Events（Flink 消费） |

> Topic 可通过华为云 DMS 控制台或 Kafka 客户端工具创建。

#### 2.1.2 CloudTable ClickHouse 实例

| 所需信息 | 在哪获取 | 填入位置 |
|----------|---------|---------|
| 内网 TCP 地址（:9000） | CloudTable 控制台 → 实例详情 | `CLICKHOUSE_HOST` + `CLICKHOUSE_NATIVE_PORT` |
| HTTP 接口地址（:8123） | 同上 | `CLICKHOUSE_HTTP_PORT` |
| 用户名 / 密码 | CloudTable 控制台 → 实例详情 | `CLICKHOUSE_USER` + `CLICKHOUSE_PASSWORD` |
| 数据库名 | 自行创建（默认 `otel`） | `CLICKHOUSE_DATABASE` |

> **安全组**：需放行 K8s 集群 Pod 子网对 ClickHouse **9000 端口**的入站规则。

---

## 3. 部署步骤

### 3.1 创建命名空间

```bash
kubectl apply -f k8s/namespace.yaml
kubectl get namespace tsp-observability
```

### 3.2 配置华为云基础设施地址

编辑 `k8s/infra-env-configmap.yaml`，替换为实际地址（参考 2.1 节）：

```yaml
KAFKA_BOOTSTRAP_SERVERS: "kafka-xxx.dms.huaweicloud.com:9092"
KAFKA_SASL_USERNAME: "your_username"
KAFKA_SASL_PASSWORD: "your_password"
KAFKA_SECURITY_PROTOCOL: "SASL_PLAIN"
KAFKA_SASL_MECHANISM: "PLAIN"
CLICKHOUSE_HOST: "clickhouse-xxx.cloudtable.huaweicloud.com"
CLICKHOUSE_NATIVE_PORT: "9000"
CLICKHOUSE_HTTP_PORT: "8123"
CLICKHOUSE_USER: "default"
CLICKHOUSE_PASSWORD: ""
CLICKHOUSE_DATABASE: "otel"
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

期望输出：

```
NAME                          READY   STATUS    RESTARTS   AGE
otel-edge-xxxxxxxxxx-xxxxx    1/1     Running   0          30s
otel-edge-xxxxxxxxxx-xxxxx    1/1     Running   0          30s

NAME         TYPE           CLUSTER-IP       EXTERNAL-IP   PORT(S)            AGE
otel-edge    LoadBalancer   10.247.xxx.xxx   <pending>     4317:30xxx/TCP     30s
                                         4318:31xxx/TCP
```

> 记录 `EXTERNAL-IP` 或 NodePort，后续 Java Agent OTLP endpoint 使用。

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

> **注意**：测试环境使用 `emptyDir` 存储，Pod 重启后数据丢失。生产环境需改为 PVC。

### 3.6 华为云 ClickHouse 初始化

通过华为云 ClickHouse HTTP 接口执行建表 SQL：

```bash
# 替换为实际地址和凭据
curl "<CLICKHOUSE_HOST>:8123/" --user default --password "" \
  --multiquery --max-time 60 \
  -d @../../scripts/clickhouse-schema/01_init_database_OK.sql
```

或使用 DBeaver / clickhouse-client 连接后手动执行 SQL 文件。

验证：

```sql
-- 标准表（Collector 直接写入）
SELECT table FROM system.tables WHERE database = 'otel' ORDER BY table;

-- 业务表（物化视图自动桥接）
SELECT table FROM system.tables WHERE database = 'platform' ORDER BY table;
```

### 3.7 华为云 Kafka 创建 Topic

通过华为云 DMS Kafka 控制台或 Kafka 客户端工具创建（见 2.1.1 节 Topic 列表）。

### 3.8 部署 tsp-monitor-gateway（K8s）

见**第 6 节**。

---

## 4. 配置说明

### 4.1 华为云 Kafka SASL 认证

华为云 DMS Kafka 默认开启 SASL_PLAIN 认证。Edge 和 Central Collector 的 Kafka 配置已内置 SASL 支持，只需在 `infra-env-configmap.yaml` 中填入正确的凭据：

```yaml
KAFKA_SASL_USERNAME: "your_username"
KAFKA_SASL_PASSWORD: "your_password"
KAFKA_SECURITY_PROTOCOL: "SASL_PLAIN"
KAFKA_SASL_MECHANISM: "PLAIN"
```

> 修改 ConfigMap 后需重启 Collector Pod 使配置生效：
> ```bash
> kubectl -n tsp-observability rollout restart deployment/otel-edge
> kubectl -n tsp-observability rollout restart deployment/otel-central
> ```

### 4.2 华为云 ClickHouse TLS（如需）

华为云 CloudTable ClickHouse 如开启 TLS 连接，修改 `infra-env-configmap.yaml`：

```yaml
CLICKHOUSE_ENABLE_TLS: "true"
```

Central Collector 的 `clickhouseexporter` 配置已内置 TLS 支持，会根据该配置自动启用。

### 4.3 Java Agent OTLP 上报地址

Java 服务的 `-javaagent` 启动参数中，OTLP endpoint 指向 Edge Collector 的 Service 地址：

```bash
# LoadBalancer 模式
-Dotel.exporter.otlp.endpoint=http://<EDGE_EXTERNAL_IP>:4317

# NodePort 模式
-Dotel.exporter.otlp.endpoint=http://<K8S_NODE_IP>:<NODE_PORT_4317>
```

获取 Service 访问地址：

```bash
kubectl -n tsp-observability get svc otel-edge -o wide
```

### 4.4 Collector Pipeline 说明

**Edge Collector 职责：**
- 接收 Java Agent 上报的 OTLP 数据（Traces / Metrics / Logs）
- 过滤 Kong 内部 Span（`kong.router` 等噪音）
- Baggage 属性标准化（加 `baggage.` 前缀）
- `peer.service` 映射（识别 MySQL / Redis / Kafka 中间件节点）
- 写入 Kafka 各 Topic

**Central Collector 职责：**
- 从 Kafka 消费 Traces / Metrics
- Baggage → `biz.*` 业务字段映射（`biz.vin`、`biz.command_type` 等）
- 标记根 Span（`is_root=1`）
- Traces 写入 ClickHouse（`otel.otel_traces` → MV → `platform.tsp_spans`）
- Metrics 写入 VictoriaMetrics（Prometheus Remote Write）
- Span Events 写入 Kafka `tsp-events` Topic

---

## 5. 全链路验证

### 5.1 发送测试 Trace

```bash
# 替换 <EDGE_LB_IP> 为实际地址（LoadBalancer EXTERNAL-IP 或 NodePort）
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

# 验证标准表有数据
curl "<CLICKHOUSE_HOST>:8123/" --user default --password "" \
  --data "SELECT count() FROM otel.otel_traces WHERE toDateTime(Timestamp) > now() - INTERVAL 5 MINUTE"

# 验证业务表（物化视图自动桥接）
curl "<CLICKHOUSE_HOST>:8123/" --user default --password "" \
  --data "SELECT count() FROM platform.tsp_spans WHERE start_time > now() - INTERVAL 5 MINUTE"

# 验证业务字段（Baggage 已映射为 biz.*）
curl "<CLICKHOUSE_HOST>:8123/" --user default --password "" \
  --data "SELECT biz_vin, service_name, name, duration_ns/1000000 AS ms FROM platform.tsp_spans WHERE biz_vin != '' ORDER BY start_time DESC LIMIT 10 FORMAT Pretty"
```

### 5.3 VictoriaMetrics 数据验证

```bash
# 通过 port-forward 临时访问
kubectl -n tsp-observability port-forward svc/victoriametrics 8428:8428 &

# 查询当前写入的指标
curl -s "http://localhost:8428/api/v1/query?query=up" | python3 -m json.tool

# 查看 TSDB 状态
curl -s "http://localhost:8428/api/v1/status/tsdb" | python3 -m json.tool

# 查看 VMui 自带看板
# 浏览器打开 http://localhost:8428/vmui/
```

### 5.4 Pod 日志检查

```bash
# Edge Collector 日志
kubectl -n tsp-observability logs -l app=otel-edge --tail=50

# Central Collector 日志
kubectl -n tsp-observability logs -l app=otel-central --tail=50

# 检查是否有错误
kubectl -n tsp-observability logs -l app=otel-edge --tail=100 | grep -i "error"
kubectl -n tsp-observability logs -l app=otel-central --tail=100 | grep -i "error"

# Gateway 日志
kubectl -n tsp-observability logs -l app=tsp-monitor-gateway --tail=50
```

---

## 6. tsp-monitor-gateway 部署（K8s 容器化）

### 6.1 构建并推送 Docker 镜像

在开发机构建镜像并推送到仓库：

```bash
# 进入后端项目目录
cd backend/tsp-monitor-gateway

# Maven 构建
mvn clean package -Ptest -DskipTests

# 构建 Docker 镜像（假设项目根目录有 Dockerfile，或使用以下内联方式）
docker build -t <镜像仓库地址>/tsp-monitor-gateway:1.0.0 \
  --build-arg JAR_FILE=target/tsp-monitor-gateway-1.0.0.jar \
  -f ../../deploy/test/k8s/gateway.Dockerfile .

# 推送到镜像仓库
docker push <镜像仓库地址>/tsp-monitor-gateway:1.0.0
```

**Dockerfile**（如果项目没有，参考以下内容）：

```dockerfile
FROM eclipse-temurin:11-jre-alpine
LABEL maintainer="tsp-team"

WORKDIR /app
COPY target/tsp-monitor-gateway-1.0.0.jar app.jar

ENV JAVA_OPTS="-Xms512m -Xmx1024m"
ENV SPRING_PROFILES_ACTIVE="test"

EXPOSE 8085

ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar app.jar --spring.profiles.active=${SPRING_PROFILES_ACTIVE}"]
```

### 6.2 配置 Gateway Spring 参数

创建 Gateway ConfigMap（`k8s/gateway-configmap.yaml`）：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: tsp-gateway-config
  namespace: tsp-observability
data:
  application-test.yml: |
    server:
      port: 8085

    spring:
      datasource:
        clickhouse:
          url: jdbc:clickhouse://${CLICKHOUSE_HOST}:${CLICKHOUSE_HTTP_PORT}/platform
          username: ${CLICKHOUSE_USER}
          password: ${CLICKHOUSE_PASSWORD}
          driver-class-name: com.clickhouse.jdbc.ClickHouseDriver

    # VictoriaMetrics 地址（集群内 Service DNS）
    victoria-metrics:
      endpoint: http://victoriametrics.tsp-observability:8428

    # 管理端点
    management:
      endpoints:
        web:
          exposure:
            include: health,info,prometheus
      endpoint:
        health:
          show-details: always
```

### 6.3 部署 Gateway Deployment + Service

创建 Gateway 部署清单（`k8s/gateway-deployment.yaml`）：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tsp-monitor-gateway
  namespace: tsp-observability
  labels:
    app: tsp-monitor-gateway
spec:
  replicas: 2
  selector:
    matchLabels:
      app: tsp-monitor-gateway
  template:
    metadata:
      labels:
        app: tsp-monitor-gateway
    spec:
      containers:
        - name: gateway
          image: <镜像仓库地址>/tsp-monitor-gateway:1.0.0
          ports:
            - containerPort: 8085
              name: http
              protocol: TCP
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "test"
            - name: CLICKHOUSE_HOST
              valueFrom:
                configMapKeyRef:
                  name: tsp-infra-env
                  key: CLICKHOUSE_HOST
            - name: CLICKHOUSE_HTTP_PORT
              valueFrom:
                configMapKeyRef:
                  name: tsp-infra-env
                  key: CLICKHOUSE_HTTP_PORT
            - name: CLICKHOUSE_USER
              valueFrom:
                configMapKeyRef:
                  name: tsp-infra-env
                  key: CLICKHOUSE_USER
            - name: CLICKHOUSE_PASSWORD
              valueFrom:
                configMapKeyRef:
                  name: tsp-infra-env
                  key: CLICKHOUSE_PASSWORD
          livenessProbe:
            httpGet:
              path: /actuator/health
              port: 8085
            initialDelaySeconds: 60
            periodSeconds: 15
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /actuator/health
              port: 8085
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 1Gi
          volumeMounts:
            - name: config
              mountPath: /app/config
      volumes:
        - name: config
          configMap:
            name: tsp-gateway-config
---
apiVersion: v1
kind: Service
metadata:
  name: tsp-monitor-gateway
  namespace: tsp-observability
  labels:
    app: tsp-monitor-gateway
spec:
  type: NodePort
  ports:
    - name: http
      port: 8085
      targetPort: 8085
      protocol: TCP
      nodePort: 30085
  selector:
    app: tsp-monitor-gateway
```

### 6.4 部署 Gateway

```bash
# 替换镜像仓库地址
# 编辑 gateway-deployment.yaml，将 <镜像仓库地址> 替换为实际值

# 应用 ConfigMap
kubectl apply -f k8s/gateway-configmap.yaml

# 应用 Deployment + Service
kubectl apply -f k8s/gateway-deployment.yaml

# 验证
kubectl -n tsp-observability get pods -l app=tsp-monitor-gateway
kubectl -n tsp-observability get svc tsp-monitor-gateway
```

### 6.5 验证 Gateway

```bash
# 获取 NodePort 访问地址
kubectl -n tsp-observability get svc tsp-monitor-gateway

# 健康检查
curl http://<K8S_NODE_IP>:30085/actuator/health | python3 -m json.tool

# 访问前端看板
# 浏览器打开 http://<K8S_NODE_IP>:30085/
```

---

## 7. 端口速查

| 端口 | 组件 | K8s Service 类型 | 用途 |
|------|------|-----------------|------|
| 4317 | otel-edge | LoadBalancer / NodePort | OTLP gRPC 入口（Java Agent 上报） |
| 4318 | otel-edge | LoadBalancer / NodePort | OTLP HTTP 入口（curl 测试用） |
| 8428 | victoria-metrics | ClusterIP | Prometheus Remote Write + 查询 + VMui |
| 13133 | otel-edge / otel-central | 无外部暴露 | 健康检查（Liveness / Readiness Probe） |
| 8085 | tsp-monitor-gateway | NodePort (30085) | 前端看板 + 后端 REST API |
| 9000 | 华为云 ClickHouse | 华为云托管 | Native 协议（clickhouseexporter） |
| 8123 | 华为云 ClickHouse | 华为云托管 | HTTP 接口（SQL 查询） |
| 9092 | 华为云 DMS Kafka | 华为云托管 | Broker（SASL 认证） |

---
