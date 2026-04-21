package com.tsp.monitor.gateway.dashboard.service;

import com.tsp.monitor.gateway.analysis.service.ClickHouseService;
import com.tsp.monitor.gateway.dashboard.dto.RemoteControlQueryDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.*;

/**
 * 远控告警服务类
 *
 * @author TSP Monitor Team
 * @since 2026-04-13
 */
@Slf4j
@Service
public class RemoteControlAlertService {

    @Resource
    private ClickHouseService clickHouseService;

    /**
     * 获取远控告警列表
     */
    public List<Map<String, Object>> getAlerts(RemoteControlQueryDTO query) {
        log.info("获取远控告警列表");

        String sql = "SELECT " +
                "alert_id, rule_name, severity, alert_time, recover_time, " +
                "service_name, metric_value, threshold, trace_id, notify_status " +
                "FROM platform.tsp_alert_events " +
                "WHERE rule_id IN (SELECT rule_id FROM platform.tsp_alert_rules WHERE rule_group = 'remote_control') " +
                "AND alert_time >= fromUnixTimestamp64Milli(?) " +
                "AND alert_time <= fromUnixTimestamp64Milli(?) " +
                "ORDER BY severity = 'critical' DESC, alert_time DESC " +
                "LIMIT 50";

        return clickHouseService.queryList(sql, query.getStartTime(), query.getEndTime());
    }

    /**
     * 获取远控告警规则列表
     */
    public List<Map<String, Object>> getAlertRules() {
        log.info("获取远控告警规则列表");

        String sql = "SELECT " +
                "rule_id, rule_name, rule_type, metric_name, operator, threshold, " +
                "duration_seconds, severity, enabled " +
                "FROM platform.tsp_alert_rules " +
                "WHERE rule_group = 'remote_control' " +
                "ORDER BY severity = 'critical' DESC, rule_name";

        return clickHouseService.queryList(sql);
    }

    /**
     * 评估告警规则并生成告警事件
     */
    public void evaluateAlertRules() {
        log.info("开始评估远控告警规则");

        List<Map<String, Object>> rules = getAlertRules();
        if (rules.isEmpty()) {
            return;
        }

        long now = System.currentTimeMillis();
        long fiveMinutesAgo = now - 5 * 60 * 1000;

        for (Map<String, Object> rule : rules) {
            if (!"1".equals(String.valueOf(rule.get("enabled")))) {
                continue;
            }

            String metricName = String.valueOf(rule.get("metric_name"));
            String operator = String.valueOf(rule.get("operator"));
            double threshold = toDouble(rule.get("threshold"));
            String severity = String.valueOf(rule.get("severity"));
            String ruleId = String.valueOf(rule.get("rule_id"));
            String ruleName = String.valueOf(rule.get("rule_name"));

            // 根据指标名查询最近5分钟的当前值
            Double currentValue = queryMetricValue(metricName, fiveMinutesAgo, now);
            if (currentValue == null) {
                continue;
            }

            // 评估阈值
            boolean triggered = false;
            switch (operator) {
                case "gt": triggered = currentValue > threshold; break;
                case "lt": triggered = currentValue < threshold; break;
                case "gte": triggered = currentValue >= threshold; break;
                case "lte": triggered = currentValue <= threshold; break;
                default: break;
            }

            if (triggered) {
                log.warn("远控告警触发: rule={}, metric={}, value={}, threshold={}, severity={}",
                        ruleName, metricName, currentValue, threshold, severity);
            }
        }
    }

    /**
     * 查询指标当前值
     */
    private Double queryMetricValue(String metricName, long startTime, long endTime) {
        String sql;

        switch (metricName) {
            case "tbox.p99_duration_ms":
                sql = "SELECT avg(p99_duration_ms) as val FROM platform.rc_minute_metrics " +
                        "WHERE metric_type = 'tbox_service' AND time >= fromUnixTimestamp64Milli(?) AND time <= fromUnixTimestamp64Milli(?)";
                break;
            case "sms.mno_latency_p99":
                sql = "SELECT avg(sms_mno_latency_p99) as val FROM platform.rc_minute_metrics " +
                        "WHERE metric_type = 'sms_service' AND time >= fromUnixTimestamp64Milli(?) AND time <= fromUnixTimestamp64Milli(?)";
                break;
            case "sms.fail_count":
                sql = "SELECT sum(sms_fail) as val FROM platform.rc_minute_metrics " +
                        "WHERE metric_type = 'sms_service' AND time >= fromUnixTimestamp64Milli(?) AND time <= fromUnixTimestamp64Milli(?)";
                break;
            case "sms.wakeup_rate":
                sql = "SELECT sum(sms_wakeup_success) * 100.0 / nullIf(sum(sms_total), 0) as val FROM platform.rc_minute_metrics " +
                        "WHERE metric_type = 'sms_service' AND time >= fromUnixTimestamp64Milli(?) AND time <= fromUnixTimestamp64Milli(?)";
                break;
            case "mqtt.loss_rate":
                sql = "SELECT sum(mqtt_loss_count) * 100.0 / nullIf(sum(mqtt_throughput), 0) as val FROM platform.rc_minute_metrics " +
                        "WHERE metric_type = 'mqtt_connection' AND time >= fromUnixTimestamp64Milli(?) AND time <= fromUnixTimestamp64Milli(?)";
                break;
            case "e2e.success_rate":
                sql = "SELECT sum(success_count) * 100.0 / nullIf(sum(total_count), 0) as val FROM platform.rc_minute_metrics " +
                        "WHERE metric_type IN ('e2e_command', 'tsp_service', 'tbox_service') " +
                        "AND time >= fromUnixTimestamp64Milli(?) AND time <= fromUnixTimestamp64Milli(?)";
                break;
            case "tsp.mqtt_fail_count":
                sql = "SELECT sum(mqtt_fail_count) as val FROM platform.rc_minute_metrics " +
                        "WHERE metric_type = 'tsp_service' AND time >= fromUnixTimestamp64Milli(?) AND time <= fromUnixTimestamp64Milli(?)";
                break;
            case "tsp.pending_count":
                sql = "SELECT sum(pending_count) as val FROM platform.rc_minute_metrics " +
                        "WHERE metric_type = 'tsp_service' AND time >= fromUnixTimestamp64Milli(?) AND time <= fromUnixTimestamp64Milli(?)";
                break;
            default:
                return null;
        }

        Map<String, Object> row = clickHouseService.queryOne(sql, startTime, endTime);
        if (row != null && row.get("val") != null) {
            return toDouble(row.get("val"));
        }
        return null;
    }

    private double toDouble(Object value) {
        if (value == null) return 0;
        if (value instanceof Number) return ((Number) value).doubleValue();
        return Double.parseDouble(value.toString());
    }
}
