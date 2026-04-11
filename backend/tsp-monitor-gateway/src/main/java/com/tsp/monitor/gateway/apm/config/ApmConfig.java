package com.tsp.monitor.gateway.apm.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 华为云 APM 配置类
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "huaweicloud.apm")
public class ApmConfig {

    /**
     * 是否启用 APM 功能
     */
    private Boolean enabled = false;

    /**
     * APM 服务端点
     */
    private String endpoint;

    /**
     * 访问密钥
     */
    private String accessKey;

    /**
     * 秘密密钥
     */
    private String secretKey;

    /**
     * 项目ID
     */
    private String projectId;

    /**
     * 区域
     */
    private String region;

    /**
     * 连接超时时间（毫秒）
     */
    private Integer connectTimeout = 10000;

    /**
     * 读取超时时间（毫秒）
     */
    private Integer readTimeout = 30000;
}
