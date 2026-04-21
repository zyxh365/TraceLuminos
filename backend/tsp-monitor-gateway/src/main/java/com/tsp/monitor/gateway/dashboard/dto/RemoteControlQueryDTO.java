package com.tsp.monitor.gateway.dashboard.dto;

import lombok.Data;

/**
 * 远控监控看板查询参数
 *
 * @author TSP Monitor Team
 * @since 2026-04-13
 */
@Data
public class RemoteControlQueryDTO {

    /**
     * 开始时间（epoch 毫秒）
     */
    private Long startTime;

    /**
     * 结束时间（epoch 毫秒）
     */
    private Long endTime;

    /**
     * 时间间隔（秒），默认 60
     */
    private Integer interval = 60;

    /**
     * 车辆 VIN（可选，按车辆筛选）
     */
    private String vin;
}
