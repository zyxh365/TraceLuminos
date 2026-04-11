package com.tsp.monitor.gateway.analysis.service;

import com.alibaba.fastjson2.JSON;
import com.clickhouse.jdbc.ClickHouseConnection;
import com.clickhouse.jdbc.ClickHouseDataSource;
import com.tsp.monitor.gateway.analysis.config.ClickHouseConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import javax.annotation.Resource;
import java.sql.*;
import java.util.*;

/**
 * ClickHouse 服务类
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@Slf4j
@Service
public class ClickHouseService {

    @Resource
    private ClickHouseConfig clickHouseConfig;

    private ClickHouseDataSource dataSource;

    @PostConstruct
    public void init() {
        try {
            Properties properties = new Properties();
            properties.setProperty("user", clickHouseConfig.getUsername());
            properties.setProperty("password", clickHouseConfig.getPassword());
            properties.setProperty("socket_timeout", String.valueOf(clickHouseConfig.getSocketTimeout()));

            dataSource = new ClickHouseDataSource(clickHouseConfig.getUrl(), properties);
            log.info("ClickHouse 数据源初始化成功, URL: {}", clickHouseConfig.getUrl());
        } catch (Exception e) {
            log.error("ClickHouse 数据源初始化失败", e);
            throw new RuntimeException("ClickHouse 数据源初始化失败: " + e.getMessage());
        }
    }

    @PreDestroy
    public void destroy() {
        log.info("ClickHouse 连接池销毁");
    }

    /**
     * 执行查询并返回列表
     */
    public List<Map<String, Object>> queryList(String sql, Object... params) {
        log.info("执行 ClickHouse 查询, SQL: {}", sql);

        List<Map<String, Object>> result = new ArrayList<>();

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {

            // 设置参数
            for (int i = 0; i < params.length; i++) {
                statement.setObject(i + 1, params[i]);
            }

            try (ResultSet resultSet = statement.executeQuery()) {
                ResultSetMetaData metaData = resultSet.getMetaData();
                int columnCount = metaData.getColumnCount();

                while (resultSet.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (int i = 1; i <= columnCount; i++) {
                        String columnName = metaData.getColumnName(i);
                        Object value = resultSet.getObject(i);
                        row.put(columnName, value);
                    }
                    result.add(row);
                }
            }

            log.info("查询成功, 返回 {} 条记录", result.size());
            return result;

        } catch (Exception e) {
            log.error("执行 ClickHouse 查询失败", e);
            throw new RuntimeException("执行 ClickHouse 查询失败: " + e.getMessage());
        }
    }

    /**
     * 执行查询并返回单条记录
     */
    public Map<String, Object> queryOne(String sql, Object... params) {
        List<Map<String, Object>> list = queryList(sql, params);
        return list.isEmpty() ? null : list.get(0);
    }

    /**
     * 执行查询并返回单个值
     */
    public <T> T queryValue(String sql, Class<T> clazz, Object... params) {
        Map<String, Object> row = queryOne(sql, params);
        if (row == null || row.values().isEmpty()) {
            return null;
        }
        Object value = row.values().iterator().next();
        return value != null ? (T) value : null;
    }

    /**
     * 查询链路追踪数据（从 platform.tsp_spans 查询）
     */
    public List<Map<String, Object>> queryTraces(String traceId, Long startTime, Long endTime) {
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT ");
        sql.append("  trace_id, ");
        sql.append("  span_id, ");
        sql.append("  parent_span_id, ");
        sql.append("  name AS operation_name, ");
        sql.append("  service_name, ");
        sql.append("  start_time, ");
        sql.append("  duration_ns AS duration, ");
        sql.append("  status_code, ");
        sql.append("  kind, ");
        sql.append("  attributes_map, ");
        sql.append("  biz_vin ");
        sql.append("FROM platform.tsp_spans ");
        sql.append("WHERE trace_id = ? ");
        sql.append("  AND start_time >= fromUnixTimestamp64Milli(?) ");
        sql.append("  AND start_time <= fromUnixTimestamp64Milli(?) ");
        sql.append("ORDER BY start_time ASC");

        return queryList(sql.toString(), traceId, startTime, endTime);
    }

    /**
     * 按 TraceId 或 VIN 搜索链路
     */
    public List<Map<String, Object>> searchTraceIds(String keyword, String searchType,
            Long startTime, Long endTime, Integer limit) {
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT ");
        sql.append("  trace_id, ");
        sql.append("  argMin(service_name, start_time) AS service_name, ");
        sql.append("  min(start_time) AS min_start_time, ");
        sql.append("  sum(duration_ns) AS duration_ns, ");
        sql.append("  count() AS span_count, ");
        sql.append("  maxIf(status_code, status_code = 'ERROR') = 'ERROR' AS has_error, ");
        sql.append("  any(biz_vin) AS any_biz_vin ");
        sql.append("FROM platform.tsp_spans ");
        sql.append("WHERE start_time >= fromUnixTimestamp64Milli(?) ");
        sql.append("  AND start_time <= fromUnixTimestamp64Milli(?) ");
        if ("traceId".equals(searchType)) {
            sql.append("  AND trace_id LIKE ? ");
        } else if ("vin".equals(searchType)) {
            sql.append("  AND biz_vin = ? ");
        }
        sql.append("GROUP BY trace_id ");
        sql.append("ORDER BY min_start_time DESC ");
        sql.append("LIMIT ?");

        if ("traceId".equals(searchType)) {
            return queryList(sql.toString(), startTime, endTime,
                    "%" + keyword + "%", limit);
        } else {
            return queryList(sql.toString(), startTime, endTime,
                    keyword, limit);
        }
    }

    /**
     * 查询服务调用统计
     */
    public List<Map<String, Object>> queryServiceStats(String serviceName, Long startTime, Long endTime) {
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT ");
        sql.append("  service_name, ");
        sql.append("  operation_name, ");
        sql.append("  count() as total_count, ");
        sql.append("  avg(duration) as avg_duration, ");
        sql.append("  max(duration) as max_duration, ");
        sql.append("  min(duration) as min_duration, ");
        sql.append("  sum(duration) as total_duration ");
        sql.append("FROM traces ");
        sql.append("WHERE service_name = ? ");
        sql.append("  AND start_time >= fromUnixTimestamp64Milli(?) ");
        sql.append("  AND start_time <= fromUnixTimestamp64Milli(?) ");
        sql.append("GROUP BY service_name, operation_name ");
        sql.append("ORDER BY total_count DESC");

        return queryList(sql.toString(), serviceName, startTime, endTime);
    }

    /**
     * 查询慢查询列表
     */
    public List<Map<String, Object>> querySlowTraces(Long startTime, Long endTime, Integer threshold, Integer limit) {
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT ");
        sql.append("  trace_id, ");
        sql.append("  span_id, ");
        sql.append("  service_name, ");
        sql.append("  operation_name, ");
        sql.append("  start_time, ");
        sql.append("  duration, ");
        sql.append("  status_code ");
        sql.append("FROM traces ");
        sql.append("WHERE start_time >= fromUnixTimestamp64Milli(?) ");
        sql.append("  AND start_time <= fromUnixTimestamp64Milli(?) ");
        sql.append("  AND duration >= ? ");
        sql.append("ORDER BY duration DESC ");
        sql.append("LIMIT ?");

        return queryList(sql.toString(), startTime, endTime, threshold, limit);
    }

    /**
     * 查询错误日志
     */
    public List<Map<String, Object>> queryErrorLogs(Long startTime, Long endTime, Integer limit) {
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT ");
        sql.append("  trace_id, ");
        sql.append("  span_id, ");
        sql.append("  service_name, ");
        sql.append("  operation_name, ");
        sql.append("  start_time, ");
        sql.append("  duration, ");
        sql.append("  status_code, ");
        sql.append("  tags ");
        sql.append("FROM traces ");
        sql.append("WHERE start_time >= fromUnixTimestamp64Milli(?) ");
        sql.append("  AND start_time <= fromUnixTimestamp64Milli(?) ");
        sql.append("  AND status_code >= 400 ");
        sql.append("ORDER BY start_time DESC ");
        sql.append("LIMIT ?");

        return queryList(sql.toString(), startTime, endTime, limit);
    }

    /**
     * 查询服务调用拓扑（从预聚合的 tsp_service_topology 表查询）
     */
    public List<Map<String, Object>> queryServiceTopology(Long startTime, Long endTime) {
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT ");
        sql.append("  source_service, ");
        sql.append("  target_service, ");
        sql.append("  protocol, ");
        sql.append("  sum(call_count) AS call_count, ");
        sql.append("  sum(error_count) AS error_count, ");
        sql.append("  avg(avg_duration_ms) AS avg_duration_ms, ");
        sql.append("  max(p99_duration_ms) AS p99_duration_ms ");
        sql.append("FROM platform.tsp_service_topology ");
        sql.append("WHERE time >= fromUnixTimestamp64Milli(?) ");
        sql.append("  AND time <= fromUnixTimestamp64Milli(?) ");
        sql.append("  AND source_service != '' ");
        sql.append("  AND target_service != '' ");
        sql.append("GROUP BY source_service, target_service, protocol ");
        sql.append("ORDER BY call_count DESC");

        return queryList(sql.toString(), startTime, endTime);
    }

    /**
     * 查询时序指标数据
     */
    public List<Map<String, Object>> queryTimeSeriesMetrics(
            String metricName,
            Long startTime,
            Long endTime,
            Integer interval) {
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT ");
        sql.append("  toUnixTimestamp64Milli(toStartOfInterval(start_time, INTERVAL ? second)) as timestamp, ");
        sql.append("  count() as value ");
        sql.append("FROM traces ");
        sql.append("WHERE start_time >= fromUnixTimestamp64Milli(?) ");
        sql.append("  AND start_time <= fromUnixTimestamp64Milli(?) ");
        sql.append("GROUP BY timestamp ");
        sql.append("ORDER BY timestamp ASC");

        return queryList(sql.toString(), interval, startTime, endTime);
    }

    /**
     * 执行自定义 SQL 查询
     */
    public List<Map<String, Object>> executeQuery(String sql) {
        return queryList(sql);
    }
}
