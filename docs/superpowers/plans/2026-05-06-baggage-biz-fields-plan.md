# Baggage 业务字段扩展 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将链路验证页面的 Baggage 设置从 4 个字段扩展到 8 个 `biz.*` 字段，完整覆盖 `tsp_spans` 表的业务维度列。

**Architecture:** 纯前端改动，修改 BaggagePanel 组件（字段定义 + 布局）和 VerifyPage（初始状态 + 引用更新）。Baggage header 透传由后端 OTel Agent 自动处理。

**Tech Stack:** React 18 + JSX

---

### Task 1: 更新 BaggagePanel — 8 字段 + biz.* 命名

**Files:**

- Modify: `frontend/tsp-monitor-web/src/verify/BaggagePanel.jsx`

- [ ] **Step 1: 替换字段定义和布局**

将 `BaggagePanel.jsx` 中的字段列表和 grid 布局替换为以下代码：

```jsx
import { useState } from 'react';

export default function BaggagePanel({ baggage, onApply }) {
  const [fields, setFields] = useState({ ...baggage });
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    const filtered = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v.trim() !== '')
    );
    onApply(filtered);
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  };

  const fieldDefs = [
    { key: 'biz.user_id',     label: 'biz.user_id',     placeholder: '用户ID' },
    { key: 'biz.vin',         label: 'biz.vin',         placeholder: '车辆VIN' },
    { key: 'biz.platform',    label: 'biz.platform',    placeholder: 'h5/android/ios/web/tbox' },
    { key: 'biz.app_version', label: 'biz.app_version', placeholder: 'APP版本号' },
    { key: 'biz.system',      label: 'biz.system',      placeholder: 'NTSP / STSP' },
    { key: 'biz.channel',     label: 'biz.channel',     placeholder: 'chery-app / jetour-app' },
    { key: 'biz.brand',       label: 'biz.brand',       placeholder: 'chery / jetour / icar' },
    { key: 'biz.tenant',      label: 'biz.tenant',      placeholder: '租户标识' },
  ];

  return (
    <div style={{
      background: 'rgba(13,21,32,0.9)',
      border: '1px solid #ff8c4233',
      borderLeft: '3px solid #ff8c42',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff8c42', boxShadow: '0 0 6px #ff8c42' }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#ff8c42', fontWeight: 600 }}>Baggage 设置</span>
          <span style={{ fontSize: 11, color: '#5a7090' }}>— 模拟用户登录后设置业务上下文</span>
        </div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', background: 'rgba(0,0,0,0.3)',
          border: '1px solid #1e3a5f', borderRadius: 4, padding: '4px 10px', maxWidth: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <span style={{ color: '#ff8c4266' }}>baggage: </span>
          <span style={{ color: '#94a8c0' }}>
            {Object.entries(fields).filter(([,v])=>v).map(([k,v])=>`${k}=${v}`).join(', ')}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: 10, alignItems: 'end' }}>
        {fieldDefs.map(({ key, label, placeholder }) => (
          <div key={key}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#5a7090', marginBottom: 4 }}>{label}</div>
            <input value={fields[key] || ''} onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))}
              placeholder={placeholder}
              style={{ width: '100%', padding: '7px 10px', background: 'rgba(0,0,0,0.4)', border: '1px solid #1e3a5f', borderRadius: 5, color: '#e8f0fe', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none' }} />
          </div>
        ))}
        <button onClick={handleApply} style={{
          padding: '7px 20px', background: applied ? 'rgba(0,255,136,0.15)' : 'rgba(255,140,66,0.15)',
          border: `1px solid ${applied ? '#00ff8844' : '#ff8c4244'}`, borderRadius: 5,
          color: applied ? '#00ff88' : '#ff8c42', fontFamily: 'var(--mono)', fontSize: 12,
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
        }}>{applied ? '✓ 已应用' : '应用 Baggage'}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证 BaggagePanel 渲染**

运行 `npm run dev` 确认 8 个字段正常显示为两行 4 列布局。

---

### Task 2: 更新 VerifyPage — 初始状态 + 引用

**Files:**

- Modify: `frontend/tsp-monitor-web/src/pages/VerifyPage.jsx`

- [ ] **Step 1: 更新 baggageState 初始值**

将第 18-20 行的初始状态替换为：

```jsx
  const [baggageState, setBaggageState] = useState({
    'biz.user_id': 'user-001',
    'biz.vin': 'VIN-TEST-001',
    'biz.platform': 'h5',
    'biz.app_version': '1.0.0',
    'biz.system': 'NTSP',
    'biz.channel': 'chery-app',
    'biz.brand': 'chery',
    'biz.tenant': 'tsp-test',
  });
```

- [ ] **Step 2: 修复 baggageState 属性访问**

将 `baggageState.vin` 改为 `baggageState['biz.vin']`：

第 46 行：

```jsx
      const data = await apiFetch('/biz/rest/command', { method: 'POST', body: JSON.stringify({ vin: baggageState['biz.vin'], commandType: 'AC_ON' }) });
```

第 52 行：

```jsx
      const data = await apiFetch('/biz/feign/command', { method: 'POST', body: JSON.stringify({ vin: baggageState['biz.vin'], commandType: 'LOCK' }) });
```

第 75 行（ScenarioPanel body）：

```jsx
          body={'{ "vin": "' + baggageState['biz.vin'] + '", "commandType": "AC_ON" }'}
```

第 83 行（ScenarioPanel body）：

```jsx
          body={'{ "vin": "' + baggageState['biz.vin'] + '", "commandType": "LOCK" }'}
```

- [ ] **Step 3: 更新场景描述文案**

第 76 行，将描述中的旧 key 名称更新：

```jsx
          points={['请求 Header 包含 traceparent + baggage', 'Span Attributes 包含 biz.user_id 等字段', 'traceId 贯穿整条链路']}
```

- [ ] **Step 4: 验证构建**

```bash
cd frontend/tsp-monitor-web && npm run build
```

确认构建成功，无报错。

---

### Task 3: 端到端验证

- [ ] **Step 1: 启动开发服务器**

```bash
cd frontend/tsp-monitor-web && npm run dev
```

- [ ] **Step 2: 手动验证链路验证页面**
1. 打开浏览器访问链路验证 Tab

2. 确认 Baggage 面板显示 8 个字段，分两行排列

3. 修改字段值，点击「应用 Baggage」，确认日志显示正确的 baggage key

4. 点击运行 RestTemplate / OpenFeign 场景，确认请求正常发出
- [ ] **Step 3: Commit**

```bash
git add frontend/tsp-monitor-web/src/verify/BaggagePanel.jsx frontend/tsp-monitor-web/src/pages/VerifyPage.jsx
git commit -m "feat: extend baggage panel with 8 biz fields for complete trace validation

- Add biz.app_version, biz.system, biz.channel, biz.brand fields
- Rename existing fields to biz.* key convention
- Update VerifyPage initialState and references

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
