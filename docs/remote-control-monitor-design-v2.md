# TSP 远控链路监控 - 问题诊断与定位（事后分析版）

## 📋 核心定位
**目标**：当远控指令失败或超时时，通过traceId/VIN快速定位问题环节，给出根因分析。

---

## 1. 整体交互流程

```
问题发生 → 用户查询 → 智能诊断 → 问题定位 → 根因分析 → 解决建议
   │           │          │          │          │          │
   ▼           ▼          ▼          ▼          ▼          ▼
 告警/   输入TraceId   自动识别   高亮异常   给出原因   操作建议
投诉      或VIN        异常节点    环节       判断       一键重试
```

---

## 2. 主页面设计（聚焦问题诊断）

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🔍 远控链路问题诊断                                   [记录] [帮助]     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  问题查询                                                          │  │
│  │  ────────────────────────────────────────────────────────────────│  │
│  │                                                                   │  │
│  │  TraceId: [tx1234567890abcdef________________] [📋粘贴] [查询]   │  │
│  │  或                                                               │  │
│  │  VIN:     [LSAAAE12345678901_______________] [📋粘贴] [查询]   │  │
│  │                                                                   │  │
│  │  快速入口: [今日失败] [本周超时] [我的收藏] [常见问题]            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ══════════════════════════════════════════════════════════════════════  │
│                                                                          │
│  🎯 问题诊断结果                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                                                                   │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  🔴 问题定位：TBox 唤醒超时                                   │  │  │
│  │  │  ──────────────────────────────────────────────────────────│  │  │
│  │  │                                                             │  │  │
│  │  │  📊 链路状态：❌ 失败                                       │  │  │
│  │  │  📍 失败环节：TBox 唤醒阶段（第4步/共6步）                   │  │  │
│  │  │  ⏱️ 总耗时：32.5秒  (超时22.5秒)                            │  │  │
│  │  │                                                             │  │  │
│  │  │  链路流程图：                                                │  │  │
│  │  │  ✅ APP(0.2s) → ✅ TSP平台(0.3s) → ✅ 检查在线(0.1s)         │  │  │
│  │  │  → ✅ 发送短信(0.5s) → 🔴 TBox唤醒超时(30s) → ⏸️ 未执行      │  │  │
│  │  │                                                             │  │  │
│  │  │  ⚠️ 问题严重程度：高 (影响用户：1人，重复失败：第2次)         │  │  │
│  │  │                                                             │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                   │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  🔍 根因分析                                                │  │  │
│  │  │  ──────────────────────────────────────────────────────────│  │  │
│  │  │                                                             │  │  │
│  │  │  可能原因（按概率排序）：                                    │  │  │
│  │  │  ┌──────────────────────────────────────────────────────┐  │  │  │
│  │  │  │ 1. 📱 车辆无信号/信号弱         ████████████  75%    │  │  │  │
│  │  │  │    证据：短信网关返回成功，但TBox未响应                │  │  │  │
│  │  │  │    查询：车辆最后已知位置为地下停车场                  │  │  │  │
│  │  │  │                                                      │  │  │  │
│  │  │  │ 2. 🔋 TBox电量不足/休眠        ████░░░░░░░░░  20%    │  │  │  │
│  │  │  │    证据：TBox离线时长超过48小时                       │  │  │  │
│  │  │  │                                                      │  │  │  │
│  │  │  │ 3. 📨 短信网关延迟            ███░░░░░░░░░░  15%    │  │  │  │
│  │  │  │    证据：该时段短信网关响应时间P99=8秒（平时<2秒）    │  │  │  │
│  │  │  │                                                      │  │  │  │
│  │  │  │ 4. 🚗 TBox硬件故障            ██░░░░░░░░░░░   5%    │  │  │  │
│  │  │  │    证据：该车过去30天无此问题                        │  │  │  │
│  │  │  └──────────────────────────────────────────────────────┘  │  │  │
│  │  │                                                             │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                   │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  💡 解决建议                                                │  │  │
│  │  │  ──────────────────────────────────────────────────────────│  │  │
│  │  │                                                             │  │  │
│  │  │  立即操作：                                                  │  │  │
│  │  │  ┌──────────────────────────────────────────────────────┐  │  │  │
│  │  │  │ [📞 联系车主]  确认车辆位置和电源状态                 │  │  │  │
│  │  │  │ [🔁 重新唤醒]  再次发送远控指令                      │  │  │  │
│  │  │  │ [📋 查看日志]  查看TSP平台日志                       │  │  │  │
│  │  │  │ [📤 导出报告]  生成问题分析报告                       │  │  │  │
│  │  │  └──────────────────────────────────────────────────────┘  │  │  │
│  │  │                                                             │  │  │
│  │  │  后续跟进：                                                  │  │  │
│  │  │  • 如果车辆在信号盲区，建议等待车主移动到有信号区域        │  │  │
│  │  │  • 如果问题重复出现，建议创建工单安排技术人员检查          │  │  │
│  │  │  • 已自动添加到监控列表，下次自动提醒                      │  │  │
│  │  │                                                             │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ══════════════════════════════════════════════════════════════════════  │
│                                                                          │
│  📊 详细数据（点击展开）                                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  [链路时序] [Span详情] [原始日志] [历史记录] [相似案例]           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心功能设计

