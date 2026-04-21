package com.tsp.monitor.gateway.dashboard.service;

import com.tsp.monitor.gateway.analysis.service.ClickHouseService;
import com.tsp.monitor.gateway.dashboard.dto.RemoteControlQueryDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.*;

/**
 * 远控监控看板服务类
 *
 * @author TSP Monitor Team
 * @since 2026-04-13
 */
@Slf4j
@Service
public class RemoteControlDashboardService {

    @Resource
    private ClickHouseService clickHouseService;

    /**
     * 获取端到端指标
     */
    public Map<String, Object> getE2EMetrics(RemoteControlQueryDTO query) {
        log.info("获取远控端到端指标, startTime={}, endTime={}", query.getStartTime(), query.getEndTime());

        Map<String, Object> result = new HashMap<>();

        // 聚合统计
        String aggSql = "SELECT " +
                "sum(total_count) as total_commands, " +
                "sum(success_count) as success_count, " +
                "sum(error_count) as error_count, " +
                "sum(timeout_count) as timeout_count, " +
                "avg(avg_duration_ms) as avg_response_time_ms, " +
                "avg(p95_duration_ms) as p95_response_time_ms, " +
                "avg(p99_duration_ms) as p99_response_time_ms " +
                "FROM platform.rc_minute_metrics " +
                "WHERE metric_type IN ('e2e_command', 'tsp_service', 'tbox_service') " +
                "AND time >= fromUnixTimestamp64Milli(?) " +
                "AND time <= fromUnixTimestamp64Milli(?)";

        Map<String, Object> agg = clickHouseService.queryOne(aggSql, query.getStartTime(), query.getEndTime());
        if (agg != null) {
            long total = toLong(agg.get("total_commands"));
            long success = toLong(agg.get("success_count"));
            long error = toLong(agg.get("error_count"));
            long timeout = toLong(agg.get("timeout_count"));

            result.put("totalCommands", total);
            result.put("successCount", success);
            result.put("failureCount", error);
            result.put("timeoutCount", timeout);
            result.put("successRate", total > 0 ? round(success * 100.0 / total, 2) : 0);
            result.put("failureRate", total > 0 ? round(error * 100.0 / total, 2) : 0);
            result.put("timeoutRate", total > 0 ? round(timeout * 100.0 / total, 2) : 0);
            result.put("avgResponseTimeMs", toDouble(agg.get("avg_response_time_ms")));
            result.put("p95ResponseTimeMs", toDouble(agg.get("p95_response_time_ms")));
            result.put("p99ResponseTimeMs", toDouble(agg.get("p99_response_time_ms")));
        } else {
            result.put("totalCommands", 0);
            result.put("successCount", 0);
            result.put("failureCount", 0);
            result.put("timeoutCount", 0);
            result.put("successRate", 0);
            result.put("failureRate", 0);
            result.put("timeoutRate", 0);
            result.put("avgResponseTimeMs", 0);
            result.put("p95ResponseTimeMs", 0);
            result.put("p99ResponseTimeMs", 0);
        }

        // 时序数据
        String tsSql = "SELECT " +
                "toUnixTimestamp64Milli(time) as timestamp, " +
                "sum(total_count) as total, " +
                "sum(success_count) as success, " +
                "sum(error_count) as error, " +
                "sum(timeout_count) as timeout, " +
                "avg(avg_duration_ms) as avg_duration, " +
                "avg(p99_duration_ms) as p99_duration " +
                "FROM platform.rc_minute_metrics " +
                "WHERE metric_type IN ('e2e_command', 'tsp_service', 'tbox_service') " +
                "AND time >= fromUnixTimestamp64Milli(?) " +
                "AND time <= fromUnixTimestamp64Milli(?) " +
                "GROUP BY time " +
                "ORDER BY time ASC";
        result.put("timeSeries", clickHouseService.queryList(tsSql, query.getStartTime(), query.getEndTime()));

        return result;
    }

    /**
     * 获取失败原因分析
     */
    public List<Map<String, Object>> getFailureAnalysis(RemoteControlQueryDTO query) {
        log.info("获取远控失败原因分析");

        String sql = "SELECT " +
                "error_type, " +
                "count() as count, " +
                "count() * 100.0 / sum(count()) OVER () as percentage " +
                "FROM platform.tsp_errors " +
                "WHERE biz_command_type != '' " +
                "AND time >= fromUnixTimestamp64Milli(?) " +
                "AND time <= fromUnixTimestamp64Milli(?) " +
                "GROUP BY error_type " +
                "ORDER BY count DESC " +
                "LIMIT 20";

        return clickHouseService.queryList(sql, query.getStartTime(), query.getEndTime());
    }

