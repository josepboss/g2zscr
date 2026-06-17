export interface ArbitrageResult {
  gameName: string;
  category: string;
  buyOn: 'G2G' | 'Z2U';
  sellOn: 'G2G' | 'Z2U';
  buyPrice: number;
  sellPrice: number;
  buyUrl: string;
  sellUrl: string;
  grossProfit: number;
  netProfit: number;
  margin: number;
  z2uCount: number;
  g2gCount: number;
}

export interface ArbitrageFilters {
  minMargin: number;
  minProfit: number;
  sortBy: 'profit' | 'margin';
  top: number;
}

export interface Stats {
  total: number;
  bestProfit: number;
  bestMargin: number;
  totalNetProfit: number;
}