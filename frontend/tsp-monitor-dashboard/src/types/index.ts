export interface SpanRecord {
  spanName: string;
  service: string;
  startTime: string;
  duration: number;
  status: 'success' | 'error' | 'pending';
}

export interface CommandInfo {
  remoteCommandId: string;
  commandType: string;
  initiator: string;
  targetVehicle: string;
  status: string;
  totalLatency: number;
}

export interface ChainNode {
  name: string;
  ip: string;
  latency: number;
  status?: 'normal' | 'error' | 'pending';
}

export interface TraceInfo {
  traceId: string;
  spanId: string;
  parentId: string;
  service: string;
  operation: string;
  status: string;
  tags: Record<string, string>;
}

export type ThemeMode = 'dark' | 'light';

export interface ThemeContextType {
  mode: ThemeMode;
  toggle: () => void;
}
