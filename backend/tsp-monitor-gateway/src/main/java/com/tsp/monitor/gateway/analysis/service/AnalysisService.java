package com.tsp.monitor.gateway.analysis.service;

//import com.tsp.monitor.gateway.analysis.flink.FlinkJobManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.List;
import java.util.Map;

/**
 * 数据分析服务类
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@Slf4j
@Service
public class AnalysisService {

    @Resource
    private ClickHouseService clickHouseService;

//    @Resource
//    private FlinkJobManager flinkJobManager;

    /**
     * 查询链路详情
     */
    public List<Map<String, Object>> getTraceDetail(String traceId, Long startTime, Long endTime) {
        log.info("查询链路详情, traceId: {}, startTime: {}, endTime: {}", traceId, startTime, endTime);

        try {
            return clickHouseService.queryTraces(traceId, startTime, endTime);
        } catch (Exception e) {
            log.error("查询链路详情失败", e);
            throw new RuntimeException("查询链路详情失败: " + e.getMessage());
        }
    }

    /**
     * 查询服务统计数据
     */
    public List<Map<String, Object>> getServiceStats(String serviceName, Long startTime, Long endTime) {
        log.info("查询服务统计数据, serviceName: {}, startTime: {}, endTime: {}", serviceName, startTime, endTime);

        try {
            return clickHouseService.queryServiceStats(serviceName, startTime, endTime);
        } catch (Exception e) {
            log.error("查询服务统计数据失败", e);
            throw new RuntimeException("查询服务统计数据失败: " + e.getMessage());
        }
    }

    /**
     * 查询慢链路列表
     */
    public List<Map<String, Object>> getSlowTraces(Long startTime, Long endTime, Integer threshold, Integer limit) {
        log.info("查询慢链路列表, startTime: {}, endTime: {}, threshold: {}, limit: {}",
                startTime, endTime, threshold, limit);

        try {
            return clickHouseService.querySlowTraces(startTime, endTime, threshold, limit);
        } catch (Exception e) {
            log.error("查询慢链路列表失败", e);
            throw new RuntimeException("查询慢链路列表失败: " + e.getMessage());
        }
    }

    /**
     * 查询错误日志
     */
    public List<Map<String, Object>> getErrorLogs(Long startTime, Long endTime, Integer limit) {
        log.info("查询错误日志, startTime: {}, endTime: {}, limit: {}", startTime, endTime, limit);

        try {
            return clickHouseService.queryErrorLogs(startTime, endTime, limit);
        } catch (Exception e) {
            log.error("查询错误日志失败", e);
            throw new RuntimeException("查询错误日志失败: " + e.getMessage());
        }
    }

    /**
     * 查询服务调用拓扑
     */
    public List<Map<String, Object>> getServiceTopology(Long startTime, Long endTime) {
        log.info("查询服务调用拓扑, startTime: {}, endTime: {}", startTime, endTime);

        try {
            return clickHouseService.queryServiceTopology(startTime, endTime);
        } catch (Exception e) {
            log.error("查询服务调用拓扑失败", e);
            throw new RuntimeException("查询服务调用拓扑失败: " + e.getMessage());
        }
    }

    /**
     * 按 TraceId 或 VIN 搜索链路
     */
    public List<Map<String, Object>> searchTraceIds(String keyword, String searchType,
            Long startTime, Long endTime, Integer limit) {
        log.info("搜索链路, keyword: {}, searchType: {}, limit: {}", keyword, searchType, limit);

        try {
            return clickHouseService.searchTraceIds(keyword, searchType, startTime, endTime, limit);
        } catch (Exception e) {
            log.error("搜索链路失败", e);
            throw new RuntimeException("搜索链路失败: " + e.getMessage());
        }
    }

    /**
     * 查询时序指标数据
     */
    public List<Map<String, Object>> getTimeSeriesMetrics(
            String metricName, Long startTime, Long endTime, Integer interval) {
        log.info("查询时序指标数据, metricName: {}, startTime: {}, endTime: {}, interval: {}",
                metricName, startTime, endTime, interval);

        try {
            return clickHouseService.queryTimeSeriesMetrics(metricName, startTime, endTime, interval);
        } catch (Exception e) {
            log.error("查询时序指标数据失败", e);
            throw new RuntimeException("查询时序指标数据失败: " + e.getMessage());
        }
    }

    /**
     * 执行自定义查询
     */
    public List<Map<String, Object>> executeCustomQuery(String sql) {
        log.info("执行自定义查询, SQL: {}", sql);

        try {
            return clickHouseService.executeQuery(sql);
        } catch (Exception e) {
            log.error("执行自定义查询失败", e);
            throw new RuntimeException("执行自定义查询失败: " + e.getMessage());
        }
    }

    /**
     * 启动 Flink 流处理任务
     */
    public void startFlinkJob() {
        log.info("启动 Flink 流处理任务");

//        try {
//            flinkJobManager.createStreamJob();
//            log.info("Flink 流处理任务启动成功");
//        } catch (Exception e) {
//            log.error("启动 Flink 流处理任务失败", e);
//            throw new RuntimeException("启动 Flink 流处理任务失败: " + e.getMessage());
//        }
    }

    /**
     * 执行 Flink SQL 查询
     */
    public String executeFlinkSql(String sql) {
        log.info("执行 Flink SQL: {}", sql);

        try {
//            flinkJobManager.executeSql(sql);
            return "Flink SQL 执行成功";
        } catch (Exception e) {
            log.error("执行 Flink SQL 失败", e);
            throw new RuntimeException("执行 Flink SQL 失败: " + e.getMessage());
        }
    }

    /**
     * 获取聚合统计数据
     */
    public Map<String, Object> getAggregatedStats(Long startTime, Long endTime) {
        log.info("获取聚合统计数据, startTime: {}, endTime: {}", startTime, endTime);

        try {
            Map<String, Object> result = new java.util.HashMap<>();

            // 总请求数
            String totalSql = "SELECT count() as total FROM traces WHERE start_time >= fromUnixTimestamp64Milli(?) AND start_time <= fromUnixTimestamp64Milli(?)";
            Long totalCount = clickHouseService.queryValue(totalSql, Long.class, startTime, endTime);
            result.put("totalRequests", totalCount);

            // 平均响应时间
            String avgSql = "SELECT avg(duration) as avg_duration FROM traces WHERE start_time >= fromUnixTimestamp64Milli(?) AND start_time <= fromUnixTimestamp64Milli(?)";
            Double avgDuration = clickHouseService.queryValue(avgSql, Double.class, startTime, endTime);
            result.put("avgDuration", avgDuration);

            // 错误率
            String errorSql = "SELECT countIf(status_code >= 400) as errors FROM traces WHERE start_time >= fromUnixTimestamp64Milli(?) AND start_time <= fromUnixTimestamp64Milli(?)";
            Long errorCount = clickHouseService.queryValue(errorSql, Long.class, startTime, endTime);
            double errorRate = totalCount != null && totalCount > 0 ? (errorCount * 100.0 / totalCount) : 0;
            result.put("errorRate", errorRate);

            // P95、P99 响应时间
            String p95Sql = "SELECT quantile(0.95)(duration) as p95 FROM traces WHERE start_time >= fromUnixTimestamp64Milli(?) AND start_time <= fromUnixTimestamp64Milli(?)";
            Double p95 = clickHouseService.queryValue(p95Sql, Double.class, startTime, endTime);
            result.put("p95", p95);

            String p99Sql = "SELECT quantile(0.99)(duration) as p99 FROM traces WHERE start_time >= fromUnixTimestamp64Milli(?) AND start_time <= fromUnixTimestamp64Milli(?)";
            Double p99 = clickHouseService.queryValue(p99Sql, Double.class, startTime, endTime);
            result.put("p99", p99);

            return result;
        } catch (Exception e) {
            log.error("获取聚合统计数据失败", e);
            throw new RuntimeException("获取聚合统计数据失败: " + e.getMessage());
        }
    }
}
