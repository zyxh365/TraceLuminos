-- ============================================================
-- TSP 可观测性平台 - 多系统多品牌多维表结构升级
-- 版本：v3.0
-- 更新日期：2026-04-21
--
-- 背景：
--   全链路监控平台需要接入多个 TSP 系统，每个 TSP 系统下又有多个品牌。
--   需要在 ClickHouse 中支持按以下维度进行数据隔离和查询：
--     biz_system  — TSP 系统标识（哪个 TSP 实例）
--     env         — 部署环境（production / test / dev）
--     biz_channel — 业务渠道/APP产品（chery-app / jetour-app / tata-app 等）
--     biz_brand   — 品牌（chery / jetour / iCar 等，预留）
--     biz_platform — 技术平台/终端类型（已有字段：android / ios / h5 / web / tbox）
--     biz_tenant  — 租户（预留）
--     vin         — VIN 码（已有 biz_vin 字段）
--
-- 数据来源：
--   - biz_system / env：由 Edge Collector transform processor 注入（配置写死）
--   - biz_channel / biz_brand / biz_tenant / vin：由 APP 端 OTel SDK Resource 注入，
--     通过 W3C Baggage 在链路中自动透传
--
-- 依赖：基于 01_init_database_OK.sql 表结构做增量变更
-- ============================================================


-- ============================================================
-- 1. tsp_spans — Span 主表：新增多维字段
-- ============================================================

-- 新增列
ALTER TABLE platform.tsp_spans
  ADD COLUMN IF NOT EXISTS biz_system  LowCardinality(String) DEFAULT ''
    COMMENT 'TSP系统标识：ntsp / stsp / ...（Edge Collector 注入）',
  ADD COLUMN IF NOT EXISTS env         LowCardinality(String) DEFAULT ''
    COMMENT '部署环境：production / test / dev（Edge Collector 注入）',
  ADD COLUMN IF NOT EXISTS biz_channel LowCardinality(String) DEFAULT ''
    COMMENT '业务渠道/APP产品：chery-app / jetour-app / tata-app 等（APP SDK Resource 注入，Baggage 透传）',
  ADD COLUMN IF NOT EXISTS biz_brand   LowCardinality(String) DEFAULT ''
    COMMENT '品牌标识：bmw / audi / mercedes 等（预留，APP SDK Resource 注入，Baggage 透传）',
  ADD COLUMN IF NOT EXISTS biz_tenant  LowCardinality(String) DEFAULT ''
    COMMENT '租户标识（预留，APP SDK Resource 注入，Baggage 透传）';

-- 新增索引
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_biz_system  biz_system  TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_env         env         TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_biz_channel biz_channel TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_biz_brand   biz_brand   TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_biz_tenant  biz_tenant  TYPE bloom_filter(0.01) GRANULARITY 1;


-- ============================================================
-- 2. tsp_span_events — 事件表：新增多维字段
-- ============================================================

ALTER TABLE platform.tsp_span_events
  ADD COLUMN IF NOT EXISTS biz_system  LowCardinality(String) DEFAULT ''
    COMMENT 'TSP系统标识',
  ADD COLUMN IF NOT EXISTS env         LowCardinality(String) DEFAULT ''
    COMMENT '部署环境',
  ADD COLUMN IF NOT EXISTS biz_channel LowCardinality(String) DEFAULT ''
    COMMENT '业务渠道/APP产品',
  ADD COLUMN IF NOT EXISTS biz_brand   LowCardinality(String) DEFAULT ''
    COMMENT '品牌（预留）',
  ADD COLUMN IF NOT EXISTS biz_tenant  LowCardinality(String) DEFAULT ''
    COMMENT '租户（预留）';

ALTER TABLE platform.tsp_span_events ADD INDEX IF NOT EXISTS idx_biz_system  biz_system  TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_span_events ADD INDEX IF NOT EXISTS idx_env         env         TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_span_events ADD INDEX IF NOT EXISTS idx_biz_channel biz_channel TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_span_events ADD INDEX IF NOT EXISTS idx_biz_brand   biz_brand   TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_span_events ADD INDEX IF NOT EXISTS idx_biz_tenant  biz_tenant  TYPE bloom_filter(0.01) GRANULARITY 1;


-- ============================================================
-- 3. tsp_span_metrics — 聚合统计表：新增多维字段
-- ============================================================

ALTER TABLE platform.tsp_span_metrics
  ADD COLUMN IF NOT EXISTS biz_system  LowCardinality(String) DEFAULT ''
    COMMENT 'TSP系统标识',
  ADD COLUMN IF NOT EXISTS env         LowCardinality(String) DEFAULT ''
    COMMENT '部署环境',
  ADD COLUMN IF NOT EXISTS biz_channel LowCardinality(String) DEFAULT ''
    COMMENT '业务渠道/APP产品',
  ADD COLUMN IF NOT EXISTS biz_brand   LowCardinality(String) DEFAULT ''
    COMMENT '品牌（预留）',
  ADD COLUMN IF NOT EXISTS biz_tenant  LowCardinality(String) DEFAULT ''
    COMMENT '租户（预留）';

