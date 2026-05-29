# ClickHouse 冷热分离冷备方案

> **版本**：v1.0
> **日期**：2026-05-11
> **适用环境**：华为云 CloudTable ClickHouse + OBS 对象存储

## 1. 背景

### 1.1 当前状态

TSP 可观测性平台当前所有链路数据存储在 ClickHouse SSD 云盘，TTL 设置为 90 天后直接删除：

```sql
-- 当前配置（数据 90 天后删除，无法回溯）
PARTITION BY toYYYYMM(start_time)
TTL toDateTime(start_time) + INTERVAL 90 DAY
```

### 1.2 问题

- 生产环境预计接入 200 万车辆，日均 2 亿+ Span，存储成本高
- 90 天以前的链路数据无法回溯，不满足故障复盘、合规审计需求
- 全部存在 SSD 上成本太高，但冷数据不能直接丢弃

### 1.3 目标

- **热数据 90 天**：SSD 云盘，保持低延迟查询
- **冷数据 365 天**：OBS 对象存储，可查询但延迟较高
- **365 天以上**：自动删除
- **SQL 对存储位置完全透明**，无需改查询逻辑

## 2. 方案概述

采用华为云 CloudTable 内置的 ClickHouse 冷热分离特性，无需额外导入导出工具。

```
热数据（SSD，0-90 天）
       │ TTL TO DISK 'cold_disk'
       ▼
冷数据（OBS，90-365 天）
       │ TTL DELETE
       ▼
自动删除（365 天以上）
```

### 2.1 前置条件

在 CloudTable 控制台为 ClickHouse 集群开启冷热分离特性：
> 集群管理 → 更多 → 开启冷热分离

该操作只需执行一次，开启后所有表均可使用 `storage_policy = 'hot_to_cold'`。

### 2.2 核心配置参数

| 参数 | 值 | 说明 |
|---|---|---|
| `storage_policy` | `hot_to_cold` | CloudTable 固定值，不可自定义 |
| 冷磁盘名 | `cold_disk` | 对应 OBS 对象存储，固定名称 |
| 热磁盘 | SSD 云盘 | 集群本地磁盘 |
| 迁移粒度 | Part（分区内数据块） | 按 TTL 自动触发 |

## 3. 表级别配置

### 3.1 需要冷热分离的表

| 表 | 冷热分离 | 原因 |
|---|---|---|
| `platform.tsp_spans` | **是** | 核心链路表，数据量最大 |
| `platform.tsp_span_events` | **是** | 事件数据，与 spans 关联 |
| `platform.tsp_errors` | 是 | 错误追溯有长期需求 |
| `platform.tsp_span_metrics` | 否 | 聚合数据，数据量极小 |
| `platform.tsp_service_topology` | 否 | 聚合快照，数据量极小 |
| `platform.tsp_alert_rules` | 否 | 配置表，量极小 |
| `platform.tsp_alert_events` | 否 | 告警事件，量小 |
| `otel.otel_traces` | 否 | 临时表，已有 MV 桥接 |

### 3.2 tsp_spans

```sql
-- 1. 指定存储策略
ALTER TABLE platform.tsp_spans
MODIFY SETTING storage_policy = 'hot_to_cold';

-- 2. 修改 TTL：90 天热 → 冷盘，365 天删除
ALTER TABLE platform.tsp_spans
MODIFY TTL start_time + INTERVAL 90 DAY TO DISK 'cold_disk',
           start_time + INTERVAL 365 DAY DELETE;
```

### 3.3 tsp_span_events

```sql
ALTER TABLE platform.tsp_span_events
MODIFY SETTING storage_policy = 'hot_to_cold';

ALTER TABLE platform.tsp_span_events
MODIFY TTL event_time + INTERVAL 30 DAY TO DISK 'cold_disk',
           event_time + INTERVAL 180 DAY DELETE;
```

> 事件表冷数据保留 180 天后删除，生命周期短于 spans。

### 3.4 tsp_errors（可选）

```sql
ALTER TABLE platform.tsp_errors
MODIFY SETTING storage_policy = 'hot_to_cold';

ALTER TABLE platform.tsp_errors
MODIFY TTL time + INTERVAL 90 DAY TO DISK 'cold_disk',
           time + INTERVAL 365 DAY DELETE;
```

## 4. 查询行为

### 4.1 完全透明

所有查询 SQL **无需任何修改**，也**不需要**指定日期、路径、存储类型。

```sql
-- 这个查询可能同时从 SSD 和 OBS 拉数据，完全自动
SELECT trace_id, service_name, name, duration_ns
FROM platform.tsp_spans
WHERE start_time BETWEEN '2025-06-01' AND '2026-05-11'
  AND biz_vin = 'VIN-XXXXX'
ORDER BY start_time DESC
LIMIT 100;
```

### 4.2 性能差异

| 查询范围 | 数据位置 | 延迟 |
|---|---|---|
| 最近 90 天 | SSD | 毫秒级 |
| 90-365 天 | OBS | 秒级（首次慢，OBS 有缓存） |
| 跨冷热 | SSD + OBS 混合 | 取决于冷数据占比 |

