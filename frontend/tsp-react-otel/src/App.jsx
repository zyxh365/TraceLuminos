import { useState, useCallback } from 'react';
import {
  tracer, setBaggage, getBaggageHeader, getCurrentBaggage,
  applyBaggageToSpan, context, trace
} from './otel.js';
import { SpanStatusCode } from '@opentelemetry/api';
import ScenarioPanel        from './components/ScenarioPanel.jsx';
import TraceLog             from './components/TraceLog.jsx';
import Header               from './components/Header.jsx';
import OtelStatus           from './components/OtelStatus.jsx';
import BaggagePanel         from './components/BaggagePanel.jsx';
import TopologyView         from './components/TopologyView.jsx';
import JavaServiceTopology  from './components/JavaServiceTopology.jsx';
import HuaweiCloudTestTopology from './huaweicloud/HuaweiCloudTestTopology.jsx';
import HuaweiCloudV2         from './huaweicloud/HuaweiCloudV2.jsx';
import HuaweiCloudV3         from './huaweicloud/HuaweiCloudV3.jsx';
import ClickHouseTopology    from './components/ClickHouseTopology.jsx';

async function apiFetch(path, options = {}) {
  const baggageHeader = getBaggageHeader();
  const headers = {
    'Content-Type': 'application/json',
    ...(baggageHeader ? { baggage: baggageHeader } : {}),
    ...options.headers,
  };
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);
  return res.json();
}

const TAB_STYLES = (active) => ({
  padding: '8px 20px', borderRadius: '6px 6px 0 0', cursor: 'pointer',
  fontFamily: 'var(--mono)', fontSize: 13, fontWeight: active ? 600 : 400,
  background: active ? 'rgba(13,21,32,0.9)' : 'transparent',
  border: '1px solid ' + (active ? '#1e3a5f' : 'transparent'),
  borderBottom: active ? '1px solid rgba(13,21,32,0.9)' : '1px solid #1e3a5f',
  color: active ? '#e8f0fe' : '#5a7090',
  marginBottom: -1,
  transition: 'all 0.15s',
});

