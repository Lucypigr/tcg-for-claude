// 排位對戰：假裝配對到其他玩家（實際上都是 AI，強度不一）
import { AI_DECKS, STARTER_DECKS } from './data/decks.js';
import { CARDS } from './data/cards.js';
import { validateDeck, ruleName, isBasicPokemon, BASIC_ENERGY_ID, CARD_MAP } from './engine/cards.js';

// 牌位（依積分）
export const TIERS = [
  { name: '新手', min: 0, icon: '🔰', color: '#7fb8ff' },
  { name: '怪獸球', min: 100, icon: '🔴', color: '#ff6b6b' },
  { name: '超級球', min: 300, icon: '🔵', color: '#4d8cff' },
  { name: '高級球', min: 600, icon: '🟡', color: '#ffd23f' },
  { name: '大師球', min: 1000, icon: '🟣', color: '#c77dff' },
];
export function tierOf(pts) {
  let t = TIERS[0];
  for (const x of TIERS) if (pts >= x.min) t = x;
  return t;
}
export function tierIndex(pts) { return TIERS.indexOf(tierOf(pts)); }
export const RANK_REWARD = { win: 250, lose: 50 };

// 對手強度：牌位越高，遇到強敵的機率越高
const LEVEL_WEIGHT = [
  { easy: 0.6, normal: 0.35, hard: 0.05 },
  { easy: 0.4, normal: 0.45, hard: 0.15 },
  { easy: 0.25, normal: 0.5, hard: 0.25 },
  { easy: 0.12, normal: 0.48, hard: 0.4 },
  { easy: 0.05, normal: 0.35, hard: 0.6 },
];
const pick = a => a[Math.floor(Math.random() * a.length)];
function roll(weights) {
  let r = Math.random();
  for (const [k, p] of Object.entries(weights)) if ((r -= p) < 0) return k;
  return Object.keys(weights).pop();
}

const NAME_A = ['小智', '阿明', '皮卡控', '夜貓', '卡牌狂', '噴火龍信徒', '伊布迷', '路卡利歐', '沙奈朵粉', '小霞', '阿哲', '胖丁', '耿鬼', '卡比獸', '喵喵', '木木梟', '太晶', '寶可夢大師', '訓練家', '道館主'];
const NAME_B = ['', '', '_TW', '0520', '99', '_yo', '君', '醬', 'Q', '2025', '_888', '大大', '本人', '不睡覺', '小隊長', '_Pro', '123', '7'];
const NAME_EN = ['Leo', 'Mika', 'Kevin', 'Ash', 'Yuki', 'Ray', 'Jin', 'Nina', 'Kai', 'Sora', 'Momo', 'Ken', 'Lulu', 'Eason', 'Ivy'];
const AVATARS = ['🐭', '🐱', '🦊', '🐶', '🐸', '🐼', '🐧', '🦉', '🐉', '🔥', '💧', '⚡', '🌿', '🌙', '⭐', '🎮', '🍙', '🧢'];
export const EMOTES = {
  start: ['請多指教！', '你好～', '來吧！', '👋', '請多多指教🙏', '衝啊！'],
  ko: ['抱歉啦😅', '嘿嘿', '好耶！', '⚡⚡⚡', '這招不錯吧'],
  hurt: ['哇…', '好痛😣', '可惡！', '你好強', '😱'],
  win: ['GG', 'GG！謝謝指教', 'GG 好玩', 'gg'],
  lose: ['GG', 'GG 你好強！', 'gg…下次再來', 'GG 👍'],
};
export const emote = kind => pick(EMOTES[kind]);

// 產生一位對手
export function makeOpponent(myPts) {
  const tier = tierIndex(myPts);
  const level = roll(LEVEL_WEIGHT[tier]);
  const name = Math.random() < 0.3 ? pick(NAME_EN) + pick(['', '_', '.']) + Math.floor(Math.random() * 1000) : pick(NAME_A) + pick(NAME_B);
  // 對手積分：接近自己的積分，強的對手稍高
  const shift = { easy: -60, normal: 0, hard: 80 }[level];
  const pts = Math.max(0, Math.round(myPts + shift + (Math.random() - 0.5) * 140));
  const games = 20 + Math.floor(Math.random() * 400);
  const rate = { easy: 0.38, normal: 0.5, hard: 0.62 }[level] + (Math.random() - 0.5) * 0.12;
  return {
    name, pts, level,
    avatar: pick(AVATARS),
    tier: tierOf(pts),
    games, winRate: Math.round(rate * 100),
    deck: makeDeck(level, name),
    thinkDelay: { easy: 900, normal: 750, hard: 600 }[level] + Math.floor(Math.random() * 500),
    chatty: Math.random() < 0.75,
  };
}
// 積分變化：連勝加分
export function pointsDelta(won, streak) {
  if (won) return 25 + Math.min(15, Math.max(0, streak) * 5);
  return -15;
}

