# 链路验证页面 — Baggage 业务字段扩展

**日期**: 2026-05-06
**范围**: 前端 `tsp-monitor-web` 项目，链路验证 Tab 页面

## 目标

在 Baggage 设置面板中补齐 `tsp_spans` 表的全部业务字段，使链路验证场景能完整覆盖业务维度的 Baggage 透传验证。

## 数据流

```
BaggagePanel (设置字段)
  → VerifyPage baggageState
    → HTTP Request (baggage header 透传)
      → 后端服务 (OTel Agent 提取到 Span/Resource Attributes)
        → ClickHouse tsp_spans 业务列
```

## 字段映射

| Baggage Key       | Attribute 来源       | ClickHouse 列      | 说明            |
| ----------------- | ------------------ | ----------------- | ------------- |
| `biz.user_id`     | SpanAttributes     | `biz_user_id`     | 用户ID          |
| `biz.vin`         | SpanAttributes     | `biz_vin`         | 车辆VIN（已有，保留）  |
| `biz.platform`    | SpanAttributes     | `biz_platform`    | 终端类型          |
| `biz.app_version` | SpanAttributes     | `biz_app_version` | APP版本（新增）     |
| `biz.system`      | ResourceAttributes | `biz_system`      | TSP系统（新增）     |
| `biz.channel`     | SpanAttributes     | `biz_channel`     | 业务渠道（新增）      |
| `biz.brand`       | SpanAttributes     | `biz_brand`       | 品牌（新增）        |
| `biz.tenant`      | SpanAttributes     | `biz_tenant`      | 租户（已有，key重命名） |

## 改动清单

### 1. `src/verify/BaggagePanel.jsx`

- 字段从 4 个扩展到 8 个
- 全部使用 `biz.xxx` 命名
- 布局保持 `repeat(4, 1fr)`，8 个字段分两行
- 每个字段带 placeholder 提示

### 2. `src/pages/VerifyPage.jsx`

- `baggageState` 初始值更新为 8 个 key，使用合理默认值

### 不涉及

- SQL schema（字段已存在）
- 后端 API（baggage header 自动透传）
- ScenarioPanel / TraceLog（无需改动）

## 默认值

| 字段                | 默认值            |
| ----------------- | -------------- |
| `biz.user_id`     | `user-001`     |
| `biz.vin`         | `VIN-TEST-001` |
| `biz.platform`    | `h5`           |
| `biz.app_version` | `1.0.0`        |
| `biz.system`      | `NTSP`         |
| `biz.channel`     | `chery-app`    |
| `biz.brand`       | `chery`        |
| `biz.tenant`      | `tsp-test`     |
