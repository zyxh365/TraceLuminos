package com.tsp.service1.feign;

import com.tsp.service1.model.CommandRequest;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;

import java.util.Map;

/**
 * tsp-service2 的 Feign 客户端
 *
 * ★ OTel Agent 自动插桩 OpenFeign：
 *   Agent 拦截 Feign 的 HTTP 请求，自动注入 traceparent Header
 *   无需实现任何 RequestInterceptor，零代码
 *
 * url 用 ${} 从配置文件读取，方便切换环境
 */
@FeignClient(name = "tsp-service2", url = "${tsp.service2.url}")
public interface Service2FeignClient {

    /**
     * 通过 Feign 发送指令到核心层
     */
    @PostMapping("/core/command")
    Map<String, Object> sendCommand(@RequestBody CommandRequest request);

    /**
     * 通过 Feign 获取 service2 当前的链路信息（用于验证 traceId 一致性）
     */
    @GetMapping("/core/trace/current")
    Map<String, Object> getTraceInfo();
}