### 3.1 智能问题诊断引擎

```javascript
/**
 * 问题诊断引擎
 * 输入：traceId 或 vin
 * 输出：问题定位 + 根因分析 + 解决建议
 */
class ProblemDiagnosisEngine {

  /**
   * 诊断主流程
   */
  async diagnose(traceId, vin) {
    // 1. 获取链路数据
    const traceData = await this.getTraceData(traceId, vin);

    // 2. 检测异常
    const anomalies = this.detectAnomalies(traceData);

    // 3. 问题定位
    const problemLocation = this.locateProblem(traceData, anomalies);

    // 4. 根因分析
    const rootCauses = await this.analyzeRootCauses(traceData, problemLocation);

    // 5. 生成建议
    const suggestions = this.generateSuggestions(rootCauses, traceData);

    return {
      problemLocation,
      rootCauses,
      suggestions,
      traceData
    };
  }

  /**
   * 异常检测
   */
  detectAnomalies(traceData) {
    const anomalies = [];

    // 检查1：超时检测
    traceData.spans.forEach(span => {
      if (span.duration > this.getThreshold(span.operationName)) {
        anomalies.push({
          type: 'TIMEOUT',
          span: span,
          severity: this.calculateSeverity(span.duration),
          message: `${span.operationName} 耗时 ${this.formatDuration(span.duration)}`
        });
      }
    });

    // 检查2：错误检测
    traceData.spans.forEach(span => {
      if (span.status === 'ERROR' || span.hasError) {
        anomalies.push({
          type: 'ERROR',
          span: span,
          severity: 'HIGH',
          message: `${span.operationName} 执行失败`
        });
      }
    });

    // 检查3：链路中断检测
    const expectedSteps = ['APP', 'TSP平台', 'TBox'];
    const actualSteps = traceData.spans.map(s => s.serviceName);
    const missingSteps = expectedSteps.filter(s => !actualSteps.includes(s));

    if (missingSteps.length > 0) {
      anomalies.push({
        type: 'LINK_BROKEN',
        severity: 'HIGH',
        message: `链路缺失环节: ${missingSteps.join(', ')}`
      });
    }

    // 检查4：TBox状态异常
    const tboxStatus = this.getTBoxStatus(traceData);
    if (tboxStatus === 'OFFLINE' && !this.findWakeUpSMS(traceData)) {
      anomalies.push({
        type: 'TBOX_OFFLINE_NO_SMS',
        severity: 'MEDIUM',
        message: 'TBox离线但未发送唤醒短信'
      });
    }

    return anomalies;
  }

  /**
   * 问题定位
   */
  locateProblem(traceData, anomalies) {
    // 找到第一个严重异常
    const criticalAnomaly = anomalies.find(a => a.severity === 'HIGH')
      || anomalies.find(a => a.severity === 'MEDIUM')
      || anomalies[0];

    if (!criticalAnomaly) {
      return {
        hasProblem: false,
        message: '未发现异常'
      };
    }

    // 定位到具体环节
    const stepIndex = this.getStepIndex(traceData, criticalAnomaly.span);
    const totalSteps = this.getTotalSteps(traceData);

    return {
      hasProblem: true,
      problemType: criticalAnomaly.type,
      message: criticalAnomaly.message,
      stepIndex,
      totalSteps,
      stepName: this.getStepName(traceData, stepIndex),
      spanId: criticalAnomaly.span.spanId
    };
  }

  /**
   * 根因分析
   */
  async analyzeRootCauses(traceData, problemLocation) {
    const causes = [];

    // 根据问题类型分析
    switch (problemLocation.problemType) {
      case 'TIMEOUT':
        causes.push(...await this.analyzeTimeout(traceData, problemLocation));
        break;
      case 'ERROR':
        causes.push(...await this.analyzeError(traceData, problemLocation));
        break;
      case 'LINK_BROKEN':
        causes.push(...await this.analyzeLinkBroken(traceData, problemLocation));
        break;
      case 'TBOX_OFFLINE_NO_SMS':
        causes.push(...await this.analyzeTBoxOffline(traceData, problemLocation));
        break;
    }

    // 计算每个原因的概率
    return this.calculateProbabilities(causes, traceData);
  }

  /**
   * 分析超时问题
   */
  async analyzeTimeout(traceData, problemLocation) {
    const causes = [];
    const timeoutSpan = this.findSpanById(traceData, problemLocation.spanId);

    // 原因1：网络延迟
    if (timeoutSpan.operationName === 'TBox唤醒' || timeoutSpan.operationName === 'TBox登录') {
      const networkLatency = await this.getNetworkLatency(traceData.vin);
      if (networkLatency > 5000) {
        causes.push({
          reason: '车辆无信号/信号弱',
          probability: 0.75,
          evidence: [`网络延迟: ${networkLatency}ms`, '短信网关返回成功但TBox未响应'],
          suggestion: '联系车主确认车辆位置'
        });
      }
    }

    // 原因2：TBox电量不足
    const offlineDuration = await this.getOfflineDuration(traceData.vin);
    if (offlineDuration > 48 * 3600 * 1000) { // 48小时
      causes.push({
        reason: 'TBox电量不足/深度休眠',
        probability: 0.20,
        evidence: [`TBox离线时长: ${this.formatDuration(offlineDuration)}`],
        suggestion: '等待车主启动车辆或联系车主'
      });
    }

    // 原因3：系统负载
    const systemLoad = await this.getSystemLoad();
    if (systemLoad > 0.8) {
      causes.push({
        reason: 'TSP平台负载过高',
        probability: 0.15,
        evidence: [`系统负载: ${(systemLoad * 100).toFixed(1)}%`],
        suggestion: '等待系统负载降低后重试'
      });
    }

    return causes;
  }

  /**
   * 分析错误问题
   */
  async analyzeError(traceData, problemLocation) {
    const causes = [];
    const errorSpan = this.findSpanById(traceData, problemLocation.spanId);

    // 根据错误码分析
    const errorCode = errorSpan.attributes?.['error.code'];
    const errorMessage = errorSpan.attributes?.['error.message'];

    if (errorCode === 'TBOX_AUTH_FAILED') {
      causes.push({
        reason: 'TBox认证失败',
        probability: 0.9,
        evidence: [`错误码: ${errorCode}`, `错误信息: ${errorMessage}`],
        suggestion: '检查TBox证书是否过期或配置错误'
      });
    } else if (errorCode === 'TBOX_NOT_RESPONDING') {
      causes.push({
        reason: 'TBox无响应',
        probability: 0.8,
        evidence: [`错误码: ${errorCode}`],
        suggestion: '尝试发送唤醒短信'
      });
    } else if (errorCode === 'COMMAND_NOT_SUPPORTED') {
      causes.push({
        reason: 'TBox不支持该指令',
        probability: 1.0,
        evidence: [`错误码: ${errorCode}`],
        suggestion: '检查TBox固件版本或指令配置'
      });
    }

    return causes;
  }

  /**
   * 分析链路中断
   */
  async analyzeLinkBroken(traceData, problemLocation) {
    const causes = [];

    // 检查traceId关联
    const linkType = traceData.linkType;
    if (!linkType || linkType === 'BROKEN') {
      causes.push({
        reason: 'traceId关联失败',
        probability: 0.7,
        evidence: ['TBox登录后未关联到原始traceId'],
        suggestion: '检查seqNo关联逻辑，或通过VIN查询完整链路'
      });
    }

    return causes;
  }

  /**
   * 计算原因概率
   */
  calculateProbabilities(causes, traceData) {
    // 基于历史数据调整概率
    const history = await this.getHistoryData(traceData.vin);

    causes.forEach(cause => {
      // 如果该车历史上有类似问题，提高概率
      const similarHistory = history.filter(h =>
        h.reason === cause.reason && h.daysAgo < 30
      );
      if (similarHistory.length > 0) {
        cause.probability = Math.min(0.95, cause.probability + 0.1);
        cause.historyCount = similarHistory.length;
      }
    });

    // 归一化概率
    const totalProb = causes.reduce((sum, c) => sum + c.probability, 0);
    causes.forEach(cause => {
      cause.probability = (cause.probability / totalProb * 100).toFixed(1);
    });

    // 按概率排序
    return causes.sort((a, b) => b.probability - a.probability);
  }

  /**
   * 生成解决建议
   */
  generateSuggestions(rootCauses, traceData) {
    const suggestions = {
      immediate: [],  // 立即操作
      followUp: [],   // 后续跟进
      prevention: []  // 预防措施
    };

    rootCauses.forEach(cause => {
      // 立即操作
      if (cause.reason.includes('信号')) {
        suggestions.immediate.push({
          action: '联系车主',
          description: '确认车辆位置和电源状态',
          priority: 'HIGH'
        });
      }

      if (cause.reason.includes('电量') || cause.reason.includes('休眠')) {
        suggestions.immediate.push({
          action: '重新唤醒',
          description: '再次发送远控指令',
          priority: 'MEDIUM'
        });
      }

      // 后续跟进
      if (cause.historyCount > 2) {
        suggestions.followUp.push({
          action: '创建工单',
          description: `该车30天内发生${cause.historyCount}次类似问题，建议技术检查`,
          priority: 'HIGH'
        });
      }

      // 预防措施
      suggestions.prevention.push({
        action: '添加监控',
        description: '已自动添加到监控列表，下次自动提醒',
        priority: 'LOW'
      });
    });

    return suggestions;
  }
}
```

