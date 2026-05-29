import { C } from '@/constants/theme'

export function Tag({ children, color = C.t2, bg = 'rgba(255,255,255,0.06)', style = {} }) {
  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 8px',
        borderRadius: 4,
        background: bg,
        color,
        fontWeight: 600,
        fontFamily: C.fontSans,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

const LVL_MAP = {
  crit: [C.red,   C.redBg,    '严重'],
  warn: [C.amber, C.amberBg,  '警告'],
  info: [C.blue,  C.blueBg,   '提示'],
}
export function LvlTag({ lvl }) {
  const [c, bg, label] = LVL_MAP[lvl] || [C.t2, 'transparent', lvl]
  return <Tag color={c} bg={bg}>{label}</Tag>
}

const ST_MAP = {
  在线:  [C.teal,  C.tealBg],
  离线:  [C.t2,   'rgba(255,255,255,0.05)'],
  告警:  [C.amber, C.amberBg],
  处理中:[C.amber, C.amberBg],
  未处理:[C.red,   C.redBg],
  已忽略:[C.t2,   'rgba(255,255,255,0.05)'],
}
export function StTag({ st }) {
  const [c, bg] = ST_MAP[st] || [C.t1, 'transparent']
  return <Tag color={c} bg={bg}>{st}</Tag>
}
