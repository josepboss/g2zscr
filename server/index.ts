import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { G2G, Z2U, ARBITRAGE } from './config';
import type {
  Z2UCatalogEntry,
  G2GBrand,
  MatchedPair,
  Z2UOffer,
  G2GOffer,
  ArbitrageResult,
  ArbitrageRequest,
  ArbitrageResponse,
} from './types';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Helpers ──────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const decodeZ2U = (data: string) => {
  const decoded = Buffer.from(data, 'base64').toString('utf-8');
  return JSON.parse(decoded);
};

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const generateSeoTerm = (brandName: string, category: string): string => {
  const base = slugify(brandName);
  const suffix =
    category === 'accounts'
      ? 'account'
      : category === 'gold'
        ? 'gold'
        : category === 'items'
          ? 'items'
          : 'boosting';
  return `${base}-${suffix}`;
};

// ─── Rate limiter (per-platform) ──────────────────────────

class RateLimiter {
  private last = 0;
  async wait() {
    const now = Date.now();
    const elapsed = now - this.last;
    if (elapsed < ARBITRAGE.DELAY_MS) {
      await sleep(ARBITRAGE.DELAY_MS - elapsed);
    }
    this.last = Date.now();
  }
}

const z2uLimiter = new RateLimiter();
const g2gLimiter = new RateLimiter();

// ─── In-memory catalog cache ──────────────────────────────

let catalogCache: { pairs: MatchedPair[]; ts: number } | null = null;

// ─── Step 1 — Scrape Z2U catalog pages ────────────────────

