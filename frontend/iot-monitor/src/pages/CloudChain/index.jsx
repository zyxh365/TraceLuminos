import { useState } from 'react'
import { C } from '@/constants/theme'
import { Card } from '@/components/common/Card'
import { Tag } from '@/components/common/Tag'
import { GanttChart } from '@/components/charts/GanttChart'
import { SPAN_DATA } from '@/constants/mockData'

export default function CloudChain() {
  const [selSpan, setSelSpan] = useState(SPAN_DATA[5])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Command bar */}
      <div style={{
        background: 'rgba(0,219,168,0.05)', border: `1px solid ${C.teal}30`,
        borderRadius: 8, padding: '10px 14px',
        display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
        fontSize: 12, fontFamily: C.fontSans,
      }}>
        {[
          ['指令ID', <code key="id" style={{ color: C.blue, fontSize: 11, fontFamily: C.fontMono }}>CMD20250520100123456</code>],
          ['类型', <Tag key="t" color={C.blue} bg={C.blueBg}>车门解锁</Tag>],
          ['发起', <span key="s" style={{ color: C.t1 }}>APP iOS 1.2.3</span>],
          ['目标', <Tag key="g">粤A-12345</Tag>],
          ['状态', <Tag key="st" color={C.teal} bg={C.tealBg}>✓ 成功</Tag>],
          ['总耗时', <span key="dur" style={{ color: C.teal, fontWeight: 700, fontFamily: C.fontMono }}>1283ms</span>],
        ].map(([label, val]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: C.t2 }}>{label}</span>{val}
          </span>
        ))}
      </div>

      {/* Gantt + detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12 }}>
        <Card title="Span 追踪 — 甘特瀑布图">
          <div style={{ display: 'flex' }}>
            {/* Span labels */}
            <div style={{ width: 130, paddingTop: 22, flexShrink: 0 }}>
              {SPAN_DATA.map((s, i) => (
                <div
                  key={i}
                  onClick={() => setSelSpan(s)}
                  style={{
                    height: 24, display: 'flex', alignItems: 'center', gap: 6,
                    cursor: 'pointer', padding: '0 8px',
                    background: selSpan?.name === s.name ? C.tealBg : 'transparent',
                    borderRadius: 4, transition: 'background .1s',
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.ok ? C.teal : C.amber, flexShrink: 0 }} />
                  <span style={{ fontSize: 10.5, color: s.ok ? C.t1 : C.amber, fontFamily: C.fontSans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, overflowX: 'auto' }}>
              <GanttChart spans={SPAN_DATA} />
            </div>
          </div>
        </Card>

        {/* Span detail */}
        <Card title="Span 详情">
          {selSpan && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['Trace ID',  <code key="t" style={{ fontSize: 10, color: C.blue, fontFamily: C.fontMono }}>1e6a8c5f3b2d4e7a9c</code>],
                ['Span ID',   <code key="s" style={{ fontSize: 10, color: C.blue, fontFamily: C.fontMono }}>3f2e1d0c9b8a7e6d</code>],
                ['服务',      <span key="svc" style={{ color: C.t1, fontFamily: C.fontMono, fontSize: 11 }}>{selSpan.svc}</span>],
                ['Span 名',   <span key="n" style={{ color: C.t1 }}>{selSpan.name}</span>],
                ['状态',      <Tag key="st" color={selSpan.ok ? C.teal : C.amber} bg={selSpan.ok ? C.tealBg : C.amberBg}>{selSpan.ok ? '成功' : '慢调用'}</Tag>],
                ['耗时',      <span key="d" style={{ color: selSpan.ok ? C.teal : C.amber, fontWeight: 700, fontFamily: C.fontMono }}>{selSpan.dur}ms</span>],
                ['偏移',      <span key="o" style={{ color: C.t2, fontFamily: C.fontMono }}>{selSpan.ofs}ms</span>],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11 }}>
                  <span style={{ color: C.t2, minWidth: 64, fontFamily: C.fontSans }}>{k}</span>
                  {v}
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 2 }}>
                <div style={{ fontSize: 10, color: C.t2, marginBottom: 6, fontFamily: C.fontSans }}>Tags</div>
                {[['cmdType', 'unlock_door'], ['vin', 'LSGA****1234'], ['userId', 'user_10086']].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 10, padding: '3px 0', fontSize: 11 }}>
                    <span style={{ color: C.t2, minWidth: 64, fontFamily: C.fontSans }}>{k}</span>
                    <span style={{ color: C.teal, fontFamily: C.fontMono }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
