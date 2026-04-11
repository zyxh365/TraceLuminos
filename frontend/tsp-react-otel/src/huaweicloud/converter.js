/**
 * 华为云APM数据格式转换为Jaeger格式
 *
 * 用于将华为云APM获取的span_event_list数据
 * 转换为Jaeger Trace格式，以便使用现有的拓扑图绘制代码
 */

/**
 * 转换单个华为云Trace为Jaeger格式
 * @param {Object} huaweiTrace - 华为云APM返回的单条Trace数据
 * @returns {Object} Jaeger格式的Trace对象
 */
export function convertHuaweiTraceToJaeger(huaweiTrace) {
  if (!huaweiTrace || !huaweiTrace.data || !huaweiTrace.data.span_event_list) {
    throw new Error('无效的华为云APM数据格式');
  }

  const spanEventList = huaweiTrace.data.span_event_list;

  if (spanEventList.length === 0) {
    return {
      traceID: 'unknown',
      spans: [],
      processes: {}
    };
  }

  // 建立id -> event映射，用于查找父级
  const eventMap = {};
  spanEventList.forEach(event => {
    eventMap[event.id] = event;
  });

  // 提取服务名（华为云每个span都有app_name，取第一个作为服务名）
  const serviceName = spanEventList[0].app_name;

  // 转换spans
  const spans = spanEventList.map(event => {
    // 提取父子关系
    const references = [];

    // 方法1: 从id解析父级
    const parts = event.id.split('-');
    if (parts.length > 1) {
      const parentId = parts.slice(0, -1).join('-');
      const parentEvent = eventMap[parentId];

      if (parentEvent) {
        references.push({
          refType: 'CHILD_OF',
          traceID: event.trace_id,
          spanID: parentEvent.span_id
        });
      }
    }

    // 方法2: 检查next_spanId
    // 这个字段表示当前span的下一个子span，但我们构建的是反引用
    // 所以这个信息不用于references

    // 构建tags
    const tags = [];

    if (event.http_method) {
      tags.push({ key: 'http.method', value: event.http_method });
    }

    if (event.real_source) {
      tags.push({ key: 'http.url', value: event.real_source });
    }

    if (event.argument) {
      tags.push({ key: 'http.argument', value: event.argument });
    }

    if (event.type) {
      tags.push({ key: 'span.kind', value: event.type });
    }

    if (event.db_system) {
      tags.push({ key: 'db.system', value: event.db_system });
    }

    if (event.db_statement) {
      tags.push({ key: 'db.statement', value: event.db_statement });
    }

    // 华为云可能有自定义tags
    if (event.tags && Object.keys(event.tags).length > 0) {
      Object.entries(event.tags).forEach(([key, value]) => {
        tags.push({ key, value });
      });
    }

    return {
      traceID: event.trace_id,
      spanID: event.span_id,
      operationName: event.method || event.type || event.class_name || 'unknown',
      processID: 'p1',  // 华为云没有process概念，统一使用p1
      references: references,
      startTime: event.start_time * 1000,  // 毫秒 → 微秒 ⚠️
      duration: event.time_used * 1000,     // 毫秒 → 微秒 ⚠️
      tags: tags,
      logs: [],
      warnings: null
    };
  });

  // 构建processes
  const processes = {
    'p1': {
      serviceName: serviceName,
      tags: [
        { key: 'app_name', value: serviceName },
        { key: 'app_type', value: spanEventList[0].app_type },
        { key: 'env_name', value: spanEventList[0].env_name },
        { key: 'region', value: spanEventList[0].region }
      ]
    }
  };

  return {
    traceID: spanEventList[0].trace_id,
    spans: spans,
    processes: processes
  };
}

/**
 * 批量转换华为云APM数据
 * @param {Array} huaweiTraces - 华为云APM返回的Trace数组
 * @returns {Array} Jaeger格式的Trace数组
 */
export function convertHuaweiTracesToJaeger(huaweiTraces) {
  if (!Array.isArray(huaweiTraces)) {
    return [convertHuaweiTraceToJaeger(huaweiTraces)];
  }

  return huaweiTraces.map(huaweiTrace =>
    convertHuaweiTraceToJaeger(huaweiTrace)
  );
}

/**
 * 从华为云APM数据中提取服务调用关系（用于聚合拓扑图）
 * @param {Array} huaweiTraces - 华为云APM返回的Trace数组
 * @returns {Array} 调用关系数组 [{ parent, child, callCount }]
 */
