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
