import { COLORS } from '../constants.js';

/**
 * 数字指标卡片
 * @param {{ label: string, value: number|string, unit?: string, color?: string, alert?: boolean, subtitle?: string }} props
 */
export default function MetricCard({ label, value, unit = '', color, alert, subtitle }) {
  const displayColor = alert ? COLORS.error : (color || COLORS.primary);
  const borderColor = alert ? 'rgba(255,77,106,0.4)' : 'rgba(30,58,95,0.5)';

  return (
    <div style={{
      background: COLORS.bg,
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      padding: '14px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: 'var(--mono)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontSize: 26,
          fontWeight: 700,
          color: displayColor,
          fontFamily: 'var(--mono)',
          lineHeight: 1.1,
        }}>
          {typeof value === 'number' ? value.toLocaleString('zh-CN') : (value ?? '--')}
        </span>
        {unit && <span style={{ fontSize: 12, color: COLORS.muted, fontFamily: 'var(--mono)' }}>{unit}</span>}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: 'var(--mono)' }}>{subtitle}</div>
      )}
    </div>
  );
}
