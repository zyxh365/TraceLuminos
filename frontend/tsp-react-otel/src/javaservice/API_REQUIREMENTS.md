# Java服务接口需求清单

## 接口列表（共2个）

### 接口1：获取时间范围内的Trace列表

**接口地址**: `GET /traces`

**功能说明**: 获取指定时间范围内的所有Trace数据

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| startTime | Long | 否 | 开始时间（毫秒时间戳），默认为当前时间减去lookback |
| endTime | Long | 否 | 结束时间（毫秒时间戳），默认为当前时间 |
| limit | Integer | 否 | 返回数量限制，默认100 |
| lookback | Long | 否 | 回溯时间（毫秒），默认3600000（1小时） |

**使用场景**:
- 页面初始加载时获取所有Trace
- 点击刷新按钮时重新加载
- 切换时间范围时重新加载
- 不输入TraceID时查看所有Trace

**示例请求**:
```http
GET /traces?lookback=3600000&limit=100
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
          "processID": "p1",
          "process": {
            "serviceName": "user-service"
          },
          "startTime": 1234567890000000,
          "duration": 5000000,
          "tags": [
            { "key": "http.method", "value": "GET" },
            { "key": "http.url", "value": "/api/users" },
            { "key": "http.status_code", "value": "200" }
          ],
          "references": [
            {
              "refType": "CHILD_OF",
              "spanID": "span000"
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

### 接口2：按TraceID搜索

**接口地址**: `GET /traces/search`

**功能说明**: 根据TraceID搜索链路，支持模糊匹配

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| traceId | String | 是 | Trace ID（支持模糊匹配） |
| startTime | Long | 否 | 开始时间（毫秒时间戳） |
| endTime | Long | 否 | 结束时间（毫秒时间戳） |
| limit | Integer | 否 | 返回数量限制，默认50 |
| lookback | Long | 否 | 回溯时间（毫秒），默认3600000 |

**使用场景**:
- 用户在搜索框输入TraceID
- 点击搜索按钮或按回车键

**示例请求**:
```http
GET /traces/search?traceId=abc&lookback=3600000&limit=50
```

**响应格式**: 与接口1相同

---

## 数据格式规范

### Trace对象结构
```json
{
  "traceID": "string (必填)",
  "spans": [
    {
      "traceID": "string (必填)",
      "spanID": "string (必填)",
      "operationName": "string (必填)",
      "processID": "string (必填)",
      "process": {
        "serviceName": "string (必填)"
      },
      "startTime": "number (必填, 微秒时间戳)",
      "duration": "number (必填, 微秒)",
      "tags": [
        {
          "key": "string",
          "value": "string"
        }
      ],
      "references": [
        {
          "refType": "CHILD_OF",
          "spanID": "string (父SpanID)"
        }
      ]
    }
  ],
  "processes": {
    "processID": {
      "serviceName": "string (必填)",
      "tags": []
    }
  }
}
```

### 关键字段说明

**时间戳**:
- `startTime`: 微秒（microseconds）级别的Unix时间戳
- 例如: `1234567890000000` 表示 2009-02-13 23:31:30.000 UTC

**耗时**:
- `duration`: 微秒（microseconds）
- 例如: `5000000` 表示 5秒

**Span引用关系**:
- `refType`: 必须是 `"CHILD_OF"` 表示父子关系
- 通过 `references` 数组构建调用链树

**processID**:
- Span对象中的 `processID` 必须与 `processes` 对象中的key对应
- 用于关联Span和服务名称

---

## 页面交互逻辑

### 场景1：不输入TraceID（默认模式）

```
用户操作：
1. 打开页面
2. 选择时间范围（如1小时）
3. 点击刷新按钮

后端调用：
GET /traces?lookback=3600000&limit=100

前端处理：
1. 右侧显示Trace列表（100条）
2. 左侧显示聚合拓扑图
3. 边显示 "调用次数 · 平均耗时"
4. 点击某条Trace，查看详情和单次拓扑图
```

### 场景2：输入TraceID（搜索模式）

```
用户操作：
1. 在搜索框输入TraceID（如 "abc"）
2. 点击搜索按钮

后端调用：
GET /traces/search?traceId=abc&lookback=3600000&limit=50

前端处理：
情况A：搜索到1条结果
  - 右侧显示Trace详情
  - 左侧显示单次Trace拓扑图
  - 边显示 "响应耗时"

情况B：搜索到多条结果
  - 右侧显示Trace列表
  - 左侧显示聚合拓扑图
  - 用户点击某条Trace查看详情