-- 注意：SummingMergeTree 的 ORDER BY 无法通过 ALTER 修改
-- 需要重建表以将新维度纳入排序键，参见下方第 9 节


-- ============================================================
-- 4. tsp_errors — 错误明细表：新增多维字段
-- ============================================================

ALTER TABLE platform.tsp_errors
  ADD COLUMN IF NOT EXISTS biz_system  LowCardinality(String) DEFAULT ''
    COMMENT 'TSP系统标识',
  ADD COLUMN IF NOT EXISTS env         LowCardinality(String) DEFAULT ''
    COMMENT '部署环境',
  ADD COLUMN IF NOT EXISTS biz_channel LowCardinality(String) DEFAULT ''
    COMMENT '业务渠道/APP产品',
  ADD COLUMN IF NOT EXISTS biz_brand   LowCardinality(String) DEFAULT ''
    COMMENT '品牌（预留）',
  ADD COLUMN IF NOT EXISTS biz_tenant  LowCardinality(String) DEFAULT ''
    COMMENT '租户（预留）';

ALTER TABLE platform.tsp_errors ADD INDEX IF NOT EXISTS idx_biz_system  biz_system  TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_errors ADD INDEX IF NOT EXISTS idx_env         env         TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_errors ADD INDEX IF NOT EXISTS idx_biz_channel biz_channel TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_errors ADD INDEX IF NOT EXISTS idx_biz_brand   biz_brand   TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_errors ADD INDEX IF NOT EXISTS idx_biz_tenant  biz_tenant  TYPE bloom_filter(0.01) GRANULARITY 1;


-- ============================================================
-- 5. tsp_service_topology — 拓扑快照表：新增多维字段
-- ============================================================

ALTER TABLE platform.tsp_service_topology
  ADD COLUMN IF NOT EXISTS biz_system  LowCardinality(String) DEFAULT ''
    COMMENT 'TSP系统标识',
  ADD COLUMN IF NOT EXISTS env         LowCardinality(String) DEFAULT ''
    COMMENT '部署环境',
  ADD COLUMN IF NOT EXISTS biz_channel LowCardinality(String) DEFAULT ''
    COMMENT '业务渠道/APP产品',
  ADD COLUMN IF NOT EXISTS biz_brand   LowCardinality(String) DEFAULT ''
    COMMENT '品牌（预留）',
  ADD COLUMN IF NOT EXISTS biz_tenant  LowCardinality(String) DEFAULT ''
    COMMENT '租户（预留）';

-- 注意：SummingMergeTree 的 ORDER BY 无法通过 ALTER 修改
-- 需要重建表以将新维度纳入排序键，参见下方第 9 节


-- ============================================================
-- 6. tsp_alert_rules — 告警规则表：新增多维字段
-- ============================================================

ALTER TABLE platform.tsp_alert_rules
  ADD COLUMN IF NOT EXISTS biz_system  LowCardinality(String) DEFAULT ''
    COMMENT '限定 TSP 系统（空 = 全部）',
  ADD COLUMN IF NOT EXISTS env         LowCardinality(String) DEFAULT ''
    COMMENT '限定环境（空 = 全部，覆盖原有 deploy_env）',
  ADD COLUMN IF NOT EXISTS biz_channel LowCardinality(String) DEFAULT ''
    COMMENT '限定渠道（空 = 全部）',
  ADD COLUMN IF NOT EXISTS biz_brand   LowCardinality(String) DEFAULT ''
    COMMENT '限定品牌（空 = 全部，预留）',
  ADD COLUMN IF NOT EXISTS biz_tenant  LowCardinality(String) DEFAULT ''
    COMMENT '限定租户（空 = 全部，预留）';


-- ============================================================
-- 7. tsp_alert_events — 告警事件表：新增多维字段
-- ============================================================

ALTER TABLE platform.tsp_alert_events
  ADD COLUMN IF NOT EXISTS biz_system  LowCardinality(String) DEFAULT ''
    COMMENT 'TSP系统标识',
  ADD COLUMN IF NOT EXISTS env         LowCardinality(String) DEFAULT ''
    COMMENT '部署环境',
  ADD COLUMN IF NOT EXISTS biz_channel LowCardinality(String) DEFAULT ''
    COMMENT '业务渠道/APP产品',
  ADD COLUMN IF NOT EXISTS biz_brand   LowCardinality(String) DEFAULT ''
    COMMENT '品牌（预留）',
  ADD COLUMN IF NOT EXISTS biz_tenant  LowCardinality(String) DEFAULT ''
    COMMENT '租户（预留）';


