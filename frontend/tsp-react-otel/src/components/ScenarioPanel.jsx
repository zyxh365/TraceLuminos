export default function ScenarioPanel({ num, title, subtitle, color, endpoint, body, points, running, onRun }) {
  return (
    <div style={{ background: 'rgba(13,21,32,0.9)', border: `1px solid ${color}22`, borderTop: `2px solid ${color}`, borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700, color, opacity: 0.4, lineHeight: 1 }}>{num}</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#e8f0fe', marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: 11, color: '#5a7090' }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #1e3a5f', borderRadius: 5, padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 11, color: '#94a8c0' }}>
        <span style={{ color, marginRight: 6, opacity: 0.7 }}>→</span>{endpoint}
      </div>
      {body && <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid #1a3050', borderRadius: 5, padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090' }}>{body}</div>}
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {points.map((p, i) => (
          <li key={i} style={{ display: 'flex', gap: 7, fontSize: 11, color: '#94a8c0' }}>
            <span style={{ color, opacity: 0.6 }}>✓</span>{p}
          </li>
        ))}
      </ul>
      <button onClick={onRun} disabled={running} style={{ marginTop: 'auto', padding: '9px 16px', background: running ? 'rgba(30,58,95,0.3)' : `${color}18`, border: `1px solid ${running ? '#1e3a5f' : color + '44'}`, borderRadius: 5, color: running ? '#5a7090' : color, fontFamily: 'var(--mono)', fontSize: 12, cursor: running ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {running ? <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>执行中...</> : `▶ 运行 ${num}`}
      </button>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
