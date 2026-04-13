import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchServices, fetchDependencies, fetchTraces, fetchTrace, searchTraces as jaegerSearchTraces, extractVinFromTrace } from '../jaegerApi.js';
import { huaweiCloudAPM } from '../huaweicloud/apmApi.js';

// 已知中间件/基础设施的固定颜色（这些颜色有行业惯例）
const KNOWN_COLORS = {
  'MySQL':  '#f97316',
  'Redis':  '#ef4444',
  'Kafka':  '#eab308',
  'PostgreSQL': '#336791',
  'MongoDB': '#47a248',
  'RabbitMQ': '#ff6600',
  'Elasticsearch': '#fed10a',
};
const NODE_ICONS = {
  'MySQL': '🗄', 'Redis': '⚡', 'Kafka': '📨',
  'PostgreSQL': '🗄', 'MongoDB': '🗄',
  'kong-gateway': '🔀', 'gateway': '🔀', 'nginx': '🔀', 'traefik': '🔀', 'envoy': '🔀',
  default: '⚙',
};
const MIDDLEWARE = Object.keys(KNOWN_COLORS);

// 📌 配置：默认合并的网关服务列表
const DEFAULT_GATEWAY_SERVICES = ['kong-gateway', 'gateway', 'nginx', 'traefik', 'envoy'];

const NODE_R = 34;

// 根据服务名哈希自动生成颜色（同一名称始终生成相同颜色）
function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
    h = h & h;
  }
  const hue = Math.abs(h) % 360;
  const sat = 65 + (Math.abs(h >> 8) % 20);   // 65-85%
  const light = 55 + (Math.abs(h >> 16) % 15); // 55-70%
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function getColor(n) {
  const serviceName = n.includes(':') ? n.split(':')[0].trim() : n;
  return KNOWN_COLORS[serviceName] || hashColor(serviceName);
}
function getIcon(n) {
  // 如果是端点视图（包含冒号），提取服务名部分
  const serviceName = n.includes(':') ? n.split(':')[0].trim() : n;
  return NODE_ICONS[serviceName] || NODE_ICONS.default;
}
function fmtTime(ts) { return new Date(ts / 1000).toLocaleTimeString('zh-CN', { hour12: false }); }

// ── 层次化布局（从左到右，减少交叉）────────────────────────────
function calculateInitialLayout(nodes, w, h) {
  // 构建边映射和入度/出度统计
  const edgeMap = new Map();
  const inDegree = new Map();
  const outDegree = new Map();

  nodes.forEach(node => {
    edgeMap.set(node.id, []);
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  });

  // 注意：这个函数在extractGraph/extractSingleTraceGraph之后调用
  // 此时edges还没有传入，所以我们需要从其他地方获取边信息
  // 暂时使用圆形布局作为fallback
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) * 0.3;
  const positions = {};

  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    positions[n.id] = {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle)
    };
  });

  return positions;
}

// ── 层次化布局（从左到右，基于调用链深度排序）────────────────
function calculateHierarchicalLayout(nodes, edges, w, h) {
  if (!edges || edges.length === 0) {
    return calculateInitialLayout(nodes, w, h);
  }

  // 构建邻接表和入度
  const adjacency = new Map();
  const inDegree = new Map();
  const outDegree = new Map();

  nodes.forEach(node => {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  });

  edges.forEach(edge => {
    adjacency.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
  });

  // BFS 拓扑排序，计算每个节点的最长路径深度（即层级）
  const nodeDepth = new Map();
  const queue = [];

  nodes.forEach(node => {
    if ((inDegree.get(node.id) || 0) === 0) {
      nodeDepth.set(node.id, 0);
      queue.push(node.id);
    } else {
      nodeDepth.set(node.id, 0); // 默认第0层
    }
  });

  // 拓扑排序 + 求最长路径
  const sorted = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    sorted.push(cur);

    (adjacency.get(cur) || []).forEach(next => {
      // 当前节点深度 + 1，取最大值（最长路径）
      const newDepth = nodeDepth.get(cur) + 1;
      if (newDepth > nodeDepth.get(next)) {
        nodeDepth.set(next, newDepth);
      }
      const newInDeg = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, newInDeg);
      if (newInDeg === 0) {
        queue.push(next);
      }
    });
  }

  // 处理环：未被拓扑排序访问到的节点，根据入度估算层级
  nodes.forEach(node => {
    if (!sorted.includes(node.id)) {
      const maxParentDepth = edges
        .filter(e => e.target === node.id)
        .reduce((max, e) => Math.max(max, nodeDepth.get(e.source) || 0), 0);
      nodeDepth.set(node.id, maxParentDepth + 1);
      sorted.push(node.id);
    }
  });

  // 按深度分组
  const maxDepth = Math.max(...nodeDepth.values(), 0);
  const layers = Array.from({ length: maxDepth + 1 }, () => []);

  sorted.forEach(nodeId => {
    const depth = nodeDepth.get(nodeId) || 0;
    layers[depth].push(nodeId);
  });

  // 空层去掉
  const allLayers = layers.filter(l => l.length > 0);

  // 每层内排序：有出边的在前（被依赖多的靠上），减少交叉
  allLayers.forEach(layer => {
    layer.sort((a, b) => {
      const aOut = outDegree.get(a) || 0;
      const bOut = outDegree.get(b) || 0;
      if (bOut !== aOut) return bOut - aOut;
      // 出度相同时，按节点名排序保持稳定
      return a.localeCompare(b);
    });
  });

  // 计算位置
  const levelWidth = 200;
  const nodeSpacing = 100;
  const maxNodes = Math.max(...allLayers.map(l => l.length));

  const totalWidth = (allLayers.length - 1) * levelWidth;
  const totalHeight = (maxNodes - 1) * nodeSpacing;

  const startX = Math.max(NODE_R + 20, (w - totalWidth) / 2);
  const startY = Math.max(NODE_R + 20, (h - totalHeight) / 2);

  const positions = {};

  allLayers.forEach((layer, layerIndex) => {
    const x = startX + layerIndex * levelWidth;
    const layerHeight = (layer.length - 1) * nodeSpacing;
    const layerStartY = Math.max(NODE_R + 20, startY + (maxNodes * nodeSpacing - layerHeight) / 2);

    layer.forEach((nodeId, index) => {
      positions[nodeId] = {
        x: x,
        y: layerStartY + index * nodeSpacing
      };
    });
  });

  return positions;
}

function fmtDuration(us) {
  if (us >= 1000000) return (us / 1000000).toFixed(2) + 's';
  if (us >= 1000)    return (us / 1000).toFixed(1)    + 'ms';
  return us + 'μs';
}