```

---

## 后端实现示例（Spring Boot）

```java
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "http://localhost:5173")
public class TopologyController {

    @Autowired
    private TraceService traceService;

    /**
     * 接口1：获取时间范围内的Trace列表
     */
    @GetMapping("/traces")
    public ResponseData<List<Trace>> getTraces(
        @RequestParam(required = false) Long startTime,
        @RequestParam(required = false) Long endTime,
        @RequestParam(required = false) Long lookback,
        @RequestParam(defaultValue = "100") int limit
    ) {
        // 计算时间范围
        if (endTime == null) {
            endTime = System.currentTimeMillis();
        }
        if (startTime == null && lookback != null) {
            startTime = endTime - lookback;
        }
        if (startTime == null) {
            startTime = endTime - 3600000; // 默认1小时
        }

        // 查询Trace数据（从Jaeger或其他存储）
        List<Trace> traces = traceService.queryByTimeRange(
            startTime,
            endTime,
            limit
        );

        return ResponseData.success(traces);
    }

    /**
     * 接口2：按TraceID搜索
     */
    @GetMapping("/traces/search")
    public ResponseData<List<Trace>> searchTraces(
        @RequestParam String traceId,
        @RequestParam(required = false) Long startTime,
        @RequestParam(required = false) Long endTime,
        @RequestParam(required = false) Long lookback,
        @RequestParam(defaultValue = "50") int limit
    ) {
        // 计算时间范围
        if (endTime == null) {
            endTime = System.currentTimeMillis();
        }
        if (startTime == null && lookback != null) {
            startTime = endTime - lookback;
        }
        if (startTime == null) {
            startTime = endTime - 3600000; // 默认1小时
        }

        // 搜索Trace数据（支持模糊匹配）
        List<Trace> traces = traceService.searchByTraceId(
            traceId,
            startTime,
            endTime,
            limit
        );

        return ResponseData.success(traces);
    }
}

class ResponseData<T> {
    private int code;
    private T data;
    private String message;

    public static <T> ResponseData<T> success(T data) {
        ResponseData<T> response = new ResponseData<>();
        response.code = 200;
        response.data = data;
        response.message = "success";
        return response;
    }

    // getters and setters...
}
```

---

## 测试用例

### 测试1：获取最近1小时的Trace
```bash
curl "http://localhost:8080/api/traces?lookback=3600000&limit=10"
```

预期返回：最近1小时内的10条Trace数据

### 测试2：搜索TraceID
```bash
curl "http://localhost:8080/api/traces/search?traceId=abc&limit=10"
```

预期返回：TraceID包含"abc"的所有Trace

### 测试3：指定时间范围
```bash
curl "http://localhost:8080/api/traces?startTime=1711286400000&endTime=1711290000000&limit=20"
```

预期返回：指定时间范围内的20条Trace数据

---

## 实现检查清单

### 后端开发
- [ ] 实现 `GET /traces` 接口
  - [ ] 支持lookback参数
  - [ ] 支持limit参数
  - [ ] 返回Jaeger格式的Trace数据
  - [ ] 时间戳使用微秒单位

- [ ] 实现 `GET /traces/search` 接口
  - [ ] 支持traceId参数（模糊匹配）
  - [ ] 支持时间范围过滤
  - [ ] 返回Jaeger格式的Trace数据

- [ ] 配置CORS跨域支持
- [ ] 统一响应格式 `{ code, data, message }`

### 前端开发
- [x] 页面UI实现
- [x] Trace列表展示
- [x] Trace详情展示
- [x] 拓扑图可视化
- [x] 搜索功能
- [ ] API实际调用（等待后端接口就绪）

---

## 常见问题

### Q: traceId搜索是精确匹配还是模糊匹配？
A: 建议支持模糊匹配，比如输入"abc"可以匹配到"abc123"、"abc456"等。

### Q: 如果搜索结果很多怎么办？
A: 前端有limit参数限制（默认50条），后端也应该限制返回数量。

### Q: 为什么processID是必填的？
A: 前端需要通过processID关联Span和服务名称，如果缺失会导致拓扑图无法正常显示。

### Q: 时间戳为什么是微秒？
A: 遵循OpenTelemetry和Jaeger的标准格式，确保数据格式统一。

---

## 参考资料

- [Jaeger API文档](https://www.jaegertracing.io/docs/latest/apis/)
- [OpenTelemetry规范](https://opentelemetry.io/docs/reference/specification/)
- [Spring Boot CORS配置](https://docs.spring.io/spring-framework/docs/current/reference/html/web.html#mvc-cors)