// ================= 對手牌組 =================
// 依對手強度混合：環境牌組、自己改過的環境牌組、起始牌組、亂組的牌
const DECK_STYLE = {
  easy: { starter: 0.35, messy: 0.4, tweaked: 0.15, meta: 0.1 },
  normal: { starter: 0.1, messy: 0.15, tweaked: 0.35, meta: 0.4 },
  hard: { tweaked: 0.25, meta: 0.75 },
};
const POOL = CARDS.filter(c => !c.variant && !(c.cat === 'E' && c.energy === 'basic'));
const POKES = POOL.filter(c => c.cat === 'P' && !c.fossil);
const TRAINERS = POOL.filter(c => c.cat !== 'P');
const HOMEBREW = ['我的最愛', '亂組的', '隨便玩玩', '新手套牌改', '試作一號', '寶可夢大集合', '可愛就是正義', '抽到什麼放什麼', '週末用', '實驗中', '爸爸幫我組的', '能量很多'];
const count = d => Object.values(d).reduce((a, b) => a + b, 0);
function byName(d, c) { const n = ruleName(c); return Object.entries(d).reduce((k, [id, x]) => k + (ruleName(CARD_MAP.get(id)) === n ? x : 0), 0); }
function addCard(d, c, n) {
  if (c.ace) { if (Object.keys(d).some(id => CARD_MAP.get(id).ace)) return; n = 1; }
  n = Math.min(n, 4 - byName(d, c));
  if (n > 0) d[c.id] = (d[c.id] || 0) + n;
}
function lineOf(c) {
  const line = [c];
  let cur = c;
  while (cur.stage > 0) { const prev = POKES.find(x => x.name === cur.from); if (!prev) break; line.unshift(prev); cur = prev; }
  return line;
}
// 補滿或刪減到60張（優先動基本能量）
function fixTo60(d, types) {
  const et = [...types].filter(t => BASIC_ENERGY_ID[t]);
  if (!et.length) et.push(pick(Object.keys(BASIC_ENERGY_ID)));
  let i = 0;
  while (count(d) < 60) { const id = BASIC_ENERGY_ID[et[i++ % et.length]]; d[id] = (d[id] || 0) + 1; }
  while (count(d) > 60) {
    const ids = Object.keys(d);
    const k = ids.find(id => CARD_MAP.get(id).cat === 'E' && CARD_MAP.get(id).energy === 'basic' && d[id] > 3) || pick(ids.filter(id => !isBasicPokemon(CARD_MAP.get(id)) || d[id] > 1));
    d[k]--; if (!d[k]) delete d[k];
  }
  return d;
}
// 亂組的牌：寶可夢種類很多、進化線不完整、訓練家隨便放、能量比例怪
function messyDeck() {
  const d = {};
  const types = new Set();
  const lines = 3 + Math.floor(Math.random() * 5);
  for (let i = 0; i < lines; i++) {
    const line = lineOf(pick(POKES));
    // 有時候少放進化前的寶可夢（不成形）
    const broken = Math.random() < 0.3 && line.length > 1;
    for (const [j, x] of line.entries()) {
      if (broken && j === 0) continue;
      addCard(d, x, 1 + Math.floor(Math.random() * 3));
      types.add(x.type);
    }
  }
  const nTrainers = 8 + Math.floor(Math.random() * 20);
  for (let i = 0; i < nTrainers; i++) addCard(d, pick(TRAINERS), 1 + Math.floor(Math.random() * 2));
  // 能量屬性有時會多放一種用不到的
  if (Math.random() < 0.4) types.add(pick(Object.keys(BASIC_ENERGY_ID)));
  return fixTo60(d, types);
}
// 改過的環境牌組：拿掉幾張，換成自己喜歡的卡
function tweakedDeck(base) {
  const d = { ...base.cards };
  const swaps = 3 + Math.floor(Math.random() * 8);
  const types = new Set(Object.keys(d).map(id => CARD_MAP.get(id)).filter(c => c.cat === 'P').map(c => c.type));
  for (let i = 0; i < swaps; i++) {
    const ids = Object.keys(d).filter(id => !isBasicPokemon(CARD_MAP.get(id)) || d[id] > 1);
    const k = pick(ids);
    d[k]--; if (!d[k]) delete d[k];
  }
  const want = count(base.cards) - count(d);
  for (let i = 0; i < want * 2 && count(d) < 60; i++) {
    const c = Math.random() < 0.5 ? pick(TRAINERS) : pick(POKES.filter(x => x.stage === 0 && (types.has(x.type) || Math.random() < 0.2)));
    addCard(d, c, 1);
  }
  return fixTo60(d, types);
}
function makeDeck(level, owner) {
  const style = roll(DECK_STYLE[level]);
  let deck;
  if (style === 'meta') deck = { ...pick(AI_DECKS) };
  else if (style === 'starter') {
    const b = pick(STARTER_DECKS);
    deck = { ...b, name: Math.random() < 0.5 ? b.name : `${b.name}（改）`, cards: Math.random() < 0.5 ? b.cards : tweakedDeck(b) };
  } else if (style === 'tweaked') {
    const b = pick(AI_DECKS);
    deck = { ...b, name: `${b.name.replace(/・.*/, '')}${pick(['（自改版）', '（改）', ' 我的版本', ' v2', '（實驗）'])}`, cards: tweakedDeck(b) };
  } else {
    let cards;
    for (let i = 0; i < 20; i++) { cards = messyDeck(); if (!validateDeck(cards).length) break; }
    const mons = Object.keys(cards).map(id => CARD_MAP.get(id)).filter(c => c.cat === 'P');
    const star = mons.sort((a, b) => (b.ex ? 100 : 0) + b.hp - ((a.ex ? 100 : 0) + a.hp))[0];
    deck = { name: `${owner}的${pick(HOMEBREW)}`, cards, cover: star?.id, desc: '' };
  }
  // 保險：不合法的話改用環境牌組
  if (validateDeck(deck.cards).length) deck = { ...pick(AI_DECKS) };
  deck.style = style;
  return deck;
}
