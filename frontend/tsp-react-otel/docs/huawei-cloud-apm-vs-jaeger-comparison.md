# 华为云APM vs Jaeger 数据格式对比分析

## 📊 核心结论

✅ **华为云APM数据可以画出拓扑图**，但需要进行**数据格式转换**。

---

## 🔍 数据格式详细对比

### 1. TraceID字段

| 对比项 | Jaeger | 华为云APM | 差异 |
|--------|--------|-----------|------|
| 字段名 | `traceID` | `trace_id` | 命名风格不同 |
| 格式 | `36dbedffe6f5f5e180484dd35daa94fc` | `1146880-1774346359990-549606` | 都能唯一标识 |
| 提取方式 | `trace.traceID` | `trace.trace_id` | 字段名不同 |

**转换代码**：
```javascript
const traceID = huaweiTrace.trace_id;  // 注意下划线
```

---

### 2. SpanID字段

| 对比项 | Jaeger | 华为云APM | 差异 |
|--------|--------|-----------|------|
| 字段名 | `spanID` | `span_id` | 命名风格不同 |
| 格式 | `b59c1c7ec092e821` | `1`, `1-3` | 华为云带层级 |
| 唯一性 | 全局唯一 | Trace内唯一 | 都能唯一标识 |

**转换代码**：
```javascript
const spanID = event.span_id;
```

---

### 3. 服务名字段 ⭐ **核心差异**

| 对比项 | Jaeger | 华为云APM | 差异 |
|--------|--------|-----------|------|
| **位置** | `processes[].serviceName` | 直接在span上 | **结构完全不同** |
| **字段名** | `serviceName` | `app_name` | 字段名不同 |
| **关联方式** | 通过 `processID` 关联 | 直接在span上 | **关联方式不同** |

**Jaeger结构**：
```json
{
  "spans": [
    {
      "processID": "p1",
      "spanID": "xxx"
    }
  ],
  "processes": {
    "p1": {
      "serviceName": "service1"  // 服务名在这里
    }
  }
}
```

**华为云结构**：
```json
{
  "span_event_list": [
    {
      "app_name": "csc-outer-cpsp-service",  // 服务名直接在这里
      "span_id": "1",
      "trace_id": "xxx"
    }
  ]
}
```

**转换代码**：
```javascript
// 华为云直接取app_name
const serviceName = event.app_name;

// 构建Jaeger格式
const processes = {
  'p1': {
    serviceName: serviceName,
    tags: []
  }
};
```

---

### 4. 父子关系字段 ⭐ **核心差异**

| 对比项 | Jaeger | 华为云APM | 差异 |
|--------|--------|-----------|------|
| **字段名** | `references[].spanID` | `id` | **字段名和结构完全不同** |
| **关系表示** | 子引用父 | 层级ID | **方向相反** |

**Jaeger结构**（子引用父）：
```json
{
  "spanID": "child123",
  "references": [
    {
      "refType": "CHILD_OF",
      "spanID": "parent456"  // 指向父Span
    }
  ]
}
```

**华为云结构**（层级ID）：
```json
{
  "id": "1+1-1",           // 当前span
  "indent": 2,            // 层级深度
  "next_spanId": "1-1"     // 下一个子span
}
```

**解析华为云的层级关系**：
```javascript
// 华为云的id表示：父级-当前级
// "1+1-1" = 第1层的第1个子事件的第1个子事件

function parseHuaweiId(id) {
  const parts = id.split('-');
  return {
    level: parts.length,  // 层级深度
    parentId: parts.length > 1 ? parts.slice(0, -1).join('-') : null
  };
}

// 提取父span
const parentId = parseHuaweiId(event.id).parentId;
```

**转换为Jaeger格式**：
```javascript
const references = [];

if (parentId) {
  references.push({
    refType: 'CHILD_OF',
    traceID: event.trace_id,
    spanID: parentId  // 华为云的父级ID
  });
}
```

---

### 5. 时间字段 ⚠️ **单位差异**

| 对比项 | Jaeger | 华为云APM | 差异 |
|--------|--------|-----------|------|
| **字段名** | `startTime` | `start_time` | 命名风格不同 |
| **单位** | **微秒** | **毫秒** | **差1000倍** ⚠️ |
| **示例** | `1774416690217055` | `1774346359990` | 单位不同 |

**Jaeger**：
```javascript
startTime: 1774416690217055  // 微秒
duration: 6314                 // 微秒
```

**华为云APM**：
```javascript
start_time: 1774346359990   // 毫秒 ⚠️
time_used: 104               // 毫秒 ⚠️
```

**转换代码**：
```javascript
// 华为云 → Jaeger
startTime: event.start_time * 1000  // 毫秒转微秒
duration: event.time_used * 1000     // 毫秒转微秒
```

---

### 6. 操作名字段

| 对比项 | Jaeger | 华为云APM | 差异 |
|--------|--------|-----------|------|
| 字段名 | `operationName` | `method` | 字段名不同 |
| 优先级 | 直接作为操作名 | 优先用method，没有则用type | 逻辑不同 |

**转换代码**：
```javascript
operationName: event.method || event.type || event.class_name || 'unknown'
```

---

### 7. Tags字段

| 对比项 | Jaeger | 华为云APM | 差异 |
|--------|--------|-----------|------|
| 字段名 | `tags` | `tags` | 相同 |
| 格式 | `[{key, value}]` | `{}` (对象) | **格式不同** |

