-- ============================================================
-- TSP 自研可观测性平台 - ClickHouse 查询示例
-- 版本：v2.1（增加远控业务监控查询）
-- 数据库：platform
-- ============================================================

USE platform;

-- ============================================================
-- 一、链路查询（tsp-monitor-gateway 链路模块）
-- ============================================================

-- 1.1 按 TraceID 查询完整链路
SELECT
    span_id, parent_span_id,
    start_time, duration_ms,
    service_name, span_name, span_kind,
    component_type, component_detail,
    status_code, biz_vin
FROM v_trace_detail
WHERE trace_id = 'aabbccddeeff00112233445566778899'
ORDER BY start_time;

-- 1.2 查询链路列表（按条件筛选）
SELECT
    trace_id, start_time, total_duration_ms, span_count,
    services, has_error,
    http_method, http_route, http_status_code,
    biz_vin, biz_command_type, biz_tenant_id, source_ip, deploy_env
FROM v_trace_summary
WHERE start_time > now() - INTERVAL 1 HOUR
  AND (biz_tenant_id = '' OR biz_tenant_id = 'SA_OEM_A')
ORDER BY start_time DESC
LIMIT 50;

-- 1.3 按服务名查最近链路
SELECT trace_id, start_time, span_count, has_error,
       http_route, biz_vin, biz_platform
FROM v_trace_summary
WHERE has(service_name, 'tsp-service-1')
  AND start_time > now() - INTERVAL 1 HOUR
ORDER BY start_time DESC
LIMIT 100;

-- 1.4 按错误过滤链路
SELECT trace_id, start_time, total_duration_ms, services,
       http_route, http_status_code, biz_vin
FROM v_trace_summary
WHERE has_error = 1
  AND start_time > now() - INTERVAL 24 HOUR
ORDER BY start_time DESC
LIMIT 100;

-- ============================================================
-- 二、组件查询
-- ============================================================

-- 2.1 Redis 操作明细
SELECT trace_id, start_time, service_name,
       redis_command, db_statement,
       duration_ms, status_code
FROM v_trace_detail
WHERE component_type = 'redis'
  AND start_time > now() - INTERVAL 1 HOUR
ORDER BY duration_ms DESC
LIMIT 50;

-- 2.2 慢 SQL Top 20（最近 24 小时）
SELECT
    service_name, db_operation,
    substring(db_statement, 1, 200) AS sql_preview,
    avg(duration_ns) / 1000000 AS avg_ms,
    max(duration_ns) / 1000000 AS max_ms,
    count() AS exec_count
FROM tsp_spans
WHERE db_system = 'mysql'
  AND start_time > now() - INTERVAL 24 HOUR
GROUP BY service_name, db_operation, db_statement
ORDER BY avg_ms DESC
LIMIT 20;

-- 2.3 Kafka 消息明细
SELECT trace_id, start_time, service_name,
       kind AS span_kind,
       messaging_destination AS topic,
       messaging_kafka_partition, messaging_kafka_offset,
       duration_ms
FROM v_trace_detail
WHERE component_type = 'kafka'
  AND start_time > now() - INTERVAL 1 HOUR
ORDER BY start_time DESC;

-- 2.4 N+1 查询检测（单条链路中 DB 查询 >= 10 次）
SELECT trace_id, count() AS db_query_count,
       groupArray(tuple(service_name, db_statement))
FROM tsp_spans
WHERE db_system = 'mysql'
  AND start_time > now() - INTERVAL 1 HOUR
GROUP BY trace_id
HAVING db_query_count >= 10
ORDER BY db_query_count DESC;

-- ============================================================
-- 三、业务维度查询（TSP 车联网场景）
-- ============================================================

-- 3.1 按车辆 VIN 查询操作历史
SELECT trace_id, start_time, service_name, span_name,
       biz_command_type, biz_command_status, duration_ms,
       status_code, component_type
FROM v_trace_detail
WHERE biz_vin = 'LSVAU2A37N1234567'
ORDER BY start_time DESC;

