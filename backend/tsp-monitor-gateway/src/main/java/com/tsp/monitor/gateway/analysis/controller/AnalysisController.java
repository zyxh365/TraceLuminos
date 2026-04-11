package com.tsp.monitor.gateway.analysis.controller;

import com.tsp.monitor.gateway.analysis.service.AnalysisService;
import com.tsp.monitor.gateway.common.model.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.List;
import java.util.Map;

/**
 * 数据分析接口控制器
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@Slf4j
@RestController
@RequestMapping("/analysis")
public class AnalysisController {

    @Resource
    private AnalysisService analysisService;

    /**
     * 查询链路详情
     */
    @GetMapping("/traces/{traceId}")
    public Result<List<Map<String, Object>>> getTraceDetail(
            @PathVariable String traceId,
            @RequestParam Long startTime,
            @RequestParam Long endTime) {
        log.info("接收到查询链路详情请求, traceId: {}", traceId);
        List<Map<String, Object>> result = analysisService.getTraceDetail(traceId, startTime, endTime);
        return Result.success(result);
    }

    /**
     * 查询服务统计数据
     */
    @GetMapping("/services/{serviceName}/stats")
    public Result<List<Map<String, Object>>> getServiceStats(
            @PathVariable String serviceName,
            @RequestParam Long startTime,
            @RequestParam Long endTime) {
        log.info("接收到查询服务统计数据请求, serviceName: {}", serviceName);
        List<Map<String, Object>> result = analysisService.getServiceStats(serviceName, startTime, endTime);
        return Result.success(result);
    }

    /**
     * 查询慢链路列表
     */
    @GetMapping("/traces/slow")
    public Result<List<Map<String, Object>>> getSlowTraces(
            @RequestParam Long startTime,
            @RequestParam Long endTime,
            @RequestParam(defaultValue = "1000") Integer threshold,
            @RequestParam(defaultValue = "100") Integer limit) {
        log.info("接收到查询慢链路列表请求");
        List<Map<String, Object>> result = analysisService.getSlowTraces(startTime, endTime, threshold, limit);
        return Result.success(result);
    }

    /**
     * 查询错误日志
     */
    @GetMapping("/errors")
    public Result<List<Map<String, Object>>> getErrorLogs(
            @RequestParam Long startTime,
            @RequestParam Long endTime,
            @RequestParam(defaultValue = "100") Integer limit) {
        log.info("接收到查询错误日志请求");
        List<Map<String, Object>> result = analysisService.getErrorLogs(startTime, endTime, limit);
        return Result.success(result);
    }

    /**
     * 查询服务调用拓扑
     */
    @GetMapping("/topology")
    public Result<List<Map<String, Object>>> getServiceTopology(
            @RequestParam Long startTime,
            @RequestParam Long endTime) {
        log.info("接收到查询服务调用拓扑请求");
        List<Map<String, Object>> result = analysisService.getServiceTopology(startTime, endTime);
        return Result.success(result);
    }

    /**
     * 按 TraceId 或 VIN 搜索链路
     */
    @GetMapping("/traces/search")
    public Result<List<Map<String, Object>>> searchTraceIds(
            @RequestParam String keyword,
            @RequestParam(defaultValue = "traceId") String searchType,
            @RequestParam Long startTime,
            @RequestParam Long endTime,
            @RequestParam(defaultValue = "50") Integer limit) {
        log.info("接收到搜索链路请求, keyword: {}, searchType: {}", keyword, searchType);
        List<Map<String, Object>> result = analysisService.searchTraceIds(
                keyword, searchType, startTime, endTime, limit);
        return Result.success(result);
    }

    /**
     * 查询时序指标数据
     */
    @GetMapping("/metrics/timeseries")
    public Result<List<Map<String, Object>>> getTimeSeriesMetrics(
            @RequestParam String metricName,
            @RequestParam Long startTime,
            @RequestParam Long endTime,
            @RequestParam(defaultValue = "60") Integer interval) {
        log.info("接收到查询时序指标数据请求, metricName: {}", metricName);
        List<Map<String, Object>> result = analysisService.getTimeSeriesMetrics(
                metricName, startTime, endTime, interval);
        return Result.success(result);
    }

    /**
     * 执行自定义查询
     */
    @PostMapping("/query/custom")
    public Result<List<Map<String, Object>>> executeCustomQuery(@RequestBody Map<String, String> request) {
        String sql = request.get("sql");
        log.info("接收到执行自定义查询请求");

        List<Map<String, Object>> result = analysisService.executeCustomQuery(sql);
        return Result.success(result);
    }

    /**
     * 获取聚合统计数据
     */
    @GetMapping("/stats/aggregate")
    public Result<Map<String, Object>> getAggregatedStats(
            @RequestParam Long startTime,
            @RequestParam Long endTime) {
        log.info("接收到获取聚合统计数据请求");
        Map<String, Object> result = analysisService.getAggregatedStats(startTime, endTime);
        return Result.success(result);
    }

    /**
     * 启动 Flink 流处理任务
     */
    @PostMapping("/flink/job/start")
    public Result<String> startFlinkJob() {
        log.info("接收到启动 Flink 流处理任务请求");
        analysisService.startFlinkJob();
        return Result.success("Flink 流处理任务启动成功");
    }

    /**
     * 执行 Flink SQL 查询
     */
    @PostMapping("/flink/sql/execute")
    public Result<String> executeFlinkSql(@RequestBody Map<String, String> request) {
        String sql = request.get("sql");
        log.info("接收到执行 Flink SQL 请求");

        String result = analysisService.executeFlinkSql(sql);
        return Result.success(result);
    }
}
