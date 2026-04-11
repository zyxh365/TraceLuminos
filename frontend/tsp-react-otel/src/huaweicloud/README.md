# 华为云 APM 集成说明

## 概述

本系统已集成华为云APM（Application Performance Management）数据源，支持在拓扑图中展示华为云APM的链路追踪数据。

## 功能状态

- ✅ 基础架构已搭建完成
- ✅ 数据源切换UI已添加
- ✅ 华为云APM API核心方法已实现
  - `searchTraces()` - 搜索调用链（支持traceId和vin搜索）
  - `getTrace()` - 获取调用链拓扑图
  - `getServices()` - 获取服务列表
- ✅ TopologyView组件已支持华为云APM数据源
- ✅ 数据格式转换已实现（华为云格式 → Jaeger格式）
- ⏳ AK/SK签名认证实现中（可使用自定义认证或后端代理）
- ⏳ 等待用户提供配置信息

## 使用说明

### 切换数据源

在拓扑图工具栏中，点击数据源切换按钮：
- **Jaeger**：使用本地Jaeger数据源（默认可用）
- **华为云APM**：使用华为云APM数据源

### 搜索功能

支持两种搜索方式：
1. **TraceId搜索**：输入完整的TraceId查找特定调用链
2. **VIN搜索**：输入VIN码查找相关的调用链

### 查看拓扑图

1. **全局拓扑图**：显示所有调用链的聚合视图
2. **单次调用拓扑**：点击某个TraceId查看该次调用的详细拓扑图
   - 切换"端点视图"和"服务视图"查看不同粒度的拓扑

## 已实现的功能

### API集成

1. **调用链拓扑图API** (`ShowTopology`)
   - 端点: `GET /v1/apm2/openapi/view/trace/topology`
   - 参数: `trace_id` (必填), `region` (可选)
   - 返回: 节点列表和边列表的拓扑图数据

2. **Span数据查询API** (`ShowSpanSearch`)
   - 端点: `POST /v1/apm2/openapi/view/trace/span-search`
   - 参数: `region`, `biz_id`, `page`, `page_size`, `start_time_string`, `end_time_string`等
   - 支持按traceId、tags（如vin）搜索

### 数据转换

所有华为云APM返回的数据都会自动转换为Jaeger兼容格式，包括：
- Trace对象
- Span对象
- Process对象
- Tags格式
- References格式

这样确保了拓扑图渲染逻辑的一致性。

## 使用方式

### 1. 数据源切换

在拓扑图工具栏中，点击数据源切换按钮：
- **Jaeger**：使用本地Jaeger数据源（当前可用）
- **华为云APM**：使用华为云APM数据源（配置中）

### 2. 当前限制

华为云APM数据源尚未配置，选择后会提示：
```
华为云APM API 尚未配置，请等待配置完成
```

## 配置华为云APM

### 环境变量配置

在项目根目录创建 `.env` 文件，添加以下配置：

```bash
# 华为云APM服务地址
# 例如: https://apm.cn-north-4.myhuaweicloud.com
VITE_HUAWEI_CLOUD_APM_ENDPOINT=your-apm-endpoint

# 华为云项目ID
VITE_HUAWEI_CLOUD_PROJECT_ID=your-project-id

# Region名称（例如: cn-north-4, xxx-roma-2等）
VITE_HUAWEI_CLOUD_REGION=your-region

# 应用ID (biz_id) - 必填，从华为云APM控制台获取
VITE_HUAWEI_CLOUD_BIZ_ID=your-biz-id

# 应用名称（可选，用于显示）
VITE_HUAWEI_CLOUD_APP_NAME=your-app-name

# 环境ID（可选）
VITE_HUAWEI_CLOUD_ENV_ID=your-env-id

# 认证方式: 'aksk' | 'iam' | 'custom'
VITE_HUAWEI_CLOUD_AUTH_TYPE=aksk

# AK/SK 认证（如果使用AK/SK）
VITE_HUAWEI_CLOUD_AK=your-access-key-id
VITE_HUAWEI_CLOUD_SK=your-secret-access-key

# IAM Token 认证（如果使用IAM）
VITE_HUAWEI_CLOUD_IAM_TOKEN=your-iam-token

# 自定义认证Header（如果使用custom认证）
VITE_HUAWEI_CLOUD_CUSTOM_AUTH=Bearer your-token
```

