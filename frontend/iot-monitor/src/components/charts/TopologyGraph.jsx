/**
 * TopologyGraph
 * ──────────────────────────────────────────────────────────────
 * Renders an interactive SVG directed-graph topology.
 * Nodes are draggable. Edges draw cubic-bezier curves with
 * animated flow markers and traffic/latency labels.
 *
 * Props:
 *   nodes  – TOPO_NODES array
 *   edges  – TOPO_EDGES array
 *   width  – svg width  (default 1060)
 *   height – svg height (default 500)
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { C, NODE_TYPE_COLOR, NODE_TYPE_LABEL } from '@/constants/theme'

const NODE_R = 32   // circle radius
const GRAD_DEFS = Object.entries(NODE_TYPE_COLOR).map(([type, color]) => ({
  id: `ng_${type}`,
  color,
}))

/** Cubic bezier control points — offset perpendicular to edge */
function bezierPath(x1, y1, x2, y2, bend = 0.35) {
  const dx = x2 - x1
  const dy = y2 - y1
  const cx1 = x1 + dx * 0.4 - dy * bend
  const cy1 = y1 + dy * 0.4 + dx * bend
  const cx2 = x1 + dx * 0.6 - dy * bend
  const cy2 = y1 + dy * 0.6 + dx * bend
  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
}

/** Mid-point of a cubic bezier at t=0.5 (De Casteljau) */
function bezierMid(x1, y1, x2, y2, bend = 0.35) {
  const dx = x2 - x1
  const dy = y2 - y1
  const cx1 = x1 + dx * 0.4 - dy * bend
  const cy1 = y1 + dy * 0.4 + dx * bend
  const cx2 = x1 + dx * 0.6 - dy * bend
  const cy2 = y1 + dy * 0.6 + dx * bend
  const t = 0.5
  const mt = 1 - t
  const mx =
    mt * mt * mt * x1 +
    3 * mt * mt * t * cx1 +
    3 * mt * t * t * cx2 +
    t * t * t * x2
  const my =
    mt * mt * mt * y1 +
    3 * mt * mt * t * cy1 +
    3 * mt * t * t * cy2 +
    t * t * t * y2
  return { mx, my }
}

/** Returns point on circle border toward a target */
function borderPoint(cx, cy, tx, ty, r) {
  const angle = Math.atan2(ty - cy, tx - cx)
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

function EdgeLabel({ mx, my, label, sub, status }) {
  const w = 72, h = 30
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={mx - w / 2}
        y={my - h / 2}
        width={w}
        height={h}
        rx={5}
        fill={C.bg1}
        stroke={status === 'warn' ? C.amber : C.borderBright}
        strokeWidth={1}
        opacity={0.92}
      />
      <text
        x={mx}
        y={my - 4}
        textAnchor="middle"
        fill={status === 'warn' ? C.amber : C.t0}
        fontSize={9}
        fontFamily={C.fontMono}
        fontWeight="600"
      >
        {label}
      </text>
      <text
        x={mx}
        y={my + 8}
        textAnchor="middle"
        fill={status === 'warn' ? C.amber : C.t2}
        fontSize={8}
        fontFamily={C.fontMono}
      >
        {sub}
      </text>
    </g>
  )
}

function TopoNode({ node, selected, onMouseDown, onClick }) {
  const color = NODE_TYPE_COLOR[node.type] || C.blue
  const isWarn = node.status === 'warn'
  const ringColor = isWarn ? C.amber : color

  return (
    <g
      style={{ cursor: 'grab' }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {/* Pulse ring for warn nodes */}
      {isWarn && (
        <circle
          cx={node.x}
          cy={node.y}
          r={NODE_R + 8}
          fill="none"
          stroke={C.amber}
          strokeWidth={1}
          opacity={0.4}
        >
          <animate attributeName="r" values={`${NODE_R + 4};${NODE_R + 14};${NODE_R + 4}`} dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Selection ring */}
      {selected && (
        <circle
          cx={node.x}
          cy={node.y}
          r={NODE_R + 6}
          fill="none"
          stroke={ringColor}
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      )}

      {/* Main circle */}
      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_R}
        fill={`${color}1a`}
        stroke={ringColor}
        strokeWidth={selected ? 2 : 1.5}
      />

      {/* Inner glow */}
      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_R - 6}
        fill={`${color}0d`}
      />

      {/* Icon */}
      <text
        x={node.x}
        y={node.y - 6}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={18}
      >
        {node.icon}
      </text>

      {/* Label below circle */}
      <text
        x={node.x}
        y={node.y + NODE_R + 14}
        textAnchor="middle"
        fill={C.t0}
        fontSize={11}
        fontWeight="600"
        fontFamily={C.fontSans}
      >
        {node.label}
      </text>
      <text
        x={node.x}
        y={node.y + NODE_R + 27}
        textAnchor="middle"
        fill={isWarn ? C.amber : C.t2}
        fontSize={9}
        fontFamily={C.fontMono}
      >
        {node.sub}
      </text>

      {/* Status dot */}
      <circle
        cx={node.x + NODE_R - 7}
        cy={node.y - NODE_R + 7}
        r={5}
        fill={isWarn ? C.amber : C.teal}
      />
    </g>
  )
}

