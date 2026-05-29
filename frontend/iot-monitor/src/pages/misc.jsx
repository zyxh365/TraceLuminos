// ── Devices ───────────────────────────────────────────────────
import { C } from '@/constants/theme'
import { Card } from '@/components/common/Card'
import { StTag } from '@/components/common/Tag'
import { Btn } from '@/components/common/Button'
import { DataTable } from '@/components/common/Table'
import { DEVICES } from '@/constants/mockData'

export function Devices() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {['全部类型', '全部状态'].map(p => (
          <select key={p} style={{ background: C.bg3, border: `1px solid ${C.border}`, color: C.t1, borderRadius: 5, padding: '4px 10px', fontSize: 12, fontFamily: C.fontSans }}>
            <option>{p}</option>
          </select>
        ))}
        <input placeholder="搜索设备ID / VIN…" style={{ background: C.bg3, border: `1px solid ${C.border}`, color: C.t0, borderRadius: 5, padding: '4px 12px', fontSize: 12, width: 200 }} />
        <Btn variant="primary">搜索</Btn>
        <Btn>重置</Btn>
        <Btn variant="teal" style={{ marginLeft: 'auto' }}>+ 新增设备</Btn>
        <Btn>批量导出</Btn>
      </div>
      <Card
        title={<span>设备列表 <span style={{ fontSize: 11, color: C.t2, fontWeight: 400 }}>共 8,932 条</span></span>}
      >
        <DataTable
          rowKey="id"
          rows={DEVICES}
          cols={[
            { key: 'id',     title: '设备ID',  render: v => <code style={{ fontSize: 11, color: C.blue, fontFamily: C.fontMono }}>{v}</code> },
            { key: 'name',   title: '设备名称' },
            { key: 'vin',    title: 'VIN',     render: v => <code style={{ fontSize: 10, color: C.t2, fontFamily: C.fontMono }}>{v}</code> },
            { key: 'region', title: '区域' },
            { key: 'st',     title: '状态',    render: v => <StTag st={v} /> },
            { key: 'last',   title: '最后上线', render: v => <span style={{ color: C.t2 }}>2025-05-20 {v}</span> },
            { key: 'id',     title: '操作',    render: () => <div style={{ display: 'flex', gap: 4 }}><Btn>查看</Btn><Btn>追踪</Btn><Btn variant="danger">删除</Btn></div> },
          ]}
        />
      </Card>
    </div>
  )
}

// ── Alerts ────────────────────────────────────────────────────
import { LvlTag } from '@/components/common/Tag'
import { ALERTS } from '@/constants/mockData'

export function Alerts() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {['全部级别', '全部状态', '近24小时'].map(p => (
          <select key={p} style={{ background: C.bg3, border: `1px solid ${C.border}`, color: C.t1, borderRadius: 5, padding: '4px 10px', fontSize: 12, fontFamily: C.fontSans }}>
            <option>{p}</option>
          </select>
        ))}
        <input placeholder="搜索告警…" style={{ background: C.bg3, border: `1px solid ${C.border}`, color: C.t0, borderRadius: 5, padding: '4px 12px', fontSize: 12, width: 200 }} />
        <Btn variant="primary">搜索</Btn>
        <Btn>重置</Btn>
        <Btn variant="danger" style={{ marginLeft: 'auto' }}>批量忽略</Btn>
        <Btn>批量确认</Btn>
      </div>
      <Card
        title={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>告警列表</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: C.redBg,   color: C.red,   fontWeight: 700 }}>128 未处理</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: C.amberBg, color: C.amber, fontWeight: 700 }}>56 处理中</span>
          </div>
        }
      >
        <DataTable
          rowKey="id"
          rows={ALERTS}
          cols={[
            { key: 'lvl',   title: '级别',    render: v => <LvlTag lvl={v} /> },
            { key: 'title', title: '告警内容', maxWidth: 200 },
            { key: 'src',   title: '来源',     render: v => <code style={{ fontSize: 11, color: C.t2, fontFamily: C.fontMono }}>{v}</code> },
            { key: 'time',  title: '时间',     render: v => <span style={{ color: C.amber }}>{v}</span> },
            { key: 'st',    title: '状态',     render: v => <StTag st={v} /> },
            { key: 'id',    title: '操作',     render: () => <div style={{ display: 'flex', gap: 4 }}><Btn>处理</Btn><Btn>忽略</Btn><Btn>详情</Btn></div> },
          ]}
        />
      </Card>
    </div>
  )
}