### 3.2 简化的链路流程图

```javascript
/**
 * 简化的链路流程图组件
 * 聚焦问题展示，而非完整时序
 */
function SimpleTraceFlowChart({ traceData, problemLocation }) {
  const steps = [
    { name: 'APP', icon: '📱', status: getStepStatus(traceData, 'APP') },
    { name: 'TSP平台', icon: '🖥️', status: getStepStatus(traceData, 'TSP') },
    { name: '检查在线', icon: '🔍', status: getStepStatus(traceData, 'CHECK') },
    { name: '发送短信', icon: '📨', status: getStepStatus(traceData, 'SMS') },
    { name: 'TBox唤醒', icon: '🚗', status: getStepStatus(traceData, 'TBOX_WAKE') },
    { name: '执行指令', icon: '✅', status: getStepStatus(traceData, 'EXECUTE') }
  ];

  return (
    <div className="trace-flow-chart">
      {steps.map((step, index) => (
        <React.Fragment key={step.name}>
          <div className={`step ${step.status} ${isProblemStep(step, problemLocation) ? 'problem' : ''}`}>
            <span className="step-icon">{step.icon}</span>
            <span className="step-name">{step.name}</span>
            {getStepDuration(traceData, step) && (
              <span className="step-duration">
                {formatDuration(getStepDuration(traceData, step))}
              </span>
            )}
            {step.status === 'FAILED' && (
              <span className="step-error">❌</span>
            )}
          </div>
          {index < steps.length - 1 && (
            <div className="arrow">→</div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
```

