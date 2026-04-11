package com.tsp.monitor.gateway.common.util;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.TimeUnit;

/**
 * 日期时间工具类
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
public class DateTimeUtil {

    private static final DateTimeFormatter DEFAULT_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final ZoneId DEFAULT_ZONE_ID = ZoneId.systemDefault();

    /**
     * 时间戳转日期时间字符串
     */
    public static String timestampToString(Long timestamp) {
        if (timestamp == null) {
            return null;
        }
        LocalDateTime dateTime = LocalDateTime.ofInstant(
                Instant.ofEpochMilli(timestamp),
                DEFAULT_ZONE_ID
        );
        return dateTime.format(DEFAULT_FORMATTER);
    }

    /**
     * 日期时间字符串转时间戳
     */
    public static Long stringToTimestamp(String dateTimeStr) {
        if (dateTimeStr == null || dateTimeStr.isEmpty()) {
            return null;
        }
        LocalDateTime dateTime = LocalDateTime.parse(dateTimeStr, DEFAULT_FORMATTER);
        return dateTime.atZone(DEFAULT_ZONE_ID).toInstant().toEpochMilli();
    }

    /**
     * 获取当前时间戳
     */
    public static Long currentTimestamp() {
        return System.currentTimeMillis();
    }

    /**
     * 获取N分钟前的时间戳
     */
    public static Long minutesAgo(int minutes) {
        return System.currentTimeMillis() - TimeUnit.MINUTES.toMillis(minutes);
    }

    /**
     * 获取N小时前的时间戳
     */
    public static Long hoursAgo(int hours) {
        return System.currentTimeMillis() - TimeUnit.HOURS.toMillis(hours);
    }

    /**
     * 获取N天前的时间戳
     */
    public static Long daysAgo(int days) {
        return System.currentTimeMillis() - TimeUnit.DAYS.toMillis(days);
    }

    /**
     * 格式化持续时间（毫秒转可读格式）
     */
    public static String formatDuration(Long milliseconds) {
        if (milliseconds == null) {
            return "0ms";
        }

        long seconds = milliseconds / 1000;
        long minutes = seconds / 60;
        long hours = minutes / 60;
        long days = hours / 24;

        if (days > 0) {
            return String.format("%dd %dh %dm %ds", days, hours % 24, minutes % 60, seconds % 60);
        } else if (hours > 0) {
            return String.format("%dh %dm %ds", hours, minutes % 60, seconds % 60);
        } else if (minutes > 0) {
            return String.format("%dm %ds", minutes, seconds % 60);
        } else if (seconds > 0) {
            return String.format("%ds", seconds);
        } else {
            return milliseconds + "ms";
        }
    }
}
