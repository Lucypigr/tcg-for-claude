// 商店：卡包定義與開包
import { CARDS } from './data/cards.js';
import { isBasicEnergy } from './engine/cards.js';
import { spend, addCards } from './store.js';

const STARTER_SETS = new Set(['SVD', 'SVC']);
const STAPLES = ['SVD-117', 'SVD-118', 'SVD-119', 'SVD-120', 'SVD-122', 'SVD-129', 'SVD-130', 'SVD-135', 'SVD-138'];

const notEnergy = c => !isBasicEnergy(c);
const basicPool = CARDS.filter(c => STARTER_SETS.has(c.set) && notEnergy(c));
const metaPool = CARDS.filter(c => (!STARTER_SETS.has(c.set) || STAPLES.includes(c.id)) && notEnergy(c));
const exPool = CARDS.filter(c => notEnergy(c) && (c.rarity !== 'C'));

export const PACKS = [
  {
    id: 'basic',
    name: '朱&紫 基本擴充包',
    desc: '收錄「ex初階牌組」與「皮卡丘ex起始組合」的卡片，適合補強基礎牌組。',
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
    id: 'ex',
    name: '寶可夢ex 特選包',
    desc: '每包保證1張寶可夢ex（RR以上），其他4張為U以上的稀有卡。',
    price: 600,
    size: 5,
    color: '#d4a017',
    pool: exPool,
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
  addCards(cards.map(c => c.id));
  return cards;
}

export const RARITY_LABEL = { C: 'C', U: 'U', R: 'R', RR: 'RR', SR: 'SR', ACE: 'ACE SPEC' };
