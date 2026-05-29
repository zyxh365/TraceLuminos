# TSP 车联网全链路监控平台 — 一期实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建独立的 React + TypeScript + Ant Design Pro 前端监控看板项目，包含暗黑/白天模式切换、左侧菜单导航、云控远控链路页面、链路追踪页面。

**Architecture:** 独立 Vite 项目 `frontend/tsp-monitor-dashboard/`，Ant Design 5 ProLayout 提供整体布局，React Router 管理路由，ECharts 渲染图表，React Flow 渲染拓扑节点链，自定义 SVG Waterfall 渲染时序瀑布图。

**Tech Stack:** React 18 + TypeScript + Vite 5 + Ant Design 5 + ECharts 5 + React Flow + dayjs

**YAML 设计稿位置:** `docs/UI/*.yml`

---

### 文件结构

```
frontend/tsp-monitor-dashboard/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── .env.example
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── theme/
│   │   ├── tokens.ts
│   │   └── ThemeProvider.tsx
│   ├── layouts/
│   │   ├── Sidebar.tsx
│   │   └── TopHeader.tsx
│   ├── pages/
│   │   ├── RemoteControl/
│   │   │   ├── index.tsx
│   │   │   ├── CommandInfoBar.tsx
│   │   │   └── FlowChain.tsx
│   │   └── TraceSearch/
│   │       ├── index.tsx
│   │       └── TraceInfo.tsx
│   ├── components/
│   │   ├── SpanTable.tsx
│   │   └── WaterfallTimeline.tsx
│   ├── services/
│   │   └── api.ts
│   └── types/
│       └── index.ts
```

---

### Task 1: 项目脚手架 + 暗黑/白天模式主题

**Files:**
- Create: `frontend/tsp-monitor-dashboard/package.json`
- Create: `frontend/tsp-monitor-dashboard/vite.config.ts`
- Create: `frontend/tsp-monitor-dashboard/tsconfig.json`
- Create: `frontend/tsp-monitor-dashboard/index.html`
- Create: `frontend/tsp-monitor-dashboard/.env.example`
- Create: `frontend/tsp-monitor-dashboard/src/main.tsx`
- Create: `frontend/tsp-monitor-dashboard/src/App.tsx`
- Create: `frontend/tsp-monitor-dashboard/src/types/index.ts`
- Create: `frontend/tsp-monitor-dashboard/src/theme/tokens.ts`
- Create: `frontend/tsp-monitor-dashboard/src/theme/ThemeProvider.tsx`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "tsp-monitor-dashboard",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@ant-design/icons": "^5.4.0",
    "@ant-design/pro-layout": "^7.19.0",
    "antd": "^5.20.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "echarts": "^5.5.1",
    "echarts-for-react": "^3.0.2",
    "@xyflow/react": "^12.3.0",
    "dayjs": "^1.11.12",
    "axios": "^1.7.5"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'http://localhost:8085',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "baseUrl": "."
  },
  "include": ["src"]
}
```

- [ ] **Step 4: 创建 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TSP 车联网全链路监控平台</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: 创建 .env.example**

```bash
VITE_API_BASE=http://localhost:8085
VITE_ENV_LABEL=测试环境
```

- [ ] **Step 6: 创建 src/types/index.ts**

```typescript
export interface SpanRecord {
  spanName: string;
  service: string;
  startTime: string;
  duration: number;
  status: 'success' | 'error' | 'pending';
}

export interface CommandInfo {
  remoteCommandId: string;
  commandType: string;
  initiator: string;
  targetVehicle: string;
  status: string;
  totalLatency: number;
}

export interface ChainNode {
  name: string;
  ip: string;
  latency: number;
  status?: 'normal' | 'error' | 'pending';
}

export interface TraceInfo {
  traceId: string;
  spanId: string;
  parentId: string;
  service: string;
  operation: string;
  status: string;
  tags: Record<string, string>;
}

export type ThemeMode = 'dark' | 'light';

export interface ThemeContextType {
  mode: ThemeMode;
  toggle: () => void;
}
```

- [ ] **Step 7: 创建 src/theme/tokens.ts**

```typescript
import type { ThemeConfig } from 'antd';

