// 商店：卡包定義與開包
import { CARDS } from './data/cards.js';
import { isBasicEnergy } from './engine/cards.js';
import { spend, addCards } from './store.js';

const STARTER_SETS = new Set(['SVD', 'SVC', 'SVQP']);
const STAPLES = ['SVD-117', 'SVD-118', 'SVD-119', 'SVD-120', 'SVD-122', 'SVD-129', 'SVD-130', 'SVD-135', 'SVD-138'];

const notEnergy = c => !isBasicEnergy(c) && !c.variant;
const basicPool = CARDS.filter(c => STARTER_SETS.has(c.set) && notEnergy(c));
// 超電突圍中原本就收錄於環境包的卡
const SV8_META = ['SV8-034', 'SV8-035', 'SV8-036', 'SV8-095', 'SV8-102', 'SV8-103', 'SV8-104', 'SV8-105', 'SV8-106'];
const metaPool = CARDS.filter(c => ((!STARTER_SETS.has(c.set) && c.set !== 'SV8' && c.set !== 'SV8a' && c.set !== 'M3') || STAPLES.includes(c.id) || SV8_META.includes(c.id)) && notEnergy(c));
const sv8Pool = CARDS.filter(c => c.set === 'SV8' && notEnergy(c));
const sv8aPool = CARDS.filter(c => c.set === 'SV8a' && notEnergy(c));
const m3Pool = CARDS.filter(c => c.set === 'M3' && notEnergy(c));
const exPool = CARDS.filter(c => notEnergy(c) && (c.rarity !== 'C'));
// 特別版（插畫/全圖/金卡）：效果與一般版相同，低機率取代卡包中的一張卡
const variantPool = set => CARDS.filter(c => c.variant && (!set || c.set === set));
const VARIANT_WEIGHT = { AR: 0.6, SR: 0.28, SAR: 0.1, UR: 0.02 };

export const PACKS = [
  {
    id: 'basic',
    name: '朱&紫 基本擴充包',
    desc: '收錄「ex初階牌組」「ex初階牌組 皮卡丘 (SVQP)」與「皮卡丘ex起始組合」的卡片，適合補強基礎牌組。',
    price: 150,
    size: 5,
    color: '#e8413c',
    pool: basicPool,
    slots: [{ C: 1 }, { C: 1 }, { C: 1 }, { U: 1 }, { R: 0.68, RR: 0.32 }],
  },
  {
    id: 'meta',
    name: '頂尖環境擴充包',
    desc: '收錄多龍巴魯托ex、沙奈朵ex、超級路卡利歐ex、噴火龍ex等環境主流卡與ACE SPEC。',
    price: 300,
    size: 5,
    color: '#7a4bd6',
    pool: metaPool,
    slots: [{ C: 1 }, { C: 0.5, U: 0.5 }, { U: 1 }, { U: 0.6, R: 0.4 }, { R: 0.55, RR: 0.33, ACE: 0.08, SR: 0.04 }],
  },
  {
    id: 'sv8',
    name: '超電突圍 擴充包',
    desc: '台灣官方擴充包「超電突圍」(SV8) 全卡收錄：皮卡丘ex、請假王ex、三首惡龍ex、噬沙堡爺ex、米立龍ex等。約 15% 機率開出特別插畫版（AR／SR／SAR／UR）。',
    price: 250,
    size: 5,
    color: '#f2b705',
    pool: sv8Pool,
    variants: variantPool('SV8'),
    variantRate: 0.15,
    slots: [{ C: 1 }, { C: 1 }, { C: 0.6, U: 0.4 }, { U: 1 }, { R: 0.6, RR: 0.33, ACE: 0.07 }],
  },
  {
    id: 'sv8a',
    name: '太晶慶典 強化擴充包',
    desc: '台灣官方強化擴充包「太晶慶典」(SV8a)：伊布家族ex、太樂巴戈斯ex、月月熊 赫月ex、各種古代／未來寶可夢與ACE SPEC。約 20% 機率開出特別插畫版。',
    price: 350,
    size: 5,
    color: '#39c5d8',
    pool: sv8aPool,
    variants: variantPool('SV8a'),
    variantRate: 0.2,
    slots: [{ C: 1 }, { C: 0.6, U: 0.4 }, { U: 1 }, { U: 0.6, R: 0.4 }, { RR: 0.8, ACE: 0.2 }],
  },
  {
    id: 'm3',
    name: '虛無歸零 擴充包',
    desc: '台灣官方擴充包「虛無歸零」(M3)：超級基格爾德ex、超級寶石海星ex、超級皮可西ex、伊裴爾塔爾ex、化石寶可夢等。約 15% 機率開出特別插畫版。',
    price: 280,
    size: 5,
    color: '#2f8a57',
    pool: m3Pool,
    variants: variantPool('M3'),
    variantRate: 0.15,
    slots: [{ C: 1 }, { C: 1 }, { C: 0.6, U: 0.4 }, { U: 1 }, { R: 0.62, RR: 0.38 }],
  },
  {
    id: 'ex',
    name: '寶可夢ex 特選包',
    desc: '每包保證1張寶可夢ex（RR以上），其他4張為U以上的稀有卡。約 12% 機率開出特別插畫版。',
    price: 600,
    size: 5,
    color: '#d4a017',
    pool: exPool,
    variants: variantPool(),
    variantRate: 0.12,
    slots: [{ U: 1 }, { U: 0.7, R: 0.3 }, { U: 0.5, R: 0.5 }, { R: 0.8, ACE: 0.2 }, { RR: 0.9, SR: 0.1 }],
  },
];