export function extractEdgesFromHuaweiTraces(huaweiTraces) {
  const edgeMap = {};

  huaweiTraces.forEach(huaweiTrace => {
    const jaegerTrace = convertHuaweiTraceToJaeger(huaweiTrace);
    const spans = jaegerTrace.spans || [];
    const spanService = {};

    // 构建spanID -> serviceName映射
    spans.forEach(span => {
      const svc = jaegerTrace.processes[span.processID]?.serviceName;
      if (svc) spanService[span.spanID] = svc;
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
 * 从华为云APM单条Trace中提取服务调用关系（用于单次Trace拓扑图）
 * @param {Object} huaweiTrace - 华为云APM返回的单条Trace数据
 * @returns {Object} 图数据 { nodes: [], edges: [] }
 */
export function extractGraphFromHuaweiTrace(huaweiTrace) {
  const jaegerTrace = convertHuaweiTraceToJaeger(huaweiTrace);
  const spans = jaegerTrace.spans || [];
  const spanService = {};
  const nodeSet = new Set();
  const edgeMap = new Map();

  // 构建spanID -> serviceName映射
  spans.forEach(span => {
    const svc = jaegerTrace.processes[span.processID]?.serviceName;
    if (svc) spanService[span.spanID] = svc;
  });

  // 提取调用关系
  spans.forEach(span => {
    if (!span.references) return;

    span.references.forEach(ref => {
      if (ref.refType !== 'CHILD_OF') return;

      const parent = spanService[ref.spanID];
      const child = spanService[span.spanID];

      if (!parent || !child || parent === child) return;

      nodeSet.add(parent);
      nodeSet.add(child);

      const key = `${parent}->${child}`;

      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          source: parent,
          target: child,
          duration: span.duration || 0
        });
      }
    });
  });

  return {
    nodes: Array.from(nodeSet).map(id => ({ id })),
    edges: Array.from(edgeMap.values())
  };
}

/**
 * 格式化时间显示
 * @param {number} microseconds - 微秒时间
 * @returns {string} 格式化后的时间字符串
 */
export function formatDuration(microseconds) {
  if (microseconds < 1000) {
    return microseconds + 'μs';
  } else if (microseconds < 1000000) {
    return (microseconds / 1000).toFixed(2) + 'ms';
  } else {
    return (microseconds / 1000000).toFixed(2) + 's';
  }
}

/**
 * 检查华为云APM数据是否有效
 * @param {Object} data - 华为云APM返回的数据
 * @returns {boolean} 是否有效
 */
export function isValidHuaweiData(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // 检查响应码
  if (data.code !== 0 && data.code !== 200) {
    return false;
  }

  // 检查数据结构
  if (!data.data || !data.data.span_event_list) {
    return false;
  }

  return Array.isArray(data.data.span_event_list) && data.data.span_event_list.length > 0;
}

/**
 * 转换华为云APM搜索结果
 * 如果搜索结果为空，返回空数组
 * @param {Object} response - 华为云APM搜索接口响应
 * @returns {Array} Jaeger格式的Trace数组
 */
export function convertHuaweiSearchResult(response) {
  if (!isValidHuaweiData(response)) {
    return [];
  }

  const spanEventList = response.data.span_event_list;

  // 华为云可能返回单个Trace，也可能是数组
  // 这里需要根据实际情况调整
  if (Array.isArray(spanEventList)) {
    // 如果直接是span_event_list数组，将其包装成Trace对象
    return [{
      traceID: spanEventList[0]?.trace_id || 'unknown',
      spans: convertHuaweiSpans(spanEventList),
      processes: {
        'p1': {
          serviceName: spanEventList[0]?.app_name || 'unknown',
          tags: []
        }
      }
    }];
  }

  return [];
}

/**
 * 内部函数：转换华为云spans为Jaeger格式
 */
function convertHuaweiSpans(spanEventList) {
  const eventMap = {};
  spanEventList.forEach(event => {
    eventMap[event.id] = event;
  });

  return spanEventList.map(event => {
    const references = [];
    const parts = event.id.split('-');

    if (parts.length > 1) {
      const parentId = parts.slice(0, -1).join('-');
      const parentEvent = eventMap[parentId];

      if (parentEvent) {
        references.push({
          refType: 'CHILD_OF',
          traceID: event.trace_id,
          spanID: parentEvent.span_id
        });
      }
    }

    const tags = [];
    if (event.http_method) tags.push({ key: 'http.method', value: event.http_method });
    if (event.real_source) tags.push({ key: 'http.url', value: event.real_source });
    if (event.argument) tags.push({ key: 'http.argument', value: event.argument });
    if (event.type) tags.push({ key: 'span.kind', value: event.type });

    return {
      traceID: event.trace_id,
      spanID: event.span_id,
      operationName: event.method || event.type || 'unknown',
      processID: 'p1',
      references: references,
      startTime: event.start_time * 1000,
      duration: event.time_used * 1000,
      tags: tags
    };
  });
}

export default {
  convertHuaweiTraceToJaeger,
  convertHuaweiTracesToJaeger,
  extractEdgesFromHuaweiTraces,
  extractGraphFromHuaweiTrace,
  formatDuration,
  isValidHuaweiData,
  convertHuaweiSearchResult
};
