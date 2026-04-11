/**
 * 华为云APM V3 - 通过API获取真实trace数据
 * 基于华为云APM接口动态查询，数据格式与V2相同（嵌套children）
 */

import { useState, useCallback, useEffect, useRef } from 'react';

const API_BASE = '/apm';

const NODE_COLORS = {
  'tsp-react-frontend': '#00d4ff',
  'kong': '#ffd700',
  'tsp-trace-service1': '#4da6ff',
  'tsp-trace-service2': '#00ff88',
  'Redis': '#ef4444',
  'MySQL': '#f97316',
  'ASYNC_THREAD': '#8b5cf6',
  'default': '#94a8c0',
};

const NODE_ICONS = {
  'MySQL': '\u{1F5C4}',
  'Redis': '\u26A1',
  'tsp-react-frontend': '\u{1F4BB}',
  'kong': '\u{1F6AA}',
  'tsp-trace-service1': '\u{1F527}',
  'tsp-trace-service2': '\u2699\uFE0F',
  'ASYNC_THREAD': '\u{1F504}',
  'default': '\u2699',
};

const NODE_R = 34;
const MIDDLEWARE = ['MySQL', 'Redis', 'Kafka', 'mysql', 'redis', 'ASYNC_THREAD'];

function getColor(nodeId) {
  if (nodeId.startsWith('async.')) return NODE_COLORS['ASYNC_THREAD'] || NODE_COLORS.default;
  return NODE_COLORS[nodeId] || NODE_COLORS.default;
}

function getIcon(nodeId) {
  if (nodeId.startsWith('async.')) return NODE_ICONS['ASYNC_THREAD'] || NODE_ICONS.default;
  return NODE_ICONS[nodeId] || NODE_ICONS.default;
}

function formatDuration(microseconds) {
  if (microseconds >= 1000000) return (microseconds / 1000000).toFixed(2) + 's';
  if (microseconds >= 1000) return (microseconds / 1000).toFixed(1) + 'ms';
  return microseconds + '\u03BCs';
}

