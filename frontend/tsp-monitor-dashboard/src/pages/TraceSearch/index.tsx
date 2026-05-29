import React, { useState } from 'react';
import { Card, Input, Button, message, Space } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import TraceInfo from './TraceInfo';
import SpanTable from '@/components/SpanTable';
import WaterfallTimeline from '@/components/WaterfallTimeline';
import { fetchTraceById } from '@/services/api';
import type { SpanRecord, TraceInfo as TraceInfoType } from '@/types';

const TraceSearchPage: React.FC = () => {
  const [traceId, setTraceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<TraceInfoType | null>(null);
  const [spans, setSpans] = useState<SpanRecord[]>([]);

  const onSearch = async () => {
    if (!traceId.trim()) { message.warning('请输入 Trace ID'); return; }
    setLoading(true);
    try {
      const res = await fetchTraceById(traceId.trim());
      if (res) {
        setInfo({ traceId, spanId: res.spanId || '', parentId: res.parentId || '', service: res.service || '', operation: res.operation || '', status: res.status || 'OK', tags: res.tags || {} });
        setSpans(res.spans || []);
      } else {
        message.error('未找到该 Trace');
        setInfo(null);
        setSpans([]);
      }
    } catch {
      message.error('查询失败，请检查接口');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card size="small" style={{ background: 'rgba(22,119,255,0.04)', border: '1px solid rgba(22,119,255,0.10)' }}>
        <Space>
          <Input
            placeholder="输入 Trace ID"
            value={traceId}
            onChange={(e) => setTraceId(e.target.value)}
            onPressEnter={onSearch}
            style={{ width: 380, fontFamily: 'JetBrains Mono, monospace' }}
            prefix={<SearchOutlined />}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={onSearch} loading={loading}>查询</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setTraceId(''); setInfo(null); setSpans([]); }}>重置</Button>
        </Space>
      </Card>

      {info && <TraceInfo data={info} />}

      {spans.length > 0 && (
        <>
          <Card size="small" title="Span 列表"><SpanTable data={spans} /></Card>
          <Card size="small" title="时间轴 (Waterfall)"><WaterfallTimeline spans={spans} /></Card>
        </>
      )}
    </div>
  );
};

export default TraceSearchPage;
