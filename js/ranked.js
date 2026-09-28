// 排位對戰：假裝配對到其他玩家（實際上都是 AI，強度不一）
import { AI_DECKS } from './data/decks.js';

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
    deck: pick(AI_DECKS),
    thinkDelay: { easy: 900, normal: 750, hard: 600 }[level] + Math.floor(Math.random() * 500),
    chatty: Math.random() < 0.75,
  };
}
// 積分變化：連勝加分
export function pointsDelta(won, streak) {
  if (won) return 25 + Math.min(15, Math.max(0, streak) * 5);
  return -15;
}