// 层次化布局算法（BFS拓扑排序求最长路径）
function calculateHierarchicalLayout(nodes, edges, width, height) {
  if (!edges || edges.length === 0) {
    const cx = width / 2, cy = height / 2;
    const r = Math.min(width, height) * 0.3;
    const positions = {};
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      positions[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
    return positions;
  }

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

  // BFS 拓扑排序，计算每个节点的最长路径深度
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

  // 按深度分组
  const maxDepth = Math.max(...nodeDepth.values(), 0);
  const layers = Array.from({ length: maxDepth + 1 }, () => []);
  sorted.forEach(nodeId => layers[nodeDepth.get(nodeId) || 0].push(nodeId));
  const allLayers = layers.filter(l => l.length > 0);

  // 每层排序
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
  const totalWidth = (allLayers.length - 1) * levelWidth;
  const totalHeight = (maxNodes - 1) * nodeSpacing;
  const startX = Math.max(NODE_R + 20, (width - totalWidth) / 2);
  const startY = Math.max(NODE_R + 20, (height - totalHeight) / 2);
  const positions = {};

  allLayers.forEach((layer, layerIndex) => {
    const x = startX + layerIndex * levelWidth;
    const layerHeight = (layer.length - 1) * nodeSpacing;
    const layerStartY = Math.max(NODE_R + 20, startY + (maxNodes * nodeSpacing - layerHeight) / 2);
    layer.forEach((nodeId, index) => {
      positions[nodeId] = { x: x, y: layerStartY + index * nodeSpacing };
    });
  });

  return positions;
}

// 转换嵌套格式为扁平列表
function convertNestedFormat(data) {
  const flatList = [];
  const flatten = (spans, parentSpanId = null) => {
    if (!Array.isArray(spans)) return;
    spans.forEach(span => {
      flatList.push({ ...span, parent_spanId: parentSpanId, children: undefined });
      if (span.children && Array.isArray(span.children)) flatten(span.children, span.span_id);
    });
  };
  if (data.span_list) flatten(data.span_list);
  return flatList;
}

// 从扁平span列表生成拓扑图数据
function buildGraphData(spanEventList) {
  const nodeSet = new Set();
  const edgeMap = new Map();
  const spanInfo = new Map();

  spanEventList.forEach(span => {
    const spanId = span.span_id || span.id;
    spanInfo.set(spanId, {
      appName: span.app_name || span.appName,
      type: span.span_type || span.type,
      duration: (span.time_used || span.duration || 0) * 1000,
      tags: span.tags || {},
    });
  });

  spanEventList.forEach(span => {
    const spanId = span.span_id || span.id;
    const info = spanInfo.get(spanId);
    if (!info) return;

    const { appName, type, duration, tags } = info;
    nodeSet.add(appName);

    // CLIENT -> SERVER 子节点
    if (type === 'SPAN_KIND_CLIENT' || type?.includes('CLIENT')) {
      const children = spanEventList.filter(s => s.parent_spanId === spanId);
      children.forEach(child => {
        const childInfo = spanInfo.get(child.span_id || child.id);
        if (!childInfo) return;
        if ((childInfo.type === 'SPAN_KIND_SERVER' || childInfo.type?.includes('SERVER')) && childInfo.appName !== appName) {
          const edgeKey = `${appName}->${childInfo.appName}`;
          if (!edgeMap.has(edgeKey)) edgeMap.set(edgeKey, { source: appName, target: childInfo.appName, count: 0, totalDuration: 0 });
          const edge = edgeMap.get(edgeKey);
          edge.count += 1;
          edge.totalDuration += (childInfo.duration || duration);
        }
      });
    }

    // peer 服务 / DB
    let peer = tags?.['peer.service'] || '';
    if (!peer && tags?.['db.system']) {
      peer = tags['db.system'] === 'redis' ? 'Redis' : tags['db.system'] === 'mysql' ? 'MySQL' : tags['db.system'].toUpperCase();
    }
    if (peer && peer !== appName) {
      nodeSet.add(peer);
      const edgeKey = `${appName}->${peer}`;
      if (!edgeMap.has(edgeKey)) edgeMap.set(edgeKey, { source: appName, target: peer, count: 0, totalDuration: 0 });
      const edge = edgeMap.get(edgeKey);
      edge.count += 1;
      edge.totalDuration += duration;
    }

    // 异步线程池节点
    const asyncType = tags?.['async.type'] || '';
    if (asyncType === '@Async' || asyncType === 'Manual-Context') {
      const taskName = tags?.['task.name'] || '';
      if (taskName) {
        const virtualNodeId = `async.${taskName}`;
        nodeSet.add(virtualNodeId);
        const edgeKey = `${appName}->${virtualNodeId}`;
        if (!edgeMap.has(edgeKey)) edgeMap.set(edgeKey, { source: appName, target: virtualNodeId, count: 0, totalDuration: 0 });
        const edge = edgeMap.get(edgeKey);
        edge.count += 1;
        edge.totalDuration += duration;
      }
    }
  });

  return {
    nodes: Array.from(nodeSet).map(id => ({ id })),
    edges: Array.from(edgeMap.values()).map(e => ({
      source: e.source, target: e.target,
      callCount: e.count,
      avgDuration: e.count > 0 ? Math.round(e.totalDuration / e.count) : 0
    })),
  };
}

// Span节点组件（递归）
function SpanNode({ span, level = 0, maxDur }) {
  const [open, setOpen] = useState(true);
  const hasChildren = span.children && span.children.length > 0;

  const appName = span.app_name || 'unknown';
  const color = getColor(appName);
  const operationName = span.operation_name || span.method || 'unknown';
  const duration = (span.time_used || span.duration || 0) * 1000;
  const tags = span.tags || {};
  const peerService = tags['peer.service'] || '';
  const dbSystem = tags['db.system'] || '';

  const pct = Math.max(2, (duration / (maxDur || 1)) * 100);
  const tagArray = Object.entries(tags).map(([key, value]) => ({ key, value }));

  return (
    <div>
      <div style={{ paddingLeft: level * 12, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
        {hasChildren && (
          <span onClick={() => setOpen(!open)} style={{ color: '#4da6ff', fontSize: 9, flexShrink: 0, cursor: 'pointer', userSelect: 'none', padding: '0 2px' }} title={open ? '\u6298\u53E0' : '\u5C55\u5F00'}>
            {open ? '\u25BC' : '\u25B6'}
          </span>
        )}
        {level > 0 && <span style={{ color: '#1e3a5f', fontSize: 9, flexShrink: 0 }}>\u2514</span>}
        <span style={{ fontSize: 9, fontFamily: 'var(--mono)', background: color + '22', border: '1px solid ' + color + '44', color, borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {appName}
        </span>
        {peerService && (
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: getColor(peerService), background: getColor(peerService) + '22', border: '1px solid ' + getColor(peerService) + '44', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>
            {String.fromCharCode(8594)}{peerService}
          </span>
        )}
        {dbSystem && (
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: getColor(dbSystem === 'redis' ? 'Redis' : 'MySQL'), background: getColor(dbSystem === 'redis' ? 'Redis' : 'MySQL') + '22', border: '1px solid ' + getColor(dbSystem === 'redis' ? 'Redis' : 'MySQL') + '44', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>
            DB:{dbSystem}
          </span>
        )}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#94a8c0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {operationName}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {formatDuration(duration)}
        </span>
      </div>
      <div style={{ paddingLeft: (level + 1) * 12, marginTop: 2 }}>
        <div style={{ height: 3, background: '#1e3a5f', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: pct + '%', height: '100%', background: color, opacity: 0.55, borderRadius: 2 }} />
        </div>
      </div>
      {tagArray.length > 0 && (
        <div style={{ paddingLeft: (level + 1) * 12, marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {tagArray.slice(0, 5).map((tag, idx) => (
            <span key={idx} style={{ fontSize: 8, fontFamily: 'var(--mono)', color: '#5a7090', background: 'rgba(30,58,95,0.5)', borderRadius: 2, padding: '1px 4px' }}>
              {tag.key}={String(tag.value).substring(0, 20)}
            </span>
          ))}
          {tagArray.length > 5 && <span style={{ fontSize: 8, color: '#4a6080' }}>+{tagArray.length - 5}</span>}
        </div>
      )}
      {open && hasChildren && span.children.map((child) => (
        <SpanNode key={child.span_id} span={child} level={level + 1} maxDur={maxDur} />
      ))}
    </div>
  );
}

export default function HuaweiCloudV3() {
  const [traceIdInput, setTraceIdInput] = useState('d38b2c0d718a9efb81f0c1677f981a6b');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [traceTreeData, setTraceTreeData] = useState({ spans: [], traceId: 'unknown' });
  const [, forceRender] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  const posRef = useRef({});
  const dragRef = useRef(null);
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  const rerender = useCallback(() => forceRender(n => n + 1), []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const initNodePositions = useCallback((nodes, edges) => {
    setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) {
        initNodePositions(nodes, edges);
        return;
      }
      const positions = calculateHierarchicalLayout(nodes, edges, width, height);
      posRef.current = positions;
      rerender();
    }, 50);
  }, [rerender]);

  const fetchTraceData = useCallback(async () => {
    const tid = traceIdInput.trim();
    if (!tid) return;

    setLoading(true);
    setErrorMsg('');
    setGraphData({ nodes: [], edges: [] });
    setTraceTreeData({ spans: [], traceId: tid });
    posRef.current = {};

    try {
      const url = `${API_BASE}/get-trace-events?trace_id=${encodeURIComponent(tid)}&is_otel=true`;
      console.log('[华为云V3] 请求:', url);

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();

      if (json.code !== 0 || !json.data?.span_list?.length) {
        throw new Error(json.msg || '未找到trace数据');
      }

      const data = json.data;
      const spanEventList = convertNestedFormat(data);
      const graph = buildGraphData(spanEventList);

      console.log('[华为云V3] 节点:', graph.nodes.map(n => n.id));
      console.log('[华为云V3] 边:', graph.edges);
      console.log('[华为云V3] Span 总数:', spanEventList.length);

      setGraphData(graph);
      setTraceTreeData({ spans: data.span_list, traceId: tid });
      initNodePositions(graph.nodes, graph.edges);
    } catch (err) {
      console.error('[华为云V3] 请求失败:', err);
      setErrorMsg(err.message || '请求失败');
    } finally {
      setLoading(false);
    }
  }, [traceIdInput, initNodePositions]);

  // 初始加载
  useEffect(() => {
    fetchTraceData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 拖拽
  const onNodeMouseDown = useCallback((e, nodeId) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = svgRef.current.getBoundingClientRect();
    dragRef.current = {
      nodeId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      offsetX: e.clientX - rect.left - (posRef.current[nodeId]?.x || 0),
      offsetY: e.clientY - rect.top - (posRef.current[nodeId]?.y || 0),
      moved: false,
    };
    setSelectedNode(nodeId);
  }, []);

  useEffect(() => {
    function onMouseMove(e) {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startClientX;
      const dy = e.clientY - dragRef.current.startClientY;
      if (Math.sqrt(dx * dx + dy * dy) > 4) dragRef.current.moved = true;
      if (!dragRef.current.moved) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const PAD = NODE_R + 10;
      const x = Math.max(PAD, Math.min(rect.width - PAD, e.clientX - rect.left - dragRef.current.offsetX));
      const y = Math.max(PAD, Math.min(rect.height - PAD, e.clientY - rect.top - dragRef.current.offsetY));
      posRef.current[dragRef.current.nodeId] = { x, y };
      rerender();
    }
    function onMouseUp() { dragRef.current = null; rerender(); }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [rerender]);

  const pos = posRef.current;
  const isDragging = !!dragRef.current;

  const maxDur = (() => {
    const all = [];
    const collect = (spans) => {
      if (!Array.isArray(spans)) return;
      spans.forEach(s => { all.push(s); if (s.children?.length) collect(s.children); });
    };
    collect(traceTreeData.spans);
    return all.reduce((m, e) => Math.max(m, (e.time_used || e.duration || 0) * 1000), 1);
  })();

  return (
    <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', padding: '16px 20px', background: 'rgba(13,21,32,0.9)', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#e8f0fe', fontSize: '16px', fontWeight: 600, fontFamily: 'var(--mono)' }}>
              {'\uD83D\uDE80'} 华为云APM {'\u00B7'} 实时查询
            </h2>
            <p style={{ margin: '8px 0 0 0', color: '#5a7090', fontSize: '12px', fontFamily: 'var(--mono)' }}>通过 TraceID 从华为云APM接口获取实时数据</p>
          </div>
          <button
            onClick={fetchTraceData}
            disabled={loading}
            style={{ padding: '6px 14px', borderRadius: 5, cursor: loading ? 'wait' : 'pointer', fontFamily: 'var(--mono)', fontSize: 12, background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff8844', color: '#00ff88', opacity: loading ? 0.5 : 1 }}
          >
            {loading ? '\u23F3 \u67E5\u8BE2\u4E2D...' : '\u21BA \u67E5\u8BE2'}
          </button>
        </div>
        {/* TraceID 输入框 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#5a7090', whiteSpace: 'nowrap' }}>Trace ID:</span>
          <input
            value={traceIdInput}
            onChange={e => setTraceIdInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchTraceData()}
            placeholder={'\u8F93\u5165 Trace ID...'}
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 4,
              background: 'rgba(8,13,20,0.9)', border: '1px solid #1e3a5f', color: '#e8f0fe',
              fontFamily: 'JetBrains Mono,monospace', fontSize: 12, outline: 'none',
            }}
          />
          {errorMsg && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#ff4d6a', whiteSpace: 'nowrap' }}>{errorMsg}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '14px' }}>
        {/* 左侧拓扑图 */}
        <div ref={containerRef} style={{ flex: 1, height: '560px', background: 'rgba(8,13,20,0.95)', border: '1px solid #1e3a5f', borderRadius: 10, position: 'relative', overflow: 'hidden' }}>
          {/* 图例 */}
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {graphData.nodes.map(node => (
              <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: getColor(node.id) }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090' }}>{node.id}</span>
              </div>
            ))}
            <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #1e3a5f' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#4da6ff' }}>{'\u7EBF\u6761:'}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#5a7090' }}>{'\u6B21\u6570\u00B7\u5E73\u5747\u8017\u65F6'}</span>
              </div>
            </div>
          </div>

          {/* 节点/边数 + 全屏按钮 */}
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#5a7090' }}>
              {graphData.nodes.length} {'\u8282\u70B9'} {'\u00B7'} {graphData.edges.length} {'\u8FB9'}
            </span>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? '\u9000\u51FA\u5168\u5C4F (ESC)' : '\u5168\u5C4F\u663E\u793A'}
              style={{
                background: 'rgba(13,21,32,0.8)', border: '1px solid #1e3a5f', borderRadius: 4,
                color: '#5a7090', cursor: 'pointer', fontSize: 14, lineHeight: 1,
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >{'\u26F6'}</button>
          </div>

          <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block', userSelect: 'none', cursor: isDragging ? 'grabbing' : 'default' }}>
            <defs>
              {Object.values(NODE_COLORS).filter((v, i, a) => a.indexOf(v) === i).map(color => (
                <marker key={color} id={'arr-v3-' + color.replace('#', '')} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill={color} opacity="0.5" />
                </marker>
              ))}
              <filter id="glow-v3"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <pattern id="grid-v3" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#1e3a5f" strokeWidth="0.4" opacity="0.4"/></pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-v3)" />

            {/* 边 */}
            {graphData.edges.map((e, i) => {
              const src = pos[e.source], tgt = pos[e.target];
              if (!src || !tgt) return null;
              const color = getColor(e.source);
              const dx = tgt.x - src.x, dy = tgt.y - src.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const x1 = src.x + (dx / len) * NODE_R, y1 = src.y + (dy / len) * NODE_R;
              const x2 = tgt.x - (dx / len) * (NODE_R + 5), y2 = tgt.y - (dy / len) * (NODE_R + 5);
              const mx = (x1 + x2) / 2 - dy * 0.12, my = (y1 + y2) / 2 + dx * 0.12;
              return (
                <g key={i}>
                  <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.35" markerEnd={`url(#arr-v3-${color.replace('#', '')})`} />
                  <text x={(x1 + x2) / 2 - dy * 0.06} y={(y1 + y2) / 2 + dx * 0.06} textAnchor="middle" fill={color} fontSize="9" fontFamily="JetBrains Mono,monospace" opacity="0.7">{e.callCount} {'\u00B7'} {formatDuration(e.avgDuration)}</text>
                </g>
              );
            })}

            {/* 节点 */}
            {graphData.nodes.map(node => {
              const p = pos[node.id];
              if (!p) return null;
              const color = getColor(node.id);
              const icon = getIcon(node.id);
              const sel = selectedNode === node.id;
              const isMid = MIDDLEWARE.includes(node.id) || node.id.startsWith('async.');
              const labelForDisplay = node.id.startsWith('async.') ? node.id.slice(6) : node.id;
              const displayLabel = labelForDisplay.length > 13 ? labelForDisplay.slice(0, 12) + '\u2026' : labelForDisplay;
              return (
                <g key={node.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: 'grab' }} onMouseDown={e => onNodeMouseDown(e, node.id)}>
                  {sel && <circle r={NODE_R + 10} fill={color} opacity="0.12" filter="url(#glow-v3)" />}
                  <circle r={NODE_R + 2} fill="none" stroke={color} strokeWidth={sel ? 2 : 1} strokeOpacity={sel ? 0.9 : 0.35} strokeDasharray={isMid ? '3,3' : 'none'} />
                  <circle r={NODE_R} fill="rgba(8,13,20,0.97)" stroke={color} strokeWidth={sel ? 2.5 : 1.5} />
                  <text textAnchor="middle" dominantBaseline="middle" y={-7} fontSize="15">{icon}</text>
                  <text textAnchor="middle" dominantBaseline="middle" y={11} fontSize="9" fontFamily="JetBrains Mono,monospace" fill={color} fontWeight={sel ? 'bold' : 'normal'}>{displayLabel}</text>
                  <title>{node.id}</title>
                </g>
              );
            })}

            {loading && <text x="50%" y="50%" textAnchor="middle" fill="#4da6ff" fontSize="13" fontFamily="JetBrains Mono,monospace">{'\u23F3 \u67E5\u8BE2\u4E2D...'}</text>}
            {!loading && !graphData.nodes.length && !errorMsg && <text x="50%" y="50%" textAnchor="middle" fill="#5a7090" fontSize="13" fontFamily="JetBrains Mono,monospace">{'\u8F93\u5165 Trace ID \u540E\u70B9\u51FB\u67E5\u8BE2'}</text>}
          </svg>
        </div>

        {/* 右侧树形视图 - 可折叠 */}
        <div style={{
          width: treeCollapsed ? 36 : 400,
          transition: 'width 0.25s ease',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          {/* 折叠/展开按钮 */}
          <button
            onClick={() => setTreeCollapsed(c => !c)}
            title={treeCollapsed ? '\u5C55\u5F00\u8FFD\u8E2A\u6811' : '\u6298\u53E0\u8FFD\u8E2A\u6811'}
            style={{
              alignSelf: 'flex-end',
              background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f',
              borderRadius: '6px 6px 0 0', color: '#4da6ff', cursor: 'pointer',
              fontSize: 12, padding: '3px 8px', marginBottom: -1, lineHeight: 1,
            }}
          >{treeCollapsed ? '\u25C0' : '\u25B6'}</button>

          <div style={{
            flex: 1, background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f',
            borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            opacity: treeCollapsed ? 0 : 1, transition: 'opacity 0.2s ease 0.05s',
          }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e3a5f', fontFamily: 'var(--mono)', fontSize: 12, color: '#94a8c0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>{'\u94FE\u8DEF\u8FFD\u8E2A\u6811'}</span>
                <span style={{ color: '#5a7090', fontSize: '11px' }}>{graphData.nodes.length} {'\u8282\u70B9'} {'\u00B7'} {graphData.edges.length} {'\u8FB9'}</span>
              </div>
              <div style={{ fontSize: '10px', color: '#5a7090', fontFamily: 'JetBrains Mono,monospace', wordBreak: 'break-all' }}>
                Trace ID: {traceTreeData.traceId}
              </div>
            </div>
            <div style={{ padding: '14px', overflowY: 'auto', flex: 1 }}>
              {traceTreeData.spans.length > 0 ? (
                traceTreeData.spans.map(rootSpan => (
                  <SpanNode key={rootSpan.span_id} span={rootSpan} level={0} maxDur={maxDur} />
                ))
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#5a7090', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                  {loading ? '\u52A0\u8F7D\u4E2D...' : '\u6682\u65E0\u94FE\u8DEF\u8FFD\u8E2A\u6570\u636E'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
