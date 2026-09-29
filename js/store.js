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

// ================= 多存檔 =================
// 存檔清單存在 INDEX_KEY；第1個存檔沿用舊的 KEY（相容舊版），其他存檔為 KEY#id
const INDEX_KEY = 'ptcg-ai-battle-slots';
export const MAX_SLOTS = 8;
const slotKey = id => (id === 's1' ? KEY : `${KEY}#${id}`);
let index = null;
function loadIndex() {
  if (index) return index;
  try { index = JSON.parse(localStorage.getItem(INDEX_KEY)); } catch { index = null; }
  if (!index?.slots?.length) index = { active: 's1', slots: [{ id: 's1', name: '存檔 1', created: Date.now(), updated: Date.now() }] };
  if (!index.slots.some(x => x.id === index.active)) index.active = index.slots[0].id;
  return index;
}
function saveIndex() { try { localStorage.setItem(INDEX_KEY, JSON.stringify(index)); } catch { /* ignore */ } }
function readSlot(id) {
  try { const raw = localStorage.getItem(slotKey(id)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function newId() { let i = 1; while (loadIndex().slots.some(x => x.id === `s${i}`)) i++; return `s${i}`; }

export function activeSlot() { const ix = loadIndex(); return ix.slots.find(x => x.id === ix.active); }
// 所有存檔與摘要（金幣、收藏種類、勝場、已開卡包）
export function listSlots() {
  const ix = loadIndex();
  return ix.slots.map(x => {
    const d = x.id === ix.active ? load() : readSlot(x.id);
    const st = d?.stats || {};
    return {
      ...x, active: x.id === ix.active, empty: !d,
      coins: d?.coins ?? 500,
      cards: d ? Object.values(d.collection || {}).filter(n => n > 0).length : 0,
      wins: Object.values(st).reduce((a, r) => a + (r?.[0] || 0), 0),
      losses: Object.values(st).reduce((a, r) => a + (r?.[1] || 0), 0),
      packs: d?.packsOpened || 0,
    };
  });
}
export function switchSlot(id) {
  const ix = loadIndex();
  if (!ix.slots.some(x => x.id === id)) return;
  if (state) save();
  ix.active = id; saveIndex();
  state = null;
  return load();
}
function addSlot(name, data) {
  const ix = loadIndex();
  if (ix.slots.length >= MAX_SLOTS) return null;
  const id = newId();
  ix.slots.push({ id, name: name || `存檔 ${ix.slots.length + 1}`, created: Date.now(), updated: Date.now() });
  try { localStorage.setItem(slotKey(id), JSON.stringify(data)); } catch { ix.slots.pop(); return null; }
  saveIndex();
  return id;
}
export function createSlot(name) {
  const d = fresh();
  d.seenIntro = true;
  const id = addSlot(name, d);
  if (id) switchSlot(id);
  return id;
}
export function duplicateSlot(id) {
  const src = id === loadIndex().active ? load() : readSlot(id);
  const name = loadIndex().slots.find(x => x.id === id)?.name || '存檔';
  return src ? addSlot(`${name}（複製）`, JSON.parse(JSON.stringify(src))) : null;
}
export function renameSlot(id, name) {
  const x = loadIndex().slots.find(y => y.id === id);
  if (x && name.trim()) { x.name = name.trim().slice(0, 20); saveIndex(); }
}
export function deleteSlot(id) {
  const ix = loadIndex();
  if (ix.slots.length <= 1) return false;
  ix.slots = ix.slots.filter(x => x.id !== id);
  try { localStorage.removeItem(slotKey(id)); } catch { /* ignore */ }
  if (ix.active === id) { ix.active = ix.slots[0].id; state = null; }
  saveIndex();
  return true;
}
// 匯出／匯入存檔檔案（換裝置或備份用）
export function exportSlot(id) {
  const d = id === loadIndex().active ? load() : readSlot(id);
  const name = loadIndex().slots.find(x => x.id === id)?.name || '存檔';
  return JSON.stringify({ app: 'ptcg-ai-battle', version: 1, name, exported: new Date().toISOString(), data: d || fresh() });
}
export function importSlot(text) {
  const j = JSON.parse(text);
  const d = j?.app === 'ptcg-ai-battle' ? j.data : j;
  if (!d || typeof d.coins !== 'number' || typeof d.collection !== 'object') throw new Error('不是有效的存檔檔案');
  return addSlot(j.name ? `${j.name}（匯入）` : '匯入的存檔', d);
}

let state = null;
export function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(slotKey(loadIndex().active));
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
  if (!state) return;
  try { localStorage.setItem(slotKey(loadIndex().active), JSON.stringify(state)); } catch { /* 無法存檔時忽略 */ }
  const x = activeSlot();
  if (x) { x.updated = Date.now(); saveIndex(); }
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
// 排位對戰紀錄
export function rankedData() {
  const s = load();
  s.ranked ||= { pts: 0, wins: 0, losses: 0, streak: 0, best: 0 };
  return s.ranked;
}
export function recordRanked(won, delta, coins) {
  const r = rankedData();
  const before = r.pts;
  r.pts = Math.max(0, r.pts + delta);
  if (won) { r.wins++; r.streak = Math.max(0, r.streak) + 1; } else { r.losses++; r.streak = Math.min(0, r.streak) - 1; }
  r.best = Math.max(r.best, r.pts);
  load().coins += coins;
  save();
  return { before, after: r.pts };
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

// 獎勵碼（可重複使用，不分大小寫）
const REWARD_CODES = { yiho: { coins: 50000 } };
export function redeemCode(code) {
  const r = REWARD_CODES[String(code || '').trim().toLowerCase()];
  if (!r) return null;
  load().coins += r.coins;
  save();
  return r;
}
