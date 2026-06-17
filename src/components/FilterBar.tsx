import { SlidersHorizontal, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ArbitrageFilters } from '@/types';

interface Props {
  filters: ArbitrageFilters;
  onChange: (filters: ArbitrageFilters) => void;
  onAnalyze: () => void;
  loading: boolean;
  autoRefresh: number | null;
  onAutoRefreshChange: (ms: number | null) => void;
}

const REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '5 min', value: 5 * 60 * 1000 },
  { label: '10 min', value: 10 * 60 * 1000 },
  { label: '30 min', value: 30 * 60 * 1000 },
];

export const FilterBar = ({
  filters,
  onChange,
  onAnalyze,
  loading,
  autoRefresh,
  onAutoRefreshChange,
}: Props) => {
  const set = (patch: Partial<ArbitrageFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="rounded-xl border border-white/10 p-4 mb-6">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end">
        {/* Min Margin */}
        <div className="w-full lg:w-36">
          <label className="text-xs text-muted-foreground mb-1 block">Min Margin</label>
          <Select
            value={String(filters.minMargin)}
            onValueChange={(v) => set({ minMargin: Number(v) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 5, 10, 15, 20, 30, 50].map((v) => (
                <SelectItem key={v} value={String(v)}>
                  {v}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Min Profit */}
        <div className="w-full lg:w-36">
          <label className="text-xs text-muted-foreground mb-1 block">Min Profit</label>
          <Select
            value={String(filters.minProfit)}
            onValueChange={(v) => set({ minProfit: Number(v) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 5, 10, 25, 50].map((v) => (
                <SelectItem key={v} value={String(v)}>
                  ${v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort By */}
        <div className="w-full lg:w-36">
          <label className="text-xs text-muted-foreground mb-1 block">Sort By</label>
          <Select
            value={filters.sortBy}
            onValueChange={(v) => set({ sortBy: v as 'profit' | 'margin' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="profit">Profit ($)</SelectItem>
              <SelectItem value="margin">Margin (%)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Top N */}
        <div className="w-full lg:w-32">
          <label className="text-xs text-muted-foreground mb-1 block">Show Top</label>
          <Select
            value={String(filters.top)}
            onValueChange={(v) => set({ top: Number(v) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 30, 50, 100].map((v) => (
                <SelectItem key={v} value={String(v)}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Auto Refresh */}
        <div className="w-full lg:w-32">
          <label className="text-xs text-muted-foreground mb-1 block">Auto Refresh</label>
          <Select
            value={String(autoRefresh || 0)}
            onValueChange={(v) => onAutoRefreshChange(Number(v) || null)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Analyze button */}
        <div className="w-full lg:w-auto">
          <Button onClick={onAnalyze} disabled={loading} className="w-full lg:w-auto gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Analyzing...' : 'Analyze Now'}
          </Button>
        </div>
      </div>
    </div>
  );
};