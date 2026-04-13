import { useState } from 'react';
import useRemoteControlMetrics from './hooks/useRemoteControlMetrics.js';
import MetricCard from './components/MetricCard.jsx';
import TimeSeriesChart from './components/TimeSeriesChart.jsx';
import GaugeChart from './components/GaugeChart.jsx';
import PieChart from './components/PieChart.jsx';
import AlertBanner from './components/AlertBanner.jsx';
import TimeRangeSelector from './components/TimeRangeSelector.jsx';
import { SUB_TABS, COLORS, ALERT_THRESHOLDS } from './constants.js';

// ============================================================
// 子 Tab 样式
// ============================================================
const subTabStyle = (active) => ({
  padding: '5px 14px',
  borderRadius: '4px 4px 0 0',
  cursor: 'pointer',
  fontFamily: 'var(--mono)',
  fontSize: 12,
  fontWeight: active ? 600 : 400,
  background: active ? 'rgba(77,166,255,0.1)' : 'transparent',
  border: '1px solid ' + (active ? 'rgba(77,166,255,0.3)' : 'transparent'),
  borderBottom: active ? '1px solid rgba(13,21,32,0.9)' : '1px solid rgba(77,166,255,0.3)',
  color: active ? '#4da6ff' : '#5a7090',
  marginBottom: -1,
  transition: 'all 0.15s',
});

// ============================================================
// Section 包装器
// ============================================================
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 14, fontWeight: 600, color: '#e8f0fe', fontFamily: 'var(--mono)',
        marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #1e3a5f',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ============================================================
// 总览 Tab
// ============================================================
function OverviewPanel({ data }) {
  if (!data) return <LoadingState />;
  const { e2e, tspService, tboxService, thirdParty, vehicleConnection } = data;

  return (
    <>
      {/* 告警 */}
      {data.alerts && data.alerts.length > 0 && (
        <Section title="活跃告警">
          <AlertBanner alerts={data.alerts} />
        </Section>
      )}

      {/* 端到端概览 */}
      <Section title="端到端指令概览">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          <MetricCard label="指令总量" value={e2e?.totalCommands} unit="条" />
          <MetricCard label="成功率" value={e2e?.successRate} unit="%" color={e2e?.successRate < 90 ? COLORS.error : COLORS.success} alert={e2e?.successRate < 90} />
          <MetricCard label="平均响应" value={Number(e2e?.avgResponseTimeMs || 0).toFixed(0)} unit="ms" />
          <MetricCard label="P99 响应" value={Number(e2e?.p99ResponseTimeMs || 0).toFixed(0)} unit="ms" color={Number(e2e?.p99ResponseTimeMs || 0) > 1000 ? COLORS.warning : undefined} />
        </div>
        <TimeSeriesChart
          height={180}
          series={[
            { name: '成功', field: 'success', color: COLORS.success },
            { name: '失败', field: 'error', color: COLORS.error },
            { name: '超时', field: 'timeout', color: COLORS.warning },
          ]}
          data={e2e?.timeSeries}
        />
      </Section>

      {/* 服务概览 4 列 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {/* TSP */}
        <div style={{ background: COLORS.bg, border: '1px solid rgba(30,58,95,0.5)', borderRadius: 6, padding: 14 }}>
          <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: 'var(--mono)', marginBottom: 10 }}>TSP 远控服务</div>
          <MetricCard label="MQTT失败" value={tspService?.mqttPublishFailCount} alert={tspService?.mqttPublishFailCount > 0} />
          <MetricCard label="积压数" value={tspService?.pendingBacklogCount} alert={tspService?.pendingBacklogCount > 100} />
          <MetricCard label="Kafka延迟" value={Number(tspService?.kafkaConsumptionDelayMs || 0).toFixed(0)} unit="ms" />
        </div>

        {/* TBox */}
        <div style={{ background: COLORS.bg, border: '1px solid rgba(30,58,95,0.5)', borderRadius: 6, padding: 14 }}>
          <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: 'var(--mono)', marginBottom: 10 }}>TBox 远控服务</div>
          <MetricCard label="鉴权失败" value={tboxService?.authFailCount} alert={tboxService?.authFailCount > 0} />
          <MetricCard label="权限失败" value={tboxService?.permissionFailCount} alert={tboxService?.permissionFailCount > 0} />
          <MetricCard label="处理延迟P99" value={Number(tboxService?.processingDelayP99Ms || 0).toFixed(0)} unit="ms" alert={tboxService?.alertFlags?.p99Exceeded} />
        </div>

        {/* 第三方 */}
        <div style={{ background: COLORS.bg, border: '1px solid rgba(30,58,95,0.5)', borderRadius: 6, padding: 14 }}>
          <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: 'var(--mono)', marginBottom: 10 }}>第三方服务(短信)</div>
          <MetricCard label="短信总量" value={thirdParty?.smsTotalCount} unit="条" />
          <MetricCard label="唤醒成功率" value={thirdParty?.smsWakeupSuccessRate} unit="%" alert={thirdParty?.alertFlags?.successRateLow} />
          <MetricCard label="MNO失败" value={thirdParty?.smsMnoFailCount} alert={thirdParty?.alertFlags?.failCountExceeded} />
        </div>

        {/* 车辆连接 */}
        <div style={{ background: COLORS.bg, border: '1px solid rgba(30,58,95,0.5)', borderRadius: 6, padding: 14 }}>
          <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: 'var(--mono)', marginBottom: 10 }}>车辆连接</div>
          <MetricCard label="在线车辆" value={vehicleConnection?.onlineVehicleCount} unit="辆" color={COLORS.success} />
          <MetricCard label="MQTT连接" value={vehicleConnection?.mqttConnectionCount} unit="个" />
          <MetricCard label="消息丢失率" value={vehicleConnection?.mqttMessageLossRate} unit="%" alert={vehicleConnection?.alertFlags?.lossRateExceeded} />
        </div>
      </div>
    </>
  );
}

