# Java服务拓扑页面 - 实现状态总结

## ✅ 已完成的工作

### 1. 前端架构
- ✅ 创建了独立的Java服务拓扑页面组件 `JavaServiceTopology.jsx`
- ✅ 创建了Java服务API客户端模块 `src/javaservice/api.js`
- ✅ 在App.jsx中添加了"🚀 Java服务拓扑"Tab选项
- ✅ 实现了网关节点合并功能（kong-gateway等）
- ✅ 实现了服务视图和端点视图切换
- ✅ 实现了Trace搜索功能（按TraceID或VIN码）

### 2. 功能特性
- ✅ 服务级别拓扑图展示
- ✅ 端点级别拓扑图展示（框架）
- ✅ 网关节点自动合并（可配置开关）
- ✅ 时间范围选择（30分钟/1小时/2小时/24小时）
- ✅ Trace搜索（支持TraceID和VIN码）
- ✅ 节点点击交互（预留）
- ✅ 错误处理和加载状态展示

### 3. 文档
- ✅ Java服务接口规范文档 `src/javaservice/README.md`
- ✅ 环境变量配置示例 `.env.java-service.example`
- ✅ API接口详细说明（请求/响应格式）
- ✅ 开发检查清单

---

## ⚠️ 待完成的工作

### 前端部分

#### 1. API实现（需要Java后端就绪后）
- [ ] 实现 `fetchTraces()` - 获取时间范围内的Trace列表
- [ ] 实现 `searchTraces()` - 按TraceID搜索Trace

当前这些函数都是框架代码，只返回空数据并打印警告。

#### 2. 已实现的功能
- [x] 力导向图布局（自定义物理引擎）
- [x] 节点拖拽交互
- [x] 右侧面板（Trace列表 + Trace详情）
- [x] Span树形结构展示
- [x] 节点和边的高亮显示
- [x] 搜索结果交互
- [x] 单次Trace/全局模式切换

### 后端部分（Java服务需要提供）

#### 必须实现的接口

**1. GET /services**
- 功能：获取所有服务名称列表
- 响应格式：
```json
{
  "code": 200,
  "data": ["service1", "service2", "kong-gateway"],
  "message": "success"
}
```

**2. GET /dependencies**
- 功能：获取服务依赖关系
- 查询参数：`lookback`（毫秒）
- 响应格式：
```json
{
  "code": 200,
  "data": [
    { "parent": "kong-gateway", "child": "service1", "callCount": 350 },
    { "parent": "service1", "child": "service2", "callCount": 150 }
  ],
  "message": "success"
}
```

**3. GET /traces**
- 功能：获取指定服务的Trace列表
- 查询参数：`service`、`limit`、`lookback`
- 响应格式：Jaeger Trace格式（包含spans和processes）

**4. GET /traces/{traceId}**
- 功能：获取单条Trace详情
- 响应格式：Jaeger Trace格式

**5. POST /traces/search**
- 功能：搜索Trace（支持TraceID和VIN码）
- 请求体：`{ traceId, vin, limit, lookbackMs }`
- 响应格式：Jaeger Trace数组

#### 数据格式要求

**Trace对象结构**（必须符合Jaeger格式）：
```json
{
  "traceID": "abc123",
  "spans": [
    {
      "traceID": "abc123",
      "spanID": "def456",
      "operationName": "/api/users",
      "process": { "serviceName": "user-service" },
      "startTime": 1234567890000000,
      "duration": 5000000,
      "tags": [
        { "key": "http.method", "value": "GET" },
        { "key": "vin", "value": "VIN123456" }
      ],
      "references": [
        { "refType": "CHILD_OF", "spanID": "parent123" }
      ]
    }
  ],
  "processes": {
    "p1": { "serviceName": "user-service" }
  }
}
```

**时间戳要求**：
- `startTime`: 微秒级Unix时间戳
- `duration`: 微秒级耗时

#### 其他要求
- [ ] 配置CORS允许前端跨域请求
- [ ] 统一响应格式：`{ code, data, message }`
- [ ] 错误处理和异常情况处理
- [ ] 接口性能优化（大数据量场景）

---

## 📝 配置步骤

### 1. 环境变量配置

创建 `.env.local` 文件：
```bash
cp .env.java-service.example .env.local
```

编辑 `.env.local`，设置Java服务URL：
```bash
VITE_JAVA_SERVICE_API_BASE=http://localhost:8080/api
```

### 2. Java服务CORS配置

在Java服务中添加CORS配置（Spring Boot示例）：
```java
@CrossOrigin(origins = "http://localhost:5173")
@RestController
@RequestMapping("/api")
public class TopologyController {
    // ...
}
```

### 3. 启动前端开发服务器

```bash
npm run dev
```

### 4. 访问页面

打开浏览器访问 `http://localhost:5173`，点击"🚀 Java服务拓扑"Tab

---

## 🔍 当前状态

### 功能状态
| 功能 | 前端 | 后端 | 说明 |
|------|------|------|------|
| 服务列表 | ⚠️ 框架 | ❌ 缺失 | 需要实现API调用 |
| 依赖拓扑 | ⚠️ 框架 | ❌ 缺失 | 需要实现API调用 |
| Trace查询 | ⚠️ 框架 | ❌ 缺失 | 需要实现API调用 |
| Trace搜索 | ⚠️ 框架 | ❌ 缺失 | 需要实现API调用 |
| 拓扑可视化 | ❌ 缺失 | - | 需要集成D3.js等库 |
| 节点交互 | ⚠️ 部分 | - | 点击事件已预留 |

### 数据流
```
用户操作
    ↓
JavaServiceTopology组件
    ↓
javaservice/api.js（API客户端）
    ↓
Java后端服务（需要实现）
    ↓
数据库/存储（需要实现）
```

---

## 📚 参考文档

- [Jaeger API文档](https://www.jaegertracing.io/docs/latest/apis/)
- [OpenTelemetry规范](https://opentelemetry.io/docs/reference/specification/)
- Java服务接口规范：`src/javaservice/README.md`

---

## ❓ 常见问题

### Q: 为什么前端显示"暂无拓扑数据"？
A: 因为Java服务接口尚未实现，当前返回的是空数据。需要Java后端实现相应接口。

### Q: 为什么拓扑图是简单的节点列表而不是图形？
A: 图形可视化功能尚未实现，当前只展示了节点列表。需要集成D3.js或类似库。

### Q: 可以先用Mock数据测试吗？
A: 可以！修改 `src/javaservice/api.js` 中的函数，返回Mock数据即可。

### Q: Java服务返回的数据格式必须和Jaeger一样吗？
A: 是的，前端组件依赖Jaeger的数据格式。如果Java服务使用其他格式，需要在前端API层进行转换。

---

## 🚀 下一步行动

1. **Java后端开发**：
   - 实现5个核心接口
   - 配置CORS
   - 准备测试数据

2. **前端开发**：
   - 实现API调用逻辑
   - 集成D3.js实现图形可视化
   - 完善交互功能

3. **联调测试**：
   - 接口测试
   - 数据展示验证
   - 性能优化

---

**最后更新时间**: 2026-03-25
**联系方式**: 如有疑问请联系开发团队
