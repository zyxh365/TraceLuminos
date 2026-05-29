import { useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header }  from '@/components/layout/Header'
import Dashboard       from '@/pages/Dashboard'
import CloudChain      from '@/pages/CloudChain'
import ServiceTopology from '@/pages/ServiceTopology'
import KafkaPage       from '@/pages/Kafka'
import { Devices, Alerts, Reports, Config } from '@/pages/misc'

// Placeholder for pages not yet fully built
const Placeholder = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'rgba(255,255,255,0.2)', fontSize: 16, fontFamily: 'sans-serif' }}>
    {label} — 页面开发中 🚧
  </div>
)

const PAGE_MAP = {
  dash:     Dashboard,
  chain:    CloudChain,
  topology: ServiceTopology,
  trace:    () => <CloudChain />,    // reuses CloudChain with different context
  kafka:    KafkaPage,
  mqtt:     () => <Placeholder label="MQTT 监控" />,
  devices:  Devices,
  alerts:   Alerts,
  reports:  Reports,
  config:   Config,
}

export default function App() {
  const [page, setPage] = useState('dash')
  const PageComp = PAGE_MAP[page] || Dashboard

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar page={page} onNavigate={setPage} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header page={page} onNavigate={setPage} />

        <main style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#080c14' }}>
          <PageComp />
        </main>
      </div>
    </div>
  )
}
