package com.tsp.service2.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * 异步线程池配置
 *
 * ★ 关于 OTel Agent 与异步线程池的重要说明：
 *
 * OTel Java Agent 自动对以下执行器做了 Context 传播插桩：
 *   - ThreadPoolExecutor（java.util.concurrent）
 *   - ScheduledThreadPoolExecutor
 *   - Spring 的 ThreadPoolTaskExecutor（底层也是 ThreadPoolExecutor）
 *   - @Async 注解（底层使用上面的执行器）
 *
 * 插桩原理：
 *   Agent 在提交任务时（submit/execute）自动把当前 Context 包装进 Runnable，
 *   任务在新线程执行时自动恢复 Context，所以异步线程里的 TraceId 和父线程一致。
 *
 * 验证目标：
 *   父线程 traceId == 异步线程 traceId（继承）
 *   父线程 spanId  ≠  异步线程 spanId（新的子 Span）
 */
@Slf4j
@Configuration
@EnableAsync
public class AsyncConfig {

    /**
     * 普通线程池（验证 Agent 自动传播 Context）
     * Bean 名称 "taskExecutor" 是 Spring @Async 的默认线程池
     */
    @Bean("taskExecutor")
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("tsp-async-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();

        log.info("异步线程池初始化完成: coreSize=4, maxSize=8");
        return executor;
    }

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**")
                        .allowedOrigins("http://localhost:3000")
                        .allowedMethods("GET", "POST", "PUT", "DELETE")
                        .allowedHeaders("*");
            }
        };
    }
}