export const darkTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    colorBgBase: '#0a0e17',
    colorBgContainer: 'rgba(13, 17, 28, 0.85)',
    colorBgElevated: 'rgba(18, 22, 35, 0.95)',
    colorBorder: 'rgba(255, 255, 255, 0.08)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.04)',
    colorText: '#d0d5dd',
    colorTextSecondary: '#8b95a8',
    fontFamily: `'JetBrains Mono', 'SF Mono', -apple-system, sans-serif`,
    borderRadius: 6,
    fontSize: 13,
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(22, 119, 255, 0.15)',
      darkItemColor: '#8b95a8',
      darkItemSelectedColor: '#1677ff',
    },
    Layout: {
      bodyBg: '#0a0e17',
      headerBg: 'rgba(13, 17, 28, 0.9)',
      siderBg: 'rgba(10, 14, 23, 0.95)',
    },
    Table: {
      headerBg: 'rgba(22, 119, 255, 0.06)',
      rowHoverBg: 'rgba(22, 119, 255, 0.04)',
      borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    Card: {
      colorBgContainer: 'rgba(13, 17, 28, 0.7)',
    },
  },
};

export const lightTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    colorBgBase: '#f0f2f5',
    colorBgContainer: 'rgba(255, 255, 255, 0.85)',
    colorBgElevated: '#ffffff',
    colorBorder: 'rgba(0, 0, 0, 0.06)',
    colorBorderSecondary: 'rgba(0, 0, 0, 0.04)',
    colorText: '#1f2937',
    colorTextSecondary: '#6b7280',
    borderRadius: 6,
    fontSize: 13,
  },
  components: {
    Layout: {
      bodyBg: '#f0f2f5',
      headerBg: '#ffffff',
      siderBg: '#001529',
    },
    Card: {
      colorBgContainer: '#ffffff',
    },
  },
};
```

- [ ] **Step 8: 创建 src/theme/ThemeProvider.tsx**

```tsx
import React, { createContext, useContext, useMemo, useState } from 'react';
import { ConfigProvider, theme } from 'antd';
import { darkTheme, lightTheme } from './tokens';
import type { ThemeContextType, ThemeMode } from '@/types';

const ThemeContext = createContext<ThemeContextType>({ mode: 'dark', toggle: () => {} });

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(() =>
    (localStorage.getItem('theme') as ThemeMode) || 'dark'
  );

  const toggle = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    localStorage.setItem('theme', next);
  };

  const config = useMemo(() => (mode === 'dark' ? darkTheme : lightTheme), [mode]);
  const algo = mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm;

  return (
    <ThemeContext.Provider value={{ mode, toggle }}>
      <ConfigProvider theme={{ ...config, algorithm: algo }}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};
```

- [ ] **Step 9: 创建 src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 10: 创建 src/App.tsx**

```tsx
import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ProLayout } from '@ant-design/pro-layout';
import { Sidebar } from './layouts/Sidebar';
import { TopHeader } from './layouts/TopHeader';
import RemoteControlPage from './pages/RemoteControl';
import TraceSearchPage from './pages/TraceSearch';

const App: React.FC = () => {
  const location = useLocation();

  return (
    <ProLayout
      title="TSP 全链路监控"
      logo={null}
      layout="mix"
      location={location}
      siderMenuType="sub"
      menuItemRender={false}
      menuData={[]}
      headerRender={() => <TopHeader />}
      menuRender={() => <Sidebar />}
      fixSiderbar
      style={{ minHeight: '100vh' }}
    >
      <Routes>
        <Route path="/remote-control" element={<RemoteControlPage />} />
        <Route path="/trace-search" element={<TraceSearchPage />} />
        <Route path="*" element={<Navigate to="/remote-control" replace />} />
      </Routes>
    </ProLayout>
  );
};

export default App;
```

- [ ] **Step 11: Install dependencies and verify build**

```bash
cd frontend/tsp-monitor-dashboard
npm install
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 12: Commit**

```bash
git add frontend/tsp-monitor-dashboard/
git commit -m "feat: scaffold tsp-monitor-dashboard with theme system"
```

---

### Task 2: 左侧菜单 (Sidebar) + 顶部导航栏 (TopHeader)

