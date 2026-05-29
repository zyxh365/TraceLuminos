import { C } from '@/constants/theme'

const SVC_COLOR = {
  'mobile-app':      C.blue,
  'api-gateway':     '#52c41a',
  'emqx-cluster':    C.teal,
  'rule-engine':     C.amber,
  'kafka-cluster':   C.purple,
  'vehicle-control': '#f759ab',
  'iot-connection':  '#fa541c',
  'vehicle-ecu':     '#a0d911',
}

/**
 * GanttChart
 * Renders a horizontal waterfall Gantt for trace spans.
 * @param {Array}  spans  - SPAN_DATA array
 * @param {number} total  - total timeline width in ms (default 750)
 */
export function GanttChart({ spans, total = 750 }) {
  const rowH = 24
  const hdrH = 18
  const labelW = 130
  const barW = 560
  const svgH = spans.length * rowH + hdrH + 10

  const ticks = [0, 150, 300, 450, 600, 750]

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        width={labelW + barW}
        height={svgH}
        style={{ display: 'block', fontFamily: C.fontMono }}
      >
        {/* Time axis */}
        {ticks.map(t => {
          const bx = labelW + (t / total) * barW
          return (
            <g key={t}>
              <line x1={bx} y1={0} x2={bx} y2={svgH - 4} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
              <text x={bx} y={svgH - 2} fill={C.t2} fontSize={8.5} textAnchor="middle">
                {t}ms
              </text>
            </g>
          )
        })}

        {spans.map((s, i) => {
          const col = SVC_COLOR[s.svc] || C.blue
          const x = labelW + (s.ofs / total) * barW
          const w = Math.max((s.dur / total) * barW, 4)
          const y = i * rowH + hdrH

          return (
            <g key={i}>
              {/* Row label */}
              <text
                x={labelW - 8}
                y={y + rowH / 2 + 4}
                textAnchor="end"
                fill={s.ok ? C.t1 : C.amber}
                fontSize={10}
                fontFamily={C.fontSans}
              >
                {s.name}
              </text>

              {/* Row hover bg */}
              <rect x={labelW} y={y + 2} width={barW} height={rowH - 4} fill="rgba(255,255,255,0.01)" rx={2} />

              {/* Bar */}
              <rect
                x={x}
                y={y + 4}
                width={w}
                height={rowH - 8}
                fill={col}
                opacity={s.ok ? 0.78 : 0.95}
                rx={3}
              />

              {/* Duration label inside bar */}
              {w > 36 && (
                <text x={x + 4} y={y + rowH / 2 + 4} fill="white" fontSize={8.5}>
                  {s.dur}ms
                </text>
              )}

              {/* Status dot */}
              <circle
                cx={labelW - 18}
                cy={y + rowH / 2}
                r={3.5}
                fill={s.ok ? C.teal : C.amber}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
