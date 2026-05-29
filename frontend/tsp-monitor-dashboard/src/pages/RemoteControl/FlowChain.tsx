import React, { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const NODE_W = 88;
const NODE_H = 52;

const RAW_NODES = [
  { id: 'app-send', label: 'APP', icon: '📱', row: 0, col: 0 },
  { id: 'cloud-gw', label: '云网关', icon: '☁️', row: 0, col: 1 },
  { id: 'mqtt-broker', label: 'MQTT', icon: '📡', row: 0, col: 2 },
  { id: 'rule-engine', label: '规则引擎', icon: '⚙', row: 0, col: 3 },
  { id: 'kafka', label: 'Kafka', icon: '🔄', row: 0, col: 4 },
  { id: 'control-svc', label: '车控服务', icon: '🚗', row: 0, col: 5 },
  { id: 'tbox', label: 'T-Box', icon: '📦', row: 0, col: 6 },
  { id: 'vehicle-exec', label: '车辆执行', icon: '🔧', row: 0, col: 7 },
  { id: 'result-back', label: '结果回传', icon: '📤', row: 0, col: 8 },
  { id: 'app-recv', label: 'APP', icon: '📱', row: 0, col: 9 },
];

const GAP_X = 48;
const START_X = 40;
const START_Y = 0;

function nodeStyle(isTbox: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: isTbox ? 6 : 999,
    border: `2px ${isTbox ? 'dashed' : 'solid'} rgba(255,255,255,0.18)`,
    background: 'rgba(10,14,23,0.85)',
    backdropFilter: 'blur(6px)',
    color: '#c0c8d8',
    fontSize: 11,
    fontFamily: 'JetBrains Mono, monospace',
    textAlign: 'center',
    width: NODE_W,
    height: NODE_H,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  };
}

const genNodes = (): Node[] =>
  RAW_NODES.map((n) => ({
    id: n.id,
    data: { label: <><div style={{ fontSize: 14 }}>{n.icon}</div><div>{n.label}</div></> },
    position: { x: START_X + n.col * (NODE_W + GAP_X), y: START_Y },
    style: nodeStyle(n.id === 'tbox'),
    type: 'default',
    draggable: false,
  }));

const genEdges = (): Edge[] => {
  const pairs: [string, string][] = [];
  for (let i = 0; i < RAW_NODES.length - 1; i++) {
    pairs.push([RAW_NODES[i].id, RAW_NODES[i + 1].id]);
  }
  return pairs.map(([src, tgt], idx) => ({
    id: `e-${src}-${tgt}`,
    source: src,
    target: tgt,
    type: src === 'tbox' ? 'straight' : 'default',
    animated: true,
    style: {
      stroke: src === 'tbox' ? '#9ca3af' : '#1677ff',
      strokeDasharray: src === 'tbox' ? '6 4' : undefined,
      strokeWidth: 1.5,
    },
    markerEnd: { type: 'arrowclosed' as const },
    label: `${[120, 80, 90, 85, 180, 350, 200, 150, 110, 80][idx]}ms`,
    labelStyle: { fill: '#6b7280', fontSize: 9 },
  }));
};

const FlowChain: React.FC = () => {
  const [nodes] = useNodesState(genNodes());
  const [edges] = useEdgesState(genEdges());

  return (
    <div style={{ height: 140, width: '100%', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}>
        <Background gap={20} color="rgba(255,255,255,0.03)" />
        <Controls showInteractive={false} style={{ filter: 'invert(1)' }} />
        <MiniMap style={{ filter: 'invert(0.8)' }} />
      </ReactFlow>
    </div>
  );
};

export default FlowChain;
