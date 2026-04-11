import { useState } from 'react';

/**
 * Baggage 设置面板
 *
 * 模拟"用户登录后设置 Baggage"的场景。
 * 实际生产中这些值从登录接口返回后调用 setBaggage() 一次即可，
 * 后续所有 fetch 自动携带，不需要手动传参。
 */
export default function BaggagePanel({ baggage, onApply }) {
  const [fields, setFields] = useState({ ...baggage });
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    // 过滤掉空值
    const filtered = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v.trim() !== '')
    );
    onApply(filtered);
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  };

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
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#ff8c42', fontWeight: 600 }}>
            Baggage 设置
          </span>
          <span style={{ fontSize: 11, color: '#5a7090' }}>
            — 模拟用户登录后设置业务上下文，后续所有请求自动携带
          </span>
        </div>

        {/* 当前 baggage Header 预览 */}
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10,
          color: '#5a7090', background: 'rgba(0,0,0,0.3)',
          border: '1px solid #1e3a5f', borderRadius: 4,
          padding: '4px 10px', maxWidth: 500, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <span style={{ color: '#ff8c4266' }}>baggage: </span>
          <span style={{ color: '#94a8c0' }}>
            {Object.entries(fields).filter(([,v])=>v).map(([k,v])=>`${k}=${v}`).join(', ')}
          </span>
        </div>
      </div>

      {/* 字段输入行 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: 10, alignItems: 'end' }}>
        {[
          { key: 'userId',   label: 'userId',   placeholder: '用户ID' },
          { key: 'vin',      label: 'vin',       placeholder: '车辆VIN' },
          { key: 'tenantId', label: 'tenantId',  placeholder: '租户ID' },
          { key: 'platform', label: 'platform',  placeholder: 'h5/android/ios' },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', marginBottom: 4 }}>
              {label}
            </div>
            <input
              value={fields[key] || ''}
              onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))}
              placeholder={placeholder}
              style={{
                width: '100%', padding: '7px 10px',
                background: 'rgba(0,0,0,0.4)', border: '1px solid #1e3a5f',
                borderRadius: 5, color: '#e8f0fe',
                fontFamily: 'var(--mono)', fontSize: 12,
                outline: 'none',
              }}
            />
          </div>
        ))}

        <button
          onClick={handleApply}
          style={{
            padding: '7px 20px',
            background: applied ? 'rgba(0,255,136,0.15)' : 'rgba(255,140,66,0.15)',
            border: `1px solid ${applied ? '#00ff8844' : '#ff8c4244'}`,
            borderRadius: 5,
            color: applied ? '#00ff88' : '#ff8c42',
            fontFamily: 'var(--mono)', fontSize: 12,
            cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'all 0.2s',
          }}
        >
          {applied ? '✓ 已应用' : '应用 Baggage'}
        </button>
      </div>

      {/* 说明 */}
      <div style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', lineHeight: 1.6 }}>
        点击"应用 Baggage"后，后续所有请求的 Header 自动包含：
        <span style={{ color: '#4da6ff', marginLeft: 6 }}>
          baggage: {Object.entries(fields).filter(([,v])=>v).map(([k,v])=>`${k}=${v}`).join(',')}
        </span>
        &nbsp;— 无需在每个请求里手动传参
      </div>
    </div>
  );
}
