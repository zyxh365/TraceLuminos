import { COLORS, TIME_PRESETS } from '../constants.js';

/**
 * 时间范围选择器
 * @param {{ activePreset: string, onChange: (preset: string, seconds: number) => void }} props
 */
export default function TimeRangeSelector({ activePreset, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {TIME_PRESETS.map(p => (
        <button
          key={p.key}
          onClick={() => onChange(p.key, p.seconds)}
          style={{
            padding: '4px 10px',
            borderRadius: 4,
            border: `1px solid ${activePreset === p.key ? COLORS.primary : 'transparent'}`,
            background: activePreset === p.key ? 'rgba(77,166,255,0.12)' : 'transparent',
            color: activePreset === p.key ? COLORS.primary : COLORS.muted,
            fontSize: 12,
            fontFamily: 'var(--mono)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
