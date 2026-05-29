import React from 'react';
import { Descriptions, Tag } from 'antd';
import type { TraceInfo as TraceInfoType } from '@/types';

const TraceInfo: React.FC<{ data: TraceInfoType }> = ({ data }) => (
  <Descriptions size="small" column={4} colon={false}>
    <Descriptions.Item label="Trace ID">
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{data.traceId}</span>
    </Descriptions.Item>
    <Descriptions.Item label="服务">
      <Tag color="blue">{data.service}</Tag>
    </Descriptions.Item>
    <Descriptions.Item label="操作">{data.operation}</Descriptions.Item>
    <Descriptions.Item label="状态">
      <Tag color={data.status === 'OK' ? 'green' : 'red'}>{data.status}</Tag>
    </Descriptions.Item>
  </Descriptions>
);

export default TraceInfo;
