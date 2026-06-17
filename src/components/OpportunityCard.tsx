import { ExternalLink, TrendingUp, ShieldCheck, PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ArbitrageResult } from '@/types';

interface Props {
  result: ArbitrageResult;
  rank: number;
}

export const OpportunityCard = ({ result, rank }: Props) => {
  const isProfitable = result.netProfit > 0;

  return (
    <div className="group rounded-xl border border-white/10 bg-card hover:border-white/20 transition-all p-5">
      {/* Top row — game name + rank */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-bold text-muted-foreground w-6 shrink-0">
            #{rank}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-base truncate">{result.gameName}</h3>
            <p className="text-xs text-muted-foreground capitalize">{result.category}</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={`shrink-0 ${
            isProfitable
              ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
              : 'border-red-500/30 text-red-400 bg-red-500/10'
          }`}
        >
          {isProfitable ? 'Profitable' : 'Loss'}
        </Badge>
      </div>

      {/* Buy / Sell row */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <PackageOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-amber-400 font-medium">Buy on {result.buyOn}</span>
          </div>
          <p className="text-lg font-bold tabular-nums">${result.buyPrice.toFixed(2)}</p>
          <a
            href={result.buyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-amber-400/70 hover:text-amber-300 inline-flex items-center gap-1 mt-1"
          >
            View listing <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-blue-400 font-medium">Sell on {result.sellOn}</span>
          </div>
          <p className="text-lg font-bold tabular-nums">${result.sellPrice.toFixed(2)}</p>
          <a
            href={result.sellUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400/70 hover:text-blue-300 inline-flex items-center gap-1 mt-1"
          >
            View listing <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Profit metrics row */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Gross:</span>
          <span className="font-semibold tabular-nums text-emerald-400">
            +${result.grossProfit.toFixed(2)}
          </span>
        </div>
        <div className="text-muted-foreground">·</div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Net:</span>
          <span className="font-semibold tabular-nums text-emerald-400">
            +${result.netProfit.toFixed(2)}
          </span>
        </div>
        <div className="text-muted-foreground">·</div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Margin:</span>
          <span
            className={`font-semibold tabular-nums ${
              result.margin > 30
                ? 'text-emerald-400'
                : result.margin > 10
                  ? 'text-amber-400'
                  : 'text-red-400'
            }`}
          >
            {result.margin.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Offer counts */}
      <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
        <span>{result.z2uCount} Z2U offers</span>
        <span>{result.g2gCount} G2G offers</span>
      </div>
    </div>
  );
};