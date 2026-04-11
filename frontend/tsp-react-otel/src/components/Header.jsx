export default function Header() {
  return (
    <header style={{ borderBottom: '1px solid #1e3a5f', background: 'rgba(13,21,32,0.95)', backdropFilter: 'blur(12px)', padding: '0 32px', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #00ff88, #4da6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⬡</div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: '#e8f0fe', letterSpacing: '0.05em' }}>TSP · OTel 链路追踪验证台</div>
            <div style={{ fontSize: 11, color: '#5a7090', fontFamily: 'var(--mono)' }}>tsp-react-frontend → tsp-service1 → tsp-service2</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {[{ label: 'Service1', port: '8091', color: '#00ff88' }, { label: 'Service2', port: '8092', color: '#4da6ff' }, { label: 'Collector', port: '4318', color: '#00d4ff' }, { label: 'Jaeger UI', port: '16686', color: '#b06aff' }].map(item => (
            <div key={item.port} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, boxShadow: `0 0 6px ${item.color}` }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#94a8c0' }}>{item.label}<span style={{ color: '#5a7090' }}>:{item.port}</span></span>
            </div>
          ))}
          <a href="http://localhost:16686" target="_blank" rel="noreferrer" style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #1e3a5f', background: 'rgba(30,58,95,0.3)', color: '#4da6ff', fontSize: 12, textDecoration: 'none', fontFamily: 'var(--mono)' }}>Jaeger UI ↗</a>
        </div>
      </div>
    </header>
  );
}
