import { useState } from 'react';

export default function BaggagePanel({ baggage, onApply }) {
  const [fields, setFields] = useState({ ...baggage });
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    const filtered = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v.trim() !== '')
    );
    onApply(filtered);
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  };

  const fieldDefs = [
    { key: 'biz.user_id',     label: 'biz.user_id',     placeholder: '用户ID' },
    { key: 'biz.vin',         label: 'biz.vin',         placeholder: '车辆VIN' },
    { key: 'biz.platform',    label: 'biz.platform',    placeholder: 'h5/android/ios/web/tbox' },
    { key: 'biz.app_version', label: 'biz.app_version', placeholder: 'APP版本号' },
    { key: 'biz.system',      label: 'biz.system',      placeholder: 'NTSP / STSP' },
    { key: 'biz.channel',     label: 'biz.channel',     placeholder: 'chery-app / jetour-app' },
    { key: 'biz.brand',       label: 'biz.brand',       placeholder: 'chery / jetour / icar' },
    { key: 'biz.tenant',      label: 'biz.tenant',      placeholder: '租户标识' },
  ];

  return (
    <div style={{
      background: 'rgba(13,21,32,0.9)',
      border: '1px solid #ff8c4233',
      borderLeft: '3px solid #ff8c42',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff8c42', boxShadow: '0 0 6px #ff8c42' }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#ff8c42', fontWeight: 600 }}>Baggage 设置</span>
          <span style={{ fontSize: 11, color: '#5a7090' }}>— 模拟用户登录后设置业务上下文</span>
        </div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', background: 'rgba(0,0,0,0.3)',
          border: '1px solid #1e3a5f', borderRadius: 4, padding: '4px 10px', maxWidth: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <span style={{ color: '#ff8c4266' }}>baggage: </span>
          <span style={{ color: '#94a8c0' }}>
            {Object.entries(fields).filter(([,v])=>v).map(([k,v])=>`${k}=${v}`).join(', ')}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: 10, alignItems: 'end' }}>
        {fieldDefs.map(({ key, label, placeholder }) => (
          <div key={key}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', marginBottom: 4 }}>{label}</div>
            <input value={fields[key] || ''} onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))}
              placeholder={placeholder}
              style={{ width: '100%', padding: '7px 10px', background: 'rgba(0,0,0,0.4)', border: '1px solid #1e3a5f', borderRadius: 5, color: '#e8f0fe', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none' }} />
          </div>
        ))}
        <button onClick={handleApply} style={{
          padding: '7px 20px', background: applied ? 'rgba(0,255,136,0.15)' : 'rgba(255,140,66,0.15)',
          border: `1px solid ${applied ? '#00ff8844' : '#ff8c4244'}`, borderRadius: 5,
          color: applied ? '#00ff88' : '#ff8c42', fontFamily: 'var(--mono)', fontSize: 12,
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
        }}>{applied ? '✓ 已应用' : '应用 Baggage'}</button>
      </div>
    </div>
  );
}
