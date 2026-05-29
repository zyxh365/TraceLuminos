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
