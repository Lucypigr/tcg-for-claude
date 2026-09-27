// 存檔：金幣、收藏、自訂牌組、戰績（localStorage）
import { STARTER_DECKS } from './data/decks.js';
import { CARD_MAP, isBasicEnergy } from './engine/cards.js';
import { ALIASES } from './data/cards.js';

const KEY = 'ptcg-ai-battle-save-v1';

export const REWARDS = {
  easy: { win: 100, lose: 20, name: '簡單' },
  normal: { win: 200, lose: 40, name: '普通' },
  hard: { win: 350, lose: 60, name: '困難' },
};

function fresh() {
  const collection = {};
  for (const d of STARTER_DECKS) {
    for (const [cid, n] of Object.entries(d.cards)) {
      if (isBasicEnergy(CARD_MAP.get(cid))) continue;
      collection[cid] = (collection[cid] || 0) + n;
    }
  }
  return {
    version: 1,
    coins: 500,
    collection,
    decks: [],
    stats: { easy: [0, 0], normal: [0, 0], hard: [0, 0] },
    packsOpened: 0,
    granted: STARTER_DECKS.map(d => d.id + '@2'),
    lastDeck: STARTER_DECKS[0].id,
    lastLevel: 'normal',
    seenIntro: false,
  };
}

let state = null;
export function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...fresh(), granted: [], ...JSON.parse(raw) } : fresh();
  } catch {
    state = fresh();
  }
  migrate(state);
  return state;
}
// 舊存檔轉換：合併的卡片ID改成保留的ID；新版起始牌組的卡片補發一次
function migrate(s) {
  const remap = obj => {
    for (const [from, to] of Object.entries(ALIASES)) {
      if (obj[from]) { obj[to] = (obj[to] || 0) + obj[from]; delete obj[from]; }
    }
  };
  remap(s.collection);
  for (const d of s.decks) remap(d.cards);
  s.granted ||= [];
  for (const d of STARTER_DECKS) {
    const key = d.id + '@2';
    if (s.granted.includes(key)) continue;
    for (const [cid, n] of Object.entries(d.cards)) {
      if (isBasicEnergy(CARD_MAP.get(cid))) continue;
      s.collection[cid] = Math.max(s.collection[cid] || 0, n);
    }
    s.granted.push(key);
  }
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 無法存檔時忽略 */ }
}
export function reset() {
  state = fresh();
  save();
  return state;
}

export function owned(cid) {
  const c = CARD_MAP.get(cid);
  if (c && isBasicEnergy(c)) return Infinity;
  return load().collection[cid] || 0;
}
export function addCards(cids) {
  const s = load();
  for (const cid of cids) s.collection[cid] = (s.collection[cid] || 0) + 1;
  save();
}
export function addCoins(n) {
  const s = load();
  s.coins += n;
  save();
}
export function spend(n) {
  const s = load();
  if (s.coins < n) return false;
  s.coins -= n;
  save();
  return true;
}
export function recordResult(level, won) {
  const s = load();
  const r = REWARDS[level];
  s.stats[level][won ? 0 : 1]++;
  const coins = won ? r.win : r.lose;
  s.coins += coins;
  save();
  return coins;
}

// 牌組
export function allDecks() {
  const s = load();
  return [
    ...STARTER_DECKS.map(d => ({ ...d, preset: true })),
    ...s.decks,
  ];
}
export function getDeck(id) { return allDecks().find(d => d.id === id); }
export function saveDeck(deck) {
  const s = load();
  const i = s.decks.findIndex(d => d.id === deck.id);
  if (i >= 0) s.decks[i] = deck; else s.decks.push(deck);
  save();
}
export function deleteDeck(id) {
  const s = load();
  s.decks = s.decks.filter(d => d.id !== id);
  if (s.lastDeck === id) s.lastDeck = STARTER_DECKS[0].id;
  save();
}
// 檢查自訂牌組是否超過持有張數
export function missingCards(deck) {
  if (deck.preset) return [];
  const out = [];
  for (const [cid, n] of Object.entries(deck.cards)) {
    const have = owned(cid);
    if (n > have) out.push({ cid, need: n - have });
  }
  return out;
}

// 出售：同一張卡超過4張的部分
export const SELL_PRICE = { C: 5, U: 10, R: 30, RR: 80, SR: 150, ACE: 120, AR: 100, SAR: 300, UR: 400 };
export function extras() {
  const s = load();
  const out = [];
  for (const [cid, n] of Object.entries(s.collection)) {
    if (n > 4) out.push({ cid, n: n - 4, price: SELL_PRICE[CARD_MAP.get(cid)?.rarity] || 5 });
  }
  return out;
}
export function sellExtras() {
  const s = load();
  let coins = 0, count = 0;
  for (const e of extras()) {
    s.collection[e.cid] -= e.n;
    coins += e.n * e.price;
    count += e.n;
  }
  s.coins += coins;
  save();
  return { coins, count };
}
