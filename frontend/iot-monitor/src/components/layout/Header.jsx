import { useState, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { C } from '@/constants/theme'
import { NAV_ITEMS } from './Sidebar'

export function Header({ page, onNavigate }) {
  const [clock, setClock] = useState('')
  const [env, setEnv] = useState('prod')

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  const cur = NAV_ITEMS.find(n => n.key === page)

  return (
    <header
      style={{
        height: 52,
        background: C.bg1,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 18px',
        gap: 14,
        flexShrink: 0,
      }}
    >
      {/* Breadcrumb */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: C.fontSans, color: C.t2 }}>
        <span>首页</span>
        <span style={{ fontSize: 10 }}>›</span>
        <span style={{ color: C.t0 }}>{cur?.label}</span>
      </div>

      {/* Env select */}
      <select
        value={env}
        onChange={e => setEnv(e.target.value)}
        style={{
          background: C.bg3, border: `1px solid ${C.border}`, color: C.t1,
          borderRadius: 5, padding: '3px 10px', fontSize: 11, fontFamily: C.fontSans,
          cursor: 'pointer',
        }}
      >
        <option value="prod">生产环境</option>
        <option value="pre">预发环境</option>
        <option value="test">测试环境</option>
      </select>

      {/* Clock */}
      <div
        style={{
          fontFamily: C.fontMono, fontSize: 11, color: C.t2,
          background: 'rgba(255,255,255,0.04)', padding: '3px 10px',
          borderRadius: 5, whiteSpace: 'nowrap',
        }}
      >
        2025-05-20 &nbsp;{clock}
      </div>

      {/* Bell */}
      <div style={{ position: 'relative', cursor: 'pointer' }}>
        <Bell size={17} style={{ color: C.t1 }} />
        <span
          style={{
            position: 'absolute', top: -4, right: -5, fontSize: 8,
            padding: '1px 4px', borderRadius: 6, background: C.red,
            color: 'white', fontWeight: 700, fontFamily: C.fontMono,
          }}
        >
          23
        </span>
      </div>

      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div
          style={{
            width: 26, height: 26, borderRadius: '50%', background: C.blue,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: 'white',
          }}
        >
          A
        </div>
        <span style={{ fontSize: 12, fontFamily: C.fontSans, color: C.t1 }}>admin</span>
      </div>
    </header>
  )
}
