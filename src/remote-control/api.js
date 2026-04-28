/**
 * 远控监控看板 API 客户端
 */
const BASE = '/monitor';

async function request(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error('API错误 ' + res.status);
  const json = await res.json();
  if (json.code !== 200) throw new Error(json.message || 'API返回错误');
  return json.data;
}

function qs(params) {
  return new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)])
  ).toString();
}

export function fetchOverview(params) {
  return request(`/dashboard/remote-control/overview?${qs(params)}`);
}

export function fetchE2EMetrics(params) {
  return request(`/dashboard/remote-control/e2e-metrics?${qs(params)}`);
}

export function fetchFailureAnalysis(params) {
  return request(`/dashboard/remote-control/failure-analysis?${qs(params)}`);
}

export function fetchTspService(params) {
  return request(`/dashboard/remote-control/tsp-service?${qs(params)}`);
}

export function fetchTBoxService(params) {
  return request(`/dashboard/remote-control/tbox-service?${qs(params)}`);
}

export function fetchThirdParty(params) {
  return request(`/dashboard/remote-control/third-party?${qs(params)}`);
}

export function fetchVehicleConnection(params) {
  return request(`/dashboard/remote-control/vehicle-connection?${qs(params)}`);
}

export function fetchAlerts(params) {
  return request(`/dashboard/remote-control/alerts?${qs(params)}`);
}