-- 3.2 按租户统计 QPS 和错误率
SELECT
    biz_tenant_id AS tenant,
    count(DISTINCT trace_id) AS requests,
    count() AS spans,
    sum(if(status_code = 'ERROR', 1, 0)) AS errors,
    if(count() > 0, sum(if(status_code = 'ERROR', 1, 0)) / count(), 0) AS error_rate,
    avg(duration_ns) / 1000000 AS avg_ms
FROM tsp_spans
WHERE biz_tenant_id != ''
  AND start_time > now() - INTERVAL 24 HOUR
  AND is_root = 1
GROUP BY biz_tenant_id
ORDER BY requests DESC;

-- 3.3 按指令类型统计
SELECT
    biz_command_type,
    count(DISTINCT trace_id) AS total_commands,
    sum(if(biz_command_status = 'FAILED', 1, 0)) AS failed,
    avg(duration_ns) / 1000000 AS avg_ms,
    quantile(0.95)(duration_ns) / 1000000 AS p95_ms
FROM tsp_spans
WHERE biz_command_type != ''
  AND start_time > now() - INTERVAL 24 HOUR
  AND is_root = 1
GROUP BY biz_command_type
ORDER BY total_commands DESC;

-- 3.4 按平台（android/ios/web/车载）统计
SELECT
    biz_platform AS platform,
    count(DISTINCT trace_id) AS requests,
    count(DISTINCT biz_user_id) AS users,
    avg(duration_ns) / 1000000 AS avg_ms
FROM tsp_spans
WHERE biz_platform != ''
  AND start_time > now() - INTERVAL 24 HOUR
  AND is_root = 1
GROUP BY biz_platform
ORDER BY requests DESC;

-- 3.5 按项目编码统计（多项目对比）
SELECT
    biz_project_code AS project,
    biz_tenant_id AS tenant,
    count(DISTINCT trace_id) AS requests,
    sum(if(status_code = 'ERROR', 1, 0)) AS errors
FROM tsp_spans
WHERE biz_project_code != ''
  AND start_time > now() - INTERVAL 24 HOUR
GROUP BY biz_project_code, biz_tenant_id
ORDER BY requests DESC;

-- 3.6 按国家/区域统计（海外运营场景）
SELECT
    biz_country, biz_region,
    count(DISTINCT trace_id) AS requests,
    avg(duration_ns) / 1000000 AS avg_ms
FROM tsp_spans
WHERE biz_country != ''
  AND start_time > now() - INTERVAL 24 HOUR
  AND is_root = 1
GROUP BY biz_country, biz_region
ORDER BY requests DESC;

-- 3.7 指令执行成功率趋势（每小时）
SELECT
    toStartOfHour(start_time) AS hour,
    count(DISTINCT trace_id) AS total,
    sum(if(biz_command_status = 'PROCESSED', 1, 0)) AS success,
    sum(if(biz_command_status = 'FAILED', 1, 0)) AS failed,
    if(count(DISTINCT trace_id) > 0,
       sum(if(biz_command_status = 'PROCESSED', 1, 0)) / count(DISTINCT trace_id), 0) AS success_rate
FROM tsp_spans
WHERE biz_command_type != ''
  AND start_time > now() - INTERVAL 24 HOUR
GROUP BY hour
ORDER BY hour;

-- ============================================================
-- 四、性能分析
-- ============================================================

-- 4.1 服务级 P99/P95 耗时（每小时）
SELECT time, service_name, span_name,
       duration_p99 / 1000000 AS p99_ms,
       duration_p95 / 1000000 AS p95_ms,
       span_count, error_rate
FROM tsp_span_metrics
WHERE window = 'hour'
  AND time > now() - INTERVAL 24 HOUR
ORDER BY time DESC, p99_ms DESC;

-- 4.2 慢请求 Top 20（P99 最高）
SELECT service_name, name AS span_name, component_type,
       quantile(0.99)(duration_ns) / 1000000 AS p99_ms,
       quantile(0.95)(duration_ns) / 1000000 AS p95_ms,
       count() AS total
FROM tsp_spans
WHERE start_time > now() - INTERVAL 1 HOUR
  AND kind = 'SERVER'
GROUP BY service_name, name, component_type
HAVING total >= 10
ORDER BY p99_ms DESC
LIMIT 20;