### 3.3 快速查询入口

```javascript
/**
 * 快速查询入口
 */
function QuickSearch() {
  const quickQueries = [
    { label: '今日失败', query: { status: 'FAILED', date: 'today' }, count: 23 },
    { label: '本周超时', query: { type: 'TIMEOUT', date: 'week' }, count: 45 },
    { label: '重复失败', query: { retry: '>2' }, count: 8 },
    { label: '我的收藏', query: { favorite: true }, count: 12 }
  ];

  return (
    <div className="quick-search">
      {quickQueries.map(q => (
        <button
          key={q.label}
          className="quick-search-btn"
          onClick={() => handleQuickQuery(q.query)}
        >
          <span>{q.label}</span>
          <span className="count">{q.count}</span>
        </button>
      ))}
    </div>
  );
}
```

---

## 4. 问题诊断规则库

```javascript
/**
 * 问题诊断规则库
 */
const DIAGNOSIS_RULES = {
  // TBox离线问题
  TBOX_OFFLINE: {
    patterns: [
      { attr: 'tbox.status', value: 'OFFLINE' }
    ],
    causes: [
      {
        reason: '车辆在信号盲区',
        probability: 0.6,
        evidence: ['短信发送成功', 'TBox长时间未响应'],
        check: ['车辆位置', '信号覆盖'],
        solution: '联系车主确认车辆位置'
      },
      {
        reason: 'TBox电量不足',
        probability: 0.3,
        evidence: ['离线时长>48小时'],
        check: ['TBox电压'],
        solution: '等待车主启动车辆'
      },
      {
        reason: 'TBox硬件故障',
        probability: 0.1,
        evidence: ['多次唤醒失败'],
        check: ['TBox诊断'],
        solution: '安排技术检查'
      }
    ]
  },

  // 超时问题
  TIMEOUT: {
    patterns: [
      { attr: 'duration', operator: '>', value: 30000 }
    ],
    causes: [
      {
        reason: '网络延迟',
        probability: 0.5,
        check: ['网络质量'],
        solution: '检查网络连接'
      },
      {
        reason: '系统负载',
        probability: 0.3,
        check: ['TSP负载', '并发数'],
        solution: '等待系统空闲后重试'
      },
      {
        reason: 'TBox响应慢',
        probability: 0.2,
        check: ['TBox性能'],
        solution: '检查TBox状态'
      }
    ]
  },

  // 认证失败
  AUTH_FAILED: {
    patterns: [
      { attr: 'error.code', value: 'TBOX_AUTH_FAILED' }
    ],
    causes: [
      {
        reason: '证书过期',
        probability: 0.8,
        check: ['证书有效期'],
        solution: '更新TBox证书'
      },
      {
        reason: '密钥配置错误',
        probability: 0.2,
        check: ['配置文件'],
        solution: '检查认证配置'
      }
    ]
  },

  // 指令不支持
  COMMAND_NOT_SUPPORTED: {
    patterns: [
      { attr: 'error.code', value: 'COMMAND_NOT_SUPPORTED' }
    ],
    causes: [
      {
        reason: 'TBox固件版本过低',
        probability: 0.7,
        check: ['固件版本'],
        solution: '升级TBox固件'
      },
      {
        reason: '指令配置错误',
        probability: 0.3,
        check: ['指令配置'],
        solution: '检查指令白名单配置'
      }
    ]
  }
};
```

