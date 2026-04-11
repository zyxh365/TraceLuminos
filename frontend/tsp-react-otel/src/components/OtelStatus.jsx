import { useEffect, useState } from 'react';
import { trace } from '@opentelemetry/api';

export default function OtelStatus() {
  const [status, setStatus] = useState('checking');
  const [info, setInfo] = useState({});

  useEffect(() => {
    try {
      const t = trace.getTracer('tsp-react-frontend');
      const span = t.startSpan('otel.init.check');
      const ctx = span.spanContext();
      span.end();
      if (ctx.traceId && ctx.traceId !== '00000000000000000000000000000000') {
        setStatus('ok');
        setInfo({ traceId: ctx.traceId });
      } else { setStatus('warn'); }
    } catch { setStatus('error'); }
  }, []);

  const colors = { ok: '#00ff88', warn: '#ff8c42', error: '#ff4d6a', checking: '#94a8c0' };
  const labels = { ok: 'OTel Agent 已就绪', warn: '部分初始化', error: '初始化失败', checking: '检查中...' };
  const color = colors[status];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'rgba(13,21,32,0.8)', border: `1px solid ${color}22`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '12px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color }}>{labels[status]}</span>
      </div>
      {info.traceId && (<><div style={{ width: 1, height: 20, background: '#1e3a5f' }} /><div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#5a7090' }}>测试 traceId：<span style={{ color: '#94a8c0' }}>{info.traceId}</span></div></>)}
      <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: '#5a7090' }}>exporter → <span style={{ color: '#4da6ff' }}>http://localhost:4318/v1/traces</span></div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
}
