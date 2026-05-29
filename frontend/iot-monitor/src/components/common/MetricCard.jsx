import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { C } from '@/constants/theme'

export function MetricCard({ label, value, color = C.teal, spark, sub, style = {} }) {
  const gradId = `mg${color.replace('#', '')}`
  return (
    <div
      style={{
        background: C.bg2,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: '14px 16px',
        flex: 1,
        minWidth: 120,
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: C.t2,
          marginBottom: 6,
          fontFamily: C.fontSans,
          letterSpacing: '.4px',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color,
          fontFamily: C.fontMono,
          lineHeight: 1,
          marginBottom: sub ? 4 : 0,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: C.t2, fontFamily: C.fontSans }}>
          {sub}
        </div>
      )}
      {spark && (
        <ResponsiveContainer width="100%" height={28} style={{ marginTop: 6 }}>
          <AreaChart data={spark} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
