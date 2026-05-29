// ─── Topology graph data ────────────────────────────────────
export const TOPO_NODES = [
  { id: 'app',      label: 'APP',           sub: 'QPS 1,260',    type: 'service',    icon: '📱', x: 70,  y: 240 },
  { id: 'apigw',    label: 'API 网关',       sub: 'QPS 2,560',    type: 'service',    icon: '🌐', x: 220, y: 200 },
  { id: 'auth',     label: '认证服务',        sub: 'QPS 320',      type: 'service',    icon: '🔐', x: 380, y: 80  },
  { id: 'vehicle',  label: '车辆服务',        sub: 'QPS 680',      type: 'service',    icon: '🚗', x: 380, y: 240 },
  { id: 'mqtt',     label: 'MQTT Broker',   sub: '连接 12,560',   type: 'middleware', icon: '📡', x: 220, y: 400 },
  { id: 'kafka',    label: 'Kafka 集群',     sub: 'TPS 8,560',    type: 'middleware', icon: '🔀', x: 560, y: 240 },
  { id: 'user',     label: '用户服务',        sub: 'QPS 560',      type: 'service',    icon: '👤', x: 720, y: 100 },
  { id: 'notify',   label: '通知服务',        sub: 'QPS 210',      type: 'service',    icon: '🔔', x: 860, y: 180 },
  { id: 'influx',   label: '时序库 InfluxDB', sub: 'QPS 120',      type: 'storage',    icon: '📊', x: 720, y: 360 },
  { id: 'cassandra',label: 'Cassandra',      sub: 'QPS 210',      type: 'storage',    icon: '🗄️', x: 860, y: 310 },
  { id: 'oss',      label: '对象存储',        sub: 'QPS 90',       type: 'storage',    icon: '☁️', x: 990, y: 240 },
]

export const TOPO_EDGES = [
  { from: 'app',     to: 'apigw',    label: '330 c/m',   sub: '96ms',  status: 'ok'   },
  { from: 'apigw',   to: 'auth',     label: '1.2k r/m',  sub: '120ms', status: 'ok'   },
  { from: 'apigw',   to: 'vehicle',  label: '1.8k c/m',  sub: '35ms',  status: 'ok'   },
  { from: 'mqtt',    to: 'kafka',    label: '12.6k con', sub: '25ms',  status: 'ok'   },
  { from: 'vehicle', to: 'kafka',    label: '5.5k tps',  sub: '35ms',  status: 'warn' },
  { from: 'auth',    to: 'kafka',    label: '560 r/m',   sub: '30ms',  status: 'ok'   },
  { from: 'kafka',   to: 'user',     label: '560 c/m',   sub: '30ms',  status: 'ok'   },
  { from: 'kafka',   to: 'influx',   label: '8.5k tps',  sub: '35ms',  status: 'ok'   },
  { from: 'kafka',   to: 'notify',   label: '210 c/m',   sub: '10ms',  status: 'ok'   },
  { from: 'kafka',   to: 'cassandra',label: '120 c/m',   sub: '90ms',  status: 'ok'   },
  { from: 'notify',  to: 'oss',      label: '450 c/m',   sub: '30ms',  status: 'ok'   },
]

// ─── Chain trace spans ──────────────────────────────────────
export const SPAN_DATA = [
  { name: 'APP',          svc: 'mobile-app',      dur: 120, ofs: 0,   ok: true  },
  { name: '云网关',        svc: 'api-gateway',     dur: 35,  ofs: 120, ok: true  },
  { name: 'MQTT Broker',  svc: 'emqx-cluster',    dur: 12,  ofs: 155, ok: true  },
  { name: '规则引擎',      svc: 'rule-engine',     dur: 45,  ofs: 167, ok: true  },
  { name: 'Kafka',         svc: 'kafka-cluster',   dur: 98,  ofs: 212, ok: true  },
  { name: '车控服务',      svc: 'vehicle-control', dur: 210, ofs: 310, ok: false },
  { name: 'T-Box',         svc: 'iot-connection',  dur: 420, ofs: 440, ok: false },
  { name: '车辆执行',      svc: 'vehicle-ecu',     dur: 100, ofs: 540, ok: true  },
  { name: '结果回传',      svc: 'iot-connection',  dur: 120, ofs: 620, ok: true  },
  { name: 'APP 回调',      svc: 'mobile-app',      dur: 40,  ofs: 690, ok: true  },
]

