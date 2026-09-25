import { CARDS } from '../data/cards.js';

export const CARD_MAP = new Map(CARDS.map(c => [c.id, c]));

export function cardData(cid) {
  const c = CARD_MAP.get(cid);
  if (!c) throw new Error(`未知的卡片: ${cid}`);
  return c;
}

export const TYPE_NAMES = { G: '草', R: '火', W: '水', L: '雷', P: '超', F: '鬥', D: '惡', M: '鋼', N: '龍', C: '無' };
export const BASIC_ENERGY_ID = { G: 'SVD-GRA', R: 'SVD-FIR', W: 'SVD-WAT', L: 'SVD-LIG', P: 'SVD-PSY', F: 'SVD-FIG', D: 'SVD-DAR', M: 'SVD-MET' };

export const isPokemon = c => c.cat === 'P';
export const isBasicPokemon = c => c.cat === 'P' && c.stage === 0;
export const isTrainer = c => c.cat === 'T';
export const isEnergy = c => c.cat === 'E';
export const isBasicEnergy = c => c.cat === 'E' && c.energy === 'basic';
export const hasRule = c => c.cat === 'P' && (c.ex || c.mega);
export const prizeValue = c => (c.mega ? 3 : c.ex ? 2 : 1);

export function stageName(c) {
  if (c.cat === 'P') return ['基礎', '1階進化', '2階進化'][c.stage];
  if (c.cat === 'T') return { Item: '物品', Supporter: '支援者', Stadium: '競技場', Tool: '寶可夢道具' }[c.trainer] || '訓練家';
  return c.energy === 'basic' ? '基本能量' : '特殊能量';
}

// 同名判定：「博士的研究（奧琳博士）」與「博士的研究（弗圖博士）」視為同名卡
export const ruleName = c => c.name.replace(/（[^）]*）|\([^)]*\)/g, '');

// 牌組檢查：60張、同名最多4張（基本能量除外）、ACE SPEC最多1張、至少1隻基礎寶可夢
export function validateDeck(list) {
  const errors = [];
  let total = 0, ace = 0, basics = 0;
  const byName = new Map();
  for (const [cid, n] of Object.entries(list)) {
    if (!n) continue;
    const c = CARD_MAP.get(cid);
    if (!c) { errors.push(`未知卡片 ${cid}`); continue; }
    total += n;
    if (c.ace) ace += n;
    if (isBasicPokemon(c)) basics += n;
    if (!isBasicEnergy(c)) { const nm = ruleName(c); byName.set(nm, (byName.get(nm) || 0) + n); }
  }
  if (total !== 60) errors.push(`牌組必須剛好60張（目前${total}張）`);
  for (const [name, n] of byName) if (n > 4) errors.push(`「${name}」最多只能放4張（目前${n}張）`);
  if (ace > 1) errors.push(`ACE SPEC卡最多只能放1張`);
  if (basics < 1) errors.push('至少需要1張基礎寶可夢');
  return errors;
}
