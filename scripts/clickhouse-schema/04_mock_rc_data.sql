-- ============================================================
-- 远控监控看板 - 模拟测试数据
-- 用途：往 rc_minute_metrics 插入模拟数据，用于前端看板展示
-- 执行方式：docker exec -i tsp-clickhouse clickhouse-client --multiquery < 04_mock_rc_data.sql
--
-- 数据说明：
--   - 模拟最近 60 分钟的数据（每分钟 1 条）
--   - 覆盖 5 大类指标：e2e_command / tsp_service / tbox_service / sms_service / mqtt_connection
--   - 包含正常值 + 偶发异常值（超时、失败、MQTT 丢失等）
-- ============================================================

USE platform;

-- 先清理旧的模拟数据
ALTER TABLE platform.rc_minute_metrics DELETE WHERE updated_time >= now() - INTERVAL 2 HOUR;

-- 通用：60 分钟时间序列
-- 列顺序：time(1) metric_type(2) service_name(3) command_type(4) status(5)
--          total_count(6) success_count(7) error_count(8) timeout_count(9)
--          avg_duration_ms(10) p50_duration_ms(11) p95_duration_ms(12) p99_duration_ms(13)
--          mqtt_fail_count(14) pending_count(15) kafka_lag_ms(16) dispatch_delay_ms(17)
--          auth_fail_count(18) permission_fail_count(19) db_write_count(20) duplicate_count(21)
--          sms_total(22) sms_success(23) sms_fail(24) sms_wakeup_success(25) sms_mno_latency_p99(26)
--          online_vehicles(27) mqtt_connections(28) mqtt_conn_fail(29) mqtt_throughput(30) mqtt_loss_count(31)
--          updated_time(32)

-- ============================================================
-- 1. 端到端指令指标（e2e_command）- 32列
-- ============================================================
INSERT INTO platform.rc_minute_metrics
SELECT
    toDateTime64(now() - toIntervalMinute(60 - n), 3),
    'e2e_command',
    'tsp-remote-control-app',
    '', '',
    toUInt64(80 + rand() % 41),
    toUInt64(75 + rand() % 18),
    toUInt64(rand() % 4),
    toUInt64(if(rand() % 10 = 0, 1, 0)),
    toFloat64(150 + rand() % 200),
    toFloat64(100 + rand() % 100),
    toFloat64(300 + rand() % 300),
    toFloat64(500 + rand() % 500),
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    now()
FROM (SELECT arrayJoin(range(1, 61)) AS n);


-- ============================================================
-- 2. TSP 远控服务指标（tsp_service）- 32列
-- ============================================================
INSERT INTO platform.rc_minute_metrics
SELECT
    toDateTime64(now() - toIntervalMinute(60 - n), 3),
    'tsp_service',
    'tsp-remote-control-gateway',
    '', '',
    toUInt64(80 + rand() % 41),
    toUInt64(75 + rand() % 18),
    toUInt64(rand() % 4),
    toUInt64(if(rand() % 10 = 0, 1, 0)),
    toFloat64(30 + rand() % 50),
    toFloat64(20 + rand() % 30),
    toFloat64(80 + rand() % 80),
    toFloat64(120 + rand() % 150),
    toUInt64(if(rand() % 15 = 0, 1 + rand() % 2, 0)),
    toUInt64(if(rand() % 8 = 0, 50 + rand() % 100, 5 + rand() % 16)),
    toUInt64(10 + rand() % 50),
    toFloat64(5 + rand() % 20),
    0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    now()
FROM (SELECT arrayJoin(range(1, 61)) AS n);


-- ============================================================
-- 3. TBox 远控服务指标（tbox_service）- 32列
-- ============================================================
INSERT INTO platform.rc_minute_metrics
SELECT
    toDateTime64(now() - toIntervalMinute(60 - n), 3),
    'tbox_service',
    'tbox-command-processor',
    '', '',
    toUInt64(80 + rand() % 41),
    toUInt64(75 + rand() % 18),
    toUInt64(rand() % 3),
    0,
    toFloat64(50 + rand() % 80),
    toFloat64(30 + rand() % 50),
    toFloat64(150 + rand() % 200),
    toFloat64(200 + rand() % 300),
    0, 0, 0, 0,
    toUInt64(if(rand() % 20 = 0, 1, 0)),
    toUInt64(if(rand() % 50 = 0, 1, 0)),
    toUInt64(75 + rand() % 18),
    toUInt64(rand() % 3),
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    now()
FROM (SELECT arrayJoin(range(1, 61)) AS n);


-- ============================================================
-- 4. 第三方短信服务指标（sms_service）- 32列
-- ============================================================
INSERT INTO platform.rc_minute_metrics
SELECT
    toDateTime64(now() - toIntervalMinute(60 - n), 3),
    'sms_service',
    'sms-wakeup-service',
    '', '',
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    toUInt64(5 + rand() % 11),
    toUInt64(4 + rand() % 10),
    toUInt64(if(rand() % 8 = 0, 1, 0)),
    toUInt64(3 + rand() % 8),
    toFloat64(if(rand() % 5 = 0, 800 + rand() % 500, 200 + rand() % 400)),
    0, 0, 0, 0, 0,
    now()
FROM (SELECT arrayJoin(range(1, 61)) AS n);


-- ============================================================
-- 5. MQTT 连接指标（mqtt_connection）- 32列
-- ============================================================
INSERT INTO platform.rc_minute_metrics
SELECT
    toDateTime64(now() - toIntervalMinute(60 - n), 3),
    'mqtt_connection',
    'mqtt-broker-cluster',
    '', '',
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0, 0,
    toUInt32(8000 + rand() % 4001),
    toUInt32(8100 + rand() % 4200),
    toUInt32(if(rand() % 30 = 0, 1 + rand() % 3, 0)),
    toUInt32(5000 + rand() % 15001),
    toUInt32(if(rand() % 20 = 0, 1 + rand() % 5, 0)),
    now()
FROM (SELECT arrayJoin(range(1, 61)) AS n);


-- ============================================================
-- 6. 验证数据插入
-- ============================================================
SELECT '--- 数据插入完成，以下为各指标类型汇总 ---' AS info;
SELECT metric_type, count() AS rows, min(time) AS start, max(time) AS end
FROM platform.rc_minute_metrics
WHERE time >= now() - INTERVAL 2 HOUR
GROUP BY metric_type
ORDER BY metric_type;
