package com.tsp.service2.repository;

import com.tsp.service2.entity.ProcessedCommand;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ProcessedCommandRepository extends JpaRepository<ProcessedCommand, Long> {
    List<ProcessedCommand> findByVin(String vin);
    List<ProcessedCommand> findBySource(String source);
    List<ProcessedCommand> findByTraceId(String traceId);
}
