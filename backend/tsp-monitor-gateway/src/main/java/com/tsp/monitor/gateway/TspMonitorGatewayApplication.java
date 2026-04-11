package com.tsp.monitor.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * TSP 监控网关服务启动类
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@SpringBootApplication
@EnableAsync
@EnableScheduling
public class TspMonitorGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(TspMonitorGatewayApplication.class, args);
        System.out.println("========================================");
        System.out.println("TSP Monitor Gateway 服务启动成功！");
        System.out.println("========================================");
    }
}
