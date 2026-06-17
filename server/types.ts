export interface Z2UCatalogEntry {
  gameName: string;
  gameSlug: string;
  category: string;
  cid: number;
  gameId: number;
}

export interface G2GBrand {
  brandId: string;
  brandName: string;
}

export interface MatchedPair {
  gameName: string;
  category: string;
  z2uSlug: string;
  z2uGameId: number;
  z2uCid: number;
  g2gBrandId: string;
  g2gBrandName: string;
  g2gSeoTerm: string;
  g2gCategoryId: string;
  g2gServiceId: string;
}

export interface Z2UOffer {
  offer_id: number;
  game_id: number;
  category_id: number;
  title: string;
  unit_price: string;
  origin_sort_price: string;
  sell_user_id: number;
  is_auto_deliver: number;
  remain_stock_num: number;
  off_url: string;
  currency: string;
  current_currency: string;
  insurance: number;
  shop_name: string;
}

export interface G2GOffer {
  offer_id: string;
  title: string;
  unit_price: number;
  unit_price_in_usd: number;
  display_currency: string;
  available_qty: number;
  delivery_speed: string;
}

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

export interface ArbitrageRequest {
  minMargin?: number;
  minProfit?: number;
  sortBy?: 'profit' | 'margin';
  top?: number;
}

export interface ArbitrageResponse {
  count: number;
  results: ArbitrageResult[];
  totalPairs: number;
}