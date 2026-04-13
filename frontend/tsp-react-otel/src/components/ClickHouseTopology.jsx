/**
 * ClickHouse 服务拓扑页面
 *
 * 数据来源：tsp-monitor-gateway → ClickHouse platform.tsp_service_topology（每小时预聚合）
 *
 * UI 布局与 TopologyView（链路拓扑）完全一致：
 * - 顶部工具栏（标题 + 时间范围 + 刷新 + 全屏）
 * - 状态提示条
 * - 左侧 SVG 拓扑图（网格背景、节点拖拽、贝塞尔连线）
 * - 右侧面板（节点详情 / 边统计列表）
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchTopology, searchTraceIds, fetchTraceDetail } from '../clickhouse/api.js';

// ── 常量（与 TopologyView 保持一致）────────────────────────────

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
  const serviceName = n.includes(':') ? n.split(':')[0].trim() : n;
  return NODE_ICONS[serviceName] || NODE_ICONS.default;
}
function fmtDuration(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
  if (ms >= 1)    return ms.toFixed(1) + 'ms';
  return ms.toFixed(0) + 'μs';
}

// ClickHouse 返回的 DateTime64(9) 是字符串，需要转为时间戳
function parseTime(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// ── 层次化布局（从左到右，BFS 最长路径）────────────────────────

function calculateHierarchicalLayout(nodes, edges, w, h) {
  if (!edges || edges.length === 0) {
    // fallback: 圆形布局
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.3;
    const positions = {};
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      positions[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
    return positions;
  }

  const adjacency = new Map();
  const inDegree  = new Map();
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

  const nodeDepth = new Map();
  const queue = [];

  nodes.forEach(node => {
    if ((inDegree.get(node.id) || 0) === 0) {
      nodeDepth.set(node.id, 0);
      queue.push(node.id);
    } else {
      nodeDepth.set(node.id, 0);
    }
  });

  const sorted = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    sorted.push(cur);
    (adjacency.get(cur) || []).forEach(next => {
      const newDepth = nodeDepth.get(cur) + 1;
      if (newDepth > nodeDepth.get(next)) nodeDepth.set(next, newDepth);
      const newInDeg = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, newInDeg);
      if (newInDeg === 0) queue.push(next);
    });
  }

  // 处理环
  nodes.forEach(node => {
    if (!sorted.includes(node.id)) {
      const maxParentDepth = edges
        .filter(e => e.target === node.id)
        .reduce((max, e) => Math.max(max, nodeDepth.get(e.source) || 0), 0);
      nodeDepth.set(node.id, maxParentDepth + 1);
      sorted.push(node.id);
    }
  });

  const maxDepth = Math.max(...nodeDepth.values(), 0);
  const layers = Array.from({ length: maxDepth + 1 }, () => []);
  sorted.forEach(nodeId => layers[nodeDepth.get(nodeId) || 0].push(nodeId));
  const allLayers = layers.filter(l => l.length > 0);

  allLayers.forEach(layer => {
    layer.sort((a, b) => {
      const aOut = outDegree.get(a) || 0;
      const bOut = outDegree.get(b) || 0;
      if (bOut !== aOut) return bOut - aOut;
      return a.localeCompare(b);
    });
  });

  const levelWidth = 200;
  const nodeSpacing = 100;
  const maxNodes = Math.max(...allLayers.map(l => l.length));

  const totalWidth  = (allLayers.length - 1) * levelWidth;
  const totalHeight = (maxNodes - 1) * nodeSpacing;
  const startX = Math.max(NODE_R + 20, (w - totalWidth) / 2);
  const startY = Math.max(NODE_R + 20, (h - totalHeight) / 2);

  const positions = {};
  allLayers.forEach((layer, layerIndex) => {
    const x = startX + layerIndex * levelWidth;
    const layerHeight = (layer.length - 1) * nodeSpacing;
    const layerStartY = Math.max(NODE_R + 20, startY + (maxNodes * nodeSpacing - layerHeight) / 2);
    layer.forEach((nodeId, index) => {
      positions[nodeId] = { x, y: layerStartY + index * nodeSpacing };
    });
  });

  return positions;
}

// ── 主组件 ────────────────────────────────────────────────────

export default function ClickHouseTopology() {
  const [topologyData, setTopologyData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lookback, setLookback] = useState(3600000);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchType, setSearchType] = useState('traceId');
  const [searchId, setSearchId] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [traceSpans, setTraceSpans] = useState(null);

  const posRef = useRef({});
  const dragRef = useRef(null);
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const svgContainerRef = useRef(null);
  const [svgSize, setSvgSize] = useState({ w: 900, h: 560 });
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender(n => n + 1), []);

  // 响应式尺寸
  useEffect(() => {
    if (!svgContainerRef.current) {
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

  // 全屏切换
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      svgContainerRef.current?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── 加载数据 ─────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = Date.now();
      const data = await fetchTopology(now - lookback, now);
      setTopologyData(data || []);

      // 构建图并应用布局
      const { nodes, edges } = buildGraph(data || []);
      nodes.forEach(n => { posRef.current[n.id] = undefined; });
      applyLayout(nodes, edges);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [lookback]);

  // 从 API 数据构建图结构
  const buildGraph = useCallback((data) => {
    const nodeSet = new Set();
    const edges = [];

    data.forEach(row => {
      const src = row.source_service;
      const tgt = row.target_service;
      if (src && tgt) {
        nodeSet.add(src);
        nodeSet.add(tgt);
        edges.push({
          source: src,
          target: tgt,
          protocol: row.protocol || 'unknown',
          callCount: Number(row.call_count) || 0,
          error_count: Number(row.error_count) || 0,
          avgDuration: Number(row.avg_duration_ms) || 0,
          p99_duration_ms: Number(row.p99_duration_ms) || 0,
        });
      }
    });

    return {
      nodes: [...nodeSet].map(id => ({ id })),
      edges,
    };
  }, []);

  // 从 trace spans 构建拓扑图（适配 ClickHouse tsp_spans 字段格式）
  const buildTraceGraph = useCallback((spans) => {
    const nodeSet = new Set();
    const edgeMap = {}; // "src->tgt" → [{ duration, hasError }]

    // 第一遍：建立 spanId → span 信息映射
    const spanInfo = {};
    spans.forEach(s => {
      spanInfo[s.span_id] = {
        svc: s.service_name || '',
        peer: s.attributes_map?.['peer.service'] || '',
        db: s.attributes_map?.['db.system'] || '',
        msg: s.attributes_map?.['messaging.system'] || '',
        duration: Number(s.duration) || 0,
        status: s.status_code || '',
      };
    });

    // 第二遍：构建节点和边
    spans.forEach(s => {
      const info = spanInfo[s.span_id];
      if (!info || !info.svc) return;
      nodeSet.add(info.svc);

      // 中间件边（peer.service / db.system / messaging.system）
      const mw = info.peer
        || (info.db === 'mysql' ? 'MySQL' : info.db === 'redis' ? 'Redis' : '')
        || (info.db === 'postgresql' ? 'PostgreSQL' : '')
        || (info.db === 'mongodb' ? 'MongoDB' : '')
        || (info.msg === 'kafka' ? 'Kafka' : info.msg === 'rabbitmq' ? 'RabbitMQ' : '');
      if (mw) {
        nodeSet.add(mw);
        const k = info.svc + '->' + mw;
        if (!edgeMap[k]) edgeMap[k] = [];
        edgeMap[k].push({ duration: info.duration, hasError: info.status === 'ERROR' });
      }

      // 服务间边（parent_span_id → parent service → current service）
      const pid = s.parent_span_id;
      if (pid && pid !== '' && spanInfo[pid]) {
        const parentInfo = spanInfo[pid];
        if (parentInfo.svc && parentInfo.svc !== info.svc) {
          const k = parentInfo.svc + '->' + info.svc;
          if (!edgeMap[k]) edgeMap[k] = [];
          edgeMap[k].push({ duration: info.duration, hasError: info.status === 'ERROR' });
        }
      }
    });

    // 聚合边数据
    const edges = Object.entries(edgeMap).map(([key, items]) => {
      const [source, target] = key.split('->');
      const total = items.length;
      const errors = items.filter(i => i.hasError).length;
      const avgDur = items.reduce((s, i) => s + i.duration, 0) / total;
      const isMiddleware = MIDDLEWARE.includes(target) || MIDDLEWARE.includes(source);
      return {
        source,
        target,
        protocol: isMiddleware ? (target === 'MySQL' || target === 'PostgreSQL' || target === 'MongoDB' ? 'db' : target === 'Redis' ? 'db' : 'kafka') : 'http',
        callCount: total,
        error_count: errors,
        avgDuration: avgDur / 1000000, // ns → ms
        p99_duration_ms: 0,
      };
    });

    return {
      nodes: [...nodeSet].map(id => ({ id })),
      edges,
    };
  }, []);

  const applyLayout = useCallback((nodes, edges) => {
    const w = svgSize.w, h = svgSize.h;
    const positions = calculateHierarchicalLayout(nodes, edges, w, h);
    nodes.forEach(n => { posRef.current[n.id] = positions[n.id]; });
    rerender();
  }, [svgSize.w, svgSize.h, rerender]);

  // 数据变化时重新布局
  useEffect(() => {
    if (!topologyData) return;
    const { nodes, edges } = buildGraph(topologyData);
    nodes.forEach(n => { posRef.current[n.id] = undefined; });
    applyLayout(nodes, edges);
  }, [topologyData, applyLayout]);

  // trace 模式：traceSpans 变化时重新构建拓扑并布局
  useEffect(() => {
    if (!selectedTrace || !traceSpans || traceSpans.length === 0) return;
    const { nodes, edges } = buildTraceGraph(traceSpans);
    nodes.forEach(n => { posRef.current[n.id] = undefined; });
    applyLayout(nodes, edges);
  }, [selectedTrace, traceSpans, buildTraceGraph, applyLayout]);

  useEffect(() => { loadData(); }, [loadData]);

  // 自动刷新 60s
  useEffect(() => {
    const timer = setInterval(loadData, 60000);
    return () => clearInterval(timer);
  }, [loadData]);

  // ── 节点点击 ─────────────────────────────────────────────
  const handleNodeClick = useCallback((nodeId) => {
    setSearchResults([]);
    setSearchError(null);
    if (selectedNode === nodeId) {
      setSelectedNode(null);
      return;
    }
    setSelectedNode(nodeId);
  }, [selectedNode]);

  // ── 搜索 TraceId / VIN ───────────────────────────────────
  const handleSearch = useCallback(async () => {
    const id = searchId.trim();
    if (!id) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setSelectedNode(null);

    try {
      const now = Date.now();
      const results = await searchTraceIds({
        keyword: id,
        searchType,
        startTime: now - lookback,
        endTime: now,
        limit: 50,
      });
      if (results.length === 0) {
        setSearchError(searchType === 'traceId'
          ? `未找到包含 "${id}" 的 TraceId`
          : `未找到包含 VIN "${id}" 的链路`);
        return;
      }
      setSearchResults(results);
    } catch (e) {
      setSearchError('搜索失败: ' + e.message);
    } finally {
      setSearching(false);
    }
  }, [searchId, searchType, lookback]);

  // ── 点击 Trace ──────────────────────────────────────────
  const handleTraceClick = useCallback(async (traceId) => {
    if (selectedTrace === traceId) {
      setSelectedTrace(null);
      setTraceSpans(null);
      return;
    }
    setSelectedTrace(traceId);
    setTraceSpans(null);
    try {
      const now = Date.now();
      const spans = await fetchTraceDetail(traceId, now - lookback, now);
      setTraceSpans(spans || []);
    } catch (e) {
      console.error('加载 Trace 详情失败:', e);
      setTraceSpans([]);
    }
  }, [selectedTrace, lookback]);

  // ── 拖拽 ─────────────────────────────────────────────────
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
    function onMouseUp() {
      if (!dragRef.current) return;
      if (!dragRef.current.moved) handleNodeClick(dragRef.current.nodeId);
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

  // ── 当前图数据（trace 模式 vs 全局模式）───────────────────
  const isTraceMode = !!(selectedTrace && traceSpans && traceSpans.length > 0);
  const graph = isTraceMode
    ? buildTraceGraph(traceSpans)
    : (topologyData ? buildGraph(topologyData) : { nodes: [], edges: [] });
  const { nodes, edges } = graph;
  const pos = posRef.current;
  const isDragging = !!dragRef.current;

  // 选中节点的出入边
  const selectedEdges = selectedNode
    ? edges.filter(e => e.source === selectedNode || e.target === selectedNode)
    : [];
  const inboundEdges  = selectedNode ? edges.filter(e => e.target === selectedNode) : [];
  const outboundEdges = selectedNode ? edges.filter(e => e.source === selectedNode) : [];

  const lookbackOpts = [
    { label: '30分钟', value: 1800000 },
    { label: '1小时',  value: 3600000 },
    { label: '3小时',  value: 10800000 },
    { label: '12小时', value: 43200000 },
  ];

  // 全局唯一颜色（箭头 marker 用）
  const uniqueColors = [...new Set([...Object.values(KNOWN_COLORS), ...edges.map(e => getColor(e.source)), ...edges.map(e => getColor(e.target))])];

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', height: '100%', position: 'relative' }}>

      {/* ═══ 工具栏（与 TopologyView 布局完全一致）═══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f', borderRadius: 8, padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#00ff88', fontWeight: 600 }}>服务拓扑图</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, borderLeft: '1px solid #1e3a5f' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#5a7090' }}>ClickHouse</span>
          <span style={{ fontSize: 9, color: '#3a5070', fontFamily: 'var(--mono)' }}>预聚合</span>
        </div>

        {/* 搜索类型选择 */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => { setSearchType('traceId'); setSearchId(''); setSearchResults([]); setSearchError(null); }}
            style={{ padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, background: searchType === 'traceId' ? 'rgba(0,255,136,0.2)' : 'transparent', border: '1px solid '+(searchType==='traceId'?'#00ff88':'#1e3a5f'), color: searchType==='traceId'?'#00ff88':'#5a7090' }}
          >TraceId</button>
          <button
            onClick={() => { setSearchType('vin'); setSearchId(''); setSearchResults([]); setSearchError(null); }}
            style={{ padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, background: searchType === 'vin' ? 'rgba(0,255,136,0.2)' : 'transparent', border: '1px solid '+(searchType==='vin'?'#00ff88':'#1e3a5f'), color: searchType==='vin'?'#00ff88':'#5a7090' }}
          >VIN码</button>
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
          <button onClick={handleSearch} disabled={searching || !searchId.trim()} style={{ padding: '6px 14px', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff8844', color: searching ? '#5a7090' : '#00ff88' }}>
            {searching ? '搜索中...' : '🔍 搜索'}
          </button>
          {(searchResults.length > 0 || searchError) && (
            <button onClick={() => { setSearchId(''); setSearchResults([]); setSearchError(null); setSelectedTrace(null); setTraceSpans(null); }} style={{ padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, background: 'transparent', border: '1px solid #1e3a5f', color: '#5a7090' }}>✕</button>
          )}
        </div>

        {/* 时间范围 */}
        <div style={{ display: 'flex', gap: 5 }}>
          {lookbackOpts.map(o => (
            <button key={o.value} onClick={() => setLookback(o.value)} style={{ padding: '4px 9px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, background: lookback === o.value ? 'rgba(0,255,136,0.2)' : 'transparent', border: '1px solid '+(lookback===o.value?'#00ff88':'#1e3a5f'), color: lookback===o.value?'#00ff88':'#5a7090' }}>{o.label}</button>
          ))}
        </div>

        <button onClick={loadData} disabled={loading} style={{ padding: '6px 14px', borderRadius: 5, cursor: loading?'not-allowed':'pointer', fontFamily: 'var(--mono)', fontSize: 12, background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff8844', color: loading?'#5a7090':'#00ff88' }}>
          {loading ? '⟳' : '↺ 刷新'}
        </button>
      </div>

      {/* ═══ 状态提示 ═══ */}
      {isTraceMode ? (
        <div style={{ background: 'rgba(176,106,255,0.08)', border: '1px solid #b06aff44', borderRadius: 6, padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#b06aff' }}>
          🔍 Trace 模式 — 展示该链路的服务调用链路（{nodes.length} 节点 · {edges.length} 边）— 关闭右侧详情恢复全局拓扑
        </div>
      ) : (
        <div style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid #00ff8844', borderRadius: 6, padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#00ff88' }}>
          📊 全局聚合模式 — 数据来源 ClickHouse tsp_service_topology（每小时预聚合）— 线条显示"调用次数 · 平均耗时"
        </div>
      )}
      {error && <div style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid #ff4d6a44', borderRadius: 6, padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#ff4d6a' }}>⚠️ {error}</div>}
      {searchError && <div style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid #ff4d6a44', borderRadius: 6, padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#ff4d6a' }}>⚠️ {searchError}</div>}
      {searchResults.length > 0 && (
        <div style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid #00ff8844', borderRadius: 6, padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#00ff88' }}>
          ✓ 找到 {searchResults.length} 条链路 — {searchType === 'traceId' ? 'TraceId' : 'VIN码'}: "{searchId}"
        </div>
      )}
      {selectedTrace && (
        <div style={{ background: 'rgba(176,106,255,0.08)', border: '1px solid #b06aff44', borderRadius: 6, padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#b06aff' }}>
          🔍 查看 Trace 详情 — TraceId: {selectedTrace.slice(0,20)}...
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, height: '100%' }}>

        {/* ═══ 拓扑图（与 TopologyView SVG 完全一致）═══ */}
        <div
          ref={svgContainerRef}
          style={{
            flex: 1, minHeight: 560, height: '100%',
            background: 'rgba(8,13,20,0.95)', border: '1px solid #1e3a5f',
            borderRadius: 10, overflow: 'hidden', position: 'relative',
            ...(isFullscreen ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, borderRadius: 0, border: 'none' } : {})
          }}
        >
          {/* 全屏按钮 */}
          <button
            onClick={toggleFullscreen}
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 10,
              width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
              background: isFullscreen ? 'rgba(255,170,0,0.2)' : 'rgba(30,58,95,0.6)',
              border: '1px solid ' + (isFullscreen ? '#ffaa00' : '#1e3a5f'),
              color: isFullscreen ? '#ffaa00' : '#5a7090',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, padding: 0, transition: 'all 0.2s',
            }}
            title={isFullscreen ? '退出全屏 (ESC)' : '全屏显示'}
          >
            {isFullscreen ? '⛶' : '⛶'}
          </button>

          {/* 图例（动态，与 TopologyView 一致） */}
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(() => {
              const serviceNames = new Set();
              nodes.forEach(node => {
                const serviceName = node.id.includes(':') ? node.id.split(':')[0].trim() : node.id;
                serviceNames.add(serviceName);
              });
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
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#00ff88' }}>线条:</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#5a7090' }}>次数 · 平均耗时</span>
              </div>
            </div>
          </div>

          {/* 节点/边计数 */}
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, fontFamily: 'var(--mono)', fontSize: 11, color: '#5a7090' }}>
            {nodes.length} 节点 · {edges.length} 边
          </div>

          {/* SVG */}
          <svg ref={svgRef} width={svgSize.w} height={svgSize.h} style={{ display: 'block', userSelect: 'none', cursor: isDragging ? 'grabbing' : 'default' }}>
            <defs>
              {uniqueColors.map(color => (
                <marker key={color} id={'arr-ch-'+color.replace('#','')} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill={color} opacity="0.5" />
                </marker>
              ))}
              <filter id="ch-glow"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <pattern id="ch-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#1e3a5f" strokeWidth="0.4" opacity="0.4"/></pattern>
            </defs>
            <rect width={svgSize.w} height={svgSize.h} fill="url(#ch-grid)" />

            {/* 边 */}
            {edges.map((e, i) => {
              const src = pos[e.source], tgt = pos[e.target];
              if (!src || !tgt) return null;
              const color = e.error_count > 0 ? '#ef4444' : getColor(e.source);
              const dx = tgt.x - src.x, dy = tgt.y - src.y;
              const len = Math.sqrt(dx*dx + dy*dy) || 1;
              const x1 = src.x + (dx/len)*NODE_R, y1 = src.y + (dy/len)*NODE_R;
              const x2 = tgt.x - (dx/len)*(NODE_R+5), y2 = tgt.y - (dy/len)*(NODE_R+5);
              const mx = (x1+x2)/2 - dy*0.12, my = (y1+y2)/2 + dx*0.06;
              const label = `${e.callCount || 0} · ${fmtDuration(e.avgDuration || 0)}`;
              const lineW = Math.min(4, 1.2 + (e.callCount || 0) * 0.3);
              const lx = (x1+x2)/2 - dy*0.06;
              const ly = (y1+y2)/2 + dx*0.06;
              const isSelected = selectedNode && (e.source === selectedNode || e.target === selectedNode);

              return (
                <g key={i}>
                  <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none" stroke={color} strokeWidth={lineW+3} strokeOpacity={isSelected ? 0.2 : 0.08} />
                  <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none" stroke={color} strokeWidth={lineW} strokeOpacity={isSelected ? 0.9 : 0.55} markerEnd={`url(#arr-ch-${color.replace('#','')})`} />
                  <rect x={lx - label.length*3.2} y={ly-8} width={label.length*6.4} height={14} rx={3} fill="rgba(8,13,20,0.85)" stroke={color} strokeWidth={0.5} strokeOpacity={0.3} />
                  <text x={lx} y={ly+1} textAnchor="middle" fill={color} fontSize="9" fontFamily="JetBrains Mono,monospace" opacity="0.9" fontWeight="500">{label}</text>
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
              let displayLabel = node.id.length > 13 ? node.id.slice(0,12)+'…' : node.id;

              return (
                <g key={node.id} transform={`translate(${p.x},${p.y})`}
                   style={{ cursor: 'grab' }}
                   onMouseDown={e => onNodeMouseDown(e, node.id)}>
                  {sel && <circle r={NODE_R+10} fill={color} opacity="0.12" filter="url(#ch-glow)" />}
                  <circle r={NODE_R+2} fill="none" stroke={color} strokeWidth={sel?2:1} strokeOpacity={sel?0.9:0.35} strokeDasharray={isMid?'3,3':'none'} />
                  <circle r={NODE_R} fill="rgba(8,13,20,0.97)" stroke={color} strokeWidth={sel?2.5:1.5} />
                  <text textAnchor="middle" dominantBaseline="middle" y={isMid?-7:-7} fontSize={isMid?18:15}>{icon}</text>
                  <text textAnchor="middle" dominantBaseline="middle" y={11} fontSize="9" fontFamily="JetBrains Mono,monospace" fill={color} fontWeight={sel?'bold':'normal'}>{displayLabel}</text>
                  <title>{node.id}</title>
                </g>
              );
            })}

            {!loading && nodes.length === 0 && (
              <text x={svgSize.w/2} y={svgSize.h/2} textAnchor="middle" fill="#5a7090" fontSize="13" fontFamily="JetBrains Mono,monospace">暂无数据 — 发起几条请求后点击刷新</text>
            )}
          </svg>
        </div>

        {/* ═══ 右侧面板 ═══ */}
        <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>

          {/* Trace 列表（搜索结果 / 节点点击） */}
          <div style={{ flex: selectedTrace ? '0 0 auto' : 1, maxHeight: selectedTrace ? 220 : '100%', background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e3a5f', fontFamily: 'var(--mono)', fontSize: 12, color: '#94a8c0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: selectedNode ? getColor(selectedNode) : (searchResults.length > 0 ? '#00ff88' : '#5a7090') }} />
              {searchResults.length > 0
                ? <><span style={{ color: '#00ff88' }}>搜索结果</span><span style={{ color: '#5a7090' }}> ({searchType === 'traceId' ? 'TraceId' : 'VIN码'})</span></>
                : selectedNode
                  ? <><span style={{ color: getColor(selectedNode) }}>{selectedNode}</span><span style={{ color: '#5a7090' }}> 调用关系</span><span style={{ marginLeft: 'auto', background: '#1e3a5f', borderRadius: 8, padding: '1px 6px', fontSize: 10 }}>{selectedEdges.length}</span></>
                  : <span style={{ color: '#5a7090' }}>点击节点 或 搜索 TraceId/VIN</span>}
              {(selectedEdges.length > 0 || searchResults.length > 0) && (
                <span style={{ marginLeft: 'auto', background: '#1e3a5f', borderRadius: 8, padding: '1px 6px', fontSize: 10 }}>{searchResults.length > 0 ? searchResults.length : selectedEdges.length}</span>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* 搜索结果列表 */}
              {searchResults.length > 0 && searchResults.map(trace => (
                <TraceSearchItem key={trace.trace_id} trace={trace} selected={selectedTrace === trace.trace_id} onClick={() => handleTraceClick(trace.trace_id)} />
              ))}
              {/* 节点调用关系 */}
              {searchResults.length === 0 && !selectedNode && (
                <div style={{ padding: 20, textAlign: 'center', color: '#5a7090', fontFamily: 'var(--mono)', fontSize: 11 }}>
                  点击左侧节点查看调用关系
                </div>
              )}
              {searchResults.length === 0 && MIDDLEWARE.includes(selectedNode) && (
                <div style={{ padding: 14, color: '#5a7090', fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.7 }}>
                  中间件无独立 Trace。<br/>请点击调用它的服务节点。
                </div>
              )}
              {searchResults.length === 0 && selectedNode && selectedEdges.length === 0 && !MIDDLEWARE.includes(selectedNode) && (
                <div style={{ padding: 20, textAlign: 'center', color: '#5a7090', fontFamily: 'var(--mono)', fontSize: 11 }}>
                  该节点无调用关系数据
                </div>
              )}
              {searchResults.length === 0 && selectedEdges.map((edge, idx) => {
                const isInbound = edge.target === selectedNode;
                const peer = isInbound ? edge.source : edge.target;
                const errorRate = edge.callCount > 0 ? (edge.error_count / edge.callCount * 100) : 0;
                return (
                  <div key={idx} style={{ padding: '10px 14px', borderBottom: '1px solid #0d1520' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: getColor(peer) }}>
                        {isInbound ? '◀' : '▶'} {peer}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: errorRate > 5 ? '#ef4444' : '#00ff88' }}>
                        {errorRate > 0 ? `${errorRate.toFixed(1)}% 错误` : '✓ OK'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1px 10px', fontFamily: 'var(--mono)', fontSize: 10 }}>
                      <span style={{ color: '#5a7090' }}>协议:</span>
                      <span style={{ color: '#c8d6e5' }}>{edge.protocol}</span>
                      <span style={{ color: '#5a7090' }}>调用次数:</span>
                      <span style={{ color: '#c8d6e5' }}>{edge.callCount.toLocaleString()}</span>
                      <span style={{ color: '#5a7090' }}>平均耗时:</span>
                      <span style={{ color: '#c8d6e5' }}>{fmtDuration(edge.avgDuration)}</span>
                      <span style={{ color: '#5a7090' }}>P99 耗时:</span>
                      <span style={{ color: '#c8d6e5' }}>{fmtDuration(edge.p99_duration_ms)}</span>
                      <span style={{ color: '#5a7090' }}>错误次数:</span>
                      <span style={{ color: errorRate > 5 ? '#ef4444' : '#c8d6e5' }}>{edge.error_count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trace 详情 */}
          {selectedTrace && traceSpans !== null && (
            <div style={{ flex: 1, background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#94a8c0' }}>Trace 详情</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#00ff88' }}>{selectedTrace.slice(0,14)}...</span>
                {(() => {
                  const hasErr = traceSpans.some(s => s.status_code === 'ERROR');
                  const rootSpan = traceSpans.find(s => !s.parent_span_id || s.parent_span_id === '');
                  const dur = rootSpan ? Number(rootSpan.duration) : 0;
                  return (
                    <>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090' }}>{dur > 0 ? fmtDuration(dur / 1000000) : ''}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: hasErr ? '#ff4d6a' : '#00ff88' }}>{hasErr ? '✗' : '✓'}</span>
                    </>
                  );
                })()}
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090' }}>{traceSpans.length} spans</span>
                <button
                  onClick={() => { setSelectedTrace(null); setTraceSpans(null); }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#5a7090', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                  title="返回"
                >×</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
                <ClickHouseSpanTree spans={traceSpans} />
              </div>
            </div>
          )}

          {/* 调用统计概览 */}
          {topologyData && topologyData.length > 0 && (
            <div style={{ flex: '0 0 auto', background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f', borderRadius: 10, padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 11 }}>
              <div style={{ color: '#94a8c0', marginBottom: 8 }}>调用统计概览</div>
              {(() => {
                const totalCalls = edges.reduce((s, e) => s + (e.callCount || 0), 0);
                const totalErrors = edges.reduce((s, e) => s + (e.error_count || 0), 0);
                const avgDur = edges.length > 0
                  ? edges.reduce((s, e) => s + (e.avgDuration || 0), 0) / edges.length
                  : 0;
                const errorRate = totalCalls > 0 ? (totalErrors / totalCalls * 100) : 0;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <StatBox label="服务数" value={nodes.length} color="#4da6ff" />
                    <StatBox label="调用关系" value={edges.length} color="#b06aff" />
                    <StatBox label="总调用次数" value={totalCalls.toLocaleString()} color="#00ff88" />
                    <StatBox label="错误率" value={errorRate.toFixed(1) + '%'} color={errorRate > 5 ? '#ef4444' : '#00ff88'} />
                    <StatBox label="平均耗时" value={fmtDuration(avgDur)} color="#eab308" />
                    <StatBox label="数据源" value="ClickHouse" color="#5a7090" />
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 统计小卡片 ──────────────────────────────────────────────────

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '8px 10px', border: '1px solid #1e3a5f' }}>
      <div style={{ color: '#5a7090', fontSize: 10, marginBottom: 3 }}>{label}</div>
      <div style={{ color, fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

// ── 搜索结果 TraceItem ───────────────────────────────────────────

function TraceSearchItem({ trace, selected, onClick }) {
  const hasError = trace.has_error === 1;
  const dur = Number(trace.duration_ns) || 0;
  const startTime = parseTime(trace.min_start_time);
  const bizVin = trace.any_biz_vin || trace.biz_vin;

  return (
    <div onClick={() => onClick()} style={{ padding: '9px 14px', borderBottom: '1px solid #0d1520', cursor: 'pointer', background: selected ? 'rgba(0,255,136,0.08)' : 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#00ff88' }}>{trace.trace_id.slice(0,14)}...</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: hasError ? '#ff4d6a' : '#00ff88' }}>
          {hasError ? '✗ ERR' : '✓ OK'} · {fmtDuration(dur / 1000000)} · {trace.span_count} spans
        </span>
      </div>
      {bizVin && (
        <div style={{ marginBottom: 3 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#b06aff', background: 'rgba(176,106,255,0.1)', borderRadius: 3, padding: '1px 4px' }}>VIN: {bizVin}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{trace.service_name}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#3a5070', flexShrink: 0, marginLeft: 6 }}>{startTime ? new Date(startTime).toLocaleTimeString('zh-CN', { hour12: false }) : ''}</span>
      </div>
    </div>
  );
}

// ── ClickHouse Span 树（适配 tsp_spans 格式）──────────────────────

function ClickHouseSpanTree({ spans }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (sid) => setCollapsed(prev => ({ ...prev, [sid]: !prev[sid] }));

  if (!spans || spans.length === 0) {
    return <div style={{ padding: 14, color: '#5a7090', fontFamily: 'var(--mono)', fontSize: 11 }}>无 Span 数据</div>;
  }

  const spanMap = {};
  spans.forEach(s => { spanMap[s.span_id] = s; });
  const children = {};
  const roots = [];
  spans.forEach(s => {
    const pid = s.parent_span_id;
    if (!pid || pid === '' || !spanMap[pid]) {
      roots.push(s.span_id);
    } else {
      (children[pid] = children[pid] || []).push(s.span_id);
    }
  });

  const maxDur = spans.reduce((m, s) => Math.max(m, Number(s.duration) || 0), 1);

  function renderSpan(sid, depth) {
    const span = spanMap[sid];
    if (!span) return null;
    const svc = span.service_name || '';
    const color = getColor(svc);
    const hasErr = span.status_code === 'ERROR';
    const dur = Number(span.duration) || 0;
    const pct = Math.max(2, (dur / maxDur) * 100);
    const kids = children[sid] || [];
    const hasKids = kids.length > 0;
    const isCollapsed = !!collapsed[sid];
    const peer = span.attributes_map?.['peer.service'] || '';
    const dbSystem = span.attributes_map?.['db.system'] || '';
    const displayPeer = peer || (dbSystem ? (dbSystem === 'mysql' ? 'MySQL' : dbSystem) : '');

    return (
      <div key={sid}>
        <div style={{ paddingLeft: depth * 12, marginBottom: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasKids ? (
              <span onClick={() => toggle(sid)} style={{ color: '#00ff88', fontSize: 9, flexShrink: 0, cursor: 'pointer', userSelect: 'none', padding: '0 2px', lineHeight: '12px' }}>
                {isCollapsed ? '▶' : '▼'}
              </span>
            ) : depth > 0 ? (
              <span style={{ color: '#1e3a5f', fontSize: 9, flexShrink: 0 }}>└</span>
            ) : null}
            {hasKids && !isCollapsed && (
              <span style={{ fontSize: 8, color: '#3a5070', background: 'rgba(30,58,95,0.4)', borderRadius: 2, padding: '0 3px', flexShrink: 0 }}>{kids.length}</span>
            )}
            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', background: color + '22', border: '1px solid ' + color + '44', color, borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap', flexShrink: 0 }}>{svc}</span>
            {displayPeer && <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: getColor(displayPeer), background: getColor(displayPeer) + '22', border: '1px solid ' + getColor(displayPeer) + '44', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>→{displayPeer}</span>}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: hasErr ? '#ff4d6a' : '#94a8c0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{span.operation_name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtDuration(dur / 1000000)}</span>
          </div>
          <div style={{ paddingLeft: (depth + 1) * 12, marginTop: 2 }}>
            <div style={{ height: 3, background: '#1e3a5f', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: pct + '%', height: '100%', background: color, opacity: 0.55, borderRadius: 2 }} />
            </div>
          </div>
        </div>
        {!isCollapsed && kids.map(cid => renderSpan(cid, depth + 1))}
      </div>
    );
  }

  return <div>{roots.map(sid => renderSpan(sid, 0))}</div>;
}
