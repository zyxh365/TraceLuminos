# Java服务接口规范文档

## 概述

本文档描述Java服务拓扑页面所需的后端接口规范。

---

## 环境变量配置

在前端项目的 `.env.local` 文件中配置：

```bash
# Java服务API基础URL
VITE_JAVA_SERVICE_API_BASE=http://localhost:8080/api
```

---

## 接口列表（共2个）

### 1. 获取时间范围内的Trace列表

**接口地址**: `GET /traces`

**功能说明**: 获取指定时间范围内的链路追踪数据，用于生成聚合拓扑图

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| startTime | Long | 否 | 开始时间（毫秒时间戳），默认为当前时间减去1小时 |
| endTime | Long | 否 | 结束时间（毫秒时间戳），默认为当前时间 |
| limit | Integer | 否 | 返回数量限制，默认100 |

**示例请求**:
```http
GET /traces?startTime=1711286400000&endTime=1711290000000&limit=100
```

**响应格式**:
```json
{
  "code": 200,
  "data": [
    {
      "traceID": "abc123def456",
      "spans": [
        {
          "traceID": "abc123def456",
          "spanID": "span001",
          "operationName": "GET /api/users",
          "process": {
            "serviceName": "user-service"
          },
          "startTime": 1234567890000000,
          "duration": 5000000,
          "tags": [
            { "key": "http.method", "value": "GET" },
            { "key": "http.url", "value": "/api/users" }
          ],
          "references": [
            {
              "refType": "CHILD_OF",
              "spanID": "parent_span_001"
            }
          ]
        }
      ],
      "processes": {
        "p1": {
          "serviceName": "user-service",
          "tags": []
        },
        "p2": {
          "serviceName": "kong-gateway",
          "tags": []
        }
      }
    }
  ],
  "message": "success"
}
```

---

### 2. 按TraceID搜索

**接口地址**: `GET /traces/search` 或 `GET /traces?traceId=xxx`

**功能说明**: 根据TraceID搜索链路，支持模糊匹配

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| traceId | String | 是 | Trace ID（支持模糊匹配） |
| startTime | Long | 否 | 开始时间（毫秒时间戳） |
| endTime | Long | 否 | 结束时间（毫秒时间戳） |
| limit | Integer | 否 | 返回数量限制，默认50 |

**示例请求**:
```http
GET /traces/search?traceId=abc&startTime=1711286400000&endTime=1711290000000&limit=50
```

**响应格式**: 与接口1相同

---

## 数据格式规范

### Trace对象结构

```typescript
{
  traceID: string;           // Trace ID（全局唯一）
  spans: Span[];             // Span数组
  processes: {               // 进程映射表
    [processID: string]: {
      serviceName: string;   // 服务名称
      tags?: Array<any>;     // 进程级标签
    }
  };
}
```

### Span对象结构

```typescript
{
  traceID: string;           // Trace ID
  spanID: string;            // Span ID（唯一标识）
  operationName: string;     // 操作名称（通常是接口路径）
  process: {
    serviceName: string;     // 服务名称
    tags?: Array<any>;       // 进程级标签
  };
  startTime: number;         // 开始时间（微秒时间戳）
  duration: number;          // 耗时（微秒）
  tags: Array<{
    key: string;             // 标签键
    value: string;           // 标签值
  }>;
  references?: Array<{       // 父Span引用
    refType: string;         // 引用类型，必须是 "CHILD_OF"
    spanID: string;          // 父Span ID
  }>;
}
```

### 关键字段说明

**时间戳格式**:
- `startTime`: 微秒（microseconds）级别的Unix时间戳
- 示例: `1234567890000000` 表示 2009-02-13 23:31:30.000 UTC

**耗时单位**:
- `duration`: 微秒（microseconds）
- 示例: `5000000` 表示 5秒

**Span引用关系**:
- `refType`: 必须是 `"CHILD_OF"` 表示父子关系
- 通过 `references` 数组构建调用链树

---

## 统一响应格式

所有接口应遵循以下统一响应格式：

```json
{
  "code": 200,
  "data": {},
  "message": "success"
}
```

**状态码说明**:
- `200`: 请求成功
- `400`: 请求参数错误
- `401`: 未授权
- `404`: 资源不存在
- `500`: 服务器内部错误

---

## 前端使用说明

### 默认模式（聚合拓扑图）

