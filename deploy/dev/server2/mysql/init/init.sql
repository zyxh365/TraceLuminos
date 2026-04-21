-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS trace_demo
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE trace_demo;

-- service1 指令记录表（JPA 会自动建，这里手动建也可以）
CREATE TABLE IF NOT EXISTS s1_command_record (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    vin          VARCHAR(32)  NOT NULL COMMENT '车辆VIN码',
    command_type VARCHAR(32)  NOT NULL COMMENT '指令类型',
    call_type    VARCHAR(32)  COMMENT '调用方式: RestTemplate/OpenFeign',
    trace_id     VARCHAR(64)  COMMENT 'OTel traceId，关联Jaeger',
    span_id      VARCHAR(32)  COMMENT 'OTel spanId',
    status       VARCHAR(16)  COMMENT '状态: CREATED/DISPATCHED',
    created_at   DATETIME     COMMENT '创建时间',
    INDEX idx_vin      (vin),
    INDEX idx_trace_id (trace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='service1业务层指令记录';

-- service2 处理记录表
CREATE TABLE IF NOT EXISTS s2_processed_command (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    vin          VARCHAR(32)  NOT NULL COMMENT '车辆VIN码',
    command_type VARCHAR(32)  COMMENT '指令类型',
    source       VARCHAR(32)  COMMENT '来源: http:RestTemplate / kafka:xxx',
    trace_id     VARCHAR(64)  COMMENT 'OTel traceId（和service1一致）',
    span_id      VARCHAR(32)  COMMENT 'OTel spanId',
    status       VARCHAR(16)  COMMENT '状态: PROCESSED/CONSUMED',
    processed_at DATETIME     COMMENT '处理时间',
    INDEX idx_vin      (vin),
    INDEX idx_trace_id (trace_id),
    INDEX idx_source   (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='service2核心层处理记录';

-- 验证 traceId 关联查询（通过 traceId 关联两张表，验证链路）
-- SELECT s1.id, s1.vin, s1.call_type, s1.status, s1.created_at,
--        s2.id as s2_id, s2.source, s2.status as s2_status, s2.processed_at
-- FROM s1_command_record s1
-- LEFT JOIN s2_processed_command s2 ON s1.trace_id = s2.trace_id
-- WHERE s1.trace_id = '你的traceId';
