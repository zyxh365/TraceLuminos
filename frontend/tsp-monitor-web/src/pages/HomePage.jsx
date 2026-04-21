import { useState, useEffect } from 'react';
import TopologyOverview from '../components/TopologyOverview.jsx';

const BASE = '/monitor';

// ── 指标卡片 ──────────────────────────────────────────────

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.25)',
      border: '1px solid #1e3a5f',
      borderRadius: 8,
      padding: '16px 20px',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 12, color: '#5a7090', fontFamily: 'var(--mono)', marginBottom: 8 }}>{label}</div>
      <div style={{
        fontSize: 28, fontWeight: 700, fontFamily: 'var(--mono)',
        color: color, lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  );
}

// ── 告警条目 ──────────────────────────────────────────────

function AlertItem({ alert }) {
  const severityMap = {
    critical: { color: '#ff4d6a', bg: 'rgba(255,77,106,0.1)', label: '严重' },
    warning: { color: '#eab308', bg: 'rgba(234,179,8,0.1)', label: '警告' },
    info: { color: '#4da6ff', bg: 'rgba(77,166,255,0.1)', label: '信息' },
  };
  const cfg = severityMap[alert.severity] || severityMap.info;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px', borderRadius: 5,
      background: cfg.bg, border: `1px solid ${cfg.color}22`,
    }}>
      <span style={{
        padding: '1px 6px', borderRadius: 3,
        background: cfg.color + '22', color: cfg.color,
        fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)',
      }}>{cfg.label}</span>
      <span style={{ flex: 1, fontSize: 12, fontFamily: 'var(--mono)', color: '#94a8c0' }}>{alert.rule_name}</span>
      {alert.metric_value != null && (
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: cfg.color }}>
          {alert.metric_value}{alert.threshold != null ? ` / ${alert.threshold}` : ''}
        </span>
      )}
    </div>
  );
}

// ── 主页组件 ──────────────────────────────────────────────

export default function HomePage({ onNavigate }) {
  const [stats, setStats] = useState({ services: '--', traces: '--', errorRate: '--', vehicles: '--' });
  const [alerts, setAlerts] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // 加载概览指标
  useEffect(() => {
    async function loadStats() {
      try {
        const now = Date.now();
        const res = await fetch(`${BASE}/dashboard/remote-control/overview?startTime=${now - 3600000}&endTime=${now}&interval=60`);
        const json = await res.json();
        if (json.code === 200 && json.data) {
          const d = json.data;
          const e2e = d.e2e || {};
          const conn = d.vehicleConnection || {};
          setStats({
            services: d.totalServices ?? '--',
            traces: e2e.totalCommands ?? '--',
            errorRate: e2e.failureRate != null ? e2e.failureRate.toFixed(1) + '%' : '--',
            vehicles: conn.onlineVehicleCount ?? '--',
          });
        }
      } catch {
        // 静默失败，显示占位符
      } finally {
        setStatsLoading(false);
      }
    }
    loadStats();
  }, []);

  // 加载告警
  useEffect(() => {
    async function loadAlerts() {
      try {
        const now = Date.now();
        const res = await fetch(`${BASE}/dashboard/remote-control/alerts?startTime=${now - 3600000}&endTime=${now}`);
        const json = await res.json();
        if (json.code === 200 && json.data) {
          setAlerts(json.data.slice(0, 5));
        }
      } catch {
        // 静默失败
      }
    }
    loadAlerts();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* 平台概览指标 */}
      <div>
        <div style={{
          fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)',
          color: '#e8f0fe', marginBottom: 14,
          paddingBottom: 8, borderBottom: '1px solid #1e3a5f',
        }}>
          平台概览
          <span style={{ fontSize: 11, color: '#5a7090', marginLeft: 10, fontWeight: 400 }}>
            {statsLoading ? '加载中...' : '最近 1 小时'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <StatCard label="服务数量" value={stats.services} color="#4da6ff" />
          <StatCard label="活跃链路" value={stats.traces} color="#00ff88" />
          <StatCard label="错误率" value={stats.errorRate} color={String(stats.errorRate).includes('--') ? '#5a7090' : '#ff4d6a'} />
          <StatCard label="在线车辆" value={stats.vehicles} color="#00d4ff" />
        </div>
      </div>

      {/* 服务链路拓扑 */}
      <TopologyOverview startTime={Date.now() - 3600000} endTime={Date.now()} />

      {/* 最近告警 */}
      <div>
        <div style={{
          fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)',
          color: '#e8f0fe', marginBottom: 14,
          paddingBottom: 8, borderBottom: '1px solid #1e3a5f',
        }}>
          最近告警
          <span style={{ fontSize: 11, color: '#5a7090', marginLeft: 10, fontWeight: 400 }}>
            {alerts.length === 0 ? '无告警' : `共 ${alerts.length} 条`}
          </span>
        </div>
        <div style={{
          background: 'rgba(13,21,32,0.9)',
          border: '1px solid #1e3a5f',
          borderRadius: 8,
          padding: '12px 16px',
          display: 'flex', flexDirection: 'column', gap: 6,
          minHeight: 60,
        }}>
          {alerts.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '8px 0', color: '#00ff88', fontFamily: 'var(--mono)', fontSize: 12,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
              一切正常，暂无告警
            </div>
          ) : alerts.map((alert, i) => (
            <AlertItem key={i} alert={alert} />
          ))}
        </div>
      </div>

      {/* 系统架构 */}
      <div style={{
        background: 'rgba(13,21,32,0.9)',
        border: '1px solid #1e3a5f',
        borderRadius: 8,
        padding: '16px 20px',
      }}>
        <div style={{
          fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)',
          color: '#e8f0fe', marginBottom: 14,
        }}>
          数据流
        </div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 11, color: '#5a7090',
          lineHeight: 2, display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#00ff88' }}>Java Agent</span>
            <span style={{ color: '#1e3a5f' }}>→ OTLP →</span>
            <span style={{ color: '#00d4ff' }}>Edge Collector</span>
            <span style={{ color: '#1e3a5f' }}>→ Kafka →</span>
            <span style={{ color: '#00d4ff' }}>Central Collector</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 140 }}>
            <span style={{ color: '#1e3a5f' }}>→</span>
            <span style={{ color: '#eab308' }}>ClickHouse</span>
            <span style={{ color: '#5a7090' }}>(Traces)</span>
            <span style={{ color: '#1e3a5f' }}>+</span>
            <span style={{ color: '#b06aff' }}>VictoriaMetrics</span>
            <span style={{ color: '#5a7090' }}>(Metrics)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
