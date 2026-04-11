package com.tsp.monitor.gateway.apm.service;

import com.alibaba.fastjson2.JSON;
import com.tsp.monitor.gateway.apm.client.HuaweiCloudApmClient;
import com.tsp.monitor.gateway.apm.dto.ApmMetricQueryDTO;
import com.tsp.monitor.gateway.apm.dto.ApmTransactionQueryDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;

/**
 * APM 服务类
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@Slf4j
@Service
public class ApmService {

    @Resource
    private HuaweiCloudApmClient apmClient;

    /**
     * 获取应用列表
     */
    public Map<String, Object> getApplications() {
        log.info("获取应用列表");

        try {
            String result = apmClient.getApplications();
            return JSON.parseObject(result, Map.class);
        } catch (Exception e) {
            log.error("获取应用列表失败", e);
            throw new RuntimeException("获取应用列表失败: " + e.getMessage());
        }
    }

    /**
     * 获取应用概览数据
     */
    public Map<String, Object> getApplicationOverview(String applicationId) {
        log.info("获取应用概览数据, applicationId: {}", applicationId);

        try {
            // 获取最近1小时的数据
            long endTime = System.currentTimeMillis();
            long startTime = endTime - 3600 * 1000;

            ApmMetricQueryDTO queryDTO = new ApmMetricQueryDTO();
            queryDTO.setApplicationId(applicationId);
            queryDTO.setStartTime(startTime);
            queryDTO.setEndTime(endTime);

            String result = apmClient.getApplicationMetrics(queryDTO);
            return JSON.parseObject(result, Map.class);
        } catch (Exception e) {
            log.error("获取应用概览数据失败", e);
            throw new RuntimeException("获取应用概览数据失败: " + e.getMessage());
        }
    }

    /**
     * 获取应用指标数据
     */
    public Map<String, Object> getApplicationMetrics(String applicationId, Long startTime, Long endTime) {
        log.info("获取应用指标数据, applicationId: {}, startTime: {}, endTime: {}",
                applicationId, startTime, endTime);

        try {
            ApmMetricQueryDTO queryDTO = new ApmMetricQueryDTO();
            queryDTO.setApplicationId(applicationId);
            queryDTO.setStartTime(startTime);
            queryDTO.setEndTime(endTime);

            String result = apmClient.getApplicationMetrics(queryDTO);
            return JSON.parseObject(result, Map.class);
        } catch (Exception e) {
            log.error("获取应用指标数据失败", e);
            throw new RuntimeException("获取应用指标数据失败: " + e.getMessage());
        }
    }

    /**
     * 获取拓扑图数据
     */
    public Map<String, Object> getTopology(String applicationId, Long startTime, Long endTime) {
        log.info("获取拓扑图数据, applicationId: {}, startTime: {}, endTime: {}",
                applicationId, startTime, endTime);

        try {
            String result = apmClient.getTopology(applicationId, startTime, endTime);
            return JSON.parseObject(result, Map.class);
        } catch (Exception e) {
            log.error("获取拓扑图数据失败", e);
            throw new RuntimeException("获取拓扑图数据失败: " + e.getMessage());
        }
    }

    /**
     * 获取事务列表
     */
    public Map<String, Object> getTransactions(String applicationId, ApmTransactionQueryDTO queryDTO) {
        log.info("获取事务列表, applicationId: {}", applicationId);

        try {
            queryDTO.setApplicationId(applicationId);

            String result = apmClient.getTransactions(queryDTO);
            return JSON.parseObject(result, Map.class);
        } catch (Exception e) {
            log.error("获取事务列表失败", e);
            throw new RuntimeException("获取事务列表失败: " + e.getMessage());
        }
    }

    /**
     * 获取慢SQL列表
     */
    public Map<String, Object> getSlowSqls(String applicationId, Long startTime, Long endTime, Integer limit) {
        log.info("获取慢SQL列表, applicationId: {}, startTime: {}, endTime: {}, limit: {}",
                applicationId, startTime, endTime, limit);

        try {
            String result = apmClient.getSlowSqls(applicationId, startTime, endTime, limit);
            return JSON.parseObject(result, Map.class);
        } catch (Exception e) {
            log.error("获取慢SQL列表失败", e);
            throw new RuntimeException("获取慢SQL列表失败: " + e.getMessage());
        }
    }

    /**
     * 获取实时监控数据
     */
    public Map<String, Object> getRealTimeMonitorData(String applicationId) {
        log.info("获取实时监控数据, applicationId: {}", applicationId);

        try {
            // 获取最近5分钟的数据
            long endTime = System.currentTimeMillis();
            long startTime = endTime - 5 * 60 * 1000;

            Map<String, Object> result = new HashMap<>();

            // 获取基础指标
            ApmMetricQueryDTO queryDTO = new ApmMetricQueryDTO();
            queryDTO.setApplicationId(applicationId);
            queryDTO.setStartTime(startTime);
            queryDTO.setEndTime(endTime);

            String metricsResult = apmClient.getApplicationMetrics(queryDTO);
            result.put("metrics", JSON.parseObject(metricsResult));

            // 获取拓扑数据
            String topologyResult = apmClient.getTopology(applicationId, startTime, endTime);
            result.put("topology", JSON.parseObject(topologyResult));

            return result;
        } catch (Exception e) {
            log.error("获取实时监控数据失败", e);
            throw new RuntimeException("获取实时监控数据失败: " + e.getMessage());
        }
    }
}
