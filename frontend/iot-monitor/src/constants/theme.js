/** Design token map — mirrors CSS variables for use in inline styles */
export const C = {
  bg0: '#080c14', bg1: '#0d1220', bg2: '#121829', bg3: '#182032', bg4: '#1e2840',
  teal:   '#00dba8', tealDim:  '#009e7a', tealBg:   'rgba(0,219,168,0.07)',
  blue:   '#3b9eff', blueDim:  '#2272cc', blueBg:   'rgba(59,158,255,0.07)',
  amber:  '#ffaa20', amberDim: '#cc8500', amberBg:  'rgba(255,170,32,0.08)',
  red:    '#ff4f4f', redDim:   '#cc2222', redBg:    'rgba(255,79,79,0.08)',
  purple: '#a78bfa', purpleDim:'#7c5dd4', purpleBg: 'rgba(167,139,250,0.07)',
  green:  '#4ade80', greenDim: '#22c55e', greenBg:  'rgba(74,222,128,0.07)',
  t0: '#dce8f8', t1: '#8fa4c0', t2: '#4a5f7a', t3: '#2a3a52',
  border: 'rgba(60,100,160,0.13)', borderBright: 'rgba(60,130,220,0.22)',
  fontSans: "'IBM Plex Sans SC','PingFang SC',sans-serif",
  fontMono: "'JetBrains Mono','Consolas',monospace",
}

/** Node type → color mapping for topology graph */
export const NODE_TYPE_COLOR = {
  service:    C.blue,
  middleware: C.purple,
  storage:    C.amber,
  external:   C.green,
}

export const NODE_TYPE_LABEL = {
  service:    '服务',
  middleware: '中间件',
  storage:    '存储',
  external:   '外部系统',
}
