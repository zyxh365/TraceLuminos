import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '',
  timeout: 30000,
});

/** 获取指令详情 */
export async function fetchCommandInfo(commandId: string) {
  const { data } = await api.get('/api/command/detail', { params: { commandId } });
  return data?.data ?? data;
}

/** 按 traceId 查链路 */
export async function fetchTraceById(traceId: string) {
  const { data } = await api.get('/api/trace/detail', { params: { traceId } });
  return data?.data ?? data;
}

/** 服务拓扑 */
export async function fetchTopology(startTime: number, endTime: number) {
  const { data } = await api.get('/api/topology', { params: { startTime, endTime } });
  return data?.data ?? data;
}

/** 链路 Span 列表 */
export async function fetchSpanList(params: {
  traceId?: string;
  vin?: string;
  startTime?: number;
  endTime?: number;
}) {
  const { data } = await api.get('/api/trace/spans', { params });
  return data?.data ?? data;
}

export { api };