// ─── Alerts ─────────────────────────────────────────────────
export const ALERTS = [
  { id: 1, lvl: 'crit', title: 'T-Box 连接超时',           src: '粤A-12345',       time: '10:30:12', st: '未处理' },
  { id: 2, lvl: 'crit', title: 'Kafka 消息延迟 >1000ms',   src: 'topic:command',   time: '10:29:58', st: '处理中' },
  { id: 3, lvl: 'warn', title: '指令执行失败率超阈值 >5%', src: '粤A-88888',       time: '10:29:41', st: '未处理' },
  { id: 4, lvl: 'warn', title: 'MQTT 连接数过高',          src: 'emqx-cluster-1',  time: '10:29:33', st: '未处理' },
  { id: 5, lvl: 'info', title: '设备心跳超时',             src: '粤A-66666',       time: '10:29:21', st: '已忽略' },
  { id: 6, lvl: 'warn', title: 'GPS 数据上报异常',         src: '粤B-55555',       time: '10:28:10', st: '未处理' },
  { id: 7, lvl: 'crit', title: 'API 响应超时 >1000ms',     src: 'remote-ctrl-svc', time: '10:28:05', st: '未处理' },
]

// ─── Kafka topics ────────────────────────────────────────────
export const KAFKA_TOPICS = [
  { id: 1, topic: 'telemetry-topic',       pTps: 2560, cTps: 2450, parts: 24, lag: 0   },
  { id: 2, topic: 'remote-command-topic',  pTps: 1800, cTps: 1820, parts: 12, lag: 210 },
  { id: 3, topic: 'device-status-topic',   pTps: 1200, cTps: 1180, parts: 12, lag: 0   },
  { id: 4, topic: 'alarm-topic',           pTps: 980,  cTps: 965,  parts: 6,  lag: 0   },
  { id: 5, topic: 'remote-response-topic', pTps: 760,  cTps: 730,  parts: 6,  lag: 30  },
]

// ─── Devices ─────────────────────────────────────────────────
export const DEVICES = [
  { id: 'TBOX10000001', name: 'T-Box-0001', vin: 'LSGA***1234', region: '广东·广州', st: '在线',  last: '10:30:32' },
  { id: 'TBOX10000002', name: 'T-Box-0002', vin: 'LSGA***1235', region: '广东·深圳', st: '在线',  last: '10:30:31' },
  { id: 'TBOX10000003', name: 'T-Box-0003', vin: 'LSGA***1236', region: '江苏·南京', st: '离线',  last: '10:25:18' },
  { id: 'TBOX10000004', name: 'T-Box-0004', vin: 'LSGA***1237', region: '四川·成都', st: '在线',  last: '10:30:29' },
  { id: 'TBOX10000005', name: 'T-Box-0005', vin: 'LSGA***1238', region: '浙江·杭州', st: '告警',  last: '10:30:28' },
  { id: 'TBOX10000006', name: 'T-Box-0006', vin: 'LSGA***1239', region: '北京',      st: '在线',  last: '10:30:27' },
]

// ─── Mock spark generator ────────────────────────────────────
export const mkSpark = (base, noise, len = 16) =>
  Array.from({ length: len }, (_, i) => ({
    v: Math.max(0, base + Math.sin(i * 0.7) * noise + (Math.random() - 0.5) * noise * 0.5),
  }))
