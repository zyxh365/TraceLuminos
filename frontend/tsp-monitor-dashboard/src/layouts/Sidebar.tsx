import React from 'react';
import {
  CloudOutlined,
  ApartmentOutlined,
  SearchOutlined,
  ClusterOutlined,
  AlertOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import type { MenuDataItem } from '@ant-design/pro-layout';

const ICONS: Record<string, React.ReactNode> = {
  CloudOutlined: <CloudOutlined />,
  ApartmentOutlined: <ApartmentOutlined />,
  SearchOutlined: <SearchOutlined />,
  ClusterOutlined: <ClusterOutlined />,
  AlertOutlined: <AlertOutlined />,
  DashboardOutlined: <DashboardOutlined />,
};

const menuData: MenuDataItem[] = [
  { path: '/remote-control', name: '云控链路', icon: ICONS.CloudOutlined },
  { path: '/service-topology', name: '服务拓扑', icon: ICONS.ApartmentOutlined },
  { path: '/trace-search', name: '链路追踪', icon: ICONS.SearchOutlined },
  {
    name: '监控中心',
    icon: ICONS.ClusterOutlined,
    children: [
      { path: '/kafka-monitor', name: 'Kafka 监控', icon: ICONS.ClusterOutlined },
      { path: '/mqtt-monitor', name: 'MQTT 监控', icon: ICONS.ApartmentOutlined },
    ],
  },
  {
    name: '运维管理',
    icon: ICONS.DashboardOutlined,
    children: [
      { path: '/alert-center', name: '告警中心', icon: ICONS.AlertOutlined },
    ],
  },
];

const Sidebar: React.FC<{ collapsed: boolean }> = () => <>{menuData}</>;

export { menuData };
export default Sidebar;
