package com.tsp.service2.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class CommandRequest {
    private String vin;
    private String commandType;
    private String source;
}
