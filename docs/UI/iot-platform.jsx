import { useState, useEffect, useRef } from "react";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Activity, AlertTriangle, Bell, ChevronRight, Cpu, Database, GitBranch, Layers, Monitor, Radio, Settings, Shield, TrendingUp, Wifi, Zap, Server, Car, Clock, CheckCircle, XCircle, AlertCircle, ChevronDown, RefreshCw } from "lucide-react";

// ─── Design tokens ─────────────────────────────────────────
const C = {
  bg0: "#080c14", bg1: "#0d1220", bg2: "#121829", bg3: "#182032", bg4: "#1e2840",
  teal: "#00dba8", tealDim: "#009e7a", tealBg: "rgba(0,219,168,0.07)",
  blue: "#3b9eff", blueDim: "#2272cc", blueBg: "rgba(59,158,255,0.07)",
  amber: "#ffaa20", amberDim: "#cc8500", amberBg: "rgba(255,170,32,0.08)",
  red: "#ff4f4f", redBg: "rgba(255,79,79,0.08)",
  purple: "#a78bfa", purpleBg: "rgba(167,139,250,0.07)",
  t0: "#dce8f8", t1: "#8fa4c0", t2: "#4a5f7a", t3: "#2a3a52",
  border: "rgba(60,100,160,0.13)", borderBright: "rgba(60,130,220,0.22)",
};

// ─── Mock data generators ──────────────────────────────────
const mkSpark = (base, noise, len = 16) =>
  Array.from({ length: len }, (_, i) => ({
    v: Math.max(0, base + Math.sin(i * 0.7) * noise + (Math.random() - 0.5) * noise * 0.5),
  }));

const flowData = Array.from({ length: 30 }, (_, i) => ({
  t: i,
  up: 35 + Math.sin(i * 0.5) * 18 + Math.random() * 8,
  dn: 18 + Math.sin(i * 0.4 + 1) * 10 + Math.random() * 5,
  loss: Math.random() * 2.5,
}));

const latencyData = Array.from({ length: 24 }, (_, i) => ({
  t: `${i}:00`,
  p50: 80 + Math.sin(i * 0.4) * 30 + Math.random() * 20,
  p90: 200 + Math.sin(i * 0.4) * 60 + Math.random() * 40,
  p99: 600 + Math.sin(i * 0.3) * 200 + Math.random() * 100,
}));

const CHAIN_NODES = [
  { id: "app",    label: "APP",        sub: "iOS/Android",     icon: "📱", color: C.blue,   status: "ok" },
  { id: "gw",     label: "云网关",      sub: "api-gateway",     icon: "🌐", color: C.blue,   status: "ok" },
  { id: "broker", label: "MQTT Broker",sub: "emqx-cluster×3",  icon: "📡", color: C.teal,   status: "ok" },
  { id: "rule",   label: "规则引擎",    sub: "rule-engine",     icon: "⚡", color: C.teal,   status: "ok" },
  { id: "kafka",  label: "Kafka",       sub: "kafka×6 brokers", icon: "🔀", color: C.purple, status: "warn" },
  { id: "svc",    label: "车控服务",    sub: "vehicle-control", icon: "🚗", color: C.amber,  status: "warn" },
  { id: "tbox",   label: "T-Box",       sub: "iot-connection",  icon: "📦", color: C.amber,  status: "ok" },
  { id: "db",     label: "存储层",      sub: "InfluxDB·Redis",  icon: "🗄️", color: C.blue,   status: "ok" },
];

const SPAN_DATA = [
  { name: "APP",         svc: "mobile-app",      dur: 120, ofs: 0,   ok: true  },
  { name: "云网关",       svc: "api-gateway",     dur: 35,  ofs: 120, ok: true  },
  { name: "MQTT Broker", svc: "emqx-cluster",    dur: 12,  ofs: 155, ok: true  },
  { name: "规则引擎",     svc: "rule-engine",     dur: 45,  ofs: 167, ok: true  },
  { name: "Kafka",        svc: "kafka-cluster",   dur: 98,  ofs: 212, ok: true  },
  { name: "车控服务",     svc: "vehicle-control", dur: 210, ofs: 310, ok: false },
  { name: "T-Box",        svc: "iot-connection",  dur: 420, ofs: 440, ok: false },
  { name: "车辆执行",     svc: "vehicle-ecu",     dur: 100, ofs: 540, ok: true  },
  { name: "结果回传",     svc: "iot-connection",  dur: 120, ofs: 620, ok: true  },
  { name: "APP回调",      svc: "mobile-app",      dur: 40,  ofs: 690, ok: true  },
];

const ALERTS = [
  { id: 1, lvl: "crit",  title: "T-Box 连接超时",            src: "粤A-12345",        time: "10:30:12", st: "未处理" },
  { id: 2, lvl: "crit",  title: "Kafka 消息延迟 >1000ms",    src: "topic:command",    time: "10:29:58", st: "处理中" },
  { id: 3, lvl: "warn",  title: "指令执行失败率超阈值 >5%",  src: "粤A-88888",        time: "10:29:41", st: "未处理" },
  { id: 4, lvl: "warn",  title: "MQTT 连接数过高",           src: "emqx-cluster-1",  time: "10:29:33", st: "未处理" },
  { id: 5, lvl: "info",  title: "设备心跳超时",              src: "粤A-66666",        time: "10:29:21", st: "已忽略" },
  { id: 6, lvl: "warn",  title: "GPS 数据上报异常",          src: "粤B-55555",        time: "10:28:10", st: "未处理" },
];

