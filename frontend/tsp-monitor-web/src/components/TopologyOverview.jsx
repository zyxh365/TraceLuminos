import { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchTopology } from '../api/clickhouse.js';

const HEALTH_COLORS = {
  healthy: '#00ff88',
  warning: '#eab308',
  critical: '#ff4d6a',
  none: '#3a4a5f',
};

function getNodeColor(errorRate) {
  if (errorRate == null || errorRate === 0) return HEALTH_COLORS.healthy;
  if (errorRate < 1) return HEALTH_COLORS.healthy;
  if (errorRate < 5) return HEALTH_COLORS.warning;
  return HEALTH_COLORS.critical;
}

function getEdgeColor(errorRate) {
  if (errorRate == null || errorRate === 0) return 'rgba(0,255,136,0.3)';
  if (errorRate < 1) return 'rgba(0,255,136,0.3)';
  if (errorRate < 5) return 'rgba(234,179,8,0.4)';
  return 'rgba(255,77,106,0.5)';
}

function fmtDuration(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
  if (ms >= 1) return ms.toFixed(1) + 'ms';
  return ms.toFixed(0) + 'μs';
}

function buildGraph(data) {
  if (!data || data.length === 0) return { nodes: [], links: [] };

  // 汇总每个节点的调用数和错误数
  const nodeStats = {};
  data.forEach(row => {
    [row.source_service, row.target_service].forEach(svc => {
      if (!svc) return;
      if (!nodeStats[svc]) nodeStats[svc] = { totalCalls: 0, totalErrors: 0 };
    });
    if (row.source_service && row.target_service) {
      nodeStats[row.source_service].totalCalls += row.call_count || 0;
      nodeStats[row.source_service].totalErrors += row.error_count || 0;
    }
  });

  // 找最大调用数，用于节点大小映射
  const maxCalls = Math.max(1, ...Object.values(nodeStats).map(s => s.totalCalls));

  const allServices = [...new Set(data.flatMap(r => [r.source_service, r.target_service]).filter(Boolean))];
  const nodes = allServices.map(svc => {
    const stats = nodeStats[svc] || { totalCalls: 0, totalErrors: 0 };
    const errorRate = stats.totalCalls > 0 ? (stats.totalErrors / stats.totalCalls) * 100 : 0;
    const size = 25 + (stats.totalCalls / maxCalls) * 25;
    return {
      id: svc,
      name: svc,
      symbolSize: size,
      itemStyle: { color: getNodeColor(errorRate), borderColor: getNodeColor(errorRate) + '66', borderWidth: 2 },
      label: {
        show: true,
        color: '#c8d8e8',
        fontSize: 11,
        fontFamily: 'var(--mono)',
        position: 'bottom',
        distance: 8,
      },
      value: { totalCalls: stats.totalCalls, totalErrors: stats.totalErrors, errorRate },
      tooltip: {
        formatter: () => {
          const r = errorRate.toFixed(1);
          return `<div style="font-family:monospace;font-size:12px;color:#c8d8e8">
            <b style="color:#e8f0fe">${svc}</b><br/>
            总调用: <b>${stats.totalCalls.toLocaleString()}</b><br/>
            总错误: <b style="color:${getNodeColor(errorRate)}">${stats.totalErrors.toLocaleString()}</b><br/>
            错误率: <b style="color:${getNodeColor(errorRate)}">${r}%</b>
          </div>`;
        },
      },
    };
  });

  const links = data
    .filter(r => r.source_service && r.target_service)
    .map(row => {
      const errorRate = row.call_count > 0 ? (row.error_count / row.call_count) * 100 : 0;
      return {
        source: row.source_service,
        target: row.target_service,
        value: row.call_count,
        lineStyle: { color: getEdgeColor(errorRate), width: Math.max(1.5, Math.min(4, (row.call_count || 0) / 50)), curveness: 0.15 },
        label: {
          show: true,
          formatter: fmtDuration(row.avg_duration_ms || 0),
          color: '#5a7090',
          fontSize: 10,
          fontFamily: 'var(--mono)',
        },
        tooltip: {
          formatter: () => {
            const r = errorRate.toFixed(1);
            return `<div style="font-family:monospace;font-size:12px;color:#c8d8e8">
              <b>${row.source_service}</b> → <b>${row.target_service}</b><br/>
              协议: ${row.protocol || '-'}<br/>
              调用数: <b>${(row.call_count || 0).toLocaleString()}</b><br/>
              错误数: <b style="color:${getNodeColor(errorRate)}">${(row.error_count || 0).toLocaleString()}</b><br/>
              平均延迟: <b>${fmtDuration(row.avg_duration_ms || 0)}</b><br/>
              P99 延迟: <b>${fmtDuration(row.p99_duration_ms || 0)}</b>
            </div>`;
          },
        },
      };
    });

  return { nodes, links };
}

const CHART_OPTION = {
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item', confine: true, backgroundColor: 'rgba(8,13,20,0.95)', borderColor: '#1e3a5f', borderWidth: 1 },
  animationDuration: 600,
  animationEasingUpdate: 'quadraticIn',
  series: [{
    type: 'graph',
    layout: 'force',
    force: { repulsion: 280, edgeLength: [120, 250], gravity: 0.15 },
    roam: true,
    draggable: true,
    emphasis: {
      focus: 'adjacency',
      lineStyle: { width: 4 },
    },
  }],
};

export default function TopologyOverview({ startTime, endTime, height = 360 }) {
  const [chartOption, setChartOption] = useState(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchTopology(startTime, endTime);
        if (cancelled) return;
        if (!data || data.length === 0) { setEmpty(true); return; }
        const { nodes, links } = buildGraph(data);
        setChartOption({ ...CHART_OPTION, series: [{ ...CHART_OPTION.series[0], data: nodes, links }] });
        setEmpty(false);
      } catch { setEmpty(true); }
    }
    load();
    return () => { cancelled = true; };
  }, [startTime, endTime]);

  if (empty) {
    return (
      <div style={{
        background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f', borderRadius: 8,
        padding: '16px 20px',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)', color: '#e8f0fe', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #1e3a5f' }}>
          服务链路概览
          <span style={{ fontSize: 11, color: '#5a7090', marginLeft: 10, fontWeight: 400 }}>最近 1 小时</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: height - 60, color: '#5a7090', fontFamily: 'var(--mono)', fontSize: 12 }}>
          暂无链路数据
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f', borderRadius: 8,
      padding: '16px 20px',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)', color: '#e8f0fe', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #1e3a5f' }}>
        服务链路概览
        <span style={{ fontSize: 11, color: '#5a7090', marginLeft: 10, fontWeight: 400 }}>最近 1 小时</span>
        <span style={{ float: 'right', display: 'flex', gap: 12, alignItems: 'center' }}>
          {[
            { color: HEALTH_COLORS.healthy, label: '正常 (<1%)' },
            { color: HEALTH_COLORS.warning, label: '警告 (1~5%)' },
            { color: HEALTH_COLORS.critical, label: '异常 (>5%)' },
          ].map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#5a7090', fontFamily: 'var(--mono)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </span>
      </div>
      {chartOption ? (
        <ReactECharts
          option={chartOption}
          style={{ height }}
          opts={{ renderer: 'canvas' }}
          notMerge
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height, color: '#5a7090', fontFamily: 'var(--mono)', fontSize: 12 }}>
          加载中...
        </div>
      )}
    </div>
  );
}
