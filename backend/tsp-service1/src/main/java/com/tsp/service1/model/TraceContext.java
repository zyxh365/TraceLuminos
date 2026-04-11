package com.tsp.service1.model;

import lombok.Builder;
import lombok.Data;

/** 链路上下文信息，用于验证接口的响应 */
@Data @Builder
public class TraceContext {
    private String serviceName;
    private String traceId;
    private String spanId;
    private boolean valid;
    private String message;
}
