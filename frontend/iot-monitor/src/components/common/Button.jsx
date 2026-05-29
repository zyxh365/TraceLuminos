import { C } from '@/constants/theme'

const VARIANTS = {
  ghost:   { background: 'transparent',    color: C.t1,    border: `1px solid ${C.borderBright}` },
  primary: { background: C.blue,           color: '#fff',   border: 'none' },
  teal:    { background: C.tealBg,         color: C.teal,   border: `1px solid ${C.teal}44` },
  danger:  { background: C.redBg,          color: C.red,    border: `1px solid ${C.red}44` },
  amber:   { background: C.amberBg,        color: C.amber,  border: `1px solid ${C.amber}44` },
}

export function Btn({
  children,
  onClick,
  variant = 'ghost',
  size = 'sm',
  style = {},
  disabled = false,
}) {
  const sizeStyle = size === 'xs'
    ? { fontSize: 10, padding: '2px 8px' }
    : { fontSize: 11, padding: '4px 12px' }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: C.fontSans,
        transition: 'all .15s',
        opacity: disabled ? 0.5 : 1,
        ...sizeStyle,
        ...VARIANTS[variant],
        ...style,
      }}
    >
      {children}
    </button>
  )
}
