import type { ArbitrageResult, ArbitrageFilters } from '@/types';

const API_BASE = '/api';

export async function fetchArbitrage(
  filters: ArbitrageFilters,
  signal?: AbortSignal,
): Promise<{ results: ArbitrageResult[]; totalPairs: number }> {
  const res = await fetch(`${API_BASE}/arbitrage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filters),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Server error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { results: data.results || [], totalPairs: data.totalPairs || 0 };
}