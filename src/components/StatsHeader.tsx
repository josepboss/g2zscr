import { TrendingUp, DollarSign, Target, Layers } from 'lucide-react';
import type { Stats } from '@/types';

interface Props {
  stats: Stats;
  loading: boolean;
}

export const StatsHeader = ({ stats, loading }: Props) => {
  const cards = [
    {
      label: 'Opportunities',
      value: stats.total,
      icon: Layers,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Best Profit',
      value: `$${stats.bestProfit.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Best Margin',
      value: `${stats.bestMargin.toFixed(1)}%`,
      icon: TrendingUp,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
    },
    {
      label: 'Total Net',
      value: `$${stats.totalNetProfit.toFixed(2)}`,
      icon: Target,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border border-white/10 p-4 transition-all ${
            loading ? 'opacity-50' : 'opacity-100'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${card.bg}`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{card.label}</p>
              <p className="text-lg font-bold tabular-nums">{card.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};