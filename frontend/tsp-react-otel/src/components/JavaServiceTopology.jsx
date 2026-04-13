/**
 * Java服务链路拓扑页面
 *
 * 数据来源：Java后端服务接口
 *
 * 交互逻辑：
 * 1. 不输入TraceID：查询时间范围内的所有Trace列表，右侧显示列表，点击查看详情和拓扑图
 * 2. 输入TraceID：直接显示该Trace，右侧显示详情，左侧显示拓扑图
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchTraces,
  searchTraces,
  extractEdgesFromTraces,
} from '../javaservice/api.js';

// 默认需要合并的网关服务
const DEFAULT_GATEWAY_SERVICES = ['kong-gateway', 'kong', 'gateway', 'nginx'];

// 节点半径
const NODE_R = 18;

// 时间范围选项
const LOOKBACK_OPTS = [
  { label: '30分钟', value: 1800000 },
  { label: '1小时', value: 3600000 },
  { label: '2小时', value: 7200000 },
  { label: '6小时', value: 21600000 },
  { label: '24小时', value: 86400000 },
];

// 已知中间件/基础设施的固定颜色
const KNOWN_COLORS = {
  'MySQL':  '#f97316',
  'Redis':  '#ef4444',
  'Kafka':  '#eab308',
  'PostgreSQL': '#336791',
  'MongoDB': '#47a248',
};

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

function getServiceColor(serviceName) {
  const name = serviceName.split(':')[0]?.trim() || serviceName;
  return KNOWN_COLORS[name] || hashColor(name);
}

// ── 数据提取函数 ────────────────────────────────────────────────────

/**
 * 合并网关节点
 */
function mergeGatewayNodes(graphData, enabled = true, gatewayServices = DEFAULT_GATEWAY_SERVICES) {
  if (!enabled || !graphData || !graphData.nodes || !graphData.edges) {
    return graphData;
  }

  const { nodes, edges } = graphData;
  if (nodes.length === 0) return graphData;

  const nodeMap = new Map();
  const mergedEdges = new Map();

  // 分类节点
  nodes.forEach(node => {
    const nodeId = node.id;
    const baseService = nodeId.split(':')[0]?.trim() || nodeId;

    if (gatewayServices.includes(baseService) && nodeId.includes(':')) {
      if (!nodeMap.has(baseService)) {
        nodeMap.set(baseService, { id: baseService, originalNodes: [] });
      }
      nodeMap.get(baseService).originalNodes.push(nodeId);
    } else {
      nodeMap.set(nodeId, node);
    }
  });

  // 转换边
  edges.forEach(edge => {
    const source = edge.source;
    const target = edge.target;
    const sourceBase = source.split(':')[0]?.trim() || source;
    const targetBase = target.split(':')[0]?.trim() || target;

    let newSource = source;
    let newTarget = target;

    if (gatewayServices.includes(sourceBase) && source.includes(':')) {
      newSource = sourceBase;
    }
    if (gatewayServices.includes(targetBase) && target.includes(':')) {
      newTarget = targetBase;
    }

    const edgeKey = `${newSource}->${newTarget}`;

    if (!mergedEdges.has(edgeKey)) {
      mergedEdges.set(edgeKey, {
        source: newSource,
        target: newTarget,
        callCount: 0,
        totalDuration: 0,
        durations: [],
        minDuration: Infinity,
        maxDuration: 0,
      });
    }

    const mergedEdge = mergedEdges.get(edgeKey);
    if (edge.callCount) mergedEdge.callCount += edge.callCount;
    if (edge.avgDuration) {
      mergedEdge.totalDuration += edge.avgDuration * (edge.callCount || 1);
      mergedEdge.durations.push(edge.avgDuration);
    }
    if (edge.duration) {
      mergedEdge.totalDuration += edge.duration;
      mergedEdge.durations.push(edge.duration);
      mergedEdge.callCount = Math.max(mergedEdge.callCount, 1);
    }
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

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(mergedEdges.values()),
  };
}

/**
 * 从多条Traces提取聚合拓扑图
 */
function extractAggregatedGraph(traces, mergeGateways = true) {
  const edges = extractEdgesFromTraces(traces);
  const nodeSet = new Set();

  edges.forEach(edge => {
    nodeSet.add(edge.parent);
    nodeSet.add(edge.child);
  });

  const graphData = {
    nodes: Array.from(nodeSet).map(id => ({ id })),
    edges: edges.map(e => ({
      source: e.parent,
      target: e.child,
      callCount: e.callCount,
    })),
  };

  return mergeGatewayNodes(graphData, mergeGateways);
}

/**
 * 从单条Trace提取拓扑图
 */
function extractSingleTraceGraph(trace, mergeGateways = true) {
  const nodeSet = new Set();
  const edgeMap = new Map();

  const spans = trace.spans || [];
  const spanService = {};

  spans.forEach(span => {
    const svc = span.process?.serviceName;
    if (svc) spanService[span.spanID] = svc;
  });

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
          duration: span.duration || 0,
        });
      }
    });
  });

  const graphData = {
    nodes: Array.from(nodeSet).map(id => ({ id })),
    edges: Array.from(edgeMap.values()),
  };

  return mergeGatewayNodes(graphData, mergeGateways);
}