    /**
     * 获取 TSP 远控服务指标
     */
    public Map<String, Object> getTspServiceMetrics(RemoteControlQueryDTO query) {
        log.info("获取 TSP 远控服务指标");

        Map<String, Object> result = new HashMap<>();

        String aggSql = "SELECT " +
                "sum(mqtt_fail_count) as mqtt_publish_fail_count, " +
                "sum(pending_count) as pending_backlog_count, " +
                "avg(kafka_lag_ms) as kafka_consumption_delay_ms, " +
                "avg(dispatch_delay_ms) as command_dispatch_delay_ms, " +
                "sum(total_count) as total_commands, " +
                "sum(error_count) as error_count " +
                "FROM platform.rc_minute_metrics " +
                "WHERE metric_type = 'tsp_service' " +
                "AND time >= fromUnixTimestamp64Milli(?) " +
                "AND time <= fromUnixTimestamp64Milli(?)";

        Map<String, Object> agg = clickHouseService.queryOne(aggSql, query.getStartTime(), query.getEndTime());
        if (agg != null) {
            long total = toLong(agg.get("total_commands"));
            long error = toLong(agg.get("error_count"));

            result.put("mqttPublishFailCount", toLong(agg.get("mqtt_publish_fail_count")));
            result.put("pendingBacklogCount", toLong(agg.get("pending_backlog_count")));
            result.put("kafkaConsumptionDelayMs", toDouble(agg.get("kafka_consumption_delay_ms")));
            result.put("commandDispatchDelayMs", toDouble(agg.get("command_dispatch_delay_ms")));
            result.put("totalCommands", total);
            result.put("httpErrorRate", total > 0 ? round(error * 100.0 / total, 2) : 0);
        } else {
            result.put("mqttPublishFailCount", 0);
            result.put("pendingBacklogCount", 0);
            result.put("kafkaConsumptionDelayMs", 0);
            result.put("commandDispatchDelayMs", 0);
            result.put("totalCommands", 0);
            result.put("httpErrorRate", 0);
        }

        // QPS 时序
        String qpsSql = "SELECT " +
                "toUnixTimestamp64Milli(time) as timestamp, " +
                "sum(total_count) * 60.0 / ? as qps, " +
                "sum(error_count) * 60.0 / ? as error_qps, " +
                "avg(dispatch_delay_ms) as dispatch_delay, " +
                "avg(avg_duration_ms) as latency " +
                "FROM platform.rc_minute_metrics " +
                "WHERE metric_type = 'tsp_service' " +
                "AND time >= fromUnixTimestamp64Milli(?) " +
                "AND time <= fromUnixTimestamp64Milli(?) " +
                "GROUP BY time ORDER BY time ASC";
        result.put("timeSeries", clickHouseService.queryList(qpsSql,
                query.getInterval(), query.getInterval(), query.getStartTime(), query.getEndTime()));

        return result;
    }