-- 4.3 错误率最高接口
SELECT service_name, name AS span_name,
       count() AS total,
       sum(if(status_code = 'ERROR', 1, 0)) AS errors,
       (errors * 100.0 / total) AS error_pct
FROM tsp_spans
WHERE start_time > now() - INTERVAL 24 HOUR
  AND kind IN ('SERVER', 'CLIENT')
GROUP BY service_name, name
HAVING total >= 10
ORDER BY error_pct DESC
LIMIT 20;

-- 4.4 实时 QPS（每分钟）
SELECT
    toStartOfMinute(start_time) AS minute,
    count() AS qpm
FROM tsp_spans
WHERE start_time > now() - INTERVAL 1 HOUR
  AND is_root = 1
GROUP BY minute
ORDER BY minute;

-- ============================================================
-- 五、错误分析
-- ============================================================

-- 5.1 最近错误列表
SELECT time, trace_id, service_name, span_name,
       error_type, biz_vin, biz_command_type, source_ip
FROM tsp_errors
ORDER BY time DESC
LIMIT 100;

-- 5.2 按服务统计错误分布
SELECT service_name, error_type,
       count() AS error_count
FROM tsp_errors
WHERE time > now() - INTERVAL 24 HOUR
GROUP BY service_name, error_type
ORDER BY error_count DESC
LIMIT 20;

-- 5.3 按租户统计错误
SELECT biz_tenant_id, service_name,
       count() AS errors
FROM tsp_errors
WHERE time > now() - INTERVAL 24 HOUR
  AND biz_tenant_id != ''
GROUP BY biz_tenant_id, service_name
ORDER BY errors DESC;

-- 5.4 查询 Span Events（异常事件独立查询）
SELECT event_time, trace_id, service_name,
       event_type, exception_type, exception_message,
       biz_vin, biz_tenant_id
FROM tsp_span_events
WHERE event_type = 'exception'
  AND event_time > now() - INTERVAL 24 HOUR
ORDER BY event_time DESC
LIMIT 50;

-- ============================================================
-- 六、服务拓扑
-- ============================================================

-- 6.1 查询当前小时的服务调用拓扑
SELECT source_service, target_service, operation, protocol,
       call_count, error_count, avg_duration_ms, p99_duration_ms
FROM tsp_service_topology
WHERE time = toStartOfHour(now())
ORDER BY call_count DESC;

-- 6.2 查询最近 24 小时拓扑变化
SELECT source_service, target_service,
       sum(call_count) AS total_calls,
       sum(error_count) AS total_errors,
       avg(avg_duration_ms) AS avg_ms
FROM tsp_service_topology
WHERE time > now() - INTERVAL 24 HOUR
GROUP BY source_service, target_service
ORDER BY total_calls DESC;

-- ============================================================
-- 七、告警
-- ============================================================

-- 7.1 查询活跃告警（未恢复）
SELECT alert_id, rule_name, severity, alert_time,
       service_name, metric_value, threshold, trace_id
FROM tsp_alert_events
WHERE recover_time IS NULL
ORDER BY alert_time DESC;

-- 7.2 按严重级别统计告警
SELECT severity, count() AS alert_count
FROM tsp_alert_events
WHERE recover_time IS NULL
GROUP BY severity
ORDER BY alert_count DESC;

-- 7.3 查询告警规则
SELECT rule_id, rule_name, rule_type, rule_group,
       target_service, metric_name, operator, threshold,
       severity, enabled
FROM tsp_alert_rules
ORDER BY rule_group, severity;

-- ============================================================
-- 八、运维查询
-- ============================================================

-- 8.1 表存储空间
SELECT table, formatReadableSize(sum(bytes)) AS size,
       sum(rows) AS rows, count() AS parts
FROM system.parts
WHERE active AND database = 'platform'
GROUP BY table
ORDER BY sum(bytes) DESC;

-- 8.2 分区信息
SELECT table, partition,
       formatReadableSize(sum(bytes)) AS size, sum(rows) AS rows
FROM system.parts
WHERE active AND database = 'platform'
GROUP BY table, partition
ORDER BY partition DESC;