### 4.3 查看分区存储位置

```sql
SELECT
    partition,
    disk_name,
    count() AS parts,
    formatReadableSize(sum(bytes_on_disk)) AS size
FROM system.parts
WHERE database = 'platform' AND table = 'tsp_spans' AND active = 1
GROUP BY partition, disk_name
ORDER BY partition DESC;
```

示例输出：

```
┌─partition─┬─disk_name─┬─parts─┬─size──────┐
│ 202605    │ default   │     8 │ 12.50 GiB │  ← SSD 热盘
│ 202604    │ default   │    10 │ 11.20 GiB │
│ 202603    │ default   │     9 │ 10.80 GiB │
│ 202602    │ cold_disk │     4 │  9.50 GiB │  ← OBS 冷盘
│ 202601    │ cold_disk │     4 │  9.10 GiB │
│ 202512    │ cold_disk │     4 │  8.80 GiB │
└───────────┴───────────┴───────┴───────────┘
```

## 5. 存储成本估算

以日均 2 亿 Span（200 万车辆 × 每天 100 个 Span），单 Span 压缩后 ~500 字节：

| 存储层 | 天数 | 数据量 | 单价（参考） | 月成本（参考） |
|---|---|---|---|---|
| SSD 热盘 | 0-90 天 | ~9 TB | ¥0.35/GB/月 | ~¥3,150 |
| OBS 冷盘 | 90-365 天 | ~27.5 TB | ¥0.10/GB/月 | ~¥2,750 |
| **合计** | | | | **~¥5,900/月** |

> 相比全 SSD 存储 365 天（~¥12,600/月），冷热分离可节省约 53% 存储成本。

## 6. 操作步骤

### 6.1 开启冷热分离功能

CloudTable 控制台 → ClickHouse 集群 → 更多 → **开启冷热分离**（一次性操作）

### 6.2 执行 DDL

```sql
-- tsp_spans
ALTER TABLE platform.tsp_spans MODIFY SETTING storage_policy = 'hot_to_cold';
ALTER TABLE platform.tsp_spans MODIFY TTL start_time + INTERVAL 90 DAY TO DISK 'cold_disk', start_time + INTERVAL 365 DAY DELETE;

-- tsp_span_events
ALTER TABLE platform.tsp_span_events MODIFY SETTING storage_policy = 'hot_to_cold';
ALTER TABLE platform.tsp_span_events MODIFY TTL event_time + INTERVAL 30 DAY TO DISK 'cold_disk', event_time + INTERVAL 180 DAY DELETE;

-- tsp_errors（可选）
ALTER TABLE platform.tsp_errors MODIFY SETTING storage_policy = 'hot_to_cold';
ALTER TABLE platform.tsp_errors MODIFY TTL time + INTERVAL 90 DAY TO DISK 'cold_disk', time + INTERVAL 365 DAY DELETE;
```

### 6.3 验证

```sql
-- 确认存储策略已生效
SELECT name, storage_policy FROM system.tables
WHERE database = 'platform' AND name IN ('tsp_spans', 'tsp_span_events', 'tsp_errors');

-- 确认 TTL 已更新
SELECT name, ttl_expression FROM system.tables
WHERE database = 'platform' AND name IN ('tsp_spans', 'tsp_span_events', 'tsp_errors');
```

### 6.4 注意

- `storage_policy` 一旦指定**无法修改为其他值**（只能从无 → `hot_to_cold`）
- 已存在的历史数据**不会被自动迁移**，仅新写入或合并后的 part 按 TTL 触发迁移
- 数据从热盘迁移到冷盘是**后台异步**的，不影响正常读写

## 7. 运维监控

### 7.1 存储水位监控

```sql
-- 各表冷热数据分布
SELECT
    database,
    table,
    disk_name,
    count() AS part_count,
    formatReadableSize(sum(bytes_on_disk)) AS total_size
FROM system.parts
WHERE active = 1
  AND database IN ('platform', 'otel')
GROUP BY database, table, disk_name
ORDER BY database, table, disk_name;
```

### 7.2 迁移进度监控

```sql
-- 查看当前正在执行的迁移任务
SELECT * FROM system.moves;

-- 查看迁移队列积压
SELECT * FROM system.replication_queue WHERE database = 'platform';
```

### 7.3 OBS 连接状态

控制台路径：CloudTable 集群详情 → 监控信息 → 查看 OBS 读写成功率

### 7.4 告警建议

| 告警项 | 条件 | 严重级别 |
|---|---|---|
| OBS 写入失败率 | > 1% | Critical |
| 热盘使用率 | > 85% | Warning |
| 迁移任务积压 | > 100 | Warning |
| 热盘使用率 | > 95% | Critical |

## 8. 相关文档

- [配置ClickHouse冷热分离 — CloudTable用户指南](https://support.huaweicloud.com/usermanual-cloudtable/cloudtable_01_0459.html)
- [冷热分离原理介绍](https://support.huaweicloud.com/usermanual-cloudtable/cloudtable_01_0457.html)