### 华为云区域对应

| 区域 | Endpoint |
|------|----------|
| 华北-北京四 | `apm.cn-north-4.myhuaweicloud.com` |
| 华东-上海一 | `apm.cn-east-3.myhuaweicloud.com` |
| 华南-广州 | `apm.cn-south-1.myhuaweicloud.com` |

### API实现步骤

当提供华为云APM API信息后，需要实现以下方法：

#### 1. `searchTraces()` - 搜索链路
```javascript
// src/huaweicloud/apmApi.js
async searchTraces({ traceId, vin, limit, lookbackMs }) {
  // TODO: 实现华为云APM搜索接口
}
```

#### 2. `getTrace()` - 获取单个Trace详情
```javascript
async getTrace(traceId) {
  // TODO: 实现华为云APM获取trace详情接口
}
```

#### 3. `getServices()` - 获取服务列表
```javascript
async getServices() {
  // TODO: 实现华为云APM获取服务列表接口
}
```

#### 4. 数据格式转换
```javascript
_convertToJaegerFormat(huaweiData) {
  // TODO: 将华为云APM数据格式转换为Jaeger格式
}
```

## 华为云APM API参考

### API文档来源

华为云APM API文档地址：
- [调用链拓扑图 - ShowTopology](https://support.huaweicloud.com/api-apm/ShowTopology.html)
- [查询span数据 - ShowSpanSearch](https://support.huaweicloud.com/api-apm/ShowSpanSearch.html)
- [API概览](https://support.huaweicloud.com/api-apm/apm_04_0006.html)

### 核心API端点

#### 1. 调用链拓扑图 (ShowTopology)
**端点**: `GET /v1/apm2/openapi/view/trace/topology`

**查询参数**:
- `trace_id` (必填): 调用链traceId
- `region`: 区域名称 (示例: xxx-roma-2)

**响应格式**:
```json
{
  "global_trace_id": "16-1666684411910-1326",
  "node_list": [
    {
      "node_id": 11,
      "node_name": "apm-pu-task:xxx-roma-2",
      "hint": null
    }
  ],
  "line_list": [
    {
      "start_node_id": null,
      "end_node_id": 11,
      "span_id": "1",
      "client_info": null,
      "server_info": {
        "start_time": 1666684411910,
        "time_used": 1,
        "argument": "(GET)(/apm2/health/v1/health-check)(200)",
        "event_id": "1"
      },
      "hint": "(1)((GET)(/apm2/health/v1/health-check)(200))",
      "id": "1+1"
    }
  ]
}
```

#### 2. 查询span数据 (ShowSpanSearch)
**端点**: `POST /v1/apm2/openapi/view/trace/span-search`

**请求体参数**:
- `region` (必填): region名称
- `biz_id` (必填): 应用id
- `page`: 页码 (默认1)
- `page_size`: 每页数量
- `start_time_string`: 开始时间 (格式: "2022-10-25 10:03:16")
- `end_time_string`: 结束时间 (格式: "2022-10-25 10:23:16")
- `codes`: 状态码数组
- `trace_id`: traceId (可选，用于查询单个trace)
- `tags_content`: 标签内容搜索
- 其他可选参数...

**请求示例**:
```json
{
  "region": "xxx-roma-2",
  "biz_id": 162,
  "page": 1,
  "page_size": 15,
  "start_time_string": "2022-10-25 10:03:16",
  "end_time_string": "2022-10-25 10:23:16",
  "codes": []
}
```

**响应格式**:
```json
{
  "total": 2,
  "span_info_list": [
    {
      "global_trace_id": "16-1666684411910-1326",
      "trace_id": "16-1666684411910-1326",
      "span_id": "1",
      "env_id": 11,
      "instance_id": 16,
      "app_id": 11,
      "biz_id": 162,
      "source": "/apm2/health/v1/health-check",
      "real_source": "/apm2/health/v1/health-check",
      "start_time": 1666684411910,
      "time_used": 1,
      "code": 200,
      "class_name": "org/apache/catalina/core/StandardHostValve",
      "is_async": false,
      "tags": {},
      "has_error": false,
      "type": "Tomcat",
      "http_method": "GET",
      "env_name": "xxx-roma-2",
      "instance_name": "apm2-apm-pu-task-6b5bbfc84d-gtrrs(172.16.3.7)",
      "app_name": "apm-pu-task",
      "region": "xxx-roma-2"
    }
  ]
}
```

### 需要的信息

为了完成华为云APM集成，请提供以下信息：

1. **API Endpoint (端点)**：
   - 完整的API基础URL
   - 例如: `https://apm.cn-north-4.myhuaweicloud.com`

2. **认证信息**：
   - AK (Access Key ID)
   - SK (Secret Access Key)
   - Project ID

3. **业务信息**：
   - Region名称 (例如: cn-north-4)
   - 应用ID (biz_id)
   - 环境ID (env_id，如果需要)

4. **认证方式确认**：
   - 使用AK/SK认证 ✅ (已确认)
   - API签名算法 (需要确认是哪种签名方式)

## 技术架构

### 目录结构

```
src/
├── huaweicloud/
│   ├── apmApi.js          # 华为云APM API封装
│   └── README.md          # 本文档
├── jaegerApi.js           # Jaeger API封装
└── components/
    └── TopologyView.jsx   # 统一拓扑视图（支持多数据源）
```

### 数据流

```
用户操作 → TopologyView → 数据源选择
                           ↓
                    ┌──────┴──────┐
                    ↓             ↓
              Jaeger API   华为云APM API
                    ↓             ↓
              Jaeger格式    华为云格式
                    ↓             ↓
              统一转换为Jaeger格式
                    ↓
              拓扑图提取和渲染
```

## 下一步

### 1. 配置环境变量

在项目根目录创建 `.env` 文件，配置以下变量：

```bash
# 必填：华为云APM服务地址
VITE_HUAWEI_CLOUD_APM_ENDPOINT=https://apm.cn-north-4.myhuaweicloud.com

# 必填：应用ID (biz_id)
VITE_HUAWEI_CLOUD_BIZ_ID=162

# 可选：Region名称
VITE_HUAWEI_CLOUD_REGION=cn-north-4

# 可选：应用名称
VITE_HUAWEI_CLOUD_APP_NAME=your-app-name

# 认证方式（三种选择）
VITE_HUAWEI_CLOUD_AUTH_TYPE=custom

# 方式1: 自定义认证（推荐用于测试）
VITE_HUAWEI_CLOUD_CUSTOM_AUTH=Bearer your-token

# 方式2: AK/SK认证（需要实现签名算法）
# VITE_HUAWEI_CLOUD_AUTH_TYPE=aksk
# VITE_HUAWEI_CLOUD_AK=your-access-key-id
# VITE_HUAWEI_CLOUD_SK=your-secret-access-key

# 方式3: IAM Token认证
# VITE_HUAWEI_CLOUD_AUTH_TYPE=iam
# VITE_HUAWEI_CLOUD_IAM_TOKEN=your-iam-token
```

### 2. 获取配置信息

#### 如何获取biz_id（应用ID）：
1. 登录华为云APM控制台
2. 进入"应用管理" → "应用列表"
3. 找到目标应用，查看应用详情页面的URL或页面信息

#### 如何获取Region：
- 常见Region：`cn-north-4`（华北-北京四）、`cn-east-3`（华东-上海一）
- 或者从华为云控制台URL中获取

#### 如何获取认证信息：
- **AK/SK**：在华为云控制台的"我的凭证"中创建和获取
- **IAM Token**：通过IAM API获取，或使用临时token
- **自定义认证**：适用于通过后端代理转发请求的场景

### 3. 测试验证

1. 启动项目：`npm run dev`
2. 在拓扑图工具栏选择"华为云APM"数据源
3. 检查浏览器控制台日志：
   - 查看是否有配置错误提示
   - 查看API请求和响应数据
   - 验证拓扑图是否正确渲染

### 4. 认证问题排查

如果遇到认证错误（401/403），可以尝试：
- 使用自定义认证方式，通过后端代理转发请求
- 实现完整的AK/SK签名算法（参考华为云签名文档）
- 使用IAM Token方式

### 5. 后续优化

- 实现完整的AK/SK签名认证
- 添加请求缓存机制
- 优化大数据量场景的性能
- 添加错误重试机制

## 联系与支持

如有问题或需要帮助，请提供：
- 华为云APM API文档链接
- 实际的API请求/响应示例
- 遇到的错误信息

---

**最后更新**：2025-03-24
**状态**：架构已完成，等待API配置信息