**Files:**
- Create: `frontend/tsp-monitor-dashboard/src/layouts/Sidebar.tsx`
- Create: `frontend/tsp-monitor-dashboard/src/layouts/TopHeader.tsx`

- [ ] **Step 1: 创建 src/layouts/Sidebar.tsx**

```tsx
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu } from 'antd';
import {
  LinkOutlined,
  SearchOutlined,
  ApartmentOutlined,
  AlertOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { useTheme } from '@/theme/ThemeProvider';

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

const menuItems: MenuItem[] = [
  { key: 'remote-control', label: '云控链路', icon: <LinkOutlined />, path: '/remote-control' },
  { key: 'trace-search', label: '链路追踪', icon: <SearchOutlined />, path: '/trace-search' },
  { key: 'topology', label: '服务拓扑', icon: <ApartmentOutlined />, path: '/topology' },
  { key: 'alerts', label: '告警中心', icon: <AlertOutlined />, path: '/alerts' },
  { key: 'dashboard', label: '大屏驾驶舱', icon: <DashboardOutlined />, path: '/dashboard' },
];

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode } = useTheme();

  const selectedKey = menuItems.find(
    (item) => location.pathname.startsWith(item.path)
  )?.key || 'remote-control';

  return (
    <Menu
      mode="inline"
      theme={mode}
      selectedKeys={[selectedKey]}
      onClick={({ key }) => {
        const item = menuItems.find((m) => m.key === key);
        if (item) navigate(item.path);
      }}
      items={menuItems.map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.label,
      }))}
      style={{
        height: '100%',
        borderInlineEnd: 'none',
        paddingTop: 16,
      }}
    />
  );
};
```

- [ ] **Step 2: 创建 src/layouts/TopHeader.tsx**

```tsx
import React from 'react';
import { Space, Button, Select, Tag, Badge, Avatar, Tooltip } from 'antd';
import {
  SearchOutlined,
  BellOutlined,
  UserOutlined,
  BulbOutlined,
  BulbFilled,
} from '@ant-design/icons';
import { useTheme } from '@/theme/ThemeProvider';

export const TopHeader: React.FC = () => {
  const { mode, toggle } = useTheme();
  const envLabel = import.meta.env.VITE_ENV_LABEL || '测试环境';
  const envColor = envLabel.includes('生产') ? 'red' : 'orange';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        height: 48,
        padding: '0 24px',
        gap: 16,
        background: mode === 'dark' ? 'rgba(13,17,28,0.95)' : '#fff',
        borderBottom: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#f0f0f0'}`,
      }}
    >
      <Tag color={envColor} style={{ margin: 0 }}>{envLabel}</Tag>
      <Select
        size="small"
        defaultValue="15m"
        style={{ width: 100 }}
        options={[
          { value: '5m', label: '近 5 分钟' },
          { value: '15m', label: '近 15 分钟' },
          { value: '1h', label: '近 1 小时' },
          { value: '6h', label: '近 6 小时' },
          { value: '24h', label: '近 24 小时' },
        ]}
      />
      <Tooltip title="搜索 TraceID">
        <Button type="text" icon={<SearchOutlined />} />
      </Tooltip>
      <Tooltip title="消息通知">
        <Badge dot offset={[-2, 2]}>
          <Button type="text" icon={<BellOutlined />} />
        </Badge>
      </Tooltip>
      <Tooltip title={mode === 'dark' ? '切换白天模式' : '切换暗黑模式'}>
        <Button
          type="text"
          icon={mode === 'dark' ? <BulbFilled /> : <BulbOutlined />}
          onClick={toggle}
          style={{ color: mode === 'dark' ? '#fbbf24' : '#f59e0b' }}
        />
      </Tooltip>
      <Space size={8}>
        <Avatar size="small" icon={<UserOutlined />} />
        <span style={{ fontSize: 13 }}>admin</span>
      </Space>
    </div>
  );
};
```

- [ ] **Step 3: npm run build — verify**

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/tsp-monitor-dashboard/src/layouts/
git commit -m "feat: add sidebar menu and top header with dark/light toggle"
```

---

### Task 3: 云控远控链路页面 (RemoteControlPage)

