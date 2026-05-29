import React from 'react';
import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SpanRecord } from '@/types';

const columns: ColumnsType<SpanRecord> = [
  {
    title: 'Span',
    dataIndex: 'spanName',
    key: 'spanName',
    render: (v: string) => <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{v}</span>,
  },
  {
    title: '服务',
    dataIndex: 'service',
    key: 'service',
    width: 160,
    render: (v: string) => <Tag color="blue">{v}</Tag>,
  },
  {
    title: '开始时间',
    dataIndex: 'startTime',
    key: 'startTime',
    width: 180,
    render: (v: string) => <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{v}</span>,
  },
  {
    title: '耗时',
    dataIndex: 'duration',
    key: 'duration',
    width: 100,
    sorter: (a, b) => a.duration - b.duration,
    render: (v: number) => (
      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: v > 200 ? '#ef4444' : '#22c55e' }}>
        {v}ms
      </span>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 80,
    render: (v: string) => {
      const colors: Record<string, string> = { success: 'green', error: 'red', pending: 'orange' };
      return <Tag color={colors[v] || 'default'}>{v}</Tag>;
    },
  },
];

const SpanTable: React.FC<{ data: SpanRecord[]; loading?: boolean }> = ({ data, loading }) => (
  <Table<SpanRecord>
    columns={columns}
    dataSource={data}
    rowKey="spanName"
    loading={loading}
    size="small"
    pagination={false}
    locale={{ emptyText: '暂无 Span 数据' }}
  />
);

export default SpanTable;
