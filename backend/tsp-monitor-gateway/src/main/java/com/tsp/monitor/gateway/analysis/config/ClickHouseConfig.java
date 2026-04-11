package com.tsp.monitor.gateway.analysis.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * ClickHouse 配置类
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "clickhouse")
public class ClickHouseConfig {

    /**
     * ClickHouse JDBC URL
     */
    private String url;

    /**
     * 用户名
     */
    private String username;

    /**
     * 密码
     */
    private String password;

    /**
     * Socket 超时时间（毫秒）
     */
    private Integer socketTimeout = 30000;

    /**
     * 连接池大小
     */
    private Integer poolSize = 10;
}
