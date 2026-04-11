package com.tsp.monitor.gateway.common.constant;

/**
 * 通用常量类
 *
 * @author TSP Monitor Team
 * @since 2026-03-25
 */
public class Constants {

    /**
     * UTF-8 编码
     */
    public static final String UTF8 = "UTF-8";

    /**
     * 成功状态码
     */
    public static final Integer SUCCESS_CODE = 200;

    /**
     * 失败状态码
     */
    public static final Integer ERROR_CODE = 500;

    /**
     * 默认页码
     */
    public static final Integer DEFAULT_PAGE_NO = 1;

    /**
     * 默认每页大小
     */
    public static final Integer DEFAULT_PAGE_SIZE = 20;

    /**
     * 最大每页大小
     */
    public static final Integer MAX_PAGE_SIZE = 1000;

    /**
     * 时间单位：毫秒
     */
    public static final Long TIME_MILLIS = System.currentTimeMillis();

    /**
     * 一小时的毫秒数
     */
    public static final long ONE_HOUR_MILLIS = 3600 * 1000;

    /**
     * 一天的毫秒数
     */
    public static final long ONE_DAY_MILLIS = 24 * ONE_HOUR_MILLIS;

    /**
     * HTTP GET 方法
     */
    public static final String HTTP_GET = "GET";

    /**
     * HTTP POST 方法
     */
    public static final String HTTP_POST = "POST";

    /**
     * HTTP PUT 方法
     */
    public static final String HTTP_PUT = "PUT";

    /**
     * HTTP DELETE 方法
     */
    public static final String HTTP_DELETE = "DELETE";
}
