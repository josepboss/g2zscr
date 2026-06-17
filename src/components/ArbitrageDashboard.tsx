import { useState, useMemo } from 'react';
import { AlertTriangle, RefreshCw, PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatsHeader } from './StatsHeader';
import { FilterBar } from './FilterBar';
import { OpportunityCard } from './OpportunityCard';
import { useArbitrage } from '@/hooks/useArbitrage';
import type { ArbitrageFilters, Stats } from '@/types';

const DEFAULT_FILTERS: ArbitrageFilters = {
  minMargin: 0,
  minProfit: 0,
  sortBy: 'profit',
  top: 30,
};

export const ArbitrageDashboard = () => {
  const [filters, setFilters] = useState<ArbitrageFilters>(DEFAULT_FILTERS);
  const [autoRefresh, setAutoRefresh] = useState<number | null>(null);
  const [pendingFilters, setPendingFilters] = useState<ArbitrageFilters>(DEFAULT_FILTERS);

  const {
    results,
    totalPairs,
    status,
    error,
    refresh,
  } = useArbitrage(pendingFilters, autoRefresh);

  const stats: Stats = useMemo(
    () => ({
      total: results.length,
      bestProfit: results.length ? Math.max(...results.map((r) => r.netProfit)) : 0,
      bestMargin: results.length ? Math.max(...results.map((r) => r.margin)) : 0,
      totalNetProfit: results.reduce((sum, r) => sum + r.netProfit, 0),
    }),
    [results],
  );

  const handleAnalyze = () => {
    setPendingFilters({ ...filters });
  };

  const loading = status === 'loading';

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">G2G ↔ Z2U Arbitrage Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compare prices across marketplaces and find profitable opportunities
          </p>
        </div>
        <div className="flex items-center gap-2">
          {autoRefresh && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              Auto-refresh every {autoRefresh / 60000}min
            </span>
          )}
          {totalPairs > 0 && (
            <span className="text-xs text-muted-foreground">{totalPairs} matched pairs</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <StatsHeader stats={stats} loading={loading} />

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onAnalyze={handleAnalyze}
        loading={loading}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
      />

      {/* Error state */}
      {status === 'error' && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-400">Failed to fetch arbitrage data</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAnalyze}
              className="mt-3 gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </Button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {status === 'loading' && !error && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">
            Scanning {totalPairs || 'matched'} game pairs for arbitrage opportunities...
          </p>
          <p className="text-xs text-muted-foreground">
            This may take a minute due to platform rate limits
          </p>
        </div>
      )}

      {/* Empty state */}
      {status === 'success' && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <PackageOpen className="w-10 h-10 text-muted-foreground" />
          <p className="text-lg font-medium">No opportunities found</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Try lowering the minimum margin or profit thresholds, or check back later when
            prices update.
          </p>
          <Button variant="outline" onClick={handleAnalyze}>
            Scan Again
          </Button>
        </div>
      )}

      {/* Results */}
      {status === 'success' && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-4">
            Found <span className="font-semibold text-foreground">{results.length}</span>{' '}
            profitable opportunities
            {results.length < totalPairs &&
              ` out of ${totalPairs} matched pairs`}
          </p>
          <div className="grid gap-3">
            {results.map((result, i) => (
              <OpportunityCard key={`${result.gameName}-${result.category}`} result={result} rank={i + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};