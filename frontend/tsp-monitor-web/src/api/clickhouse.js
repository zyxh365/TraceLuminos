/**
 * ClickHouse 拓扑数据 API 客户端
 *
 * 通过 tsp-monitor-gateway 后端查询 ClickHouse 数据
 */

const BASE = '/monitor';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error('API错误 ' + res.status);
  const json = await res.json();
  if (json.code !== 200) throw new Error(json.message || 'API返回错误');
  return json.data;
}

/**
 * 查询服务调用拓扑
 */
export async function fetchTopology(startTime, endTime) {
  return request(`/analysis/topology?startTime=${startTime}&endTime=${endTime}`);
}

/**
 * 按 TraceId 或 VIN 搜索链路
 */
export async function searchTraceIds({ keyword, searchType, startTime, endTime, limit = 50 }) {
  const params = new URLSearchParams({
    keyword,
    searchType,
    startTime: String(startTime),
    endTime: String(endTime),
    limit: String(limit),
  });
  return request(`/analysis/traces/search?${params}`);
}

/**
 * 查询单条 Trace 详情（所有 spans）
 */
export async function fetchTraceDetail(traceId, startTime, endTime) {
  return request(`/analysis/traces/${traceId}?startTime=${startTime}&endTime=${endTime}`);
}