async function scrapeZ2UCatalog(): Promise<Z2UCatalogEntry[]> {
  const entries: Z2UCatalogEntry[] = [];
  const pattern = /href="\/([^\/]+)\/([a-z]+)-(\d+)-(\d+)"/g;

  for (const url of Z2U.CATALOG_URLS) {
    try {
      const res = await axios.get(url, { headers: Z2U.HEADERS, timeout: 15000 });
      const html: string = res.data;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(html)) !== null) {
        const [, gameSlug, category, cidStr, gameIdStr] = match;
        const cid = parseInt(cidStr, 10);
        const gameId = parseInt(gameIdStr, 10);
        const gameName = gameSlug
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        entries.push({ gameName, gameSlug, category, cid, gameId });
      }
      await sleep(500);
    } catch (err) {
      console.error(`Failed to scrape ${url}:`, (err as Error).message);
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.gameSlug}|${e.category}|${e.gameId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Step 2 — Get G2G popular brands ──────────────────────

async function getG2GBrands(): Promise<G2GBrand[]> {
  const brands: G2GBrand[] = [];

  for (const cat of Object.values(G2G.CATEGORIES)) {
    try {
      const res = await axios.get(`${G2G.BASE}/offer/category/${cat.id}/popular_brand`, {
        params: { max: 100, country: 'US', include_localization: 0, v: 'v2' },
        headers: G2G.HEADERS,
        timeout: 15000,
      });
      const results: any[] = res.data?.payload?.results || [];
      for (const r of results) {
        brands.push({ brandId: r.brand_id, brandName: r.brand_name });
      }
      await sleep(500);
    } catch (err) {
      console.error(`Failed to get G2G brands for ${cat.id}:`, (err as Error).message);
    }
  }

  return brands;
}

// ─── Step 3 — Fuzzy-match Z2U entries ↔ G2G brands ────────

function matchPairs(z2uEntries: Z2UCatalogEntry[], g2gBrands: G2GBrand[]): MatchedPair[] {
  const pairs: MatchedPair[] = [];
  const g2gNorm = g2gBrands.map((b) => ({ ...b, norm: normalize(b.brandName) }));

  for (const entry of z2uEntries) {
    const entryNorm = normalize(entry.gameName);

    const match = g2gNorm.find(
      (b) => b.norm.includes(entryNorm) || entryNorm.includes(b.norm),
    );
    if (!match) continue;

    // Try to find category config; fall back to accounts
    const catKey = entry.category === 'accounts' ? 'accounts' : 'accounts';
    const catConfig = G2G.CATEGORIES[catKey as keyof typeof G2G.CATEGORIES];
    if (!catConfig) continue;

    pairs.push({
      gameName: entry.gameName,
      category: entry.category,
      z2uSlug: entry.gameSlug,
      z2uGameId: entry.gameId,
      z2uCid: entry.cid,
      g2gBrandId: match.brandId,
      g2gBrandName: match.brandName,
      g2gSeoTerm: generateSeoTerm(match.brandName, entry.category),
      g2gCategoryId: catConfig.id,
      g2gServiceId: catConfig.serviceId,
    });
  }

  return pairs;
}

// ─── Step 4 — Fetch prices for one matched pair ────────────

async function fetchPrices(
  pair: MatchedPair,
): Promise<{ z2u: Z2UOffer[]; g2g: G2GOffer[] } | null> {
  try {
    // Z2U
    await z2uLimiter.wait();
    const z2uUrl = `${Z2U.BASE}/${pair.z2uSlug}/${pair.category}-${pair.z2uCid}-${pair.z2uGameId}`;
    const z2uRes = await axios.get(z2uUrl, {
      params: { page: 1, totalCount: pair.z2uGameId },
      headers: Z2U.HEADERS,
      timeout: 15000,
    });
    let z2uOffers: Z2UOffer[] = [];
    try {
      const parsed = decodeZ2U(z2uRes.data);
      if (parsed.code === 1 && Array.isArray(parsed.data)) {
        z2uOffers = parsed.data;
      }
    } catch {
      console.warn(`Z2U decode failed for ${pair.gameName}`);
    }

    // G2G
    await g2gLimiter.wait();
    const g2gRes = await axios.get(`${G2G.BASE}/offer/search`, {
      params: {
        seo_term: pair.g2gSeoTerm,
        sort: 'price_asc',
        page_size: 48,
        currency: 'USD',
        country: 'US',
        include_localization: 0,
        v: 'v2',
      },
      headers: G2G.HEADERS,
      timeout: 15000,
    });
    const g2gOffers: G2GOffer[] = g2gRes.data?.payload?.results || [];

    return { z2u: z2uOffers, g2g: g2gOffers };
  } catch (err) {
    console.error(`Price fetch failed for ${pair.gameName}:`, (err as Error).message);
    return null;
  }
}

// ─── Step 5 — Compute arbitrage from offers ────────────────

function computeArbitrage(
  pair: MatchedPair,
  z2uOffers: Z2UOffer[],
  g2gOffers: G2GOffer[],
): ArbitrageResult | null {
  const z2uPrices = z2uOffers
    .map((o) => parseFloat(o.unit_price))
    .filter((p) => p > 0);
  const g2gPrices = g2gOffers
    .map((o) => o.unit_price_in_usd)
    .filter((p) => p > 0);

  if (z2uPrices.length === 0 || g2gPrices.length === 0) return null;

  const z2uMin = Math.min(...z2uPrices);
  const g2gMin = Math.min(...g2gPrices);

  // Winner = lower price platform
  const buyOn = z2uMin < g2gMin ? 'Z2U' : 'G2G';
  const sellOn = buyOn === 'Z2U' ? 'G2G' : 'Z2U';
  const buyPrice = buyOn === 'Z2U' ? z2uMin : g2gMin;
  const sellPrice = buyOn === 'Z2U' ? g2gMin : z2uMin;

  const grossProfit = sellPrice - buyPrice;
  const netProfit = sellPrice * (1 - ARBITRAGE.FEE) - buyPrice;
  const margin = buyPrice > 0 ? (netProfit / buyPrice) * 100 : 0;

  const z2uUrl = `${Z2U.BASE}/${pair.z2uSlug}/${pair.category}-${pair.z2uCid}-${pair.z2uGameId}`;
  const g2gUrl = `${G2G.BASE}/offer/search?seo_term=${pair.g2gSeoTerm}`;

  return {
    gameName: pair.gameName,
    category: pair.category,
    buyOn,
    sellOn,
    buyPrice: Math.round(buyPrice * 100) / 100,
    sellPrice: Math.round(sellPrice * 100) / 100,
    buyUrl: buyOn === 'Z2U' ? z2uUrl : g2gUrl,
    sellUrl: sellOn === 'Z2U' ? z2uUrl : g2gUrl,
    grossProfit: Math.round(grossProfit * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    z2uCount: z2uOffers.length,
    g2gCount: g2gOffers.length,
  };
}

// ─── Orchestrator — build catalog ──────────────────────────

async function buildCatalog(): Promise<MatchedPair[]> {
  if (catalogCache && Date.now() - catalogCache.ts < ARBITRAGE.CACHE_TTL_MS) {
    console.log(`Using cached catalog (${catalogCache.pairs.length} pairs)`);
    return catalogCache.pairs;
  }

  console.log('Scraping Z2U catalog...');
  const z2uEntries = await scrapeZ2UCatalog();
  console.log(`Found ${z2uEntries.length} Z2U entries`);

  console.log('Fetching G2G brands...');
  const g2gBrands = await getG2GBrands();
  console.log(`Found ${g2gBrands.length} G2G brands`);

  console.log('Matching pairs...');
  const pairs = matchPairs(z2uEntries, g2gBrands);
  console.log(`Matched ${pairs.length} pairs`);

  catalogCache = { pairs, ts: Date.now() };
  return pairs;
}

// ─── Routes ────────────────────────────────────────────────

app.get('/api/catalog', async (_req, res) => {
  try {
    const pairs = await buildCatalog();
    res.json({ count: pairs.length, pairs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build catalog', detail: (err as Error).message });
  }
});

app.post('/api/arbitrage', async (req, res) => {
  const { minMargin = 0, minProfit = 0, sortBy = 'profit', top = 30 } = req.body as ArbitrageRequest;

  try {
    const pairs = await buildCatalog();
    console.log(`Processing ${pairs.length} pairs for arbitrage...`);

    const allResults: ArbitrageResult[] = [];

    // Process with concurrency limit
    const worker = async (startIdx: number) => {
      for (let i = startIdx; i < pairs.length; i += ARBITRAGE.CONCURRENCY) {
        const pair = pairs[i];
        console.log(`  [${i + 1}/${pairs.length}] ${pair.gameName} (${pair.category})`);
        const prices = await fetchPrices(pair);
        if (prices) {
          const result = computeArbitrage(pair, prices.z2u, prices.g2g);
          if (result) allResults.push(result);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(ARBITRAGE.CONCURRENCY, pairs.length) }, (_, i) => worker(i)),
    );

    // Filter
    let filtered = allResults.filter((r) => r.margin >= minMargin && r.netProfit >= minProfit);

    // Sort
    if (sortBy === 'margin') {
      filtered.sort((a, b) => b.margin - a.margin);
    } else {
      filtered.sort((a, b) => b.netProfit - a.netProfit);
    }

    // Truncate
    filtered = filtered.slice(0, top);

    const response: ArbitrageResponse = {
      count: filtered.length,
      results: filtered,
      totalPairs: pairs.length,
    };

    res.json(response);
  } catch (err) {
    console.error('Arbitrage error:', err);
    res.status(500).json({ error: 'Failed to compute arbitrage', detail: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Arbitrage API running on http://localhost:${PORT}`);
});