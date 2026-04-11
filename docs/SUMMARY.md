# ClickHouse 全量链路追踪 + 业务数据存储方案 - 总结

## ✅ 已完成的工作

### 1. 数据库设计

**文件：** [docs/clickhouse-schema/01_init_database.sql](clickhouse-schema/01_init_database.sql)

**核心表：** `otel_traces.otlp_spans`

**包含字段：**
- ✅ 链路标识：`trace_id`, `span_id`, `parent_span_id`
- ✅ 服务信息：`service_name`, `service_version`
- ✅ 时间信息：`time`, `duration_ns`
- ✅ 状态信息：`status_code`, `status_message`
- ✅ HTTP 数据：`http_method`, `http_url`, `http_route`, `http_status_code`
- ✅ MySQL 数据：`db_system`, `db_statement`, `db_operation`, `db_name`
- ✅ Redis 数据：`redis_command`, `redis_db_index`, `db_statement`
- ✅ Kafka 数据：`messaging_system`, `messaging_destination`, `messaging_kafka_partition`
- ✅ 线程池数据：`thread_name`, `thread_id`
- ✅ 业务数据（Baggage）：`baggage_user_id`, `baggage_vin`, `baggage_tenant_id`, `baggage_platform`
- ✅ 业务数据（Attributes）：`business_order_id`, `business_amount`, `business_product_id`

### 2. Collector 配置

**文件：** [docs/collector-config/otel-collector-config-clickhouse.yml](collector-config/otel-collector-config-clickhouse.yml)

**功能：**
- 同时导出到 Jaeger、ClickHouse、Kafka
- 将 Baggage 转为 Attributes
- 批量处理优化性能

### 3. 业务数据注入示例

**文件：** [tsp-service2/.../TraceWithBusinessDataService.java](../tsp-service2/src/main/java/com/tsp/service2/service/TraceWithBusinessDataService.java)

**场景：**
1. 使用 Baggage 传递业务上下文
2. 使用 Attributes 附加业务数据
3. Baggage + Attributes 混合使用（最佳实践）
4. 从 HTTP Header 中提取 Baggage
5. 在异步线程中传递业务数据

### 4. 测试接口

**文件：** [tsp-service2/.../BusinessDataTraceController.java](../tsp-service2/src/main/java/com/tsp/service2/controller/BusinessDataTraceController.java)

**接口：**
- `/business/baggage` - 测试 Baggage
- `/business/attributes` - 测试 Attributes
- `/business/mixed` - 测试混合模式
- `/business/read-baggage` - 从 Header 读取 Baggage
- `/business/async-baggage` - 测试异步传播
- `/business/all` - 一键测试所有场景

### 5. 查询示例

**文件：** [docs/clickhouse-schema/02_query_examples.sql](clickhouse-schema/02_query_examples.sql)

**包含：**
- 基础链路查询
- 组件节点查询（Redis/MySQL/Kafka/线程池）
- 业务数据查询（用户/VIN/订单）
- 性能分析查询（P99/慢SQL）
- 错误分析查询
- 业务维度统计（多租户/平台）

---

## 🎯 核心特性

### 1. 全组件覆盖

所有组件节点信息都会被保存到 ClickHouse：

| 组件 | 自动采集 | 字段 |
|------|---------|------|
| HTTP Server | ✅ | `http_method`, `http_url`, `http_route` |
| HTTP Client | ✅ | `http_method`, `http_url`, `http_status_code` |
| Redis | ✅ | `redis_command`, `db_statement` |
| MySQL | ✅ | `db_statement`, `db_operation`, `db_name` |
| Kafka Producer | ✅ | `messaging_system`, `messaging_destination` |
| Kafka Consumer | ✅ | `messaging_kafka_partition`, `messaging_kafka_offset` |
| 线程池 | ✅ | `thread_name`, `thread_id` |

### 2. 业务数据关联

**Baggage（跨服务传播）：**
- 用于传递需要下游知道的业务标识
- 自动传播到所有子 Span 和下游服务
- 保存到字段：`baggage_user_id`, `baggage_vin`, `baggage_tenant_id`, `baggage_platform`

**Attributes（Span 级别）：**
- 附加到单个 Span 的业务数据
- 不会传播到下游
- 保存到字段：`business_order_id`, `business_amount`, `business_product_id`

### 3. 灵活的业务分析

支持以下分析场景：
- ✅ 按用户查询所有操作历史
- ✅ 按订单追踪完整处理流程
- ✅ 按车辆 VIN 统计（车联网）
- ✅ 按租户统计分析（多租户）
- ✅ 慢 SQL 分析
- ✅ 错误分析
- ✅ 性能分析（P99/P95）

---

## 📊 数据流转

```
应用层（Java Agent）
  ↓ 自动采集
OTel Collector
  ↓ 处理 + 转换
ClickHouse
  ↓ 存储 + 分析
业务查询/报表
```

---

## 🚀 使用方法

### 1. 前端调用（传递业务数据）

```javascript
fetch('http://localhost:8092/business/mixed?userId=123&orderId=ORDER-001&amount=99.99', {
  headers: {
    'traceparent': '00-test0011223344556677889900-aaaaaaaaaa-01',
    'baggage': 'userId=123,vin=TEST_VIN_001,tenantId=TENANT_ABC'
  }
})
```

### 2. 后端处理（注入业务数据）

```java
// Baggage（会传播到下游）
Baggage baggage = Baggage.current().toBuilder()
    .put("userId", userId)
    .put("vin", vin)
    .build();

// Attributes（仅当前 Span）
Span span = Span.current();
span.setAttribute("business.order.id", orderId);
span.setAttribute("business.amount", amount);
```

### 3. ClickHouse 查询

```sql
-- 查询用户的所有操作
SELECT trace_id, time, service_name, name, baggage_user_id, business_order_id
FROM otel_traces.otlp_spans
WHERE baggage_user_id = '123'
ORDER BY time DESC;

-- 查询订单的完整链路
SELECT * FROM otel_traces.otlp_spans
WHERE business_order_id = 'ORDER-001'
ORDER BY time;
```

---

## 📁 文件结构

```
tsp-trace-demo/
├── docs/
│   ├── CLICKHOUSE_ARCHITECTURE.md          # 完整架构文档
│   ├── collector-config/
│   │   └── otel-collector-config-clickhouse.yml
│   └── clickhouse-schema/
│       ├── 01_init_database.sql            # 表结构
│       └── 02_query_examples.sql           # 查询示例
│
└── tsp-service2/
    └── src/main/java/com/tsp/service2/
        ├── service/
        │   └── TraceWithBusinessDataService.java   # 业务数据注入示例
        └── controller/
            └── BusinessDataTraceController.java    # 测试接口
```

---

## ✨ 总结

本方案实现了：

1. ✅ **全组件覆盖** - Redis、MySQL、Kafka、线程池、HTTP 等所有节点信息
2. ✅ **业务数据关联** - Baggage + Attributes 无缝集成
3. ✅ **灵活查询** - 支持用户、订单、租户等多维度分析
4. ✅ **高性能存储** - ClickHouse 列式存储 + 索引优化
5. ✅ **自动 TTL** - 数据保留 90 天后自动删除

**推荐架构：**
```
Jaeger（可视化） + ClickHouse（存储分析） + Kafka/Flink（实时计算）
```

---

## 🔗 相关文档

- [完整架构文档](CLICKHOUSE_ARCHITECTURE.md)
- [组件追踪配置](OTEL_COMPONENT_CONFIG.md)
- [主 README](../README.md)