// ── 从 Traces 提取图（含中间件节点，统计调用次数和平均耗时）────────
function extractGraph(traces) {
  const nodeSet = new Set();
  const edgeMap = {};

  console.log('[extractGraph] 开始提取，traces数量:', traces.length);

  traces.forEach((trace, traceIdx) => {
    const spans     = trace.spans    || [];
    const processes = trace.processes || {};
    const spanInfo  = {};

    spans.forEach(span => {
      const svc  = (processes[span.processID] || {}).serviceName || '';
      const tags  = span.tags || [];
      const get   = key => (tags.find(t => t.key === key) || {}).value || '';
      spanInfo[span.spanID] = {
        svc,
        peer: get('peer.service'),
        db:   get('db.system'),
        msg:  get('messaging.system'),
        duration: span.duration,
      };
    });

    spans.forEach(span => {
      const { svc, peer, db, msg, duration } = spanInfo[span.spanID];
      if (!svc) return;
      nodeSet.add(svc);

      // 中间件边
      let mw = peer || (db === 'mysql' ? 'MySQL' : db === 'redis' ? 'Redis' : '') || (msg === 'kafka' ? 'Kafka' : '');
      if (mw) {
        nodeSet.add(mw);
        const k = svc + '->' + mw;
        if (!edgeMap[k]) {
          edgeMap[k] = { count: 0, totalDuration: 0, durations: [] };
        }
        edgeMap[k].count += 1;
        edgeMap[k].totalDuration += duration;
        edgeMap[k].durations.push(duration);
      }

      // 服务间父子边
      (span.references || []).forEach(ref => {
        if (ref.refType !== 'CHILD_OF') return;
        const p = spanInfo[ref.spanID];
        if (p && p.svc && p.svc !== svc) {
          const k = p.svc + '->' + svc;
          if (!edgeMap[k]) {
            edgeMap[k] = { count: 0, totalDuration: 0, durations: [] };
          }
          edgeMap[k].count += 1;
          edgeMap[k].totalDuration += duration;
          edgeMap[k].durations.push(duration);
        }
      });
    });
  });

  return {
    nodes: [...nodeSet].map(id => ({ id })),
    edges: Object.entries(edgeMap).map(([k, v]) => {
      const [source, target] = k.split('->');
      return {
        source,
        target,
        callCount: v.count,
        avgDuration: v.totalDuration / v.count,
        minDuration: Math.min(...v.durations),
        maxDuration: Math.max(...v.durations),
      };
    }),
  };
}

