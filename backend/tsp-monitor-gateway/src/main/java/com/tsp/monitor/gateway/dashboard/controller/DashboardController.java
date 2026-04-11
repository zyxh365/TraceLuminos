package com.tsp.monitor.gateway.dashboard.controller;

import com.tsp.monitor.gateway.common.model.Result;
import com.tsp.monitor.gateway.dashboard.service.DashboardService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.List;
import java.util.Map;

/**
 * 监控看板接口控制器
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@Slf4j
@RestController
@RequestMapping("/dashboard")
public class DashboardController {

    @Resource
    private DashboardService dashboardService;

    /**
     * 获取监控看板概览数据
     */
    @GetMapping("/overview")
    public Result<Map<String, Object>> getDashboardOverview(
            @RequestParam String applicationId,
            @RequestParam Long startTime,
            @RequestParam Long endTime) {
        log.info("接收到获取监控看板概览数据请求, applicationId: {}", applicationId);
        Map<String, Object> result = dashboardService.getDashboardOverview(applicationId, startTime, endTime);
        return Result.success(result);
    }

    /**
     * 获取应用健康度评分
     */
    @GetMapping("/applications/{applicationId}/health")
    public Result<Map<String, Object>> getApplicationHealthScore(
            @PathVariable String applicationId,
            @RequestParam Long startTime,
            @RequestParam Long endTime) {
        log.info("接收到获取应用健康度评分请求, applicationId: {}", applicationId);
        Map<String, Object> result = dashboardService.getApplicationHealthScore(applicationId, startTime, endTime);
        return Result.success(result);
    }

    /**
     * 获取实时监控数据
     */
    @GetMapping("/realtime")
    public Result<Map<String, Object>> getRealTimeData(@RequestParam String applicationId) {
        log.info("接收到获取实时监控数据请求, applicationId: {}", applicationId);
        Map<String, Object> result = dashboardService.getRealTimeData(applicationId);
        return Result.success(result);
    }

    /**
     * 获取服务监控详情
     */
    @GetMapping("/services/{serviceName}/detail")
    public Result<Map<String, Object>> getServiceMonitorDetail(
            @PathVariable String serviceName,
            @RequestParam Long startTime,
            @RequestParam Long endTime) {
        log.info("接收到获取服务监控详情请求, serviceName: {}", serviceName);
        Map<String, Object> result = dashboardService.getServiceMonitorDetail(serviceName, startTime, endTime);
        return Result.success(result);
    }

    /**
     * 获取链路追踪详情
     */
    @GetMapping("/traces/{traceId}/detail")
    public Result<Map<String, Object>> getTraceMonitorDetail(
            @PathVariable String traceId,
            @RequestParam Long startTime,
            @RequestParam Long endTime) {
        log.info("接收到获取链路追踪详情请求, traceId: {}", traceId);
        Map<String, Object> result = dashboardService.getTraceMonitorDetail(traceId, startTime, endTime);
        return Result.success(result);
    }

    /**
     * 获取告警列表
     */
    @GetMapping("/alerts")
    public Result<List<Map<String, Object>>> getAlertList(
            @RequestParam Long startTime,
            @RequestParam Long endTime,
            @RequestParam(defaultValue = "50") Integer limit) {
        log.info("接收到获取告警列表请求");
        List<Map<String, Object>> result = dashboardService.getAlertList(startTime, endTime, limit);
        return Result.success(result);
    }

    /**
     * 获取综合监控大屏数据
     */
    @GetMapping("/monitor-screen")
    public Result<Map<String, Object>> getMonitorScreenData(
            @RequestParam String applicationId,
            @RequestParam(required = false) Long startTime,
            @RequestParam(required = false) Long endTime) {
        log.info("接收到获取综合监控大屏数据请求, applicationId: {}", applicationId);

        // 如果没有传入时间范围，默认最近1小时
        if (endTime == null) {
            endTime = System.currentTimeMillis();
        }
        if (startTime == null) {
            startTime = endTime - 3600 * 1000;
        }

        Map<String, Object> result = new java.util.HashMap<>();

        // 看板概览数据
        Map<String, Object> overview = dashboardService.getDashboardOverview(applicationId, startTime, endTime);
        result.put("overview", overview);

        // 健康度评分
        Map<String, Object> healthScore = dashboardService.getApplicationHealthScore(applicationId, startTime, endTime);
        result.put("healthScore", healthScore);

        // 告警列表
        List<Map<String, Object>> alerts = dashboardService.getAlertList(startTime, endTime, 20);
        result.put("alerts", alerts);

        return Result.success(result);
    }
}
