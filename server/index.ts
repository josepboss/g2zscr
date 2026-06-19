import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { G2G, Z2U, ARBITRAGE } from './config';
import { HARDCODED_PAIRS } from './hardcodedGames';
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

// ─── SOCKS5 proxy agent ────────────────────────────────────

const socksAgent = new SocksProxyAgent('socks5://127.0.0.1:40000');

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

// ─── Step 1 — Build catalog from hardcoded games ──────────

async function buildCatalogFromHardcoded(): Promise<MatchedPair[]> {
  const pairs: MatchedPair[] = [];

  // Fetch G2G brands once
  const g2gBrands = await getG2GBrands();
  console.log(`Fetched ${g2gBrands.length} G2G brands`);

  for (const entry of HARDCODED_PAIRS) {
    // Fuzzy match by name
    const match = g2gBrands.find(
      (b) =>
        normalize(b.brandName).includes(normalize(entry.gameName)) ||
        normalize(entry.gameName).includes(normalize(b.brandName)),
    );

    if (!match) {
      console.warn(`No G2G match for ${entry.gameName}`);
      continue;
    }

    const catConfig = G2G.CATEGORIES[entry.category as keyof typeof G2G.CATEGORIES];
    if (!catConfig) continue;

    const slug = entry.z2uSlug.split('/')[0]; // game slug only

    pairs.push({
      gameName: entry.gameName,
      category: entry.category,
      z2uSlug: slug,
      z2uGameId: entry.z2uGameId,
      z2uCid: entry.z2uCid,
      g2gBrandId: match.brandId,
      g2gBrandName: match.brandName,
      g2gSeoTerm: generateSeoTerm(match.brandName, entry.category),
      g2gCategoryId: catConfig.id,
      g2gServiceId: catConfig.serviceId,
    });
  }

  return pairs;
}

// ─── Step 2 (old) — Get G2G popular brands ────────────────

async function getG2GBrands(): Promise<G2GBrand[]> {
  const brands: G2GBrand[] = [];

  for (const cat of Object.values(G2G.CATEGORIES)) {
    try {
      const res = await axios.get(`${G2G.BASE}/offer/category/${cat.id}/popular_brand`, {
        params: { max: 24, country: 'US', include_localization: 0, v: 'v2' },
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

// ─── Step 3 — Fetch prices for one matched pair ───────────

async function fetchPrices(
  pair: MatchedPair,
): Promise<{ z2u: Z2UOffer[]; g2g: G2GOffer[] } | null> {
  try {
    // Z2U — use the paginated listing endpoint (GET, base64-encoded JSON)
    await z2uLimiter.wait();
    const baseUrl = `${Z2U.BASE}/${pair.z2uSlug}`;
    const z2uOffers: Z2UOffer[] = [];

    // First page to get totalCount
    const firstRes = await axios.get(baseUrl, {
      params: { page: 1, totalCount: '' },
      headers: Z2U.HEADERS,
      timeout: 15000,
      httpAgent: socksAgent,
      httpsAgent: socksAgent,
    });

    let parsed: any;
    try {
      parsed = decodeZ2U(firstRes.data);
    } catch {
      console.warn(`  → Z2U first page decode failed for ${pair.gameName}, trying raw JSON`);
      parsed = firstRes.data;
    }

    const msg = parsed?.msg || {};
    const totalCount = msg.total || 0;
    const lastPage = msg.last_page || 1;

    if (Array.isArray(parsed?.data)) {
      z2uOffers.push(...parsed.data);
    }
    console.log(`  → Page 1: ${z2uOffers.length} offers, total=${totalCount}, pages=${lastPage}`);

    // Fetch remaining pages (up to MAX_PRICE_PAGES)
    const pagesToFetch = Math.min(lastPage, ARBITRAGE.MAX_PRICE_PAGES);
    for (let p = 2; p <= pagesToFetch; p++) {
      await z2uLimiter.wait();
      try {
        const res = await axios.get(baseUrl, {
          params: { page: p, totalCount },
          headers: Z2U.HEADERS,
          timeout: 15000,
          httpAgent: socksAgent,
          httpsAgent: socksAgent,
        });
        let pageParsed: any;
        try {
          pageParsed = decodeZ2U(res.data);
        } catch {
          pageParsed = res.data;
        }
        if (Array.isArray(pageParsed?.data)) {
          z2uOffers.push(...pageParsed.data);
        }
        console.log(`  → Page ${p}: ${pageParsed?.data?.length || 0} more offers`);
      } catch (err) {
        console.warn(`  → Page ${p} failed:`, (err as Error).message);
        break;
      }
    }

    console.log(`  → Total Z2U offers: ${z2uOffers.length}`);

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
      httpAgent: socksAgent,
      httpsAgent: socksAgent,
    });
    const g2gOffers: G2GOffer[] = g2gRes.data?.payload?.results || [];
    console.log(`  → Got ${g2gOffers.length} G2G offers`);

    return { z2u: z2uOffers, g2g: g2gOffers };
  } catch (err) {
    console.error(`Price fetch failed for ${pair.gameName}:`, (err as Error).message);
    return null;
  }
}

// ─── Step 4 — Compute arbitrage from offers ────────────────

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

  const buyOn = z2uMin < g2gMin ? 'Z2U' : 'G2G';
  const sellOn = buyOn === 'Z2U' ? 'G2G' : 'Z2U';
  const buyPrice = buyOn === 'Z2U' ? z2uMin : g2gMin;
  const sellPrice = buyOn === 'Z2U' ? g2gMin : z2uMin;

  const grossProfit = sellPrice - buyPrice;
  const netProfit = sellPrice * (1 - ARBITRAGE.FEE) - buyPrice;
  const margin = buyPrice > 0 ? (netProfit / buyPrice) * 100 : 0;

  const z2uUrl = `${Z2U.BASE}/${pair.z2uSlug}/${pair.category}-${pair.z2uCid}-${pair.z2uGameId}`;
  const g2gUrl = `https://www.g2g.com/offers/${pair.g2gSeoTerm}`;

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

  console.log('Building catalog from hardcoded games...');
  const pairs = await buildCatalogFromHardcoded();
  console.log(`Built ${pairs.length} pairs`);

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

    let filtered = allResults.filter((r) => r.margin >= minMargin && r.netProfit >= minProfit);

    if (sortBy === 'margin') {
      filtered.sort((a, b) => b.margin - a.margin);
    } else {
      filtered.sort((a, b) => b.netProfit - a.netProfit);
    }

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', pid: process.pid, memory: process.memoryUsage() });
});

app.listen(PORT, () => {
  console.log(`🚀 Arbitrage API running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));