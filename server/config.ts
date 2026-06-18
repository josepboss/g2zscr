export const G2G = {
  BASE: 'https://sls.g2g.com',
  CATEGORIES: {
    accounts: {
      id: '5830014a-b974-45c6-9672-b51e83112fb7',
      serviceId: 'f6a1aba5-473a-4044-836a-8968bbab16d7',
    },
  },
  HEADERS: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    Referer: 'https://www.g2g.com/',
    Accept: 'application/json',
  },
};

export const Z2U = {
  BASE: 'https://www.z2u.com',
  CATALOG_URLS: [
    'https://www.z2u.com/catalog/accounts',
    'https://www.z2u.com/catalog/gold',
    'https://www.z2u.com/catalog/items',
    'https://www.z2u.com/catalog/boosting',
  ],
  CID_MAP: { accounts: 5, gold: 2, items: 1, boosting: 4 } as Record<string, number>,
  HEADERS: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    Referer: 'https://www.z2u.com/',
    'X-Requested-With': 'XMLHttpRequest',
  },
};

export const ARBITRAGE = {
  DELAY_MS: 800,
  FEE: 0.07,
  CONCURRENCY: 3,
  CACHE_TTL_MS: 6 * 60 * 60 * 1000, // 6 hours
};

export const PUPPETEER = {
  HEADLESS: true,
  SLOW_MO_MS: 50,
  VIEWPORT: { width: 1920, height: 1080 },
  USER_AGENT:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
};