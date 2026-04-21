# TSP 远控链路 TraceId 贯穿方案

## 📋 目录
- [1. 问题背景](#1-问题背景)
- [2. 问题分析](#2-问题分析)
- [3. 解决方案总览](#3-解决方案总览)
- [4. 方案一：TraceId 关联存储方案](#4-方案一traceid-关联存储方案推荐)
- [5. 方案二：Baggage 传递方案](#5-方案二baggage-传递方案)
- [6. 方案三：双写 TraceId 方案](#6-方案三双写-traceid-方案最可靠)
- [7. 方案对比](#7-方案对比)
- [8. 前端实现](#8-前端实现)
- [9. 实施建议](#9-实施建议)

---

## 1. 问题背景

### 1.1 远控链路流程

```
┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐
│   APP   │ ───> │  TSP    │ ───> │  短信   │ ───> │  TBox   │
│  用户端  │      │  平台   │      │  网关   │      │  车端   │
└─────────┘      └─────────┘      └─────────┘      └─────────┘
    │                │                │                │
    │ 1. 发送远控     │ 2. 判断TBox    │ 3. 发送唤醒     │ 4. 启动登录
    │    指令        │    在线状态     │    短信        │
    │                │                │                │
    │ traceId: tx001 │                │                │ seqNo: SEQ001
    │                │                │                │
    └────────────────┴────────────────┴────────────────┘
                         ⚠️ TraceId 断点
```

### 1.2 问题描述

在当前的远控链路中：

1. **APP端**：生成 `traceId`，发送远控指令到TSP平台
2. **TSP平台**：接收指令，检查TBox状态，如果离线则发送唤醒短信
3. **TBox端**：收到短信后启动，登录到TSP平台，此时 **原始traceId丢失**
4. **问题**：无法通过单个traceId追踪完整的远控链路，影响问题定位和性能分析

### 1.3 关键标识

| 标识 | 来源 | 作用 | 范围 |
|------|------|------|------|
| traceId | APP端 | 链路追踪唯一标识 | APP → TSP平台 |
| vin | APP端 | 车辆唯一标识 | 全链路 |
| seqNo | TBox端 | TBox登录序列号 | TBox登录后 |

---

## 2. 问题分析

### 2.1 链路断点原因

```
APP → TSP平台 ────────✂️ TraceId 断点 ────────→ TBox
      │                                      │
      │ traceId: tx001                       │ seqNo: SEQ001
      │ vin: LSAAAE1234                      │ vin: LSAAAE1234
      │                                      │
      └───────────────┬──────────────────────┘
                      │
           可以通过 VIN 关联
```

**断点原因**：
1. TBox启动后创建新的trace上下文
2. TBox无法获取APP端生成的原始traceId
3. 登录时只上报seqNo，没有携带traceId

### 2.2 关联标识分析

| 标识 | 优点 | 缺点 | 可用性 |
|------|------|------|--------|
| VIN | 全链路存在 | 不够唯一，可能有并发 | ⭐⭐⭐ |
| seqNo | TBox登录时唯一 | 需要TBox配合 | ⭐⭐⭐⭐ |
| traceId | 唯一标识链路 | 无法传递到TBox | ⭐⭐⭐⭐⭐ |
| 时间窗口 | 可以辅助查询 | 精度低，易误判 | ⭐⭐ |

### 2.3 关联可行性

**VIN + seqNo + 时间窗口** 组合可以实现高可靠度的关联：

```sql
-- 通过 VIN + 时间窗口 + seqNo 查询关联的 traceId
SELECT trace_id, vin, create_time
FROM trace_association
WHERE vin = 'LSAAAE1234'
  AND seq_no = 'SEQ001'
  AND create_time >= NOW() - INTERVAL 30 MINUTE;
```

---

## 3. 解决方案总览

### 3.1 方案分类

```
┌─────────────────────────────────────────────────────────┐
│               TraceId 贯穿解决方案                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │  方案一：关联存储方案 (推荐)                        │ │
│  │  ├─ 核心思想：数据库存储关联关系                    │ │
│  │  ├─ 优点：可靠、灵活、易实现                        │ │
│  │  ├─ 缺点：需要数据库、有存储开销                    │ │
│  │  └─ 适用：生产环境、高可靠要求                      │ │
│  └───────────────────────────────────────────────────┘ │
│                                                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │  方案二：Baggage 传递方案                           │ │
│  │  ├─ 核心思想：利用 OpenTelemetry Baggage           │ │
│  │  ├─ 优点：符合标准、无需额外存储                    │ │
│  │  ├─ 缺点：需要协议改造、有丢失风险                  │ │
│  │  └─ 适用：协议改造、标准化场景                      │ │
│  └───────────────────────────────────────────────────┘ │
│                                                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │  方案三：双写 TraceId 方案 (最可靠)                │ │
│  │  ├─ 核心思想：TBox 同时上报两个 traceId            │ │
│  │  ├─ 优点：最可靠、查询简单                          │ │
│  │  ├─ 缺点：需要 TBox 改造                            │ │
│  │  └─ 适用：TBox 可改造、高可靠要求                  │ │
│  └───────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3.2 方案选型建议

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 生产环境、高可靠 | 方案一或方案三 | 可靠性高 |
| 快速实施、低改动 | 方案一 | 改动最小 |
| 标准化、协议改造 | 方案二 | 符合标准 |
| TBox 可改造 | 方案三 | 最可靠 |

---

## 4. 方案一：TraceId 关联存储方案（推荐）

### 4.1 方案概述

**核心思想**：在TSP平台建立关联表，存储 `traceId`、`vin`、`seqNo` 的映射关系。

```
APP → TSP平台 (存储关联关系) → 短信 → TBox (登录) → TSP平台 (关联seqNo)
                                      │
                                      上报 seqNo, VIN
```

### 4.2 数据库设计

#### 关联表结构

```sql
-- TraceId 关联表
CREATE TABLE trace_association (
    -- 主键
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',

    -- 链路标识
    trace_id VARCHAR(64) NOT NULL COMMENT '原始TraceId (从APP来)',
    parent_span_id VARCHAR(64) COMMENT '父SpanID',
    span_id VARCHAR(64) NOT NULL COMMENT '当前SpanID',

    -- 车辆信息
    vin VARCHAR(17) NOT NULL COMMENT '车架号',
    seq_no VARCHAR(64) COMMENT 'TBox登录seqNo',

    -- 业务信息
    command_type VARCHAR(32) COMMENT '远控指令类型 (DOOR_UNLOCK等)',
    command_id VARCHAR(64) COMMENT '指令ID',

    -- 状态信息
    status TINYINT DEFAULT 0 COMMENT '状态: 0-待关联 1-已关联 2-已完成 3-已过期',
    link_type VARCHAR(32) COMMENT '关联类型: seq_no, baggage, direct',

    -- 时间信息
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    expire_time DATETIME COMMENT '过期时间 (默认24小时)',
    completed_time DATETIME COMMENT '完成时间',

    -- 性能信息
    total_duration INT COMMENT '总耗时 (毫秒)',
    tbox_wake_duration INT COMMENT 'TBox唤醒耗时 (毫秒)',

    -- 异常信息
    error_code VARCHAR(32) COMMENT '错误码',
    error_message VARCHAR(512) COMMENT '错误信息',

    -- 索引
    INDEX idx_trace_id (trace_id),
    INDEX idx_vin (vin),
    INDEX idx_seq_no (seq_no),
    INDEX idx_status (status),
    INDEX idx_create_time (create_time),
    INDEX idx_vin_seq_no (vin, seq_no),
    INDEX idx_vin_create_time (vin, create_time)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='TraceId关联表';

-- 分区表 (可选，用于大数据量场景)
ALTER TABLE trace_association
PARTITION BY RANGE (TO_DAYS(create_time)) (
    PARTITION p20260411 VALUES LESS THAN (TO_DAYS('2026-04-12')),
    PARTITION p20260412 VALUES LESS THAN (TO_DAYS('2026-04-13')),
    -- ... 按天分区
    PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

#### ClickHouse 表设计 (可选)

```sql
-- ClickHouse 适合大规模查询分析
CREATE TABLE otel_traces.trace_association ON CLUSTER '{cluster}' (
    trace_id String,
    parent_span_id String,
    span_id String,
    vin String,
    seq_no String,
    command_type String,
    command_id String,
    status UInt8,
    link_type String,
    create_time DateTime,
    update_time DateTime,
    expire_time DateTime,
    completed_time DateTime,
    total_duration UInt32,
    tbox_wake_duration UInt32,
    error_code String,
    error_message String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(create_time)
ORDER BY (vin, create_time, trace_id)
TTL create_time + INTERVAL 90 DAY;

-- 创建物化视图加速查询
CREATE MATERIALIZED VIEW trace_association_daily_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(create_time)
ORDER BY (toDate(create_time), vin)
AS SELECT
    toDate(create_time) as date,
    vin,
    command_type,
    status,
    count() as total_count,
    avg(total_duration) as avg_duration,
    countIf(status = 2) as success_count,
    countIf(status != 2) as fail_count
FROM trace_association
GROUP BY date, vin, command_type, status;
```

### 4.3 核心代码实现

#### 4.3.1 实体类定义

```java
package com.tsp.trace.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * TraceId 关联实体
 */
@Data
public class TraceAssociation {
    /** 主键ID */
    private Long id;

    /** 原始TraceId (从APP来) */
    private String traceId;

    /** 父SpanID */
    private String parentSpanId;

    /** 当前SpanID */
    private String spanId;

    /** 车架号 */
    private String vin;

    /** TBox登录seqNo */
    private String seqNo;

    /** 远控指令类型 */
    private String commandType;

    /** 指令ID */
    private String commandId;

    /** 状态: 0-待关联 1-已关联 2-已完成 3-已过期 */
    private Integer status;

    /** 关联类型: seq_no, baggage, direct */
    private String linkType;

    /** 创建时间 */
    private LocalDateTime createTime;

    /** 更新时间 */
    private LocalDateTime updateTime;

    /** 过期时间 */
    private LocalDateTime expireTime;

    /** 完成时间 */
    private LocalDateTime completedTime;

    /** 总耗时 (毫秒) */
    private Integer totalDuration;

    /** TBox唤醒耗时 (毫秒) */
    private Integer tboxWakeDuration;

    /** 错误码 */
    private String errorCode;

    /** 错误信息 */
    private String errorMessage;
}
```

#### 4.3.2 Mapper 接口

```java
package com.tsp.trace.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.tsp.trace.entity.TraceAssociation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

/**
 * TraceId 关联 Mapper
 */
@Mapper
public interface TraceAssociationMapper extends BaseMapper<TraceAssociation> {

    /**
     * 根据 VIN 查询待关联的记录
     */
    @Select("SELECT * FROM trace_association " +
            "WHERE vin = #{vin} " +
            "  AND status = 0 " +
            "  AND expire_time > NOW() " +
            "ORDER BY create_time DESC " +
            "LIMIT 1")
    TraceAssociation findPendingByVin(@Param("vin") String vin);

    /**
     * 根据 seqNo 查询关联记录
     */
    @Select("SELECT * FROM trace_association " +
            "WHERE seq_no = #{seqNo} " +
            "  AND status IN (1, 2) " +
            "  AND expire_time > NOW()")
    TraceAssociation findBySeqNo(@Param("seqNo") String seqNo);

    /**
     * 根据 traceId 查询关联记录
     */
    @Select("SELECT * FROM trace_association " +
            "WHERE trace_id = #{traceId} " +
            "  AND expire_time > NOW() " +
            "ORDER BY create_time DESC")
    List<TraceAssociation> findByTraceId(@Param("traceId") String traceId);

    /**
     * 查询 VIN 在时间窗口内的待关联记录
     */
    @Select("SELECT * FROM trace_association " +
            "WHERE vin = #{vin} " +
            "  AND status = 0 " +
            "  AND create_time >= #{startTime} " +
            "  AND create_time <= #{endTime} " +
            "ORDER BY create_time DESC")
    List<TraceAssociation> findPendingByVinAndTimeWindow(
        @Param("vin") String vin,
        @Param("startTime") LocalDateTime startTime,
        @Param("endTime") LocalDateTime endTime
    );

    /**
     * 批量清理过期记录
     */
    @Select("UPDATE trace_association " +
            "SET status = 3 " +
            "WHERE expire_time < NOW() " +
            "  AND status != 3")
    int cleanExpiredRecords();
}
```

#### 4.3.3 核心服务实现

```java
package com.tsp.trace.service;

import com.tsp.trace.entity.TraceAssociation;
import com.tsp.trace.mapper.TraceAssociationMapper;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanContext;
import io.opentelemetry.api.trace.SpanBuilder;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Context;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 远控链路追踪服务
 */
@Slf4j
@Service
public class RemoteControlTraceService {

    @Autowired
    private TraceAssociationMapper traceAssociationMapper;

    @Autowired
    private Tracer tracer;

    /**
     * 场景1：接收APP远控指令，建立关联关系
     */
    @Transactional(rollbackFor = Exception.class)
    public void handleRemoteCommand(String vin, String commandType, String commandId) {
        // 获取当前 traceId
        Span currentSpan = Span.current();
        String traceId = currentSpan.getSpanContext().getTraceId();
        String spanId = currentSpan.getSpanContext().getSpanId();

        // 存储关联关系
        TraceAssociation entity = new TraceAssociation();
        entity.setTraceId(traceId);
        entity.setSpanId(spanId);
        entity.setParentSpanId(currentSpan.getParentSpanContext() != null ?
            currentSpan.getParentSpanContext().getSpanId() : null);
        entity.setVin(vin);
        entity.setCommandType(commandType);
        entity.setCommandId(commandId);
        entity.setStatus(0); // 待关联
        entity.setLinkType("seq_no");
        entity.setExpireTime(LocalDateTime.now().plusHours(24));
        entity.setCreateTime(LocalDateTime.now());

        traceAssociationMapper.insert(entity);

        log.info("远控指令关联关系已创建: traceId={}, vin={}, command={}",
            traceId, vin, commandType);

        // 后续业务处理...
    }

    /**
     * 场景2：TBox登录时关联 seqNo
     */
    @Transactional(rollbackFor = Exception.class)
    public void handleTBoxLogin(String vin, String seqNo) {
        // 查找待关联的记录
        TraceAssociation association = traceAssociationMapper.findPendingByVin(vin);

        if (association == null) {
            log.warn("未找到待关联的TraceId记录: vin={}, seqNo={}", vin, seqNo);
            // 尝试时间窗口匹配
            association = findAssociationByTimeWindow(vin, seqNo);
        }

        if (association != null) {
            // 更新关联关系
            association.setSeqNo(seqNo);
            association.setStatus(1); // 已关联
            association.setUpdateTime(LocalDateTime.now());
            traceAssociationMapper.updateById(association);

            log.info("TraceId关联成功: vin={}, seqNo={}, traceId={}",
                vin, seqNo, association.getTraceId());

            // 创建关联的 Span
            createLinkedSpan(association);

        } else {
            log.warn("无法关联TraceId: vin={}, seqNo={}", vin, seqNo);
        }
    }

    /**
     * 使用时间窗口匹配关联记录
     */
    private TraceAssociation findAssociationByTimeWindow(String vin, String seqNo) {
        LocalDateTime endTime = LocalDateTime.now();
        LocalDateTime startTime = endTime.minusMinutes(30); // 30分钟窗口

        List<TraceAssociation> associations = traceAssociationMapper
            .findPendingByVinAndTimeWindow(vin, startTime, endTime);

        // 取最近的一条
        return associations.isEmpty() ? null : associations.get(0);
    }

    /**
     * 创建关联的 Span
     */
    private void createLinkedSpan(TraceAssociation association) {
        String originalTraceId = association.getTraceId();

        // 方式1: 使用 Span Links
        SpanContext linkedContext = SpanContext.createFromRemoteParent(
            originalTraceId,
            association.getParentSpanId(),
            // traceFlags, traceState 等
        );

        SpanBuilder spanBuilder = tracer.spanBuilder("tbox.login")
            .addLink(linkedContext);

        Span span = spanBuilder.startSpan();

        // 设置属性
        span.setAttribute("linked.trace.id", originalTraceId);
        span.setAttribute("vin", association.getVin());
        span.setAttribute("seq.no", association.getSeqNo());

        span.end();
    }

    /**
     * 场景3：TBox执行完成，更新状态
     */
    @Transactional(rollbackFor = Exception.class)
    public void handleTBoxCommandComplete(String vin, String seqNo,
                                          boolean success, String errorCode) {
        TraceAssociation association = traceAssociationMapper.findBySeqNo(seqNo);

        if (association != null) {
            association.setStatus(success ? 2 : 4); // 2-已完成 4-失败
            association.setCompletedTime(LocalDateTime.now());
            association.setErrorCode(errorCode);

            if (!success) {
                association.setErrorMessage("TBox指令执行失败");
            }

            traceAssociationMapper.updateById(association);

            log.info("远控指令完成: vin={}, seqNo={}, success={}",
                vin, seqNo, success);
        }
    }

    /**
     * 根据 TraceId 查询完整的关联信息
     */
    public List<TraceAssociation> getLinkedTraces(String traceId) {
        return traceAssociationMapper.findByTraceId(traceId);
    }

    /**
     * 根据 VIN 查询历史记录
     */
    public List<TraceAssociation> getTracesByVin(String vin, int days) {
        LocalDateTime startTime = LocalDateTime.now().minusDays(days);
        // 实现查询逻辑
        return null;
    }
}
```

#### 4.3.4 Controller 接口

```java
package com.tsp.trace.controller;

import com.tsp.trace.entity.TraceAssociation;
import com.tsp.trace.service.RemoteControlTraceService;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 远控链路追踪 API
 */
@Slf4j
@RestController
@RequestMapping("/api/trace/remote-control")
public class RemoteControlTraceController {

    @Autowired
    private RemoteControlTraceService traceService;

    @Autowired
    private Tracer tracer;

    /**
     * 接收远控指令
     */
    @PostMapping("/command")
    public String receiveCommand(
            @RequestParam String vin,
            @RequestParam String commandType,
            @RequestParam String commandId) {

        Span span = tracer.spanBuilder("remote.control.receive")
            .startSpan();

        try {
            traceService.handleRemoteCommand(vin, commandType, commandId);
            return "OK";
        } finally {
            span.end();
        }
    }

    /**
     * TBox 登录
     */
    @PostMapping("/tbox/login")
    public String tboxLogin(
            @RequestParam String vin,
            @RequestParam String seqNo) {

        traceService.handleTBoxLogin(vin, seqNo);
        return "OK";
    }

    /**
     * TBox 指令完成
     */
    @PostMapping("/tbox/complete")
    public String tboxComplete(
            @RequestParam String vin,
            @RequestParam String seqNo,
            @RequestParam boolean success,
            @RequestParam(required = false) String errorCode) {

        traceService.handleTBoxCommandComplete(vin, seqNo, success, errorCode);
        return "OK";
    }

    /**
     * 查询关联链路
     */
    @GetMapping("/linked/{traceId}")
    public List<TraceAssociation> getLinkedTraces(@PathVariable String traceId) {
        return traceService.getLinkedTraces(traceId);
    }

    /**
     * 根据 VIN 查询历史
     */
    @GetMapping("/by-vin/{vin}")
    public List<TraceAssociation> getTracesByVin(
            @PathVariable String vin,
            @RequestParam(defaultValue = "7") int days) {
        return traceService.getTracesByVin(vin, days);
    }
}
```

### 4.4 时序图

```
sequenceDiagram
    participant App as APP
    participant TSP as TSP平台
    participant DB as 关联数据库
    participant SMS as 短信网关
    participant TBox as TBox

    App->>TSP: 远控指令(traceId=tx001, vin=LV123)
    activate TSP

    TSP->>DB: INSERT关联关系(traceId, vin, status=0)
    DB-->>TSP: 插入成功

    TSP->>TSP: 检查TBox状态
    alt TBox在线
        TSP->>TBox: 直接下发指令
    else TBox离线
        TSP->>SMS: 发送唤醒短信
        SMS-->>TBox: 短信送达
    end

    deactivate TSP

    Note over TBox: TBox启动并登录

    TBox->>TSP: 登录请求(seqNo=seq001, vin=LV123)
    activate TSP

    TSP->>DB: 查询待关联记录
    DB-->>TSP: 返回关联关系

    TSP->>DB: UPDATE关联关系(seqNo, status=1)

    TSP->>TSP: 创建关联Span(Links)

    TSP->>TBox: 下发指令(携带traceId)

    TBox->>TSP: 上报执行结果

    TSP->>DB: UPDATE状态(status=2)
    deactivate TSP
```

---

## 5. 方案二：Baggage 传递方案

### 5.1 方案概述

**核心思想**：利用 OpenTelemetry 的 Baggage 机制，在跨服务调用时传递 traceId。

```
APP (设置Baggage) → TSP平台 (转发) → 短信网关 → TBox (恢复traceId)
```

### 5.2 Baggage 基础知识

**Baggage 特点**：
- 自动传播到下游服务
- 跨进程、跨服务传递
- 适合传递业务上下文

**使用场景**：
```java
// 设置 Baggage
Baggage baggage = Baggage.builder()
    .put("original.trace.id", "tx1234567890")
    .put("vin", "LSAAAE1234")
    .build();

Baggage.current().toBuilder()
    .put("key", "value")
    .build()
    .makeCurrent();
```

### 5.3 核心代码实现

#### 5.3.1 APP端：设置Baggage

```java
package com.tsp.app.service;

import io.opentelemetry.api.baggage.Baggage;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Scope;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * APP端：发送远控指令
 */
@Slf4j
@Service
public class AppRemoteControlService {

    @Autowired
    private Tracer tracer;

    @Autowired
    private RestTemplate restTemplate;

    /**
     * 发送远控指令
     */
    public void sendRemoteCommand(String vin, String command) {
        Span span = tracer.spanBuilder("app.remote.command")
            .startSpan();

        try (Scope scope = span.makeCurrent()) {
            // 设置 Baggage
            Baggage baggage = Baggage.current().toBuilder()
                .put("original.trace.id", span.getSpanContext().getTraceId())
                .put("vin", vin)
                .put("command.type", command)
                .build();

            baggage.makeCurrent();

            log.info("Baggage已设置: traceId={}, vin={}",
                span.getSpanContext().getTraceId(), vin);

            // 调用TSP平台
            restTemplate.postForEntity(
                "http://tsp-platform/api/remote/control",
                new RemoteCommandRequest(vin, command),
                String.class
            );

        } finally {
            span.end();
        }
    }
}
```

#### 5.3.2 TSP平台：转发Baggage

```java
package com.tsp.platform.service;

import io.opentelemetry.api.baggage.Baggage;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

/**
 * TSP平台：处理远控指令
 */
@Slf4j
@Service
public class TspRemoteControlService {

    @Autowired
    private Tracer tracer;

    @Autowired
    private StringRedisTemplate redisTemplate;

    /**
     * 接收远控指令
     */
    public void handleRemoteCommand(String vin, String command) {
        Span span = tracer.spanBuilder("tsp.receive.command")
            .startSpan();

        try {
            // 获取 Baggage
            Baggage baggage = Baggage.current();
            String originalTraceId = baggage.getEntryValue("original.trace.id");
            String baggageVin = baggage.getEntryValue("vin");

            log.info("接收到Baggage: traceId={}, vin={}", originalTraceId, baggageVin);

            // 持久化到 Redis (TBox登录时使用)
            String redisKey = "tbox:pending:" + vin;
            redisTemplate.opsForValue().set(
                redisKey,
                originalTraceId,
                24,
                TimeUnit.HOURS
            );

            // 后续业务处理...

        } finally {
            span.end();
        }
    }
}
```

#### 5.3.3 TBox登录：恢复traceId

```java
package com.tsp.platform.service;

import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanContext;
import io.opentelemetry.api.trace.SpanBuilder;
import io.opentelemetry.api.trace.Tracer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * TBox登录处理
 */
@Slf4j
@Service
public class TBoxLoginService {

    @Autowired
    private Tracer tracer;

    @Autowired
    private StringRedisTemplate redisTemplate;

    /**
     * 处理TBox登录
     */
    public void handleTBoxLogin(String vin, String seqNo) {
        // 从Redis获取原始traceId
        String redisKey = "tbox:pending:" + vin;
        String originalTraceId = redisTemplate.opsForValue().get(redisKey);

        if (originalTraceId != null) {
            log.info("恢复原始traceId: vin={}, traceId={}", vin, originalTraceId);

            // 使用原始traceId创建Span
            SpanContext parentContext = SpanContext.createFromRemoteParent(
                originalTraceId,
                // 其他参数...
            );

            SpanBuilder spanBuilder = tracer.spanBuilder("tbox.login")
                .setParent(Context.current().with(parentContext));

            Span span = spanBuilder.startSpan();

            try {
                // TBox登录处理...
            } finally {
                span.end();
            }

            // 清理Redis
            redisTemplate.delete(redisKey);

        } else {
            log.warn("未找到原始traceId: vin={}", vin);
            // 创建新的Span
            Span span = tracer.spanBuilder("tbox.login").startSpan();
            // ...
            span.end();
        }
    }
}
```

### 5.4 优缺点分析

**优点**：
- 符合 OpenTelemetry 标准
- 无需额外数据库存储
- 自动传播，代码简洁

**缺点**：
- 依赖协议改造（HTTP Header需要支持Baggage）
- 有丢失风险（如果中间件不支持）
- Redis 有过期风险

---

## 6. 方案三：双写 TraceId 方案（最可靠）

### 6.1 方案概述

**核心思想**：TSP平台下发指令时携带原始traceId，TBox登录时同时上报两个traceId。

```
APP → TSP平台 (存储traceId) → TBox (携带traceId) → TBox (上报两个traceId)
```

### 6.2 协议改造

#### 6.2.1 TSP平台 → TBox 指令协议

```json
{
  "command": "DOOR_UNLOCK",
  "vin": "LSAAAE12345678901",
  "commandId": "CMD-20260411-001",
  "timestamp": 1681234567890,
  "traceContext": {
    "originalTraceId": "tx1234567890abcdef",
    "parentSpanId": "span1234567890",
    "traceFlags": "01"
  }
}
```

#### 6.2.2 TBox → TSP平台 登录协议

```json
{
  "vin": "LSAAAE12345678901",
  "seqNo": "SEQ001",
  "loginTime": 1681234567890,
  "traceContext": {
    "originalTraceId": "tx1234567890abcdef",
    "currentTraceId": "tx9876543210fedcba"
  }
}
```

### 6.3 核心代码实现

#### 6.3.1 TSP平台：下发指令

```java
package com.tsp.platform.service;

import io.opentelemetry.api.trace.Span;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.util.Map;

/**
 * TSP平台：下发指令给TBox
 */
@Slf4j
@Service
public class TspCommandService {

    /**
     * 下发指令给TBox
     */
    public void sendCommandToTBox(String vin, String command) {
        Span currentSpan = Span.current();

        // 构建指令
        TBoxCommand tboxCommand = new TBoxCommand();
        tboxCommand.setCommand(command);
        tboxCommand.setVin(vin);
        tboxCommand.setCommandId(generateCommandId());

        // 携带 traceContext
        TraceContext traceContext = new TraceContext();
        traceContext.setOriginalTraceId(currentSpan.getSpanContext().getTraceId());
        traceContext.setParentSpanId(currentSpan.getSpanContext().getSpanId());
        traceContext.setTraceFlags("01");

        tboxCommand.setTraceContext(traceContext);

        // 下发给TBox
        tboxClient.sendCommand(tboxCommand);

        log.info("指令已下发: vin={}, command={}, originalTraceId={}",
            vin, command, traceContext.getOriginalTraceId());
    }
}
```

#### 6.3.2 TBox：接收指令并保存

```java
package com.tbox.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * TBox：接收指令
 */
@Slf4j
@Service
public class TBoxCommandService {

    /**
     * 接收TSP平台指令
     */
    public void receiveCommand(TBoxCommand command) {
        // 保存原始traceId
        String originalTraceId = command.getTraceContext().getOriginalTraceId();

        // 存储到本地 (用于后续上报)
        localTraceStore.save(originalTraceId, command.getCommandId());

        log.info("接收指令: command={}, originalTraceId={}",
            command.getCommand(), originalTraceId);

        // 执行指令...
    }
}
```

#### 6.3.3 TBox：登录时上报两个traceId

```java
package com.tbox.service;

import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * TBox：登录服务
 */
@Slf4j
@Service
public class TBoxLoginService {

    @Autowired
    private Tracer tracer;

    @Autowired
    private LocalTraceStore traceStore;

    /**
     * 登录到TSP平台
     */
    public void loginToTSP(String vin, String seqNo) {
        Span currentSpan = tracer.spanBuilder("tbox.login").startSpan();

        try {
            String currentTraceId = currentSpan.getSpanContext().getTraceId();

            // 获取原始traceId (如果有)
            String originalTraceId = traceStore.getLatest(vin);

            // 构建登录请求
            TBoxLoginRequest loginRequest = new TBoxLoginRequest();
            loginRequest.setVin(vin);
            loginRequest.setSeqNo(seqNo);

            // 上报两个traceId
            TraceContext traceContext = new TraceContext();
            traceContext.setOriginalTraceId(originalTraceId);
            traceContext.setCurrentTraceId(currentTraceId);

            loginRequest.setTraceContext(traceContext);

            // 发送登录请求
            tspClient.login(loginRequest);

            log.info("登录成功: vin={}, seqNo={}, originalTraceId={}, currentTraceId={}",
                vin, seqNo, originalTraceId, currentTraceId);

        } finally {
            currentSpan.end();
        }
    }
}
```

#### 6.3.4 TSP平台：处理登录并关联

```java
package com.tsp.platform.service;

import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanContext;
import io.opentelemetry.api.trace.Tracer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * TSP平台：处理TBox登录
 */
@Slf4j
@Service
public class TspTBoxLoginHandler {

    @Autowired
    private Tracer tracer;

    /**
     * 处理TBox登录
     */
    public void handleTBoxLogin(TBoxLoginRequest request) {
        String originalTraceId = request.getTraceContext().getOriginalTraceId();
        String currentTraceId = request.getTraceContext().getCurrentTraceId();
        String vin = request.getVin();
        String seqNo = request.getSeqNo();

        log.info("TBox登录: vin={}, seqNo={}, originalTraceId={}, currentTraceId={}",
            vin, seqNo, originalTraceId, currentTraceId);

        if (originalTraceId != null && !originalTraceId.isEmpty()) {
            // 使用原始traceId创建Span
            SpanContext parentContext = SpanContext.createFromRemoteParent(
                originalTraceId,
                request.getTraceContext().getParentSpanId(),
                // 其他参数...
            );

            Span span = tracer.spanBuilder("tbox.login")
                .setParent(Context.current().with(parentContext))
                .startSpan();

            try {
                // 处理登录逻辑...
            } finally {
                span.end();
            }

            // 存储关联关系
            saveAssociation(vin, seqNo, originalTraceId, currentTraceId);

        } else {
            // 创建新的Span
            Span span = tracer.spanBuilder("tbox.login").startSpan();
            // ...
            span.end();
        }
    }

    private void saveAssociation(String vin, String seqNo,
                                 String originalTraceId, String currentTraceId) {
        // 存储关联关系到数据库
        TraceAssociation association = new TraceAssociation();
        association.setVin(vin);
        association.setSeqNo(seqNo);
        association.setTraceId(originalTraceId);
        association.setLinkType("direct");
        // ...

        traceAssociationMapper.insert(association);
    }
}
```

### 6.4 协议定义

```java
/**
 * Trace上下文
 */
@Data
public class TraceContext {
    private String originalTraceId;
    private String parentSpanId;
    private String currentTraceId;
    private String traceFlags;
}

/**
 * TBox指令
 */
@Data
public class TBoxCommand {
    private String command;
    private String vin;
    private String commandId;
    private Long timestamp;
    private TraceContext traceContext;
}

/**
 * TBox登录请求
*/
@Data
public class TBoxLoginRequest {
    private String vin;
    private String seqNo;
    private Long loginTime;
    private TraceContext traceContext;
}
```

---

## 7. 方案对比

### 7.1 综合对比表

| 对比维度 | 方案一：关联存储 | 方案二：Baggage | 方案三：双写TraceId |
|---------|----------------|----------------|-------------------|
| **可靠性** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **实现难度** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **TBox改动** | 无需改动 | 无需改动 | 需要改造 |
| **存储开销** | 需要数据库 | 需要Redis | 需要数据库 |
| **查询性能** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **标准符合度** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **维护成本** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

### 7.2 选型建议

#### 选择方案一（关联存储）的场景：
- ✅ TBox 无法改造
- ✅ 需要快速实施
- ✅ 已有数据库基础设施
- ✅ 对存储开销不敏感

#### 选择方案二（Baggage）的场景：
- ✅ 正在进行协议标准化改造
- ✅ 希望符合 OpenTelemetry 标准
- ✅ 需要跨多种服务传播
- ✅ 对存储敏感

#### 选择方案三（双写TraceId）的场景：
- ✅ TBox 可以改造
- ✅ 对可靠性要求最高
- ✅ 需要最简单的查询
- ✅ 有完整的开发资源

### 7.3 混合方案（推荐生产环境）

```
┌─────────────────────────────────────────────────────────┐
│              混合方案：Baggage + 关联存储                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. APP → TSP平台：使用 Baggage 传递 traceId            │
│  2. TSP平台：存储关联关系到数据库                       │
│  3. TBox登录：优先从 Baggage 恢复，失败则查数据库        │
│  4. 查询时：优先使用关联表，确保数据完整性              │
│                                                          │
│  优点：                                                  │
│  ├─ Baggage 提供标准化的传播机制                        │
│  ├─ 关联表提供可靠的数据备份                            │
│  ├─ 双重保障，提高可靠性                                │
│  └─ 查询性能好，支持复杂分析                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 8. 前端实现

### 8.1 API 设计

```javascript
// API 端点定义
const API_ENDPOINTS = {
  // 查询关联链路
  getLinkedTraces: '/api/trace/remote-control/linked/{traceId}',

  // 通过 VIN 查询
  getByVin: '/api/trace/remote-control/by-vin/{vin}?days={days}',

  // 获取链路详情
  getTraceDetail: '/api/trace/detail/{traceId}',

  // 获取性能统计
  getPerformanceStats: '/api/trace/stats/performance?vin={vin}&days={days}'
};
```

### 8.2 React 组件实现

```javascript
/**
 * 远控链路关联组件
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Timeline, Spin, Alert } from 'antd';

function RemoteControlTraceViewer({ traceId, vin }) {
  const [viewMode, setViewMode] = useState('timeline');

  // 查询关联链路
  const { data: linkedTraces, isLoading, error } = useQuery({
    queryKey: ['linkedTraces', traceId],
    queryFn: async () => {
      const response = await fetch(
        `/api/trace/remote-control/linked/${traceId}`
      );
      return response.json();
    },
    enabled: !!traceId
  });

  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={error.message} />;

  return (
    <div className="remote-control-trace-viewer">
      {/* 视图切换 */}
      <div className="view-mode-selector">
        <button
          className={viewMode === 'timeline' ? 'active' : ''}
          onClick={() => setViewMode('timeline')}
        >
          时序图
        </button>
        <button
          className={viewMode === 'topology' ? 'active' : ''}
          onClick={() => setViewMode('topology')}
        >
          拓扑图
        </button>
      </div>

      {/* 主链路 */}
      <div className="main-trace">
        <h3>主链路 (APP → TSP)</h3>
        <TimelineView trace={linkedTraces?.mainTrace} />
      </div>

      {/* 关联标记 */}
      {linkedTraces?.linkType && (
        <div className="link-connector">
          <span className="link-badge">
            关联方式: {getLinkTypeLabel(linkedTraces.linkType)}
          </span>
          <span className="arrow-down">↓</span>
        </div>
      )}

      {/* TBox链路 */}
      {linkedTraces?.associatedTraces?.map((trace, index) => (
        <div key={trace.traceID} className="associated-trace">
          <h3>TBox链路 #{index + 1}</h3>
          <TimelineView trace={trace} highlight />
        </div>
      ))}
    </div>
  );
}

/**
 * 获取关联类型标签
 */
function getLinkTypeLabel(linkType) {
  const labels = {
    'seq_no': 'SeqNo关联',
    'baggage': 'Baggage传递',
    'direct': '直接关联'
  };
  return labels[linkType] || linkType;
}

export default RemoteControlTraceViewer;
```

### 8.3 关联链路渲染

```javascript
/**
 * 时序图视图
 */
function TimelineView({ trace, highlight = false }) {
  const spans = trace?.spans || [];

  return (
    <div className={`timeline-view ${highlight ? 'highlight' : ''}`}>
      <Timeline
        items={spans.map(span => ({
          color: getSpanStatusColor(span),
          dot: getSpanIcon(span),
          children: (
            <div className="span-item">
              <div className="span-header">
                <span className="span-name">{span.operationName}</span>
                <span className="span-service">{span.process.serviceName}</span>
              </div>
              <div className="span-time">
                {formatDuration(span.duration)}
              </div>
              {span.attributes && (
                <div className="span-attributes">
                  {Object.entries(span.attributes).map(([key, value]) => (
                    <span key={key} className="attribute">
                      {key}: {value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        }))}
      />
    </div>
  );
}

/**
 * 获取Span状态颜色
 */
function getSpanStatusColor(span) {
  if (span.hasError) return 'error';
  if (span.duration > 3000000) return 'warning'; // 3秒
  return 'success';
}

/**
 * 获取Span图标
 */
function getSpanIcon(span) {
  // 根据服务类型返回不同图标
  const serviceIcons = {
    'APP': '📱',
    'TSP平台': '🖥️',
    '短信网关': '📨',
    'TBox': '🚗'
  };
  return serviceIcons[span.process.serviceName] || '📍';
}

/**
 * 格式化耗时
 */
function formatDuration(nanos) {
  const ms = nanos / 1000000;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
```

### 8.4 查询界面

```javascript
/**
 * 远控链路查询组件
 */
function RemoteControlTraceSearch() {
  const [searchType, setSearchType] = useState('traceId');
  const [searchValue, setSearchValue] = useState('');
  const [result, setResult] = useState(null);

  const handleSearch = async () => {
    try {
      let url;
      if (searchType === 'traceId') {
        url = `/api/trace/remote-control/linked/${searchValue}`;
      } else {
        url = `/api/trace/remote-control/by-vin/${searchValue}?days=7`;
      }

      const response = await fetch(url);
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('查询失败:', error);
    }
  };

  return (
    <div className="trace-search">
      <div className="search-form">
        <select
          value={searchType}
          onChange={(e) => setSearchType(e.target.value)}
        >
          <option value="traceId">TraceId</option>
          <option value="vin">VIN</option>
        </select>

        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder={searchType === 'traceId' ? '输入TraceId' : '输入VIN'}
        />

        <button onClick={handleSearch}>查询</button>
      </div>

      {result && (
        <RemoteControlTraceViewer
          traceId={searchType === 'traceId' ? searchValue : null}
          vin={searchType === 'vin' ? searchValue : null}
        />
      )}
    </div>
  );
}
```

---

## 9. 实施建议

### 9.1 分阶段实施

#### 第一阶段：方案一（关联存储）
- **时间**：2-3周
- **工作**：
  - [ ] 创建关联表
  - [ ] 实现TSP平台代码改造
  - [ ] 编写单元测试
  - [ ] 性能测试
- **产出**：基本的traceId关联功能

#### 第二阶段：前端开发
- **时间**：2周
- **工作**：
  - [ ] 开发查询API
  - [ ] 开发前端展示组件
  - [ ] 开发可视化视图
  - [ ] 用户体验优化
- **产出**：完整的监控界面

#### 第三阶段：增强与优化
- **时间**：1-2周
- **工作**：
  - [ ] 实时监控（WebSocket）
  - [ ] 异常检测与告警
  - [ ] 性能分析
  - [ ] 数据看板
- **产出**：增强功能

#### 第四阶段：生产部署
- **时间**：1周
- **工作**：
  - [ ] 生产环境部署
  - [ ] 监控与告警配置
  - [ ] 文档完善
  - [ ] 培训与交接
- **产出**：生产上线

### 9.2 技术债务管理

| 项目 | 风险 | 缓解措施 |
|------|------|----------|
| 数据库性能 | 大数据量查询慢 | 分区表、索引优化、ClickHouse |
| 关联失败 | VIN+时间窗口匹配不准确 | 缩小时间窗口、增加seqNo校验 |
| TBox改造 | 改造成本高 | 优先使用方案一，后续考虑方案三 |
| 数据一致性 | 多系统数据不一致 | 定期数据校验、补偿机制 |

### 9.3 监控指标

```sql
-- 关联成功率
SELECT
    DATE(create_time) as date,
    COUNT(*) as total,
    SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as linked,
    SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as link_rate
FROM trace_association
WHERE create_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(create_time);

-- 平均关联耗时
SELECT
    command_type,
    AVG(tbox_wake_duration) as avg_wake_duration,
    AVG(total_duration) as avg_total_duration
FROM trace_association
WHERE status = 2
  AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY command_type;

-- 异常统计
SELECT
    error_code,
    COUNT(*) as error_count,
    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as error_rate
FROM trace_association
WHERE error_code IS NOT NULL
  AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY error_code
ORDER BY error_count DESC;
```

---

## 附录

### A. 相关文档

- [OpenTelemetry Specification](https://opentelemetry.io/docs/reference/specification/)
- [Baggage Propagation](https://opentelemetry.io/docs/reference/specification/baggage/api/)
- [Trace Linking](https://opentelemetry.io/docs/reference/specification/trace/api/#link)

### B. 代码仓库

- 前端设计文档：[remote-control-monitor-design.md](./remote-control-monitor-design.md)
- 示例代码：`../tsp-service2/src/main/java/com/tsp/service2/service/`

### C. 联系方式

- 技术支持：tsp-tech@example.com
- 文档维护：DevOps团队

---

*本文档版本: v1.0*
*最后更新: 2026-04-11*