// ── 主组件 ────────────────────────────────────────────────────

export default function JavaServiceTopology() {
  // 图数据
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [pos, setPos] = useState({});

  // Trace数据
  const [traceList, setTraceList] = useState([]); // 所有trace列表
  const [selectedTrace, setSelectedTrace] = useState(null); // 选中的trace

  // 状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lookback, setLookback] = useState(3600000);
  const [searchId, setSearchId] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [mergeGateways, setMergeGateways] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false); // 全屏状态

  // Refs
  const svgRef = useRef(null);
  const svgContainerRef = useRef(null);
  const posRef = useRef({});
  const velRef = useRef({});
  const simRef = useRef(null);
  const dragRef = useRef(null);

  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender(n => n + 1), []);

  // 全屏切换函数
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

  // 加载Trace列表（默认模式）
  const loadTraceList = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedTrace(null);
    setSearchId('');
    setSearchError(null);

    try {
      console.log('[Java服务] 加载Trace列表，时间范围:', lookback, 'ms');

      const traces = await fetchTraces(null, 100, lookback);

      if (!traces || traces.length === 0) {
        setError('该时间段内暂无链路数据');
        setTraceList([]);
        setGraphData({ nodes: [], edges: [] });
        return;
      }

      console.log('[Java服务] 获取到Trace数量:', traces.length);
      setTraceList(traces);

      // 生成聚合拓扑图
      const graph = extractAggregatedGraph(traces, mergeGateways);
      setGraphData(graph);

      console.log('[Java服务] 聚合拓扑图:', graph.nodes.length, '个节点,', graph.edges.length, '条边');
    } catch (err) {
      console.error('[Java服务] 加载失败:', err);
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [lookback, mergeGateways]);

  // 搜索Trace
  const handleSearch = useCallback(async () => {
    if (!searchId.trim()) {
      setSearchError('请输入TraceID');
      return;
    }

    setSearching(true);
    setSearchError(null);
    setSelectedTrace(null);

    try {
      console.log('[Java服务] 搜索TraceID:', searchId);

      const results = await searchTraces({
        traceId: searchId.trim(),
        limit: 50,
        lookbackMs: lookback,
      });

      if (!results || results.length === 0) {
        setSearchError(`未找到TraceID包含 "${searchId}" 的链路`);
        setTraceList([]);
        setGraphData({ nodes: [], edges: [] });
        return;
      }

      console.log('[Java服务] 搜索结果:', results.length, '条');

      // 只有一条结果，直接显示
      if (results.length === 1) {
        const trace = results[0];
        setSelectedTrace(trace);
        setTraceList([trace]);
        const graph = extractSingleTraceGraph(trace, mergeGateways);
        setGraphData(graph);
      } else {
        // 多条结果，显示列表
        setTraceList(results);
        // 生成聚合拓扑图
        const graph = extractAggregatedGraph(results, mergeGateways);
        setGraphData(graph);
      }
    } catch (err) {
      console.error('[Java服务] 搜索失败:', err);
      setSearchError(err.message || '搜索失败');
    } finally {
      setSearching(false);
    }
  }, [searchId, lookback, mergeGateways]);

  // 选择Trace
  const handleSelectTrace = useCallback((trace) => {
    console.log('[Java服务] 选择Trace:', trace.traceID);
    setSelectedTrace(trace);
    const graph = extractSingleTraceGraph(trace, mergeGateways);
    setGraphData(graph);
  }, [mergeGateways]);

  // 物理模拟布局
  const runSimulation = useCallback(() => {
    if (simRef.current) {
      cancelAnimationFrame(simRef.current);
    }

    const nodes = graphData.nodes;
    const edges = graphData.edges;
    const svg = svgRef.current;
    if (!svg || nodes.length === 0) return;

    const { width: w, height: h } = svg.getBoundingClientRect();
    const PAD = NODE_R + 10;

    // 初始化位置和速度
    if (Object.keys(posRef.current).length === 0 || nodes.length !== Object.keys(posRef.current).length) {
      posRef.current = {};
      velRef.current = {};
      nodes.forEach(n => {
        posRef.current[n.id] = {
          x: PAD + Math.random() * (w - PAD * 2),
          y: PAD + Math.random() * (h - PAD * 2),
        };
        velRef.current[n.id] = { x: 0, y: 0 };
      });
    }

    // 确保所有节点都有位置
    nodes.forEach(n => {
      if (!posRef.current[n.id]) {
        posRef.current[n.id] = {
          x: PAD + Math.random() * (w - PAD * 2),
          y: PAD + Math.random() * (h - PAD * 2),
        };
        velRef.current[n.id] = { x: 0, y: 0 };
      }
    });

    let tick = 0;
    const MAX = 600;

    function step() {
      tick++;
      if (dragRef.current) {
        simRef.current = requestAnimationFrame(step);
        return;
      }

      const alpha = Math.max(0.003, 1 - tick / MAX);
      const pos = posRef.current;
      const vel = velRef.current;
      const cx = w / 2, cy = h / 2;

      // 排斥力
      nodes.forEach(a => {
        nodes.forEach(b => {
          if (a.id === b.id) return;
          const dx = pos[a.id].x - pos[b.id].x;
          const dy = pos[a.id].y - pos[b.id].y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (5000 / (d * d)) * alpha;
          vel[a.id].x += (dx / d) * f;
          vel[a.id].y += (dy / d) * f;
        });

        // 中心引力
        vel[a.id].x += (cx - pos[a.id].x) * 0.01 * alpha;
        vel[a.id].y += (cy - pos[a.id].y) * 0.01 * alpha;
      });

      // 弹簧力
      edges.forEach(e => {
        const a = pos[e.source], b = pos[e.target];
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = 200;
        const f = ((d - ideal) / d) * 0.08 * alpha;
        vel[e.source].x += dx * f;
        vel[e.source].y += dy * f;
        vel[e.target].x -= dx * f;
        vel[e.target].y -= dy * f;
      });

      // 更新位置
      nodes.forEach(n => {
        vel[n.id].x *= 0.72;
        vel[n.id].y *= 0.72;
        pos[n.id].x = Math.max(PAD, Math.min(w - PAD, pos[n.id].x + vel[n.id].x));
        pos[n.id].y = Math.max(PAD, Math.min(h - PAD, pos[n.id].y + vel[n.id].y));
      });

      setPos({ ...pos });
      rerender();

      if (tick < MAX) {
        simRef.current = requestAnimationFrame(step);
      }
    }

    simRef.current = requestAnimationFrame(step);
  }, [graphData, rerender]);

  // 初始加载
  useEffect(() => {
    loadTraceList();
  }, []); // 只在组件挂载时加载

  // 数据变化时重新布局
  useEffect(() => {
    if (graphData.nodes.length > 0) {
      posRef.current = {};
      runSimulation();
    }
  }, [graphData, runSimulation]);

  // 拖拽处理
  const handleMouseDown = useCallback((e, nodeId) => {
    e.preventDefault();
    dragRef.current = {
      nodeId,
      offsetX: e.clientX - posRef.current[nodeId].x,
      offsetY: e.clientY - posRef.current[nodeId].y,
    };
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    const nodeId = dragRef.current.nodeId;
    posRef.current[nodeId].x = e.clientX - dragRef.current.offsetX;
    posRef.current[nodeId].y = e.clientY - dragRef.current.offsetY;
    setPos({ ...posRef.current });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // 格式化耗时
  const fmtDuration = useCallback((us) => {
    if (us < 1000) return us + 'μs';
    if (us < 1000000) return (us / 1000).toFixed(2) + 'ms';
    return (us / 1000000).toFixed(2) + 's';
  }, []);

  return (
    <div style={{ padding: '16px 0' }}>
      {/* 控制栏 */}
      <div style={{
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        background: 'rgba(13,21,32,0.9)',
        border: '1px solid #1e3a5f',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 14,
      }}>
        {/* 标题 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingRight: 12,
          borderRight: '1px solid #1e3a5f',
        }}>
          <span style={{ fontSize: 16, color: '#ff8800' }}>🚀</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e8f0fe', lineHeight: 1.2 }}>
              Java服务拓扑
            </div>
            <div style={{ fontSize: 10, color: '#5a7090', fontFamily: 'var(--mono)' }}>
              数据来源: Java后端服务
            </div>
          </div>
        </div>

        {/* 网关注合并 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 8,
          borderLeft: '1px solid #1e3a5f',
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: '#5a7090',
            userSelect: 'none',
          }} title="合并网关服务的多个端点节点">
            <input
              type="checkbox"
              checked={mergeGateways}
              onChange={e => setMergeGateways(e.target.checked)}
              style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#00d4ff' }}
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
            placeholder="输入 TraceID 搜索（支持模糊），留空查看所有Trace..."
            style={{
              flex: 1,
              padding: '6px 12px',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid #1e3a5f',
              borderRadius: 5,
              color: '#e8f0fe',
              fontFamily: 'var(--mono)',
              fontSize: 12,
              outline: 'none',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            style={{
              padding: '6px 14px',
              borderRadius: 5,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 12,
              background: 'rgba(0,212,255,0.1)',
              border: '1px solid #00d4ff44',
              color: searching ? '#5a7090' : '#00d4ff',
            }}
          >
            {searching ? '搜索中...' : '🔍 搜索'}
          </button>
          {(searchId || selectedTrace) && (
            <button
              onClick={() => {
                setSearchId('');
                setSearchError(null);
                setSelectedTrace(null);
                loadTraceList();
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 5,
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                background: 'transparent',
                border: '1px solid #1e3a5f',
                color: '#5a7090',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* 时间范围 */}
        <div style={{ display: 'flex', gap: 5 }}>
          {LOOKBACK_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setLookback(opt.value)}
              style={{
                padding: '4px 9px',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                background: lookback === opt.value ? 'rgba(77,166,255,0.2)' : 'transparent',
                border: '1px solid ' + (lookback === opt.value ? '#4da6ff' : '#1e3a5f'),
                color: lookback === opt.value ? '#4da6ff' : '#5a7090',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={loadTraceList}
          disabled={loading}
          style={{
            padding: '6px 14px',
            borderRadius: 5,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            background: 'rgba(0,255,136,0.1)',
            border: '1px solid #00ff8844',
            color: loading ? '#5a7090' : '#00ff88',
          }}
        >
          {loading ? '⟳' : '↺ 刷新'}
        </button>
      </div>

      {/* 状态提示 */}
      {selectedTrace ? (
        <div style={{
          background: 'rgba(176,106,255,0.08)',
          border: '1px solid #b06aff44',
          borderRadius: 6,
          padding: '8px 14px',
          fontFamily: 'var(--mono)',
          fontSize: 12,
          color: '#b06aff',
          marginBottom: 14,
        }}>
          🔍 单次Trace模式 — 线条显示该次调用的响应耗时 — TraceID: {selectedTrace.traceID?.slice(0, 16)}...
        </div>
      ) : (
        <div style={{
          background: 'rgba(77,166,255,0.08)',
          border: '1px solid #4da6ff44',
          borderRadius: 6,
          padding: '8px 14px',
          fontFamily: 'var(--mono)',
          fontSize: 12,
          color: '#4da6ff',
          marginBottom: 14,
        }}>
          📊 全局聚合模式 — 线条显示"调用次数 · 平均耗时" — Trace数量: {traceList.length} — 时间范围: {LOOKBACK_OPTS.find(o => o.value === lookback)?.label}
        </div>
      )}

      {error && (
        <div style={{
          background: 'rgba(255,77,106,0.1)',
          border: '1px solid #ff4d6a44',
          borderRadius: 6,
          padding: '8px 14px',
          fontFamily: 'var(--mono)',
          fontSize: 12,
          color: '#ff4d6a',
          marginBottom: 14,
        }}>
          ⚠️ {error}
        </div>
      )}

      {searchError && (
        <div style={{
          background: 'rgba(255,77,106,0.1)',
          border: '1px solid #ff4d6a44',
          borderRadius: 6,
          padding: '8px 14px',
          fontFamily: 'var(--mono)',
          fontSize: 12,
          color: '#ff4d6a',
          marginBottom: 14,
        }}>
          ❌ {searchError}
        </div>
      )}

      {/* 拓扑图和右侧面板 */}
      <div style={{ display: 'flex', gap: 14, height: '100%' }}>
        {/* 拓扑图 */}
        <div
          ref={svgContainerRef}
          style={{
            flex: 1,
            minHeight: 560,
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
              borderRadius: 0,
              border: 'none',
              zIndex: 9999,
            } : {}),
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
              transition: 'all 0.2s',
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

          <svg
            ref={svgRef}
            width="100%"
            height={560}
            style={{ display: 'block', userSelect: 'none', cursor: dragRef.current ? 'grabbing' : 'default' }}
          >
            <defs>
              {/* 箭头标记 */}
              {Object.values(SERVICE_COLORS).filter((v, i, a) => a.indexOf(v) === i).map(color => (
                <marker
                  key={color}
                  id={'arr-' + color.replace('#', '')}
                  markerWidth="7"
                  markerHeight="7"
                  refX="5"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 7 3.5, 0 7" fill={color} opacity="0.5" />
                </marker>
              ))}
              <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <pattern
                id="grid"
                width="28"
                height="28"
                patternUnits="userSpaceOnUse"
              >
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#1e3a5f" strokeWidth="0.4" opacity="0.4" />
              </pattern>
            </defs>
            <rect width="100%" height={560} fill="url(#grid)" />

            {/* 边 */}
            {graphData.edges.map((e, i) => {
              const src = pos[e.source], tgt = pos[e.target];
              if (!src || !tgt) return null;

              const color = getServiceColor(e.source);
              const dx = tgt.x - src.x, dy = tgt.y - src.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const x1 = src.x + (dx / len) * NODE_R, y1 = src.y + (dy / len) * NODE_R;
              const x2 = tgt.x - (dx / len) * (NODE_R + 5), y2 = tgt.y - (dy / len) * (NODE_R + 5);
              const mx = (x1 + x2) / 2 - dy * 0.12, my = (y1 + y2) / 2 + dx * 0.12;

              // 根据模式显示不同信息
              const label = selectedTrace
                ? fmtDuration(e.duration || 0)
                : `${e.callCount || 0} · ${fmtDuration(e.avgDuration || 0)}`;

              return (
                <g key={i}>
                  <path
                    d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    strokeOpacity="0.35"
                    markerEnd={`url(#arr-${color.replace('#', '')})`}
                  />
                  <text
                    x={(x1 + x2) / 2 - dy * 0.06}
                    y={(y1 + y2) / 2 + dx * 0.06}
                    textAnchor="middle"
                    fill={color}
                    fontSize="9"
                    fontFamily="JetBrains Mono,monospace"
                    opacity="0.7"
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* 节点 */}
            {graphData.nodes.map(node => {
              const p = pos[node.id];
              if (!p) return null;

              const color = getServiceColor(node.id);
              const isEndpoint = node.id.includes(':');
              let displayLabel = node.id;

              if (isEndpoint) {
                const parts = node.id.split(':');
                if (parts.length >= 2) {
                  displayLabel = parts[0] + ':' + (parts[1].length > 13 ? parts[1].slice(0, 12) + '…' : parts[1]);
                }
              } else {
                displayLabel = node.id.length > 13 ? node.id.slice(0, 12) + '…' : node.id;
              }

              return (
                <g
                  key={node.id}
                  transform={`translate(${p.x},${p.y})`}
                  style={{ cursor: 'grab' }}
                  onMouseDown={e => handleMouseDown(e, node.id)}
                >
                  <circle r={NODE_R + 2} fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.35" />
                  <circle r={NODE_R} fill="rgba(8,13,20,0.97)" stroke={color} strokeWidth="2" />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    y={isEndpoint ? -9 : -7}
                    fontSize={isEndpoint ? 12 : 15}
                    fill={color}
                  >
                    {isEndpoint ? '⚡' : '●'}
                  </text>
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    y={isEndpoint ? 3 : 11}
                    fontSize="9"
                    fontFamily="JetBrains Mono,monospace"
                    fill={color}
                    fontWeight="normal"
                  >
                    {displayLabel}
                  </text>
                  <title>{node.id}</title>
                </g>
              );
            })}

            {/* 空状态 */}
            {!loading && graphData.nodes.length === 0 && (
              <text
                x="50%"
                y="50%"
                textAnchor="middle"
                fill="#5a7090"
                fontSize="13"
                fontFamily="JetBrains Mono,monospace"
              >
                暂无数据 — 调整时间范围后点击刷新 或 输入TraceID搜索
              </text>
            )}
          </svg>

          {/* 统计信息 */}
          <div style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 10,
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: '#5a7090',
          }}>
            {graphData.nodes.length} 节点 · {graphData.edges.length} 边
          </div>
        </div>

        {/* 右侧面板 */}
        <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          {/* Trace列表 */}
          <div style={{
            flex: selectedTrace ? '0 0 auto' : 1,
            maxHeight: selectedTrace ? 220 : '100%',
            background: 'rgba(13,21,32,0.9)',
            border: '1px solid #1e3a5f',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 14px',
              borderBottom: '1px solid #1e3a5f',
              fontFamily: 'var(--mono)',
              fontSize: 12,
              color: '#94a8c0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: selectedTrace ? '#b06aff' : '#00d4ff',
              }} />
              {selectedTrace ? (
                <span style={{ color: '#b06aff' }}>Trace 详情</span>
              ) : (
                <>
                  <span style={{ color: '#00d4ff' }}>Trace 列表</span>
                  <span style={{ color: '#5a7090' }}>(共{traceList.length}条)</span>
                </>
              )}
              {traceList.length > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: '#1e3a5f',
                  borderRadius: 8,
                  padding: '1px 6px',
                  fontSize: 10,
                }}>
                  {traceList.length}
                </span>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {traceList.length === 0 && !loading && (
                <div style={{
                  padding: 20,
                  textAlign: 'center',
                  color: '#5a7090',
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                }}>
                  {searchId ? '输入TraceID后点击搜索' : '点击刷新按钮加载Trace列表'}
                </div>
              )}
              {traceList.map(trace => (
                <TraceItem
                  key={trace.traceID}
                  trace={trace}
                  selected={selectedTrace?.traceID === trace.traceID}
                  onClick={() => handleSelectTrace(trace)}
                />
              ))}
            </div>
          </div>

          {/* Trace详情 */}
          {selectedTrace && (
            <div style={{
              flex: 1,
              background: 'rgba(13,21,32,0.9)',
              border: '1px solid #1e3a5f',
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '10px 14px',
                borderBottom: '1px solid #1e3a5f',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#94a8c0' }}>
                  Span 详情
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#4da6ff' }}>
                  {selectedTrace.traceID.slice(0, 14)}...
                </span>
                {(() => {
                  const spans = selectedTrace.spans || [];
                  const root = spans.find(s => !s.references?.length);
                  const hasErr = spans.some(s => (s.tags || []).some(t => t.key === 'error' && t.value));
                  return (
                    <>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090' }}>
                        {root ? fmtDuration(root.duration) : ''}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: hasErr ? '#ff4d6a' : '#00ff88' }}>
                        {hasErr ? '✗' : '✓'}
                      </span>
                    </>
                  );
                })()}
                <button
                  onClick={() => {
                    setSelectedTrace(null);
                  }}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    color: '#5a7090',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                  title="返回列表模式"
                >
                  ×
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
                <SpanTree trace={selectedTrace} fmtDuration={fmtDuration} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 使用说明 */}
      <div style={{
        marginTop: 14,
        padding: '12px 14px',
        background: 'rgba(13,21,32,0.9)',
        border: '1px solid #1e3a5f',
        borderRadius: 8,
        fontSize: 11,
        fontFamily: 'var(--mono)',
        color: '#5a7090',
      }}>
        <div style={{ marginBottom: 6, color: '#e8f0fe' }}>📋 Java服务接口状态</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 4 }}>
          <div>✅ GET /traces - 时间范围查询</div>
          <div>✅ GET /traces/search?traceId=xxx - TraceID搜索</div>
        </div>
        <div style={{ marginTop: 8, color: '#ffa502' }}>
          ⚠️ 注意：以上接口为框架代码，需要Java后端提供实际API实现
        </div>
      </div>
    </div>
  );
}

// ── 辅助组件 ────────────────────────────────────────────────────

function TraceItem({ trace, selected, onClick }) {
  const root = (trace.spans || []).find(s => !s.references?.length);
  const hasErr = (trace.spans || []).some(s => (s.tags || []).some(t => t.key === 'error' && t.value));

  const fmtDuration = (us) => {
    if (us < 1000) return us + 'μs';
    if (us < 1000000) return (us / 1000).toFixed(2) + 'ms';
    return (us / 1000000).toFixed(2) + 's';
  };

  const fmtTime = (us) => {
    const date = new Date(us / 1000);
    return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div
      onClick={() => onClick(trace)}
      style={{
        padding: '9px 14px',
        borderBottom: '1px solid #0d1520',
        cursor: 'pointer',
        background: selected ? 'rgba(176,106,255,0.15)' : 'transparent',
        transition: 'background 0.2s',
        borderLeft: selected ? '3px solid #b06aff' : '3px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'rgba(30,58,95,0.5)';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#4da6ff' }}>
          {trace.traceID.slice(0, 14)}...
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: hasErr ? '#ff4d6a' : '#00ff88' }}>
          {hasErr ? '✗ ERR' : '✓ OK'} · {root ? fmtDuration(root.duration) : '-'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: '#5a7090',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {root?.operationName || '-'}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#3a5070', flexShrink: 0, marginLeft: 6 }}>
          {root ? fmtTime(root.startTime) : ''}
        </span>
      </div>
    </div>
  );
}

function SpanTree({ trace, fmtDuration }) {
  const spans = trace.spans || [];
  const processes = trace.processes || {};
  const spanMap = {};

  spans.forEach(s => {
    spanMap[s.spanID] = s;
  });

  const children = {};
  const roots = [];

  spans.forEach(s => {
    const p = s.references?.find(r => r.refType === 'CHILD_OF');
    if (p && spanMap[p.spanID]) {
      (children[p.spanID] = children[p.spanID] || []).push(s.spanID);
    } else {
      roots.push(s.spanID);
    }
  });

  const maxDur = spans.reduce((m, s) => Math.max(m, s.duration), 1);

  // 获取服务颜色
  const getServiceColor = (serviceName) => {
    const SERVICE_COLORS = {
      'kong-gateway': '#ff8800',
      'kong': '#ff8800',
      'user-service': '#00ff88',
      'order-service': '#4da6ff',
      'product-service': '#b06aff',
      'payment-service': '#ff4757',
      'default': '#00d4ff',
    };
    return SERVICE_COLORS[serviceName] || SERVICE_COLORS.default;
  };

  function renderSpan(sid, depth) {
    const span = spanMap[sid];
    if (!span) return null;

    const svc = (processes[span.processID] || {}).serviceName || '';
    const color = getServiceColor(svc);
    const hasErr = (span.tags || []).some(t => t.key === 'error' && t.value === true);
    const peer = ((span.tags || []).find(t => t.key === 'peer.service') || {}).value;
    const pct = Math.max(2, (span.duration / maxDur) * 100);

    return (
      <div key={sid}>
        <div style={{ paddingLeft: depth * 12, marginBottom: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {depth > 0 && (
              <span style={{ color: '#1e3a5f', fontSize: 9, flexShrink: 0 }}>└</span>
            )}
            <span style={{
              fontSize: 9,
              fontFamily: 'var(--mono)',
              background: color + '22',
              border: '1px solid ' + color + '44',
              color,
              borderRadius: 3,
              padding: '1px 4px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {svc}
            </span>
            {peer && (
              <span style={{
                fontSize: 9,
                fontFamily: 'var(--mono)',
                color: getServiceColor(peer),
                background: getServiceColor(peer) + '22',
                border: '1px solid ' + getServiceColor(peer) + '44',
                borderRadius: 3,
                padding: '1px 4px',
                flexShrink: 0,
              }}>
                →{peer}
              </span>
            )}
            <span style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: hasErr ? '#ff4d6a' : '#94a8c0',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {span.operationName}
            </span>
            <span style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: '#5a7090',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {fmtDuration(span.duration)}
            </span>
          </div>
          <div style={{ paddingLeft: (depth + 1) * 12, marginTop: 2 }}>
            <div style={{ height: 3, background: '#1e3a5f', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: pct + '%',
                height: '100%',
                background: color,
                opacity: 0.55,
                borderRadius: 2,
              }} />
            </div>
          </div>
          {/* Tags */}
          {span.tags && span.tags.length > 0 && (
            <div style={{ paddingLeft: (depth + 1) * 12, marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {span.tags.slice(0, 5).map((tag, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: 8,
                    fontFamily: 'var(--mono)',
                    color: '#5a7090',
                    background: 'rgba(30,58,95,0.5)',
                    borderRadius: 2,
                    padding: '1px 4px',
                  }}
                >
                  {tag.key}={tag.value}
                </span>
              ))}
              {span.tags.length > 5 && (
                <span style={{ fontSize: 8, color: '#4a6080' }}>+{span.tags.length - 5}</span>
              )}
            </div>
          )}
        </div>
        {(children[sid] || []).map(cid => renderSpan(cid, depth + 1))}
      </div>
    );
  }

  return <div>{roots.map(sid => renderSpan(sid, 0))}</div>;
}