**Files:**
- Create: `frontend/tsp-monitor-dashboard/src/pages/RemoteControl/index.tsx`
- Create: `frontend/tsp-monitor-dashboard/src/pages/RemoteControl/CommandInfoBar.tsx`
- Create: `frontend/tsp-monitor-dashboard/src/pages/RemoteControl/FlowChain.tsx`

- [ ] **Step 1: 创建 CommandInfoBar.tsx**

```tsx
import React from 'react';
import { Row, Col, Typography, Tag, Space } from 'antd';
import { CopyOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { CommandInfo } from '@/types';

const { Text } = Typography;

interface Props {
  info: CommandInfo;
}

export const CommandInfoBar: React.FC<Props> = ({ info }) => (
  <div
    style={{
      padding: '12px 20px',
      borderRadius: 8,
      background: 'rgba(13, 17, 28, 0.6)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      marginBottom: 16,
    }}
  >
    <Row gutter={[24, 8]}>
      <Col span={6}>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>指令ID</Text>
          <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{info.remoteCommandId}</Text>
          <CopyOutlined style={{ color: '#1677ff', cursor: 'pointer' }} />
        </Space>
      </Col>
      <Col span={3}>
        <Space direction="vertical" size={0}>
          <Text type="secondary" style={{ fontSize: 11 }}>指令类型</Text>
          <Text>{info.commandType}</Text>
        </Space>
      </Col>
      <Col span={3}>
        <Space direction="vertical" size={0}>
          <Text type="secondary" style={{ fontSize: 11 }}>发送设备</Text>
          <Text>{info.initiator}</Text>
        </Space>
      </Col>
      <Col span={3}>
        <Space direction="vertical" size={0}>
          <Text type="secondary" style={{ fontSize: 11 }}>目标车辆</Text>
          <Text>{info.targetVehicle}</Text>
        </Space>
      </Col>
      <Col span={3}>
        <Space direction="vertical" size={0}>
          <Text type="secondary" style={{ fontSize: 11 }}>状态</Text>
          <Tag
            icon={info.status === '成功' ? <CheckCircleOutlined /> : undefined}
            color={info.status === '成功' ? 'success' : 'error'}
          >
            {info.status}
          </Tag>
        </Space>
      </Col>
      <Col span={4}>
        <Space direction="vertical" size={0}>
          <Text type="secondary" style={{ fontSize: 11 }}>总耗时</Text>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1677ff' }}>
            <ClockCircleOutlined style={{ marginRight: 6 }} />
            {info.totalLatency}ms
          </Text>
        </Space>
      </Col>
    </Row>
  </div>
);
```

- [ ] **Step 2: 创建 FlowChain.tsx** (React Flow 节点链)

```tsx
import React, { useMemo } from 'react';
import { ReactFlow, Handle, Position, Background } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ChainNode } from '@/types';

const NODE_W = 140;
const NODE_H = 60;
const GAP = 40;

function ChainNodeComponent({ data }: { data: ChainNode }) {
  const isError = data.status === 'error';
  const isTbox = data.name === 'T-Box';
  return (
    <div
      style={{
        width: NODE_W,
        height: NODE_H,
        borderRadius: isTbox ? 6 : '50%',
        border: `2px ${isTbox ? 'dashed' : 'solid'} ${isError ? '#ff4d4f' : '#1677ff'}`,
        background: 'rgba(13, 17, 28, 0.9)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#d0d5dd',
      }}
    >
      <div style={{ fontWeight: 'bold', color: '#1677ff' }}>{data.name}</div>
      <div style={{ color: '#8b95a8', fontSize: 10 }}>{data.ip}</div>
      <div style={{ color: '#52c41a', fontSize: 10 }}>{data.latency}ms</div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

interface Props {
  nodes: ChainNode[];
}

export const FlowChain: React.FC<Props> = ({ nodes }) => {
  const flowNodes = useMemo(() =>
    nodes.map((n, i) => ({
      id: `chain-${i}`,
      type: 'chainNode',
      position: { x: i * (NODE_W + GAP), y: 0 },
      data: n,
    })),
    [nodes]
  );

  const flowEdges = useMemo(() =>
    nodes.slice(1).map((_, i) => ({
      id: `edge-${i}`,
      source: `chain-${i}`,
      target: `chain-${i + 1}`,
      animated: true,
      style: { stroke: '#1677ff', strokeWidth: 1.5, strokeDasharray: '4,3' },
    })),
    [nodes]
  );

  const nodeTypes = useMemo(() => ({ chainNode: ChainNodeComponent }), []);

  return (
    <div style={{ height: 160, borderRadius: 8, overflow: 'hidden', marginBottom: 16,
      background: 'rgba(13, 17, 28, 0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        zoomOnScroll={false}
        panOnDrag={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(255,255,255,0.04)" gap={20} />
      </ReactFlow>
    </div>
  );
};
```

