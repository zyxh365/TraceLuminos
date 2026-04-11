package com.tsp.monitor.gateway.apm.client;

import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import cn.hutool.json.JSONUtil;
import com.tsp.monitor.gateway.apm.config.ApmConfig;
import com.tsp.monitor.gateway.apm.dto.ApmMetricQueryDTO;
import com.tsp.monitor.gateway.apm.dto.ApmTransactionQueryDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.util.HashMap;
import java.util.Map;

/**
 * 华为云 APM API 客户端
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
@Slf4j
@Component
public class HuaweiCloudApmClient {

    @Resource
    private ApmConfig apmConfig;

    /**
     * 获取认证头
     */
    private Map<String, String> getAuthHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "application/json");
        headers.put("X-Auth-Token", generateAuthToken());
        headers.put("X-Project-Id", apmConfig.getProjectId());
        return headers;
    }

    /**
     * 生成认证令牌（简化版，实际需要华为云SDK）
     */
    private String generateAuthToken() {
        // TODO: 实际项目中需要使用华为云SDK生成正确的认证令牌
        // 这里仅作为示例，返回占位符
        if (StringUtils.hasText(apmConfig.getAccessKey())) {
            return "Bearer " + apmConfig.getAccessKey();
        }
        return "";
    }

    /**
     * 查询应用列表
     */
    public String getApplications() {
        String url = apmConfig.getEndpoint() + "/v1/apm2/openapi/apm2/applications";

        log.info("调用华为云APM接口查询应用列表, URL: {}", url);

        try {
            HttpResponse response = HttpRequest.get(url)
                    .addHeaders(getAuthHeaders())
                    .timeout(apmConfig.getConnectTimeout())
                    .execute();

            if (response.isOk()) {
                log.info("查询应用列表成功");
                return response.body();
            } else {
                log.error("查询应用列表失败, 状态码: {}, 响应: {}", response.getStatus(), response.body());
                throw new RuntimeException("查询应用列表失败: " + response.body());
            }
        } catch (Exception e) {
            log.error("调用华为云APM接口异常", e);
            throw new RuntimeException("调用华为云APM接口异常: " + e.getMessage());
        }
    }

    /**
     * 查询应用指标数据
     */
    public String getApplicationMetrics(ApmMetricQueryDTO queryDTO) {
        String url = apmConfig.getEndpoint() + "/v1/apm2/openapi/apm2/metrics";

        log.info("调用华为云APM接口查询应用指标, 参数: {}", JSONUtil.toJsonStr(queryDTO));

        try {
            HttpResponse response = HttpRequest.post(url)
                    .addHeaders(getAuthHeaders())
                    .body(JSONUtil.toJsonStr(queryDTO))
                    .timeout(apmConfig.getReadTimeout())
                    .execute();

            if (response.isOk()) {
                log.info("查询应用指标成功");
                return response.body();
            } else {
                log.error("查询应用指标失败, 状态码: {}, 响应: {}", response.getStatus(), response.body());
                throw new RuntimeException("查询应用指标失败: " + response.body());
            }
        } catch (Exception e) {
            log.error("调用华为云APM接口异常", e);
            throw new RuntimeException("调用华为云APM接口异常: " + e.getMessage());
        }
    }

    /**
     * 查询拓扑图数据
     */
    public String getTopology(String applicationId, Long startTime, Long endTime) {
        String url = apmConfig.getEndpoint() + "/v1/apm2/openapi/apm2/topology";

        log.info("调用华为云APM接口查询拓扑图, 应用ID: {}", applicationId);

        Map<String, Object> params = new HashMap<>();
        params.put("applicationId", applicationId);
        params.put("startTime", startTime);
        params.put("endTime", endTime);

        try {
            HttpResponse response = HttpRequest.post(url)
                    .addHeaders(getAuthHeaders())
                    .body(JSONUtil.toJsonStr(params))
                    .timeout(apmConfig.getReadTimeout())
                    .execute();

            if (response.isOk()) {
                log.info("查询拓扑图成功");
                return response.body();
            } else {
                log.error("查询拓扑图失败, 状态码: {}, 响应: {}", response.getStatus(), response.body());
                throw new RuntimeException("查询拓扑图失败: " + response.body());
            }
        } catch (Exception e) {
            log.error("调用华为云APM接口异常", e);
            throw new RuntimeException("调用华为云APM接口异常: " + e.getMessage());
        }
    }

    /**
     * 查询事务列表
     */
    public String getTransactions(ApmTransactionQueryDTO queryDTO) {
        String url = apmConfig.getEndpoint() + "/v1/apm2/openapi/apm2/transactions";

        log.info("调用华为云APM接口查询事务列表, 参数: {}", JSONUtil.toJsonStr(queryDTO));

        try {
            HttpResponse response = HttpRequest.post(url)
                    .addHeaders(getAuthHeaders())
                    .body(JSONUtil.toJsonStr(queryDTO))
                    .timeout(apmConfig.getReadTimeout())
                    .execute();

            if (response.isOk()) {
                log.info("查询事务列表成功");
                return response.body();
            } else {
                log.error("查询事务列表失败, 状态码: {}, 响应: {}", response.getStatus(), response.body());
                throw new RuntimeException("查询事务列表失败: " + response.body());
            }
        } catch (Exception e) {
            log.error("调用华为云APM接口异常", e);
            throw new RuntimeException("调用华为云APM接口异常: " + e.getMessage());
        }
    }

    /**
     * 查询慢SQL列表
     */
    public String getSlowSqls(String applicationId, Long startTime, Long endTime, Integer limit) {
        String url = apmConfig.getEndpoint() + "/v1/apm2/openapi/apm2/slowsqls";

        log.info("调用华为云APM接口查询慢SQL, 应用ID: {}", applicationId);

        Map<String, Object> params = new HashMap<>();
        params.put("applicationId", applicationId);
        params.put("startTime", startTime);
        params.put("endTime", endTime);
        params.put("limit", limit != null ? limit : 100);

        try {
            HttpResponse response = HttpRequest.post(url)
                    .addHeaders(getAuthHeaders())
                    .body(JSONUtil.toJsonStr(params))
                    .timeout(apmConfig.getReadTimeout())
                    .execute();

            if (response.isOk()) {
                log.info("查询慢SQL成功");
                return response.body();
            } else {
                log.error("查询慢SQL失败, 状态码: {}, 响应: {}", response.getStatus(), response.body());
                throw new RuntimeException("查询慢SQL失败: " + response.body());
            }
        } catch (Exception e) {
            log.error("调用华为云APM接口异常", e);
            throw new RuntimeException("调用华为云APM接口异常: " + e.getMessage());
        }
    }
}
