import React from 'react';
import type { SpanRecord } from '@/types';

const BAR_H = 24;
const GAP = 4;
const LABEL_W = 160;
const PAD = 12;

interface Props {
  spans: SpanRecord[];
  width?: number;
}

const COLORS: Record<string, string> = {
  success: '#22c55e',
  error: '#ef4444',
  pending: '#f59e0b',
};

const WaterfallTimeline: React.FC<Props> = ({ spans, width = 800 }) => {
  if (!spans.length) return <div style={{ color: '#6b7280', padding: 24, textAlign: 'center' }}>暂无数据</div>;

  const maxDuration = Math.max(...spans.map((s) => s.duration), 1);
  const chartW = width - LABEL_W - PAD * 2;
  const totalH = spans.length * (BAR_H + GAP) + GAP;

  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
      <svg width={width} height={totalH + 30} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
        {/* time ruler */}
        {Array.from({ length: 5 }).map((_, i) => {
          const ms = Math.round((maxDuration / 4) * i);
          const x = LABEL_W + PAD + (chartW / 4) * i;
          return (
            <text key={i} x={x} y={16} fill="#6b7280" textAnchor="middle">
              {ms}ms
            </text>
          );
        })}
        {spans.map((s, i) => {
          const y = 24 + i * (BAR_H + GAP);
          const barW = Math.max((s.duration / maxDuration) * chartW, 3);
          const color = COLORS[s.status] || '#6b7280';
          return (
            <g key={i}>
              <text x={0} y={y + 15} fill="#8b95a8" fontSize={11}>
                {s.spanName.length > 20 ? s.spanName.slice(0, 19) + '…' : s.spanName}
              </text>
              <rect
                x={LABEL_W + PAD}
                y={y}
                width={barW}
                height={BAR_H}
                rx={3}
                fill={color}
                opacity={0.85}
              />
              <text
                x={LABEL_W + PAD + barW + 6}
                y={y + 15}
                fill="#6b7280"
                fontSize={10}
              >
                {s.duration}ms
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default WaterfallTimeline;