    /**
     * 获取 TBox 远控服务指标
     */
    public Map<String, Object> getTBoxServiceMetrics(RemoteControlQueryDTO query) {
        log.info("获取 TBox 远控服务指标");

        Map<String, Object> result = new HashMap<>();

        String sql = "SELECT " +
                "sum(total_count) as total_commands, " +
                "sum(auth_fail_count) as auth_fail_count, " +
                "sum(permission_fail_count) as permission_fail_count, " +
                "avg(p99_duration_ms) as processing_delay_p99_ms, " +
                "sum(db_write_count) as db_write_success_count, " +
                "sum(duplicate_count) as duplicate_send_count, " +
                "sum(error_count) as error_count " +
                "FROM platform.rc_minute_metrics " +
                "WHERE metric_type = 'tbox_service' " +
                "AND time >= fromUnixTimestamp64Milli(?) " +
                "AND time <= fromUnixTimestamp64Milli(?)";

        Map<String, Object> agg = clickHouseService.queryOne(sql, query.getStartTime(), query.getEndTime());
        if (agg != null) {
            double p99 = toDouble(agg.get("processing_delay_p99_ms"));
            result.put("totalCommands", toLong(agg.get("total_commands")));
            result.put("authFailCount", toLong(agg.get("auth_fail_count")));
            result.put("permissionFailCount", toLong(agg.get("permission_fail_count")));
            result.put("processingDelayP99Ms", p99);
            result.put("dbWriteSuccessCount", toLong(agg.get("db_write_success_count")));
            result.put("duplicateSendCount", toLong(agg.get("duplicate_send_count")));
            result.put("alertFlags", Map.of(
                    "p99Exceeded", p99 > 200
            ));
        } else {
            result.put("totalCommands", 0);
            result.put("authFailCount", 0);
            result.put("permissionFailCount", 0);
            result.put("processingDelayP99Ms", 0);
            result.put("dbWriteSuccessCount", 0);
            result.put("duplicateSendCount", 0);
            result.put("alertFlags", Map.of("p99Exceeded", false));
        }

        // 时序
        String tsSql = "SELECT " +
                "toUnixTimestamp64Milli(time) as timestamp, " +
                "sum(total_count) as total, " +
                "sum(auth_fail_count) as auth_fail, " +
                "sum(permission_fail_count) as permission_fail, " +
                "avg(p99_duration_ms) as p99_delay, " +
                "sum(duplicate_count) as duplicate " +
                "FROM platform.rc_minute_metrics " +
                "WHERE metric_type = 'tbox_service' " +
                "AND time >= fromUnixTimestamp64Milli(?) " +
                "AND time <= fromUnixTimestamp64Milli(?) " +
                "GROUP BY time ORDER BY time ASC";
        result.put("timeSeries", clickHouseService.queryList(tsSql, query.getStartTime(), query.getEndTime()));

        return result;
    }

    /**
     * 获取第三方服务指标（短信唤醒）
     */
    public Map<String, Object> getThirdPartyMetrics(RemoteControlQueryDTO query) {
        log.info("获取第三方服务指标");

        Map<String, Object> result = new HashMap<>();

        String sql = "SELECT " +
                "sum(sms_total) as sms_total_count, " +
                "avg(sms_mno_latency_p99) as sms_mno_latency_p99_ms, " +
                "sum(sms_fail) as sms_mno_fail_count, " +
                "sum(sms_wakeup_success) as sms_wakeup_success_count, " +
                "sum(sms_success) as sms_success_count " +
                "FROM platform.rc_minute_metrics " +
                "WHERE metric_type = 'sms_service' " +
                "AND time >= fromUnixTimestamp64Milli(?) " +
                "AND time <= fromUnixTimestamp64Milli(?)";

        Map<String, Object> agg = clickHouseService.queryOne(sql, query.getStartTime(), query.getEndTime());
        if (agg != null) {
            long smsTotal = toLong(agg.get("sms_total_count"));
            long wakeupSuccess = toLong(agg.get("sms_wakeup_success_count"));
            double mnoP99 = toDouble(agg.get("sms_mno_latency_p99_ms"));
            long mnoFail = toLong(agg.get("sms_mno_fail_count"));
            double wakeupRate = smsTotal > 0 ? round(wakeupSuccess * 100.0 / smsTotal, 2) : 0;

            result.put("smsTotalCount", smsTotal);
            result.put("smsMnoLatencyP99Ms", mnoP99);
            result.put("smsMnoFailCount", mnoFail);
            result.put("smsWakeupSuccessRate", wakeupRate);
            result.put("smsWakeupTimeoutCount", smsTotal - wakeupSuccess);
            result.put("smsSuccessCount", toLong(agg.get("sms_success_count")));
            result.put("alertFlags", Map.of(
                    "p99Exceeded", mnoP99 > 1000,
                    "failCountExceeded", mnoFail > 5,
                    "successRateLow", wakeupRate < 85 && smsTotal > 0
            ));
        } else {
            result.put("smsTotalCount", 0);
            result.put("smsMnoLatencyP99Ms", 0);
            result.put("smsMnoFailCount", 0);
            result.put("smsWakeupSuccessRate", 0);
            result.put("smsWakeupTimeoutCount", 0);
            result.put("smsSuccessCount", 0);
            result.put("alertFlags", Map.of("p99Exceeded", false, "failCountExceeded", false, "successRateLow", false));
        }

        // 时序
        String tsSql = "SELECT " +
                "toUnixTimestamp64Milli(time) as timestamp, " +
                "sum(sms_total) as sms_total, " +
                "sum(sms_success) as sms_success, " +
                "sum(sms_fail) as sms_fail, " +
                "sum(sms_wakeup_success) as wakeup_success, " +
                "avg(sms_mno_latency_p99) as mno_latency " +
                "FROM platform.rc_minute_metrics " +
                "WHERE metric_type = 'sms_service' " +
                "AND time >= fromUnixTimestamp64Milli(?) " +
                "AND time <= fromUnixTimestamp64Milli(?) " +
                "GROUP BY time ORDER BY time ASC";
        result.put("timeSeries", clickHouseService.queryList(tsSql, query.getStartTime(), query.getEndTime()));

        return result;
    }