// ============================================================
// 端到端 Tab
// ============================================================
function E2EPanel({ data }) {
  if (!data) return <LoadingState />;
  const e2e = data.e2e || {};

  return (
    <>
      <Section title="核心指标">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <GaugeChart title="端到端成功率" value={e2e.successRate || 0} alertThreshold={ALERT_THRESHOLDS.e2eSuccessRate} />
          <GaugeChart title="失败率" value={e2e.failureRate || 0} color={COLORS.error} />
          <GaugeChart title="超时率" value={e2e.timeoutRate || 0} color={COLORS.warning} />
        </div>
      </Section>

      <Section title="指令统计">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 12 }}>
          <MetricCard label="指令总量" value={e2e.totalCommands} unit="条" />
          <MetricCard label="成功数" value={e2e.successCount} unit="条" color={COLORS.success} />
          <MetricCard label="失败数" value={e2e.failureCount} unit="条" color={COLORS.error} />
          <MetricCard label="超时数" value={e2e.timeoutCount} unit="条" color={COLORS.warning} />
          <MetricCard label="平均响应" value={Number(e2e.avgResponseTimeMs || 0).toFixed(0)} unit="ms" />
        </div>
      </Section>

      <Section title="响应延迟趋势 (ms)">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <TimeSeriesChart
            height={240}
            yAxisLabel="ms"
            series={[
              { name: '平均', field: 'avg_duration' },
              { name: 'P99', field: 'p99_duration', color: COLORS.warning },
            ]}
            data={e2e.timeSeries}
            alertLine={{ value: 1000, label: '1s 告警线' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
            <MetricCard label="P50" value={Number(e2e.p95ResponseTimeMs || 0).toFixed(0)} unit="ms" />
            <MetricCard label="P95" value={Number(e2e.p95ResponseTimeMs || 0).toFixed(0)} unit="ms" />
            <MetricCard label="P99" value={Number(e2e.p99ResponseTimeMs || 0).toFixed(0)} unit="ms" alert={Number(e2e.p99ResponseTimeMs || 0) > 1000} />
          </div>
        </div>
      </Section>

      <Section title="失败原因分布">
        <PieChart data={data.tspService?.timeSeries ? [] : []} height={200} />
      </Section>
    </>
  );
}

