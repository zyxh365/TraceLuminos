import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchOverview } from '../api.js';

/**
 * 远控指标数据获取 Hook，支持自动刷新
 */
export default function useRemoteControlMetrics(refreshInterval = 30000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState({ preset: '1h', startTime: Date.now() - 3600000, endTime: Date.now() });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchOverview({
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
        interval: 60,
      });
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [timeRange.startTime, timeRange.endTime]);

  useEffect(() => {
    fetchData();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(fetchData, refreshInterval);
    return () => clearInterval(timerRef.current);
  }, [fetchData, refreshInterval]);

  const changeTimeRange = useCallback((preset, seconds) => {
    const endTime = Date.now();
    const startTime = endTime - seconds * 1000;
    setTimeRange({ preset, startTime, endTime });
    setLoading(true);
  }, []);

  return { data, loading, error, timeRange, changeTimeRange, refetch: fetchData };
}
