/**
 * 华为云APM V1格式拓扑页面
 * 展示扁平格式的trace数据 - 包含拓扑图和树形视图
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { HUAWEI_CLOUD_MOCK_TRACE } from './mock-data-v1.js';

const NODE_COLORS = {
  'csc-outer-cpsp-service': '#4da6ff',
  'Redis': '#ef4444',
  'MySQL': '#f97316',
  'api.ximalaya.com': '#10b981',
  'ASYNC_THREAD': '#8b5cf6',
  'default': '#94a8c0',
};

const NODE_ICONS = {
  'csc-outer-cpsp-service': '🌐',
  'Redis': '⚡',
  'MySQL': '🗄',
  'api.ximalaya.com': '🌍',
  'ASYNC_THREAD': '🔄',
  'default': '⚙',
};

const NODE_R = 34;
const MIDDLEWARE = ['MySQL', 'Redis', 'ASYNC_THREAD'];

function getColor(nodeId) {
  if (nodeId.startsWith('async.') || nodeId === 'ASYNC_THREAD') {
    return NODE_COLORS['ASYNC_THREAD'] || NODE_COLORS.default;
  }
  return NODE_COLORS[nodeId] || NODE_COLORS.default;
}

function getIcon(nodeId) {
  if (nodeId.startsWith('async.') || nodeId === 'ASYNC_THREAD') {
    return NODE_ICONS['ASYNC_THREAD'] || NODE_ICONS.default;
  }
  return NODE_ICONS[nodeId] || NODE_ICONS.default;
}

function formatDuration(microseconds) {
  if (microseconds >= 1000000) return (microseconds / 1000000).toFixed(2) + 's';
  if (microseconds >= 1000) return (microseconds / 1000).toFixed(1) + 'ms';
  return microseconds + 'μs';
}

// 层次化布局算法
function calculateHierarchicalLayout(nodes, edges, width, height) {
  const edgeMap = new Map();
  const inDegree = new Map();
  const outDegree = new Map();

  nodes.forEach(node => {
    edgeMap.set(node.id, []);
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  });

  edges.forEach(edge => {
    edgeMap.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
  });

  const layer0 = [];
  const layer1 = [];
  const layer2 = [];

  nodes.forEach(node => {
    const inDeg = inDegree.get(node.id) || 0;
    const outDeg = outDegree.get(node.id) || 0;

    if (inDeg === 0) {
      layer0.push(node.id);
    } else if (outDeg === 0) {
      layer2.push(node.id);
    } else {
      layer1.push(node.id);
    }
  });

  if (layer0.length === 0) {
    layer0.push(...layer1);
    layer1.length = 0;
  }

  layer0.sort((a, b) => (outDegree.get(b) || 0) - (outDegree.get(a) || 0));
  layer1.sort((a, b) => (outDegree.get(b) || 0) - (outDegree.get(a) || 0));
  layer2.sort((a, b) => (inDegree.get(b) || 0) - (inDegree.get(a) || 0));

  const levelWidth = 200;
  const nodeSpacing = 100;

  const allLayers = [layer0, layer1, layer2].filter(l => l.length > 0);
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
      positions[nodeId] = {
        x: x,
        y: layerStartY + index * nodeSpacing
      };
    });
  });

  return positions;
}

// 从V1的id字段推断父子关系
function inferParentId(id) {
  if (!id || !id.includes('+')) return null;
  const parts = id.split('+');
  return parts.length > 1 ? parts[0] : null;
}

// 构建V1格式的树形结构
function buildV1Tree(flatList) {
  if (!flatList || flatList.length === 0) return [];

  // V1数据中，id字段是唯一的（如"1+1", "1+1-1"），span_id不唯一
  const spanMap = new Map();
  flatList.forEach(span => {
    const spanId = span.id; // 使用id字段作为唯一标识
    spanMap.set(spanId, { ...span, children: [] });
  });

  const roots = [];

  // 首先找出所有没有父节点的span（根节点）
  spanMap.forEach(span => {
    // V1格式没有parent_spanId字段，需要从id推断
    const parentId = inferParentId(span.id);

    if (!parentId || !spanMap.has(parentId)) {
      roots.push(span);
    }
  });

  // 然后建立父子关系
  spanMap.forEach(span => {
    const parentId = inferParentId(span.id);
    if (parentId && spanMap.has(parentId)) {
      spanMap.get(parentId).children.push(span);
    }
  });

  console.log('[华为云V1] 构建树形结构:', {
    totalSpans: flatList.length,
    rootSpans: roots.length,
    firstRoot: roots[0] ? { id: roots[0].id, type: roots[0].type, children: roots[0].children?.length || 0 } : null
  });

  return roots;
}

// Span节点组件
function SpanNode({ span, level = 0, maxDur }) {
  const [open, setOpen] = useState(true);
  const hasChildren = span.children && span.children.length > 0;

  const appName = span.app_name || span.appName || 'unknown';
  const color = getColor(appName);

  // 获取操作名（V1格式优化）
  let operationName = span.method || span.operation_name || 'unknown';
  const spanType = span.type || span.span_type || '';

  // 对特殊类型显示更友好的操作名
  if (spanType === 'REDIS_CLIENT' && span.real_source) {
    operationName = span.real_source;
  } else if ((spanType === 'Mysql' || spanType === 'MySQL') && span.method) {
    operationName = span.method;
  } else if (spanType === 'Okhttpclient') {
    if (span.real_source && span.real_source.startsWith('http')) {
      try {
        const url = new URL(span.real_source);
        operationName = url.pathname;
      } catch (e) {
        operationName = span.real_source;
      }
    } else if (span.argument) {
      const match = span.argument.match(/\(([^)]+)\)/);
      if (match) operationName = match[1];
    }
  }

  const duration = (span.time_used || span.duration || 0) * 1000;
  const tags = span.tags || {};

  // V1格式：从type推断peer服务
  let peerService = '';
  if (spanType === 'REDIS_CLIENT') peerService = 'Redis';
  else if (spanType === 'Mysql' || spanType === 'MySQL') peerService = 'MySQL';
  else if (spanType === 'Okhttpclient' && span.real_source) {
    try {
      const url = span.real_source.startsWith('http') ? span.real_source : 'https://' + span.real_source;
      peerService = new URL(url).hostname;
    } catch (e) {
      peerService = span.real_source.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    }
  }

  const pct = Math.max(2, (duration / (maxDur || 1)) * 100);
  const tagArray = Object.entries(tags).map(([key, value]) => ({ key, value }));

  return (
    <div>
      <div style={{ paddingLeft: level * 12, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
        {hasChildren && (
          <span onClick={() => setOpen(!open)} style={{ color: '#4da6ff', fontSize: 9, flexShrink: 0, cursor: 'pointer', userSelect: 'none', padding: '0 2px' }} title={open ? '折叠' : '展开'}>
            {open ? '▼' : '▶'}
          </span>
        )}
        {level > 0 && <span style={{ color: '#1e3a5f', fontSize: 9, flexShrink: 0 }}>└</span>}
        <span style={{ fontSize: 9, fontFamily: 'var(--mono)', background: color + '22', border: '1px solid ' + color + '44', color, borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {appName}
        </span>
        {peerService && (
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: getColor(peerService), background: getColor(peerService) + '22', border: '1px solid ' + getColor(peerService) + '44', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>
            {String.fromCharCode(8594)}{peerService}
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
        <SpanNode key={child.id} span={child} level={level + 1} maxDur={maxDur} />
      ))}
    </div>
  );
}

export default function HuaweiCloudTestTopology() {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [, forceRender] = useState(0);

  const posRef = useRef({});
  const dragRef = useRef(null);
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  const rerender = useCallback(() => forceRender(n => n + 1), []);

  // 加载数据
  const loadTestData = useCallback(() => {
    try {
      console.log('[华为云V1] 加载 V1 格式数据');

      const data = HUAWEI_CLOUD_MOCK_TRACE.data;
      const spanEventList = data.span_event_list || [];

      const nodeSet = new Set();
      const edgeMap = new Map();

      // 识别主服务
      const mainService = 'csc-outer-cpsp-service';
      nodeSet.add(mainService);

      // 遍历所有span，识别节点和创建边
      spanEventList.forEach(span => {
        const type = span.type || '';
        const duration = (span.time_used || 0) * 1000;

        // 识别Redis操作
        if (type === 'REDIS_CLIENT') {
          nodeSet.add('Redis');
          const edgeKey = `${mainService}->Redis`;
          if (!edgeMap.has(edgeKey)) {
            edgeMap.set(edgeKey, { source: mainService, target: 'Redis', count: 0, totalDuration: 0, durations: [] });
          }
          const edge = edgeMap.get(edgeKey);
          edge.count += 1;
          edge.totalDuration += duration;
          edge.durations.push(duration);
        }
        // 识别MySQL操作
        else if (type === 'Mysql' || type === 'MySQL') {
          nodeSet.add('MySQL');
          const edgeKey = `${mainService}->MySQL`;
          if (!edgeMap.has(edgeKey)) {
            edgeMap.set(edgeKey, { source: mainService, target: 'MySQL', count: 0, totalDuration: 0, durations: [] });
          }
          const edge = edgeMap.get(edgeKey);
          edge.count += 1;
          edge.totalDuration += duration;
          edge.durations.push(duration);
        }
        // 识别外部HTTP调用
        else if (type === 'Okhttpclient' && span.real_source) {
          let externalService = '';
          try {
            const url = span.real_source.startsWith('http') ? span.real_source : 'https://' + span.real_source;
            const urlObj = new URL(url);
            externalService = urlObj.hostname;
          } catch (e) {
            externalService = span.real_source.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
          }

          if (externalService) {
            nodeSet.add(externalService);
            const edgeKey = `${mainService}->${externalService}`;
            if (!edgeMap.has(edgeKey)) {
              edgeMap.set(edgeKey, { source: mainService, target: externalService, count: 0, totalDuration: 0, durations: [] });
            }
            const edge = edgeMap.get(edgeKey);
            edge.count += 1;
            edge.totalDuration += duration;
            edge.durations.push(duration);
          }
        }
        // 识别异步线程池
        else if (type === 'ASYNC_THREAD') {
          nodeSet.add('ASYNC_THREAD');
          const edgeKey = `${mainService}->ASYNC_THREAD`;
          if (!edgeMap.has(edgeKey)) {
            edgeMap.set(edgeKey, { source: mainService, target: 'ASYNC_THREAD', count: 0, totalDuration: 0, durations: [] });
          }
          const edge = edgeMap.get(edgeKey);
          edge.count += 1;
          edge.totalDuration += duration;
          edge.durations.push(duration);
        }
      });

      const nodes = Array.from(nodeSet).map(id => ({ id }));
      const edges = Array.from(edgeMap.values()).map(edge => ({
        source: edge.source,
        target: edge.target,
        callCount: edge.count,
        avgDuration: edge.count > 0 ? Math.round(edge.totalDuration / edge.count) : 0
      }));

      console.log('[华为云V1] 节点:', nodes.map(n => n.id));
      console.log('[华为云V1] 边:', edges);
      console.log('[华为云V1] Span 总数:', spanEventList.length);

      setGraphData({ nodes, edges });
      initNodePositions(nodes, edges);
    } catch (error) {
      console.error('[华为云V1] 加载失败:', error);
    }
  }, []);

  // 初始加载数据
  useEffect(() => {
    loadTestData();
  }, [loadTestData]);

  const initNodePositions = (nodes, edges) => {
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
  };

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
      if (Math.sqrt(dx * dx + dy * dy) > 4) {
        dragRef.current.moved = true;
      }
      if (!dragRef.current.moved) return;

      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const PAD = NODE_R + 10;
      const x = Math.max(PAD, Math.min(rect.width - PAD, e.clientX - rect.left - dragRef.current.offsetX));
      const y = Math.max(PAD, Math.min(rect.height - PAD, e.clientY - rect.top - dragRef.current.offsetY));

      posRef.current[dragRef.current.nodeId] = { x, y };
      rerender();
    }

    function onMouseUp() {
      dragRef.current = null;
      rerender();
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [rerender]);

  const pos = posRef.current;
  const isDragging = !!dragRef.current;

  // 准备树形数据
  const nestedData = HUAWEI_CLOUD_MOCK_TRACE.data;
  const flatSpans = nestedData.span_event_list || [];
  console.log('[华为云V1] 原始数据:', {
    hasData: !!nestedData,
    spanCount: flatSpans.length,
    firstSpans: flatSpans.slice(0, 3)
  });

  const nestedSpans = buildV1Tree(flatSpans);
  console.log('[华为云V1] 树形数据:', {
    rootsCount: nestedSpans.length,
    roots: nestedSpans.map(r => ({ id: r.id, type: r.type, childrenCount: r.children?.length || 0 }))
  });

  // 获取Trace ID
  const traceId = flatSpans.length > 0 ? (flatSpans[0].trace_id || flatSpans[0].global_trace_id || 'unknown') : 'unknown';

  const maxDur = (() => {
    const allSpans = [];
    const collect = (spans) => {
      if (!Array.isArray(spans)) return;
      spans.forEach(span => {
        allSpans.push(span);
        if (span.children && span.children.length > 0) {
          collect(span.children);
        }
      });
    };
    collect(nestedSpans);
    const max = allSpans.reduce((m, e) => Math.max(m, (e.time_used || 0) * 1000), 1);
    console.log('[华为云V1] 计算最大耗时:', {
      totalSpans: allSpans.length,
      maxDur: max
    });
    return max;
  })();

  return (
    <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
      <div style={{ marginBottom: '20px', padding: '16px 20px', background: 'rgba(13,21,32,0.9)', borderRadius: '8px', border: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, color: '#e8f0fe', fontSize: '16px', fontWeight: 600, fontFamily: 'var(--mono)' }}>📦 华为云APM V1格式</h2>
          <p style={{ margin: '8px 0 0 0', color: '#5a7090', fontSize: '12px', fontFamily: 'var(--mono)' }}>扁平格式 - 拓扑图 + 链路追踪树</p>
        </div>
        <button onClick={loadTestData} style={{ padding: '6px 14px', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff8844', color: '#00ff88' }}>↺ 刷新</button>
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
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#4da6ff' }}>线条:</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#5a7090' }}>次数·平均耗时</span>
              </div>
            </div>
          </div>

          <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block', userSelect: 'none', cursor: isDragging ? 'grabbing' : 'default' }}>
            <defs>
              {Object.values(NODE_COLORS).filter((v, i, a) => a.indexOf(v) === i).map(color => (
                <marker key={color} id={'arr-' + color.replace('#', '')} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill={color} opacity="0.5" />
                </marker>
              ))}
              <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#1e3a5f" strokeWidth="0.4" opacity="0.4"/></pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

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
                  <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.35" markerEnd={`url(#arr-${color.replace('#', '')})`} />
                  <text x={(x1 + x2) / 2 - dy * 0.06} y={(y1 + y2) / 2 + dx * 0.06} textAnchor="middle" fill={color} fontSize="9" fontFamily="JetBrains Mono,monospace" opacity="0.7">{e.callCount} · {formatDuration(e.avgDuration)}</text>
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
              const isMid = MIDDLEWARE.includes(node.id);
              const displayLabel = node.id.length > 13 ? node.id.slice(0, 12) + '…' : node.id;

              return (
                <g key={node.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: 'grab' }} onMouseDown={e => onNodeMouseDown(e, node.id)}>
                  {sel && <circle r={NODE_R + 10} fill={color} opacity="0.12" filter="url(#glow)" />}
                  <circle r={NODE_R + 2} fill="none" stroke={color} strokeWidth={sel ? 2 : 1} strokeOpacity={sel ? 0.9 : 0.35} strokeDasharray={isMid ? '3,3' : 'none'} />
                  <circle r={NODE_R} fill="rgba(8,13,20,0.97)" stroke={color} strokeWidth={sel ? 2.5 : 1.5} />
                  <text textAnchor="middle" dominantBaseline="middle" y={-7} fontSize="15">{icon}</text>
                  <text textAnchor="middle" dominantBaseline="middle" y={11} fontSize="9" fontFamily="JetBrains Mono,monospace" fill={color} fontWeight={sel ? 'bold' : 'normal'}>{displayLabel}</text>
                  <title>{node.id}</title>
                </g>
              );
            })}

            {!graphData.nodes.length && <text x="50%" y="50%" textAnchor="middle" fill="#5a7090" fontSize="13" fontFamily="JetBrains Mono,monospace">暂无数据 — 点击刷新按钮加载</text>}
          </svg>
        </div>

        {/* 右侧树形视图 */}
        <div style={{ width: 400, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e3a5f', fontFamily: 'var(--mono)', fontSize: 12, color: '#94a8c0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>链路追踪树</span>
                <span style={{ color: '#5a7090', fontSize: '11px' }}>{graphData.nodes.length} 节点 · {graphData.edges.length} 边</span>
              </div>
              <div style={{ fontSize: '10px', color: '#5a7090', fontFamily: 'JetBrains Mono,monospace', wordBreak: 'break-all' }}>
                Trace ID: {traceId}
              </div>
            </div>
            <div style={{ padding: '14px', overflowY: 'auto', flex: 1 }}>
              {nestedSpans.length > 0 ? (
                nestedSpans.map(rootSpan => (
                  <SpanNode key={rootSpan.id} span={rootSpan} level={0} maxDur={maxDur} />
                ))
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#5a7090', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                  暂无链路追踪数据
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
