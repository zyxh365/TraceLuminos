import { useState } from 'react'
import { C, NODE_TYPE_COLOR, NODE_TYPE_LABEL } from '@/constants/theme'
import { Card } from '@/components/common/Card'
import { Btn } from '@/components/common/Button'
import { TopologyGraph } from '@/components/charts/TopologyGraph'
import { TOPO_NODES, TOPO_EDGES } from '@/constants/mockData'

const LEGEND = Object.entries(NODE_TYPE_LABEL).map(([type, label]) => ({
  type, label, color: NODE_TYPE_COLOR[type],
}))

export default function ServiceTopology() {
  const [env, setEnv] = useState('prod')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [filter, setFilter] = useState('all')

  const filteredNodes = filter === 'all'
    ? TOPO_NODES
    : TOPO_NODES.filter(n => n.type === filter)

  // Only show edges where both endpoints are visible
  const visibleIds = new Set(filteredNodes.map(n => n.id))
  const filteredEdges = filter === 'all'
    ? TOPO_EDGES
    : TOPO_EDGES.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '10px 14px',
        }}
      >
        {/* Legend */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginRight: 'auto' }}>
          {[{ color: C.teal, label: '健康' }, { color: C.amber, label: '异常' }, { color: C.t2, label: '未知' }].map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.t1, fontFamily: C.fontSans }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>

        {/* Env */}
        <select
          value={env} onChange={e => setEnv(e.target.value)}
          style={{ background: C.bg3, border: `1px solid ${C.border}`, color: C.t1, borderRadius: 5, padding: '4px 10px', fontSize: 11, fontFamily: C.fontSans }}
        >
          <option value="prod">生产环境</option>
          <option value="pre">预发环境</option>
          <option value="test">测试环境</option>
        </select>

        {/* Time range */}
        <select
          style={{ background: C.bg3, border: `1px solid ${C.border}`, color: C.t1, borderRadius: 5, padding: '4px 10px', fontSize: 11, fontFamily: C.fontSans }}
        >
          <option>近1小时</option>
          <option>近6小时</option>
          <option>近24小时</option>
        </select>

        {/* Auto refresh toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 11, color: C.t2, fontFamily: C.fontSans }}>自动刷新</span>
          <div
            onClick={() => setAutoRefresh(v => !v)}
            style={{
              width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
              background: autoRefresh ? C.teal : C.bg4,
              position: 'relative', transition: 'background .2s',
            }}
          >
            <div style={{
              position: 'absolute', top: 3, width: 14, height: 14,
              borderRadius: '50%', background: 'white', transition: 'left .2s',
              left: autoRefresh ? 18 : 3,
            }} />
          </div>
        </div>

        {/* Node type filter */}
        <select
          value={filter} onChange={e => setFilter(e.target.value)}
          style={{ background: C.bg3, border: `1px solid ${C.border}`, color: C.t1, borderRadius: 5, padding: '4px 10px', fontSize: 11, fontFamily: C.fontSans }}
        >
          <option value="all">全部服务</option>
          {LEGEND.map(l => <option key={l.type} value={l.type}>{l.label}</option>)}
        </select>
      </div>

      {/* Main graph */}
      <Card
        title="服务拓扑图"
        extra={
          <div style={{ display: 'flex', gap: 10 }}>
            {LEGEND.map(({ type, label, color }) => (
              <span
                key={type}
                onClick={() => setFilter(f => f === type ? 'all' : type)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, color: filter === type ? color : C.t2,
                  cursor: 'pointer', fontFamily: C.fontSans,
                  padding: '2px 6px', borderRadius: 4,
                  background: filter === type ? `${color}15` : 'transparent',
                  transition: 'all .15s',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                {label}
              </span>
            ))}
          </div>
        }
        noPad
      >
        <TopologyGraph nodes={filteredNodes} edges={filteredEdges} width={1060} height={500} />
      </Card>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: '节点总数',    value: TOPO_NODES.length,                                        color: C.blue  },
          { label: '健康节点',    value: TOPO_NODES.filter(n => n.status !== 'warn').length,        color: C.teal  },
          { label: '异常节点',    value: TOPO_NODES.filter(n => n.status === 'warn').length,        color: C.amber },
          { label: '活跃边',      value: TOPO_EDGES.length,                                         color: C.blue  },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px' }}
          >
            <div style={{ fontSize: 10, color: C.t2, marginBottom: 6, fontFamily: C.fontSans, textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: C.fontMono }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