-- ============================================================
-- 8. 桥接物化视图重建 — 增加多维字段映射
-- ============================================================
-- 物化视图无法 ALTER，必须 DROP 后重建。
-- 注意：先 DROP 再 CREATE 会导致重建期间数据不写入目标表。
-- 建议：在低峰期执行，或先创建新 MV，验证后再切换。
-- ============================================================

-- ── 8.1 mv_otel_to_spans：otel_traces → tsp_spans ──────────

DROP TABLE IF EXISTS platform.mv_otel_to_spans;

CREATE MATERIALIZED VIEW IF NOT EXISTS platform.mv_otel_to_spans
TO platform.tsp_spans
AS SELECT
    -- 链路标识
    `TraceId`                                                            AS trace_id,
    `SpanId`                                                             AS span_id,
    `ParentSpanId`                                                       AS parent_span_id,
    `TraceState`                                                         AS trace_state,

    -- 时间：Timestamp 是结束时间，开始时间 = Timestamp - Duration（纳秒）
    fromUnixTimestamp64Nano(toUnixTimestamp64Nano(`Timestamp`) - `Duration`) AS start_time,
    `Timestamp`                                                          AS end_time,
    `Duration`                                                           AS duration_ns,

    -- 服务信息（从 ResourceAttributes 提取）
    `ServiceName`                                                        AS service_name,
    `ResourceAttributes`['service.version']                              AS service_version,
    `ResourceAttributes`['service.namespace']                            AS service_namespace,
    `ResourceAttributes`['service.instance.id']                          AS service_instance,

    -- Span 基本信息
    `SpanName`                                                           AS name,
    `SpanKind`                                                           AS kind,

    -- 状态
    `StatusCode`                                                         AS status_code,
    `StatusMessage`                                                      AS status_message,

    -- HTTP 组件
    `SpanAttributes`['http.method']                                      AS http_method,
    `SpanAttributes`['http.url']                                         AS http_url,
    `SpanAttributes`['http.route']                                       AS http_route,
    toUInt16OrZero(`SpanAttributes`['http.status_code'])                 AS http_status_code,
    `SpanAttributes`['http.host']                                        AS http_host,
    `SpanAttributes`['http.scheme']                                      AS http_scheme,
    `SpanAttributes`['http.user_agent']                                  AS http_user_agent,
    `SpanAttributes`['http.flavor']                                      AS http_flavor,
    toUInt64OrZero(`SpanAttributes`['http.request_content_length'])      AS http_request_content_length,
    toUInt64OrZero(`SpanAttributes`['http.response_content_length'])     AS http_response_content_length,

    -- 数据库组件
    `SpanAttributes`['db.system']                                        AS db_system,
    `SpanAttributes`['db.name']                                          AS db_name,
    `SpanAttributes`['db.statement']                                     AS db_statement,
    `SpanAttributes`['db.operation']                                     AS db_operation,
    `SpanAttributes`['db.user']                                          AS db_user,

    -- Redis 组件
    toUInt8OrZero(`SpanAttributes`['db.redis.database'])                 AS redis_db_index,
    `SpanAttributes`['db.redis.command']                                 AS redis_command,
    toUInt32OrZero(`SpanAttributes`['db.redis.key_length'])              AS redis_key_length,

    -- 消息队列组件
    `SpanAttributes`['messaging.system']                                 AS messaging_system,
    `SpanAttributes`['messaging.destination']                            AS messaging_destination,
    `SpanAttributes`['messaging.operation']                              AS messaging_operation,
    `SpanAttributes`['messaging.message_id']                             AS messaging_message_id,
    `SpanAttributes`['messaging.consumer.group']                         AS messaging_consumer_group,
    toInt32OrZero(`SpanAttributes`['messaging.kafka.partition'])         AS messaging_kafka_partition,
    `SpanAttributes`['messaging.kafka.key']                              AS messaging_kafka_key,
    toUInt64OrZero(`SpanAttributes`['messaging.kafka.offset'])          AS messaging_kafka_offset,

    -- RPC 组件
    `SpanAttributes`['rpc.system']                                       AS rpc_system,
    `SpanAttributes`['rpc.service']                                      AS rpc_service,
    `SpanAttributes`['rpc.method']                                       AS rpc_method,
    `SpanAttributes`['rpc.grpc.status_code']                             AS rpc_grpc_status_code,

    -- 线程信息
    `SpanAttributes`['thread.name']                                      AS thread_name,
    toUInt64OrZero(`SpanAttributes`['thread.id'])                        AS thread_id,

    -- FaaS / 容器
    `SpanAttributes`['faas.name']                                        AS faas_name,
    `SpanAttributes`['faas.trigger']                                     AS faas_trigger,
    `SpanAttributes`['container.id']                                     AS container_id,
    `SpanAttributes`['container.name']                                   AS container_name,

    -- TSP 业务字段（Baggage → biz.* 由 APP SDK 注入，Baggage 透传）
    `SpanAttributes`['biz.vin']                                          AS biz_vin,
    `SpanAttributes`['biz.command_type']                                 AS biz_command_type,
    `SpanAttributes`['biz.command_status']                               AS biz_command_status,
    `SpanAttributes`['biz.user_id']                                      AS biz_user_id,
    `SpanAttributes`['biz.platform']                                     AS biz_platform,
    `SpanAttributes`['biz.app_version']                                  AS biz_app_version,
    `SpanAttributes`['biz.country']                                      AS biz_country,
    `SpanAttributes`['biz.region']                                       AS biz_region,

    -- ★ 多维字段（新增）
    `ResourceAttributes`['biz.system']                                   AS biz_system,
    `ResourceAttributes`['env']                                          AS env,
    `SpanAttributes`['biz.channel']                                      AS biz_channel,
    `SpanAttributes`['biz.brand']                                        AS biz_brand,
    `SpanAttributes`['biz.tenant']                                       AS biz_tenant,

    -- 环境维度（保留兼容）
    `SpanAttributes`['deploy.env']                                       AS deploy_env,
    `SpanAttributes`['deploy.region']                                    AS deploy_region,

    -- 资源属性
    `ResourceAttributes`['host.name']                                    AS host_name,
    `ResourceAttributes`['host.ip']                                      AS host_ip,
    `ResourceAttributes`['os.type']                                      AS os_type,
    `ResourceAttributes`['os.version']                                   AS os_version,
    `ResourceAttributes`['cloud.provider']                               AS cloud_provider,
    `ResourceAttributes`['cloud.region']                                 AS cloud_region,
    `ResourceAttributes`['cloud.availability-zone']                       AS cloud_az,

    -- 链路入口信息
    `SpanAttributes`['source.type']                                      AS source_type,
    `SpanAttributes`['net.peer.ip']                                      AS source_ip,
    toUInt32OrZero(`SpanAttributes`['net.peer.port'])                    AS source_port,

    -- 事件（留空，由 mv_otel_to_span_events 独立处理）
    ''                                                                   AS event_name,
    now64(9)                                                             AS event_time,
    map()                                                                AS event_attributes,

    -- Link 信息
    if(length(`Links`.`TraceId`) > 0, arrayElement(`Links`.`TraceId`, 1), '')   AS linked_trace_id,
    if(length(`Links`.`SpanId`) > 0, arrayElement(`Links`.`SpanId`, 1), '')     AS linked_span_id,

    -- 扩展属性：整表透传
    cast(`SpanAttributes`, 'Map(String, String)')                         AS attributes_map,
    cast(`ResourceAttributes`, 'Map(String, String)')                    AS resource_map,

    -- 元数据
    now()                                                                AS insert_time,
    if(`ParentSpanId` = '', 1, 0)                                        AS is_root
