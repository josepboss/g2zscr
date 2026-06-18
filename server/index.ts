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

// ─── Fuzzy matching with abbreviation map & token overlap ───

const ABBREVS: Record<string, string> = {
  osrs: 'oldschoolrunescape',
  wow: 'worldofwarcraft',
  lol: 'leagueoflegends',
  fn: 'fortnite',
  cod: 'callofduty',
  gta: 'grandtheftauto',
  rs: 'runescape',
  eso: 'elderscrollsonline',
  rl: 'rocketleague',
  fc: 'easportsfc',
};

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ea = ABBREVS[na] || na;
  const eb = ABBREVS[nb] || nb;
  if (ea === eb || ea.includes(eb) || eb.includes(ea)) return true;
  const ta = new Set(na.match(/.{3,}/g) || []);
  const tb = new Set(nb.match(/.{3,}/g) || []);
  const overlap = [...ta].filter(t => tb.has(t)).length;
  const score = overlap / Math.max(ta.size, tb.size, 1);
  return score >= 0.6;
}

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

// ─── Step 1 — Scrape Z2U catalog pages (HTML) ─────────────

async function scrapeZ2UCatalog(): Promise<Z2UCatalogEntry[]> {
  const entries: Z2UCatalogEntry[] = [];

  for (const url of Z2U.CATALOG_URLS) {
    console.log(`Scraping Z2U catalog: ${url}`);
    try {
      const res = await axios.get(url, { headers: Z2U.HEADERS, timeout: 15000 });
      const html: string = res.data;

      const pattern = /href="\/([^\/]+)\/([a-z]+)-(\d+)-(\d+)"/g;
      let match: RegExpExecArray | null;
      let count = 0;
      while ((match = pattern.exec(html)) !== null) {
        const [, gameSlug, category, cidStr, gameIdStr] = match;
        const cid = parseInt(cidStr, 10);
        const gameId = parseInt(gameIdStr, 10);
        const gameName = gameSlug
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        entries.push({ gameName, gameSlug, category, cid, gameId });
        count++;
      }
      console.log(`  → Found ${count} entries from ${url}`);
    } catch (err) {
      console.error(`Failed to scrape Z2U catalog at ${url}:`, (err as Error).message);
    }

    await sleep(1000);
  }

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

// ─── Step 3 — Fuzzy-match Z2U entries ↔ G2G brands ────────

function matchPairs(z2uEntries: Z2UCatalogEntry[], g2gBrands: G2GBrand[]): MatchedPair[] {
  const pairs: MatchedPair[] = [];
  const matchedG2G = new Set<string>();

  for (const entry of z2uEntries) {
    const match = g2gBrands.find((b) => {
      if (matchedG2G.has(b.brandId)) return false;
      return fuzzyMatch(entry.gameName, b.brandName);
    });
    if (!match) continue;

    matchedG2G.add(match.brandId);

    const catKey = entry.category as keyof typeof G2G.CATEGORIES;
    const catConfig = G2G.CATEGORIES[catKey];
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

// ─── Step 4 — Fetch prices for one matched pair ───────────

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
    });
    const g2gOffers: G2GOffer[] = g2gRes.data?.payload?.results || [];
    console.log(`  → Got ${g2gOffers.length} G2G offers`);

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

  console.log('Scraping Z2U catalog...');
  const z2uEntries = await scrapeZ2UCatalog();
  console.log(`Found ${z2uEntries.length} Z2U entries`);

  if (z2uEntries.length === 0) {
    console.error('Z2U catalog returned 0 entries. Likely Cloudflare blocking the HTML pages too.');
    return [];
  }

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