const KAFKA_TOPICS = [
  { topic: "telemetry-topic",       pTps: 2560, cTps: 2450, parts: 24, lag: 0   },
  { topic: "remote-command-topic",  pTps: 1800, cTps: 1820, parts: 12, lag: 210 },
  { topic: "device-status-topic",   pTps: 1200, cTps: 1180, parts: 12, lag: 0   },
  { topic: "alarm-topic",           pTps: 980,  cTps: 965,  parts: 6,  lag: 0   },
  { topic: "remote-response-topic", pTps: 760,  cTps: 730,  parts: 6,  lag: 30  },
];

const DEVICES = [
  { id: "TBOX10000001", name: "T-Box-0001", vin: "LSGA***1234", region: "广东·广州", st: "在线",  last: "10:30:32" },
  { id: "TBOX10000002", name: "T-Box-0002", vin: "LSGA***1235", region: "广东·深圳", st: "在线",  last: "10:30:31" },
  { id: "TBOX10000003", name: "T-Box-0003", vin: "LSGA***1236", region: "江苏·南京", st: "离线",  last: "10:25:18" },
  { id: "TBOX10000004", name: "T-Box-0004", vin: "LSGA***1237", region: "四川·成都", st: "在线",  last: "10:30:29" },
  { id: "TBOX10000005", name: "T-Box-0005", vin: "LSGA***1238", region: "浙江·杭州", st: "告警",  last: "10:30:28" },
  { id: "TBOX10000006", name: "T-Box-0006", vin: "LSGA***1239", region: "北京",       st: "在线",  last: "10:30:27" },
];

// ─── Base UI components ─────────────────────────────────────

const px = (style = {}) => ({
  boxSizing: "border-box",
  fontFamily: "'JetBrains Mono', 'Consolas', monospace",
  ...style,
});

const Card = ({ children, style = {}, title, extra, noPad }) => (
  <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", ...style }}>
    {(title || extra) && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.t0, fontFamily: "sans-serif" }}>{title}</span>
        {extra && <div>{extra}</div>}
      </div>
    )}
    <div style={{ padding: noPad ? 0 : 14 }}>{children}</div>
  </div>
);

const Tag = ({ children, color = C.t2, bg = "rgba(255,255,255,0.06)" }) => (
  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: bg, color, fontWeight: 600, fontFamily: "sans-serif", whiteSpace: "nowrap" }}>
    {children}
  </span>
);

const LvlTag = ({ lvl }) => {
  const map = { crit: [C.red, C.redBg, "严重"], warn: [C.amber, C.amberBg, "警告"], info: [C.blue, C.blueBg, "提示"] };
  const [c, bg, label] = map[lvl] || [C.t2, "transparent", lvl];
  return <Tag color={c} bg={bg}>{label}</Tag>;
};

const StTag = ({ st }) => {
  const map = { 在线: [C.teal, C.tealBg], 离线: [C.t2, "rgba(255,255,255,0.05)"], 告警: [C.amber, C.amberBg], 处理中: [C.amber, C.amberBg], 未处理: [C.red, C.redBg], 已忽略: [C.t2, "rgba(255,255,255,0.05)"] };
  const [c, bg] = map[st] || [C.t1, "transparent"];
  return <Tag color={c} bg={bg}>{st}</Tag>;
};

const Btn = ({ children, onClick, variant = "ghost", style = {} }) => {
  const base = { fontSize: 11, padding: "4px 12px", borderRadius: 5, cursor: "pointer", border: `1px solid ${C.borderBright}`, fontFamily: "sans-serif", transition: "all .15s", ...style };
  const variants = {
    ghost:   { background: "transparent", color: C.t1 },
    primary: { background: C.blue, color: "#fff", border: "none" },
    teal:    { background: C.tealBg, color: C.teal, border: `1px solid ${C.teal}44` },
    danger:  { background: C.redBg, color: C.red, border: `1px solid ${C.red}44` },
  };
  return <button onClick={onClick} style={{ ...base, ...variants[variant] }}>{children}</button>;
};

const Metric = ({ label, value, color = C.teal, spark, sub }) => (
  <Card style={{ flex: 1, minWidth: 120 }}>
    <div style={{ fontSize: 10, color: C.t2, marginBottom: 6, fontFamily: "sans-serif", letterSpacing: ".4px" }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "monospace", lineHeight: 1, marginBottom: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: C.t2, fontFamily: "sans-serif" }}>{sub}</div>}
    {spark && (
      <ResponsiveContainer width="100%" height={28} style={{ marginTop: 6 }}>
        <AreaChart data={spark} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={`sg${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#sg${color.replace("#", "")})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    )}
  </Card>
);

const ProgBar = ({ label, value, max = 100, color = C.teal, unit = "%" }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.t1, marginBottom: 4, fontFamily: "sans-serif" }}>
      <span>{label}</span>
      <span style={{ color, fontFamily: "monospace" }}>{value}{unit}</span>
    </div>
    <div style={{ height: 4, background: C.bg4, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${(value / max) * 100}%`, height: "100%", background: color, borderRadius: 2, transition: "width .6s ease" }} />
    </div>
  </div>
);

