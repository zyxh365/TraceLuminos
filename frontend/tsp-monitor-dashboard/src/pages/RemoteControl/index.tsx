import React from 'react';
import { Card, Tabs } from 'antd';
import CommandInfoBar from './CommandInfoBar';
import FlowChain from './FlowChain';
import SpanTable from '@/components/SpanTable';
import WaterfallTimeline from '@/components/WaterfallTimeline';
import type { SpanRecord } from '@/types';

const MOCK_SPANS: SpanRecord[] = [
  { spanName: 'app.send', service: 'tsp-app', startTime: '10:00:01.123', duration: 120, status: 'success' },
  { spanName: 'gateway.route', service: 'cloud-gw', startTime: '10:00:01.243', duration: 80, status: 'success' },
  { spanName: 'mqtt.publish', service: 'mqtt-broker', startTime: '10:00:01.323', duration: 90, status: 'success' },
  { spanName: 'rule.match', service: 'rule-engine', startTime: '10:00:01.413', duration: 85, status: 'success' },
  { spanName: 'kafka.produce', service: 'kafka', startTime: '10:00:01.498', duration: 180, status: 'success' },
  { spanName: 'control.dispatch', service: 'tsp-control-svc', startTime: '10:00:01.678', duration: 350, status: 'pending' },
  { spanName: 'tbox.execute', service: 'TBox', startTime: '10:00:02.028', duration: 200, status: 'pending' },
  { spanName: 'vehicle.actuate', service: 'vehicle', startTime: '10:00:02.228', duration: 150, status: 'success' },
  { spanName: 'result.report', service: 'result-collector', startTime: '10:00:02.378', duration: 110, status: 'success' },
  { spanName: 'app.notify', service: 'push-agent', startTime: '10:00:02.488', duration: 80, status: 'success' },
];

const RemoteControlPage: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <CommandInfoBar />

    <Card size="small" title="链路流程图" style={{ background: 'rgba(10,14,23,0.6)' }}>
      <FlowChain />
    </Card>

    <Tabs
      defaultActiveKey="table"
      items={[
        {
          key: 'table',
          label: '链路详情表格',
          children: <SpanTable data={MOCK_SPANS} />,
        },
        {
          key: 'timeline',
          label: '时间轴 (Gantt)',
          children: <WaterfallTimeline spans={MOCK_SPANS} />,
        },
      ]}
    />
  </div>
);

export default RemoteControlPage;
