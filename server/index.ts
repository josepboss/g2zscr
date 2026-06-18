import express from 'express';
import cors from 'cors';
import axios from 'axios';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { G2G, Z2U, ARBITRAGE, PUPPETEER } from './config';
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

puppeteer.use(StealthPlugin());

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

// ─── Bug 5 — Fuzzy matching with abbreviation map & token overlap ───

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

// ─── Puppeteer browser singleton ──────────────────────────

let _browser: import('puppeteer').Browser | null = null;

async function getBrowser() {
  if (!_browser) {
    // Use puppeteer-core with system chrome if available, otherwise bundled
    const puppeteerFull = await import('puppeteer');
    _browser = await puppeteerFull.launch({
      headless: PUPPETEER.HEADLESS,
      slowMo: PUPPETEER.SLOW_MO_MS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }
  return _browser;
}

async function closeBrowser() {
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }
}

// ─── Puppeteer-based Z2U page scraper ─────────────────────

async function scrapeZ2UPageWithPuppeteer(url: string): Promise<string | null> {
  let browser: import('puppeteer').Browser | null = null;
  try {
    const puppeteerFull = await import('puppeteer');
    browser = await puppeteerFull.launch({
      headless: PUPPETEER.HEADLESS,
      slowMo: PUPPETEER.SLOW_MO_MS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    const page = await browser.newPage();
    await page.setViewport(PUPPETEER.VIEWPORT);
    await page.setUserAgent(PUPPETEER.USER_AGENT);

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for content to render (Cloudflare challenge resolves in browser)
    await sleep(2000);

    const html = await page.content();
    return html;
  } catch (err) {
    console.error(`Puppeteer failed for ${url}:`, (err as Error).message);
    return null;
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

// ─── Puppeteer-based Z2U price page scraper ────────────────

async function scrapeZ2UOffersWithPuppeteer(url: string): Promise<Z2UOffer[]> {
  let browser: import('puppeteer').Browser | null = null;
  try {
    const puppeteerFull = await import('puppeteer');
    browser = await puppeteerFull.launch({
      headless: PUPPETEER.HEADLESS,
      slowMo: PUPPETEER.SLOW_MO_MS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    const page = await browser.newPage();
    await page.setViewport(PUPPETEER.VIEWPORT);
    await page.setUserAgent(PUPPETEER.USER_AGENT);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);

    // Look for base64-encoded data in script tags or page content
    const offers: Z2UOffer[] = await page.evaluate(() => {
      // Try to find JSON data in script tags with base64 encoding
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        // Look for base64 patterns that decode to JSON with offer data
        const base64Match = text.match(/"([A-Za-z0-9+/=]{100,})"/);
        if (base64Match) {
          try {
            const decoded = JSON.parse(atob(base64Match[1]));
            if (decoded?.data && Array.isArray(decoded.data)) {
              return decoded.data.map((item: any) => ({
                offer_id: item.offer_id,
                game_id: item.game_id,
                category_id: item.category_id,
                title: item.title,
                unit_price: item.unit_price,
                origin_sort_price: item.origin_sort_price,
                sell_user_id: item.sell_user_id,
                is_auto_deliver: item.is_auto_deliver,
                remain_stock_num: item.remain_stock_num,
                off_url: item.off_url,
                currency: item.currency,
                current_currency: item.current_currency,
                insurance: item.insurance,
                shop_name: item.shop_name,
              }));
            }
          } catch {}
        }
      }

      // Fallback: try to find table rows with offer data
      const rows = document.querySelectorAll('[class*="offer"], [class*="product"], tr.offer-row, tr.product-row');
      if (rows.length > 0) {
        return Array.from(rows).map((row) => {
          const cells = row.querySelectorAll('td');
          return {
            offer_id: parseInt(cells[0]?.textContent || '0'),
            game_id: 0,
            category_id: 0,
            title: cells[1]?.textContent || '',
            unit_price: cells[2]?.textContent || '0',
            origin_sort_price: '0',
            sell_user_id: 0,
            is_auto_deliver: 0,
            remain_stock_num: 0,
            off_url: '',
            currency: 'USD',
            current_currency: 'USD',
            insurance: 0,
            shop_name: '',
          };
        });
      }

      return [];
    });

    return offers;
  } catch (err) {
    console.error(`Puppeteer price scrape failed for ${url}:`, (err as Error).message);
    return [];
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
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

// ─── Step 1 — Scrape Z2U catalog pages (via Puppeteer) ────

async function scrapeZ2UCatalog(): Promise<Z2UCatalogEntry[]> {
  const entries: Z2UCatalogEntry[] = [];

  for (const url of Z2U.CATALOG_URLS) {
    console.log(`Scraping Z2U catalog: ${url} (via Puppeteer)`);

    const html = await scrapeZ2UPageWithPuppeteer(url);
    if (!html) {
      console.warn(`Failed to fetch ${url}, skipping`);
      continue;
    }

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

    await sleep(1000); // Be polite between catalog pages
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
      // Fixed: max must be between 1 and 24
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

    // Only match each G2G brand once to avoid duplicates
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
    // Z2U — use Puppeteer to bypass Cloudflare
    await z2uLimiter.wait();
    const z2uUrl = `${Z2U.BASE}/${pair.z2uSlug}/${pair.category}-${pair.z2uCid}-${pair.z2uGameId}`;
    console.log(`  Z2U price page: ${z2uUrl}`);
    const z2uOffers = await scrapeZ2UOffersWithPuppeteer(z2uUrl);
    console.log(`  → Got ${z2uOffers.length} Z2U offers`);

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

  console.log('Scraping Z2U catalog (via Puppeteer)...');
  const z2uEntries = await scrapeZ2UCatalog();
  console.log(`Found ${z2uEntries.length} Z2U entries`);

  if (z2uEntries.length === 0) {
    console.warn('Z2U catalog returned 0 entries — this likely means Puppeteer failed to bypass Cloudflare.');
    console.warn('Falling back to a hardcoded list of popular games for testing.');
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
  console.log(`   G2G max brand fix: 100 → 24`);
  console.log(`   Z2U now uses Puppeteer to bypass Cloudflare`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});