- [ ] **Step 3: 创建 RemoteControlPage index.tsx**

```tsx
import React, { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { CommandInfoBar } from './CommandInfoBar';
import { FlowChain } from './FlowChain';
import { SpanTable } from '@/components/SpanTable';
import { WaterfallTimeline } from '@/components/WaterfallTimeline';
import { api } from '@/services/api';
import type { CommandInfo, ChainNode, SpanRecord } from '@/types';

const MOCK_COMMAND: CommandInfo = {
  remoteCommandId: 'CMD202505201000123456',
  commandType: '车门解锁',
  initiator: 'APP IOS 1.2.3',
  targetVehicle: '粤A-12345',
  status: '成功',
  totalLatency: 1283,
};

const MOCK_CHAIN: ChainNode[] = [
  { name: 'APP', ip: '10.0.01.123', latency: 120 },
  { name: '云网关', ip: '10.0.01.243', latency: 35 },
  { name: 'MQTT Broker', ip: '10.0.01.278', latency: 12 },
  { name: '规则引擎', ip: '10.0.01.290', latency: 45 },
  { name: 'Kafka', ip: '10.0.01.335', latency: 98 },
  { name: '车控服务', ip: '10.0.01.433', latency: 210 },
  { name: 'T-Box', ip: '10.0.01.643', latency: 420, status: 'normal' },
  { name: '车辆执行', ip: '10.0.02.063', latency: 100 },
  { name: '结果回传', ip: '10.0.02.163', latency: 120 },
  { name: 'APP', ip: '10.0.02.283', latency: 120 },
];

const RemoteControlPage: React.FC = () => {
  const [spanRecords, setSpanRecords] = useState<SpanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.fetchTraceDetail('1e6a8c5f3b2d4e7a9c0b1d2e3f4a5b6c')
      .then(setSpanRecords)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '200px auto' }} />;

  return (
    <div style={{ padding: '16px 24px' }}>
      <CommandInfoBar info={MOCK_COMMAND} />
      <FlowChain nodes={MOCK_CHAIN} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
        <div>
          <h4 style={{ color: '#8b95a8', fontSize: 13, marginBottom: 8 }}>链路详情</h4>
          <SpanTable records={spanRecords} />
        </div>
        <div>
          <h4 style={{ color: '#8b95a8', fontSize: 13, marginBottom: 8 }}>时间轴</h4>
          <WaterfallTimeline records={spanRecords} totalDuration={1400} />
        </div>
      </div>
    </div>
  );
};

export default RemoteControlPage;
```

- [ ] **Step 4: npm run build — verify**

Expected: build succeeds (SpanTable & WaterfallTimeline import errors expected until Task 4).

- [ ] **Step 5: Commit**

```bash
git add frontend/tsp-monitor-dashboard/src/pages/RemoteControl/
git commit -m "feat: add remote control chain page with command info bar and flow chain"
```

---

### Task 4: 公共组件 SpanTable + WaterfallTimeline

**Files:**
- Create: `frontend/tsp-monitor-dashboard/src/components/SpanTable.tsx`
- Create: `frontend/tsp-monitor-dashboard/src/components/WaterfallTimeline.tsx`
- Create: `frontend/tsp-monitor-dashboard/src/services/api.ts`

- [ ] **Step 1: 创建 services/api.ts**

```typescript
import axios from 'axios';
import type { SpanRecord, TraceInfo } from '@/types';

const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '' });

export const api = {
  async fetchTraceDetail(traceId: string): Promise<SpanRecord[]> {
    const { data } = await http.get('/api/analysis/trace', { params: { traceId } });
    return data?.data || [];
  },
  async fetchTraceInfo(traceId: string): Promise<TraceInfo | null> {
    const { data } = await http.get('/api/analysis/trace-info', { params: { traceId } });
    return data?.data || null;
  },
  async searchByVin(vin: string, startTime?: number, endTime?: number): Promise<SpanRecord[]> {
    const { data } = await http.get('/api/analysis/spans', { params: { vin, startTime, endTime } });
    return data?.data || [];
  },
};
```

