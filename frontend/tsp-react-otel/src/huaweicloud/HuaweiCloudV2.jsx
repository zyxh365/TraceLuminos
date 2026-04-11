/**
 * 华为云APM V2格式拓扑页面
 * 展示嵌套格式的trace数据 - 包含拓扑图和树形视图
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { HUAWEI_CLOUD_MOCK_TRACE_V2 } from './mock-data-v2.js';

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
  'MySQL': '🗄',
  'Redis': '⚡',
  'tsp-react-frontend': '💻',
  'kong': '🚪',
  'tsp-trace-service1': '🔧',
  'tsp-trace-service2': '⚙️',
  'ASYNC_THREAD': '🔄',
  'default': '⚙',
};

const NODE_R = 34;
const MIDDLEWARE = ['MySQL', 'Redis', 'Kafka', 'mysql', 'redis', 'ASYNC_THREAD'];

function getColor(nodeId) {
  // 异步线程池节点
  if (nodeId.startsWith('async.')) {
    return NODE_COLORS['ASYNC_THREAD'] || NODE_COLORS.default;
  }
  return NODE_COLORS[nodeId] || NODE_COLORS.default;
}

function getIcon(nodeId) {
  // 异步线程池节点
  if (nodeId.startsWith('async.')) {
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

// 转换嵌套格式为扁平列表
function convertNestedFormat(data) {
  const flatList = [];

  const flatten = (spans, parentSpanId = null) => {
    if (!Array.isArray(spans)) return;

    spans.forEach(span => {
      const spanWithParent = {
        ...span,
        parent_spanId: parentSpanId,
        children: undefined
      };
      flatList.push(spanWithParent);

      if (span.children && Array.isArray(span.children)) {
        flatten(span.children, span.span_id);
      }
    });
  };

  if (data.span_list) {
    flatten(data.span_list);
  }

  return flatList;
}

// Span节点组件（支持嵌套结构）
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

export default function HuaweiCloudV2() {
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
      console.log('[华为云V2] 加载 V2 格式数据');

      const data = HUAWEI_CLOUD_MOCK_TRACE_V2.data;
      const spanEventList = convertNestedFormat(data);

      const nodeSet = new Set();
      const edgeMap = new Map();

      const spanInfo = new Map();
      spanEventList.forEach(span => {
        const spanId = span.span_id || span.id;
        const appName = span.app_name || span.appName;
        const type = span.span_type || span.type;
        const method = span.method || span.operation_name;
        const duration = (span.time_used || span.duration || 0) * 1000;
        const tags = span.tags || {};

        spanInfo.set(spanId, {
          appName,
          type,
          method,
          duration,
          tags,
        });
      });

      // 生成边
      spanEventList.forEach(span => {
        const spanId = span.span_id || span.id;
        const info = spanInfo.get(spanId);
        if (!info) return;

        const { appName, type, duration, tags } = info;

        nodeSet.add(appName);

        // CLIENT 类型，查找子节点
        if (type === 'SPAN_KIND_CLIENT' || type?.includes('CLIENT')) {
          const children = spanEventList.filter(s => {
            const childParentId = s.parent_spanId || s.parent_spanId;
            return childParentId === spanId;
          });

          children.forEach(child => {
            const childInfo = spanInfo.get(child.span_id || child.id);
            if (!childInfo) return;

            const childType = childInfo.type;
            const childAppName = childInfo.appName;

            if ((childType === 'SPAN_KIND_SERVER' || childType?.includes('SERVER')) && childAppName !== appName) {
              const edgeKey = `${appName}->${childAppName}`;
              if (!edgeMap.has(edgeKey)) {
                edgeMap.set(edgeKey, { source: appName, target: childAppName, count: 0, totalDuration: 0, durations: [] });
              }
              const edge = edgeMap.get(edgeKey);
              edge.count += 1;
              edge.totalDuration += (childInfo.duration || duration);
              edge.durations.push(childInfo.duration || duration);
            }
          });
        }

        // 处理 tags 中的 peer 服务
        let peer = '';

        if (tags && tags['peer.service']) {
          peer = tags['peer.service'];
        } else if (tags && tags['db.system']) {
          peer = tags['db.system'] === 'redis' ? 'Redis' :
                 tags['db.system'] === 'mysql' ? 'MySQL' :
                 tags['db.system'].toUpperCase();
        }

        if (peer && peer !== appName) {
          nodeSet.add(peer);
          const edgeKey = `${appName}->${peer}`;
          if (!edgeMap.has(edgeKey)) {
            edgeMap.set(edgeKey, { source: appName, target: peer, count: 0, totalDuration: 0, durations: [] });
          }
          const edge = edgeMap.get(edgeKey);
          edge.count += 1;
          edge.totalDuration += duration;
          edge.durations.push(duration);
        }

        // 处理异步线程池节点
        const asyncType = tags?.['async.type'] || '';
        if (asyncType === '@Async' || asyncType === 'Manual-Context') {
          const taskName = tags?.['task.name'] || '';
          const operationName = span.operation_name || span.method || '';

          if (taskName || operationName.includes('async.')) {
            // 创建虚拟节点名：格式为 "async.task-name" 或直接用任务名
            const virtualNodeId = `async.${taskName}`;
            nodeSet.add(virtualNodeId);

            // 创建边：从服务到线程池节点
            const edgeKey = `${appName}->${virtualNodeId}`;
            if (!edgeMap.has(edgeKey)) {
              edgeMap.set(edgeKey, { source: appName, target: virtualNodeId, count: 0, totalDuration: 0, durations: [] });
            }
            const edge = edgeMap.get(edgeKey);
            edge.count += 1;
            edge.totalDuration += duration;
            edge.durations.push(duration);
          }
        }
      });

      const nodes = Array.from(nodeSet).map(id => ({ id }));
      const edges = Array.from(edgeMap.values()).map(edge => ({
        source: edge.source,
        target: edge.target,
        callCount: edge.count,
        avgDuration: edge.count > 0 ? Math.round(edge.totalDuration / edge.count) : 0
      }));

      console.log('[华为云V2] 节点:', nodes.map(n => n.id));
      console.log('[华为云V2] 边:', edges);
      console.log('[华为云V2] Span 总数:', spanEventList.length);

      setGraphData({ nodes, edges });
      initNodePositions(nodes, edges);
    } catch (error) {
      console.error('[华为云V2] 加载失败:', error);
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
  const nestedData = HUAWEI_CLOUD_MOCK_TRACE_V2.data;
  const nestedSpans = nestedData.span_list || [];

  // 获取Trace ID
  const traceId = nestedSpans.length > 0 ? (nestedSpans[0].trace_id || 'unknown') : 'unknown';

  const maxDur = (() => {
    const allSpans = [];
    const collect = (spans) => {
      if (!Array.isArray(spans)) return;
      spans.forEach(span => {
        allSpans.push(span);
        if (span.children && Array.isArray(span.children)) {
          collect(span.children);
        }
      });
    };
    collect(nestedSpans);
    return allSpans.reduce((m, e) => Math.max(m, (e.time_used || e.duration || 0) * 1000), 1);
  })();

  return (
    <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
      <div style={{ marginBottom: '20px', padding: '16px 20px', background: 'rgba(13,21,32,0.9)', borderRadius: '8px', border: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, color: '#e8f0fe', fontSize: '16px', fontWeight: 600, fontFamily: 'var(--mono)' }}>🌲 华为云APM V2格式</h2>
          <p style={{ margin: '8px 0 0 0', color: '#5a7090', fontSize: '12px', fontFamily: 'var(--mono)' }}>嵌套格式 - 拓扑图 + 链路追踪树</p>
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
              const isMid = MIDDLEWARE.includes(node.id) || node.id.startsWith('async.');
              // 异步任务节点去掉 async. 前缀
              const labelForDisplay = node.id.startsWith('async.') ? node.id.slice(6) : node.id;
              const displayLabel = labelForDisplay.length > 13 ? labelForDisplay.slice(0, 12) + '…' : labelForDisplay;

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
              {nestedSpans.map(rootSpan => (
                <SpanNode key={rootSpan.span_id} span={rootSpan} level={0} maxDur={maxDur} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
