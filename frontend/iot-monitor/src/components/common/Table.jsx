import { C } from '@/constants/theme'

/**
 * DataTable
 * @param {Array}  cols    - [{ key, title, render?, width?, align? }]
 * @param {Array}  rows    - data rows
 * @param {string} rowKey  - unique key field name
 */
export function DataTable({ cols, rows, rowKey = 'id', onRowClick }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align || 'left',
                  padding: '6px 10px',
                  fontSize: 10,
                  color: C.t2,
                  borderBottom: `1px solid ${C.border}`,
                  fontWeight: 500,
                  fontFamily: C.fontSans,
                  letterSpacing: '.6px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  width: c.width,
                }}
              >
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={row[rowKey] ?? ri}
              onClick={() => onRowClick?.(row)}
              style={{
                borderBottom: `1px solid rgba(255,255,255,0.03)`,
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background .1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.bg3)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {cols.map(c => (
                <td
                  key={c.key}
                  style={{
                    padding: '8px 10px',
                    color: C.t1,
                    fontFamily: C.fontMono,
                    whiteSpace: 'nowrap',
                    maxWidth: c.maxWidth || 'auto',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textAlign: c.align || 'left',
                  }}
                >
                  {c.render ? c.render(row[c.key], row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