const ORDER = ['C', 'U', 'R', 'RR', 'SR', 'ACE'];
function rollRarity(slot) {
  let r = Math.random();
  for (const [k, p] of Object.entries(slot)) { if ((r -= p) < 0) return k; }
  return Object.keys(slot).pop();
}
function pickFrom(pool, rarity, taken) {
  let cands = pool.filter(c => c.rarity === rarity && !taken.has(c.id));
  // 找不到該稀有度時，往下降級
  let i = ORDER.indexOf(rarity);
  while (!cands.length && i > 0) { i--; cands = pool.filter(c => c.rarity === ORDER[i] && !taken.has(c.id)); }
  if (!cands.length) cands = pool;
  return cands[Math.floor(Math.random() * cands.length)];
}

export function openPack(packId) {
  const pack = PACKS.find(p => p.id === packId);
  if (!pack) throw new Error('未知卡包');
  if (!spend(pack.price)) return null;
  const taken = new Set();
  const cards = pack.slots.map(slot => {
    const c = pickFrom(pack.pool, rollRarity(slot), taken);
    taken.add(c.id);
    return c;
  });
  // 特別版：取代第4張卡
  if (pack.variants?.length && Math.random() < pack.variantRate) {
    const weight = Object.fromEntries(Object.entries(VARIANT_WEIGHT).filter(([k]) => pack.variants.some(c => c.rarity === k)));
    const sum = Object.values(weight).reduce((a, b) => a + b, 0);
    for (const k in weight) weight[k] /= sum;
    const rar = rollRarity(weight);
    const cands = pack.variants.filter(c => c.rarity === rar);
    cards[3] = cands[Math.floor(Math.random() * cands.length)];
  }
  addCards(cards.map(c => c.id));
  return cards;
}

export const RARITY_LABEL = { C: 'C', U: 'U', R: 'R', RR: 'RR', SR: 'SR', ACE: 'ACE SPEC', AR: 'AR', SAR: 'SAR', UR: 'UR' };
// 稀有度由低到高（用於排序與開包演出）
export const RARITY_RANK = { C: 0, U: 1, R: 2, ACE: 3, RR: 4, AR: 5, SR: 6, SAR: 7, UR: 8 };
// 閃卡：RR 以上與 ACE SPEC
export const isHolo = c => (RARITY_RANK[c.rarity] || 0) >= 3;

// 圖鑑用：每包開出指定卡片的機率（依各欄位稀有度機率與降級規則估算）
const chanceCache = new Map();
function rarityCounts(pool) {
  const n = {};
  for (const c of pool) n[c.rarity] = (n[c.rarity] || 0) + 1;
  return n;
}
function resolveRarity(counts, k) {
  let i = ORDER.indexOf(k);
  while (i > 0 && !counts[ORDER[i]]) i--;
  return ORDER[i];
}
export function dropChance(pack, c) {
  const key = `${pack.id}:${c.id}`;
  if (chanceCache.has(key)) return chanceCache.get(key);
  let chance = 0;
  if (c.variant) {
    if (pack.variants?.includes(c)) {
      const counts = rarityCounts(pack.variants);
      const w = Object.fromEntries(Object.entries(VARIANT_WEIGHT).filter(([k]) => counts[k]));
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      chance = pack.variantRate * (w[c.rarity] || 0) / sum / counts[c.rarity];
    }
  } else if (pack.pool.includes(c)) {
    const counts = rarityCounts(pack.pool);
    let miss = 1;
    for (const slot of pack.slots) {
      let p = 0;
      for (const [k, v] of Object.entries(slot)) if (resolveRarity(counts, k) === c.rarity) p += v;
      miss *= 1 - p / counts[c.rarity];
    }
    chance = 1 - miss;
  }
  chanceCache.set(key, chance);
  return chance;
}
// 可以開出這張卡的卡包（機率高的在前）
export function packsFor(c) {
  return PACKS.map(p => ({ pack: p, chance: dropChance(p, c) })).filter(x => x.chance > 0).sort((a, b) => b.chance - a.chance);
}
