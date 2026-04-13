import { useRef, useEffect } from 'react';
import * as echarts from 'echarts/core';
import { PieChart as EChartsPieChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { CHART_THEME, COLORS } from '../constants.js';

echarts.use([EChartsPieChart, TooltipComponent, LegendComponent, CanvasRenderer]);

/**
 * ECharts 饼图（用于失败原因分布）
 * @param {{ title?: string, data: Array<{name: string, value: number, percentage?: number}>, height?: number }} props
 */
export default function PieChart({ title, data, height = 220 }) {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !data || data.length === 0) return;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current);
    }
    const instance = instanceRef.current;

    const option = {
      backgroundColor: 'transparent',
      title: title ? { text: title, textStyle: { color: CHART_THEME.textColor, fontSize: 13, fontFamily: 'var(--mono)' }, left: 0 } : undefined,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(13,21,32,0.95)',
        borderColor: CHART_THEME.axisLineColor,
        textStyle: { color: CHART_THEME.textColor, fontSize: 12, fontFamily: 'var(--mono)' },
        formatter: p => `${p.name}: ${p.value} (${p.percent}%)`,
      },
      legend: {
        orient: 'vertical',
        right: 8,
        top: 'center',
        textStyle: { color: CHART_THEME.textColor, fontSize: 11, fontFamily: 'var(--mono)' },
        itemWidth: 10,
        itemHeight: 10,
        formatter: name => {
          const item = data.find(d => d.error_type === name || d.name === name);
          if (!item) return name;
          const val = item.count ?? item.value ?? 0;
          const pct = item.percentage ? item.percentage.toFixed(1) + '%' : '';
          return `${name}  ${val}  ${pct}`;
        },
      },
      color: CHART_THEME.colors,
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '55%'],
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 12, fontWeight: 600, color: '#e8f0fe', fontFamily: 'var(--mono)' },
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' },
        },
        data: data.map((d, i) => ({
          name: d.error_type || d.name || `未知${i}`,
          value: d.count ?? d.value ?? 0,
        })),
      }],
    };

    instance.setOption(option, true);

    const onResize = () => instance.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      instance.dispose();
      instanceRef.current = null;
    };
  }, [data, title, height]);

  if (!data || data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: height || 220, color: COLORS.muted, fontFamily: 'var(--mono)', fontSize: 13 }}>
        暂无数据
      </div>
    );
  }

  return <div ref={chartRef} style={{ width: '100%', height: height || 220 }} />;
}
