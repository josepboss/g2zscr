export interface HardcodedGame {
  gameName: string;
  category: 'gold' | 'items' | 'accounts' | 'boosting';
  z2uSlug: string;
  z2uGameId: number;
  z2uCid: number;
}

// These were manually collected from Z2U catalog URLs because Z2U's /catalog/ pages
// return 403 from server IPs (Cloudflare protection).
// Each entry: the full slug from the Z2U listing page URL.
export const HARDCODED_PAIRS: HardcodedGame[] = [
  // ── Gold / Currency ──────────────────────────────
  { gameName: 'OSRS Gold',            category: 'gold',     z2uSlug: 'old-school-runescape/gold-2-18067',   z2uGameId: 18067, z2uCid: 2 },
  { gameName: 'WoW Gold',            category: 'gold',     z2uSlug: 'world-of-warcraft/gold-2-17443',      z2uGameId: 17443, z2uCid: 2 },
  { gameName: 'RS3 Gold',            category: 'gold',     z2uSlug: 'runescape/gold-2-16122',              z2uGameId: 16122, z2uCid: 2 },
  { gameName: 'Albion Online Silver',category: 'gold',     z2uSlug: 'albion-online/silver-2-17965',        z2uGameId: 17965, z2uCid: 2 },
  { gameName: 'New World Coins',     category: 'gold',     z2uSlug: 'new-world/coins-2-18064',             z2uGameId: 18064, z2uCid: 2 },
  { gameName: 'Throne & Liberty Gold',category: 'gold',    z2uSlug: 'throne-and-liberty/gold-2-37490',     z2uGameId: 37490, z2uCid: 2 },
  { gameName: 'EVE Online ISK',      category: 'gold',     z2uSlug: 'eve-online/isk-2-15857',              z2uGameId: 15857, z2uCid: 2 },
  { gameName: 'Lost Ark Gold',       category: 'gold',     z2uSlug: 'lost-ark/gold-2-24489',              z2uGameId: 24489, z2uCid: 2 },
  { gameName: 'BDO Silver',          category: 'gold',     z2uSlug: 'black-desert/silver-2-16515',         z2uGameId: 16515, z2uCid: 2 },
  { gameName: 'Elder Scrolls Online',category: 'gold',     z2uSlug: 'elder-scrolls-online/gold-2-17938',   z2uGameId: 17938, z2uCid: 2 },

  // ── Items ────────────────────────────────────────
  { gameName: 'Dota 2',             category: 'items',    z2uSlug: 'dota-2/items-1-16809',                z2uGameId: 16809, z2uCid: 1 },
  { gameName: 'CS2',               category: 'items',    z2uSlug: 'counter-strike-2/items-1-32033',       z2uGameId: 32033, z2uCid: 1 },
  { gameName: 'Path of Exile',     category: 'items',    z2uSlug: 'path-of-exile/items-1-15481',          z2uGameId: 15481, z2uCid: 1 },
  { gameName: 'Rust',              category: 'items',    z2uSlug: 'rust/items-1-26584',                   z2uGameId: 26584, z2uCid: 1 },
  { gameName: 'Escape from Tarkov',category: 'items',    z2uSlug: 'escape-from-tarkov/items-1-22205',     z2uGameId: 22205, z2uCid: 1 },
  { gameName: 'Warframe',          category: 'items',    z2uSlug: 'warframe/items-1-15517',               z2uGameId: 15517, z2uCid: 1 },

  // ── Accounts ─────────────────────────────────────
  { gameName: 'League of Legends',           category: 'accounts', z2uSlug: 'league-of-legends/accounts-5-16973',              z2uGameId: 16973, z2uCid: 5 },
  { gameName: 'Valorant',                    category: 'accounts', z2uSlug: 'valorant/accounts-5-28475',                       z2uGameId: 28475, z2uCid: 5 },
  { gameName: 'Call of Duty Black Ops 7',    category: 'accounts', z2uSlug: 'call-of-duty-black-ops-7/accounts-5-35189',      z2uGameId: 35189, z2uCid: 5 },
  { gameName: 'Fortnite',                    category: 'accounts', z2uSlug: 'fortnite/accounts-5-15677',                       z2uGameId: 15677, z2uCid: 5 },
  { gameName: 'World of Warcraft',           category: 'accounts', z2uSlug: 'world-of-warcraft/accounts-5-17443',              z2uGameId: 17443, z2uCid: 5 },
  { gameName: 'Genshin Impact',              category: 'accounts', z2uSlug: 'genshin-impact/accounts-5-21866',                z2uGameId: 21866, z2uCid: 5 },
  { gameName: 'Roblox',                      category: 'accounts', z2uSlug: 'roblox/accounts-5-15597',                        z2uGameId: 15597, z2uCid: 5 },
  { gameName: 'EA Sports FC 26',             category: 'accounts', z2uSlug: 'ea-sports-fc-26/accounts-5-35475',              z2uGameId: 35475, z2uCid: 5 },
  { gameName: 'Old School Runescape',        category: 'accounts', z2uSlug: 'old-school-runescape/accounts-5-18067',          z2uGameId: 18067, z2uCid: 5 },
  { gameName: 'Marvel Rivals',               category: 'accounts', z2uSlug: 'marvel-rivals/accounts-5-37284',                 z2uGameId: 37284, z2uCid: 5 },
  { gameName: 'Diablo IV',                   category: 'accounts', z2uSlug: 'diablo-4/accounts-5-32789',                     z2uGameId: 32789, z2uCid: 5 },
  { gameName: 'Clash of Clans',              category: 'accounts', z2uSlug: 'clash-of-clans/accounts-5-15704',               z2uGameId: 15704, z2uCid: 5 },

  // ── Boosting ─────────────────────────────────────
  { gameName: 'League of Legends',           category: 'boosting', z2uSlug: 'league-of-legends/boosting-4-16973',             z2uGameId: 16973, z2uCid: 4 },
  { gameName: 'Valorant',                    category: 'boosting', z2uSlug: 'valorant/boosting-4-28475',                      z2uGameId: 28475, z2uCid: 4 },
  { gameName: 'World of Warcraft',           category: 'boosting', z2uSlug: 'world-of-warcraft/boosting-4-17443',             z2uGameId: 17443, z2uCid: 4 },
  { gameName: 'Destiny 2',                   category: 'boosting', z2uSlug: 'destiny-2/boosting-4-22035',                    z2uGameId: 22035, z2uCid: 4 },
  { gameName: 'Call of Duty Black Ops 7',    category: 'boosting', z2uSlug: 'call-of-duty-black-ops-7/boosting-4-35189',     z2uGameId: 35189, z2uCid: 4 },
  { gameName: 'Fortnite',                    category: 'boosting', z2uSlug: 'fortnite/boosting-4-15677',                      z2uGameId: 15677, z2uCid: 4 },
];