package com.tsp.monitor.gateway.dashboard.service;

import com.tsp.monitor.gateway.analysis.service.AnalysisService;
import com.tsp.monitor.gateway.apm.service.ApmService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 监控看板服务类
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@Slf4j
@Service
public class DashboardService {

    @Resource
    private ApmService apmService;

    @Resource
    private AnalysisService analysisService;

    /**
     * 获取监控看板概览数据
     */
    public Map<String, Object> getDashboardOverview(String applicationId, Long startTime, Long endTime) {
        log.info("获取监控看板概览数据, applicationId: {}", applicationId);

        try {
            Map<String, Object> result = new HashMap<>();

            // 从华为云 APM 获取应用概览数据
            Map<String, Object> apmOverview = apmService.getApplicationOverview(applicationId);
            result.put("apmOverview", apmOverview);

            // 从 ClickHouse 获取聚合统计数据
            Map<String, Object> aggregatedStats = analysisService.getAggregatedStats(startTime, endTime);
            result.put("aggregatedStats", aggregatedStats);

            // 获取服务调用拓扑
            List<Map<String, Object>> topology = analysisService.getServiceTopology(startTime, endTime);
            result.put("topology", topology);

            // 获取时序指标数据
            List<Map<String, Object>> timeSeries = analysisService.getTimeSeriesMetrics(
                    "request_count", startTime, endTime, 300);
            result.put("timeSeries", timeSeries);

            return result;
        } catch (Exception e) {
            log.error("获取监控看板概览数据失败", e);
            throw new RuntimeException("获取监控看板概览数据失败: " + e.getMessage());
        }
    }

    /**
     * 获取应用健康度评分
     */
    public Map<String, Object> getApplicationHealthScore(String applicationId, Long startTime, Long endTime) {
        log.info("获取应用健康度评分, applicationId: {}", applicationId);

        try {
            Map<String, Object> result = new HashMap<>();

            // 获取基础指标
            Map<String, Object> stats = analysisService.getAggregatedStats(startTime, endTime);

            // 计算健康度评分
            double score = calculateHealthScore(stats);
            result.put("healthScore", score);

            // 获取错误日志
            List<Map<String, Object>> errorLogs = analysisService.getErrorLogs(startTime, endTime, 50);
            result.put("recentErrors", errorLogs);

            // 获取慢链路
            List<Map<String, Object>> slowTraces = analysisService.getSlowTraces(startTime, endTime, 2000, 50);
            result.put("slowTraces", slowTraces);

            return result;
        } catch (Exception e) {
            log.error("获取应用健康度评分失败", e);
            throw new RuntimeException("获取应用健康度评分失败: " + e.getMessage());
        }
    }

    /**
     * 获取实时监控数据
     */
    public Map<String, Object> getRealTimeData(String applicationId) {
        log.info("获取实时监控数据, applicationId: {}", applicationId);

        try {
            Map<String, Object> result = new HashMap<>();

            // 当前时间
            long endTime = System.currentTimeMillis();
            long startTime = endTime - 5 * 60 * 1000; // 最近5分钟

            // 从 APM 获取实时数据
            Map<String, Object> apmRealTimeData = apmService.getRealTimeMonitorData(applicationId);
            result.put("apmData", apmRealTimeData);

            // 从 ClickHouse 获取实时统计数据
            Map<String, Object> aggregatedStats = analysisService.getAggregatedStats(startTime, endTime);
            result.put("stats", aggregatedStats);

            // 获取最近的错误
            List<Map<String, Object>> recentErrors = analysisService.getErrorLogs(startTime, endTime, 20);
            result.put("recentErrors", recentErrors);

            return result;
        } catch (Exception e) {
            log.error("获取实时监控数据失败", e);
            throw new RuntimeException("获取实时监控数据失败: " + e.getMessage());
        }
    }

    /**
     * 获取服务监控详情
     */
    public Map<String, Object> getServiceMonitorDetail(String serviceName, Long startTime, Long endTime) {
        log.info("获取服务监控详情, serviceName: {}", serviceName);

        try {
            Map<String, Object> result = new HashMap<>();

            // 服务统计数据
            List<Map<String, Object>> serviceStats = analysisService.getServiceStats(serviceName, startTime, endTime);
            result.put("serviceStats", serviceStats);

            // 慢链路
            List<Map<String, Object>> slowTraces = analysisService.getSlowTraces(startTime, endTime, 2000, 100);
            result.put("slowTraces", slowTraces);

            // 错误日志
            List<Map<String, Object>> errorLogs = analysisService.getErrorLogs(startTime, endTime, 100);
            result.put("errorLogs", errorLogs);

            return result;
        } catch (Exception e) {
            log.error("获取服务监控详情失败", e);
            throw new RuntimeException("获取服务监控详情失败: " + e.getMessage());
        }
    }

    /**
     * 获取链路追踪详情
     */
    public Map<String, Object> getTraceMonitorDetail(String traceId, Long startTime, Long endTime) {
        log.info("获取链路追踪详情, traceId: {}", traceId);

        try {
            Map<String, Object> result = new HashMap<>();

            // 链路详情
            List<Map<String, Object>> traceDetail = analysisService.getTraceDetail(traceId, startTime, endTime);
            result.put("traceDetail", traceDetail);

            return result;
        } catch (Exception e) {
            log.error("获取链路追踪详情失败", e);
            throw new RuntimeException("获取链路追踪详情失败: " + e.getMessage());
        }
    }

    /**
     * 获取告警列表
     */
    public List<Map<String, Object>> getAlertList(Long startTime, Long endTime, Integer limit) {
        log.info("获取告警列表");

        try {
            // 这里可以从告警系统获取数据
            // 暂时返回错误日志作为告警
            return analysisService.getErrorLogs(startTime, endTime, limit);
        } catch (Exception e) {
            log.error("获取告警列表失败", e);
            throw new RuntimeException("获取告警列表失败: " + e.getMessage());
        }
    }

    /**
     * 计算健康度评分
     */
    private double calculateHealthScore(Map<String, Object> stats) {
        double score = 100.0;

        // 根据错误率扣分
        Double errorRate = (Double) stats.get("errorRate");
        if (errorRate != null) {
            score -= errorRate * 10; // 每1%错误率扣10分
        }

        // 根据平均响应时间扣分
        Double avgDuration = (Double) stats.get("avgDuration");
        if (avgDuration != null) {
            if (avgDuration > 3000) {
                score -= 20;
            } else if (avgDuration > 1000) {
                score -= 10;
            }
        }

        // 确保分数在 0-100 之间
        return Math.max(0, Math.min(100, score));
    }
}
