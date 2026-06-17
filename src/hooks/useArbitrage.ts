import { useState, useEffect, useCallback, useRef } from 'react';
import type { ArbitrageResult, ArbitrageFilters } from '@/types';
import { fetchArbitrage } from '@/lib/api';

type Status = 'idle' | 'loading' | 'success' | 'error';

export function useArbitrage(filters: ArbitrageFilters, autoRefreshMs: number | null = null) {
  const [results, setResults] = useState<ArbitrageResult[]>([]);
  const [totalPairs, setTotalPairs] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setError(null);
    try {
      const data = await fetchArbitrage(filters, controller.signal);
      if (!controller.signal.aborted) {
        setResults(data.results);
        setTotalPairs(data.totalPairs);
        setStatus('success');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to fetch arbitrage data');
      setStatus('error');
    }
  }, [filters]);

  // Initial load + auto-refresh
  useEffect(() => {
    load();

    if (autoRefreshMs && autoRefreshMs > 0) {
      intervalRef.current = setInterval(load, autoRefreshMs);
    }

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load, autoRefreshMs]);

  return { results, totalPairs, status, error, refresh: load };
}