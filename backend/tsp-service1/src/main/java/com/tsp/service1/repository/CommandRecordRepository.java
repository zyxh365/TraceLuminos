package com.tsp.service1.repository;

import com.tsp.service1.entity.CommandRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CommandRecordRepository extends JpaRepository<CommandRecord, Long> {
    List<CommandRecord> findByVin(String vin);
    Optional<CommandRecord> findByTraceId(String traceId);
}
