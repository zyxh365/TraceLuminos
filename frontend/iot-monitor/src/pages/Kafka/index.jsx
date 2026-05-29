import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { C } from '@/constants/theme'
import { Card } from '@/components/common/Card'
import { Tag } from '@/components/common/Tag'
import { DataTable } from '@/components/common/Table'
import { ProgBar } from '@/components/common/ProgressBar'
import { KAFKA_TOPICS } from '@/constants/mockData'

const tpsData = Array.from({ length: 20 }, (_, i) => ({
  t: i,
  p: 7000 + Math.sin(i * 0.5) * 2000 + Math.random() * 500,
  c: 6800 + Math.sin(i * 0.4 + 1) * 1800 + Math.random() * 400,
}))

const BROKERS = [
  { id: 0, st: '健康', cpu: 32, mem: 45, disk: 60, net: '40/30 Mbps' },
  { id: 1, st: '健康', cpu: 28, mem: 42, disk: 58, net: '40/26 Mbps' },
  { id: 2, st: '健康', cpu: 35, mem: 48, disk: 62, net: '40/28 Mbps' },
]

export default function Kafka() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Metrics */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          ['集群状态', '健康', C.teal], ['Broker 数', '3', C.blue], ['Topic 数', '156', C.blue],
          ['分区数', '420', C.teal], ['生产 TPS', '8,560', C.purple], ['消费 TPS', '8,120', C.blue],
          ['集群延迟', '35ms', C.teal], ['失效副本', '0', C.teal],
        ].map(([l, v, c]) => (
          <div key={l} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 10, color: C.t2, marginBottom: 5, fontFamily: C.fontSans, textTransform: 'uppercase', letterSpacing: '.4px' }}>{l}</div>
            <div style={{ fontSize: v.length > 6 ? 18 : 22, fontWeight: 700, color: c, fontFamily: C.fontMono }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* TPS Chart */}
        <Card title="集群流量 — 生产 TPS vs 消费 TPS">
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={tpsData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" hide />
              <YAxis tick={{ fill: C.t2, fontSize: 9 }} />
              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
              <Line type="monotone" dataKey="p" stroke={C.teal}  strokeWidth={1.8} dot={false} name="生产 TPS" />
              <Line type="monotone" dataKey="c" stroke={C.blue}  strokeWidth={1.8} dot={false} name="消费 TPS" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Broker status */}
        <Card title="Broker 状态">
          <DataTable
            rowKey="id"
            rows={BROKERS}
            cols={[
              { key: 'id', title: '#', width: 28 },
              { key: 'st', title: '状态', render: v => <Tag color={C.teal} bg={C.tealBg}>{v}</Tag> },
              {
                key: 'cpu', title: 'CPU',
                render: v => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 60, height: 4, background: C.bg4, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${v}%`, height: '100%', background: C.teal }} />
                    </div>
                    <span style={{ fontSize: 10, color: C.t2 }}>{v}%</span>
                  </div>
                ),
              },
              {
                key: 'mem', title: '内存',
                render: v => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 60, height: 4, background: C.bg4, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${v}%`, height: '100%', background: C.blue }} />
                    </div>
                    <span style={{ fontSize: 10, color: C.t2 }}>{v}%</span>
                  </div>
                ),
              },
              { key: 'net', title: '网络 I/O', render: v => <span style={{ fontSize: 11 }}>{v}</span> },
            ]}
          />
        </Card>
      </div>

      {/* Delay chart */}
      <Card title="延迟监控 (ms)">
        <ResponsiveContainer width="100%" height={120}>
          <LineChart
            data={Array.from({ length: 20 }, (_, i) => ({ t: i, p: 20 + Math.sin(i * 0.6) * 15 + Math.random() * 8, c: 15 + Math.sin(i * 0.5 + 1) * 10 + Math.random() * 6 }))}
            margin={{ top: 4, right: 4, bottom: 0, left: -10 }}
          >
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" hide />
            <YAxis tick={{ fill: C.t2, fontSize: 9 }} />
            <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
            <Line type="monotone" dataKey="p" stroke={C.teal}  strokeWidth={1.8} dot={false} name="生产延迟" />
            <Line type="monotone" dataKey="c" stroke={C.amber} strokeWidth={1.8} dot={false} name="消费延迟" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Topic table */}
      <Card title="Topic 列表 — TOP5">
        <DataTable
          rowKey="id"
          rows={KAFKA_TOPICS}
          cols={[
            { key: 'topic', title: 'Topic', render: v => <code style={{ fontSize: 11, color: C.blue, fontFamily: C.fontMono }}>{v}</code> },
            { key: 'pTps',  title: '生产 TPS', render: v => <span style={{ color: C.teal,  fontFamily: C.fontMono }}>{v.toLocaleString()}</span> },
            { key: 'cTps',  title: '消费 TPS', render: v => <span style={{ color: C.blue,  fontFamily: C.fontMono }}>{v.toLocaleString()}</span> },
            { key: 'parts', title: '分区数' },
            { key: 'lag',   title: '积压',    render: v => <Tag color={v > 0 ? C.amber : C.teal} bg={v > 0 ? C.amberBg : C.tealBg}>{v}</Tag> },
          ]}
        />
      </Card>
    </div>
  )
}
