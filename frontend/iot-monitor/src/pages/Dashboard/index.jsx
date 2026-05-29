import { AreaChart, Area, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { C } from '@/constants/theme'
import { Card } from '@/components/common/Card'
import { MetricCard } from '@/components/common/MetricCard'
import { LvlTag, StTag } from '@/components/common/Tag'
import { Btn } from '@/components/common/Button'
import { DataTable } from '@/components/common/Table'
import { ProgBar } from '@/components/common/ProgressBar'
import { ALERTS, mkSpark } from '@/constants/mockData'

const CHAIN_NODES = [
  { id: 'app',    label: 'APP',         sub: 'iOS/Android',    icon: '📱', color: C.blue,   status: 'ok'   },
  { id: 'gw',     label: '云网关',       sub: 'api-gateway',    icon: '🌐', color: C.blue,   status: 'ok'   },
  { id: 'broker', label: 'MQTT Broker', sub: 'emqx×3',         icon: '📡', color: C.teal,   status: 'ok'   },
  { id: 'rule',   label: '规则引擎',     sub: 'rule-engine',    icon: '⚡', color: C.teal,   status: 'ok'   },
  { id: 'kafka',  label: 'Kafka',        sub: 'kafka×6',        icon: '🔀', color: C.purple, status: 'warn' },
  { id: 'svc',    label: '车控服务',     sub: 'vehicle-ctrl',   icon: '🚗', color: C.amber,  status: 'warn' },
  { id: 'tbox',   label: 'T-Box',        sub: 'iot-conn',       icon: '📦', color: C.amber,  status: 'ok'   },
  { id: 'db',     label: '存储层',       sub: 'InfluxDB·Redis', icon: '🗄️', color: C.blue,   status: 'ok'   },
]

const flowData = Array.from({ length: 30 }, (_, i) => ({
  t: i,
  up: 35 + Math.sin(i * 0.5) * 18 + Math.random() * 6,
  dn: 18 + Math.sin(i * 0.4 + 1) * 10 + Math.random() * 4,
}))

function ChainTopo() {
  const W = 90, GAP = 14
  const total = CHAIN_NODES.length * W + (CHAIN_NODES.length - 1) * GAP
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <svg width={total} height={96} style={{ display: 'block', minWidth: total }}>
        <defs>
          <marker id="darr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M1 2L8 5L1 8" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" strokeLinecap="round" />
          </marker>
        </defs>
        {CHAIN_NODES.map((n, i) => {
          const x = i * (W + GAP)
          const col = n.status === 'warn' ? C.amber : n.color
          return (
            <g key={n.id} style={{ cursor: 'pointer' }}>
              {i < CHAIN_NODES.length - 1 && (
                <line
                  x1={x + W} y1={38} x2={x + W + GAP} y2={38}
                  stroke="rgba(255,255,255,0.14)" strokeWidth={1.5}
                  markerEnd="url(#darr)"
                />
              )}
              <rect x={x} y={4} width={W} height={68} rx={7}
                fill={n.status === 'warn' ? 'rgba(255,170,32,0.09)' : `${col}18`}
                stroke={col} strokeWidth={n.status === 'warn' ? 1.8 : 1.2}
              />
              {n.status === 'warn' && (
                <circle cx={x + W - 9} cy={12} r={5} fill={C.amber} />
              )}
              <text x={x + W / 2} y={28} textAnchor="middle" fontSize={17}>{n.icon}</text>
              <text x={x + W / 2} y={46} textAnchor="middle" fill={C.t0} fontSize={9.5} fontWeight="600" fontFamily={C.fontSans}>{n.label}</text>
              <text x={x + W / 2} y={58} textAnchor="middle" fill={col === C.amber ? C.amber : C.t2} fontSize={8} fontFamily={C.fontMono}>{n.sub}</text>
              <circle cx={x + W / 2} cy={66} r={3} fill={col} opacity={0.9} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function Dashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* KPI row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <MetricCard label="车辆总数"      value="2,560,688" color={C.blue}   spark={mkSpark(50, 15)} sub="↑ +1,240 今日新增" />
        <MetricCard label="T-Box 在线"   value="128,560"   color={C.teal}   spark={mkSpark(80, 12)} sub="在线率 92.4%" />
        <MetricCard label="App 在线用户" value="256,560"   color={C.blue}   spark={mkSpark(60, 20)} sub="↑ +3.2% vs 昨日" />
        <MetricCard label="指令成功率"   value="99.23%"    color={C.teal}   spark={mkSpark(95,  2)} sub="↑ +1.0% vs 昨日" />
        <MetricCard label="今日异常告警" value="128"       color={C.red}    spark={mkSpark(30, 20)} sub="↓ -8.2% vs 昨日" />
      </div>

      {/* Chain topo */}
      <Card
        title="全链路拓扑总览"
        extra={
          <div style={{ display: 'flex', gap: 10 }}>
            {[[C.teal, '健康'], [C.amber, '异常'], [C.red, '高危']].map(([c, l]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.t2, fontFamily: C.fontSans }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block' }} />{l}
              </span>
            ))}
          </div>
        }
      >
        <ChainTopo />
      </Card>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Card title="消息吞吐量趋势">
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={flowData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gup" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.teal} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.teal} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gdn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.blue} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" hide />
              <YAxis tick={{ fill: C.t2, fontSize: 9 }} />
              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
              <Area type="monotone" dataKey="up" stroke={C.teal} strokeWidth={1.5} fill="url(#gup)" dot={false} name="上行 k/s" />
              <Area type="monotone" dataKey="dn" stroke={C.blue} strokeWidth={1.5} fill="url(#gdn)" dot={false} name="下行 k/s" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="链路耗时分布">
          <div style={{ padding: '8px 0' }}>
            {[['P50', 120, 1280, C.teal], ['P90', 480, 1280, C.amber], ['P95', 780, 1280, C.amber], ['P99', 1280, 1280, C.red]].map(([l, v, m, c]) => (
              <ProgBar key={l} label={l} value={v} max={m} color={c} unit="ms" />
            ))}
          </div>
        </Card>

        <Card title="错误类型 TOP5">
          <div style={{ padding: '8px 0' }}>
            {[['超时', 32.6, C.red], ['设备离线', 21.3, C.amber], ['指令拒绝', 18.7, C.purple], ['服务异常', 15.2, C.blue], ['其他', 12.2, C.t2]].map(([t, p, c]) => (
              <ProgBar key={t} label={t} value={p} color={c} />
            ))}
          </div>
        </Card>
      </div>

      {/* Alert table */}
      <Card title="实时告警" extra={<span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: C.redBg, color: C.red, fontWeight: 700 }}>128 活跃</span>}>
        <DataTable
          rowKey="id"
          rows={ALERTS}
          cols={[
            { key: 'lvl',   title: '级别',    width: 70,  render: v => <LvlTag lvl={v} /> },
            { key: 'title', title: '告警内容', maxWidth: 200 },
            { key: 'src',   title: '影响范围', render: v => <span style={{ color: C.t2 }}>{v}</span> },
            { key: 'time',  title: '时间',    render: v => <span style={{ color: C.amber }}>{v}</span> },
            { key: 'st',    title: '状态',    render: v => <StTag st={v} /> },
            { key: 'id',    title: '操作',    render: () => <Btn>处理</Btn> },
          ]}
        />
      </Card>
    </div>
  )
}
