package com.tsp.service1.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 请求体 */
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class CommandRequest {
    private String vin;
    private String commandType;
    private String source; // "rest" or "feign"
}
