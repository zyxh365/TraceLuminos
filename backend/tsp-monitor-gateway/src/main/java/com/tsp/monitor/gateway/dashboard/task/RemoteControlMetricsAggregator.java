package com.tsp.monitor.gateway.dashboard.task;

import com.tsp.monitor.gateway.analysis.service.ClickHouseService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

/**
 * 远控指标定时聚合任务
 *
 * <p>每 10 分钟将 rc_minute_metrics 滚动聚合到 rc_command_metrics（小时表），
 * 并评估告警规则。</p>
 *
 * @author TSP Monitor Team
 * @since 2026-04-13
 */
@Slf4j
@Component
public class RemoteControlMetricsAggregator {

    @Resource
    private ClickHouseService clickHouseService;

    /**
     * 每 10 分钟执行一次：滚动聚合分钟级数据到小时级
     */
    @Scheduled(fixedRate = 600000, initialDelay = 60000)
    public void rollupMinuteToHourly() {
        log.info("开始远控指标滚动聚合（分钟→小时）");
        try {
            String sql = "INSERT INTO platform.rc_command_metrics " +
                    "SELECT " +
                    "  toStartOfHour(time) AS time, " +
                    "  metric_type, " +
                    "  service_name, " +
                    "  command_type, " +
                    "  sum(total_count) AS total_count, " +
                    "  sum(success_count) AS success_count, " +
                    "  sum(error_count) AS error_count, " +
                    "  sum(timeout_count) AS timeout_count, " +
                    "  avg(avg_duration_ms) AS avg_duration_ms, " +
                    "  avg(p50_duration_ms) AS p50_duration_ms, " +
                    "  avg(p95_duration_ms) AS p95_duration_ms, " +
                    "  avg(p99_duration_ms) AS p99_duration_ms, " +
                    "  max(p99_duration_ms) AS max_duration_ms, " +
                    "  sum(success_count) * 100.0 / nullIf(sum(total_count), 0) AS success_rate, " +
                    "  sum(error_count) * 100.0 / nullIf(sum(total_count), 0) AS error_rate, " +
                    "  sum(timeout_count) * 100.0 / nullIf(sum(total_count), 0) AS timeout_rate, " +
                    "  sum(mqtt_fail_count) AS mqtt_fail_count, " +
                    "  avg(pending_count) AS pending_count, " +
                    "  avg(kafka_lag_ms) AS kafka_lag_ms, " +
                    "  avg(dispatch_delay_ms) AS dispatch_delay_ms, " +
                    "  0 AS http_qps, " +
                    "  0 AS http_error_rate, " +
                    "  sum(auth_fail_count) AS auth_fail_count, " +
                    "  sum(permission_fail_count) AS permission_fail_count, " +
                    "  sum(db_write_count) AS db_write_count, " +
                    "  sum(duplicate_count) AS duplicate_count, " +
                    "  sum(sms_total) AS sms_total, " +
                    "  sum(sms_success) AS sms_success, " +
                    "  sum(sms_fail) AS sms_fail, " +
                    "  sum(sms_wakeup_success) AS sms_wakeup_success, " +
                    "  (sum(sms_total) - sum(sms_wakeup_success)) AS sms_wakeup_timeout, " +
                    "  sum(sms_wakeup_success) * 100.0 / nullIf(sum(sms_total), 0) AS sms_wakeup_rate, " +
                    "  avg(sms_mno_latency_p99) AS sms_mno_latency_p99, " +
                    "  0 AS sms_wakeup_latency, " +
                    "  toUInt32(avg(online_vehicles)) AS online_vehicles, " +
                    "  toUInt32(avg(mqtt_connections)) AS mqtt_connections, " +
                    "  sum(mqtt_conn_fail) * 100.0 / nullIf(sum(mqtt_connections), 0) AS mqtt_conn_fail_rate, " +
                    "  toUInt32(avg(mqtt_throughput)) AS mqtt_throughput, " +
                    "  sum(mqtt_loss_count) * 100.0 / nullIf(sum(mqtt_throughput), 0) AS mqtt_loss_rate, " +
                    "  now() AS updated_time " +
                    "FROM platform.rc_minute_metrics " +
                    "WHERE time >= now() - INTERVAL 2 HOUR " +
                    "GROUP BY metric_type, service_name, command_type, toStartOfHour(time)";

            clickHouseService.executeQuery(sql);
            log.info("远控指标滚动聚合完成");
        } catch (Exception e) {
            log.error("远控指标滚动聚合失败", e);
        }
    }
}