FROM otel.otel_traces;


-- ── 8.2 mv_otel_to_span_events：otel_traces.Events → tsp_span_events ──

DROP TABLE IF EXISTS platform.mv_otel_to_span_events;

CREATE MATERIALIZED VIEW IF NOT EXISTS platform.mv_otel_to_span_events
TO platform.tsp_span_events
AS SELECT
    concat(
        `TraceId`,
        `SpanId`,
        formatDateTime(ev_time, '%Y%m%d%H%M%S%f')
    )                                                                    AS event_id,
    `TraceId`                                                            AS trace_id,
    `SpanId`                                                             AS span_id,
    ev_time                                                              AS event_time,
    `ServiceName`                                                        AS service_name,
    `SpanName`                                                           AS span_name,

    multiIf(
        ev_name = 'exception', 'exception',
        ev_name LIKE 'log%', 'log',
        ev_name LIKE 'message%', 'message',
        'custom'
    )                                                                    AS event_type,
    ev_name                                                              AS event_name,

    ev_attrs['exception.type']                                           AS exception_type,
    ev_attrs['exception.message']                                        AS exception_message,
    ev_attrs['exception.stacktrace']                                     AS exception_stack,
    cast(ev_attrs, 'Map(String, String)')                                AS event_attributes,

    -- 业务维度
    `SpanAttributes`['biz.vin']                                          AS biz_vin,
    `SpanAttributes`['biz.user_id']                                      AS biz_user_id,
    `SpanAttributes`['biz.command_type']                                 AS biz_command_type,

    -- ★ 多维字段（新增）
    `ResourceAttributes`['biz.system']                                   AS biz_system,
    `SpanAttributes`['deploy.env']                                       AS deploy_env,
    `SpanAttributes`['biz.channel']                                      AS biz_channel,

    -- 来源信息
    `SpanAttributes`['net.peer.ip']                                      AS source_ip,
    `SpanAttributes`['http.url']                                         AS http_url,
    `SpanAttributes`['http.method']                                      AS http_method,
    toUInt16OrZero(`SpanAttributes`['http.status_code'])                 AS http_status_code,

    now()                                                                AS insert_time
