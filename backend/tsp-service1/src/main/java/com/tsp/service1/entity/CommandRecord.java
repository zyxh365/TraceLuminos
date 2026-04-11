package com.tsp.service1.entity;

import lombok.*;
import javax.persistence.*;
import java.time.LocalDateTime;

/**
 * 指令记录表（service1 写入，记录业务层的指令创建）
 * OTel Agent 自动为每次 save() 生成 INSERT Span
 */
@Entity
@Table(name = "s1_command_record")
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class CommandRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 32)
    private String vin;

    @Column(name = "command_type", nullable = false, length = 32)
    private String commandType;

    /** 调用方式：RestTemplate / OpenFeign */
    @Column(name = "call_type", length = 32)
    private String callType;

    /** 链路 traceId，便于和 Jaeger 关联 */
    @Column(name = "trace_id", length = 64)
    private String traceId;

    @Column(name = "span_id", length = 32)
    private String spanId;

    /** 指令状态：CREATED / DISPATCHED / CONSUMED */
    @Column(length = 16)
    private String status;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
        if (this.status == null) this.status = "CREATED";
    }
}
