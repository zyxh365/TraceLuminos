import { useState } from 'react';
import { HUAWEI_CLOUD_MOCK_TRACE_V2 } from './mock-data.js';

// 节点颜色映射
const NODE_COLORS = {
  'tsp-react-frontend': '#00d4ff',
  'kong': '#ffd700',
  'tsp-trace-service1': '#4da6ff',
  'tsp-trace-service2': '#00ff88',
  'Redis': '#ef4444',
  'MySQL': '#f97316',
  'default': '#94a8c0',
};

function getColor(nodeId) {
  // 对于async开头的节点，使用异步颜色
  if (nodeId.startsWith('async.')) {
    return '#8b5cf6';
  }
  return NODE_COLORS[nodeId] || NODE_COLORS.default;
}

function formatDuration(microseconds) {
  if (microseconds >= 1000000) return (microseconds / 1000000).toFixed(2) + 's';
  if (microseconds >= 1000) return (microseconds / 1000).toFixed(1) + 'ms';
  return microseconds + 'μs';
}

// Span节点组件（支持嵌套结构）
function SpanNode({ span, level = 0, maxDur }) {
  const [open, setOpen] = useState(true);
  const hasChildren = span.children && span.children.length > 0;

  // 获取服务名
  const appName = span.app_name || 'unknown';
  const color = getColor(appName);

  // 操作名
  const operationName = span.method || span.operation_name || 'unknown';

  // 耗时（转换为微秒）
  const duration = (span.time_used || span.duration || 0) * 1000;

  // 从 tags 提取信息
  const tags = span.tags || {};
  const peerService = tags['peer.service'] || '';
  const dbSystem = tags['db.system'] || '';

  // 计算耗时条百分比
  const pct = Math.max(2, (duration / (maxDur || 1)) * 100);

  // 准备tags数组
  const tagArray = Object.entries(tags).map(([key, value]) => ({ key, value }));

  return (
    <div>
      <div
        style={{
          paddingLeft: level * 12,
          marginBottom: 5,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}
      >
        {/* 折叠/展开按钮 */}
        {hasChildren && (
          <span
            onClick={() => setOpen(!open)}
            style={{
              color: '#4da6ff',
              fontSize: 9,
              flexShrink: 0,
              cursor: 'pointer',
              userSelect: 'none',
              padding: '0 2px',
            }}
            title={open ? '折叠' : '展开'}
          >
            {open ? '▼' : '▶'}
          </span>
        )}

        {/* 层级符号（不是根节点时显示） */}
        {level > 0 && (
          <span style={{ color: '#1e3a5f', fontSize: 9, flexShrink: 0 }}>└</span>
        )}

        {/* 服务名标签 */}
        <span style={{
          fontSize: 9,
          fontFamily: 'monospace',
          background: color + '22',
          border: '1px solid ' + color + '44',
          color,
          borderRadius: 3,
          padding: '1px 4px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {appName}
        </span>

        {/* peer服务标签 */}
        {peerService && (
          <span style={{
            fontSize: 9,
            fontFamily: 'monospace',
            color: getColor(peerService),
            background: getColor(peerService) + '22',
            border: '1px solid ' + getColor(peerService) + '44',
            borderRadius: 3,
            padding: '1px 4px',
            flexShrink: 0,
          }}>
            →{peerService}
          </span>
        )}

        {/* 数据库标签 */}
        {dbSystem && (
          <span style={{
            fontSize: 9,
            fontFamily: 'monospace',
            color: getColor(dbSystem === 'redis' ? 'Redis' : 'MySQL'),
            background: getColor(dbSystem === 'redis' ? 'Redis' : 'MySQL') + '22',
            border: '1px solid ' + getColor(dbSystem === 'redis' ? 'Redis' : 'MySQL') + '44',
            borderRadius: 3,
            padding: '1px 4px',
            flexShrink: 0,
          }}>
            DB:{dbSystem}
          </span>
        )}

        {/* 操作名 */}
        <span style={{
          fontFamily: 'monospace',
          fontSize: 10,
          color: '#94a8c0',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {operationName}
        </span>

        {/* 耗时 */}
        <span style={{
          fontFamily: 'monospace',
          fontSize: 10,
          color: '#5a7090',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {formatDuration(duration)}
        </span>
      </div>

      {/* 耗时条 */}
      <div style={{ paddingLeft: (level + 1) * 12, marginTop: 2 }}>
        <div style={{ height: 3, background: '#1e3a5f', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: pct + '%',
            height: '100%',
            background: color,
            opacity: 0.55,
            borderRadius: 2,
          }} />
        </div>
      </div>

      {/* Tags */}
      {tagArray.length > 0 && (
        <div style={{ paddingLeft: (level + 1) * 12, marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {tagArray.slice(0, 5).map((tag, idx) => (
            <span
              key={idx}
              style={{
                fontSize: 8,
                fontFamily: 'monospace',
                color: '#5a7090',
                background: 'rgba(30,58,95,0.5)',
                borderRadius: 2,
                padding: '1px 4px',
              }}
            >
              {tag.key}={String(tag.value).substring(0, 20)}
            </span>
          ))}
          {tagArray.length > 5 && (
            <span style={{ fontSize: 8, color: '#4a6080' }}>+{tagArray.length - 5}</span>
          )}
        </div>
      )}

      {/* 递归渲染子节点 */}
      {open && hasChildren && span.children.map((child) => (
        <SpanNode key={child.span_id} span={child} level={level + 1} maxDur={maxDur} />
      ))}
    </div>
  );
}

export default function TraceTreeView() {
  const [data] = useState(HUAWEI_CLOUD_MOCK_TRACE_V2.data);
  const nestedSpans = data.span_list || [];

  // 计算最大耗时用于显示进度条
  const maxDur = (() => {
    const allSpans = [];
    const collect = (spans) => {
      if (!Array.isArray(spans)) return;
      spans.forEach(span => {
        allSpans.push(span);
        if (span.children && Array.isArray(span.children)) {
          collect(span.children);
        }
      });
    };
    collect(nestedSpans);
    return allSpans.reduce((m, e) => Math.max(m, (e.time_used || e.duration || 0) * 1000), 1);
  })();

  return (
    <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
      <div style={{ marginBottom: '20px', padding: '16px 20px', background: 'rgba(13,21,32,0.9)', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
        <h2 style={{ margin: 0, color: '#e8f0fe', fontSize: '16px', fontWeight: 600, fontFamily: 'monospace' }}>
          🌲 链路追踪树视图
        </h2>
        <p style={{ margin: '8px 0 0 0', color: '#5a7090', fontSize: '12px', fontFamily: 'monospace' }}>
          清晰的嵌套树形结构，支持折叠/展开
        </p>
      </div>

      <div style={{ padding: '20px', background: 'rgba(13,21,32,0.9)', border: '1px solid #1e3a5f', borderRadius: 10, maxHeight: '70vh', overflowY: 'auto' }}>
        {nestedSpans.map(rootSpan => (
          <SpanNode key={rootSpan.span_id} span={rootSpan} level={0} maxDur={maxDur} />
        ))}
      </div>
    </div>
  );
}