FROM otel.otel_traces
ARRAY JOIN
    `Events`.`Timestamp` AS ev_time,
    `Events`.`Name`      AS ev_name,
    `Events`.`Attributes` AS ev_attrs
WHERE length(`Events`.`Name`) > 0;


-- ── 8.3 mv_errors：tsp_spans → tsp_errors（重建，增加多维字段）──

DROP TABLE IF EXISTS platform.mv_errors;

CREATE MATERIALIZED VIEW IF NOT EXISTS platform.mv_errors
TO platform.tsp_errors
AS SELECT
    start_time AS time,
    trace_id,
    span_id,
    parent_span_id,
    service_name,
    service_version,

    status_message AS error_type,
    status_message AS error_message,
    '' AS error_stack,

    name AS span_name,
    kind AS span_kind,
    duration_ns,

    http_method,
    http_url,
    http_route,
    http_status_code,
    '' AS http_request_body,

    db_system,
    db_statement,

    biz_vin,
    biz_user_id,
    biz_command_type,
    biz_platform,
    deploy_env,

    -- ★ 多维字段（新增）
    biz_system,
    env,
    biz_channel,
    biz_brand,
    biz_tenant,

    source_ip,
    now() AS insert_time
FROM platform.tsp_spans
WHERE status_code = 'ERROR';


-- ============================================================
-- 9. 需要重建的表（ORDER BY 变更，无法 ALTER）
-- ============================================================
-- 以下 SummingMergeTree 表的 ORDER BY 需要加入新维度字段，
-- ClickHouse 不支持 ALTER ORDER BY，必须通过建新表 → 迁移数据 → 重命名的方式。
--
-- ★ 重要：生产环境请在低峰期执行，先备份后操作。
-- ============================================================

-- ── 9.1 tsp_span_metrics 重建 ──────────────────────────────

