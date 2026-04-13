-- ============================================================
-- TSP 自研可观测性平台 - 远控业务监控指标表
-- 版本：v1.0
-- 更新日期：2026-04-13
-- 数据库：platform
--
-- 设计原则：
--   1. 从 tsp_spans 中通过物化视图自动聚合远控场景的 Span 数据
--   2. 支持端到端、TSP服务、TBox服务、第三方服务、车辆连接 5 大类指标
--   3. 分钟级 + 小时级双粒度，兼顾实时看板和历史趋势
--   4. 与现有 tsp_alert_rules / tsp_alert_events 告警体系集成
--
-- 前置依赖：先执行 01_init_database_OK.sql
-- ============================================================

USE platform;


-- ============================================================
-- 表 1：rc_minute_metrics — 远控分钟级指标表
-- ============================================================
-- 用途：
--   - 1 分钟粒度的实时看板数据
--   - 由物化视图 mv_rc_minute 自动从 tsp_spans 聚合
--   - 供前端实时监控面板使用
-- ============================================================
CREATE TABLE IF NOT EXISTS platform.rc_minute_metrics (
    -- 时间维度
    time               DateTime64(3) COMMENT '分钟时间窗口起点',

    -- 指标分类
    metric_type        LowCardinality(String) COMMENT '指标类型：e2e_command/tsp_service/tbox_service/sms_service/mqtt_connection',
    service_name       LowCardinality(String) COMMENT '服务名称',

    -- 业务维度
    command_type       LowCardinality(String) DEFAULT '' COMMENT '指令类型',
    status             LowCardinality(String) DEFAULT '' COMMENT '状态：SUCCESS/ERROR/TIMEOUT/PENDING',

    -- 基础统计
    total_count        UInt64 DEFAULT 0 COMMENT '总数',
    success_count      UInt64 DEFAULT 0 COMMENT '成功数',
    error_count        UInt64 DEFAULT 0 COMMENT '错误数',
    timeout_count      UInt64 DEFAULT 0 COMMENT '超时数',

    -- 耗时分位数（毫秒）
    avg_duration_ms    Float64 DEFAULT 0 COMMENT '平均耗时(ms)',
    p50_duration_ms    Float64 DEFAULT 0 COMMENT 'P50 耗时(ms)',
    p95_duration_ms    Float64 DEFAULT 0 COMMENT 'P95 耗时(ms)',
    p99_duration_ms    Float64 DEFAULT 0 COMMENT 'P99 耗时(ms)',

    -- TSP 服务专属
    mqtt_fail_count    UInt64 DEFAULT 0 COMMENT 'MQTT 下发失败次数',
    pending_count      UInt64 DEFAULT 0 COMMENT 'PENDING 状态积压数',
    kafka_lag_ms       UInt64 DEFAULT 0 COMMENT 'Kafka 消费延迟(ms)',
    dispatch_delay_ms  Float64 DEFAULT 0 COMMENT '指令下发延迟(ms)',

    -- TBox 服务专属
    auth_fail_count    UInt64 DEFAULT 0 COMMENT '鉴权校验失败数',
    permission_fail_count UInt64 DEFAULT 0 COMMENT '车控权限校验失败数',
    db_write_count     UInt64 DEFAULT 0 COMMENT '成功入库数',
    duplicate_count    UInt64 DEFAULT 0 COMMENT '重复发送(幂等拦截)次数',

    -- SMS 服务专属
    sms_total          UInt64 DEFAULT 0 COMMENT '唤醒短信发送总量',
    sms_success        UInt64 DEFAULT 0 COMMENT '短信发送成功数',
    sms_fail           UInt64 DEFAULT 0 COMMENT '短信发送失败数',
    sms_wakeup_success UInt64 DEFAULT 0 COMMENT '短信唤醒成功(TBox 10s内上线)数',
    sms_mno_latency_p99 Float64 DEFAULT 0 COMMENT 'MNO短信API P99延迟(ms)',

    -- MQTT 连接专属
    online_vehicles    UInt32 DEFAULT 0 COMMENT '在线车辆数',
    mqtt_connections   UInt32 DEFAULT 0 COMMENT 'MQTT 连接数',
    mqtt_conn_fail     UInt32 DEFAULT 0 COMMENT 'MQTT 连接失败数',
    mqtt_throughput    UInt32 DEFAULT 0 COMMENT 'MQTT 消息吞吐量',
    mqtt_loss_count    UInt32 DEFAULT 0 COMMENT 'MQTT 消息丢失数',

    -- 元数据
    updated_time       DateTime DEFAULT now() COMMENT '最后更新时间'
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMMDD(time)
ORDER BY (metric_type, time, service_name, command_type, status)
TTL toDateTime(time) + INTERVAL 7 DAY;


-- ============================================================
-- 表 2：rc_command_metrics — 远控小时级指标表（趋势分析）
-- ============================================================
-- 用途：
--   - 小时粒度的历史趋势数据
--   - 由 RemoteControlMetricsAggregator 定时任务从 rc_minute_metrics 滚动聚合
--   - 供前端趋势图、报表导出使用
-- ============================================================
CREATE TABLE IF NOT EXISTS platform.rc_command_metrics (
    -- 时间维度
    time               DateTime COMMENT '小时时间窗口起点',

    -- 指标分类
    metric_type        LowCardinality(String) COMMENT '指标类型',
    service_name       LowCardinality(String) COMMENT '服务名称',

    -- 业务维度
    command_type       LowCardinality(String) DEFAULT '' COMMENT '指令类型',

    -- 基础统计
    total_count        UInt64 DEFAULT 0 COMMENT '总数',
    success_count      UInt64 DEFAULT 0 COMMENT '成功数',
    error_count        UInt64 DEFAULT 0 COMMENT '错误数',
    timeout_count      UInt64 DEFAULT 0 COMMENT '超时数',

    -- 耗时分位数（毫秒）
    avg_duration_ms    Float64 DEFAULT 0 COMMENT '平均耗时(ms)',
    p50_duration_ms    Float64 DEFAULT 0 COMMENT 'P50 耗时(ms)',
    p95_duration_ms    Float64 DEFAULT 0 COMMENT 'P95 耗时(ms)',
    p99_duration_ms    Float64 DEFAULT 0 COMMENT 'P99 耗时(ms)',
    max_duration_ms    Float64 DEFAULT 0 COMMENT '最大耗时(ms)',

    -- 成功率/错误率
    success_rate       Float64 DEFAULT 0 COMMENT '成功率',
    error_rate         Float64 DEFAULT 0 COMMENT '错误率',
    timeout_rate       Float64 DEFAULT 0 COMMENT '超时率',

    -- TSP 服务专属
    mqtt_fail_count    UInt64 DEFAULT 0 COMMENT 'MQTT 下发失败次数',
    pending_count      UInt64 DEFAULT 0 COMMENT '平均 PENDING 积压数',
    kafka_lag_ms       UInt64 DEFAULT 0 COMMENT '平均 Kafka 消费延迟(ms)',
    dispatch_delay_ms  Float64 DEFAULT 0 COMMENT '平均指令下发延迟(ms)',
    http_qps           Float64 DEFAULT 0 COMMENT '平均 HTTP QPS',
    http_error_rate    Float64 DEFAULT 0 COMMENT 'HTTP 错误率',

    -- TBox 服务专属
    auth_fail_count    UInt64 DEFAULT 0 COMMENT '鉴权校验失败数',
    permission_fail_count UInt64 DEFAULT 0 COMMENT '权限校验失败数',
    db_write_count     UInt64 DEFAULT 0 COMMENT '成功入库数',
    duplicate_count    UInt64 DEFAULT 0 COMMENT '重复发送次数',

    -- SMS 服务专属
    sms_total          UInt64 DEFAULT 0 COMMENT '短信发送总量',
    sms_success        UInt64 DEFAULT 0 COMMENT '短信发送成功数',
    sms_fail           UInt64 DEFAULT 0 COMMENT '短信发送失败数',
    sms_wakeup_success UInt64 DEFAULT 0 COMMENT '短信唤醒成功数',
    sms_wakeup_timeout UInt64 DEFAULT 0 COMMENT '短信唤醒超时数',
    sms_wakeup_rate    Float64 DEFAULT 0 COMMENT '短信唤醒成功率',
    sms_mno_latency_p99 Float64 DEFAULT 0 COMMENT 'MNO短信API P99延迟(ms)',
    sms_wakeup_latency Float64 DEFAULT 0 COMMENT '短信唤醒响应耗时(ms)',

    -- MQTT 连接专属
    online_vehicles    UInt32 DEFAULT 0 COMMENT '平均在线车辆数',
    mqtt_connections   UInt32 DEFAULT 0 COMMENT 'MQTT 连接数',
    mqtt_conn_fail_rate Float64 DEFAULT 0 COMMENT 'MQTT 连接失败率',
    mqtt_throughput    UInt32 DEFAULT 0 COMMENT 'MQTT 消息吞吐量',
    mqtt_loss_rate     Float64 DEFAULT 0 COMMENT 'MQTT 消息丢失率',

    -- 元数据
    updated_time       DateTime DEFAULT now() COMMENT '最后更新时间'
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(time)
ORDER BY (metric_type, time, service_name, command_type)
TTL toDateTime(time) + INTERVAL 90 DAY;


-- ============================================================
-- 物化视图 1：mv_rc_minute — tsp_spans → rc_minute_metrics
-- ============================================================
-- 过滤条件：biz_command_type != ''（远控指令 Span）
-- metric_type 分类规则：
--   - service_name 包含 'tsp' 或 span name 包含 'mqtt.publish' → tsp_service
--   - service_name 包含 'tbox' → tbox_service
--   - service_name 包含 'sms' 或 span name 包含 'sms' → sms_service
--   - name 包含 'mqtt.connect' 或 'mqtt.connection' → mqtt_connection
--   - 其他（is_root=1） → e2e_command
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS platform.mv_rc_minute
TO platform.rc_minute_metrics
AS SELECT
    toStartOfMinute(start_time) AS time,

    -- 指标类型自动分类
    multiIf(
        positionCaseInsensitive(service_name, 'tbox') > 0 OR positionCaseInsensitive(service_name, 't-box') > 0,
        'tbox_service',
        positionCaseInsensitive(service_name, 'sms') > 0 OR positionCaseInsensitive(name, 'sms') > 0 OR positionCaseInsensitive(name, 'wakeup') > 0,
        'sms_service',
        positionCaseInsensitive(name, 'mqtt.connect') > 0 OR positionCaseInsensitive(name, 'mqtt.connection') > 0,
        'mqtt_connection',
        positionCaseInsensitive(service_name, 'tsp') > 0 OR positionCaseInsensitive(name, 'mqtt.publish') > 0 OR positionCaseInsensitive(name, 'mqtt.send') > 0,
        'tsp_service',
        is_root = 1,
        'e2e_command',
        'e2e_command'
    ) AS metric_type,

    service_name,

    biz_command_type AS command_type,

    -- 状态映射
    multiIf(
        status_code = 'OK', 'SUCCESS',
        status_code = 'ERROR',
        multiIf(
            positionCaseInsensitive(status_message, 'timeout') > 0,
            'TIMEOUT',
            'ERROR'
        ),
        biz_command_status != '' AND biz_command_status != 'CREATED' AND biz_command_status != 'DISPATCHED',
        biz_command_status,
        'SUCCESS'
    ) AS status,

    -- 基础统计
    1 AS total_count,
    if(status_code = 'OK', 1, 0) AS success_count,
    if(status_code = 'ERROR', 1, 0) AS error_count,
    if(status_code = 'ERROR' AND positionCaseInsensitive(status_message, 'timeout') > 0, 1, 0) AS timeout_count,

    -- 耗时（纳秒→毫秒）
    duration_ns / 1000000.0 AS avg_duration_ms,
    duration_ns / 1000000.0 AS p50_duration_ms,
    duration_ns / 1000000.0 AS p95_duration_ms,
    duration_ns / 1000000.0 AS p99_duration_ms,

    -- TSP 服务专属：从 attributes_map 提取
    toUInt64OrZero(attributes_map['rc.mqtt_fail']) AS mqtt_fail_count,
    toUInt64OrZero(attributes_map['rc.pending_count']) AS pending_count,
    toUInt64OrZero(attributes_map['rc.kafka_lag_ms']) AS kafka_lag_ms,
    toFloat64OrZero(attributes_map['rc.dispatch_delay_ms']) AS dispatch_delay_ms,

    -- TBox 服务专属
    toUInt64OrZero(attributes_map['rc.auth_fail']) AS auth_fail_count,
    toUInt64OrZero(attributes_map['rc.permission_fail']) AS permission_fail_count,
    toUInt64OrZero(attributes_map['rc.db_write']) AS db_write_count,
    toUInt64OrZero(attributes_map['rc.duplicate']) AS duplicate_count,

    -- SMS 服务专属
    toUInt64OrZero(attributes_map['rc.sms_total']) AS sms_total,
    toUInt64OrZero(attributes_map['rc.sms_success']) AS sms_success,
    toUInt64OrZero(attributes_map['rc.sms_fail']) AS sms_fail,
    toUInt64OrZero(attributes_map['rc.sms_wakeup_success']) AS sms_wakeup_success,
    toFloat64OrZero(attributes_map['rc.sms_mno_latency_ms']) AS sms_mno_latency_p99,

    -- MQTT 连接专属
    toUInt32OrZero(attributes_map['rc.online_vehicles']) AS online_vehicles,
    toUInt32OrZero(attributes_map['rc.mqtt_connections']) AS mqtt_connections,
    toUInt32OrZero(attributes_map['rc.mqtt_conn_fail']) AS mqtt_conn_fail,
    toUInt32OrZero(attributes_map['rc.mqtt_throughput']) AS mqtt_throughput,
    toUInt32OrZero(attributes_map['rc.mqtt_loss_count']) AS mqtt_loss_count,

    now() AS updated_time
FROM platform.tsp_spans
WHERE biz_command_type != ''
  AND start_time > now() - INTERVAL 7 DAY;


-- ============================================================
-- 远控告警规则初始化数据
-- ============================================================
-- 向 tsp_alert_rules 插入远控场景专属的告警规则
-- ============================================================
INSERT INTO platform.tsp_alert_rules (rule_id, rule_name, rule_type, rule_group, target_service, metric_name, operator, threshold, duration_seconds, severity, notify_channel, enabled, created_by)
SELECT generateUUIDv4(), '远控-TBox处理延迟P99超阈值', 'threshold', 'remote_control', '', 'tbox.p99_duration_ms', 'gt', 200, 300, 'warning', ['email'], 1, 'system'
UNION ALL SELECT generateUUIDv4(), '远控-MNO短信延迟P99超阈值', 'threshold', 'remote_control', '', 'sms.mno_latency_p99', 'gt', 1000, 300, 'warning', ['email'], 1, 'system'
UNION ALL SELECT generateUUIDv4(), '远控-MNO短信API失败次数超阈值', 'threshold', 'remote_control', '', 'sms.fail_count', 'gt', 5, 300, 'critical', ['email','sms'], 1, 'system'
UNION ALL SELECT generateUUIDv4(), '远控-短信唤醒成功率过低', 'threshold', 'remote_control', '', 'sms.wakeup_rate', 'lt', 85, 600, 'warning', ['email'], 1, 'system'
UNION ALL SELECT generateUUIDv4(), '远控-MQTT消息丢失率过高', 'threshold', 'remote_control', '', 'mqtt.loss_rate', 'gt', 50, 300, 'critical', ['email','sms'], 1, 'system'
UNION ALL SELECT generateUUIDv4(), '远控-端到端指令成功率过低', 'threshold', 'remote_control', '', 'e2e.success_rate', 'lt', 90, 600, 'warning', ['email'], 1, 'system'
UNION ALL SELECT generateUUIDv4(), '远控-MQTT下发失败', 'threshold', 'remote_control', '', 'tsp.mqtt_fail_count', 'gt', 0, 60, 'critical', ['email','sms'], 1, 'system'
UNION ALL SELECT generateUUIDv4(), '远控-指令积压数过高', 'threshold', 'remote_control', '', 'tsp.pending_count', 'gt', 100, 300, 'warning', ['email'], 1, 'system';