---

## 5. 历史记录与相似案例

```javascript
/**
 * 相似案例推荐
 */
function SimilarCases({ vin, problemType }) {
  const [cases, setCases] = useState([]);

  useEffect(() => {
    // 查询相似案例
    fetchSimilarCases(vin, problemType).then(setCases);
  }, [vin, problemType]);

  return (
    <div className="similar-cases">
      <h3>相似案例</h3>
      {cases.map(case => (
        <div key={case.id} className="case-card">
          <div className="case-header">
            <span className="case-date">{case.date}</span>
            <span className="case-vin">{case.vin}</span>
          </div>
          <div className="case-problem">{case.problem}</div>
          <div className="case-solution">
            <strong>解决方案：</strong>
            {case.solution}
          </div>
          {case.resolved && (
            <div className="case-resolved">✅ 已解决</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 6. 问题报告导出

```javascript
/**
 * 导出问题分析报告
 */
function exportProblemReport(diagnosisResult) {
  const report = {
    title: '远控链路问题分析报告',
    timestamp: new Date().toISOString(),
    summary: {
      traceId: diagnosisResult.traceId,
      vin: diagnosisResult.vin,
      problemType: diagnosisResult.problemLocation.problemType,
      problemMessage: diagnosisResult.problemLocation.message
    },
    problemAnalysis: {
      location: diagnosisResult.problemLocation,
      rootCauses: diagnosisResult.rootCauses
    },
    suggestions: diagnosisResult.suggestions,
    rawData: diagnosisResult.traceData
  };

  // 生成PDF或导出Word
  generatePDF(report);
}
```

---

## 7. 关键交互设计

### 7.1 一键诊断

```
用户输入 → [诊断] → 3秒内返回结果
         ↓
    ┌─────────┐
    │ 诊断中  │ ← 显示进度
    │ ⏳     │
    └─────────┘
         ↓
    ┌─────────┐
    │ ✅ 完成 │ ← 高亮显示问题
    └─────────┘
