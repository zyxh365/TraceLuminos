/**
 * Jaeger HTTP API 客户端
 * 所有请求通过 Vite 代理转发到 http://localhost:16686
 */

const BASE = '/jaeger/api';

async function get(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error('Jaeger API ' + res.status + ': ' + path);
  const json = await res.json();
  // Jaeger API 返回格式：{ data: [...], errors: null }
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

/** 获取所有服务名列表 */
export async function fetchServices() {
  return get('/services');
}

/**
 * 获取服务依赖拓扑
 * @param {number} lookbackMs - 回溯时间（毫秒），默认 1 小时
 */
export async function fetchDependencies(lookbackMs = 3600000) {
  const endTs = Date.now();
  return get('/dependencies?endTs=' + endTs + '&lookback=' + lookbackMs);
}

/**
 * 获取某服务的 Trace 列表
 * @param {string} service - 服务名
 * @param {number} limit   - 数量限制
 * @param {number} lookbackMs - 回溯时间
 */
export async function fetchTraces(service, limit = 20, lookbackMs = 3600000) {
  const end   = Date.now() * 1000;       // Jaeger 用微秒
  const start = end - lookbackMs * 1000;
  return get(
    '/traces?service=' + encodeURIComponent(service) +
    '&limit=' + limit +
    '&start=' + start +
    '&end='   + end
  );
}

/**
 * 获取单条 Trace 详情
 * @param {string} traceId
 */
export async function fetchTrace(traceId) {
  const data = await get('/traces/' + traceId);
  return data && data[0];
}

/**
 * 从 Trace 列表里提取服务调用统计
 * 用于补充 /api/dependencies 没有覆盖到的调用关系
 */
export function extractEdgesFromTraces(traces) {
  const edgeMap = {};
  traces.forEach(trace => {
    const spans = trace.spans || [];
    // spanId → serviceName 映射
    const spanService = {};
    spans.forEach(span => {
      const svc = span.process && span.process.serviceName;
      if (svc) spanService[span.spanID] = svc;
    });

    spans.forEach(span => {
      if (!span.references) return;
      span.references.forEach(ref => {
        if (ref.refType !== 'CHILD_OF') return;
        const parent = spanService[ref.spanID];
        const child  = spanService[span.spanID];
        if (parent && child && parent !== child) {
          const key = parent + '->' + child;
          edgeMap[key] = (edgeMap[key] || 0) + 1;
        }
      });
    });
  });

  return Object.entries(edgeMap).map(([key, count]) => {
    const [parent, child] = key.split('->');
    return { parent, child, callCount: count };
  });
}

/**
 * 搜索 Trace 列表
 * @param {Object} options - 搜索选项
 * @param {string} options.traceId - 按TraceId搜索（支持模糊匹配）
 * @param {string} options.vin - 按VIN码搜索
 * @param {number} options.limit - 返回数量限制
 * @param {number} options.lookbackMs - 回溯时间（毫秒）
 */
export async function searchTraces({ traceId, vin, limit = 50, lookbackMs = 3600000 }) {
  // 如果既没有traceId也没有vin，返回空数组
  if (!traceId && !vin) {
    return [];
  }

  const end = Date.now() * 1000;
  const start = end - lookbackMs * 1000;

  try {
    // 获取所有服务的traces
    const services = await fetchServices();
    const traceMap = new Map(); // 用Map去重，traceID作为key

    await Promise.all((services || []).map(async svc => {
      try {
        const traces = await get(
          '/traces?service=' + encodeURIComponent(svc) +
          '&limit=' + limit +
          '&start=' + start +
          '&end=' + end
        );
        if (traces) {
          traces.forEach(trace => {
            // 使用traceID去重，避免同一个trace被多个服务返回
            if (!traceMap.has(trace.traceID)) {
              traceMap.set(trace.traceID, trace);
            }
          });
        }
      } catch (e) {
        // 忽略单个服务的错误
      }
    }));

    // 从Map中获取去重后的traces
    const allTraces = Array.from(traceMap.values());

    // 按traceId搜索（支持模糊匹配）
    if (traceId) {
      const filtered = allTraces.filter(trace =>
        trace.traceID && trace.traceID.toLowerCase().includes(traceId.toLowerCase())
      );
      return filtered.slice(0, limit);
    }

    // 按vin搜索
    if (vin) {
      const filtered = allTraces.filter(trace => {
        const spans = trace.spans || [];
        return spans.some(span => {
          const tags = span.tags || [];
          return tags.some(tag =>
            tag.key === 'vin' &&
            tag.value &&
            String(tag.value).toLowerCase().includes(vin.toLowerCase())
          );
        });
      });
      return filtered.slice(0, limit);
    }

    return [];
  } catch (e) {
    console.error('搜索traces失败:', e);
    throw e;
  }
}

/**
 * 从trace中提取vin码
 * @param {Object} trace - trace对象
 */
export function extractVinFromTrace(trace) {
  const spans = trace.spans || [];
  for (const span of spans) {
    const tags = span.tags || [];
    const vinTag = tags.find(t => t.key === 'vin');
    if (vinTag && vinTag.value) {
      return vinTag.value;
    }
  }
  return null;
}