页面加载时自动调用接口1，获取最近1小时（可调整）的Trace数据，生成聚合拓扑图：

```javascript
// 计算时间范围
const endTime = Date.now();
const startTime = endTime - 3600000; // 1小时前

// 获取Trace数据
const traces = await fetchTraces(null, 100, 3600000);

// 提取服务调用关系
const dependencies = extractEdgesFromTraces(traces);

// 计算平均耗时
const edges = dependencies.map(dep => ({
  source: dep.parent,
  target: dep.child,
  callCount: dep.callCount,
  avgDuration: dep.totalDuration / dep.callCount,
}));

// 绘制拓扑图，边显示 "调用次数 · 平均耗时"
```

### 搜索模式（单次Trace）

用户输入TraceID后调用接口2，获取匹配的Trace列表：

```javascript
const results = await searchTraces({
  traceId: 'abc',
  limit: 50,
  lookbackMs: 3600000,
});

// 如果只有1条结果，直接显示拓扑图
// 如果有多条，让用户选择
if (results.length === 1) {
  const trace = results[0];
  // 提取单次Trace的调用关系
  const graph = extractSingleTraceGraph(trace);
  // 绘制拓扑图，边显示 "响应耗时"
}
```

---

## 实现检查清单

### 后端开发（Java服务）

- [ ] 实现 `GET /traces` - 时间范围查询接口
- [ ] 实现 `GET /traces/search` - TraceID搜索接口（或合并到上面的接口）
- [ ] 确保返回Jaeger格式的Trace数据
- [ ] 确保时间戳使用微秒单位
- [ ] 支持CORS跨域请求

### 前端开发

- [ ] 配置环境变量 `VITE_JAVA_SERVICE_API_BASE`
- [ ] 实现 `fetchTraces()` API调用
- [ ] 实现 `searchTraces()` API调用
- [ ] 创建JavaServiceTopology组件 ✅（已完成）
- [ ] 在App.jsx中添加新的Tab选项 ✅（已完成）

---

## 测试建议

### 1. 使用Postman或curl测试

**测试时间范围查询**:
```bash
curl "http://localhost:8080/api/traces?startTime=1711286400000&endTime=1711290000000&limit=10"
```

**测试TraceID搜索**:
```bash
curl "http://localhost:8080/api/traces/search?traceId=abc&limit=10"
```

### 2. CORS配置示例（Spring Boot）

```java
@CrossOrigin(origins = "http://localhost:5173")
@RestController
@RequestMapping("/api")
public class TopologyController {

    @GetMapping("/traces")
    public ResponseData<List<Trace>> getTraces(
        @RequestParam(required = false) Long startTime,
        @RequestParam(required = false) Long endTime,
        @RequestParam(defaultValue = "100") int limit
    ) {
        // 查询Trace数据
        List<Trace> traces = traceService.queryByTimeRange(startTime, endTime, limit);
        return ResponseData.success(traces);
    }

    @GetMapping("/traces/search")
    public ResponseData<List<Trace>> searchTraces(
        @RequestParam String traceId,
        @RequestParam(required = false) Long startTime,
        @RequestParam(required = false) Long endTime,
        @RequestParam(defaultValue = "50") int limit
    ) {
        // 搜索Trace数据
        List<Trace> traces = traceService.searchByTraceId(traceId, startTime, endTime, limit);
        return ResponseData.success(traces);
    }
}
```

---

## 常见问题

### Q: Trace数据从哪里获取？
A: 从分布式追踪系统（如Jaeger、Zipkin、SkyWalking）的Collector或存储中查询。

### Q: 时间戳为什么是微秒？
A: 遵循OpenTelemetry和Jaeger的标准格式，便于前端兼容。

### Q: 如何处理大量数据？
A:
- 使用 `limit` 参数限制返回数量
- 使用时间范围参数缩小查询窗口
- 考虑在后端进行数据聚合和预计算

### Q: 是否需要实现其他接口？
A: 不需要！前端会自动从Trace数据中提取服务列表和依赖关系，这2个接口已足够。

---

## 参考资源

- [Jaeger API文档](https://www.jaegertracing.io/docs/latest/apis/)
- [OpenTelemetry Trace数据规范](https://opentelemetry.io/docs/reference/specification/trace/api/)
- [Spring Boot CORS配置](https://docs.spring.io/spring-framework/docs/current/reference/html/web.html#mvc-cors)