-- 8.3 优化合并
OPTIMIZE TABLE platform.tsp_spans PARTITION tuple() FINAL;
OPTIMIZE TABLE platform.tsp_span_metrics PARTITION tuple() FINAL;


-- ============================================================
-- 九、远控业务监控查询（rc_minute_metrics / rc_command_metrics）
-- ============================================================

-- 9.1 端到端指令成功率趋势（每分钟）
SELECT
    toUnixTimestamp64Milli(time) AS timestamp,
    sum(total_count) AS total,
    sum(success_count) AS success,
    sum(error_count) AS error,
    sum(timeout_count) AS timeout,
    sum(success_count) * 100.0 / nullIf(sum(total_count), 0) AS success_rate
FROM rc_minute_metrics
WHERE metric_type IN ('e2e_command', 'tsp_service', 'tbox_service')
  AND time > now() - INTERVAL 1 HOUR
GROUP BY time
ORDER BY time;

-- 9.2 TSP 远控服务实时指标
SELECT
    time,
    sum(mqtt_fail_count) AS mqtt_fail,
    sum(pending_count) AS pending_backlog,
    avg(kafka_lag_ms) AS kafka_delay,
    avg(dispatch_delay_ms) AS dispatch_delay,
    sum(total_count) AS total
FROM rc_minute_metrics
WHERE metric_type = 'tsp_service'
  AND time > now() - INTERVAL 30 MINUTE
GROUP BY time
ORDER BY time;

-- 9.3 TBox 鉴权/权限失败统计（最近 1 小时）
SELECT
    time,
    sum(auth_fail_count) AS auth_fail,
    sum(permission_fail_count) AS permission_fail,
    sum(duplicate_count) AS duplicate,
    avg(p99_duration_ms) AS p99_delay
FROM rc_minute_metrics
WHERE metric_type = 'tbox_service'
  AND time > now() - INTERVAL 1 HOUR
GROUP BY time
ORDER BY time;

-- 9.4 短信唤醒成功率趋势
SELECT
    time,
    sum(sms_total) AS sms_total,
    sum(sms_success) AS sms_success,
    sum(sms_fail) AS sms_fail,
    sum(sms_wakeup_success) * 100.0 / nullIf(sum(sms_total), 0) AS wakeup_rate,
    avg(sms_mno_latency_p99) AS mno_latency_p99
FROM rc_minute_metrics
WHERE metric_type = 'sms_service'
  AND time > now() - INTERVAL 1 HOUR
GROUP BY time
ORDER BY time;

-- 9.5 MQTT 连接 & 消息丢失率
SELECT
    time,
    avg(online_vehicles) AS online_vehicles,
    avg(mqtt_connections) AS mqtt_connections,
    sum(mqtt_conn_fail) * 100.0 / nullIf(sum(mqtt_connections), 0) AS conn_fail_rate,
    sum(mqtt_loss_count) * 100.0 / nullIf(sum(mqtt_throughput), 0) AS loss_rate
FROM rc_minute_metrics
WHERE metric_type = 'mqtt_connection'
  AND time > now() - INTERVAL 1 HOUR
GROUP BY time
ORDER BY time;

-- 9.6 远控失败原因分布（从 tsp_errors 表查询）
SELECT
    error_type,
    count() AS count,
    count() * 100.0 / sum(count()) OVER () AS percentage
FROM tsp_errors
WHERE biz_command_type != ''
  AND time > now() - INTERVAL 24 HOUR
GROUP BY error_type
ORDER BY count DESC;

-- 9.7 远控告警规则列表
SELECT rule_id, rule_name, rule_group, metric_name,
       operator, threshold, severity, enabled
FROM tsp_alert_rules
WHERE rule_group = 'remote_control'
ORDER BY severity = 'critical' DESC, rule_name;

-- 9.8 远控活跃告警（未恢复）
SELECT alert_id, rule_name, severity, alert_time,
       service_name, metric_value, threshold
FROM tsp_alert_events
WHERE rule_id IN (SELECT rule_id FROM tsp_alert_rules WHERE rule_group = 'remote_control')
  AND recover_time IS NULL
ORDER BY alert_time DESC;
