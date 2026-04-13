/**
 * 远控监控看板常量
 */

// ECharts 暗色主题
export const CHART_THEME = {
  backgroundColor: 'transparent',
  textColor: '#94a8c0',
  axisLineColor: '#1e3a5f',
  splitLineColor: '#1e3a5f33',
  colors: ['#00ff88', '#4da6ff', '#00d4ff', '#ff8c42', '#b06aff', '#ff4d6a', '#eab308'],
};

// 告警阈值
export const ALERT_THRESHOLDS = {
  tboxP99Delay: 200,          // TBox P99 > 200ms
  smsMnoP99Latency: 1000,     // MNO 短信 P99 > 1s
  smsMnoFailCount: 5,         // MNO 失败次数 > 5
  smsWakeupSuccessRate: 85,   // 短信唤醒成功率 < 85%
  mqttMessageLossRate: 50,    // MQTT 丢失率 > 50%
  e2eSuccessRate: 90,         // 端到端成功率 < 90%
  mqttPublishFail: 0,         // MQTT 下发失败（零容忍）
  pendingBacklog: 100,        // 指令积压 > 100
};

// 颜色映射
export const COLORS = {
  success: '#00ff88',
  error: '#ff4d6a',
  warning: '#eab308',
  info: '#4da6ff',
  primary: '#4da6ff',
  muted: '#5a7090',
  border: '#1e3a5f',
  bg: 'rgba(0,0,0,0.25)',
  bgHover: 'rgba(0,0,0,0.35)',
};

// 子 Tab 定义
export const SUB_TABS = [
  { key: 'overview', label: '总览' },
  { key: 'e2e', label: '端到端' },
  { key: 'tsp', label: 'TSP服务' },
  { key: 'tbox', label: 'TBox服务' },
  { key: 'third-party', label: '第三方' },
  { key: 'vehicle', label: '车辆连接' },
];

// 时间范围预设
export const TIME_PRESETS = [
  { key: '5m', label: '5 分钟', seconds: 300 },
  { key: '15m', label: '15 分钟', seconds: 900 },
  { key: '30m', label: '30 分钟', seconds: 1800 },
  { key: '1h', label: '1 小时', seconds: 3600 },
  { key: '6h', label: '6 小时', seconds: 21600 },
  { key: '24h', label: '24 小时', seconds: 86400 },
  { key: '7d', label: '7 天', seconds: 604800 },
];
