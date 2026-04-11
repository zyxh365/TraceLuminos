package com.tsp.monitor.gateway.apm.dto;

import lombok.Data;

/**
 * APM 事务查询 DTO
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@Data
public class ApmTransactionQueryDTO {

    /**
     * 应用ID
     */
    private String applicationId;

    /**
     * 事务名称
     */
    private String transactionName;

    /**
     * 事务类型
     */
    private String transactionType;

    /**
     * 开始时间戳（毫秒）
     */
    private Long startTime;

    /**
     * 结束时间戳（毫秒）
     */
    private Long endTime;

    /**
     * 页码
     */
    private Integer pageNo = 1;

    /**
     * 每页大小
     */
    private Integer pageSize = 20;

    /**
     * 排序字段
     */
    private String sortField;

    /**
     * 排序方向（asc/desc）
     */
    private String sortOrder = "desc";
}