-- Step 1: 创建新表
DROP TABLE IF EXISTS platform.tsp_span_metrics_new;
CREATE TABLE platform.tsp_span_metrics_new (
    time               DateTime COMMENT '时间窗口起点',
    window             LowCardinality(String) COMMENT '窗口类型：5min/minute/hour/day',

    -- 服务维度
    service_name       LowCardinality(String) COMMENT '服务名称',

    -- 操作维度
    span_name          String COMMENT 'Span 名称',
    span_kind          LowCardinality(String) COMMENT 'Span 类型',

    -- 组件维度
    db_system          LowCardinality(String) COMMENT '数据库类型',
    messaging_system   LowCardinality(String) COMMENT '消息系统',
    http_method        LowCardinality(String) COMMENT 'HTTP 方法',
    http_route         LowCardinality(String) COMMENT 'HTTP 路由',

    -- 业务维度
    biz_tenant_id      LowCardinality(String) COMMENT '租户 ID',
    biz_platform       LowCardinality(String) COMMENT '平台',
    biz_command_type   LowCardinality(String) COMMENT '指令类型',
    deploy_env         LowCardinality(String) COMMENT '部署环境',

    -- ★ 多维字段（新增）
    biz_system         LowCardinality(String) DEFAULT '' COMMENT 'TSP系统标识',
    env                LowCardinality(String) DEFAULT '' COMMENT '部署环境',
    biz_channel        LowCardinality(String) DEFAULT '' COMMENT '业务渠道/APP产品',
    biz_brand          LowCardinality(String) DEFAULT '' COMMENT '品牌（预留）',
    biz_tenant         LowCardinality(String) DEFAULT '' COMMENT '租户（预留）',

    -- 统计指标
    span_count         UInt64 COMMENT 'Span 总数',
    trace_count        UInt64 COMMENT 'Trace 总数（去重）',
    error_count        UInt64 COMMENT '错误数',
    error_rate         Float32 COMMENT '错误率',

    -- 耗时分位数（纳秒）
    duration_p50       UInt64 COMMENT 'P50 耗时',
    duration_p75       UInt64 COMMENT 'P75 耗时',
    duration_p90       UInt64 COMMENT 'P90 耗时',
    duration_p95       UInt64 COMMENT 'P95 耗时',
    duration_p99       UInt64 COMMENT 'P99 耗时',
    duration_avg       Float64 COMMENT '平均耗时',
    duration_max       UInt64 COMMENT '最大耗时',
    duration_min       UInt64 COMMENT '最小耗时',

    -- 吞吐量
    qps                Float64 COMMENT '每秒请求数（仅 window=minute 时有意义）',

    -- 元数据
    updated_time       DateTime DEFAULT now() COMMENT '最后更新时间'
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(time)
ORDER BY (time, window, service_name, span_name, biz_tenant_id, deploy_env, biz_system, env, biz_channel, biz_brand, biz_tenant)
TTL toDateTime(time) + INTERVAL 365 DAY;

-- Step 2: 迁移数据（新字段留空，由物化视图重新填充）
INSERT INTO platform.tsp_span_metrics_new
SELECT
    time, window, service_name, span_name, span_kind,
    db_system, messaging_system, http_method, http_route,
    biz_tenant_id, biz_platform, biz_command_type, deploy_env,
    '' AS biz_system, '' AS env, '' AS biz_channel, '' AS biz_brand, '' AS biz_tenant,
    span_count, trace_count, error_count, error_rate,
    duration_p50, duration_p75, duration_p90, duration_p95, duration_p99,
    duration_avg, duration_max, duration_min,
    qps, updated_time
FROM platform.tsp_span_metrics;

-- Step 3: 交换表名（原子操作）
EXCHANGE TABLES platform.tsp_span_metrics AND platform.tsp_span_metrics_new;


-- ── 9.2 tsp_service_topology 重建 ──────────────────────────

DROP TABLE IF EXISTS platform.tsp_service_topology_new;
CREATE TABLE platform.tsp_service_topology_new (
    time               DateTime COMMENT '快照时间（小时）',

    -- 调用关系
    source_service     LowCardinality(String) COMMENT '调用方服务',
    target_service     LowCardinality(String) COMMENT '被调用方服务',
    operation          String COMMENT '操作名称',
    protocol           LowCardinality(String) COMMENT '协议：http/grpc/kafka',

    -- 统计
    call_count         UInt64 COMMENT '调用次数',
    error_count        UInt64 COMMENT '失败次数',
    avg_duration_ms    Float64 COMMENT '平均耗时（毫秒）',
    p99_duration_ms    Float64 COMMENT 'P99 耗时（毫秒）',

    -- 业务维度
    deploy_env         LowCardinality(String) COMMENT '部署环境',

    -- ★ 多维字段（新增）
    biz_system         LowCardinality(String) DEFAULT '' COMMENT 'TSP系统标识',
    env                LowCardinality(String) DEFAULT '' COMMENT '部署环境',
    biz_channel        LowCardinality(String) DEFAULT '' COMMENT '业务渠道/APP产品',
    biz_brand          LowCardinality(String) DEFAULT '' COMMENT '品牌（预留）',
    biz_tenant         LowCardinality(String) DEFAULT '' COMMENT '租户（预留）',

    -- 元数据
    updated_time       DateTime DEFAULT now()
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(time)
ORDER BY (time, source_service, target_service, operation, protocol, deploy_env, biz_system, env, biz_channel, biz_brand, biz_tenant)
TTL time + INTERVAL 90 DAY;

INSERT INTO platform.tsp_service_topology_new
SELECT
    time, source_service, target_service, operation, protocol,
    call_count, error_count, avg_duration_ms, p99_duration_ms,
    deploy_env, '' AS biz_system, '' AS env, '' AS biz_channel, '' AS biz_brand, '' AS biz_tenant,
    updated_time
FROM platform.tsp_service_topology;

EXCHANGE TABLES platform.tsp_service_topology AND platform.tsp_service_topology_new;


-- ── 9.3 mv_spans_hourly 重建（纳入多维字段）───────────────

DROP TABLE IF EXISTS platform.mv_spans_hourly;

CREATE MATERIALIZED VIEW IF NOT EXISTS platform.mv_spans_hourly
TO platform.tsp_span_metrics
AS SELECT
    toStartOfHour(start_time) AS time,
    'hour' AS window,
    service_name,
    name AS span_name,
    kind AS span_kind,
    db_system,
    messaging_system,
    http_method,
    http_route,
    biz_tenant_id,
    biz_platform,
    biz_command_type,
    deploy_env,

    -- ★ 多维字段
    biz_system,
    env,
    biz_channel,
    biz_brand,
    biz_tenant,

    count() AS span_count,
    count(DISTINCT trace_id) AS trace_count,
    sum(if(status_code = 'ERROR', 1, 0)) AS error_count,
    sum(if(status_code = 'ERROR', 1, 0)) * 1.0 / count() AS error_rate,

    quantile(0.50)(duration_ns) AS duration_p50,
    quantile(0.75)(duration_ns) AS duration_p75,
    quantile(0.90)(duration_ns) AS duration_p90,
    quantile(0.95)(duration_ns) AS duration_p95,
    quantile(0.99)(duration_ns) AS duration_p99,
    avg(duration_ns) AS duration_avg,
    max(duration_ns) AS duration_max,
    min(duration_ns) AS duration_min,

    count() / 3600.0 AS qps,

    now() AS updated_time
FROM platform.tsp_spans
GROUP BY
    time, service_name, name, kind, db_system, messaging_system,
    http_method, http_route,
    biz_tenant_id, biz_platform, biz_command_type,
    deploy_env, biz_system, env, biz_channel, biz_brand, biz_tenant;


-- ── 9.4 mv_service_topology_hourly 重建（纳入多维字段）────

DROP TABLE IF EXISTS platform.mv_service_topology_hourly;

CREATE MATERIALIZED VIEW IF NOT EXISTS platform.mv_service_topology_hourly
TO platform.tsp_service_topology
AS
SELECT
    toStartOfHour(start_time) AS time,

    service_name AS source_service,

    multiIf(
        attributes_map['peer.service'] != '', attributes_map['peer.service'],
        attributes_map['http.target_service'] != '', attributes_map['http.target_service'],
        'unknown'
    ) AS target_service,

    name AS operation,

    multiIf(
        db_system != '', 'db',
        messaging_system != '', messaging_system,
        http_method != '', 'http',
        'internal'
    ) AS protocol,

    count() AS call_count,

    sum(if(status_code = 'ERROR', 1, 0)) AS error_count,

    avg(duration_ns) / 1000000 AS avg_duration_ms,

    quantile(0.99)(duration_ns) / 1000000 AS p99_duration_ms,

    deploy_env,

    -- ★ 多维字段
    biz_system,
    env,
    biz_channel,
    biz_brand,
    biz_tenant,

    now() AS updated_time

FROM platform.tsp_spans

WHERE
    kind = 'CLIENT'
    AND (
        attributes_map['peer.service'] != ''
        OR attributes_map['http.target_service'] != ''
    )

GROUP BY
    time,
    source_service,
    target_service,
    operation,
    protocol,
    deploy_env,
    biz_system, env, biz_channel, biz_brand, biz_tenant;


-- ============================================================
-- 10. 视图更新
-- ============================================================

-- ── 10.1 v_trace_detail — 增加多维字段 ─────────────────────

DROP VIEW IF EXISTS platform.v_trace_detail;

CREATE VIEW IF NOT EXISTS platform.v_trace_detail AS
SELECT
    trace_id,
    span_id,
    parent_span_id,
    start_time,
    duration_ns,
    duration_ns / 1000000 AS duration_ms,
    service_name,
    name AS span_name,
    kind AS span_kind,
    status_code,
    status_message,

    if(db_system != '', db_system,
       if(messaging_system != '', messaging_system,
          if(rpc_system != '', rpc_system,
             if(http_method != '', 'http', 'internal')))) AS component_type,

    multiIf(
        db_system = 'redis', concat('redis ', redis_command),
        db_system = 'mysql', concat('mysql ', db_operation),
        messaging_system = 'kafka', concat('kafka ', messaging_destination),
        rpc_system = 'grpc', concat('grpc ', rpc_service, '.', rpc_method),
        http_method != '', concat(http_method, ' ', http_route),
        'internal'
    ) AS component_detail,

    biz_vin,
    biz_command_type,
    biz_command_status,
    biz_tenant_id,
    biz_user_id,
    biz_platform,
    deploy_env,
    is_root,

    -- ★ 多维字段
    biz_system,
    env,
    biz_channel,
    biz_brand,
    biz_tenant

FROM platform.tsp_spans;


-- ── 10.2 v_trace_summary — 增加多维字段 ────────────────────

DROP VIEW IF EXISTS platform.v_trace_summary;

CREATE VIEW IF NOT EXISTS platform.v_trace_summary AS
SELECT
    trace_id,
    min(start_time) AS start_time,
    max(end_time) AS end_time,
    count() AS span_count,
    sum(is_root) AS root_count,
    groupArray(DISTINCT service_name) AS services,
    sum(if(status_code = 'ERROR', 1, 0)) AS error_count,

    any(http_method) AS http_method,
    any(http_route) AS http_route,
    any(http_status_code) AS http_status_code,

    any(biz_vin) AS biz_vin,
    any(biz_command_type) AS biz_command_type,
    any(biz_tenant_id) AS biz_tenant_id,
    any(biz_user_id) AS biz_user_id,
    any(biz_platform) AS biz_platform,
    any(source_ip) AS source_ip,
    any(deploy_env) AS deploy_env,

    (sum(if(status_code = 'ERROR', 1, 0)) > 0) AS has_error,

    groupArray(distinct
        if(s.db_system != '', s.db_system,
           if(s.messaging_system != '', s.messaging_system,
              if(s.rpc_system != '', s.rpc_system,
                 if(s.http_method != '', 'http', 'internal'))))
    ) AS components,

    -- ★ 多维字段
    any(biz_system)  AS biz_system,
    any(env)         AS env,
    any(biz_channel) AS biz_channel,
    any(biz_brand)   AS biz_brand,
    any(biz_tenant)  AS biz_tenant

FROM platform.tsp_spans AS s
GROUP BY trace_id;


-- ============================================================
-- 11. 查询示例（按多维过滤）
-- ============================================================

-- 按 TSP 系统 + 品牌 + 环境查看错误率
-- SELECT
--     biz_system,
--     biz_brand,
--     env,
--     count() AS total,
--     sum(if(status_code='ERROR',1,0)) AS errors,
--     round(errors / total * 100, 2) AS error_rate
-- FROM platform.tsp_spans
-- WHERE start_time >= now() - INTERVAL 1 HOUR
-- GROUP BY biz_system, biz_brand, env
-- ORDER BY error_rate DESC;

-- 查某个品牌某辆车的完整链路
-- SELECT * FROM platform.v_trace_detail
-- WHERE biz_brand = 'bmw'
--   AND biz_vin = 'LSVAU2A35N...'
--   AND trace_id = 'xxx';

-- 按渠道统计服务调用量
-- SELECT
--     biz_channel,
--     service_name,
--     count() AS calls
-- FROM platform.tsp_spans
-- WHERE biz_system = 'tsp-cloud'
--   AND env = 'production'
-- GROUP BY biz_channel, service_name
-- ORDER BY calls DESC;

-- 按系统查看拓扑
-- SELECT
--     source_service,
--     target_service,
--     sum(call_count) AS call_count,
--     sum(error_count) AS error_count,
--     avg(avg_duration_ms) AS avg_duration_ms
-- FROM platform.tsp_service_topology
-- WHERE biz_system = 'tsp-cloud'
--   AND time >= now() - INTERVAL 3 HOUR
-- GROUP BY source_service, target_service
-- ORDER BY call_count DESC;


-- ============================================================
-- 12. 执行校验
-- ============================================================
-- 执行以下查询确认所有变更已生效
-- ============================================================

-- 1. tsp_spans 新增列
SELECT name, comment FROM system.columns
WHERE database = 'platform' AND table = 'tsp_spans'
  AND name IN ('biz_system', 'env', 'biz_channel', 'biz_brand', 'biz_tenant')
ORDER BY name;

-- 2. tsp_spans 新增索引
SELECT name, expr FROM system.data_skipping_indices
WHERE database = 'platform' AND table = 'tsp_spans'
  AND name IN ('idx_biz_system', 'idx_env', 'idx_biz_channel', 'idx_biz_brand', 'idx_biz_tenant')
ORDER BY name;

-- 3. tsp_span_events 新增列
SELECT name, comment FROM system.columns
WHERE database = 'platform' AND table = 'tsp_span_events'
  AND name IN ('biz_system', 'env', 'biz_channel', 'biz_brand', 'biz_tenant')
ORDER BY name;

-- 4. tsp_span_events 新增索引
SELECT name, expr FROM system.data_skipping_indices
WHERE database = 'platform' AND table = 'tsp_span_events'
  AND name IN ('idx_biz_system', 'idx_env', 'idx_biz_channel', 'idx_biz_brand', 'idx_biz_tenant')
ORDER BY name;

-- 5. tsp_span_metrics 新增列
SELECT name, comment FROM system.columns
WHERE database = 'platform' AND table = 'tsp_span_metrics'
  AND name IN ('biz_system', 'env', 'biz_channel', 'biz_brand', 'biz_tenant')
ORDER BY name;

-- 6. tsp_errors 新增列
SELECT name, comment FROM system.columns
WHERE database = 'platform' AND table = 'tsp_errors'
  AND name IN ('biz_system', 'env', 'biz_channel', 'biz_brand', 'biz_tenant')
ORDER BY name;

-- 7. tsp_errors 新增索引
SELECT name, expr FROM system.data_skipping_indices
WHERE database = 'platform' AND table = 'tsp_errors'
  AND name IN ('idx_biz_system', 'idx_env', 'idx_biz_channel', 'idx_biz_brand', 'idx_biz_tenant')
ORDER BY name;

-- 8. tsp_service_topology 新增列
SELECT name, comment FROM system.columns
WHERE database = 'platform' AND table = 'tsp_service_topology'
  AND name IN ('biz_system', 'env', 'biz_channel', 'biz_brand', 'biz_tenant')
ORDER BY name;

-- 9. tsp_alert_rules 新增列
SELECT name, comment FROM system.columns
WHERE database = 'platform' AND table = 'tsp_alert_rules'
  AND name IN ('biz_system', 'env', 'biz_channel', 'biz_brand', 'biz_tenant')
ORDER BY name;

-- 10. tsp_alert_events 新增列
SELECT name, comment FROM system.columns
WHERE database = 'platform' AND table = 'tsp_alert_events'
  AND name IN ('biz_system', 'env', 'biz_channel', 'biz_brand', 'biz_tenant')
ORDER BY name;

-- 11. 物化视图
SELECT name, engine FROM system.tables
WHERE database = 'platform'
  AND name IN ('mv_otel_to_spans', 'mv_otel_to_span_events', 'mv_errors', 'mv_spans_hourly', 'mv_service_topology_hourly')
ORDER BY name;

-- 12. 视图
SELECT name, engine FROM system.tables
WHERE database = 'platform'
  AND name IN ('v_trace_detail', 'v_trace_summary')
ORDER BY name;

-- 13. tsp_span_metrics / tsp_service_topology ORDER BY 检查
SELECT name, engine, create_table_query FROM system.tables
WHERE database = 'platform'
  AND name IN ('tsp_span_metrics', 'tsp_service_topology');