- [ ] **Step 2: 创建 SpanTable.tsx**

```tsx
import React from 'react';
import { Table, Tag } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { SpanRecord } from '@/types';

interface Props {
  records: SpanRecord[];
  compact?: boolean;
}

export const SpanTable: React.FC<Props> = ({ records, compact = false }) => {
  const columns = [
    {
      title: 'Span',
      dataIndex: 'spanName',
      key: 'spanName',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>,
    },
    {
      title: '服务',
      dataIndex: 'service',
      key: 'service',
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>,
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      sorter: (a: SpanRecord, b: SpanRecord) => a.duration - b.duration,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{v}ms</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => {
        const icon = v === 'success' ? <CheckCircleOutlined /> : v === 'error' ? <CloseCircleOutlined /> : <ClockCircleOutlined />;
        const color = v === 'success' ? 'success' : v === 'error' ? 'error' : 'processing';
        return <Tag icon={icon} color={color}>{v}</Tag>;
      },
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={records}
      rowKey={(r, i) => `${r.spanName}-${i}`}
      size={compact ? 'small' : 'middle'}
      pagination={false}
      scroll={{ y: 360 }}
    />
  );
};
```

- [ ] **Step 3: 创建 WaterfallTimeline.tsx**

```tsx
import React, { useMemo } from 'react';
import type { SpanRecord } from '@/types';

interface Props {
  records: SpanRecord[];
  totalDuration: number;
  height?: number;
}

const BAR_H = 28;
const BAR_GAP = 6;
const ROW_H = BAR_H + BAR_GAP;
const PADDING_LEFT = 120;
const PADDING_RIGHT = 40;
const COLORS = ['#1677ff', '#52c41a', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#f5222d', '#1890ff', '#2f54eb', '#a0d911'];

export const WaterfallTimeline: React.FC<Props> = ({ records, totalDuration, height }) => {
  const h = height ?? records.length * ROW_H + 60;

  const bars = useMemo(() => {
    let cumulative = 0;
    return records.map((r, i) => {
      const x = cumulative;
      cumulative += r.duration;
      return {
        ...r,
        xPercent: (x / totalDuration) * 100,
        wPercent: (r.duration / totalDuration) * 100,
        color: COLORS[i % COLORS.length],
      };
    });
  }, [records, totalDuration]);

  return (
    <svg width="100%" height={h} style={{ background: 'rgba(13,17,28,0.6)', borderRadius: 8 }}>
      {bars.map((bar, i) => (
        <g key={i}>
          <text
            x={8}
            y={40 + i * ROW_H + BAR_H / 2 + 4}
            fill="#8b95a8"
            fontSize={11}
            fontFamily="monospace"
          >
            {bar.spanName}
          </text>
          <rect
            x={`${PADDING_LEFT + (bar.xPercent * (100 - (PADDING_LEFT + PADDING_RIGHT) / h))}px`}
            y={40 + i * ROW_H}
            width={`${(bar.wPercent * 5) + 80}px`}
            height={BAR_H}
            rx={4}
            fill={bar.color}
            opacity={0.85}
          />
          <text
            x={`${PADDING_LEFT + (bar.xPercent * 5) + bar.wPercent * 2.5 + 84}px`}
            y={40 + i * ROW_H + BAR_H / 2 + 4}
            fill="#d0d5dd"
            fontSize={10}
            fontFamily="monospace"
          >
            {bar.duration}ms
          </text>
        </g>
      ))}
      <text x={PADDING_LEFT} y={28} fill="#5a7090" fontSize={10} fontFamily="monospace">0ms</text>
      <text x={PADDING_LEFT + (bars[0]?.wPercent ?? 1) * 5 + 80} y={28} fill="#5a7090" fontSize={10} fontFamily="monospace">{totalDuration}ms</text>
    </svg>
  );
};
```

