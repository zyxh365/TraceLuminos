import { useState } from 'react'
import {
  Monitor, GitBranch, Layers, Activity,
  Server, Radio, Cpu, Bell, TrendingUp, Settings,
} from 'lucide-react'
import { C } from '@/constants/theme'

export const NAV_ITEMS = [
  { key: 'dash',     icon: Monitor,      label: '总览驾驶舱' },
  { key: 'chain',    icon: GitBranch,    label: '云控链路'   },
  { key: 'topology', icon: Layers,       label: '服务拓扑'   },
  { key: 'trace',    icon: Activity,     label: '链路追踪'   },
  { key: 'kafka',    icon: Server,       label: 'Kafka 监控' },
  { key: 'mqtt',     icon: Radio,        label: 'MQTT 监控'  },
  { key: 'devices',  icon: Cpu,          label: '设备管理'   },
  { key: 'alerts',   icon: Bell,         label: '告警中心',  badge: 23 },
  { key: 'reports',  icon: TrendingUp,   label: '报表分析'   },
  { key: 'config',   icon: Settings,     label: '配置管理'   },
]

export function Sidebar({ page, onNavigate }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      style={{
        width: collapsed ? 52 : 192,
        background: C.bg1,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width .2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
          borderBottom: `1px solid ${C.border}`,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 20, flexShrink: 0 }}>🛰️</span>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.t0, lineHeight: 1.4, whiteSpace: 'nowrap', fontFamily: C.fontSans }}>
              车联网监控
            </div>
            <div style={{ fontSize: 8.5, color: C.t2, letterSpacing: 1.8, whiteSpace: 'nowrap', fontFamily: C.fontMono }}>
              FULL CHAIN MONITOR
            </div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV_ITEMS.map(({ key, icon: Icon, label, badge }) => {
          const active = page === key
          return (
            <div
              key={key}
              onClick={() => onNavigate(key)}
              title={collapsed ? label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: collapsed ? '12px 0' : '9px 14px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                cursor: 'pointer',
                background: active ? C.tealBg : 'transparent',
                borderLeft: active ? `2px solid ${C.teal}` : '2px solid transparent',
                color: active ? C.teal : C.t1,
                transition: 'all .12s',
                position: 'relative',
              }}
            >
              <Icon size={15} style={{ color: active ? C.teal : C.t2, flexShrink: 0 }} />
              {!collapsed && (
                <span style={{ fontSize: 12, fontFamily: C.fontSans, whiteSpace: 'nowrap', flex: 1 }}>
                  {label}
                </span>
              )}
              {!collapsed && badge && (
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: C.redBg, color: C.red, fontWeight: 700 }}>
                  {badge}
                </span>
              )}
              {collapsed && badge && (
                <span style={{ position: 'absolute', top: 6, right: 8, width: 7, height: 7, borderRadius: '50%', background: C.red }} />
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
