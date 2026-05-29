# 车联网全链路监控平台

基于 **Vite + React 18 + Recharts** 的车联网全链路监控平台前端骨架。

## 快速启动

```bash
cd iot-monitor
npm install
npm run dev
```

浏览器打开 http://localhost:5173

## 目录结构

```
src/
├── constants/
│   ├── theme.js          # 设计 token（颜色、字体）
│   └── mockData.js       # 全局 Mock 数据（含拓扑节点/边）
│
├── components/
│   ├── common/           # 通用 UI 原子组件
│   │   ├── Card.jsx
│   │   ├── MetricCard.jsx  # 带 sparkline 的指标卡
│   │   ├── Tag.jsx         # Tag / LvlTag / StTag
│   │   ├── Button.jsx
│   │   ├── Table.jsx       # DataTable
│   │   └── ProgressBar.jsx
│   │
│   ├── charts/           # 图表组件
│   │   ├── TopologyGraph.jsx  # ⭐ 拖拽式有向拓扑图（SVG + animateMotion）
│   │   └── GanttChart.jsx    # Span 追踪甘特图
│   │
│   └── layout/
│       ├── Sidebar.jsx   # 可折叠侧边导航
│       └── Header.jsx    # 顶部导航栏
│
├── pages/
│   ├── Dashboard/        # 总览驾驶舱
│   ├── CloudChain/       # 云控链路追踪
│   ├── ServiceTopology/  # ⭐ 服务拓扑页（含 TopologyGraph）
│   ├── Kafka/            # Kafka 监控
│   └── misc.jsx          # Devices / Alerts / Reports / Config
│
├── styles/
│   └── global.css        # CSS 变量 + 全局重置
│
├── App.jsx               # 路由 Shell
└── main.jsx              # 入口
```

## 核心特性

### TopologyGraph（服务拓扑图）

- **节点可拖拽**：鼠标按住节点自由移动，边实时跟随
- **贝塞尔曲线边**：按节点对位置自动弯曲，避免边重叠
- **流量动画**：正常边有 `animateMotion` 小点流动效果
- **告警高亮**：warn 节点橙色脉冲动画 + 虚线边
- **交互面板**：点击节点弹出详情浮层，支持跳转链路追踪
- **节点类型筛选**：toolbar 可按服务/中间件/存储过滤

### 页面导航

左侧 sidebar 支持 **折叠/展开**，点击 Logo 切换。

## 接入真实数据

替换 `src/constants/mockData.js` 中的数据为 API 调用即可，例如：

```js
// 示例：用 React Query 替换 Mock
import { useQuery } from '@tanstack/react-query'

export function useTopoData() {
  return useQuery({ queryKey: ['topo'], queryFn: () => fetch('/api/topology').then(r => r.json()) })
}
```

## 下一步扩展建议

| 功能 | 建议方案 |
|------|---------|
| 真实接口 | React Query + Axios |
| 路由     | React Router v6 |
| 状态管理 | Zustand |
| 图表增强 | 引入 D3-force 做力导向布局 |
| 告警推送 | WebSocket 实时推送 |