- [ ] **Step 4: npm run build — verify**

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/tsp-monitor-dashboard/src/components/ frontend/tsp-monitor-dashboard/src/services/
git commit -m "feat: add SpanTable, WaterfallTimeline and API service layer"
```

---

### Task 5: 链路追踪页面 (TraceSearchPage)

**Files:**
- Create: `frontend/tsp-monitor-dashboard/src/pages/TraceSearch/index.tsx`
- Create: `frontend/tsp-monitor-dashboard/src/pages/TraceSearch/TraceInfo.tsx`

- [ ] **Step 1: 创建 TraceInfo.tsx**

```tsx
import React from 'react';
import { Descriptions, Tag, Typography } from 'antd';
import { CopyOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { TraceInfo } from '@/types';

const { Text } = Typography;

interface Props {
  info: TraceInfo;
}

export const TraceInfoCard: React.FC<Props> = ({ info }) => (
  <div
    style={{
      padding: '12px 20px',
      borderRadius: 8,
      background: 'rgba(13, 17, 28, 0.6)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      marginBottom: 16,
    }}
  >
    <Descriptions size="small" column={4}>
      <Descriptions.Item label="Trace ID">
        <Space>
          <Text code style={{ fontSize: 12 }}>{info.traceId.slice(0, 16)}...</Text>
          <CopyOutlined style={{ color: '#1677ff', cursor: 'pointer' }} />
        </Space>
      </Descriptions.Item>
      <Descriptions.Item label="Span ID">
        <Text code style={{ fontSize: 12 }}>{info.spanId.slice(0, 16)}...</Text>
      </Descriptions.Item>
      <Descriptions.Item label="Parent ID">
        <Text code style={{ fontSize: 12 }}>{info.parentId.slice(0, 16)}...</Text>
      </Descriptions.Item>
      <Descriptions.Item label="服务">
        <Text>{info.service}</Text>
      </Descriptions.Item>
      <Descriptions.Item label="操作">
        <Text code>{info.operation}</Text>
      </Descriptions.Item>
      <Descriptions.Item label="状态">
        <Tag icon={<CheckCircleOutlined />} color="success">{info.status}</Tag>
      </Descriptions.Item>
      <Descriptions.Item label="cmdType">
        <Text code>{info.tags.cmdType}</Text>
      </Descriptions.Item>
      <Descriptions.Item label="VIN">
        <Text code>{info.tags.vin}</Text>
      </Descriptions.Item>
    </Descriptions>
  </div>
);
```

- [ ] **Step 2: 创建 TraceSearchPage index.tsx**

```tsx
import React, { useState } from 'react';
import { Input, Button, Spin, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { TraceInfoCard } from './TraceInfo';
import { SpanTable } from '@/components/SpanTable';
import { WaterfallTimeline } from '@/components/WaterfallTimeline';
import { api } from '@/services/api';
import type { SpanRecord, TraceInfo } from '@/types';

const MOCK_TRACE_INFO: TraceInfo = {
  traceId: '1e6a8c5f3b2d4e7a9c0b1d2e3f4a5b6c',
  spanId: '3f2e1d0c9b8a7e6d5c4b3a2f1e0d9c8b',
  parentId: '2e1d0c9b8a7e6d5c4b3a2f1e0d9c8b7a',
  service: 'vehicle-control',
  operation: 'HandleRemoteCommand',
  status: '成功',
  tags: { cmdType: 'unlock_door', vin: 'LSGAxxxxxxxx1234', userId: 'user_10086' },
};

const TraceSearchPage: React.FC = () => {
  const [traceId, setTraceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<SpanRecord[]>([]);
  const [traceInfo, setTraceInfo] = useState<TraceInfo | null>(null);

  const handleSearch = async () => {
    if (!traceId.trim()) return;
    setLoading(true);
    try {
      const [spans, info] = await Promise.all([
        api.fetchTraceDetail(traceId.trim()),
        api.fetchTraceInfo(traceId.trim()),
      ]);
      setRecords(spans);
      setTraceInfo(info || MOCK_TRACE_INFO);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '16px 24px' }}>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="输入 TraceID 搜索"
          value={traceId}
          onChange={(e) => setTraceId(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 400, fontFamily: 'monospace' }}
          prefix={<SearchOutlined />}
        />
        <Button type="primary" onClick={handleSearch} loading={loading}>
          搜索
        </Button>
      </Space>

      {loading && <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />}

      {traceInfo && (
        <>
          <TraceInfoCard info={traceInfo} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
            <div>
              <h4 style={{ color: '#8b95a8', fontSize: 13, marginBottom: 8 }}>Span 列表</h4>
              <SpanTable records={records} />
            </div>
            <div>
              <h4 style={{ color: '#8b95a8', fontSize: 13, marginBottom: 8 }}>时序瀑布图</h4>
              <WaterfallTimeline
                records={records.length > 0 ? records : [
                  { spanName: 'APP', service: 'app-service', startTime: '10:00:00.000', duration: 120, status: 'success' },
                  { spanName: 'API Gateway', service: 'gateway', startTime: '10:00:00.120', duration: 35, status: 'success' },
                  { spanName: 'MQTT Broker', service: 'mqtt', startTime: '10:00:00.155', duration: 12, status: 'success' },
                  { spanName: 'Kafka', service: 'kafka', startTime: '10:00:00.167', duration: 98, status: 'success' },
                  { spanName: 'Vehicle Control', service: 'vehicle-ctrl', startTime: '10:00:00.265', duration: 210, status: 'success' },
                  { spanName: 'T-Box', service: 'tbox', startTime: '10:00:00.475', duration: 420, status: 'pending' },
                ]}
                totalDuration={1400}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TraceSearchPage;
```

- [ ] **Step 3: npm run build — verify**

Expected: full build succeeds with all pages.

```bash
cd frontend/tsp-monitor-dashboard && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/tsp-monitor-dashboard/src/pages/TraceSearch/
git commit -m "feat: add trace search page with info card and waterfall"
```

---

### Task 6: 全局样式 — 深色科技风打磨

**Files:**
- Create: `frontend/tsp-monitor-dashboard/src/index.css`

- [ ] **Step 1: 创建 src/index.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --glow-color: rgba(22, 119, 255, 0.3);
  --card-bg: rgba(13, 17, 28, 0.7);
  --border-color: rgba(255, 255, 255, 0.06);
}

body {
  font-family: 'SF Mono', 'JetBrains Mono', 'Cascadia Code', monospace;
  -webkit-font-smoothing: antialiased;
  background: #0a0e17;
  color: #d0d5dd;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-thumb {
  background: rgba(22, 119, 255, 0.3);
  border-radius: 3px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

.ant-card {
  backdrop-filter: blur(8px);
  border: 1px solid var(--border-color);
}

.ant-pro-layout .ant-pro-layout-bg-list {
  background: #0a0e17;
}

.ant-pro-layout .ant-layout-header {
  backdrop-filter: blur(12px);
}

.react-flow__node {
  filter: drop-shadow(0 0 6px var(--glow-color));
}

.react-flow__edge-path {
  filter: drop-shadow(0 0 3px var(--glow-color));
}

.ant-table-tbody > tr > td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.ant-btn-primary {
  box-shadow: 0 0 12px rgba(22, 119, 255, 0.3);
}
```

- [ ] **Step 2: npm run build**

Expected: build succeeds with polished dark theme.

- [ ] **Step 3: Commit**

```bash
git add frontend/tsp-monitor-dashboard/src/index.css
git commit -m "style: add sci-fi dark theme global styles"
```

---

### Task 7: 端到端验证

- [ ] **Step 1: npm run dev and manual check**

```bash
cd frontend/tsp-monitor-dashboard && npm run dev
```

打开 http://localhost:3000，验证：
1. 左侧菜单可点击切换页面
2. TopHeader 环境标签、时间筛选、暗黑/白天切换
3. 云控链路页面：指令信息栏 → 节点流 → Span 表格 + 时序图
4. 链路追踪页面：搜索 → TraceInfo → Span 表格 + 瀑布图

- [ ] **Step 2: npm run build 最终构建**

```bash
cd frontend/tsp-monitor-dashboard && npm run build
```

Expected: 0 errors, dist/ 生成。

- [ ] **Step 3: 推送到 Gitee**

```bash
git subtree push --prefix=frontend/tsp-monitor-dashboard gitee master
```

---