```

### 7.2 问题高亮规则

```css
/* 问题环节高亮 */
.problem-step {
  background: #fee2e2;
  border: 2px solid #ef4444;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* 成功环节 */
.success-step {
  background: #d1fae5;
  border: 1px solid #22c55e;
}

/* 未执行环节 */
.pending-step {
  background: #f3f4f6;
  border: 1px dashed #9ca3af;
  color: #9ca3af;
}
```

---

## 8. 核心简化点

| 原设计 | 新设计 | 改进点 |
|-------|-------|--------|
| 实时监控WebSocket | 事后查询分析 | 聚焦核心场景 |
| 复杂的可视化 | 简化的流程图 | 快速定位问题 |
| 数据展示为主 | 智能诊断为主 | 自动分析根因 |
| 需要人工分析 | 自动给出建议 | 提高效率 |
| 多种视图模式 | 单一聚焦视图 | 减少认知负担 |

---

## 9. 实施优先级

### P0（必须）
- [x] 智能问题诊断引擎
- [x] 简化的流程图
- [x] 根因分析
- [x] 解决建议

### P1（重要）
- [ ] 相似案例推荐
- [ ] 历史记录查询
- [ ] 报告导出

### P2（可选）
- [ ] 批量分析
- [ ] 趋势分析
- [ ] 自动化工单创建

---

## 10. 技术实现要点

### 10.1 后端API

```java
/**
 * 问题诊断API
 */
@RestController
@RequestMapping("/api/diagnosis")
public class DiagnosisController {

    /**
     * 智能诊断
     */
    @PostMapping("/analyze")
    public DiagnosisResult diagnose(@RequestBody DiagnosisRequest request) {
        return diagnosisService.diagnose(request.getTraceId(), request.getVin());
    }

    /**
     * 查询相似案例
     */
    @GetMapping("/similar-cases")
    public List<SimilarCase> getSimilarCases(
        @RequestParam String vin,
        @RequestParam String problemType
    ) {
        return diagnosisService.getSimilarCases(vin, problemType);
    }
}
```

### 10.2 性能优化

```java
/**
 * 诊断结果缓存
 */
@Cacheable(value = "diagnosis", key = "#traceId")
public DiagnosisResult diagnose(String traceId, String vin) {
    // 诊断逻辑
}

/**
 * 预加载常见问题
 */
@PostConstruct
public void preloadCommonProblems() {
    // 预加载最近24小时的失败案例
}
```

---

*本文档版本: v2.0 (聚焦事后问题诊断)*
*最后更新: 2026-04-11*