**Jaeger**：
```json
"tags": [
  { "key": "http.method", "value": "GET" },
  { "key": "http.url", "value": "/api/users" }
]
```

**华为云APM**：
```json
"tags": {
  "custom_key": "custom_value"  // 自定义tags
}
```

**转换代码**：
```javascript
const tags = [];

// 添加华为云的标准字段
if (event.http_method) {
  tags.push({ key: 'http.method', value: event.http_method });
}

if (event.real_source) {
  tags.push({ key: 'http.url', value: event.real_source });
}

// 添加华为云的自定义tags（如果有）
if (event.tags && typeof event.tags === 'object') {
  Object.entries(event.tags).forEach(([key, value]) => {
    tags.push({ key, value });
  });
}
```

---

## 🔄 完整转换示例

### 输入：华为云APM格式

```json
{
  "code": 0,
  "data": {
    "span_event_list": [
      {
        "trace_id": "1146880-1774346359990-549606",
        "span_id": "1",
        "event_id": "1",
        "app_name": "csc-outer-cpsp-service",
        "type": "Undertow",
        "method": "dispatchRequest",
        "start_time": 1774346359990,
        "time_used": 104,
        "id": "1+1",
        "indent": 0
      },
      {
        "trace_id": "1146880-1774346359990-549606",
        "span_id": "1",
        "event_id": "1-1",
        "app_name": "csc-outer-cpsp-service",
        "type": "REDIS_CLIENT",
        "method": "GET",
        "start_time": 1774346359991,
        "time_used": 0,
        "id": "1+1-1",
        "indent": 1
      }
    ]
  },
  "msg": "ok"
}
```

### 输出：Jaeger格式（转换后）

```json
{
  "traceID": "1146880-1774346359990-549606",
  "spans": [
    {
      "traceID": "1146880-1774346359990-549606",
      "spanID": "1",
      "operationName": "dispatchRequest",
      "processID": "p1",
      "references": [],
      "startTime": 1774346359990000,
      "duration": 104000,
      "tags": [
        { "key": "span.kind", "value": "Undertow" }
      ]
    },
    {
      "traceID": "1146880-1774346359990-549606",
      "spanID": "1",
      "operationName": "GET",
      "processID": "p1",
      "references": [
        {
          "refType": "CHILD_OF",
          "traceID": "1146880-1774346359990-549606",
          "spanID": "1"
        }
      ],
      "startTime": 1774346359991000,
      "duration": 0,
      "tags": [
        { "key": "span.kind", "value": "REDIS_CLIENT" },
        { "key": "http.method", "value": "GET" }
      ]
    }
  ],
  "processes": {
    "p1": {
      "serviceName": "csc-outer-cpsp-service",
      "tags": []
    }
  }
}
```

---

## ✅ 拓扑图绘制可行性分析

### 华为云APM数据具备的信息

| 需求 | 华为云字段 | 可用性 |
|------|-----------|--------|
| Trace标识 | `trace_id` | ✅ |
| Span标识 | `span_id` | ✅ |
| 服务名称 | `app_name` | ✅ |
| 操作名称 | `method` / `type` | ✅ |
| 父子关系 | `id` + `indent` | ✅ |
| 开始时间 | `start_time` | ✅ |
| 持续时间 | `time_used` | ✅ |
| 额外信息 | `tags` / `http_method` | ✅ |

### 转换步骤

1. **提取服务名**：从 `app_name` 直接获取
2. **提取父子关系**：从 `id` 字段解析层级
3. **转换时间单位**：毫秒 × 1000 = 微秒
4. **构建processes**：统一使用 `p1`
5. **构建tags**：从标准字段映射

---

## 📋 转换检查清单

### 必须转换的字段

- [x] `trace_id` → `traceID`
- [x] `span_id` → `spanID`
- [x] `app_name` → `processes[].serviceName`
- [x] `method` → `operationName`
- [x] `start_time` × 1000 → `startTime`（微秒）
- [x] `time_used` × 1000 → `duration`（微秒）
- [x] `id` 解析 → `references[].spanID`
- [x] `tags` 对象 → `tags` 数组

### 可选转换的字段

- [ ] `http_method` → tags
- [ ] `real_source` → tags
- [ ] `argument` → tags
- [ ] `type` → tags
- [ ] `env_name` → tags
- [ ] `region` → tags

---

## 🎯 最终答案

### ❓ 能否画出拓扑图？

**答案：✅ 可以，但需要数据转换**

### 📝 需要做的工作

1. **数据格式转换**：
   - 使用 `converter.js` 中的转换函数
   - 将华为云APM格式转换为Jaeger格式

2. **时间单位转换**：
   - 华为云：毫秒
   - Jaeger：微秒
   - 转换：`× 1000`

3. **父子关系转换**：
   - 华为云：层级ID（如 "1+1-1"）
   - Jaeger：references引用
   - 需要解析层级ID构建引用关系

4. **服务名映射**：
   - 华为云：直接在span上
   - Jaeger：在processes中
   - 需要构建processes对象

### 💡 建议

1. **在后端进行转换**：
   - Java服务从华为云APM获取数据
   - 在Java后端转换为Jaeger格式
   - 前端直接使用Jaeger格式

2. **或在前端进行转换**：
   - 前端调用华为云APM接口
   - 使用 `converter.js` 转换
   - 然后传给拓扑图组件

---

**转换代码已创建**：`src/huaweicloud/converter.js`