const Table = ({ cols, rows, rowKey = "id" }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>
          {cols.map(c => (
            <th key={c.key} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, color: C.t2, borderBottom: `1px solid ${C.border}`, fontWeight: 500, fontFamily: "sans-serif", letterSpacing: ".6px", textTransform: "uppercase", whiteSpace: "nowrap" }}>
              {c.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={row[rowKey] || ri} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)`, cursor: "pointer" }}>
            {cols.map(c => (
              <td key={c.key} style={{ padding: "8px 10px", color: C.t1, fontFamily: "monospace", whiteSpace: "nowrap", maxWidth: c.maxWidth || "auto", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.render ? c.render(row[c.key], row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ─── Chain topology SVG ─────────────────────────────────────
const ChainTopo = ({ nodes, compact }) => {
  const W = compact ? 72 : 88, H = compact ? 66 : 78, GAP = compact ? 16 : 20;
  const total = nodes.length * W + (nodes.length - 1) * GAP;
  const svgH = H + 28;
  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <svg width={total} height={svgH} style={{ display: "block", minWidth: total }}>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M1 2L8 5L1 8" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        {nodes.map((n, i) => {
          const x = i * (W + GAP);
          const cx = x + W / 2;
          const col = n.status === "warn" ? C.amber : n.status === "err" ? C.red : n.color;
          return (
            <g key={n.id}>
              {i < nodes.length - 1 && (
                <line x1={x + W} y1={H / 2} x2={x + W + GAP} y2={H / 2}
                  stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} markerEnd="url(#arr)" />
              )}
              <rect x={x} y={0} width={W} height={H} rx={7}
                fill={n.status === "warn" ? `rgba(255,170,32,0.1)` : `${col}18`}
                stroke={col} strokeWidth={n.status === "warn" ? 1.5 : 1} />
              {n.status === "warn" && (
                <circle cx={x + W - 10} cy={10} r={5} fill={C.amber} />
              )}
              <text x={cx} y={compact ? 22 : 26} textAnchor="middle" fontSize={compact ? 15 : 18}>{n.icon}</text>
              <text x={cx} y={compact ? 36 : 44} textAnchor="middle" fill={C.t0} fontSize={compact ? 9 : 10} fontWeight="600" fontFamily="sans-serif">{n.label}</text>
              <text x={cx} y={compact ? 47 : 56} textAnchor="middle" fill={C.t2} fontSize={compact ? 7.5 : 8.5} fontFamily="monospace">{n.sub}</text>
              <circle cx={cx} cy={H - 8} r={3} fill={col} opacity={0.8} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ─── Gantt chart ────────────────────────────────────────────
const GanttChart = ({ spans }) => {
  const total = 750;
  const rowH = 24, hdrH = 16;
  const h = spans.length * rowH + hdrH + 8;
  const SVC_COL = { "mobile-app": C.blue, "api-gateway": "#52c41a", "emqx-cluster": C.teal, "rule-engine": C.amber, "kafka-cluster": C.purple, "vehicle-control": "#f759ab", "iot-connection": "#fa541c", "vehicle-ecu": "#a0d911" };
  return (
    <svg width="100%" viewBox={`0 0 760 ${h}`} style={{ display: "block" }}>
      {[0, 150, 300, 450, 600, 750].map(t => (
        <g key={t}>
          <line x1={(t / total) * 760} y1={0} x2={(t / total) * 760} y2={h} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          <text x={(t / total) * 760} y={h - 2} fill={C.t2} fontSize={9} textAnchor="middle" fontFamily="monospace">{t}ms</text>
        </g>
      ))}
      {spans.map((s, i) => {
        const col = SVC_COL[s.svc] || C.blue;
        const x = (s.ofs / total) * 760;
        const w = Math.max((s.dur / total) * 760, 4);
        const y = i * rowH + hdrH;
        return (
          <g key={i}>
            <rect x={x} y={y + 3} width={w} height={rowH - 6} fill={col} opacity={s.ok ? 0.75 : 0.95} rx={3} />
            {w > 40 && (
              <text x={x + 4} y={y + rowH / 2 + 4} fill="white" fontSize={8.5} fontFamily="monospace">{s.dur}ms</text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ─── Pages ─────────────────────────────────────────────────

const DashPage = () => {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(v => v + 1), 2000); return () => clearInterval(t); }, []);

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <Metric label="车辆总数"      value="2,560,688"  color={C.blue}  spark={mkSpark(50, 15)} sub="↑ +1,240 今日" />
        <Metric label="T-Box 在线"   value="128,560"    color={C.teal}  spark={mkSpark(80, 12)} sub="在线率 92.4%" />
        <Metric label="App 在线用户" value="256,560"    color={C.blue}  spark={mkSpark(60, 20)} sub="↑ +3.2%" />
        <Metric label="指令成功率"   value="99.23%"     color={C.teal}  spark={mkSpark(95,  2)} sub="↑ +1.0% vs 昨日" />
        <Metric label="今日异常告警" value="128"        color={C.red}   spark={mkSpark(30, 20)} sub="↓ -8.2% vs 昨日" />
      </div>

      {/* Chain topo */}
      <Card title="全链路拓扑总览" style={{ marginBottom: 12 }}
        extra={<div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Tag color={C.teal} bg={C.tealBg}>● 健康</Tag>
          <Tag color={C.amber} bg={C.amberBg}>● 异常</Tag>
          <Tag color={C.red} bg={C.redBg}>● 高危</Tag>
        </div>}>
        <ChainTopo nodes={CHAIN_NODES} compact={false} />
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.t2, fontFamily: "sans-serif" }}>实时链路 QPS</span>
          <span style={{ fontSize: 11, color: C.t2 }}>低</span>
          <div style={{ flex: 1, maxWidth: 280, height: 5, background: C.bg4, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: "72%", height: "100%", background: `linear-gradient(90deg, ${C.teal}, ${C.amber})`, borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 11, color: C.t2 }}>高</span>
        </div>
      </Card>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        <Card title="消息吞吐量趋势">
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={flowData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gup" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.teal} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.teal} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gdn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.blue} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" hide />
              <YAxis tick={{ fill: C.t2, fontSize: 9 }} />
              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} labelStyle={{ color: C.t1 }} />
              <Area type="monotone" dataKey="up" stroke={C.teal} strokeWidth={1.5} fill="url(#gup)" dot={false} name="上行 k/s" />
              <Area type="monotone" dataKey="dn" stroke={C.blue} strokeWidth={1.5} fill="url(#gdn)" dot={false} name="下行 k/s" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="链路耗时分布">
          <div style={{ padding: "6px 0" }}>
            {[{l:"P50", v:120, max:1280, c:C.teal}, {l:"P90", v:480, max:1280, c:C.amber}, {l:"P95", v:780, max:1280, c:C.amber}, {l:"P99", v:1280, max:1280, c:C.red}].map(p => (
              <ProgBar key={p.l} label={p.l} value={p.v} max={p.max} color={p.c} unit="ms" />
            ))}
          </div>
        </Card>

        <Card title="错误类型 TOP5">
          <div style={{ padding: "6px 0" }}>
            {[{t:"超时",p:32.6,c:C.red},{t:"设备离线",p:21.3,c:C.amber},{t:"指令拒绝",p:18.7,c:C.purple},{t:"服务异常",p:15.2,c:C.blue},{t:"其他",p:12.2,c:C.t2}].map(e => (
              <ProgBar key={e.t} label={e.t} value={e.p} max={100} color={e.c} unit="%" />
            ))}
          </div>
        </Card>
      </div>

      {/* Alert table */}
      <Card title="实时告警" extra={<Tag color={C.red} bg={C.redBg}>128 活跃</Tag>}>
        <Table rowKey="id" rows={ALERTS}
          cols={[
            { key: "lvl",   title: "级别",   render: v => <LvlTag lvl={v} /> },
            { key: "title", title: "告警内容", maxWidth: 200 },
            { key: "src",   title: "影响范围", render: v => <span style={{ color: C.t2 }}>{v}</span> },
            { key: "time",  title: "时间",   render: v => <span style={{ color: C.amber }}>{v}</span> },
            { key: "st",    title: "状态",   render: v => <StTag st={v} /> },
            { key: "id",    title: "操作",   render: () => <Btn>处理</Btn> },
          ]} />
      </Card>
    </div>
  );
};

const CloudChainPage = () => (
  <div>
    {/* Command bar */}
    <div style={{ background: `${C.teal}0d`, border: `1px solid ${C.teal}30`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", fontSize: 12, fontFamily: "sans-serif" }}>
      <span style={{ color: C.t2 }}>指令ID</span>
      <code style={{ color: C.blue, fontSize: 11 }}>CMD20250520100123456</code>
      <span style={{ color: C.t2 }}>类型</span><Tag color={C.blue} bg={C.blueBg}>车门解锁</Tag>
      <span style={{ color: C.t2 }}>目标</span><Tag>粤A-12345</Tag>
      <span style={{ color: C.t2 }}>状态</span><Tag color={C.teal} bg={C.tealBg}>✓ 成功</Tag>
      <span style={{ color: C.t2 }}>总耗时</span><span style={{ color: C.teal, fontWeight: 700, fontFamily: "monospace" }}>1283ms</span>
    </div>

    {/* Chain nodes */}
    <Card title="云控远控链路" style={{ marginBottom: 12 }}>
      <ChainTopo nodes={CHAIN_NODES} compact />
    </Card>

    {/* Spans + detail */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 10 }}>
      <Card title="Span 追踪详情 — Gantt">
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 0 }}>
          {/* Labels */}
          <div style={{ paddingTop: 24 }}>
            {SPAN_DATA.map((s, i) => (
              <div key={i} style={{ height: 24, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.ok ? C.teal : C.amber, flexShrink: 0 }} />
                <span style={{ fontSize: 10.5, color: s.ok ? C.t1 : C.amber, fontFamily: "sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              </div>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            <GanttChart spans={SPAN_DATA} />
          </div>
        </div>
      </Card>

      <Card title="Trace 基本信息">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["Trace ID", <code style={{ fontSize: 10, color: C.blue }}>1e6a8c5f3b2d4e7a9c</code>],
            ["Span ID",  <code style={{ fontSize: 10, color: C.blue }}>3f2e1d0c9b8a7e6d</code>],
            ["服务",     "vehicle-control"],
            ["操作",     "HandleRemoteCommand"],
            ["状态",     <Tag color={C.amber} bg={C.amberBg}>慢调用</Tag>],
            ["开始时间", "10:00:01.433"],
            ["耗时",     <span style={{ color: C.amber, fontWeight: 700 }}>210ms</span>],
            ["Tags",     ""],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 11 }}>
              <span style={{ color: C.t2, minWidth: 68, fontFamily: "sans-serif" }}>{k}</span>
              <span style={{ color: C.t1, fontFamily: "monospace" }}>{v}</span>
            </div>
          ))}
          {[["cmdType","unlock_door"],["vin","LSGA****1234"],["userId","user_10086"]].map(([k,v])=>(
            <div key={k} style={{ paddingLeft: 78, display: "flex", gap: 10, fontSize: 11 }}>
              <span style={{ color: C.t2, minWidth: 60, fontFamily: "sans-serif" }}>{k}</span>
              <span style={{ color: C.teal, fontFamily: "monospace" }}>{v}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </div>
);

const KafkaPage = () => (
  <div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      {[["集群状态","健康",C.teal],["Broker 数","3",C.blue],["Topic 数","156",C.blue],["分区数","420",C.teal],
        ["生产 TPS","8,560",C.purple],["消费 TPS","8,120",C.blue],["集群延迟","35ms",C.teal],["失效副本","0",C.teal]].map(([l,v,c])=>(
        <Metric key={l} label={l} value={v} color={c} style={{ minWidth: 100 }} />
      ))}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
      <Card title="集群流量 — 生产 vs 消费 TPS">
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={Array.from({length:20},(_,i)=>({ t:i, p:7000+Math.sin(i*.5)*2000+Math.random()*500, c:6800+Math.sin(i*.4+1)*1800+Math.random()*400 }))} margin={{top:4,right:4,bottom:0,left:-10}}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="t" hide/>
            <YAxis tick={{fill:C.t2,fontSize:9}}/>
            <Tooltip contentStyle={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}/>
            <Line type="monotone" dataKey="p" stroke={C.teal}  strokeWidth={1.8} dot={false} name="生产 TPS"/>
            <Line type="monotone" dataKey="c" stroke={C.blue} strokeWidth={1.8} dot={false} name="消费 TPS" strokeDasharray="4 2"/>
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Broker 状态">
        <Table rowKey="id" rows={[{id:0,st:"健康",cpu:32,mem:45,disk:60,net:"40/30 Mbps"},{id:1,st:"健康",cpu:28,mem:42,disk:58,net:"40/26 Mbps"},{id:2,st:"健康",cpu:35,mem:48,disk:62,net:"40/28 Mbps"}]}
          cols={[
            {key:"id", title:"#"},
            {key:"st", title:"状态", render:v=><Tag color={C.teal} bg={C.tealBg}>{v}</Tag>},
            {key:"cpu",title:"CPU", render:v=><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:60,height:4,background:C.bg4,borderRadius:2,overflow:"hidden"}}><div style={{width:`${v}%`,height:"100%",background:C.teal}}/></div><span style={{fontSize:10}}>{v}%</span></div>},
            {key:"mem",title:"内存",render:v=><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:60,height:4,background:C.bg4,borderRadius:2,overflow:"hidden"}}><div style={{width:`${v}%`,height:"100%",background:C.blue}}/></div><span style={{fontSize:10}}>{v}%</span></div>},
            {key:"net",title:"网络 I/O",render:v=><span style={{fontSize:11}}>{v}</span>},
          ]}/>
      </Card>
    </div>
    <Card title="Topic 列表 — TOP5">
      <Table rowKey="topic" rows={KAFKA_TOPICS}
        cols={[
          {key:"topic",title:"Topic",render:v=><code style={{fontSize:11,color:C.blue}}>{v}</code>},
          {key:"pTps", title:"生产 TPS",render:v=><span style={{color:C.teal}}>{v.toLocaleString()}</span>},
          {key:"cTps", title:"消费 TPS",render:v=><span style={{color:C.blue}}>{v.toLocaleString()}</span>},
          {key:"parts",title:"分区数"},
          {key:"lag",  title:"积压",render:v=><Tag color={v>0?C.amber:C.teal} bg={v>0?C.amberBg:C.tealBg}>{v}</Tag>},
          {key:"topic",title:"操作",render:()=><Btn>详情</Btn>},
        ]}/>
    </Card>
  </div>
);

const DevicesPage = () => (
  <div>
    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
      <select style={{ background:C.bg3, border:`1px solid ${C.border}`, color:C.t1, borderRadius:5, padding:"4px 10px", fontSize:12 }}>
        <option>全部类型</option><option>T-Box</option><option>传感器</option>
      </select>
      <select style={{ background:C.bg3, border:`1px solid ${C.border}`, color:C.t1, borderRadius:5, padding:"4px 10px", fontSize:12 }}>
        <option>全部状态</option><option>在线</option><option>离线</option><option>告警</option>
      </select>
      <input placeholder="搜索设备ID / VIN..." style={{ background:C.bg3, border:`1px solid ${C.border}`, color:C.t0, borderRadius:5, padding:"4px 12px", fontSize:12, width:200 }}/>
      <Btn variant="primary">搜索</Btn>
      <Btn>重置</Btn>
      <Btn variant="teal" style={{ marginLeft: "auto" }}>+ 新增设备</Btn>
      <Btn>批量导出</Btn>
    </div>
    <Card title={<span>设备列表 <span style={{fontSize:11,color:C.t2,fontWeight:400}}>共 8,932 条</span></span>}>
      <Table rowKey="id" rows={DEVICES}
        cols={[
          {key:"id",     title:"设备ID",    render:v=><code style={{fontSize:11,color:C.blue}}>{v}</code>},
          {key:"name",   title:"设备名称"},
          {key:"vin",    title:"VIN",       render:v=><code style={{fontSize:10,color:C.t2}}>{v}</code>},
          {key:"region", title:"区域"},
          {key:"st",     title:"状态",     render:v=><StTag st={v}/>},
          {key:"last",   title:"最后上线", render:v=><span style={{color:C.t2}}>2025-05-20 {v}</span>},
          {key:"id",     title:"操作",     render:()=><div style={{display:"flex",gap:4}}><Btn>查看</Btn><Btn>追踪</Btn><Btn variant="danger">删除</Btn></div>},
        ]}/>
      {/* Pagination */}
      <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"center", gap:8, marginTop:12, fontSize:12, color:C.t2, fontFamily:"sans-serif" }}>
        <span>共 8,932 条</span>
        {[1,2,3,"...",179].map((p,i)=>(
          <button key={i} style={{ padding:"3px 9px", borderRadius:4, background:p===1?C.blue:"transparent", color:p===1?"white":C.t1, border:`1px solid ${p===1?C.blue:C.border}`, cursor:"pointer", fontSize:12 }}>{p}</button>
        ))}
      </div>
    </Card>
  </div>
);

const AlertsPage = () => (
  <div>
    <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
      {["全部级别","全部状态","近24小时"].map(p=>(
        <select key={p} style={{ background:C.bg3,border:`1px solid ${C.border}`,color:C.t1,borderRadius:5,padding:"4px 10px",fontSize:12 }}>
          <option>{p}</option>
        </select>
      ))}
      <input placeholder="搜索告警..." style={{ background:C.bg3,border:`1px solid ${C.border}`,color:C.t0,borderRadius:5,padding:"4px 12px",fontSize:12,width:200 }}/>
      <Btn variant="primary">搜索</Btn>
      <Btn variant="danger" style={{ marginLeft:"auto" }}>批量忽略</Btn>
      <Btn>批量确认</Btn>
    </div>
    <Card title={<div style={{display:"flex",gap:8,alignItems:"center"}}><span>告警列表</span><Tag color={C.red} bg={C.redBg}>128 未处理</Tag><Tag color={C.amber} bg={C.amberBg}>56 处理中</Tag></div>}>
      <Table rowKey="id" rows={ALERTS}
        cols={[
          {key:"lvl",  title:"级别",   render:v=><LvlTag lvl={v}/>},
          {key:"title",title:"告警内容",maxWidth:200},
          {key:"src",  title:"来源",   render:v=><code style={{fontSize:11,color:C.t2}}>{v}</code>},
          {key:"time", title:"时间",   render:v=><span style={{color:C.amber}}>{v}</span>},
          {key:"st",   title:"状态",   render:v=><StTag st={v}/>},
          {key:"id",   title:"操作",   render:()=><div style={{display:"flex",gap:4}}><Btn>处理</Btn><Btn>忽略</Btn><Btn>详情</Btn></div>},
        ]}/>
    </Card>
  </div>
);

const ReportPage = () => (
  <div>
    <div style={{ display:"flex",gap:10,marginBottom:12,flexWrap:"wrap" }}>
      <Metric label="云控指令总计" value="12,560次"  color={C.blue}  spark={mkSpark(60,20)} sub="↑ +2.1% vs 昨日"/>
      <Metric label="指令成功率"   value="98.23%"    color={C.teal}  spark={mkSpark(95,2)}  sub="↑ +1.0% vs 昨日"/>
      <Metric label="设备在线率"   value="92.45%"    color={C.teal}  spark={mkSpark(88,4)}  sub="↑ +1.8% vs 昨日"/>
      <Metric label="今日告警总计" value="128 次"    color={C.red}   spark={mkSpark(40,25)} sub="↓ -8.2% vs 昨日"/>
    </div>
    <div style={{ display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:10,marginBottom:10 }}>
      <Card title="云控指令趋势">
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart data={Array.from({length:24},(_,i)=>({t:`${i}:00`,ok:400+Math.sin(i*.4)*120+Math.random()*40,fail:10+Math.random()*15}))} margin={{top:4,right:4,bottom:0,left:-10}}>
            <defs>
              <linearGradient id="rok" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.teal} stopOpacity={0.3}/><stop offset="100%" stopColor={C.teal} stopOpacity={0}/></linearGradient>
              <linearGradient id="rfail" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.red} stopOpacity={0.3}/><stop offset="100%" stopColor={C.red} stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="t" tick={{fill:C.t2,fontSize:9}}/>
            <YAxis tick={{fill:C.t2,fontSize:9}}/>
            <Tooltip contentStyle={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}/>
            <Area type="monotone" dataKey="ok"   stroke={C.teal} strokeWidth={1.8} fill="url(#rok)"  dot={false} name="成功"/>
            <Area type="monotone" dataKey="fail" stroke={C.red}  strokeWidth={1.8} fill="url(#rfail)" dot={false} name="失败"/>
          </AreaChart>
        </ResponsiveContainer>
      </Card>
      <Card title="指令类型分布">
        <div style={{ padding:"8px 0" }}>
          {[{t:"解锁",p:35.6,c:C.blue},{t:"上锁",p:28.3,c:C.teal},{t:"寻车",p:18.2,c:C.purple},{t:"启动",p:9.8,c:C.amber},{t:"其他",p:8.1,c:C.t2}].map(i=>(
            <ProgBar key={i.t} label={i.t} value={i.p} max={100} color={i.c} unit="%"/>
          ))}
        </div>
      </Card>
    </div>
    <Card title="延迟百分位趋势（P50 / P90 / P99）">
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={latencyData} margin={{top:4,right:4,bottom:0,left:-10}}>
          <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false}/>
          <XAxis dataKey="t" tick={{fill:C.t2,fontSize:9}} interval={3}/>
          <YAxis tick={{fill:C.t2,fontSize:9}}/>
          <Tooltip contentStyle={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}/>
          <Line type="monotone" dataKey="p50" stroke={C.teal}   strokeWidth={1.8} dot={false} name="P50"/>
          <Line type="monotone" dataKey="p90" stroke={C.amber}  strokeWidth={1.8} dot={false} name="P90"/>
          <Line type="monotone" dataKey="p99" stroke={C.red}    strokeWidth={1.8} dot={false} name="P99"/>
        </LineChart>
      </ResponsiveContainer>
    </Card>
  </div>
);

const ConfigPage = () => {
  const [cat, setCat] = useState("sys");
  const cfgs = {
    sys:   [["system.name","车联网全链路监控平台","系统名称"],["system.version","v1.0.0","系统版本"],["system.timezone","Asia/Shanghai","时区"],["system.language","zh-CN","语言"],["system.login.expire","24h","登录过期"]],
    svc:   [["service.trace.enable","true","链路追踪开关"],["service.timeout","5000ms","默认超时"],["service.retry","3","重试次数"]],
    alert: [["alert.latency.threshold","1000ms","延迟阈值"],["alert.error.rate","5%","错误率阈值"],["alert.recv","ops@company.com","接收人"]],
  };
  return (
    <div style={{ display:"grid",gridTemplateColumns:"160px 1fr",gap:10 }}>
      <Card noPad>
        {[["sys","系统配置"],["svc","服务配置"],["mw","中间件配置"],["alert","告警配置"],["perm","权限配置"]].map(([k,l])=>(
          <div key={k} onClick={()=>setCat(k)} style={{ padding:"10px 14px",fontSize:12,color:cat===k?C.teal:C.t1,background:cat===k?C.tealBg:"transparent",cursor:"pointer",borderLeft:cat===k?`2px solid ${C.teal}`:"2px solid transparent",fontFamily:"sans-serif",transition:"all .15s" }}>{l}</div>
        ))}
      </Card>
      <Card title="配置项" extra={<div style={{display:"flex",gap:6}}><Btn variant="teal">保存</Btn><Btn>重置</Btn></div>}>
        <Table rowKey="0" rows={(cfgs[cat]||cfgs.sys).map(([n,v,d])=>({name:n,val:v,desc:d}))}
          cols={[
            {key:"name",title:"配置项",    render:v=><code style={{fontSize:11,color:C.blue}}>{v}</code>},
            {key:"val", title:"配置值",    render:v=><span style={{color:C.teal}}>{v}</span>},
            {key:"desc",title:"描述",      render:v=><span style={{color:C.t2}}>{v}</span>},
            {key:"name",title:"操作",      render:()=><Btn>编辑</Btn>},
          ]}/>
      </Card>
    </div>
  );
};

// ─── Nav config ─────────────────────────────────────────────
const NAV = [
  { key:"dash",   icon:<Monitor size={15}/>,   label:"总览驾驶舱",  Page:DashPage },
  { key:"chain",  icon:<GitBranch size={15}/>,  label:"云控链路",    Page:CloudChainPage },
  { key:"topo",   icon:<Layers size={15}/>,     label:"服务拓扑",    Page:()=><div style={{padding:20,color:C.t2,fontFamily:"sans-serif"}}>服务拓扑图（同总览中全链路拓扑，支持点击节点钻取）</div> },
  { key:"trace",  icon:<Activity size={15}/>,   label:"链路追踪",    Page:()=><CloudChainPage/> },
  { key:"kafka",  icon:<Server size={15}/>,     label:"Kafka 监控",  Page:KafkaPage },
  { key:"mqtt",   icon:<Radio size={15}/>,      label:"MQTT 监控",   Page:()=><div style={{padding:20,color:C.t2,fontFamily:"sans-serif"}}>MQTT 监控（Broker 状态、连接质量、Topic 流量同 Kafka 页面结构）</div> },
  { key:"dev",    icon:<Cpu size={15}/>,        label:"设备管理",    Page:DevicesPage },
  { key:"alert",  icon:<Bell size={15}/>,       label:"告警中心",    Page:AlertsPage, badge:23 },
  { key:"report", icon:<TrendingUp size={15}/>, label:"报表分析",    Page:ReportPage },
  { key:"config", icon:<Settings size={15}/>,   label:"配置管理",    Page:ConfigPage },
];

// ─── App shell ──────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dash");
  const [collapsed, setCollapsed] = useState(false);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const cur = NAV.find(n => n.key === page) || NAV[0];
  const PageComp = cur.Page;

  return (
    <div style={{ display:"flex", height:"100vh", background:C.bg0, color:C.t0, fontFamily:"'JetBrains Mono','Consolas',monospace", overflow:"hidden" }}>

      {/* ── Sidebar ── */}
      <div style={{ width:collapsed?52:192, background:C.bg1, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", flexShrink:0, transition:"width .2s ease", overflow:"hidden" }}>
        {/* Logo */}
        <div style={{ height:52, display:"flex", alignItems:"center", gap:10, padding:"0 14px", borderBottom:`1px solid ${C.border}`, cursor:"pointer", flexShrink:0 }} onClick={()=>setCollapsed(c=>!c)}>
          <span style={{ fontSize:20, flexShrink:0 }}>🛰️</span>
          {!collapsed && <div>
            <div style={{ fontSize:12, fontWeight:700, color:C.t0, lineHeight:1.4, whiteSpace:"nowrap" }}>车联网监控</div>
            <div style={{ fontSize:8.5, color:C.t2, letterSpacing:1.8, whiteSpace:"nowrap" }}>FULL CHAIN MONITOR</div>
          </div>}
        </div>

        {/* Nav items */}
        <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
          {NAV.map(n => {
            const active = page === n.key;
            return (
              <div key={n.key} onClick={() => setPage(n.key)}
                title={collapsed ? n.label : ""}
                style={{ display:"flex", alignItems:"center", gap:10, padding:collapsed?"12px 0":"9px 14px", justifyContent:collapsed?"center":"flex-start", cursor:"pointer", background:active?C.tealBg:"transparent", borderLeft:active?`2px solid ${C.teal}`:"2px solid transparent", color:active?C.teal:C.t1, transition:"all .12s", position:"relative" }}>
                <span style={{ color:active?C.teal:C.t2, flexShrink:0 }}>{n.icon}</span>
                {!collapsed && <span style={{ fontSize:12, fontFamily:"sans-serif", whiteSpace:"nowrap" }}>{n.label}</span>}
                {!collapsed && n.badge && <span style={{ marginLeft:"auto", fontSize:9, padding:"1px 6px", borderRadius:8, background:C.redBg, color:C.red, fontWeight:700 }}>{n.badge}</span>}
                {collapsed && n.badge && <span style={{ position:"absolute", top:6, right:6, width:7, height:7, borderRadius:"50%", background:C.red }}/>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Header */}
        <div style={{ height:52, background:C.bg1, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", padding:"0 18px", gap:14, flexShrink:0 }}>
          <div style={{ flex:1, display:"flex", alignItems:"center", gap:6, fontSize:12, fontFamily:"sans-serif", color:C.t2 }}>
            <span>首页</span><ChevronRight size={12}/><span style={{ color:C.t0 }}>{cur.label}</span>
          </div>
          <select style={{ background:C.bg3, border:`1px solid ${C.border}`, color:C.t1, borderRadius:5, padding:"3px 10px", fontSize:11 }}>
            <option>生产环境</option><option>预发环境</option><option>测试环境</option>
          </select>
          <div style={{ fontFamily:"monospace", fontSize:11, color:C.t2, background:"rgba(255,255,255,0.04)", padding:"3px 10px", borderRadius:5, whiteSpace:"nowrap" }}>
            2025-05-20 &nbsp;{clock}
          </div>
          <div style={{ position:"relative", cursor:"pointer" }}>
            <Bell size={17} style={{ color:C.t1 }}/>
            <span style={{ position:"absolute", top:-4, right:-5, fontSize:8, padding:"1px 4px", borderRadius:6, background:C.red, color:"white", fontWeight:700 }}>23</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:26, height:26, borderRadius:"50%", background:C.blue, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"white" }}>A</div>
            <span style={{ fontSize:12, fontFamily:"sans-serif", color:C.t1 }}>admin</span>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex:1, overflowY:"auto", padding:16, background:C.bg0 }}>
          <PageComp key={page} />
        </div>
      </div>
    </div>
  );
}
