import { useState, useCallback } from 'react';
import BaggagePanel from '../verify/BaggagePanel.jsx';
import ScenarioPanel from '../verify/ScenarioPanel.jsx';
import TraceLog from '../verify/TraceLog.jsx';

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);
  return res.json();
}

export default function VerifyPage() {
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(null);
  const [baggageState, setBaggageState] = useState({
    userId: 'user-001', vin: 'VIN-TEST-001', tenantId: 'tsp-test', platform: 'h5',
  });

  const addLog = useCallback((entry) => {
    setLogs(prev => [{ id: Date.now() + Math.random(), ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }), ...entry }, ...prev].slice(0, 50));
  }, []);

  const applyBaggage = useCallback((entries) => {
    setBaggageState(entries);
    addLog({ scenario: 'Baggage', status: 'success', message: 'Baggage 已设置 → ' + Object.entries(entries).map(([k, v]) => k + '=' + v).join(', ') });
  }, [addLog]);

  const runScenario = useCallback(async (scenarioName, fn) => {
    setRunning(scenarioName);
    addLog({ scenario: scenarioName, status: 'sending', message: '发起请求...' });
    try {
      const result = await fn();
      addLog({ scenario: scenarioName, status: 'success', message: '调用成功', ...result });
    } catch (e) {
      addLog({ scenario: scenarioName, status: 'error', message: e.message });
    } finally {
      setRunning(null);
    }
  }, [addLog]);

  const runRestTemplate = useCallback(() =>
    runScenario('RestTemplate', async () => {
      const data = await apiFetch('/biz/rest/command', { method: 'POST', body: JSON.stringify({ vin: baggageState.vin, commandType: 'AC_ON' }) });
      return { raw: data };
    }), [runScenario, baggageState]);

  const runFeign = useCallback(() =>
    runScenario('OpenFeign', async () => {
      const data = await apiFetch('/biz/feign/command', { method: 'POST', body: JSON.stringify({ vin: baggageState.vin, commandType: 'LOCK' }) });
      return { raw: data };
    }), [runScenario, baggageState]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{
        fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)',
        color: '#e8f0fe', paddingBottom: 8, borderBottom: '1px solid #1e3a5f',
      }}>
        链路验证场景
        <span style={{ fontSize: 11, color: '#5a7090', marginLeft: 10, fontWeight: 400 }}>
          验证 OTel 链路传播、Baggage 透传、异步线程上下文
        </span>
      </div>

      <BaggagePanel baggage={baggageState} onApply={applyBaggage} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
        <ScenarioPanel
          num="01" title="RestTemplate" color="#00ff88"
          subtitle="service1 → service2，baggage 自动透传"
          endpoint="POST /biz/rest/command"
          body={'{ "vin": "' + baggageState.vin + '", "commandType": "AC_ON" }'}
          points={['请求 Header 包含 traceparent + baggage', 'Span Attributes 包含 baggage.userId 等字段', 'traceId 贯穿整条链路']}
          running={running === 'RestTemplate'} onRun={runRestTemplate}
        />
        <ScenarioPanel
          num="02" title="OpenFeign" color="#4da6ff"
          subtitle="Feign 出站请求自动携带 baggage"
          endpoint="POST /biz/feign/command"
          body={'{ "vin": "' + baggageState.vin + '", "commandType": "LOCK" }'}
          points={['效果和 RestTemplate 完全一致', 'Agent 对两种客户端插桩相同', 'baggage 透传到 service2']}
          running={running === 'OpenFeign'} onRun={runFeign}
        />
      </div>

      <TraceLog logs={logs} onClear={() => setLogs([])} />
    </div>
  );
}
