package com.tsp.monitor.gateway.apm.controller;

import com.tsp.monitor.gateway.apm.dto.ApmMetricQueryDTO;
import com.tsp.monitor.gateway.apm.dto.ApmTransactionQueryDTO;
import com.tsp.monitor.gateway.apm.service.ApmService;
import com.tsp.monitor.gateway.common.model.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.Map;

/**
 * APM 接口控制器
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@Slf4j
@RestController
@RequestMapping("/apm")
public class ApmController {

    @Resource
    private ApmService apmService;

    /**
     * 获取应用列表
     */
    @GetMapping("/applications")
    public Result<Map<String, Object>> getApplications() {
        log.info("接收到获取应用列表请求");
        Map<String, Object> result = apmService.getApplications();
        return Result.success(result);
    }

    /**
     * 获取应用概览数据
     */
    @GetMapping("/applications/{applicationId}/overview")
    public Result<Map<String, Object>> getApplicationOverview(@PathVariable String applicationId) {
        log.info("接收到获取应用概览数据请求, applicationId: {}", applicationId);
        Map<String, Object> result = apmService.getApplicationOverview(applicationId);
        return Result.success(result);
    }

    /**
     * 获取应用指标数据
     */
    @PostMapping("/applications/{applicationId}/metrics")
    public Result<Map<String, Object>> getApplicationMetrics(
            @PathVariable String applicationId,
            @RequestBody ApmMetricQueryDTO queryDTO) {
        log.info("接收到获取应用指标数据请求, applicationId: {}", applicationId);
        Map<String, Object> result = apmService.getApplicationMetrics(
                applicationId, queryDTO.getStartTime(), queryDTO.getEndTime());
        return Result.success(result);
    }

    /**
     * 获取拓扑图数据
     */
    @GetMapping("/applications/{applicationId}/topology")
    public Result<Map<String, Object>> getTopology(
            @PathVariable String applicationId,
            @RequestParam Long startTime,
            @RequestParam Long endTime) {
        log.info("接收到获取拓扑图数据请求, applicationId: {}", applicationId);
        Map<String, Object> result = apmService.getTopology(applicationId, startTime, endTime);
        return Result.success(result);
    }

    /**
     * 获取事务列表
     */
    @PostMapping("/applications/{applicationId}/transactions")
    public Result<Map<String, Object>> getTransactions(
            @PathVariable String applicationId,
            @RequestBody ApmTransactionQueryDTO queryDTO) {
        log.info("接收到获取事务列表请求, applicationId: {}", applicationId);
        Map<String, Object> result = apmService.getTransactions(applicationId, queryDTO);
        return Result.success(result);
    }

    /**
     * 获取慢SQL列表
     */
    @GetMapping("/applications/{applicationId}/slow-sqls")
    public Result<Map<String, Object>> getSlowSqls(
            @PathVariable String applicationId,
            @RequestParam Long startTime,
            @RequestParam Long endTime,
            @RequestParam(required = false, defaultValue = "100") Integer limit) {
        log.info("接收到获取慢SQL列表请求, applicationId: {}", applicationId);
        Map<String, Object> result = apmService.getSlowSqls(applicationId, startTime, endTime, limit);
        return Result.success(result);
    }

    /**
     * 获取实时监控数据
     */
    @GetMapping("/applications/{applicationId}/realtime")
    public Result<Map<String, Object>> getRealTimeMonitorData(@PathVariable String applicationId) {
        log.info("接收到获取实时监控数据请求, applicationId: {}", applicationId);
        Map<String, Object> result = apmService.getRealTimeMonitorData(applicationId);
        return Result.success(result);
    }
}