    /**
     * 获取车辆连接指标
     */
    public Map<String, Object> getVehicleConnectionMetrics(RemoteControlQueryDTO query) {
        log.info("获取车辆连接指标");

        Map<String, Object> result = new HashMap<>();

        String sql = "SELECT " +
                "avg(online_vehicles) as avg_online_vehicles, " +
                "max(online_vehicles) as max_online_vehicles, " +
                "avg(mqtt_connections) as avg_mqtt_connections, " +
                "sum(mqtt_conn_fail) as mqtt_conn_fail_total, " +
                "sum(mqtt_connections) as mqtt_conn_total, " +
                "avg(mqtt_throughput) as avg_mqtt_throughput, " +
                "sum(mqtt_loss_count) as mqtt_loss_total, " +
                "sum(mqtt_throughput) as mqtt_throughput_total " +
                "FROM platform.rc_minute_metrics " +
                "WHERE metric_type = 'mqtt_connection' " +
                "AND time >= fromUnixTimestamp64Milli(?) " +
                "AND time <= fromUnixTimestamp64Milli(?)";

        Map<String, Object> agg = clickHouseService.queryOne(sql, query.getStartTime(), query.getEndTime());
        if (agg != null) {
            long connTotal = toLong(agg.get("mqtt_conn_total"));
            long connFail = toLong(agg.get("mqtt_conn_fail_total"));
            long throughputTotal = toLong(agg.get("mqtt_throughput_total"));
            long lossTotal = toLong(agg.get("mqtt_loss_total"));
            double connFailRate = connTotal > 0 ? round(connFail * 100.0 / connTotal, 2) : 0;
            double lossRate = throughputTotal > 0 ? round(lossTotal * 100.0 / throughputTotal, 2) : 0;

            result.put("onlineVehicleCount", toLong(agg.get("avg_online_vehicles")));
            result.put("mqttConnectionCount", toLong(agg.get("avg_mqtt_connections")));
            result.put("mqttConnectionFailRate", connFailRate);
            result.put("mqttMessageThroughput", toLong(agg.get("avg_mqtt_throughput")));
            result.put("mqttMessageLossRate", lossRate);
            result.put("alertFlags", Map.of(
                    "lossRateExceeded", lossRate > 50
            ));
        } else {
            result.put("onlineVehicleCount", 0);
            result.put("mqttConnectionCount", 0);
            result.put("mqttConnectionFailRate", 0);
            result.put("mqttMessageThroughput", 0);
            result.put("mqttMessageLossRate", 0);
            result.put("alertFlags", Map.of("lossRateExceeded", false));
        }

        // 时序
        String tsSql = "SELECT " +
                "toUnixTimestamp64Milli(time) as timestamp, " +
                "avg(online_vehicles) as online_vehicles, " +
                "avg(mqtt_connections) as avg_mqtt_conn, " +
                "sum(mqtt_conn_fail) as conn_fail, " +
                "sum(mqtt_connections) as conn_total, " +
                "avg(mqtt_throughput) as avg_throughput, " +
                "sum(mqtt_loss_count) as loss_count, " +
                "sum(mqtt_throughput) as throughput_total " +
                "FROM platform.rc_minute_metrics " +
                "WHERE metric_type = 'mqtt_connection' " +
                "AND time >= fromUnixTimestamp64Milli(?) " +
                "AND time <= fromUnixTimestamp64Milli(?) " +
                "GROUP BY time ORDER BY time ASC";
        result.put("timeSeries", clickHouseService.queryList(tsSql, query.getStartTime(), query.getEndTime()));

        return result;
    }

    private long toLong(Object value) {
        if (value == null) return 0;
        if (value instanceof Number) return ((Number) value).longValue();
        return Long.parseLong(value.toString());
    }

    private double toDouble(Object value) {
        if (value == null) return 0;
        if (value instanceof Number) return ((Number) value).doubleValue();
        return Double.parseDouble(value.toString());
    }

    private double round(double value, int scale) {
        return Math.round(value * Math.pow(10, scale)) / Math.pow(10, scale);
    }
}
