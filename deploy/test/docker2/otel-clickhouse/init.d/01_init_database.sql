-- ============================================================
-- ClickHouse 初始化 SQL — TSP 可观测性平台
-- 自动执行于容器首次启动
-- ============================================================

-- 1. 创建数据库
CREATE DATABASE IF NOT EXISTS otel;
CREATE DATABASE IF NOT EXISTS platform;

-- 2. otel 库 — 接收 Collector 原生数据
CREATE TABLE IF NOT EXISTS otel.otel_traces
(
    `Timestamp` DateTime64(9, 'Asia/Shanghai'),
    `TraceId` String,
    `SpanId` String,
    `ParentSpanId` String,
    `TraceState` String,
    `ServiceName` LowCardinality(String),
    `ResourceAttributes` Map(String, String),
    `SpanName` String,
    `SpanKind` String,
    `SpanAttributes` Map(String, String),
    `Duration` UInt64,
    `StatusCode` String,
    `StatusMessage` String,
    `Events` Array(Map(String, String)),
    `Links` Array(Map(String, String))
)
ENGINE = MergeTree
PARTITION BY toDate(`Timestamp`)
ORDER BY (`ServiceName`, `SpanName`, `TraceId`)
TTL toDateTime(`Timestamp`) + INTERVAL 90 DAY;

