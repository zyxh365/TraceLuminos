/**
 * Java服务拓扑数据 API 客户端
 *
 * 该模块用于从Java后端服务获取链路拓扑数据
 * Java服务需要提供的接口规范请参考 README.md
 */

const BASE = import.meta.env.VITE_JAVA_SERVICE_API_BASE || '/java-service/api';

/**
 * 通用请求封装
 * @param {string} path - API路径
 * @param {Object} options - fetch选项
 * @returns {Promise<any>}
 */
async function request(path, options = {}) {
  const url = BASE + path;

  console.log(`[JavaService API] 请求: ${url}`);

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      throw new Error(`Java服务API错误 ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();

    // 统一响应格式：{ code: 200, data: {...}, message: "success" }
    if (json.code !== 200) {
      throw new Error(json.message || 'Java服务API返回错误');
    }

    console.log(`[JavaService API] 响应:`, json.data);
    return json.data;
  } catch (error) {
    console.error(`[JavaService API] 请求失败:`, error);
    throw error;
  }
}

/**
 * 获取所有服务列表
 * @returns {Promise<string[]>} 服务名称数组
 *
 * Java接口示例:
 * GET /java-service/api/services
 * 响应: { code: 200, data: ["service1", "service2", "kong-gateway"], message: "success" }
 */
export async function fetchServices() {
  // TODO: 实现Java服务调用
  console.warn('[JavaService] fetchServices 接口尚未实现');
  return [];
}

/**
 * 获取服务依赖拓扑数据
 * @param {number} lookbackMs - 回溯时间（毫秒），默认1小时
 * @returns {Promise<Array>} 依赖关系数组
 *
 * Java接口示例:
 * GET /java-service/api/dependencies?lookback=3600000
 * 响应: {
 *   code: 200,
 *   data: [
 *     { parent: "service1", child: "service2", callCount: 150 },
 *     { parent: "kong-gateway", child: "service1", callCount: 300 }
 *   ],
 *   message: "success"
 * }
 */
export async function fetchDependencies(lookbackMs = 3600000) {
  // TODO: 实现Java服务调用
  console.warn('[JavaService] fetchDependencies 接口尚未实现');
  return [];
}

/**
 * 获取某服务的Trace列表
 * @param {string} service - 服务名
 * @param {number} limit - 返回数量限制
 * @param {number} lookbackMs - 回溯时间（毫秒）
 * @returns {Promise<Array>} Trace数组
 *
 * Java接口示例:
 * GET /java-service/api/traces?service=service1&limit=20&lookback=3600000
 * 响应: {
 *   code: 200,
 *   data: [
 *     {
 *       traceID: "abc123",
 *       spans: [
 *         {
 *           traceID: "abc123",
 *           spanID: "def456",
 *           operationName: "/api/users",
 *           process: { serviceName: "service1" },
 *           startTime: 1234567890000,
 *           duration: 5000,
 *           tags: [{ key: "http.method", value: "GET" }],
 *           references: [{ refType: "CHILD_OF", spanID: "parent123" }]
 *         }
 *       ],
 *       processes: { "p1": { serviceName: "service1" } }
 *     }
 *   ],
 *   message: "success"
 * }
 */
export async function fetchTraces(service, limit = 20, lookbackMs = 3600000) {
  // TODO: 实现Java服务调用
  console.warn('[JavaService] fetchTraces 接口尚未实现');
  return [];
}

/**
 * 获取单条Trace详情
 * @param {string} traceId - Trace ID
 * @returns {Promise<Object>} Trace详情对象
 *
 * Java接口示例:
 * GET /java-service/api/traces/{traceId}
 * 响应: {
 *   code: 200,
 *   data: {
 *     traceID: "abc123",
 *     spans: [...],
 *     processes: {...}
 *   },
 *   message: "success"
 * }
 */
export async function fetchTrace(traceId) {
  // TODO: 实现Java服务调用
  console.warn('[JavaService] fetchTrace 接口尚未实现');
  return null;
}

/**
 * 搜索Trace（支持按TraceId或VIN搜索）
 * @param {Object} options - 搜索选项
 * @param {string} options.traceId - 按TraceId搜索（支持模糊匹配）
 * @param {string} options.vin - 按VIN码搜索
 * @param {number} options.limit - 返回数量限制，默认50
 * @param {number} options.lookbackMs - 回溯时间（毫秒），默认1小时
 * @returns {Promise<Array>} 匹配的Trace数组
 *
 * Java接口示例:
 * POST /java-service/api/traces/search
 * 请求体: { traceId: "abc", vin: "VIN123", limit: 50, lookbackMs: 3600000 }
 * 响应: {
 *   code: 200,
 *   data: [
 *     {
 *       traceID: "abc123",
 *       spans: [...],
 *       processes: {...}
 *     }
 *   ],
 *   message: "success"
 * }
 */
export async function searchTraces({ traceId, vin, limit = 50, lookbackMs = 3600000 }) {
  // TODO: 实现Java服务调用
  console.warn('[JavaService] searchTraces 接口尚未实现');
  return [];
}

/**
 * 从Trace列表提取服务调用关系
 * 用于补充依赖拓扑数据
 * @param {Array} traces - Trace数组
 * @returns {Array} 依赖关系数组，格式: [{ parent, child, callCount }]
 */
export function extractEdgesFromTraces(traces) {
  const edgeMap = {};

  traces.forEach(trace => {
    const spans = trace.spans || [];
    const spanService = {};

    // 构建spanID -> serviceName映射
    spans.forEach(span => {
      const svc = span.process?.serviceName;
      if (svc) {
        spanService[span.spanID] = svc;
      }
    });

    // 提取调用关系
    spans.forEach(span => {
      if (!span.references) return;

      span.references.forEach(ref => {
        if (ref.refType !== 'CHILD_OF') return;

        const parent = spanService[ref.spanID];
        const child = spanService[span.spanID];

        if (parent && child && parent !== child) {
          const key = `${parent}->${child}`;
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
 * 提取Trace中的VIN码
 * @param {Object} trace - Trace对象
 * @returns {string|null>} VIN码
 */
export function extractVinFromTrace(trace) {
  if (!trace || !trace.spans) return null;

  for (const span of trace.spans) {
    if (span.tags) {
      const vinTag = span.tags.find(t => t.key === 'vin' || t.key === 'baggage.vin');
      if (vinTag) return vinTag.value;
    }
  }

  return null;
}

export default {
  fetchServices,
  fetchDependencies,
  fetchTraces,
  fetchTrace,
  searchTraces,
  extractEdgesFromTraces,
  extractVinFromTrace,
};
