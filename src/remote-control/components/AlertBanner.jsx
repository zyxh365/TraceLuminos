import { COLORS } from '../constants.js';

const severityConfig = {
  critical: { bg: 'rgba(255,77,106,0.12)', border: 'rgba(255,77,106,0.4)', text: '#ff4d6a', label: '严重' },
  warning:  { bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.4)',  text: '#eab308', label: '警告' },
  info:     { bg: 'rgba(77,166,255,0.12)', border: 'rgba(77,166,255,0.4)', text: '#4da6ff', label: '信息' },
};

/**
 * 告警横幅
 * @param {{ alerts: Array<{rule_name: string, severity: string, metric_value: number, threshold: number, alert_time: string}> }} props
 */
export default function AlertBanner({ alerts }) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div style={{
      maxHeight: 120,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      {alerts.slice(0, 10).map((alert, i) => {
        const cfg = severityConfig[alert.severity] || severityConfig.info;
        return (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 12px',
            borderRadius: 4,
            background: cfg.bg,
            border: `1px solid ${cfg.border}`,
            fontSize: 12,
            fontFamily: 'var(--mono)',
          }}>
            <span style={{
              padding: '1px 6px',
              borderRadius: 3,
              background: cfg.text + '22',
              color: cfg.text,
              fontSize: 10,
              fontWeight: 600,
            }}>{cfg.label}</span>
            <span style={{ color: COLORS.textColor || '#94a8c0', flex: 1 }}>{alert.rule_name}</span>
            {alert.metric_value != null && (
              <span style={{ color: cfg.text }}>
                {alert.metric_value}
                {alert.threshold != null && ` / ${alert.threshold}`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