-- 3. platform 库 — 业务表
CREATE TABLE IF NOT EXISTS platform.tsp_spans
(
    trace_id         String,
    span_id          String,
    parent_span_id   String,
    trace_state      String,
    start_time       DateTime64(9, 'Asia/Shanghai'),
    end_time         DateTime64(9, 'Asia/Shanghai'),
    duration_ns      UInt64,
    service_name     LowCardinality(String),
    service_version  String,
    service_namespace String,
    service_instance String,
    name             String,
    kind             String,
    status_code      String,
    status_message   String,
    http_method      String,
    http_url         String,
    http_route       String,
    http_status_code UInt16,
    http_host        String,
    http_scheme      String,
    http_user_agent  String,
    http_flavor      String,
    http_request_content_length  UInt64,
    http_response_content_length UInt64,
    db_system        String,
    db_name          String,
    db_statement     String,
    db_operation     String,
    db_user          String,
    redis_db_index   UInt8,
    redis_command    String,
    redis_key_length UInt32,
    messaging_system           String,
    messaging_destination      String,
    messaging_operation        String,
    messaging_message_id       String,
    messaging_consumer_group   String,
    messaging_kafka_partition  Int32,
    messaging_kafka_key        String,
    messaging_kafka_offset     UInt64,
    rpc_system       String,
    rpc_service      String,
    rpc_method       String,
    rpc_grpc_status_code String,
    thread_name      String,
    thread_id        UInt64,
    faas_name        String,
    faas_trigger     String,
    container_id     String,
    container_name   String,

    -- TSP 业务字段
    biz_vin          String COMMENT '车辆 VIN',
    biz_command_type String COMMENT '指令类型',
    biz_command_status String COMMENT '指令状态',
    biz_user_id      String COMMENT '用户 ID',
    biz_platform     String COMMENT '平台',
    biz_app_version  String COMMENT 'APP 版本',
    biz_country      String COMMENT '国家',
    biz_region       String COMMENT '区域',

    -- 多维字段
    biz_system       String COMMENT '业务系统',
    env              String COMMENT '环境',
    biz_channel      String COMMENT '渠道',
    biz_brand        String COMMENT '品牌',
    biz_tenant       String COMMENT '租户',

    -- 环境维度
    deploy_env       String,
    deploy_region    String,

    -- 资源属性
    host_name        String,
    host_ip          String,
    os_type          String,
    os_version       String,
    cloud_provider   String,
    cloud_region     String,
    cloud_az         String,

    -- 入口信息
    source_type      String,
    source_ip        String,
    source_port      UInt32,

    -- 事件
    event_name       String,
    event_time       DateTime64(9, 'Asia/Shanghai'),
    event_attributes Map(String, String),

    -- Link
    linked_trace_id  String,
    linked_span_id   String,

    -- 扩展属性
    attributes_map   Map(String, String),
    resource_map     Map(String, String),

    -- 元数据
    insert_time      DateTime,
    is_root          UInt8
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(start_time)
ORDER BY (service_name, name, start_time, trace_id)
TTL toDateTime(start_time) + INTERVAL 90 DAY;

-- 4. 物化视图: otel.otel_traces → platform.tsp_spans
CREATE MATERIALIZED VIEW IF NOT EXISTS platform.mv_otel_to_spans
TO platform.tsp_spans
AS
SELECT
    `TraceId`                    AS trace_id,
    `SpanId`                     AS span_id,
    `ParentSpanId`               AS parent_span_id,
    `TraceState`                 AS trace_state,
    `Timestamp` - `Duration`     AS start_time,
    `Timestamp`                  AS end_time,
    `Duration`                   AS duration_ns,
    `ServiceName`                AS service_name,
    `ResourceAttributes`['service.version'] AS service_version,
    `ResourceAttributes`['service.namespace'] AS service_namespace,
    `ResourceAttributes`['service.instance.id'] AS service_instance,
    `SpanName`                   AS name,
    `SpanKind`                   AS kind,
    `StatusCode`                 AS status_code,
    `StatusMessage`              AS status_message,
    `SpanAttributes`['http.method'] AS http_method,
    `SpanAttributes`['http.url'] AS http_url,
    `SpanAttributes`['http.route'] AS http_route,
    toUInt16OrZero(`SpanAttributes`['http.status_code']) AS http_status_code,
    `SpanAttributes`['http.host'] AS http_host,
    `SpanAttributes`['http.scheme'] AS http_scheme,
    `SpanAttributes`['http.user_agent'] AS http_user_agent,
    `SpanAttributes`['http.flavor'] AS http_flavor,
    toUInt64OrZero(`SpanAttributes`['http.request_content_length']) AS http_request_content_length,
    toUInt64OrZero(`SpanAttributes`['http.response_content_length']) AS http_response_content_length,
    `SpanAttributes`['db.system'] AS db_system,
    `SpanAttributes`['db.name'] AS db_name,
    `SpanAttributes`['db.statement'] AS db_statement,
    `SpanAttributes`['db.operation'] AS db_operation,
    `SpanAttributes`['db.user'] AS db_user,
    toUInt8OrZero(`SpanAttributes`['db.redis.database']) AS redis_db_index,
    `SpanAttributes`['db.redis.command'] AS redis_command,
    toUInt32OrZero(`SpanAttributes`['db.redis.key_length']) AS redis_key_length,
    `SpanAttributes`['messaging.system'] AS messaging_system,
    `SpanAttributes`['messaging.destination'] AS messaging_destination,
    `SpanAttributes`['messaging.operation'] AS messaging_operation,
    `SpanAttributes`['messaging.message_id'] AS messaging_message_id,
    `SpanAttributes`['messaging.consumer.group'] AS messaging_consumer_group,
    toInt32OrZero(`SpanAttributes`['messaging.kafka.partition']) AS messaging_kafka_partition,
    `SpanAttributes`['messaging.kafka.key'] AS messaging_kafka_key,
    toUInt64OrZero(`SpanAttributes`['messaging.kafka.offset']) AS messaging_kafka_offset,
    `SpanAttributes`['rpc.system'] AS rpc_system,
    `SpanAttributes`['rpc.service'] AS rpc_service,
    `SpanAttributes`['rpc.method'] AS rpc_method,
    `SpanAttributes`['rpc.grpc.status_code'] AS rpc_grpc_status_code,
    `SpanAttributes`['thread.name'] AS thread_name,
    toUInt64OrZero(`SpanAttributes`['thread.id']) AS thread_id,
    `SpanAttributes`['faas.name'] AS faas_name,
    `SpanAttributes`['faas.trigger'] AS faas_trigger,
    `SpanAttributes`['container.id'] AS container_id,
    `SpanAttributes`['container.name'] AS container_name,
    `SpanAttributes`['biz.vin'] AS biz_vin,
    `SpanAttributes`['biz.command_type'] AS biz_command_type,
    `SpanAttributes`['biz.command_status'] AS biz_command_status,
    `SpanAttributes`['biz.user_id'] AS biz_user_id,
    `SpanAttributes`['biz.platform'] AS biz_platform,
    `SpanAttributes`['biz.app_version'] AS biz_app_version,
    `SpanAttributes`['biz.country'] AS biz_country,
    `SpanAttributes`['biz.region'] AS biz_region,
    `SpanAttributes`['biz.system'] AS biz_system,
    `ResourceAttributes`['env'] AS env,
    `SpanAttributes`['biz.channel'] AS biz_channel,
    `SpanAttributes`['biz.brand'] AS biz_brand,
    `SpanAttributes`['biz.tenant'] AS biz_tenant,
    `SpanAttributes`['deploy.env'] AS deploy_env,
    `SpanAttributes`['deploy.region'] AS deploy_region,
    `ResourceAttributes`['host.name'] AS host_name,
    `ResourceAttributes`['host.ip'] AS host_ip,
    `ResourceAttributes`['os.type'] AS os_type,
    `ResourceAttributes`['os.version'] AS os_version,
    `ResourceAttributes`['cloud.provider'] AS cloud_provider,
    `ResourceAttributes`['cloud.region'] AS cloud_region,
    `ResourceAttributes`['cloud.availability-zone'] AS cloud_az,
    `SpanAttributes`['source.type'] AS source_type,
    `SpanAttributes`['net.peer.ip'] AS source_ip,
    toUInt32OrZero(`SpanAttributes`['net.peer.port']) AS source_port,
    '' AS event_name,
    now64(9) AS event_time,
    cast([] AS Map(String, String)) AS event_attributes,
    if(length(`Links`.`TraceId`) > 0, arrayElement(`Links`.`TraceId`, 1), '') AS linked_trace_id,
    if(length(`Links`.`SpanId`) > 0, arrayElement(`Links`.`SpanId`, 1), '') AS linked_span_id,
    cast(`SpanAttributes`, 'Map(String, String)') AS attributes_map,
    cast(`ResourceAttributes`, 'Map(String, String)') AS resource_map,
    now() AS insert_time,
    if(`ParentSpanId` = '', 1, 0) AS is_root
FROM otel.otel_traces;
