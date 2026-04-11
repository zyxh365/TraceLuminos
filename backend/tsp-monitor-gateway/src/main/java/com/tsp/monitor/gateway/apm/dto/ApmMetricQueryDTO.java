package com.tsp.monitor.gateway.apm.dto;

import lombok.Data;

import java.util.List;

/**
 * APM 指标查询 DTO
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@Data
public class ApmMetricQueryDTO {

    /**
     * 应用ID
     */
    private String applicationId;

    /**
     * 指标名称列表
     */
    private List<String> metricNames;

    /**
     * 开始时间戳（毫秒）
     */
    private Long startTime;

    /**
     * 结束时间戳（毫秒）
     */
    private Long endTime;

    /**
     * 聚合周期（秒）
     */
    private Integer period = 60;

    /**
     * 维度
     */
    private String dimension;

    /**
     * 过滤条件
     */
    private String filter;
}