// ── Reports ───────────────────────────────────────────────────
import { AreaChart, Area, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { MetricCard } from '@/components/common/MetricCard'
import { ProgBar } from '@/components/common/ProgressBar'
import { mkSpark } from '@/constants/mockData'

const latencyData = Array.from({ length: 24 }, (_, i) => ({
  t: `${i}:00`,
  p50: 80  + Math.sin(i * 0.4) * 30  + Math.random() * 20,
  p90: 200 + Math.sin(i * 0.4) * 60  + Math.random() * 40,
  p99: 600 + Math.sin(i * 0.3) * 200 + Math.random() * 100,
}))

export function Reports() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <MetricCard label="云控指令总计" value="12,560次"  color={C.blue}  spark={mkSpark(60, 20)} sub="↑ +2.1% vs 昨日" />
        <MetricCard label="指令成功率"   value="98.23%"    color={C.teal}  spark={mkSpark(95,  2)} sub="↑ +1.0% vs 昨日" />
        <MetricCard label="设备在线率"   value="92.45%"    color={C.teal}  spark={mkSpark(88,  4)} sub="↑ +1.8% vs 昨日" />
        <MetricCard label="今日告警总计" value="128 次"    color={C.red}   spark={mkSpark(40, 25)} sub="↓ -8.2% vs 昨日" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 10 }}>
        <Card title="云控指令趋势">
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={Array.from({ length: 24 }, (_, i) => ({ t: `${i}:00`, ok: 400 + Math.sin(i * 0.4) * 120 + Math.random() * 40, fail: 10 + Math.random() * 15 }))} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="rok2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.teal} stopOpacity={0.3} /><stop offset="100%" stopColor={C.teal} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="rfail2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.red} stopOpacity={0.3} /><stop offset="100%" stopColor={C.red} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" tick={{ fill: C.t2, fontSize: 9 }} interval={3} />
              <YAxis tick={{ fill: C.t2, fontSize: 9 }} />
              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
              <Area type="monotone" dataKey="ok"   stroke={C.teal} strokeWidth={1.8} fill="url(#rok2)"   dot={false} name="成功" />
              <Area type="monotone" dataKey="fail" stroke={C.red}  strokeWidth={1.8} fill="url(#rfail2)" dot={false} name="失败" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="指令类型分布">
          <div style={{ padding: '8px 0' }}>
            {[['解锁', 35.6, C.blue], ['上锁', 28.3, C.teal], ['寻车', 18.2, C.purple], ['启动', 9.8, C.amber], ['其他', 8.1, C.t2]].map(([t, p, c]) => (
              <ProgBar key={t} label={t} value={p} color={c} />
            ))}
          </div>
        </Card>
      </div>

      <Card title="延迟百分位趋势 (P50 / P90 / P99)">
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={latencyData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: C.t2, fontSize: 9 }} interval={3} />
            <YAxis tick={{ fill: C.t2, fontSize: 9 }} />
            <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
            <Line type="monotone" dataKey="p50" stroke={C.teal}  strokeWidth={1.8} dot={false} name="P50" />
            <Line type="monotone" dataKey="p90" stroke={C.amber} strokeWidth={1.8} dot={false} name="P90" />
            <Line type="monotone" dataKey="p99" stroke={C.red}   strokeWidth={1.8} dot={false} name="P99" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}

// ── Config ────────────────────────────────────────────────────
import { useState } from 'react'

const CFGS = {
  sys: [
    { name: 'system.name',         val: '车联网全链路监控平台', desc: '系统名称' },
    { name: 'system.version',      val: 'v1.0.0',              desc: '系统版本' },
    { name: 'system.timezone',     val: 'Asia/Shanghai',       desc: '时区设置' },
    { name: 'system.language',     val: 'zh-CN',               desc: '语言设置' },
    { name: 'system.login.expire', val: '24h',                 desc: '登录过期时间' },
  ],
  svc: [
    { name: 'service.trace.enable', val: 'true',    desc: '链路追踪开关' },
    { name: 'service.timeout',      val: '5000ms',  desc: '默认超时时间' },
    { name: 'service.retry',        val: '3',       desc: '重试次数' },
  ],
  alert: [
    { name: 'alert.latency',    val: '1000ms',          desc: '延迟告警阈值' },
    { name: 'alert.error.rate', val: '5%',              desc: '错误率告警阈值' },
    { name: 'alert.receiver',   val: 'ops@company.com', desc: '告警接收人' },
  ],
}

export function Config() {
  const [cat, setCat] = useState('sys')
  const cats = [['sys', '系统配置'], ['svc', '服务配置'], ['mw', '中间件配置'], ['alert', '告警配置'], ['perm', '权限配置']]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}>
      {/* Category list */}
      <Card noPad>
        {cats.map(([k, l]) => (
          <div
            key={k}
            onClick={() => setCat(k)}
            style={{
              padding: '10px 14px', fontSize: 12, cursor: 'pointer',
              color: cat === k ? C.teal : C.t1,
              background: cat === k ? C.tealBg : 'transparent',
              borderLeft: cat === k ? `2px solid ${C.teal}` : '2px solid transparent',
              fontFamily: C.fontSans, transition: 'all .15s',
            }}
          >
            {l}
          </div>
        ))}
      </Card>

      {/* Config table */}
      <Card
        title="配置项"
        extra={
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn variant="teal">保存</Btn>
            <Btn>重置</Btn>
          </div>
        }
      >
        <DataTable
          rowKey="name"
          rows={CFGS[cat] || CFGS.sys}
          cols={[
            { key: 'name', title: '配置项', render: v => <code style={{ fontSize: 11, color: C.blue, fontFamily: C.fontMono }}>{v}</code> },
            { key: 'val',  title: '配置值', render: v => <span style={{ color: C.teal, fontFamily: C.fontMono }}>{v}</span> },
            { key: 'desc', title: '描述',   render: v => <span style={{ color: C.t2 }}>{v}</span> },
            { key: 'name', title: '操作',   render: () => <Btn>编辑</Btn> },
          ]}
        />
      </Card>
    </div>
  )
}
