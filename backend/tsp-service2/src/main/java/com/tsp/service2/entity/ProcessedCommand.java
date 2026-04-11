package com.tsp.service2.entity;

import lombok.*;
import javax.persistence.*;
import java.time.LocalDateTime;

/**
 * 核心层指令处理记录（service2 写入）
 * OTel Agent 自动插桩 JPA，每次 save() 生成 INSERT Span
 */
@Entity
@Table(name = "s2_processed_command")
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class ProcessedCommand {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 32)
    private String vin;

    @Column(name = "command_type", length = 32)
    private String commandType;

    /** 来源：HTTP调用 / Kafka消费 */
    @Column(length = 32)
    private String source;

    /** 关联 service1 的 traceId，便于跨服务关联 */
    @Column(name = "trace_id", length = 64)
    private String traceId;

    @Column(name = "span_id", length = 32)
    private String spanId;

    @Column(length = 16)
    private String status;

    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    @PrePersist
    public void prePersist() {
        this.processedAt = LocalDateTime.now();
        if (this.status == null) this.status = "PROCESSED";
    }
}