// ============================================================
// TSP 服务 Tab
// ============================================================
function TspPanel({ data }) {
  if (!data) return <LoadingState />;
  const svc = data.tspService || {};

  return (
    <>
      <Section title="核心指标">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <MetricCard label="MQTT下发失败" value={svc.mqttPublishFailCount} alert={svc.mqttPublishFailCount > 0} />
          <MetricCard label="指令积压数" value={svc.pendingBacklogCount} alert={svc.pendingBacklogCount > 100} />
          <MetricCard label="Kafka消费延迟" value={Number(svc.kafkaConsumptionDelayMs || 0).toFixed(0)} unit="ms" />
          <MetricCard label="指令下发延迟" value={Number(svc.commandDispatchDelayMs || 0).toFixed(0)} unit="ms" />
        </div>
      </Section>

      <Section title="QPS & 延迟趋势">
        <TimeSeriesChart
          height={240}
          yAxisLabel="QPS"
          series={[
            { name: 'QPS', field: 'qps', color: COLORS.success },
            { name: '延迟(ms)', field: 'latency', color: '#00d4ff' },
          ]}
          data={svc.timeSeries}
        />
      </Section>
    </>
  );
}

// ============================================================
// TBox 服务 Tab
// ============================================================
function TBoxPanel({ data }) {
  if (!data) return <LoadingState />;
  const svc = data.tboxService || {};

  return (
    <>
      <Section title="核心指标">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <MetricCard label="指令总量" value={svc.totalCommands} unit="条" />
            <MetricCard label="鉴权失败" value={svc.authFailCount} alert={svc.authFailCount > 0} />
            <MetricCard label="权限失败" value={svc.permissionFailCount} alert={svc.permissionFailCount > 0} />
            <MetricCard label="成功入库" value={svc.dbWriteSuccessCount} unit="条" color={COLORS.success} />
            <MetricCard label="重复发送" value={svc.duplicateSendCount} color={COLORS.warning} />
            <MetricCard label="HTTP错误率" value={Number(svc.httpErrorRate || 0).toFixed(1)} unit="%" />
          </div>
          <GaugeChart
            title="处理延迟 P99"
            value={Number(svc.processingDelayP99Ms || 0).toFixed(0)}
            max={500}
            alertThreshold={ALERT_THRESHOLDS.tboxP99Delay}
          />
        </div>
      </Section>

      <Section title="延迟 & 失败趋势">
        <TimeSeriesChart
          height={240}
          yAxisLabel="ms"
          series={[
            { name: 'P99延迟', field: 'p99_delay', color: COLORS.warning },
            { name: '鉴权失败', field: 'auth_fail', color: COLORS.error },
            { name: '重复发送', field: 'duplicate', color: '#b06aff' },
          ]}
          data={svc.timeSeries}
          alertLine={{ value: 200, label: '200ms 告警线' }}
        />
      </Section>
    </>
  );
}

// ============================================================
// 第三方服务 Tab
// ============================================================
function ThirdPartyPanel({ data }) {
  if (!data) return <LoadingState />;
  const svc = data.thirdParty || {};

  return (
    <>
      <Section title="核心指标">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <MetricCard label="短信发送总量" value={svc.smsTotalCount} unit="条" />
            <MetricCard label="MNO延迟P99" value={Number(svc.smsMnoLatencyP99Ms || 0).toFixed(0)} unit="ms" alert={svc.alertFlags?.p99Exceeded} />
            <MetricCard label="MNO失败次数" value={svc.smsMnoFailCount} alert={svc.alertFlags?.failCountExceeded} />
            <MetricCard label="唤醒超时数" value={svc.smsWakeupTimeoutCount} unit="辆" color={COLORS.warning} />
            <MetricCard label="短信成功" value={svc.smsSuccessCount} unit="条" color={COLORS.success} />
            <MetricCard label="唤醒成功率" value={svc.smsWakeupSuccessRate} unit="%" alert={svc.alertFlags?.successRateLow} />
          </div>
          <GaugeChart
            title="短信唤醒成功率"
            value={svc.smsWakeupSuccessRate || 0}
            alertThreshold={ALERT_THRESHOLDS.smsWakeupSuccessRate}
          />
        </div>
      </Section>

      <Section title="短信趋势">
        <TimeSeriesChart
          height={240}
          series={[
            { name: '发送总量', field: 'sms_total', color: '#4da6ff' },
            { name: '唤醒成功', field: 'wakeup_success', color: COLORS.success },
            { name: '发送失败', field: 'sms_fail', color: COLORS.error },
          ]}
          data={svc.timeSeries}
        />
      </Section>

      <Section title="MNO API 延迟趋势">
        <TimeSeriesChart
          height={180}
          yAxisLabel="ms"
          series={[
            { name: 'MNO延迟', field: 'mno_latency', color: '#00d4ff' },
          ]}
          data={svc.timeSeries}
          alertLine={{ value: 1000, label: '1s 告警线' }}
        />
      </Section>
    </>
  );
}