export function TopologyGraph({ nodes: initNodes, edges, width = 1060, height = 500 }) {
  const [nodes, setNodes] = useState(initNodes)
  const [selected, setSelected] = useState(null)
  const [hoveredEdge, setHoveredEdge] = useState(null)
  const dragRef = useRef(null)
  const svgRef = useRef(null)

  // Keep nodes in sync with props (e.g. when filter changes)
  useEffect(() => setNodes(initNodes), [initNodes])

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))

  // ── Drag logic ──────────────────────────────────────────────
  const startDrag = useCallback((e, id) => {
    e.preventDefault()
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse())
    const node = nodes.find(n => n.id === id)
    dragRef.current = { id, ox: svgP.x - node.x, oy: svgP.y - node.y }
  }, [nodes])

  const onMouseMove = useCallback((e) => {
    if (!dragRef.current) return
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse())
    const { id, ox, oy } = dragRef.current
    setNodes(prev =>
      prev.map(n =>
        n.id === id
          ? { ...n, x: Math.round(svgP.x - ox), y: Math.round(svgP.y - oy) }
          : n
      )
    )
  }, [])

  const stopDrag = useCallback(() => { dragRef.current = null }, [])

  // ── Render edges ────────────────────────────────────────────
  const renderedEdges = edges.map((edge, i) => {
    const fn = nodeMap[edge.from]
    const tn = nodeMap[edge.to]
    if (!fn || !tn) return null

    // Compute border intersection points
    const { x: sx, y: sy } = borderPoint(fn.x, fn.y, tn.x, tn.y, NODE_R)
    const { x: ex, y: ey } = borderPoint(tn.x, tn.y, fn.x, fn.y, NODE_R)

    // Bend factor — alternate to avoid overlap on parallel edges
    const bend = i % 2 === 0 ? 0.3 : -0.15
    const path = bezierPath(sx, sy, ex, ey, bend)
    const { mx, my } = bezierMid(sx, sy, ex, ey, bend)
    const isWarn = edge.status === 'warn'
    const isHovered = hoveredEdge === i
    const edgeColor = isWarn ? C.amber : (isHovered ? C.blue : 'rgba(100,150,220,0.35)')
    const pathId = `ep_${i}`

    return (
      <g key={i}>
        {/* Invisible hit area */}
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          style={{ cursor: 'pointer' }}
          onMouseEnter={() => setHoveredEdge(i)}
          onMouseLeave={() => setHoveredEdge(null)}
        />

        {/* Visible edge */}
        <path
          id={pathId}
          d={path}
          fill="none"
          stroke={edgeColor}
          strokeWidth={isHovered ? 2 : 1.5}
          markerEnd={`url(#arr_${isWarn ? 'warn' : 'ok'})`}
          strokeDasharray={isWarn ? '6 3' : undefined}
        />

        {/* Animated flow dot */}
        {!isWarn && (
          <circle r={3} fill={C.teal} opacity={0.7}>
            <animateMotion dur={`${2 + (i % 3)}s`} repeatCount="indefinite">
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
        )}

        {/* Label at mid-point */}
        <EdgeLabel mx={mx} my={my} label={edge.label} sub={edge.sub} status={edge.status} />
      </g>
    )
  })

  // ── Render nodes ────────────────────────────────────────────
  const renderedNodes = nodes.map(node => (
    <TopoNode
      key={node.id}
      node={node}
      selected={selected === node.id}
      onMouseDown={e => startDrag(e, node.id)}
      onClick={() => setSelected(s => s === node.id ? null : node.id)}
    />
  ))

  const selectedNode = selected ? nodeMap[selected] : null

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', background: `${C.bg0}`, borderRadius: 8 }}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      >
        <defs>
          {/* Arrow markers */}
          <marker id="arr_ok"   viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M1 2L8 5L1 8" fill="none" stroke="rgba(100,160,255,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
          </marker>
          <marker id="arr_warn" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M1 2L8 5L1 8" fill="none" stroke={C.amber} strokeWidth="1.5" strokeLinecap="round"/>
          </marker>

          {/* Node radial gradients */}
          {GRAD_DEFS.map(({ id, color }) => (
            <radialGradient key={id} id={id} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0.04} />
            </radialGradient>
          ))}

          {/* Grid pattern */}
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(60,100,160,0.06)" strokeWidth="1"/>
          </pattern>
        </defs>

        {/* Background grid */}
        <rect width={width} height={height} fill="url(#grid)" />

        {/* Edges (below nodes) */}
        {renderedEdges}

        {/* Nodes (above edges) */}
        {renderedNodes}
      </svg>

      {/* Node detail tooltip */}
      {selectedNode && (
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            right: 14,
            background: C.bg1,
            border: `1px solid ${C.borderBright}`,
            borderRadius: 8,
            padding: '12px 14px',
            minWidth: 180,
            fontSize: 12,
            fontFamily: C.fontSans,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>{selectedNode.icon}</span>
            <div>
              <div style={{ fontWeight: 600, color: C.t0 }}>{selectedNode.label}</div>
              <div style={{ fontSize: 10, color: NODE_TYPE_COLOR[selectedNode.type] }}>
                {NODE_TYPE_LABEL[selectedNode.type]}
              </div>
            </div>
          </div>
          <div style={{ color: C.t2, fontSize: 11 }}>{selectedNode.sub}</div>
          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: `1px solid ${C.border}`,
              display: 'flex',
              gap: 6,
            }}
          >
            <button
              onClick={() => setSelected(null)}
              style={{ fontSize: 10, padding: '3px 8px', background: C.bg3, border: `1px solid ${C.border}`, color: C.t1, borderRadius: 4, cursor: 'pointer' }}
            >
              关闭
            </button>
            <button
              style={{ fontSize: 10, padding: '3px 8px', background: C.blueBg, border: `1px solid ${C.blue}44`, color: C.blue, borderRadius: 4, cursor: 'pointer' }}
            >
              链路追踪
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
