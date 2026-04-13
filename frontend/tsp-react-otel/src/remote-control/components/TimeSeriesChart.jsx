import { useRef, useEffect } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { CHART_THEME } from '../constants.js';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

/**
 * ECharts 时序折线图
 * @param {{ title?: string, data: Array<{timestamp: number, ...rest}>, series: Array<{name: string, field: string, color?: string}>, yAxisLabel?: string, height?: number, alertLine?: {value: number, label: string} }} props
 */
export default function TimeSeriesChart({ title, data, series, yAxisLabel = '', height = 220, alertLine }) {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current);
    }

    const instance = instanceRef.current;
    const times = (data || []).map(d => new Date(d.timestamp).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' }));

    const option = {
      backgroundColor: 'transparent',
      title: title ? { text: title, textStyle: { color: CHART_THEME.textColor, fontSize: 13, fontFamily: 'var(--mono)' }, left: 0, top: 0 } : undefined,
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(13,21,32,0.95)',
        borderColor: CHART_THEME.axisLineColor,
        textStyle: { color: CHART_THEME.textColor, fontSize: 12, fontFamily: 'var(--mono)' },
      },
      legend: series.length > 1 ? {
        data: series.map(s => s.name),
        textStyle: { color: CHART_THEME.textColor, fontSize: 11 },
        top: title ? 22 : 0,
        right: 0,
        itemWidth: 14,
        itemHeight: 2,
      } : undefined,
      grid: { top: (title ? 40 : 10) + (series.length > 1 ? 20 : 0), right: 16, bottom: 28, left: 56 },
      xAxis: {
        type: 'category',
        data: times,
        axisLine: { lineStyle: { color: CHART_THEME.axisLineColor } },
        axisLabel: { color: CHART_THEME.textColor, fontSize: 10, fontFamily: 'var(--mono)', interval: 'auto', rotate: 0 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        name: yAxisLabel,
        nameTextStyle: { color: CHART_THEME.textColor, fontSize: 10 },
        axisLine: { show: false },
        axisLabel: { color: CHART_THEME.textColor, fontSize: 10, fontFamily: 'var(--mono)' },
        splitLine: { lineStyle: { color: CHART_THEME.splitLineColor } },
      },
      series: series.map((s, i) => ({
        name: s.name,
        type: 'line',
        data: (data || []).map(d => d[s.field] != null ? Number(d[s.field]) : null),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: s.color || CHART_THEME.colors[i % CHART_THEME.colors.length] },
        itemStyle: { color: s.color || CHART_THEME.colors[i % CHART_THEME.colors.length] },
        areaStyle: { color: echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: (s.color || CHART_THEME.colors[i % CHART_THEME.colors.length]) + '30' },
          { offset: 1, color: (s.color || CHART_THEME.colors[i % CHART_THEME.colors.length]) + '05' },
        ]) },
        markLine: alertLine ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#ff4d6a', type: 'dashed', width: 1 },
          data: [{ yAxis: alertLine.value, label: { formatter: alertLine.label, color: '#ff4d6a', fontSize: 10, fontFamily: 'var(--mono)' } }],
        } : undefined,
      })),
    };

    instance.setOption(option, true);

    const onResize = () => instance.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      instance.dispose();
      instanceRef.current = null;
    };
  }, [data, series, title, yAxisLabel, height, alertLine]);

  return <div ref={chartRef} style={{ width: '100%', height }} />;
}
