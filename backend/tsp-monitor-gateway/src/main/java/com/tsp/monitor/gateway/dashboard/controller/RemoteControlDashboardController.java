package com.tsp.monitor.gateway.dashboard.controller;

import com.tsp.monitor.gateway.common.model.Result;
import com.tsp.monitor.gateway.dashboard.dto.RemoteControlQueryDTO;
import com.tsp.monitor.gateway.dashboard.service.RemoteControlAlertService;
import com.tsp.monitor.gateway.dashboard.service.RemoteControlDashboardService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 远控监控看板接口控制器
 *
 * @author TSP Monitor Team
 * @since 2026-04-13
 */
@Slf4j
@RestController
@RequestMapping("/dashboard/remote-control")
public class RemoteControlDashboardController {

    @Resource
    private RemoteControlDashboardService rcDashboardService;

    @Resource
    private RemoteControlAlertService rcAlertService;

    /**
     * 获取端到端指标（1.3.1）
     */
    @GetMapping("/e2e-metrics")
    public Result<Map<String, Object>> getE2EMetrics(RemoteControlQueryDTO query) {
        log.info("获取远控端到端指标");
        Map<String, Object> result = rcDashboardService.getE2EMetrics(query);
        return Result.success(result);
    }

    /**
     * 获取失败原因分析（1.3.1）
     */
    @GetMapping("/failure-analysis")
    public Result<List<Map<String, Object>>> getFailureAnalysis(RemoteControlQueryDTO query) {
        log.info("获取远控失败原因分析");
        List<Map<String, Object>> result = rcDashboardService.getFailureAnalysis(query);
        return Result.success(result);
    }

    /**
     * 获取 TSP 远控服务指标（1.3.2）
     */
    @GetMapping("/tsp-service")
    public Result<Map<String, Object>> getTspServiceMetrics(RemoteControlQueryDTO query) {
        log.info("获取 TSP 远控服务指标");
        Map<String, Object> result = rcDashboardService.getTspServiceMetrics(query);
        return Result.success(result);
    }

    /**
     * 获取 TBox 远控服务指标（1.3.3）
     */
    @GetMapping("/tbox-service")
    public Result<Map<String, Object>> getTBoxServiceMetrics(RemoteControlQueryDTO query) {
        log.info("获取 TBox 远控服务指标");
        Map<String, Object> result = rcDashboardService.getTBoxServiceMetrics(query);
        return Result.success(result);
    }

    /**
     * 获取第三方服务指标（1.3.4）
     */
    @GetMapping("/third-party")
    public Result<Map<String, Object>> getThirdPartyMetrics(RemoteControlQueryDTO query) {
        log.info("获取第三方服务指标");
        Map<String, Object> result = rcDashboardService.getThirdPartyMetrics(query);
        return Result.success(result);
    }

    /**
     * 获取车辆连接指标（1.3.5）
     */
    @GetMapping("/vehicle-connection")
    public Result<Map<String, Object>> getVehicleConnectionMetrics(RemoteControlQueryDTO query) {
        log.info("获取车辆连接指标");
        Map<String, Object> result = rcDashboardService.getVehicleConnectionMetrics(query);
        return Result.success(result);
    }

    /**
     * 获取远控告警列表
     */
    @GetMapping("/alerts")
    public Result<List<Map<String, Object>>> getAlerts(RemoteControlQueryDTO query) {
        log.info("获取远控告警列表");
        List<Map<String, Object>> result = rcAlertService.getAlerts(query);
        return Result.success(result);
    }

    /**
     * 获取远控综合概览（所有 5 大类汇总）
     */
    @GetMapping("/overview")
    public Result<Map<String, Object>> getOverview(RemoteControlQueryDTO query) {
        log.info("获取远控综合概览");

        // 如果没有传入时间范围，默认最近1小时
        if (query.getEndTime() == null) {
            query.setEndTime(System.currentTimeMillis());
        }
        if (query.getStartTime() == null) {
            query.setStartTime(query.getEndTime() - 3600 * 1000);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("e2e", rcDashboardService.getE2EMetrics(query));
        result.put("tspService", rcDashboardService.getTspServiceMetrics(query));
        result.put("tboxService", rcDashboardService.getTBoxServiceMetrics(query));
        result.put("thirdParty", rcDashboardService.getThirdPartyMetrics(query));
        result.put("vehicleConnection", rcDashboardService.getVehicleConnectionMetrics(query));
        result.put("alerts", rcAlertService.getAlerts(query));

        return Result.success(result);
    }
}
