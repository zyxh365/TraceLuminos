import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { context, trace } from '@opentelemetry/api';

// ── Baggage 全局存储（必须在 registerInstrumentations 之前声明）──
// 因为 applyCustomAttributesOnSpan 闭包里要读这个变量
let _baggageEntries = {};

// Exporter
const exporter = new OTLPTraceExporter({ url: '/v1/traces' });

// Provider
const provider = new WebTracerProvider({
  resource: new Resource({
    'service.name': 'apm-otel.tsp-react-frontend.test',  // 使用新的语义约定
    'service.version': '1.0.0',
    'app.type': 'browser',
  }),
});

provider.addSpanProcessor(new BatchSpanProcessor(exporter, {
  maxExportBatchSize: 10,
  scheduledDelayMillis: 1000,
}));

provider.register({
  propagator: new W3CTraceContextPropagator(),
});

// ── 自动插桩所有 fetch ───────────────────────────────────────
// ★ applyCustomAttributesOnSpan：每个 fetch 生成 Span 时
//   自动把当前 Baggage 条目写入 Span Attributes
//   这样 Collector 收到的 Span 里就有 baggage.userId 等字段
registerInstrumentations({
  tracerProvider: provider,
  instrumentations: [
    new FetchInstrumentation({
      propagateTraceHeaderCorsUrls: [/.*/],
      applyCustomAttributesOnSpan: (span) => {
        Object.entries(_baggageEntries).forEach(([key, value]) => {
          span.setAttribute('baggage.' + key, value);
        });
      },
    }),
  ],
});

// ── Baggage 工具函数 ─────────────────────────────────────────

/**
 * setBaggage({ userId, vin, tenantId, platform })
 * 设置 Baggage，后续所有 fetch：
 *   1. 请求 Header 自动包含 baggage: userId=xxx,vin=xxx
 *   2. Span Attributes 自动包含 baggage.userId=xxx 等字段（上报 Collector）
 */
export function setBaggage(entries) {
  _baggageEntries = {};
  Object.entries(entries).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      _baggageEntries[key] = String(value);
    }
  });
  console.log('[OTel] Baggage 已设置:', _baggageEntries);
  console.log('[OTel] baggage Header 将是:', getBaggageHeader());
}

/**
 * 获取 baggage Header 字符串，注入到 fetch 请求 Header 里
 * 格式：userId=12345,vin=VIN001,tenantId=tsp-prod
 */
export function getBaggageHeader() {
  return Object.entries(_baggageEntries)
    .map(([k, v]) => k + '=' + v)
    .join(',');
}

/**
 * 获取当前所有 Baggage 条目（调试/显示用）
 */
export function getCurrentBaggage() {
  return Object.assign({}, _baggageEntries);
}

/**
 * 给任意 Span 手动写入当前 Baggage Attributes
 * 在 App.jsx 的手动 Span（user.action.xxx）里调用
 */
export function applyBaggageToSpan(span) {
  Object.entries(_baggageEntries).forEach(([key, value]) => {
    span.setAttribute('baggage.' + key, value);
  });
}

export { context, trace };
export const tracer = provider.getTracer('tsp-react-frontend', '1.0.0');
export default provider;

console.log('[OTel] 初始化完成');