// ============================================================
// 车辆连接 Tab
// ============================================================
function VehiclePanel({ data }) {
  if (!data) return <LoadingState />;
  const conn = data.vehicleConnection || {};

  return (
    <>
      <Section title="核心指标">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
          <MetricCard label="在线车辆数" value={conn.onlineVehicleCount} unit="辆" color={COLORS.success} />
          <MetricCard label="MQTT连接数" value={conn.mqttConnectionCount} unit="个" />
          <MetricCard label="消息吞吐" value={conn.mqttMessageThroughput} unit="条/min" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <MetricCard label="连接失败率" value={conn.mqttConnectionFailRate} unit="%" alert={conn.mqttConnectionFailRate > 5} />
          <MetricCard label="消息丢失率" value={conn.mqttMessageLossRate} unit="%" alert={conn.alertFlags?.lossRateExceeded} />
          <GaugeChart title="消息丢失率" value={conn.mqttMessageLossRate || 0} alertThreshold={ALERT_THRESHOLDS.mqttMessageLossRate} height={140} />
        </div>
      </Section>

      <Section title="连接趋势">
        <TimeSeriesChart
          height={240}
          series={[
            { name: '在线车辆', field: 'online_vehicles', color: COLORS.success },
            { name: 'MQTT连接', field: 'mqtt_connections', color: '#4da6ff' },
            { name: '吞吐量', field: 'throughput', color: '#00d4ff' },
          ]}
          data={conn.timeSeries}
        />
      </Section>
    </>
  );
}

// ============================================================
// 加载/错误状态
// ============================================================
function LoadingState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: COLORS.muted, fontFamily: 'var(--mono)', fontSize: 13 }}>
      加载中...
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: COLORS.error, fontFamily: 'var(--mono)', fontSize: 13 }}>
      加载失败: {message}
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================
export default function RemoteControlDashboard() {
  const [subTab, setSubTab] = useState('overview');
  const { data, loading, error, timeRange, changeTimeRange } = useRemoteControlMetrics(30000);

  return (
    <div>
      {/* 顶部工具栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <TimeRangeSelector activePreset={timeRange.preset} onChange={changeTimeRange} />
        <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: 'var(--mono)' }}>
          {data ? '数据已加载' : (loading ? '加载中...' : '')}
          {' · 自动刷新 30s'}
        </div>
      </div>

      {/* 子 Tab 导航 */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(77,166,255,0.2)', marginBottom: 16 }}>
        {SUB_TABS.map(tab => (
          <button key={tab.key} style={subTabStyle(subTab === tab.key)} onClick={() => setSubTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      {error && <ErrorState message={error} />}
      {!error && (
        <>
          <div style={{ display: subTab === 'overview' ? 'block' : 'none' }}>
            <OverviewPanel data={data} />
          </div>
          <div style={{ display: subTab === 'e2e' ? 'block' : 'none' }}>
            <E2EPanel data={data} />
          </div>
          <div style={{ display: subTab === 'tsp' ? 'block' : 'none' }}>
            <TspPanel data={data} />
          </div>
          <div style={{ display: subTab === 'tbox' ? 'block' : 'none' }}>
            <TBoxPanel data={data} />
          </div>
          <div style={{ display: subTab === 'third-party' ? 'block' : 'none' }}>
            <ThirdPartyPanel data={data} />
          </div>
          <div style={{ display: subTab === 'vehicle' ? 'block' : 'none' }}>
            <VehiclePanel data={data} />
          </div>
        </>
      )}
    </div>
  );
}
