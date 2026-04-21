import { useRef, useEffect } from 'react';
import * as echarts from 'echarts/core';
import { GaugeChart as EChartsGaugeChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { COLORS } from '../constants.js';

echarts.use([EChartsGaugeChart, TooltipComponent, CanvasRenderer]);

/**
 * ECharts 仪表盘（用于成功率、在线率等）
 * @param {{ title: string, value: number, max?: number, color?: string, alertThreshold?: number, height?: number }} props
 */
export default function GaugeChart({ title, value, max = 100, color, alertThreshold, height = 180 }) {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);

  const gaugeColor = alertThreshold != null && value < alertThreshold
    ? COLORS.error
    : (color || COLORS.success);

  useEffect(() => {
    if (!chartRef.current || chartRef.current.clientWidth === 0) return;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current);
    }
    const instance = instanceRef.current;

    const option = {
      backgroundColor: 'transparent',
      series: [{
        type: 'gauge',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max,
        splitNumber: 5,
        radius: '90%',
        center: ['50%', '60%'],
        axisLine: {
          lineStyle: {
            width: 10,
            color: [
              [value / max, gaugeColor],
              [1, 'rgba(30,58,95,0.3)'],
            ],
          },
        },
        pointer: {
          show: true,
          length: '55%',
          width: 3,
          itemStyle: { color: gaugeColor },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: {
          valueAnimation: true,
          fontSize: 22,
          fontWeight: 700,
          fontFamily: 'var(--mono)',
          color: gaugeColor,
          offsetCenter: [0, '30%'],
          formatter: v => max === 100 ? v.toFixed(1) + '%' : v.toLocaleString('zh-CN'),
        },
        data: [{ value }],
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
  }, [value, max, gaugeColor]);

  return (
    <div style={{ textAlign: 'center' }}>
      {title && <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: 'var(--mono)', marginBottom: 4 }}>{title}</div>}
      <div ref={chartRef} style={{ width: '100%', height }} />
    </div>
  );
}
