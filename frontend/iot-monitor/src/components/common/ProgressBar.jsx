import { C } from '@/constants/theme'

export function ProgBar({ label, value, max = 100, color = C.teal, unit = '%', style = {} }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ marginBottom: 10, ...style }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: C.t1,
          marginBottom: 4,
          fontFamily: C.fontSans,
        }}
      >
        <span>{label}</span>
        <span style={{ color, fontFamily: C.fontMono }}>
          {value}
          {unit}
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: C.bg4,
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: 2,
            transition: 'width .6s ease',
          }}
        />
      </div>
    </div>
  )
}
