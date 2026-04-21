import { useState, useEffect } from 'react';

export default function Header({ activeTab, onTabChange }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const tabs = [
    { key: 'overview', label: '平台总览' },
    { key: 'topology', label: '服务拓扑' },
    { key: 'remote-control', label: '远控监控' },
    { key: 'verify', label: '链路验证' },
  ];

  return (
    <header style={{
      borderBottom: '1px solid #1e3a5f',
      background: 'rgba(13,21,32,0.95)',
      backdropFilter: 'blur(12px)',
      padding: '0 32px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1500,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
      }}>
        {/* Logo + 标题 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #00ff88, #4da6ff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 700,
            color: '#080d14',
          }}>T</div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: '#e8f0fe', letterSpacing: '0.05em' }}>
              TraceLuminos
            </div>
            <div style={{ fontSize: 11, color: '#5a7090', fontFamily: 'var(--mono)' }}>
              TSP 分布式链路追踪平台
            </div>
          </div>
        </div>

        {/* Tab 导航 */}
        <div style={{ display: 'flex', gap: 2 }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              style={{
                padding: '6px 18px',
                borderRadius: 5,
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 13,
                fontWeight: activeTab === tab.key ? 600 : 400,
                background: activeTab === tab.key ? 'rgba(77,166,255,0.1)' : 'transparent',
                border: '1px solid ' + (activeTab === tab.key ? 'rgba(77,166,255,0.3)' : 'transparent'),
                color: activeTab === tab.key ? '#e8f0fe' : '#5a7090',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 右侧信息 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            borderRadius: 4,
            background: 'rgba(0,255,136,0.08)',
            border: '1px solid rgba(0,255,136,0.2)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#00ff88' }}>测试环境</span>
          </div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#5a7090' }}>{time}</span>
        </div>
      </div>
    </header>
  );
}
