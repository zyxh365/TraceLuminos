import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ProLayout, PageContainer } from '@ant-design/pro-layout';
import type { MenuDataItem } from '@ant-design/pro-layout';
import { BulbOutlined, BulbFilled, SearchOutlined, BellOutlined, UserOutlined } from '@ant-design/icons';
import { Input, Dropdown, Badge, Tag } from 'antd';
import { useTheme } from './theme/ThemeProvider';
import { menuData } from './layouts/Sidebar';
import RemoteControlPage from './pages/RemoteControl';
import TraceSearchPage from './pages/TraceSearch';

const envLabel = import.meta.env.VITE_ENV_LABEL || '测试环境';

const App: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  // dark-header style
  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    padding: '0 20px',
    background: mode === 'dark' ? 'rgba(13,17,28,0.92)' : '#fff',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backdropFilter: 'blur(8px)',
  };

  const titleBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1677ff" opacity="0.2" /><circle cx="12" cy="12" r="5" fill="#1677ff" /></svg>
      <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.5 }}>
        TSP 全链路监控
      </span>
    </div>
  );

  const headerRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Tag color={envLabel === '生产环境' ? 'red' : 'blue'}>{envLabel}</Tag>
      <Input prefix={<SearchOutlined />} placeholder="TraceID / VIN" size="small" style={{ width: 180 }} />
      <Badge dot offset={[-2, 2]}>
        <BellOutlined style={{ fontSize: 16, cursor: 'pointer' }} />
      </Badge>
      <span onClick={toggle} style={{ cursor: 'pointer', fontSize: 16 }}>
        {mode === 'dark' ? <BulbOutlined /> : <BulbFilled style={{ color: '#f59e0b' }} />}
      </span>
      <Dropdown menu={{ items: [{ key: 'admin', label: 'admin' }] }}>
        <UserOutlined style={{ fontSize: 16, cursor: 'pointer' }} />
      </Dropdown>
    </div>
  );

  return (
    <ProLayout
      title="TSP 全链路监控"
      logo={null}
      layout="mix"
      location={location}
      route={{ routes: menuData }}
      siderMenuType="sub"
      collapsed={collapsed}
      onCollapse={setCollapsed}
      menuDataRender={() => menuData as MenuDataItem[]}
      menuItemRender={(item: MenuDataItem, dom: React.ReactNode) => (
        <div onClick={() => item.path && navigate(item.path || '/')} style={{ cursor: 'pointer' }}>
          {dom}
        </div>
      )}
      headerRender={() => null}
      style={{ minHeight: '100vh' }}
    >
      {/* Custom top bar */}
      <div style={headerStyle}>
        {titleBar}
        {headerRight}
      </div>

      <PageContainer header={{ title: '', breadcrumb: {} }}>
        <Routes>
          <Route path="/" element={<Navigate to="/remote-control" replace />} />
          <Route path="/remote-control" element={<RemoteControlPage />} />
          <Route path="/trace-search" element={<TraceSearchPage />} />
          <Route path="*" element={<Navigate to="/remote-control" replace />} />
        </Routes>
      </PageContainer>
    </ProLayout>
  );
};

export default App;
