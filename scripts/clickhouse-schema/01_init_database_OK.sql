-- ============================================================
-- TSP 自研可观测性平台 - ClickHouse 生产环境表结构
-- 版本：v2.0（摒弃 SigNoz 固定表结构，完全自定义）
-- 更新日期：2026-04-09
--
-- 设计原则：
--   1. 全量保留 OTel Span 语义字段，兼容标准 OTLP 协议
--   2. 增加 TSP 车联网业务专属字段（VIN、commandType、tenantId 等）
--   3. 支持多租户、多环境、多平台维度分析
--   4. 为 tsp-monitor-gateway 后端服务提供查询优化
--   5. 为前端自研监控看板提供数据支撑
-- ============================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS platform;

-- ============================================================
-- 表 1：tsp_spans — Span 主表（核心）
-- ============================================================
-- 存储所有 OTel Span 原始数据 + TSP 业务扩展字段
-- 数据来源：Central OTel Collector → ClickHouse (via OTLP 或 kafka)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform.tsp_spans (
    -- ===== 链路标识 =====
    trace_id           String COMMENT 'TraceID，整条链路的唯一标识（32位hex）',
    span_id            String COMMENT 'SpanID，当前节点的唯一标识（16位hex）',
    parent_span_id     String COMMENT '父节点 SpanID，根节点为空',
    trace_state        String COMMENT 'W3C Trace State',

    -- ===== 时间信息 =====
    start_time         DateTime64(9) COMMENT 'Span 开始时间（纳秒精度，上海时区）',
    end_time           DateTime64(9) COMMENT 'Span 结束时间',
    duration_ns        UInt64 COMMENT 'Span 持续时间（纳秒）',

    -- ===== 服务信息 =====
    service_name       LowCardinality(String) COMMENT '服务名称',
    service_version    String COMMENT '服务版本号',
    service_namespace  String COMMENT '服务命名空间（如：tsp/tracing）',
    service_instance   String COMMENT '服务实例标识（pod名/主机名）',

    -- ===== Span 基本信息 =====
    name               String COMMENT 'Span 操作名称（如 POST /api/commands, redis SET）',
    kind               LowCardinality(String) COMMENT 'Span 类型：INTERNAL/CLIENT/SERVER/PRODUCER/CONSUMER',

    -- ===== 状态 =====
    status_code        LowCardinality(String) COMMENT '状态码：OK/UNSET/ERROR',
    status_message     String COMMENT '错误描述',

    -- ===== HTTP 组件 =====
    http_method        LowCardinality(String) COMMENT 'HTTP 方法：GET/POST/PUT/DELETE',
    http_url           String COMMENT '完整 HTTP URL',
    http_route         LowCardinality(String) COMMENT 'HTTP 路由模板（如 /api/commands/:id）',
    http_status_code   UInt16 COMMENT 'HTTP 响应状态码',
    http_host          LowCardinality(String) COMMENT 'HTTP Host',
    http_scheme        LowCardinality(String) COMMENT 'HTTP 协议：http/https',
    http_user_agent    String COMMENT '客户端 User-Agent',
    http_flavor        LowCardinality(String) COMMENT 'HTTP 版本：1.0/1.1/2.0',
    http_request_content_length UInt64 COMMENT '请求体大小（bytes）',
    http_response_content_length UInt64 COMMENT '响应体大小（bytes）',

    -- ===== 数据库组件（MySQL/PostgreSQL/ClickHouse）=====
    db_system          LowCardinality(String) COMMENT '数据库类型：mysql/postgresql/clickhouse',
    db_name            String COMMENT '数据库名称',
    db_statement       String COMMENT '完整 SQL 语句',
    db_operation       LowCardinality(String) COMMENT '数据库操作：SELECT/INSERT/UPDATE/DELETE',
    db_user            String COMMENT '数据库连接用户',

    -- ===== Redis 组件 =====
    redis_db_index     UInt8 COMMENT 'Redis 数据库编号（0-15）',
    redis_command      LowCardinality(String) COMMENT 'Redis 命令：SET/GET/DEL/HSET/ZADD',
    redis_key_length   UInt32 COMMENT 'Redis Key 长度',

    -- ===== 消息队列组件（Kafka/RabbitMQ）=====
    messaging_system          LowCardinality(String) COMMENT '消息系统：kafka/rabbitmq',
    messaging_destination     String COMMENT 'Topic 或 Queue 名称',
    messaging_operation       String COMMENT '操作：publish/receive',
    messaging_message_id      String COMMENT '消息 ID',
    messaging_consumer_group  String COMMENT '消费者组',
    messaging_kafka_partition Int32 COMMENT 'Kafka 分区号',
    messaging_kafka_key       String COMMENT 'Kafka 消息 Key',
    messaging_kafka_offset    UInt64 COMMENT 'Kafka 消息 Offset',

    -- ===== RPC 组件 =====
    rpc_system         LowCardinality(String) COMMENT 'RPC 框架：grpc',
    rpc_service        String COMMENT 'RPC 服务名',
    rpc_method         String COMMENT 'RPC 方法名',
    rpc_grpc_status_code String COMMENT 'gRPC 状态码',

    -- ===== 线程池 / 异步组件 =====
    thread_name        String COMMENT '线程名称',
    thread_id          UInt64 COMMENT '线程 ID',

    -- ===== FaaS / 容器（华为云 CCE/FunctionGraph）=====
    faas_name          String COMMENT '函数名',
    faas_trigger       LowCardinality(String) COMMENT '触发类型',
    container_id       String COMMENT '容器 ID',
    container_name     String COMMENT '容器名称',

    -- ===== TSP 业务字段（Baggage 传递）=====
    -- 车联网核心维度
    biz_vin            String COMMENT '车辆识别码（VIN）',
    biz_command_type   LowCardinality(String) COMMENT '指令类型（如：远程锁车/解锁/空调开启）',
    biz_command_status LowCardinality(String) COMMENT '指令状态：CREATED/DISPATCHED/PROCESSED/FAILED',

    -- 多租户维度
    biz_tenant_id      LowCardinality(String) COMMENT '租户 ID（OEM 厂商标识）',
    -- biz_dealer_id      String COMMENT '经销商 ID',
    -- biz_project_code   LowCardinality(String) COMMENT '项目编码（区分不同车厂项目）',

    -- 用户维度
    biz_user_id        String COMMENT '操作用户 ID',
    biz_platform       LowCardinality(String) COMMENT '终端平台：android/ios/web/h5/车载TBox',
    biz_app_version    String COMMENT 'APP 版本号',

    -- 地理维度
    biz_country        LowCardinality(String) COMMENT '国家代码：SA/AE/CN',
    biz_region         LowCardinality(String) COMMENT '区域/省份',

    -- 环境维度
    deploy_env         LowCardinality(String) COMMENT '部署环境：production/staging/test/dev',
    deploy_region      LowCardinality(String) COMMENT '部署区域（云上Region）：cn-north-4/me-east-1',

    -- ===== 资源属性（自动采集）=====
    host_name          String COMMENT '主机名',
    host_ip            String COMMENT '主机 IP',
    os_type            LowCardinality(String) COMMENT '操作系统',
    os_version         String COMMENT 'OS 版本',
    cloud_provider     LowCardinality(String) COMMENT '云服务商：huawei/aliyun/aws',
    cloud_region       LowCardinality(String) COMMENT '云 Region',
    cloud_az           String COMMENT '可用区',

    -- ===== 链路入口信息 =====
    source_type        LowCardinality(String) COMMENT '链路入口类型：http/kafka/rpc/scheduled/timer',
    source_ip          String COMMENT '调用方 IP',
    source_port        UInt32 COMMENT '调用方端口',

    -- ===== 事件（Span Event）=====
    event_name         String COMMENT '事件名称（如 exception、log、message）',
    event_time         DateTime64(9) COMMENT '事件时间',
    event_attributes   Map(String, String) COMMENT '事件属性',

    -- ===== Link 信息 =====
    linked_trace_id    String COMMENT '关联的 TraceID（Batch/Continuation 场景）',
    linked_span_id     String COMMENT '关联的 SpanID',

    -- ===== 扩展属性（兜底存储所有未映射的 Attributes）=====
    attributes_map     Map(String, String) COMMENT '所有未映射的 Span Attributes',
    resource_map       Map(String, String) COMMENT 'Resource Attributes（服务级元数据）',

    -- ===== 元数据 =====
    insert_time        DateTime DEFAULT now() COMMENT '数据写入 ClickHouse 的时间',
    -- 用于标记是否为根 span（链路入口）
    is_root            UInt8 DEFAULT 0 COMMENT '是否为根 Span：1=是（parent_span_id 为空且 kind=SERVER）'
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (service_name, start_time, trace_id, span_id)
PRIMARY KEY (service_name, start_time, trace_id)
TTL toDateTime(start_time) + INTERVAL 90 DAY
SETTINGS
    index_granularity = 8192,
    enable_mixed_granularity_parts = 1;

-- ── 索引 ──
-- 链路查询
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_parent_span_id parent_span_id TYPE bloom_filter(0.01) GRANULARITY 1;

-- 业务维度查询
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_vin biz_vin TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_tenant biz_tenant_id TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_user biz_user_id TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_command_type biz_command_type TYPE bloom_filter(0.01) GRANULARITY 1;
-- biz_project_code 列已注释，暂不创建索引
-- ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_project biz_project_code TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_platform biz_platform TYPE bloom_filter(0.01) GRANULARITY 1;

-- 组件维度查询
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_db_system db_system TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_messaging_system messaging_system TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_http_route http_route TYPE bloom_filter(0.05) GRANULARITY 1;

-- 状态查询
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_status status_code TYPE set(3) GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_http_status http_status_code TYPE minmax GRANULARITY 1;
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_duration duration_ns TYPE minmax GRANULARITY 1;

-- 跳表索引（加速范围查询）
ALTER TABLE platform.tsp_spans ADD INDEX IF NOT EXISTS idx_start_time_skip start_time TYPE minmax GRANULARITY 4;


-- ============================================================
-- 表 2：tsp_span_events — Span 事件表（独立存储）
-- ============================================================
-- 用途：
--   - 存储从 Span 中提取的事件（exception、log、custom event）
--   - 通过 Kafka tsp-events topic 供 Flink 实时消费
--   - 独立存储避免主表膨胀
-- ============================================================
CREATE TABLE IF NOT EXISTS platform.tsp_span_events (
    event_id           String COMMENT '事件唯一 ID（UUID）',
    trace_id           String COMMENT '关联 TraceID',
    span_id            String COMMENT '关联 SpanID',
    event_time         DateTime64(9) COMMENT '事件发生时间',

    -- 服务信息
    service_name       LowCardinality(String) COMMENT '服务名称',
    span_name          String COMMENT 'Span 名称',

    -- 事件分类
    event_type         LowCardinality(String) COMMENT '事件类型：exception/log/custom/message',
    event_name         String COMMENT '事件名称',

    -- 异常信息（exception 事件专属）
    exception_type     String COMMENT '异常类型（如 java.lang.NullPointerException）',
    exception_message  String COMMENT '异常消息',
    exception_stack    String COMMENT '异常堆栈（完整）',

    -- 事件属性
    event_attributes   Map(String, String) COMMENT '事件属性键值对',

    -- 业务维度（从父 Span 复制，便于独立查询）
    biz_vin            String COMMENT '车辆 VIN',
    biz_tenant_id      LowCardinality(String) COMMENT '租户 ID',
    biz_user_id        String COMMENT '用户 ID',
    biz_command_type   LowCardinality(String) COMMENT '指令类型',
    deploy_env         LowCardinality(String) COMMENT '部署环境',

    -- 来源信息
    source_ip          String COMMENT '调用方 IP',
    http_url           String COMMENT 'HTTP URL',
    http_method        LowCardinality(String) COMMENT 'HTTP 方法',
    http_status_code   UInt16 COMMENT 'HTTP 状态码',

    -- 元数据
    insert_time        DateTime DEFAULT now() COMMENT '写入时间'
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (event_type, event_time, service_name, trace_id)
PRIMARY KEY (event_type, event_time, service_name, trace_id)
TTL toDateTime(event_time) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- 索引
ALTER TABLE platform.tsp_span_events ADD INDEX IF NOT EXISTS idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_span_events ADD INDEX IF NOT EXISTS idx_vin biz_vin TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_span_events ADD INDEX IF NOT EXISTS idx_tenant biz_tenant_id TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_span_events ADD INDEX IF NOT EXISTS idx_exception exception_type TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_span_events ADD INDEX IF NOT EXISTS idx_event_time_skip event_time TYPE minmax GRANULARITY 4;


-- ============================================================
-- 表 3：tsp_span_metrics — Span 聚合统计表（BI 报表）
-- ============================================================
-- 用途：
--   - 按小时/天自动聚合的统计数据
--   - 供前端监控看板的趋势图、仪表盘使用
--   - tsp-monitor-gateway 直接查询此表提供聚合 API
-- ============================================================
CREATE TABLE IF NOT EXISTS platform.tsp_span_metrics (
    -- 时间维度
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
ORDER BY (time, window, service_name, span_name, biz_tenant_id, deploy_env)
TTL toDateTime(time) + INTERVAL 365 DAY;


-- ============================================================
-- 表 4：tsp_errors — 错误明细表（增强版）
-- ============================================================
-- 用途：
--   - 存储所有 status_code=ERROR 的 Span 提取的错误信息
--   - 供错误告警、错误分析、故障排查使用
--   - tsp-monitor-gateway 的告警模块数据源
-- ============================================================
CREATE TABLE IF NOT EXISTS platform.tsp_errors (
    -- 时间与标识
    time               DateTime64(9) COMMENT '发生时间',
    trace_id           String COMMENT '关联 TraceID',
    span_id            String COMMENT '关联 SpanID',
    parent_span_id     String COMMENT '父 SpanID',

    -- 服务信息
    service_name       LowCardinality(String) COMMENT '服务名称',
    service_version    String COMMENT '服务版本',

    -- 错误详情
    error_type         String COMMENT '错误类型（异常类名或错误码）',
    error_message      String COMMENT '错误消息',
    error_stack        String COMMENT '错误堆栈',

    -- Span 上下文
    span_name          String COMMENT '发生错误的 Span 名称',
    span_kind          LowCardinality(String) COMMENT 'Span 类型',
    duration_ns        UInt64 COMMENT '耗时（纳秒）',

    -- 请求上下文（便于排查）
    http_method        LowCardinality(String) COMMENT 'HTTP 方法',
    http_url           String COMMENT 'HTTP URL',
    http_route         LowCardinality(String) COMMENT 'HTTP 路由',
    http_status_code   UInt16 COMMENT 'HTTP 状态码',
    http_request_body  String COMMENT '请求体（脱敏，最多 2KB）',

    -- 数据库上下文
    db_system          LowCardinality(String) COMMENT '数据库类型',
    db_statement       String COMMENT 'SQL 语句',

    -- 业务上下文
    biz_vin            String COMMENT '车辆 VIN',
    biz_tenant_id      LowCardinality(String) COMMENT '租户 ID',
    biz_user_id        String COMMENT '用户 ID',
    biz_command_type   LowCardinality(String) COMMENT '指令类型',
    biz_platform       LowCardinality(String) COMMENT '平台',
    deploy_env         LowCardinality(String) COMMENT '部署环境',

    -- 来源
    source_ip          String COMMENT '调用方 IP',

    -- 元数据
    insert_time        DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(time)
ORDER BY (time, service_name, error_type, trace_id)
TTL toDateTime(time) + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;

-- 索引
ALTER TABLE platform.tsp_errors ADD INDEX IF NOT EXISTS idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_errors ADD INDEX IF NOT EXISTS idx_vin biz_vin TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_errors ADD INDEX IF NOT EXISTS idx_tenant biz_tenant_id TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_errors ADD INDEX IF NOT EXISTS idx_error_type error_type TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_errors ADD INDEX IF NOT EXISTS idx_time_skip time TYPE minmax GRANULARITY 4;


-- ============================================================
-- 表 5：tsp_service_topology — 服务拓扑快照表
-- ============================================================
-- 用途：
--   - 每小时快照一次服务间调用关系
--   - 供前端服务拓扑图使用
--   - tsp-monitor-gateway 的拓扑 API 数据源
-- ============================================================
CREATE TABLE IF NOT EXISTS platform.tsp_service_topology (
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

    -- 元数据
    updated_time       DateTime DEFAULT now()
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(time)
ORDER BY (time, source_service, target_service, operation, protocol, deploy_env)
TTL toDateTime(time) + INTERVAL 90 DAY;


-- ============================================================
-- 表 6：tsp_alert_rules — 告警规则表
-- ============================================================
-- 用途：
--   - 存储自研监控看板的告警规则配置
--   - tsp-monitor-gateway 读写此表
-- ============================================================
CREATE TABLE IF NOT EXISTS platform.tsp_alert_rules (
    rule_id            String COMMENT '规则 ID（UUID）',
    rule_name          String COMMENT '规则名称',
    rule_type          LowCardinality(String) COMMENT '规则类型：threshold/anomaly/availability',
    rule_group         LowCardinality(String) COMMENT '规则分组：service/api/component/business',

    -- 匹配条件
    target_service     String COMMENT '目标服务（空=全部）',
    target_span        String COMMENT '目标 Span 名称（空=全部）',
    biz_tenant_id      LowCardinality(String) COMMENT '限定租户（空=全部）',
    deploy_env         LowCardinality(String) COMMENT '限定环境（空=全部）',

    -- 阈值条件
    metric_name        LowCardinality(String) COMMENT '指标名：error_rate/p99_duration/qps',
    operator           LowCardinality(String) COMMENT '运算符：gt/lt/gte/lte/eq/neq',
    threshold          Float64 COMMENT '阈值',
    duration_seconds   UInt32 COMMENT '持续时长（秒）',

    -- 告警行为
    severity           LowCardinality(String) COMMENT '严重级别：critical/warning/info',
    notify_channel     Array(String) COMMENT '通知渠道：email/sms/dingtalk/wechat',
    notify_target      String COMMENT '通知对象（邮箱/手机号/webhook）',
    enabled            UInt8 DEFAULT 1 COMMENT '是否启用：1=启用 0=禁用',

    -- 元数据
    created_at         DateTime DEFAULT now() COMMENT '创建时间',
    updated_at         DateTime DEFAULT now() COMMENT '更新时间',
    created_by         String COMMENT '创建人'
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (rule_id, deploy_env)
SETTINGS index_granularity = 8192;


-- ============================================================
-- 表 7：tsp_alert_events — 告警事件表
-- ============================================================
-- 用途：
--   - 存储触发的告警事件
--   - 供前端告警中心展示
-- ============================================================
CREATE TABLE IF NOT EXISTS platform.tsp_alert_events (
    alert_id           String COMMENT '告警 ID（UUID）',
    rule_id            String COMMENT '关联规则 ID',
    rule_name          String COMMENT '规则名称',
    severity           LowCardinality(String) COMMENT '严重级别',
    alert_time         DateTime COMMENT '告警触发时间',
    recover_time       Nullable(DateTime) COMMENT '告警恢复时间（未恢复为 NULL）',

    -- 告警上下文
    service_name       LowCardinality(String) COMMENT '触发服务',
    span_name          String COMMENT '触发 Span',
    metric_value       Float64 COMMENT '触发时的指标值',
    threshold          Float64 COMMENT '阈值',
    trace_id           String COMMENT '关联 TraceID（如有）',

    -- 业务上下文
    biz_tenant_id      LowCardinality(String) COMMENT '租户 ID',
    deploy_env         LowCardinality(String) COMMENT '部署环境',

    -- 通知状态
    notify_status      LowCardinality(String) COMMENT '通知状态：pending/sent/failed',
    notify_channel     Array(String) COMMENT '通知渠道',

    -- 元数据
    insert_time        DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(alert_time)
ORDER BY (severity, alert_time, service_name, rule_id)
TTL toDateTime(alert_time) + INTERVAL 365 DAY
SETTINGS index_granularity = 8192;

ALTER TABLE platform.tsp_alert_events ADD INDEX IF NOT EXISTS idx_rule_id rule_id TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE platform.tsp_alert_events ADD INDEX IF NOT EXISTS idx_tenant biz_tenant_id TYPE bloom_filter(0.01) GRANULARITY 1;


-- ============================================================
-- 视图 1：v_trace_detail — 链路详情视图
-- ============================================================
-- 供 tsp-monitor-gateway 的链路详情 API 查询
-- ============================================================
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

    -- 组件类型（自动识别）
    if(db_system != '', db_system,
       if(messaging_system != '', messaging_system,
          if(rpc_system != '', rpc_system,
             if(http_method != '', 'http', 'internal')))) AS component_type,

    -- 组件详情
    multiIf(
        db_system = 'redis', concat('redis ', redis_command),
        db_system = 'mysql', concat('mysql ', db_operation),
        messaging_system = 'kafka', concat('kafka ', messaging_destination),
        rpc_system = 'grpc', concat('grpc ', rpc_service, '.', rpc_method),
        http_method != '', concat(http_method, ' ', http_route),
        'internal'
    ) AS component_detail,

    -- 业务字段
    biz_vin,
    biz_command_type,
    biz_command_status,
    biz_tenant_id,
    biz_user_id,
    biz_platform,

    -- 环境
    deploy_env,

    -- 是否为根 Span
    is_root
FROM platform.tsp_spans;


-- ============================================================
-- 视图 2：v_trace_summary — 链路汇总视图
-- ============================================================
-- 供前端链路列表展示（每个 TraceID 一行汇总）
-- ============================================================
CREATE VIEW IF NOT EXISTS platform.v_trace_summary AS
SELECT
    trace_id,
    min(start_time) AS start_time,
    max(end_time) AS end_time,
    count() AS span_count,
    sum(is_root) AS root_count,
    groupArray(DISTINCT service_name) AS services,
    sum(if(status_code = 'ERROR', 1, 0)) AS error_count,

    -- 链路入口属性（同一条链路属性通常相同）
    any(http_method) AS http_method,
    any(http_route) AS http_route,
    any(http_status_code) AS http_status_code,

    -- 业务维度
    any(biz_vin) AS biz_vin,
    any(biz_command_type) AS biz_command_type,
    any(biz_tenant_id) AS biz_tenant_id,
    any(biz_user_id) AS biz_user_id,
    any(biz_platform) AS biz_platform,
    any(source_ip) AS source_ip,
    any(deploy_env) AS deploy_env,

    -- 错误标记（比较运算符 > 返回 UInt8，直接匹配列类型）
    (sum(if(status_code = 'ERROR', 1, 0)) > 0) AS has_error,

    -- 组件类型集合
    -- 注意：必须用表别名 s. 前缀引用列，避免被上方 any(col) AS col 的别名遮蔽
    groupArray(distinct
        if(s.db_system != '', s.db_system,
           if(s.messaging_system != '', s.messaging_system,
              if(s.rpc_system != '', s.rpc_system,
                 if(s.http_method != '', 'http', 'internal'))))
    ) AS components
FROM platform.tsp_spans AS s
GROUP BY trace_id;


-- ============================================================
-- 物化视图 1：mv_spans_hourly — 每小时 Span 聚合
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS platform.mv_spans_hourly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(time)
ORDER BY (time, service_name, span_name, biz_tenant_id, deploy_env)
TTL toDateTime(time) + INTERVAL 365 DAY
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
    deploy_env;


-- ============================================================
-- 物化视图 2：mv_errors — 从 tsp_spans 提取错误到 tsp_errors
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS platform.mv_errors
ENGINE = MergeTree()
PARTITION BY toYYYYMM(time)
ORDER BY (time, service_name, error_type, trace_id)
TTL toDateTime(time) + INTERVAL 180 DAY
SETTINGS index_granularity = 8192
AS SELECT
    start_time AS time,
    trace_id,
    span_id,
    parent_span_id,
    service_name,
    service_version,

    -- 从 status_message 中提取异常类型（简化处理，详情看 event）
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
    biz_tenant_id,
    biz_user_id,
    biz_command_type,
    biz_platform,
    deploy_env,

    source_ip,
    now() AS insert_time
FROM platform.tsp_spans
WHERE status_code = 'ERROR';


-- ============================================================
-- 物化视图 3：mv_service_topology_hourly — 每小时服务拓扑
-- 修复：去掉 UNION
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS platform.mv_service_topology_hourly
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(time)
ORDER BY (time, source_service, target_service, operation, protocol, deploy_env)
TTL time + INTERVAL 90 DAY
AS
SELECT
    toStartOfHour(start_time) AS time,

    service_name AS source_service,

    -- 自动识别目标服务
    multiIf(
        attributes_map['peer.service'] != '', attributes_map['peer.service'],
        attributes_map['http.target_service'] != '', attributes_map['http.target_service'],
        'unknown'
    ) AS target_service,

    name AS operation,

    -- 协议识别优化
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
    deploy_env;

-- ============================================================
-- otel 数据库（clickhouseexporter 标准表 + 桥接物化视图）
-- ============================================================
-- 架构：Central Collector → clickhouseexporter → otel.otel_traces → MV → platform.tsp_spans
--
-- clickhouseexporter 使用固定表结构（otel_traces），无法直接写入自定义表。
-- 通过 ClickHouse 物化视图（MV）在 C++ 层完成标准表 → 业务表的字段映射，
-- tsp-monitor-gateway 保持纯查询角色，不消费 Kafka，零性能瓶颈。
--
-- otel_traces DDL 来源（v0.115.1 源码验证）：
--   opentelemetry-collector-contrib/exporter/clickhouseexporter/internal/sqltemplates/traces_table.sql
-- ============================================================

-- 创建 otel 数据库
CREATE DATABASE IF NOT EXISTS otel;

-- ── 标准表：otel_traces（clickhouseexporter 写入目标）────────────
-- 注意：表结构必须与 clickhouseexporter 源码 DDL 完全一致，
--       否则 exporter 启动时 IF NOT EXISTS 会跳过，导致写入失败。
-- 重要：Timestamp 是 Span 结束时间（非开始时间），Duration 单位为纳秒。
CREATE TABLE IF NOT EXISTS otel.otel_traces (
    `Timestamp` DateTime64(9) CODEC(Delta, ZSTD(1)),
    `TraceId` String CODEC(ZSTD(1)),
    `SpanId` String CODEC(ZSTD(1)),
    `ParentSpanId` String CODEC(ZSTD(1)),
    `TraceState` String CODEC(ZSTD(1)),
    `SpanName` LowCardinality(String) CODEC(ZSTD(1)),
    `SpanKind` LowCardinality(String) CODEC(ZSTD(1)),
    `ServiceName` LowCardinality(String) CODEC(ZSTD(1)),
    `ResourceAttributes` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `ScopeName` String CODEC(ZSTD(1)),
    `ScopeVersion` String CODEC(ZSTD(1)),
    `SpanAttributes` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `Duration` UInt64 CODEC(ZSTD(1)),
    `StatusCode` LowCardinality(String) CODEC(ZSTD(1)),
    `StatusMessage` String CODEC(ZSTD(1)),
    `Events` Nested (
        `Timestamp` DateTime64(9),
        `Name` LowCardinality(String),
        `Attributes` Map(LowCardinality(String), String)
    ) CODEC(ZSTD(1)),
    `Links` Nested (
        `TraceId` String,
        `SpanId` String,
        `TraceState` String,
        `Attributes` Map(LowCardinality(String), String)
    ) CODEC(ZSTD(1)),
    INDEX idx_trace_id `TraceId` TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_res_attr_key mapKeys(`ResourceAttributes`) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_res_attr_value mapValues(`ResourceAttributes`) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_span_attr_key mapKeys(`SpanAttributes`) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_span_attr_value mapValues(`SpanAttributes`) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_duration `Duration` TYPE minmax GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toDate(`Timestamp`)
ORDER BY (`ServiceName`, `SpanName`, toDateTime(`Timestamp`))
TTL toDateTime(`Timestamp`) + INTERVAL 90 DAY
SETTINGS index_granularity=8192, ttl_only_drop_parts=1;


-- ── 桥接 MV 1：otel_traces → tsp_spans ──────────────────────
-- 将标准 OTel 格式转换为自定义业务字段。
-- SpanAttributes 整体透传到 attributes_map（保留 peer.service 等），
-- ResourceAttributes 整体透传到 resource_map。
-- 事件列留空（由 mv_otel_to_span_events 独立处理）。
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
    toUInt16OrZero(`SpanAttributes`['http.status_code'])           AS http_status_code,
    `SpanAttributes`['http.host']                                        AS http_host,
    `SpanAttributes`['http.scheme']                                      AS http_scheme,
    `SpanAttributes`['http.user_agent']                                  AS http_user_agent,
    `SpanAttributes`['http.flavor']                                      AS http_flavor,
    toUInt64OrZero(`SpanAttributes`['http.request_content_length']) AS http_request_content_length,
    toUInt64OrZero(`SpanAttributes`['http.response_content_length'])AS http_response_content_length,

    -- 数据库组件（MySQL/PostgreSQL/ClickHouse/Redis）
    `SpanAttributes`['db.system']                                        AS db_system,
    `SpanAttributes`['db.name']                                          AS db_name,
    `SpanAttributes`['db.statement']                                     AS db_statement,
    `SpanAttributes`['db.operation']                                     AS db_operation,
    `SpanAttributes`['db.user']                                          AS db_user,

    -- Redis 组件
    toUInt8OrZero(`SpanAttributes`['db.redis.database'])           AS redis_db_index,
    `SpanAttributes`['db.redis.command']                                 AS redis_command,
    toUInt32OrZero(`SpanAttributes`['db.redis.key_length'])        AS redis_key_length,

    -- 消息队列组件（Kafka/RabbitMQ）
    `SpanAttributes`['messaging.system']                                 AS messaging_system,
    `SpanAttributes`['messaging.destination']                            AS messaging_destination,
    `SpanAttributes`['messaging.operation']                              AS messaging_operation,
    `SpanAttributes`['messaging.message_id']                             AS messaging_message_id,
    `SpanAttributes`['messaging.consumer.group']                         AS messaging_consumer_group,
    toInt32OrZero(`SpanAttributes`['messaging.kafka.partition'])    AS messaging_kafka_partition,
    `SpanAttributes`['messaging.kafka.key']                              AS messaging_kafka_key,
    toUInt64OrZero(`SpanAttributes`['messaging.kafka.offset'])     AS messaging_kafka_offset,

    -- RPC 组件
    `SpanAttributes`['rpc.system']                                       AS rpc_system,
    `SpanAttributes`['rpc.service']                                      AS rpc_service,
    `SpanAttributes`['rpc.method']                                       AS rpc_method,
    `SpanAttributes`['rpc.grpc.status_code']                             AS rpc_grpc_status_code,

    -- 线程信息
    `SpanAttributes`['thread.name']                                      AS thread_name,
    toUInt64OrZero(`SpanAttributes`['thread.id'])                  AS thread_id,

    -- FaaS / 容器
    `SpanAttributes`['faas.name']                                        AS faas_name,
    `SpanAttributes`['faas.trigger']                                     AS faas_trigger,
    `SpanAttributes`['container.id']                                     AS container_id,
    `SpanAttributes`['container.name']                                   AS container_name,

    -- TSP 业务字段（baggage → biz.* 由 Central Collector transform 完成）
    `SpanAttributes`['biz.vin']                                          AS biz_vin,
    `SpanAttributes`['biz.command_type']                                 AS biz_command_type,
    `SpanAttributes`['biz.command_status']                               AS biz_command_status,
    `SpanAttributes`['biz.tenant_id']                                    AS biz_tenant_id,
    `SpanAttributes`['biz.user_id']                                      AS biz_user_id,
    `SpanAttributes`['biz.platform']                                     AS biz_platform,
    `SpanAttributes`['biz.app_version']                                  AS biz_app_version,
    `SpanAttributes`['biz.country']                                      AS biz_country,
    `SpanAttributes`['biz.region']                                       AS biz_region,

    -- 环境维度
    `SpanAttributes`['deploy.env']                                       AS deploy_env,
    `SpanAttributes`['deploy.region']                                    AS deploy_region,

    -- 资源属性（从 ResourceAttributes 提取）
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
    toUInt32OrZero(`SpanAttributes`['net.peer.port'])              AS source_port,

    -- 事件（留空，由 mv_otel_to_span_events 独立处理）
    ''                                                                   AS event_name,
    now64(9)                                                             AS event_time,
    map()                                                                AS event_attributes,

    -- Link 信息（取第一个 Link，无则留空）
    if(length(`Links`.`TraceId`) > 0, arrayElement(`Links`.`TraceId`, 1), '')  AS linked_trace_id,
    if(length(`Links`.`SpanId`) > 0, arrayElement(`Links`.`SpanId`, 1), '')    AS linked_span_id,

    -- 扩展属性：整表透传（保留 peer.service、baggage.* 等全部属性）
    -- 拓扑 MV mv_service_topology_hourly 通过 attributes_map['peer.service'] 提取调用关系
    cast(`SpanAttributes`, 'Map(String, String)')                         AS attributes_map,
    cast(`ResourceAttributes`, 'Map(String, String)')                    AS resource_map,

    -- 元数据
    now()                                                                AS insert_time,
    if(`ParentSpanId` = '', 1, 0)                                        AS is_root
FROM otel.otel_traces;


-- ── 桥接 MV 2：otel_traces.Events → tsp_span_events ──────────
-- 使用 ARRAY JOIN 展开 otel_traces 的 Events Nested 列，
-- 将每个 Span Event 写入 tsp_span_events 独立存储。
-- 主要用途：异常事件（exception）的提取和独立查询。
CREATE MATERIALIZED VIEW IF NOT EXISTS platform.mv_otel_to_span_events
TO platform.tsp_span_events
AS SELECT
    -- event_id: 由 trace_id + span_id + 事件时间拼接生成
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

    -- 事件分类：exception / log / message / custom
    multiIf(
        ev_name = 'exception', 'exception',
        ev_name LIKE 'log%', 'log',
        ev_name LIKE 'message%', 'message',
        'custom'
    )                                                                    AS event_type,
    ev_name                                                              AS event_name,

    -- 异常详情（从 event attributes 提取）
    ev_attrs['exception.type']                                           AS exception_type,
    ev_attrs['exception.message']                                        AS exception_message,
    ev_attrs['exception.stacktrace']                                     AS exception_stack,
    cast(ev_attrs, 'Map(String, String)')                                  AS event_attributes,

    -- 业务维度（从父 Span 复制，便于独立查询）
    `SpanAttributes`['biz.vin']                                          AS biz_vin,
    `SpanAttributes`['biz.tenant_id']                                    AS biz_tenant_id,
    `SpanAttributes`['biz.user_id']                                      AS biz_user_id,
    `SpanAttributes`['biz.command_type']                                 AS biz_command_type,
    `SpanAttributes`['deploy.env']                                       AS deploy_env,

    -- 来源信息
    `SpanAttributes`['net.peer.ip']                                      AS source_ip,
    `SpanAttributes`['http.url']                                         AS http_url,
    `SpanAttributes`['http.method']                                      AS http_method,
    toUInt16OrZero(`SpanAttributes`['http.status_code'])           AS http_status_code,

    -- 元数据
    now()                                                                AS insert_time
FROM otel.otel_traces
ARRAY JOIN
    `Events`.`Timestamp` AS ev_time,
    `Events`.`Name`      AS ev_name,
    `Events`.`Attributes` AS ev_attrs
WHERE length(`Events`.`Name`) > 0;
