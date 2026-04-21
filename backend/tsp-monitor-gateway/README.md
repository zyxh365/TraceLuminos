# TSP Monitor Gateway

监控网关服务 - 华为云 APM 对接与 Flink 数据分析平台

## 项目简介

TSP Monitor Gateway 是一个分布式链路追踪监控网关服务，主要功能包括：

1. **APM 模块**：对接华为云 APM 接口，获取应用性能监控数据
2. **Analysis 模块**：基于 Flink + ClickHouse 进行实时数据分析和查询
3. **Dashboard 模块**：为前端监控看板提供统一的数据服务接口

## 技术栈

- **Spring Boot**: 2.7.18
- **JDK**: 11
- **ClickHouse**: 0.4.6
- **Flink**: 1.17.1
- **Huawei Cloud SDK**: 3.1.45
- **MyBatis Plus**: 3.5.5
- **Hutool**: 5.8.24

## 项目结构

```
tsp-monitor-gateway
├── src/main/java/com/tsp/monitor/gateway
│   ├── apm/                    # APM 模块（华为云接口对接）
│   │   ├── config/            # APM 配置类
│   │   ├── client/            # APM 客户端
│   │   ├── controller/        # APM 接口控制器
│   │   ├── service/           # APM 服务层
│   │   ├── dto/               # APM 数据传输对象
│   │   └── model/             # APM 数据模型
│   ├── analysis/              # Analysis 模块（Flink + ClickHouse）
│   │   ├── config/            # ClickHouse 配置类
│   │   ├── flink/             # Flink 任务管理
│   │   ├── controller/        # 数据分析接口控制器
│   │   ├── service/           # 数据分析服务层
│   │   └── dto/               # 数据分析 DTO
│   ├── dashboard/             # Dashboard 模块（前端数据接口）
│   │   ├── controller/        # 监控看板接口控制器
│   │   ├── service/           # 监控看板服务层
│   │   ├── dto/               # 监控看板 DTO
│   │   └── vo/                # 监控看板视图对象
│   └── common/                # 公共模块
│       ├── config/            # 公共配置类
│       ├── exception/         # 全局异常处理
│       ├── interceptor/       # 拦截器
│       ├── util/              # 工具类
│       └── constant/          # 常量定义
├── src/main/resources/
│   └── application.yml        # 应用配置文件
├── pom.xml                    # Maven 依赖配置
└── README.md                  # 项目说明文档
```

## 快速开始

### 环境要求

- JDK 11+
- Maven 3.6+
- ClickHouse 21.x+
- Flink 1.17+ (可选，用于流处理)

### 配置说明

在 `application.yml` 中配置相关参数：

```yaml
# ClickHouse 配置
clickhouse:
  url: jdbc:clickhouse://localhost:8123/default
  username: default
  password:
```

### 启动服务

```bash
# 编译项目
mvn clean package

# 启动服务
mvn spring-boot:run

# 或者直接运行 JAR
java -jar target/tsp-monitor-gateway-1.0.0.jar
```

## API 接口说明

### ~~APM 接口~~

- ~~`GET /monitor/apm/applications` - 获取应用列表~~
- ~~`GET /monitor/apm/applications/{applicationId}/overview` - 获取应用概览数据~~
- ~~`POST /monitor/apm/applications/{applicationId}/metrics` - 获取应用指标数据~~
- ~~`GET /monitor/apm/applications/{applicationId}/topology` - 获取拓扑图数据~~
- ~~`GET /monitor/apm/applications/{applicationId}/realtime` - 获取实时监控数据~~

### Analysis 接口

- `GET /monitor/analysis/traces/{traceId}` - 查询链路详情
- `GET /monitor/analysis/services/{serviceName}/stats` - 查询服务统计数据
- `GET /monitor/analysis/traces/slow` - 查询慢链路列表
- `GET /monitor/analysis/errors` - 查询错误日志
- `GET /monitor/analysis/topology` - 查询服务调用拓扑
- `GET /monitor/analysis/metrics/timeseries` - 查询时序指标数据
- `GET /monitor/analysis/stats/aggregate` - 获取聚合统计数据

### Dashboard 接口

- `GET /monitor/dashboard/overview` - 获取监控看板概览数据
- `GET /monitor/dashboard/applications/{applicationId}/health` - 获取应用健康度评分
- `GET /monitor/dashboard/realtime` - 获取实时监控数据
- `GET /monitor/dashboard/services/{serviceName}/detail` - 获取服务监控详情
- `GET /monitor/dashboard/traces/{traceId}/detail` - 获取链路追踪详情
- `GET /monitor/dashboard/alerts` - 获取告警列表
- `GET /monitor/dashboard/monitor-screen` - 获取综合监控大屏数据

## 开发指南

### 添加新的 API 接口

1. 在对应的模块（apm/analysis/dashboard）下创建 Controller
2. 创建对应的 Service 实现业务逻辑
3. 创建 DTO/VO 用于数据传输
4. 统一使用 `Result` 类返回结果

### 异常处理

系统已实现全局异常处理器，所有异常都会被统一处理并返回标准格式：

```java
throw new BusinessException("业务异常信息");
```

### 工具类使用

```java
// 日期时间工具
DateTimeUtil.timestampToString(timestamp);
DateTimeUtil.formatDuration(milliseconds);
```

## 部署说明

### Docker 部署

```dockerfile
FROM openjdk:11-jre-slim
COPY target/tsp-monitor-gateway-1.0.0.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

### Kubernetes 部署

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tsp-monitor-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: tsp-monitor-gateway
  template:
    metadata:
      labels:
        app: tsp-monitor-gateway
    spec:
      containers:
      - name: tsp-monitor-gateway
        image: tsp-monitor-gateway:1.0.0
        ports:
        - containerPort: 8080
```

## 常见问题

### 1. 如何配置华为云 APM 认证？

需要设置环境变量或配置文件：
- `HUAWEIFCLOUD_APM_ACCESS_KEY`
- `HUAWEIFCLOUD_APM_SECRET_KEY`
- `HUAWEIFCLOUD_APM_PROJECT_ID`

### 2. ClickHouse 连接失败怎么办？

检查 ClickHouse 服务是否启动，端口是否正确（默认 8123）。

### 3. Flink 流处理任务如何启动？

可以通过接口启动：`POST /monitor/analysis/flink/job/start`

## 版本历史

- **v1.0.0** (2026-03-25)
  - 初始版本发布
  - 实现华为云 APM 接口对接
  - 实现 ClickHouse 数据查询
  - 实现 Flink 流处理框架
  - 实现监控看板数据接口

## 联系方式

- 项目地址：[GitHub Repository]
- 文档地址：[Documentation]
- 问题反馈：[Issues]

## 许可证

Copyright © 2026 TSP Monitor Team