// ── 合并网关节点辅助函数 ─────────────────────────────────────
// 将多个网关端点节点（如 "kong-gateway: GET /api/xxx"）合并为一个服务节点（如 "kong-gateway"）
// @param {Object} graphData - 图数据 { nodes, edges }
// @param {boolean} enabled - 是否启用合并
// @param {Array} gatewayServices - 需要合并的网关服务列表
function mergeGatewayNodes(graphData, enabled = true, gatewayServices = DEFAULT_GATEWAY_SERVICES) {
  // 边界情况处理
  if (!enabled || !graphData || !graphData.nodes || !graphData.edges) {
    return graphData;
  }

  const { nodes, edges } = graphData;

  // 空数据检查
  if (nodes.length === 0) {
    console.warn('[mergeGatewayNodes] 节点列表为空，跳过合并');
    return graphData;
  }

  const nodeMap = new Map();
  const mergedEdges = new Map();

  // 分类节点：网关节点 vs 普通节点
  nodes.forEach(node => {
    const nodeId = node.id;
    const baseService = nodeId.split(':')[0]?.trim() || nodeId;

    // 检查是否是需要合并的网关服务
    if (gatewayServices.includes(baseService) && nodeId.includes(':')) {
      // 这是一个网关端点节点，需要合并
      if (!nodeMap.has(baseService)) {
        nodeMap.set(baseService, { id: baseService, originalNodes: [] });
      }
      nodeMap.get(baseService).originalNodes.push(nodeId);
    } else {
      // 普通节点，直接保留
      nodeMap.set(nodeId, node);
    }
  });

  // 转换边：将指向网关端点的边改为指向网关服务
  edges.forEach(edge => {
    const source = edge.source;
    const target = edge.target;

    const sourceBase = source.split(':')[0]?.trim() || source;
    const targetBase = target.split(':')[0]?.trim() || target;

    let newSource = source;
    let newTarget = target;

    // 检查source是否是网关端点
    if (gatewayServices.includes(sourceBase) && source.includes(':')) {
      newSource = sourceBase;
    }

    // 检查target是否是网关端点
    if (gatewayServices.includes(targetBase) && target.includes(':')) {
      newTarget = targetBase;
    }

    const edgeKey = `${newSource}->${newTarget}`;

    if (!mergedEdges.has(edgeKey)) {
      mergedEdges.set(edgeKey, {
        source: newSource,
        target: newTarget,
        callCount: edge.callCount || 0,
        totalDuration: 0,
        durations: [],
        minDuration: edge.minDuration || Infinity,
        maxDuration: edge.maxDuration || 0,
        avgDuration: 0,
      });
    }

    const mergedEdge = mergedEdges.get(edgeKey);

    // 累加统计数据
    if (edge.callCount) {
      mergedEdge.callCount += edge.callCount;
    }
    if (edge.avgDuration) {
      mergedEdge.totalDuration += edge.avgDuration * (edge.callCount || 1);
      mergedEdge.durations.push(edge.avgDuration);
    }
    if (edge.duration) {
      // 单次trace模式
      mergedEdge.totalDuration += edge.duration;
      mergedEdge.durations.push(edge.duration);
      mergedEdge.callCount = Math.max(mergedEdge.callCount, 1);
    }

    // 更新最小最大值
    if (edge.minDuration !== undefined) {
      mergedEdge.minDuration = Math.min(mergedEdge.minDuration, edge.minDuration);
    }
    if (edge.maxDuration !== undefined) {
      mergedEdge.maxDuration = Math.max(mergedEdge.maxDuration, edge.maxDuration);
    }
  });

  // 计算平均耗时
  mergedEdges.forEach(edge => {
    if (edge.durations.length > 0 && edge.callCount > 0) {
      edge.avgDuration = edge.totalDuration / edge.callCount;
    } else if (edge.durations.length === 1) {
      edge.avgDuration = edge.durations[0];
    }
    delete edge.totalDuration;
    delete edge.durations;
  });

  console.log('[mergeGatewayNodes] 合并结果:', {
    原始节点数: nodes.length,
    合并后节点数: nodeMap.size,
    原始边数: edges.length,
    合并后边数: mergedEdges.size,
    合并的网关节点: Array.from(nodeMap.values())
      .filter(n => n.originalNodes)
      .map(n => ({ id: n.id, originalCount: n.originalNodes.length }))
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(mergedEdges.values()),
  };
}

// ── 提取端点级别的拓扑图（显示API端点和线程池）──────────────
function extractEndpointGraph(traces, isSingleTrace = false, mergeGateways = true) {
  const nodeSet = new Set();
  const edgeMap = {};

  console.log('[extractEndpointGraph] 开始提取端点级别拓扑，traces数量:', traces.length, '单次trace:', isSingleTrace);

  traces.forEach((trace, traceIdx) => {
    const spans     = trace.spans    || [];
    const processes = trace.processes || {};
    const spanInfo  = {};

    console.log(`[extractEndpointGraph] 处理trace ${traceIdx}, spans数量:`, spans.length);

    // 第一遍：收集所有span的信息
    spans.forEach((span, spanIdx) => {
      const svc  = (processes[span.processID] || {}).serviceName || '';
      const tags  = span.tags || [];
      const get   = key => (tags.find(t => t.key === key) || {}).value || '';

      // 打印所有span的详细信息用于调试
      console.log(`[extractEndpointGraph] Span ${spanIdx}:`, {
        operationName: span.operationName,
        serviceName: svc,
        references: span.references,
        allTags: tags.filter(t => ['component', 'span.kind', 'http.method', 'http.route', 'peer.service'].includes(t.key)),
      });

      // 清理operationName，移除服务名前缀
      let cleanOperation = span.operationName || '';
      // 移除类似 "/tsp-service1/api/..." 中的服务名部分
      const match = cleanOperation.match(/^\/[^/]+(\/.*)$/);
      if (match) {
        cleanOperation = match[1];
      }

      // 识别是否是线程池相关的span
      const isThreadPool = get('thread.name') || get('thread.id') ||
                          cleanOperation?.toLowerCase().includes('pool') ||
                          cleanOperation?.toLowerCase().includes('thread');

      spanInfo[span.spanID] = {
        svc,
        operation: cleanOperation,
        rawOperation: span.operationName,
        peer: get('peer.service'),
        db:   get('db.system'),
        msg:  get('messaging.system'),
        duration: span.duration,
        isThreadPool,
        threadName: get('thread.name') || get('thread.id'),
        spanKind: get('span.kind'),
        references: span.references || [],
      };
    });

    // 第二遍：构建节点和边
    spans.forEach(span => {
      const { svc, operation, peer, db, msg, duration, isThreadPool, threadName, references } = spanInfo[span.spanID];
      if (!svc) return;

      // 创建端点节点：服务名: 操作名
      const endpointId = isThreadPool && threadName
        ? `${svc}: [线程池] ${threadName}`
        : `${svc}: ${operation}`;

      nodeSet.add(endpointId);

      // 中间件边
      let mw = peer || (db === 'mysql' ? 'MySQL' : db === 'redis' ? 'Redis' : '') || (msg === 'kafka' ? 'Kafka' : '');
      if (mw) {
        nodeSet.add(mw);
        const k = endpointId + '->' + mw;
        if (isSingleTrace) {
          if (!edgeMap[k] || edgeMap[k] < duration) {
            edgeMap[k] = { duration };
          }
        } else {
          if (!edgeMap[k]) {
            edgeMap[k] = { count: 0, totalDuration: 0, durations: [] };
          }
          edgeMap[k].count += 1;
          edgeMap[k].totalDuration += duration;
          edgeMap[k].durations.push(duration);
        }
      }

      // 处理所有引用关系，不仅仅是CHILD_OF
      references.forEach(ref => {
        const p = spanInfo[ref.spanID];
        if (p && p.svc) {
          // 如果是同一个服务内的调用，也创建边
          const parentEndpointId = p.isThreadPool && p.threadName
            ? `${p.svc}: [线程池] ${p.threadName}`
            : `${p.svc}: ${p.operation}`;

          const k = parentEndpointId + '->' + endpointId;

          if (isSingleTrace) {
            if (!edgeMap[k] || edgeMap[k] < duration) {
              edgeMap[k] = { duration, refType: ref.refType };
            }
          } else {
            if (!edgeMap[k]) {
              edgeMap[k] = { count: 0, totalDuration: 0, durations: [] };
            }
            edgeMap[k].count += 1;
            edgeMap[k].totalDuration += duration;
            edgeMap[k].durations.push(duration);
          }
        }
      });
    });
  });

  console.log('[extractEndpointGraph] 提取结果:', {
    nodes: [...nodeSet],
    edgeCount: Object.keys(edgeMap).length
  });

  const result = {
    nodes: [...nodeSet].map(id => ({ id })),
    edges: Object.entries(edgeMap).map(([k, v]) => {
      const [source, target] = k.split('->');
      return isSingleTrace
        ? { source, target, duration: v.duration }
        : {
            source,
            target,
            callCount: v.count,
            avgDuration: v.totalDuration / v.count,
            minDuration: Math.min(...v.durations),
            maxDuration: Math.max(...v.durations),
          };
    }),
  };

  // 🔧 合并网关节点（如 kong-gateway）
  try {
    return mergeGatewayNodes(result, mergeGateways);
  } catch (error) {
    console.error('[extractEndpointGraph] 合并网关节点失败，返回原始数据:', error);
    return result;
  }
}

// ── 从单个 Trace 提取图（显示单次调用的响应耗时）──────────────
function extractSingleTraceGraph(trace) {
  const nodeSet = new Set();
  const edgeMap = {};

  const spans     = trace.spans    || [];
  const processes = trace.processes || {};
  const spanInfo  = {};

  // 第一遍：收集所有span的信息
  spans.forEach(span => {
    const svc  = (processes[span.processID] || {}).serviceName || '';
    const tags  = span.tags || [];
    const get   = key => (tags.find(t => t.key === key) || {}).value || '';

    spanInfo[span.spanID] = {
      svc,
      peer: get('peer.service'),
      db:   get('db.system'),
      msg:  get('messaging.system'),
      duration: span.duration,
      operationName: span.operationName,
    };
  });

  // 第二遍：构建节点和边（记录每次调用的耗时）
  spans.forEach(span => {
    const { svc, peer, db, msg, duration } = spanInfo[span.spanID];
    if (!svc) return;
    nodeSet.add(svc);

    // 中间件边
    let mw = peer || (db === 'mysql' ? 'MySQL' : db === 'redis' ? 'Redis' : '') || (msg === 'kafka' ? 'Kafka' : '');
    if (mw) {
      nodeSet.add(mw);
      const k = svc + '->' + mw;
      if (!edgeMap[k]) edgeMap[k] = [];
      edgeMap[k].push(duration);
    }

    // 服务间父子边
    (span.references || []).forEach(ref => {
      if (ref.refType !== 'CHILD_OF') return;
      const p = spanInfo[ref.spanID];
      if (p && p.svc && p.svc !== svc) {
        const k = p.svc + '->' + svc;
        if (!edgeMap[k]) edgeMap[k] = [];
        edgeMap[k].push(duration);
      }
    });
  });

  return {
    nodes: [...nodeSet].map(id => ({ id })),
    edges: Object.entries(edgeMap).map(([k, durations]) => {
      const [source, target] = k.split('->');
      const count = durations.length;
      const totalDuration = durations.reduce((a, b) => a + b, 0);
      return {
        source,
        target,
        callCount: count,
        duration: Math.max(...durations), // 最大耗时（用于兼容旧逻辑）
        avgDuration: totalDuration / count,
      };
    }),
  };
}

// ── 主组件 ────────────────────────────────────────────────────
export default function TopologyView() {
  const [graphData,        setGraphData]     = useState({ nodes: [], edges: [] });
  const [selectedNode,     setSelectedNode]  = useState(null);
  const [nodeTraces,       setNodeTraces]    = useState([]);
  const [selectedTrace,    setSelectedTrace] = useState(null);
  const [loading,          setLoading]       = useState(false);
  const [error,            setError]         = useState(null);
  const [lookback,         setLookback]      = useState(3600000);
  const [searchType,       setSearchType]    = useState('traceId'); // 'traceId' | 'vin'
  const [searchId,         setSearchId]      = useState('');
  const [searchResults,    setSearchResults] = useState([]); // 改为复数，存储多个结果
  const [searching,        setSearching]     = useState(false);
  const [searchError,      setSearchError]   = useState(null);
  const [allTracesData,    setAllTracesData] = useState([]); // 存储所有traces数据用于重建拓扑图
  const [viewMode,         setViewMode]      = useState('service'); // 'service' | 'endpoint'
  const [isFullscreen,     setIsFullscreen]  = useState(false); // 全屏状态
  const [dataSource,       setDataSource]    = useState('jaeger'); // 'jaeger' | 'huawei' - 数据源
  const [mergeGateways,    setMergeGateways] = useState(true); // 是否合并网关节点

  // 暴露到全局，方便调试
  useEffect(() => {
    window.__VIEW_MODE__ = viewMode;
    console.log('[viewMode] 当前视图模式:', viewMode);
  }, [viewMode]);

  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender(n => n + 1), []);

  // 全屏切换函数（只针对拓扑图SVG）
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      svgContainerRef.current?.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('全屏失败:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(err => {
        console.error('退出全屏失败:', err);
      });
    }
  }, []);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // ── 持久化位置（用 ref，切换 Tab 不会重置）────────────────
  const posRef  = useRef({});  // { id: { x, y } }

  // ── 拖拽 ref（不走 state，避免卡顿）────────────────────────
  // isDragging: 是否正在拖动（区分点击和拖拽）
  const dragRef = useRef(null); // { nodeId, startX, startY, offsetX, offsetY, moved }

  const containerRef = useRef(null);
  const svgRef       = useRef(null);
  const svgContainerRef = useRef(null); // SVG容器，用于全屏
  const [svgSize, setSvgSize] = useState({ w: 900, h: 560 });

  useEffect(() => {
    if (!svgContainerRef.current) {
      // 如果svgContainerRef还没有准备好，等一下再试
      const timer = setTimeout(() => {
        if (svgContainerRef.current) {
          const { width, height } = svgContainerRef.current.getBoundingClientRect();
          setSvgSize({ w: Math.max(400, width), h: Math.max(560, height) });
        }
      }, 50);
      return () => clearTimeout(timer);
    }

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSvgSize({ w: Math.max(400, width), h: Math.max(560, height) });
    });
    ro.observe(svgContainerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── 根据选中的trace和视图模式动态更新拓扑图 ───────────────────────────
  useEffect(() => {
    console.log('[useEffect] 触发', { selectedTrace: !!selectedTrace, viewMode, allTracesCount: allTracesData.length });

    if (selectedTrace) {
      // 单个trace模式：显示该次调用的详细拓扑
      let singleGraph;
      console.log('[useEffect] 准备调用提取函数，viewMode=', viewMode);
      if (viewMode === 'endpoint') {
        console.log('[useEffect] 调用 extractEndpointGraph');
        singleGraph = extractEndpointGraph([selectedTrace], true, mergeGateways);
      } else {
        console.log('[useEffect] 调用 extractSingleTraceGraph');
        singleGraph = extractSingleTraceGraph(selectedTrace);
      }

      console.log('单次trace拓扑图:', {
        nodes: singleGraph.nodes,
        edges: singleGraph.edges,
        spanCount: selectedTrace.spans?.length,
        traceID: selectedTrace.traceID,
        viewMode
      });
      window.__DEBUG_TRACE__ = selectedTrace;
      window.__DEBUG_GRAPH__ = singleGraph;
      setGraphData(singleGraph);
    } else if (allTracesData.length > 0) {
      // 全局模式：显示所有trace的聚合拓扑
      let globalGraph;
      if (viewMode === 'endpoint') {
        globalGraph = extractEndpointGraph(allTracesData, false, mergeGateways);
      } else {
        globalGraph = extractGraph(allTracesData);
      }

      console.log('全局拓扑图:', {
        nodes: globalGraph.nodes,
        edges: globalGraph.edges,
        traceCount: allTracesData.length,
        viewMode
      });
      window.__DEBUG_GRAPH__ = globalGraph;
      setGraphData(globalGraph);
    }
  }, [selectedTrace, allTracesData, viewMode, mergeGateways]);

  // ── 应用层次化布局（直接设置位置，不用力模拟）─────────────────
  const applyLayout = useCallback((nodes, edges) => {
    const w = svgSize.w, h = svgSize.h;
    const positions = calculateHierarchicalLayout(nodes, edges, w, h);
    nodes.forEach(n => {
      posRef.current[n.id] = positions[n.id];
    });
    rerender();
  }, [svgSize.w, svgSize.h, rerender]);

  // ── 加载数据 ─────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      let traces = [];
      let services = [];

      // 根据数据源选择不同的API
      if (dataSource === 'jaeger') {
        console.log('[数据源] 使用 Jaeger API');
        services = await fetchServices();
        const traceMap = new Map();

        await Promise.all((services || []).map(async svc => {
          try {
            const t = await fetchTraces(svc, 30, lookback);
            if (t) {
              t.forEach(trace => {
                if (!traceMap.has(trace.traceID)) {
                  traceMap.set(trace.traceID, trace);
                }
              });
            }
          } catch {}
        }));

        traces = Array.from(traceMap.values());

      } else if (dataSource === 'huawei') {
        console.log('[数据源] 使用华为云 APM API');

        try {
          // 调用华为云APM的searchTraces方法
          const searchResult = await huaweiCloudAPM.searchTraces({
            traceId: null,
            vin: null,
            limit: 50,
            lookbackMs: lookback,
          });

          console.log('[数据源] 华为云APM返回结果:', searchResult);
          traces = searchResult || [];

          // 获取服务列表
          services = await huaweiCloudAPM.getServices();
          console.log('[数据源] 华为云APM服务列表:', services);

          if (traces.length === 0) {
            console.warn('[数据源] 华为云APM未返回任何trace数据');
            setError('华为云APM未返回任何数据，请检查配置和时间范围');
          } else {
            console.log('[数据源] 华为云APM加载成功，traces数量:', traces.length);
          }

        } catch (err) {
          console.error('[数据源] 华为云APM加载失败:', err);
          setError(`华为云APM加载失败: ${err.message}`);
          traces = [];
          services = [];
        }
      }

      // 保存所有traces数据
      setAllTracesData(traces);

      const { nodes, edges } = extractGraph(traces);
      (services || []).forEach(s => { if (!nodes.find(n => n.id === s)) nodes.push({ id: s }); });

      // ★ 使用层次化布局
      nodes.forEach(n => {
        posRef.current[n.id] = undefined; // 清除旧位置，强制重新布局
      });

      setGraphData({ nodes, edges });
      applyLayout(nodes, edges);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [lookback, applyLayout]);

  useEffect(() => { loadData(); }, [lookback]);

  // ── 根据选中的trace和viewMode动态更新拓扑图 ──────────────────
  useEffect(() => {
    if (!selectedTrace || allTracesData.length === 0) return;

    console.log('[useEffect] 触发', { selectedTrace: !!selectedTrace, viewMode, allTracesCount: allTracesData.length });

    // 清除选中的节点
    setSelectedNode(null);
    setNodeTraces([]);

    let nodes, edges;

    if (viewMode === 'endpoint') {
      // 端点视图：显示API端点级别的拓扑
      console.log('[useEffect] 调用 extractEndpointGraph');
      const result = extractEndpointGraph([selectedTrace], true, mergeGateways);
      nodes = result.nodes;
      edges = result.edges;
    } else {
      // 服务视图：显示服务级别的拓扑
      console.log('[useEffect] 调用 extractSingleTraceGraph');
      const result = extractSingleTraceGraph(selectedTrace);
      nodes = result.nodes;
      edges = result.edges;
    }

    nodes.forEach(n => {
      posRef.current[n.id] = undefined; // 清除旧位置，强制重新布局
    });

    console.log('[useEffect] 设置拓扑图:', { nodeCount: nodes.length, edgeCount: edges.length, viewMode });
    setGraphData({ nodes, edges });
    applyLayout(nodes, edges);
  }, [selectedTrace, viewMode, allTracesData, applyLayout, mergeGateways]);

  // ── 当取消选中trace时，恢复全局拓扑图 ───────────────────────
  useEffect(() => {
    if (!selectedTrace && allTracesData.length > 0) {
      console.log('[useEffect] 恢复全局拓扑图，viewMode:', viewMode);

      let nodes, edges;
      if (viewMode === 'endpoint') {
        // 端点视图：使用extractEndpointGraph
        const result = extractEndpointGraph(allTracesData, false, mergeGateways);
        nodes = result.nodes;
        edges = result.edges;
      } else {
        // 服务视图：使用extractGraph
        const result = extractGraph(allTracesData);
        nodes = result.nodes;
        edges = result.edges;
      }

      nodes.forEach(n => {
        posRef.current[n.id] = undefined; // 清除旧位置，强制重新布局
      });

      console.log('[useEffect] 全局拓扑图已设置:', { nodeCount: nodes.length, edgeCount: edges.length, viewMode });
      setGraphData({ nodes, edges });
      applyLayout(nodes, edges);
    }
  }, [selectedTrace, viewMode, allTracesData, applyLayout, mergeGateways]);

  // ── 搜索（TraceId 或 VIN）──────────────────────────────────
  const handleSearch = useCallback(async () => {
    const id = searchId.trim();
    if (!id) return;
    setSearching(true); setSearchError(null); setSearchResults([]);

    try {
      let results = [];

      // 根据数据源选择不同的API
      if (dataSource === 'jaeger') {
        console.log('[数据源] 使用 Jaeger API 搜索');
        if (searchType === 'traceId') {
          results = await jaegerSearchTraces({ traceId: id, lookback: lookback, limit: 50 });
          if (results.length === 0) {
            setSearchError(`未找到包含 "${id}" 的 TraceId`);
            return;
          }
        } else if (searchType === 'vin') {
          results = await jaegerSearchTraces({ vin: id, lookback: lookback, limit: 50 });
          if (results.length === 0) {
            setSearchError(`未找到包含 VIN "${id}" 的链路`);
            return;
          }
        }

      } else if (dataSource === 'huawei') {
        console.log('[数据源] 使用华为云 APM API 搜索');

        try {
          // 调用华为云APM的searchTraces方法
          const searchParams = {
            traceId: searchType === 'traceId' ? id : null,
            vin: searchType === 'vin' ? id : null,
            limit: 50,
            lookbackMs: lookback,
          };

          results = await huaweiCloudAPM.searchTraces(searchParams);

          if (results.length === 0) {
            if (searchType === 'traceId') {
              setSearchError(`未找到包含 "${id}" 的 TraceId`);
            } else {
              setSearchError(`未找到包含 VIN "${id}" 的链路`);
            }
            return;
          }

          console.log('[数据源] 华为云APM搜索成功，结果数量:', results.length);

        } catch (err) {
          console.error('[数据源] 华为云APM搜索失败:', err);
          setSearchError(`搜索失败: ${err.message}`);
          return;
        }
      }

      setSearchResults(results);
      setSelectedNode(null);
      setNodeTraces([]);
      setSelectedTrace(null);
    } catch (e) {
      setSearchError('搜索失败: ' + e.message);
    } finally {
      setSearching(false);
    }
  }, [searchId, searchType, lookback, dataSource]);

  // ── ★ 点击节点（纯点击，和拖拽分离）────────────────────────
  const handleNodeClick = useCallback(async (nodeId) => {
    setSearchResults([]); setSearchError(null);

    if (selectedNode === nodeId) {
      setSelectedNode(null);
      setNodeTraces([]);
      setSelectedTrace(null);
      return;
    }

    setSelectedNode(nodeId);
    setNodeTraces([]);
    setSelectedTrace(null);

    if (MIDDLEWARE.includes(nodeId)) return;

    try {
      const traces = await fetchTraces(nodeId, 15, lookback);
      setNodeTraces(traces || []);
    } catch (e) {
      console.error('加载 traces 失败', e);
    }
  }, [selectedNode, lookback]);

  // ── 拖拽事件（平滑，不影响点击）────────────────────────────
  const onNodeMouseDown = useCallback((e, nodeId) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = svgRef.current.getBoundingClientRect();
    dragRef.current = {
      nodeId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      offsetX: e.clientX - rect.left - (posRef.current[nodeId]?.x || 0),
      offsetY: e.clientY - rect.top  - (posRef.current[nodeId]?.y || 0),
      moved: false,
    };
  }, []);

  useEffect(() => {
    function onMouseMove(e) {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startClientX;
      const dy = e.clientY - dragRef.current.startClientY;
      // 移动超过 4px 才算拖拽（区分点击抖动）
      if (Math.sqrt(dx*dx + dy*dy) > 4) dragRef.current.moved = true;
      if (!dragRef.current.moved) return;

      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const PAD = NODE_R + 10;
      const x = Math.max(PAD, Math.min(svgSize.w - PAD, e.clientX - rect.left - dragRef.current.offsetX));
      const y = Math.max(PAD, Math.min(svgSize.h - PAD, e.clientY - rect.top  - dragRef.current.offsetY));

      posRef.current[dragRef.current.nodeId] = { x, y };
      rerender();
    }

    function onMouseUp(e) {
      if (!dragRef.current) return;
      // ★ 没有移动 → 触发点击
      if (!dragRef.current.moved) {
        handleNodeClick(dragRef.current.nodeId);
      }
      dragRef.current = null;
      rerender();
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [svgSize, handleNodeClick, rerender]);

  // ── 点击 Trace ────────────────────────────────────────────
  const handleTraceClick = useCallback(async (traceId) => {
    // 如果点击的是已选中的trace，取消选中并恢复全局模式
    if (selectedTrace && selectedTrace.traceID === traceId) {
      setSelectedTrace(null);
      return;
    }

    try {
      let traceData;

      // 根据数据源选择不同的API
      if (dataSource === 'jaeger') {
        traceData = await fetchTrace(traceId);
      } else if (dataSource === 'huawei') {
        // 使用华为云APM的拓扑图API
        traceData = await huaweiCloudAPM.getTrace(traceId);
      }

      if (traceData) {
        setSelectedTrace(traceData);
      } else {
        console.error('[handleTraceClick] 获取trace详情失败: 返回null');
      }
    } catch (err) {
      console.error('[handleTraceClick] 获取trace详情失败:', err);
    }
  }, [selectedTrace, dataSource]);

  const { nodes, edges } = graphData;
  const pos = posRef.current;
  const isDragging = !!dragRef.current;

  const lookbackOpts = [
    { label: '30分钟', value: 1800000 },
    { label: '1小时',  value: 3600000 },
    { label: '3小时',  value: 10800000 },
    { label: '12小时', value: 43200000 },
  ];

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >

      {/* 工具栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f', borderRadius: 8, padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4da6ff', boxShadow: '0 0 6px #4da6ff' }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#4da6ff', fontWeight: 600 }}>链路拓扑图</span>
        </div>

        {/* 搜索类型选择 */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => { setSearchType('traceId'); setSearchId(''); setSearchResults([]); setSearchError(null); }}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              background: searchType === 'traceId' ? 'rgba(77,166,255,0.2)' : 'transparent',
              border: '1px solid ' + (searchType === 'traceId' ? '#4da6ff' : '#1e3a5f'),
              color: searchType === 'traceId' ? '#4da6ff' : '#5a7090'
            }}
          >
            TraceId
          </button>
          <button
            onClick={() => { setSearchType('vin'); setSearchId(''); setSearchResults([]); setSearchError(null); }}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              background: searchType === 'vin' ? 'rgba(77,166,255,0.2)' : 'transparent',
              border: '1px solid ' + (searchType === 'vin' ? '#4da6ff' : '#1e3a5f'),
              color: searchType === 'vin' ? '#4da6ff' : '#5a7090'
            }}
          >
            VIN码
          </button>
        </div>

        {/* 视图切换 */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setViewMode('service')}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              background: viewMode === 'service' ? 'rgba(0,212,255,0.2)' : 'transparent',
              border: '1px solid ' + (viewMode === 'service' ? '#00d4ff' : '#1e3a5f'),
              color: viewMode === 'service' ? '#00d4ff' : '#5a7090'
            }}
          >
            服务视图
          </button>
          <button
            onClick={() => setViewMode('endpoint')}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              background: viewMode === 'endpoint' ? 'rgba(0,212,255,0.2)' : 'transparent',
              border: '1px solid ' + (viewMode === 'endpoint' ? '#00d4ff' : '#1e3a5f'),
              color: viewMode === 'endpoint' ? '#00d4ff' : '#5a7090'
            }}
          >
            端点视图
          </button>
        </div>

        {/* 数据源切换 */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => { setDataSource('jaeger'); setSearchResults([]); setSearchError(null); setSelectedTrace(null); }}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              background: dataSource === 'jaeger' ? 'rgba(255,136,0,0.2)' : 'transparent',
              border: '1px solid ' + (dataSource === 'jaeger' ? '#ff8800' : '#1e3a5f'),
              color: dataSource === 'jaeger' ? '#ff8800' : '#5a7090'
            }}
            title="使用 Jaeger 数据源"
          >
            Jaeger
          </button>
          <button
            onClick={() => { setDataSource('huawei'); setSearchResults([]); setSearchError(null); setSelectedTrace(null); }}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              background: dataSource === 'huawei' ? 'rgba(255,136,0,0.2)' : 'transparent',
              border: '1px solid ' + (dataSource === 'huawei' ? '#ff8800' : '#1e3a5f'),
              color: dataSource === 'huawei' ? '#ff8800' : '#5a7090'
            }}
            title="使用华为云 APM 数据源（配置中...）"
          >
            华为云APM
          </button>
        </div>

        {/* 网关节点合并开关 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8, borderLeft: '1px solid #1e3a5f' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: '#5a7090',
              userSelect: 'none',
            }}
            title="在端点视图中合并网关服务的多个端点节点"
          >
            <input
              type="checkbox"
              checked={mergeGateways}
              onChange={e => setMergeGateways(e.target.checked)}
              style={{
                cursor: 'pointer',
                width: 14,
                height: 14,
                accentColor: '#00d4ff',
              }}
            />
            <span>合并网关</span>
          </label>
          <span style={{ fontSize: 10, color: '#4a6080', fontFamily: 'var(--mono)' }}>
            {mergeGateways ? '✓' : '✗'}
          </span>
        </div>

        {/* 搜索框 */}
        <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 260 }}>
          <input
            value={searchId}
            onChange={e => setSearchId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={searchType === 'traceId' ? '输入 TraceId 搜索（支持模糊）...' : '输入 VIN 码搜索...'}
            style={{ flex: 1, padding: '6px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid #1e3a5f', borderRadius: 5, color: '#e8f0fe', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none' }}
          />
          <button onClick={handleSearch} disabled={searching || !searchId.trim()} style={{ padding: '6px 14px', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, background: 'rgba(0,212,255,0.1)', border: '1px solid #00d4ff44', color: searching ? '#5a7090' : '#00d4ff' }}>
            {searching ? '搜索中...' : '🔍 搜索'}
          </button>
          {(searchResults.length > 0 || searchError) && (
            <button onClick={() => { setSearchId(''); setSearchResults([]); setSearchError(null); setSelectedTrace(null); }} style={{ padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, background: 'transparent', border: '1px solid #1e3a5f', color: '#5a7090' }}>✕</button>
          )}
        </div>

        {/* 时间范围 */}
        <div style={{ display: 'flex', gap: 5 }}>
          {lookbackOpts.map(o => (
            <button key={o.value} onClick={() => setLookback(o.value)} style={{ padding: '4px 9px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, background: lookback === o.value ? 'rgba(77,166,255,0.2)' : 'transparent', border: '1px solid '+(lookback===o.value?'#4da6ff':'#1e3a5f'), color: lookback===o.value?'#4da6ff':'#5a7090' }}>{o.label}</button>
          ))}
        </div>

        <button onClick={loadData} disabled={loading} style={{ padding: '6px 14px', borderRadius: 5, cursor: loading?'not-allowed':'pointer', fontFamily: 'var(--mono)', fontSize: 12, background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff8844', color: loading?'#5a7090':'#00ff88' }}>
          {loading ? '⟳' : '↺ 刷新'}
        </button>
      </div>

      {/* 状态提示 */}
      {selectedTrace && (
        <div style={{ background: 'rgba(176,106,255,0.08)', border: '1px solid #b06aff44', borderRadius: 6, padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#b06aff' }}>
          🔍 单次Trace模式 ({viewMode === 'service' ? '服务' : '端点'}视图) — 线条显示该次调用的响应耗时
        </div>
      )}
      {!selectedTrace && viewMode === 'service' && (
        <div style={{ background: 'rgba(77,166,255,0.08)', border: '1px solid #4da6ff44', borderRadius: 6, padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#4da6ff' }}>
          📊 全局聚合模式 (服务视图) — 线条显示"调用次数 · 平均耗时"
        </div>
      )}
      {!selectedTrace && viewMode === 'endpoint' && (
        <div style={{ background: 'rgba(77,166,255,0.08)', border: '1px solid #4da6ff44', borderRadius: 6, padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#4da6ff' }}>
          📊 全局聚合模式 (端点视图) — 显示API端点和线程池级别的调用关系
        </div>
      )}
      {searchError && <div style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid #ff4d6a44', borderRadius: 6, padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#ff4d6a' }}>⚠️ {searchError}</div>}
      {searchResults.length > 0 && (
        <div style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid #00ff8844', borderRadius: 6, padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#00ff88' }}>
          ✓ 找到 {searchResults.length} 条链路 — {searchType === 'traceId' ? 'TraceId' : 'VIN码'}: "{searchId}"
        </div>
      )}
      {error && <div style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid #ff4d6a44', borderRadius: 6, padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#ff4d6a' }}>⚠️ {error}</div>}

      <div style={{ display: 'flex', gap: 14, height: '100%' }}>

        {/* 拓扑图 */}
        <div
          ref={svgContainerRef}
          style={{
            flex: 1,
            minHeight: 560,
            height: '100%',
            background: 'rgba(8,13,20,0.95)',
            border: '1px solid #1e3a5f',
            borderRadius: 10,
            overflow: 'hidden',
            position: 'relative',
            // 全屏时占满整个屏幕
            ...(isFullscreen ? {
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9999,
              borderRadius: 0,
              border: 'none',
            } : {})
          }}
        >
          {/* 全屏按钮 */}
          <button
            onClick={toggleFullscreen}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 10,
              width: 28,
              height: 28,
              borderRadius: 6,
              cursor: 'pointer',
              background: isFullscreen ? 'rgba(255,170,0,0.2)' : 'rgba(30,58,95,0.6)',
              border: '1px solid ' + (isFullscreen ? '#ffaa00' : '#1e3a5f'),
              color: isFullscreen ? '#ffaa00' : '#5a7090',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              padding: 0,
              transition: 'all 0.2s'
            }}
            title={isFullscreen ? '退出全屏 (ESC)' : '全屏显示'}
            onMouseEnter={(e) => {
              e.target.style.background = isFullscreen ? 'rgba(255,170,0,0.3)' : 'rgba(77,166,255,0.2)';
              e.target.style.borderColor = isFullscreen ? '#ffaa00' : '#4da6ff';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = isFullscreen ? 'rgba(255,170,0,0.2)' : 'rgba(30,58,95,0.6)';
              e.target.style.borderColor = isFullscreen ? '#ffaa00' : '#1e3a5f';
            }}
          >
            {isFullscreen ? '⛶' : '⛶'}
          </button>

          {/* 图例 */}
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(() => {
              // 从当前节点中提取唯一的服务名
              const serviceNames = new Set();
              graphData.nodes.forEach(node => {
                const serviceName = node.id.includes(':') ? node.id.split(':')[0].trim() : node.id;
                serviceNames.add(serviceName);
              });

              // 为每个服务名生成图例项
              return Array.from(serviceNames).map(serviceName => {
                const color = getColor(serviceName);
                return (
                  <div key={serviceName} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090' }}>{serviceName}</span>
                  </div>
                );
              });
            })()}
            <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #1e3a5f' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#4da6ff' }}>线条:</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#5a7090' }}>次数 · 平均耗时</span>
              </div>
            </div>
          </div>
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, fontFamily: 'var(--mono)', fontSize: 11, color: '#5a7090' }}>{nodes.length} 节点 · {edges.length} 边</div>

          <svg ref={svgRef} width={svgSize.w} height={svgSize.h} style={{ display: 'block', userSelect: 'none', cursor: isDragging ? 'grabbing' : 'default' }}>
            <defs>
              {[...new Set(nodes.map(n => getColor(n.id || n.name)))].map(color => (
                <marker key={color} id={'arr-'+color.replace(/[^a-z0-9]/gi,'')} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill={color} opacity="0.5" />
                </marker>
              ))}
              <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#1e3a5f" strokeWidth="0.4" opacity="0.4"/></pattern>
            </defs>
            <rect width={svgSize.w} height={svgSize.h} fill="url(#grid)" />

            {/* 边 */}
            {edges.map((e, i) => {
              const src = pos[e.source], tgt = pos[e.target];
              if (!src || !tgt) return null;
              const color = getColor(e.source);
              const dx = tgt.x-src.x, dy = tgt.y-src.y;
              const len = Math.sqrt(dx*dx+dy*dy)||1;
              const x1 = src.x+(dx/len)*NODE_R, y1 = src.y+(dy/len)*NODE_R;
              const x2 = tgt.x-(dx/len)*(NODE_R+5), y2 = tgt.y-(dy/len)*(NODE_R+5);
              const mx = (x1+x2)/2-dy*0.12, my = (y1+y2)/2+dx*0.06;

              // 根据是否有选中的trace显示不同的信息
              const label = `${e.callCount || 0} · ${fmtDuration(e.avgDuration || e.duration || 0)}`;

              // 根据调用次数动态调整线条粗细
              const lineW = Math.min(4, 1.2 + (e.callCount || 0) * 0.3);
              // 边的标签位置
              const lx = (x1+x2)/2-dy*0.06;
              const ly = (y1+y2)/2+dx*0.06;

              return (
                <g key={i}>
                  {/* 线条背景光晕，让线条更醒目 */}
                  <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none" stroke={color} strokeWidth={lineW+3} strokeOpacity="0.08" />
                  {/* 主线条 */}
                  <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none" stroke={color} strokeWidth={lineW} strokeOpacity="0.55" markerEnd={`url(#arr-${color.replace('#','')})`} />
                  {/* 标签背景 */}
                  <rect x={lx-label.length*3.2} y={ly-8} width={label.length*6.4} height={14} rx={3} fill="rgba(8,13,20,0.85)" stroke={color} strokeWidth={0.5} strokeOpacity="0.3" />
                  {/* 标签文字 */}
                  <text x={lx} y={ly+1} textAnchor="middle" fill={color} fontSize="9" fontFamily="JetBrains Mono,monospace" opacity="0.9" fontWeight="500">
                    {label}
                  </text>
                </g>
              );
            })}

            {/* 节点 */}
            {nodes.map(node => {
              const p = pos[node.id];
              if (!p) return null;
              const color = getColor(node.id);
              const icon  = getIcon(node.id);
              const sel   = selectedNode === node.id;
              const isMid = MIDDLEWARE.includes(node.id);
              const isEndpoint = viewMode === 'endpoint' && node.id.includes(': ');

              // 端点视图：分解显示服务名和端点路径
              let displayLabel = node.id;
              let subLabel = '';
              if (isEndpoint) {
                const parts = node.id.split(': ');
                if (parts.length >= 2) {
                  const [service, ...rest] = parts;
                  const endpoint = rest.join(': ');
                  // 端点路径太长时截断
                  displayLabel = service;
                  subLabel = endpoint.length > 18 ? endpoint.slice(0,17)+'…' : endpoint;
                }
              } else {
                displayLabel = node.id.length > 13 ? node.id.slice(0,12)+'…' : node.id;
              }

              return (
                <g key={node.id} transform={`translate(${p.x},${p.y})`}
                   style={{ cursor: 'grab' }}
                   onMouseDown={e => onNodeMouseDown(e, node.id)}>
                  {sel && <circle r={NODE_R+10} fill={color} opacity="0.12" filter="url(#glow)" />}
                  <circle r={NODE_R+2} fill="none" stroke={color} strokeWidth={sel?2:1} strokeOpacity={sel?0.9:0.35} strokeDasharray={isMid?'3,3':'none'} />
                  <circle r={NODE_R} fill="rgba(8,13,20,0.97)" stroke={color} strokeWidth={sel?2.5:1.5} />
                  <text textAnchor="middle" dominantBaseline="middle" y={isEndpoint?-9:-7} fontSize={isMid?18:isEndpoint?12:15}>{icon}</text>
                  <text textAnchor="middle" dominantBaseline="middle" y={isEndpoint?3:11} fontSize="9" fontFamily="JetBrains Mono,monospace" fill={color} fontWeight={sel?'bold':'normal'}>
                    {displayLabel}
                  </text>
                  {subLabel && (
                    <text textAnchor="middle" dominantBaseline="middle" y={15} fontSize="7" fontFamily="JetBrains Mono,monospace" fill={color} opacity={0.8}>
                      {subLabel}
                    </text>
                  )}
                  <title>{node.id}</title>
                </g>
              );
            })}

            {!loading && nodes.length === 0 && (
              <text x={svgSize.w/2} y={svgSize.h/2} textAnchor="middle" fill="#5a7090" fontSize="13" fontFamily="JetBrains Mono,monospace">暂无数据 — 发起几条请求后点击刷新</text>
            )}
          </svg>
        </div>

        {/* 右侧面板 */}
        <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>

          {/* Trace 列表 */}
          <div style={{ flex: selectedTrace ? '0 0 auto' : 1, maxHeight: selectedTrace ? 220 : '100%', background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e3a5f', fontFamily: 'var(--mono)', fontSize: 12, color: '#94a8c0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: selectedNode ? getColor(selectedNode) : (searchResults.length > 0 ? '#00d4ff' : '#5a7090') }} />
              {searchResults.length > 0
                ? <><span style={{ color: '#00d4ff' }}>搜索结果</span><span style={{ color: '#5a7090' }}> ({searchType === 'traceId' ? 'TraceId' : 'VIN码'})</span></>
                : selectedNode
                  ? <><span style={{ color: getColor(selectedNode) }}>{selectedNode}</span><span style={{ color: '#5a7090' }}> Traces</span></>
                  : <span style={{ color: '#5a7090' }}>点击节点 或 搜索 TraceId/VIN</span>}
              {(nodeTraces.length > 0 || searchResults.length > 0) && (
                <span style={{ marginLeft: 'auto', background: '#1e3a5f', borderRadius: 8, padding: '1px 6px', fontSize: 10 }}>{searchResults.length > 0 ? searchResults.length : nodeTraces.length}</span>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {MIDDLEWARE.includes(selectedNode) && (
                <div style={{ padding: 14, color: '#5a7090', fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.7 }}>
                  中间件无独立 Trace。<br/>请点击调用它的服务节点，在 Trace 详情里查看对应 Span。
                </div>
              )}
              {!selectedNode && searchResults.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: '#5a7090', fontFamily: 'var(--mono)', fontSize: 11 }}>
                  点击左侧节点查看 Traces
                </div>
              )}
              {searchResults.length > 0 && searchResults.map(trace => (
                <TraceItem key={trace.traceID} trace={trace} selected={selectedTrace?.traceID === trace.traceID} onClick={handleTraceClick} />
              ))}
              {searchResults.length === 0 && nodeTraces.map(trace => (
                <TraceItem key={trace.traceID} trace={trace} selected={selectedTrace?.traceID === trace.traceID} onClick={handleTraceClick} />
              ))}
            </div>
          </div>

          {/* Trace 详情 */}
          {selectedTrace && (
            <div style={{ flex: 1, background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#94a8c0' }}>Trace 详情</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#4da6ff' }}>{selectedTrace.traceID.slice(0,14)}...</span>
                {(() => {
                  const spans = selectedTrace.spans || [];
                  const root  = spans.find(s => !s.references?.length);
                  const hasErr = spans.some(s => (s.tags||[]).some(t => t.key==='error'&&t.value));
                  return (
                    <>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090' }}>{root ? fmtDuration(root.duration) : ''}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: hasErr?'#ff4d6a':'#00ff88' }}>{hasErr?'✗':'✓'}</span>
                    </>
                  );
                })()}
                <button
                  onClick={() => {
                    setSelectedTrace(null);
                    // 恢复全局拓扑图会在useEffect中自动处理
                  }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#5a7090', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                  title="返回全局模式"
                >
                  ×
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
                <SpanTree trace={selectedTrace} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TraceItem({ trace, selected, onClick }) {
  const root   = (trace.spans||[]).find(s => !s.references?.length);
  const hasErr = (trace.spans||[]).some(s => (s.tags||[]).some(t => t.key==='error'&&t.value));
  const vin    = extractVinFromTrace(trace);

  return (
    <div onClick={() => onClick(trace.traceID)} style={{ padding: '9px 14px', borderBottom: '1px solid #0d1520', cursor: 'pointer', background: selected ? 'rgba(77,166,255,0.08)' : 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#4da6ff' }}>{trace.traceID.slice(0,14)}...</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: hasErr?'#ff4d6a':'#00ff88' }}>{hasErr?'✗ ERR':'✓ OK'} · {root ? fmtDuration(root.duration) : '-'}</span>
      </div>
      {vin && (
        <div style={{ marginBottom: 3 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#b06aff', background: 'rgba(176,106,255,0.1)', borderRadius: 3, padding: '1px 4px' }}>VIN: {vin}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{root?.operationName || '-'}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#3a5070', flexShrink: 0, marginLeft: 6 }}>{root ? fmtTime(root.startTime) : ''}</span>
      </div>
    </div>
  );
}

function SpanTree({ trace }) {
  const spans    = trace.spans    || [];
  const processes = trace.processes || {};
  const spanMap  = {};
  spans.forEach(s => { spanMap[s.spanID] = s; });
  const children = {}, roots = [];
  spans.forEach(s => {
    const p = s.references?.find(r => r.refType === 'CHILD_OF');
    if (p && spanMap[p.spanID]) {
      (children[p.spanID] = children[p.spanID] || []).push(s.spanID);
    } else roots.push(s.spanID);
  });
  const maxDur = spans.reduce((m,s) => Math.max(m, s.duration), 1);

  // 折叠状态
  const [collapsed, setCollapsed] = useState({});

  const toggle = (sid) => {
    setCollapsed(prev => ({ ...prev, [sid]: !prev[sid] }));
  };

  function renderSpan(sid, depth) {
    const span = spanMap[sid];
    if (!span) return null;
    const svc    = (processes[span.processID]||{}).serviceName || '';
    const color  = getColor(svc);
    const hasErr = (span.tags||[]).some(t => t.key==='error'&&t.value===true);
    const peer   = ((span.tags||[]).find(t=>t.key==='peer.service')||{}).value;
    const pct    = Math.max(2, (span.duration/maxDur)*100);
    const kids   = children[sid] || [];
    const hasKids = kids.length > 0;
    const isCollapsed = !!collapsed[sid];
    return (
      <div key={sid}>
        <div style={{ paddingLeft: depth*12, marginBottom: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasKids ? (
              <span
                onClick={() => toggle(sid)}
                style={{ color: '#4da6ff', fontSize: 9, flexShrink: 0, cursor: 'pointer', userSelect: 'none', padding: '0 2px', lineHeight: '12px' }}
                title={isCollapsed ? `展开 (${kids.length} 个子节点)` : `折叠 (${kids.length} 个子节点)`}
              >
                {isCollapsed ? '▶' : '▼'}
              </span>
            ) : depth > 0 ? (
              <span style={{ color: '#1e3a5f', fontSize: 9, flexShrink: 0 }}>└</span>
            ) : null}
            {hasKids && !isCollapsed && (
              <span style={{ fontSize: 8, color: '#3a5070', background: 'rgba(30,58,95,0.4)', borderRadius: 2, padding: '0 3px', flexShrink: 0 }}>{kids.length}</span>
            )}
            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', background: color+'22', border: '1px solid '+color+'44', color, borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap', flexShrink: 0 }}>{svc}</span>
            {peer && <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: getColor(peer), background: getColor(peer)+'22', border:'1px solid '+getColor(peer)+'44', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>→{peer}</span>}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: hasErr?'#ff4d6a':'#94a8c0', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{span.operationName}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', whiteSpace:'nowrap', flexShrink:0 }}>{fmtDuration(span.duration)}</span>
          </div>
          <div style={{ paddingLeft: (depth+1)*12, marginTop: 2 }}>
            <div style={{ height: 3, background: '#1e3a5f', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: pct+'%', height: '100%', background: color, opacity: 0.55, borderRadius: 2 }} />
            </div>
          </div>
        </div>
        {!isCollapsed && kids.map(cid => renderSpan(cid, depth+1))}
      </div>
    );
  }
  return <div>{roots.map(sid => renderSpan(sid, 0))}</div>;
}
