package com.tsp.service2;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * tsp-service2 核心层服务（端口 8082）
 *
 * 验证场景：
 *   场景4：异步线程池中 TraceId / SpanId 的传播
 *          ├── 普通线程池（OTel Agent 自动传播，无需任何改动）
 *          └── 手动验证：异步方法里的 traceId 与调用方一致
 *
 * IDEA 启动配置（VM Options）：
 *   -javaagent:C:\otel-local\demo\opentelemetry-javaagent.jar
 *
 * IDEA 环境变量：
 *   OTEL_SERVICE_NAME=tsp-service2
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 *   OTEL_PROPAGATORS=tracecontext,baggage
 *   OTEL_TRACES_SAMPLER=always_on
 *   OTEL_LOGS_EXPORTER=none
 *   OTEL_METRICS_EXPORTER=none
 */
@SpringBootApplication
@EnableAsync
public class Service2Application {
    public static void main(String[] args) {
        SpringApplication.run(Service2Application.class, args);
    }
}
