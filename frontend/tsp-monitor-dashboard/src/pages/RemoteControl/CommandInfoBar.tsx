import React from 'react';
import { Card, Descriptions, Tag, Spin } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import type { CommandInfo } from '@/types';

const MOCK: CommandInfo = {
  remoteCommandId: 'CMD202505201000123456',
  commandType: '车门锁',
  initiator: 'APP iOS 1.2.3',
  targetVehicle: '粤A-12345',
  status: '成功',
  totalLatency: 1283,
};

const CommandInfoBar: React.FC = () => {
  const [loading] = React.useState(false);
  const info: CommandInfo = MOCK;

  return (
    <Card size="small" loading={loading} style={{ marginBottom: 16, background: 'rgba(22,119,255,0.04)', border: '1px solid rgba(22,119,255,0.12)' }}>
      <Descriptions size="small" column={6} colon={false}>
        <Descriptions.Item label="远控指令ID">
          <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{info.remoteCommandId}</span>
        </Descriptions.Item>
        <Descriptions.Item label="指令类型">
          <Tag color="purple">{info.commandType}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="发送设备">{info.initiator}</Descriptions.Item>
        <Descriptions.Item label="目标车辆">{info.targetVehicle}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag icon={<CheckCircleOutlined />} color="success">{info.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="总耗时">
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#22c55e' }}>{info.totalLatency}ms</span>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

export default CommandInfoBar;
