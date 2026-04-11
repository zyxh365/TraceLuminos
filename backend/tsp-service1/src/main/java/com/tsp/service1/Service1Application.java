package com.tsp.service1;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

/**
 * tsp-service1 业务层服务（端口 8081）
 *
 * 验证场景：
 *   场景1：通过 RestTemplate 调用 tsp-service2，traceparent 自动传播
 *   场景2：通过 OpenFeign   调用 tsp-service2，traceparent 自动传播
 *   场景3：Postman 手动传入 traceparent Header，验证链路继承
 *
 * IDEA 启动配置（VM Options）：
 *   -javaagent:C:\otel-local\demo\opentelemetry-javaagent.jar
 *
 * IDEA 环境变量：
 *   OTEL_SERVICE_NAME=tsp-service1
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 *   OTEL_PROPAGATORS=tracecontext,baggage
 *   OTEL_TRACES_SAMPLER=always_on
 *   OTEL_LOGS_EXPORTER=none
 *   OTEL_METRICS_EXPORTER=none
 */
@SpringBootApplication
@EnableFeignClients
public class Service1Application {
    public static void main(String[] args) {
        SpringApplication.run(Service1Application.class, args);
    }
}