export default function App() {
  const [activeTab, setActiveTab] = useState('scenarios');
  const [logs,    setLogs]    = useState([]);
  const [running, setRunning] = useState(null);
  const [baggageState, setBaggageState] = useState({
    userId: 'user-001', vin: 'VIN-REACT-001', tenantId: 'tsp-prod', platform: 'h5',
  });

  const addLog = useCallback((entry) => {
    setLogs(prev => [{ id: Date.now() + Math.random(), ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }), ...entry }, ...prev].slice(0, 50));
  }, []);

  const applyBaggage = useCallback((entries) => {
    setBaggage(entries);
    setBaggageState(entries);
    addLog({ scenario: 'Baggage', status: 'success', message: 'Baggage 已设置 → ' + Object.entries(entries).map(([k,v]) => k+'='+v).join(', ') });
  }, [addLog]);

  const runScenario = useCallback(async (scenarioName, fn) => {
    setRunning(scenarioName);
    const span = tracer.startSpan('user.action.' + scenarioName, { attributes: { 'ui.scenario': scenarioName } });
    applyBaggageToSpan(span);
    await context.with(trace.setSpan(context.active(), span), async () => {
      const spanCtx = span.spanContext();
      addLog({ scenario: scenarioName, status: 'sending', message: '发起请求...', traceId: spanCtx.traceId, spanId: spanCtx.spanId, baggageSnapshot: getCurrentBaggage() });
      try {
        const result = await fn(spanCtx);
        span.setStatus({ code: SpanStatusCode.OK });
        addLog({ scenario: scenarioName, status: 'success', message: '调用成功', traceId: spanCtx.traceId, spanId: spanCtx.spanId, baggageSnapshot: getCurrentBaggage(), ...result });
      } catch (e) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
        span.recordException(e);
        addLog({ scenario: scenarioName, status: 'error', message: e.message });
      } finally {
        span.end();
        setRunning(null);
      }
    });
  }, [addLog]);

  const runRestTemplate = useCallback(() =>
    runScenario('RestTemplate', async (spanCtx) => {
      const data = await apiFetch('/biz/rest/command', { method: 'POST', body: JSON.stringify({ vin: baggageState.vin, commandType: 'AC_ON' }) });
      return { service1TraceId: data.service1_traceId, service2TraceId: data.service2_response && data.service2_response.traceId, match: spanCtx.traceId === data.service1_traceId, raw: data };
    }), [runScenario, baggageState]);

  const runFeign = useCallback(() =>
    runScenario('OpenFeign', async (spanCtx) => {
      const data = await apiFetch('/biz/feign/command', { method: 'POST', body: JSON.stringify({ vin: baggageState.vin, commandType: 'LOCK' }) });
      return { service1TraceId: data.service1_traceId, service2TraceId: data.service2_response && data.service2_response.traceId, match: spanCtx.traceId === data.service1_traceId, raw: data };
    }), [runScenario, baggageState]);

  const runTraceCheck = useCallback(() =>
    runScenario('链路检查', async (spanCtx) => {
      const data = await apiFetch('/biz/trace/current');
      return { service1TraceId: data.traceId, match: spanCtx.traceId === data.traceId, raw: data };
    }), [runScenario]);

  const runAsync = useCallback(() =>
    runScenario('异步线程池', async (spanCtx) => {
      const data = await apiFetch('/core/async/verify');
      const asyncA = data['异步任务A_@Async'];
      return { service2TraceId: data['主线程_traceId'], asyncTraceId: asyncA && asyncA.traceId, match: spanCtx.traceId === data['主线程_traceId'], raw: data };
    }), [runScenario]);

  const runBaggageVerify = useCallback(() =>
    runScenario('Baggage验证', async (spanCtx) => {
      const data = await apiFetch('/biz/trace/current');
      return { service1TraceId: data.traceId, match: spanCtx.traceId === data.traceId, raw: Object.assign({}, data, { '发送的baggage_header': getBaggageHeader() }) };
    }), [runScenario]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1, padding: '20px 32px', maxWidth: 1500, margin: '0 auto', width: '100%' }}>
        <OtelStatus />

        {/* Tab 导航 */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e3a5f', marginBottom: 20 }}>
          <button style={TAB_STYLES(activeTab === 'scenarios')} onClick={() => setActiveTab('scenarios')}>
            🔬 验证场景
          </button>
          <button style={TAB_STYLES(activeTab === 'topology')} onClick={() => setActiveTab('topology')}>
            🗺 链路拓扑
          </button>
          <button style={TAB_STYLES(activeTab === 'java-topology')} onClick={() => setActiveTab('java-topology')}>
            🚀 Java服务拓扑
          </button>
          <button style={TAB_STYLES(activeTab === 'huawei-v1')} onClick={() => setActiveTab('huawei-v1')}>
            📦 华为云 V1
          </button>
          <button style={TAB_STYLES(activeTab === 'huawei-v2')} onClick={() => setActiveTab('huawei-v2')}>
            🌲 华为云 V2
          </button>
          <button style={TAB_STYLES(activeTab === 'huawei-v3')} onClick={() => setActiveTab('huawei-v3')}>
            🚀 华为云 V3
          </button>
          <button style={TAB_STYLES(activeTab === 'ch-topology')} onClick={() => setActiveTab('ch-topology')}>
            📊 服务拓扑
          </button>
        </div>

        {/* 验证场景 Tab */}
        <div style={{ display: activeTab === 'scenarios' ? 'block' : 'none' }}>
          <>
            <BaggagePanel baggage={baggageState} onApply={applyBaggage} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              <ScenarioPanel num="01" title="RestTemplate" color="#00ff88" subtitle="service1 → service2，baggage 自动透传" endpoint="POST /biz/rest/command" body={'{ "vin": "' + baggageState.vin + '", "commandType": "AC_ON" }'} points={['请求 Header 包含 traceparent + baggage','Span Attributes 包含 baggage.userId 等字段','traceId 贯穿整条链路']} running={running === 'RestTemplate'} onRun={runRestTemplate} />
              <ScenarioPanel num="02" title="OpenFeign" color="#4da6ff" subtitle="Feign 出站请求自动携带 baggage" endpoint="POST /biz/feign/command" body={'{ "vin": "' + baggageState.vin + '", "commandType": "LOCK" }'} points={['效果和 RestTemplate 完全一致','Agent 对两种客户端插桩相同','baggage 透传到 service2']} running={running === 'OpenFeign'} onRun={runFeign} />
              <ScenarioPanel num="03" title="链路检查" color="#00d4ff" subtitle="验证 traceparent 是否正确传递" endpoint="GET /biz/trace/current" points={['React traceId == service1 traceId','valid=true 说明链路传播正常','baggage Header 被正确接收']} running={running === '链路检查'} onRun={runTraceCheck} />
              <ScenarioPanel num="04" title="异步线程池" color="#b06aff" subtitle="service2 异步线程 traceId 传播" endpoint="GET /core/async/verify" points={['@Async 异步线程 traceId 和主线程一致','spanId 不同（新的子 Span）','Agent 零代码自动传播']} running={running === '异步线程池'} onRun={runAsync} />
              <ScenarioPanel num="05" title="Baggage 验证" color="#ff8c42" subtitle="验证 baggage 写入 Span 上报 Collector" endpoint="GET /biz/trace/current" points={['Collector debug 日志有 baggage.userId','Jaeger Span Tags 里可见 baggage 字段','F12 Network 有 baggage Header']} running={running === 'Baggage验证'} onRun={runBaggageVerify} />
            </div>
            <TraceLog logs={logs} onClear={() => setLogs([])} />
          </>
        </div>

        {/* 链路拓扑 Tab */}
        <div style={{ display: activeTab === 'topology' ? 'block' : 'none' }}><TopologyView /></div>

        {/* Java服务拓扑 Tab */}
        <div style={{ display: activeTab === 'java-topology' ? 'block' : 'none' }}><JavaServiceTopology /></div>

        {/* 华为云 V1 Tab */}
        <div style={{ display: activeTab === 'huawei-v1' ? 'block' : 'none' }}><HuaweiCloudTestTopology /></div>

        {/* 华为云 V2 Tab */}
        <div style={{ display: activeTab === 'huawei-v2' ? 'block' : 'none' }}><HuaweiCloudV2 /></div>

        {/* 华为云 V3 Tab */}
        <div style={{ display: activeTab === 'huawei-v3' ? 'block' : 'none' }}><HuaweiCloudV3 /></div>

        {/* ClickHouse 服务拓扑 Tab */}
        <div style={{ display: activeTab === 'ch-topology' ? 'block' : 'none' }}><ClickHouseTopology /></div>
      </main>
    </div>
  );
}
