import { C } from '@/constants/theme'

export function Card({ children, style = {}, title, extra, noPad = false, className = '' }) {
  return (
    <div
      className={className}
      style={{
        background: C.bg2,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        ...style,
      }}
    >
      {(title || extra) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.t0,
              fontFamily: C.fontSans,
            }}
          >
            {title}
          </span>
          {extra && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{extra}</div>}
        </div>
      )}
      <div style={{ padding: noPad ? 0 : 14 }}>{children}</div>
    </div>
  )
}
