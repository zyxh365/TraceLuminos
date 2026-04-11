import { useState } from 'react';

const STATUS_COLOR   = { success: '#00ff88', error: '#ff4d6a', sending: '#ff8c42' };
const SCENARIO_COLOR = { 'RestTemplate':'#00ff88','OpenFeign':'#4da6ff','链路检查':'#00d4ff','异步线程池':'#b06aff','Baggage验证':'#ff8c42','Baggage':'#ff8c42' };

export default function TraceLog({ logs, onClear }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div style={{ background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #1e3a5f', background: 'rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#94a8c0' }}>调用日志</span>
          <span style={{ background: '#1e3a5f', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontFamily: 'var(--mono)', color: '#5a7090' }}>{logs.length}</span>
        </div>
        <button onClick={onClear} style={{ background: 'none', border: '1px solid #1e3a5f', borderRadius: 4, color: '#5a7090', fontSize: 11, fontFamily: 'var(--mono)', padding: '3px 10px', cursor: 'pointer' }}>清空</button>
      </div>

      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        {logs.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#5a7090', fontFamily: 'var(--mono)', fontSize: 12 }}>点击上方场景按钮开始验证...</div>
        ) : logs.map(log => {
          const isOpen = expanded === log.id;
          const color  = SCENARIO_COLOR[log.scenario] || '#94a8c0';
          const statusColor = STATUS_COLOR[log.status] || '#94a8c0';

          return (
            <div key={log.id} style={{ borderBottom: '1px solid #0d1520' }}>
              <div onClick={() => log.raw && setExpanded(isOpen ? null : log.id)}
                style={{ padding: '10px 20px', display: 'grid', gridTemplateColumns: '70px 100px 1fr auto', alignItems: 'center', gap: 14, cursor: log.raw ? 'pointer' : 'default', background: isOpen ? 'rgba(30,58,95,0.2)' : 'transparent' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#5a7090' }}>{log.ts}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color, background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>{log.scenario}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: statusColor }}>{log.message}</span>
                  {log.traceId && log.status !== 'sending' && (
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090' }}>
                        traceId: <span style={{ color: '#4da6ff' }}>{log.traceId?.slice(0,16)}...</span>
                        {log.match !== undefined && <span style={{ marginLeft: 6, color: log.match ? '#00ff88' : '#ff4d6a' }}>{log.match ? '✓ 链路贯通' : '✗ 不一致'}</span>}
                      </span>
                      {/* ★ 显示 Baggage 信息 */}
                      {log.baggageSnapshot && Object.keys(log.baggageSnapshot).length > 0 && (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090' }}>
                          baggage: <span style={{ color: '#ff8c42' }}>
                            {Object.entries(log.baggageSnapshot).map(([k,v])=>`${k}=${v}`).join(',')}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {log.raw && <span style={{ color: '#5a7090', fontSize: 11, fontFamily: 'var(--mono)' }}>{isOpen ? '▲' : '▼'}</span>}
              </div>

              {isOpen && log.raw && (
                <div style={{ padding: '0 20px 16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* TraceId + Baggage 对比 */}
                  <div style={{ background: '#080d14', border: '1px solid #1e3a5f', borderRadius: 6, padding: 14 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#5a7090', marginBottom: 10 }}>TraceId + Baggage</div>
                    <Row label="React traceId"    val={log.traceId}           color={color} />
                    {log.service1TraceId && <Row label="service1 traceId" val={log.service1TraceId} match={log.traceId === log.service1TraceId} />}
                    {log.service2TraceId && <Row label="service2 traceId" val={log.service2TraceId} match={log.traceId === log.service2TraceId} />}
                    {log.baggageSnapshot && Object.keys(log.baggageSnapshot).length > 0 && (
                      <>
                        <div style={{ borderTop: '1px solid #1e3a5f', margin: '8px 0' }} />
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#ff8c42', marginBottom: 6 }}>发送的 Baggage Header</div>
                        {Object.entries(log.baggageSnapshot).map(([k,v]) => (
                          <Row key={k} label={k} val={v} color="#ff8c42" />
                        ))}
                      </>
                    )}
                  </div>
                  {/* 原始响应 */}
                  <div style={{ background: '#080d14', border: '1px solid #1e3a5f', borderRadius: 6, padding: 14, overflow: 'auto', maxHeight: 220 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#5a7090', marginBottom: 10 }}>原始响应</div>
                    <pre style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {JSON.stringify(log.raw, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, val, color = '#4da6ff', match }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color, flex: 1, wordBreak: 'break-all' }}>{val || '-'}</span>
      {match !== undefined && <span style={{ fontSize: 11, color: match ? '#00ff88' : '#ff4d6a', flexShrink: 0 }}>{match ? '✓' : '✗'}</span>}
    </div>
  );
}
