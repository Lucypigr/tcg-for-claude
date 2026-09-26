// 卡片效果：招式文字自動編譯 + 手動實作的特性/訓練家/能量
import { cardData, isBasicEnergy, isBasicPokemon, isPokemon, hasRule } from './cards.js';
import { CARDS } from '../data/cards.js';

const T2L = { 草: 'G', 火: 'R', 水: 'W', 雷: 'L', 超: 'P', 鬥: 'F', 惡: 'D', 鋼: 'M', 龍: 'N', 無: 'C' };
const COND = { 麻痺: 'paralyzed', 中毒: 'poison', 灼傷: 'burn', 睡眠: 'asleep', 混亂: 'confused' };
const card = (g, inst) => cardData(inst.cid);

// ================= 共用輔助 =================
export async function pick(g, p, cards, { min = 0, max = 1, title, purpose, extra = {} }) {
  if (!cards.length) return [];
  if (max <= 0) return [];
  max = Math.min(max, cards.length);
  min = Math.min(min, max);
  const r = await g.ask(p, { kind: 'cards', title, cards, min, max, purpose, ...extra });
  return r || [];
}
async function pickSlot(g, chooser, slots, { title, purpose, optional = false, target, extra = {} }) {
  if (!slots.length) return null;
  return g.ask(chooser, { kind: 'slot', title, slots, min: optional ? 0 : 1, purpose, target: target ?? chooser.index, ...extra });
}
function fromDeck(g, p, insts) {
  p.deck = p.deck.filter(i => !insts.includes(i));
}
async function searchDeck(g, p, filter, { min = 0, max = 1, title, purpose, dest = 'hand' }) {
  const cands = p.deck.filter(i => filter(card(g, i)));
  const chosen = await pick(g, p, cands, { min: 0, max, title, purpose, extra: { reveal: p.deck.length } });
  fromDeck(g, p, chosen);
  if (dest === 'hand') {
    p.hand.push(...chosen);
    if (chosen.length) g.log(`${p.name}從牌庫將${chosen.map(i => card(g, i).name).join('、')}加入手牌`);
  } else if (dest === 'bench') {
    for (const i of chosen) { g.putOnBench(p, i); g.log(`${p.name}將${card(g, i).name}放到備戰區`); }
  }
  g.shuffle(p.deck);
  return chosen;
}
async function attachEach(g, p, energies, slots, title, purpose = 'attachTarget') {
  for (const e of energies) {
    if (!slots.length) { p.discard.push(e); continue; }
    const s = await pickSlot(g, p, slots, { title: `${title}：${card(g, e).name}`, purpose, extra: { energy: e.cid } });
    s.energy.push(e);
    g.log(`${p.name}將${card(g, e).name}附於${g.top(s).name}身上`);
  }
}
function drawN(g, p, n) {
  const d = g.draw(p, n);
  g.log(`${p.name}抽了${d}張卡`);
}
async function distributeCounters(g, p, slots, total, title) {
  if (!slots.length || total <= 0) return;
  let counts;
  if (slots.length === 1) counts = [total];
  else counts = await g.ask(p, { kind: 'distribute', title, slots, total, purpose: 'counters' });
  counts.forEach((n, i) => g.placeCounters(slots[i], n));
}
const benchOf = p => [...p.bench];
const lettersOf = s => T2L[s];
const isType = (c, t) => c.cat === 'P' && c.type === t;

// ================= 招式文字編譯 =================
// 每個句型回傳 { before, after, est, opts, canUse }
// before(ctx) 在造成傷害前執行（可修改 ctx.base，回傳 false 表示招式失敗）
// after(ctx) 在造成傷害後執行
// est(base, env) 供 AI 估算期望傷害
const PATTERNS = [
  [/^擲1次硬幣若為反面，則這個招式失敗$/, () => ({
    before: ctx => { ctx.data.coin = ctx.g.coin(ctx.me); return ctx.data.coin; },
    est: b => b / 2,
  })],
  [/^若為正面，則在下個對手的回合，這隻寶可夢不會受到招式的傷害與效果的影響$/, () => ({
    after: ctx => { if (ctx.data.coin) ctx.g.addEffect(ctx.attacker, { kind: 'preventAll', turn: ctx.g.turn + 1 }); },
  })],
  [/^擲(\d+)次硬幣，造成正面出現的次數×(\d+)點傷害$/, m => ({
    before: ctx => { let h = 0; for (let i = 0; i < +m[1]; i++) if (ctx.g.coin(ctx.me)) h++; ctx.base = h * +m[2]; },
    est: () => +m[1] * +m[2] / 2,
  })],
  [/^擲硬幣直到出現反面，造成正面出現的次數×(\d+)點傷害$/, m => ({
    before: ctx => { let h = 0; while (ctx.g.coin(ctx.me)) h++; ctx.base = h * +m[1]; },
    est: () => +m[1],
  })],
  [/^擲硬幣直到出現反面，增加正面出現的次數×(\d+)點傷害$/, m => ({
    before: ctx => { let h = 0; while (ctx.g.coin(ctx.me)) h++; ctx.base += h * +m[1]; },
    est: b => b + +m[1],
  })],
  [/^擲1次硬幣若為正面，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.g.coin(ctx.me)) ctx.base += +m[1]; },
    est: b => b + +m[1] / 2,
  })],
  [/^擲與這隻寶可夢身上附加的【(.)】能量的數量相同次數的硬幣，造成正面出現的次數×(\d+)點傷害$/, m => ({
    before: ctx => { const n = ctx.g.countEnergy(ctx.attacker, T2L[m[1]]); let h = 0; for (let i = 0; i < n; i++) if (ctx.g.coin(ctx.me)) h++; ctx.base = h * +m[2]; },
    est: (b, e) => e.g.countEnergy(e.slot, T2L[m[1]]) * +m[2] / 2,
  })],
  [/^增加對手的戰鬥寶可夢身上附加的能量的數量×(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.defender) ctx.base += ctx.g.countEnergy(ctx.defender) * +m[1]; },
    est: (b, e) => b + (e.def ? e.g.countEnergy(e.def) * +m[1] : 0),
  })],
  [/^增加對手的戰鬥寶可夢身上放置的傷害指示物的數量×(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.defender) ctx.base += ctx.defender.damage / 10 * +m[1]; },
    est: (b, e) => b + (e.def ? e.def.damage / 10 * +m[1] : 0),
  })],
  [/^增加這隻寶可夢身上放置的傷害指示物的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base += ctx.attacker.damage / 10 * +m[1]; },
    est: (b, e) => b + e.slot.damage / 10 * +m[1],
  })],
  [/^造成這隻寶可夢身上放置的傷害指示物的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = ctx.attacker.damage / 10 * +m[1]; },
    est: (b, e) => e.slot.damage / 10 * +m[1],
  })],
  [/^減少這隻寶可夢身上放置的傷害指示物的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = Math.max(0, ctx.base - ctx.attacker.damage / 10 * +m[1]); },
    est: (b, e) => Math.max(0, b - e.slot.damage / 10 * +m[1]),
  })],
  [/^造成這隻寶可夢身上附加的【(.)】能量的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = ctx.g.countEnergy(ctx.attacker, T2L[m[1]]) * +m[2]; },
    est: (b, e) => e.g.countEnergy(e.slot, T2L[m[1]]) * +m[2],
  })],
  [/^增加這隻寶可夢身上附加的【(.)】能量的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base += ctx.g.countEnergy(ctx.attacker, T2L[m[1]]) * +m[2]; },
    est: (b, e) => b + e.g.countEnergy(e.slot, T2L[m[1]]) * +m[2],
  })],
  [/^增加對手已經獲得的獎賞卡的張數×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base += (6 - ctx.opp.prizes.length) * +m[1]; },
    est: (b, e) => b + (6 - e.g.opp(e.me).prizes.length) * +m[1],
  })],
  [/^增加自己的備戰區的【(.)】寶可夢的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base += ctx.me.bench.filter(s => ctx.g.top(s).type === T2L[m[1]]).length * +m[2]; },
    est: (b, e) => b + e.me.bench.filter(s => e.g.top(s).type === T2L[m[1]]).length * +m[2],
  })],
  [/^這個招式的傷害不計算弱點$/, () => ({ opts: { noWeakness: true } })],
  [/^這個招式的傷害不計算抵抗力$/, () => ({ opts: { noResistance: true } })],
  [/^若對手的戰鬥寶可夢身上放置有傷害指示物，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.defender?.damage > 0) ctx.base += +m[1]; },
    est: (b, e) => b + (e.def?.damage > 0 ? +m[1] : 0),
  })],
  [/^若對手的戰鬥寶可夢為進化寶可夢，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.defender && ctx.g.top(ctx.defender).stage > 0) ctx.base += +m[1]; },
    est: (b, e) => b + (e.def && e.g.top(e.def).stage > 0 ? +m[1] : 0),
  })],
  [/^造成對手的戰鬥寶可夢【撤退】所需的能量的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = ctx.defender ? ctx.g.retreatCost(ctx.defender) * +m[1] : 0; },
    est: (b, e) => e.def ? e.g.retreatCost(e.def) * +m[1] : 0,
  })],
  [/^造成自己的場上的「(.+)」的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = ctx.g.slots(ctx.me).filter(s => ctx.g.top(s).name === m[1]).length * +m[2]; },
    est: (b, e) => e.g.slots(e.me).filter(s => e.g.top(s).name === m[1]).length * +m[2],
  })],
  [/^若對手剩餘獎賞卡的張數為1張，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.opp.prizes.length === 1) ctx.base += +m[1]; },
    est: (b, e) => b + (e.g.opp(e.me).prizes.length === 1 ? +m[1] : 0),
  })],
  [/^在上個對手的回合，若自己的【(.)】寶可夢因招式的傷害而【昏厥】了，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.me.lastKoByAttackTypes.some(k => k.turn === ctx.g.turn - 1 && k.type === T2L[m[1]])) ctx.base += +m[2]; },
  })],
  [/^這個招式必須在上個自己的回合這隻寶可夢使用了「(.+)」才可使用$/, m => ({
    canUse: (g, p, slot) => slot.lastAttack?.name === m[1] && slot.lastAttack.turn === g.turn - 2,
  })],

  // ---- 造成傷害後 ----
  [/^這隻寶可夢也受到(\d+)點傷害$/, m => ({ after: ctx => { ctx.attacker.damage += +m[1]; ctx.g.log(`${ctx.card.name}也受到${m[1]}點傷害`, 'dmg'); } })],
  [/^擲1次硬幣若為反面，則這隻寶可夢也受到(\d+)點傷害$/, m => ({
    after: ctx => { if (!ctx.g.coin(ctx.me)) { ctx.attacker.damage += +m[1]; ctx.g.log(`${ctx.card.name}也受到${m[1]}點傷害`, 'dmg'); } },
  })],
  [/^(擲1次硬幣若為正面，則(?:可)?)?將對手的戰鬥寶可夢【(..)】(?:與【(..)】)?$/, m => ({
    after: ctx => {
      if (!ctx.defender || ctx.opp.active !== ctx.defender) return;
      if (m[1] && !ctx.g.coin(ctx.me)) return;
      ctx.g.setCondition(ctx.defender, COND[m[2]]);
      if (m[3]) ctx.g.setCondition(ctx.defender, COND[m[3]]);
    },
  })],
  [/^將這隻寶可夢【(..)】$/, m => ({ after: ctx => ctx.g.setCondition(ctx.attacker, COND[m[1]]) })],
  [/^將這隻寶可夢的特殊狀態全部恢復$/, () => ({ after: ctx => ctx.g.clearConditions(ctx.attacker) })],
  [/^從自己的牌庫抽出(\d+)張卡$/, m => ({ after: ctx => drawN(ctx.g, ctx.me, +m[1]) })],
  [/^將這隻寶可夢恢復「(\d+)」HP$/, m => ({ after: ctx => ctx.g.heal(ctx.attacker, +m[1]) })],
  [/^將自己的1隻備戰寶可夢的HP全部恢復$/, () => ({
    after: async ctx => {
      const cands = ctx.me.bench.filter(s => s.damage > 0);
      const s = await pickSlot(ctx.g, ctx.me, cands, { title: '選擇要恢復的備戰寶可夢', purpose: 'heal' });
      if (s) ctx.g.heal(s, s.damage);
    },
  })],
  [/^對手的1隻備戰寶可夢也受到(\d+)點傷害$/, m => ({
    after: async ctx => {
      const s = await pickSlot(ctx.g, ctx.me, benchOf(ctx.opp), { title: `選擇要受到${m[1]}點傷害的對手備戰寶可夢`, purpose: 'benchDamage', target: ctx.opp.index });
      if (s) ctx.g.dealAttackDamage(ctx.attacker, s, +m[1]);
    },
  })],
  [/^對手的(\d+)隻備戰寶可夢也各受到(\d+)點傷害$/, m => ({
    after: async ctx => {
      const chosen = await ctx.g.ask(ctx.me, { kind: 'slots', title: `選擇${m[1]}隻對手的備戰寶可夢`, slots: benchOf(ctx.opp), min: Math.min(+m[1], ctx.opp.bench.length), max: +m[1], purpose: 'benchDamage', target: ctx.opp.index });
      for (const s of chosen || []) ctx.g.dealAttackDamage(ctx.attacker, s, +m[2]);
    },
  })],
  [/^對手的1隻寶可夢受到(\d+)點傷害$/, m => ({
    before: ctx => { ctx.noMainDamage = true; },
    after: async ctx => {
      const s = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.opp), { title: `選擇要受到${m[1]}點傷害的對手寶可夢`, purpose: 'snipe', target: ctx.opp.index });
      if (s) ctx.g.dealAttackDamage(ctx.attacker, s, +m[1]);
    },
    est: () => +m[1],
  })],
  [/^對手的所有寶可夢各受到(\d+)點傷害$/, m => ({
    after: ctx => { for (const s of ctx.g.slots(ctx.opp)) ctx.g.dealAttackDamage(ctx.attacker, s, +m[1]); },
    est: () => +m[1],
  })],
  [/^自己的所有備戰寶可夢也各受到(\d+)點傷害$/, m => ({
    after: ctx => { for (const s of ctx.me.bench) s.damage += +m[1]; },
  })],
  [/^在下個自己的回合，這隻寶可夢無法使用「(.+)」$/, m => ({
    after: ctx => ctx.g.addEffect(ctx.attacker, { kind: 'noAttackName', name: m[1], turn: ctx.g.turn + 2 }),
  })],
  [/^在下個自己的回合，這隻寶可夢無法使用招式$/, () => ({
    after: ctx => ctx.g.addEffect(ctx.attacker, { kind: 'noAttack', turn: ctx.g.turn + 2 }),
  })],
  [/^在下個對手的回合，受到這個招式的寶可夢無法撤退$/, () => ({
    after: ctx => { if (ctx.defender && ctx.opp.active === ctx.defender) ctx.g.addEffect(ctx.defender, { kind: 'noRetreat', turn: ctx.g.turn + 1 }); },
  })],
  [/^在下個對手的回合，受到這個招式的【基礎】寶可夢，無法使用招式$/, () => ({
    after: ctx => { if (ctx.defender && ctx.opp.active === ctx.defender && ctx.g.top(ctx.defender).stage === 0) ctx.g.addEffect(ctx.defender, { kind: 'noAttack', turn: ctx.g.turn + 1 }); },
  })],
  [/^在下個對手的回合，這隻寶可夢受到招式的傷害「-(\d+)」點$/, m => ({
    after: ctx => ctx.g.addEffect(ctx.attacker, { kind: 'reduceDamage', amount: +m[1], turn: ctx.g.turn + 1 }),
  })],
  [/^在下個對手的回合，受到這個招式的寶可夢使用招式的傷害「-(\d+)」點$/, m => ({
    after: ctx => { if (ctx.defender && ctx.opp.active === ctx.defender) ctx.g.addEffect(ctx.defender, { kind: 'attackMinus', amount: +m[1], turn: ctx.g.turn + 1 }); },
  })],
  [/^擲1次硬幣若為正面，則在下個對手的回合，這隻寶可夢不會受到招式的傷害$/, () => ({
    after: ctx => { if (ctx.g.coin(ctx.me)) ctx.g.addEffect(ctx.attacker, { kind: 'preventDamage', turn: ctx.g.turn + 1 }); },
  })],
  [/^擲1次硬幣若為正面，則在下個對手的回合，這隻寶可夢不會受到招式的傷害與效果的影響$/, () => ({
    after: ctx => { if (ctx.g.coin(ctx.me)) ctx.g.addEffect(ctx.attacker, { kind: 'preventAll', turn: ctx.g.turn + 1 }); },
  })],
  [/^選擇(\d+)個這隻寶可夢身上附加的(?:【(.)】)?能量，將其丟棄$/, m => ({
    after: async ctx => {
      const t = m[2] && T2L[m[2]];
      const cands = ctx.attacker.energy.filter(e => !t || getProvides(ctx.g, e, ctx.attacker).some(u => u === t || u === '*'));
      const chosen = await pick(ctx.g, ctx.me, cands, { min: +m[1], max: +m[1], title: `選擇要丟棄的能量（${m[1]}個）`, purpose: 'discardOwnEnergy' });
      for (const e of chosen) ctx.g.discardEnergy(ctx.attacker, e);
    },
  })],
  [/^將這隻寶可夢身上附加的能量(?:卡)?全部丟棄$/, () => ({
    after: ctx => { for (const e of [...ctx.attacker.energy]) ctx.g.discardEnergy(ctx.attacker, e); },
  })],
  [/^擲1次硬幣若為反面，則將這隻寶可夢身上附加的能量全部丟棄$/, () => ({
    after: ctx => { if (!ctx.g.coin(ctx.me)) for (const e of [...ctx.attacker.energy]) ctx.g.discardEnergy(ctx.attacker, e); },
  })],
  [/^若希望，將這隻寶可夢與備戰寶可夢互換$/, () => ({
    after: async ctx => { if (ctx.me.active === ctx.attacker) await ctx.g.switchOwn(ctx.me, true); },
  })],
  [/^將這隻寶可夢與備戰寶可夢互換$/, () => ({
    after: async ctx => { if (ctx.me.active === ctx.attacker) await ctx.g.switchOwn(ctx.me, false); },
  })],
  [/^若希望，將對手的戰鬥寶可夢與備戰寶可夢互換$/, () => ({
    after: async ctx => {
      if (!ctx.opp.bench.length) return;
      const yes = await ctx.g.ask(ctx.me, { kind: 'yesno', title: '要將對手的戰鬥寶可夢與備戰寶可夢互換嗎？', purpose: 'forceSwitch' });
      if (!yes) return;
      const s = await pickSlot(ctx.g, ctx.opp, benchOf(ctx.opp), { title: '選擇要換上場的寶可夢', purpose: 'switchIn' });
      ctx.g.switchActive(ctx.opp, s);
    },
  })],
  [/^選擇1隻對手的備戰寶可夢，與戰鬥寶可夢互換$/, () => ({
    after: async ctx => { await ctx.g.gust(ctx.me); ctx.data.newActive = ctx.opp.active; },
  })],
  [/^然後，新上場的寶可夢受到(\d+)點傷害$/, m => ({
    after: ctx => { if (ctx.opp.active) ctx.g.dealAttackDamage(ctx.attacker, ctx.opp.active, +m[1]); },
    est: () => +m[1],
  })],
  [/^從自己的牌庫選擇(最多)?(\d+)張(.*)卡，放置於備戰區$/, m => ({
    after: async ctx => {
      const f = benchFilter(m[3]);
      const room = 5 - ctx.me.bench.length;
      await searchDeck(ctx.g, ctx.me, f, { max: Math.min(+m[2], room), title: `從牌庫選擇${m[3]}放置於備戰區`, purpose: 'benchSearch', dest: 'bench' });
    },
    canUse: undefined,
  })],
  [/^從自己的牌庫選擇1張寶可夢卡，在給對手看過後加入手牌$/, () => ({
    after: ctx => searchDeck(ctx.g, ctx.me, isPokemon, { max: 1, title: '從牌庫選擇1張寶可夢卡加入手牌', purpose: 'searchPokemon' }),
  })],
  [/^從自己的牌庫選擇最多(\d+)張「基本【(.)】能量」卡，附於這隻寶可夢身上$/, m => ({
    after: async ctx => {
      const t = T2L[m[2]];
      const ch = await searchDeck(ctx.g, ctx.me, c => isBasicEnergy(c) && c.provides === t, { max: +m[1], title: `從牌庫選擇基本${m[2]}能量`, purpose: 'searchEnergy', dest: 'none' });
      for (const e of ch) ctx.attacker.energy.push(e);
      if (ch.length) ctx.g.log(`${ctx.card.name}附上了${ch.length}張能量`);
    },
  })],
  [/^從自己的棄牌區選擇1張「基本【(.)】能量」卡，附於(這隻寶可夢|備戰寶可夢)身上$/, m => ({
    after: async ctx => {
      const t = T2L[m[1]];
      const cands = ctx.me.discard.filter(i => { const c = card(ctx.g, i); return isBasicEnergy(c) && c.provides === t; });
      if (!cands.length) return;
      const e = cands[0];
      ctx.me.discard.splice(ctx.me.discard.indexOf(e), 1);
      if (m[2] === '這隻寶可夢') { ctx.attacker.energy.push(e); ctx.g.log(`${ctx.card.name}附上了${card(ctx.g, e).name}`); }
      else await attachEach(ctx.g, ctx.me, [e], benchOf(ctx.me), '選擇要附上能量的備戰寶可夢');
    },
  })],
  [/^從自己的棄牌區選擇最多(\d+)張「基本【(.)】能量」卡，以任意方式附於自己的備戰寶可夢身上$/, m => ({
    after: async ctx => {
      const t = T2L[m[2]];
      if (!ctx.me.bench.length) return;
      const cands = ctx.me.discard.filter(i => { const c = card(ctx.g, i); return isBasicEnergy(c) && c.provides === t; });
      const chosen = await pick(ctx.g, ctx.me, cands, { max: +m[1], title: `從棄牌區選擇最多${m[1]}張基本${m[2]}能量`, purpose: 'discardEnergyToAttach' });
      ctx.me.discard = ctx.me.discard.filter(i => !chosen.includes(i));
      await attachEach(ctx.g, ctx.me, chosen, benchOf(ctx.me), '選擇要附上能量的備戰寶可夢');
    },
  })],
  [/^從自己的棄牌區選擇1張基本能量卡，在給對手看過後加入手牌$/, () => ({
    after: async ctx => {
      const cands = ctx.me.discard.filter(i => isBasicEnergy(card(ctx.g, i)));
      const ch = await pick(ctx.g, ctx.me, cands, { max: 1, title: '選擇要加入手牌的基本能量', purpose: 'recoverEnergy' });
      moveDiscardToHand(ctx.g, ctx.me, ch);
    },
  })],
  [/^從自己的棄牌區選擇1張物品卡，在給對手看過後加入手牌$/, () => ({
    after: async ctx => {
      const cands = ctx.me.discard.filter(i => card(ctx.g, i).trainer === 'Item');
      const ch = await pick(ctx.g, ctx.me, cands, { max: 1, title: '選擇要加入手牌的物品卡', purpose: 'recoverItem' });
      moveDiscardToHand(ctx.g, ctx.me, ch);
    },
  })],
  [/^從自己的棄牌區選擇最多(\d+)張「(.+)」，放置於備戰區$/, m => ({
    after: async ctx => {
      const cands = ctx.me.discard.filter(i => card(ctx.g, i).name === m[2]);
      const ch = await pick(ctx.g, ctx.me, cands, { max: Math.min(+m[1], 5 - ctx.me.bench.length), title: `選擇要放到備戰區的「${m[2]}」`, purpose: 'reviveBench' });
      for (const i of ch) { ctx.me.discard.splice(ctx.me.discard.indexOf(i), 1); ctx.g.putOnBench(ctx.me, i); }
    },
  })],
  [/^將對手的牌庫上方1張卡丟棄$/, () => ({
    after: ctx => { const c = ctx.opp.deck.shift(); if (c) { ctx.opp.discard.push(c); ctx.g.log(`丟棄了對手牌庫上方的${card(ctx.g, c).name}`); } },
  })],
  [/^對手將對手自己的手牌全部放回牌庫並重洗$/, () => ({
    after: ctx => { ctx.opp.deck.push(...ctx.opp.hand); ctx.opp.hand = []; ctx.g.shuffle(ctx.opp.deck); },
  })],
  [/^然後，對手從牌庫抽出(\d+)張卡$/, m => ({ after: ctx => drawN(ctx.g, ctx.opp, +m[1]) })],
  [/^將(\d+)個傷害指示物以任意方式放置於對手的(備戰)?寶可夢身上$/, m => ({
    after: async ctx => {
      const slots = m[2] ? benchOf(ctx.opp) : ctx.g.slots(ctx.opp);
      await distributeCounters(ctx.g, ctx.me, slots, +m[1], `將${m[1]}個傷害指示物放置於對手的${m[2] || ''}寶可夢身上`);
    },
    est: b => b + (m[2] ? 0 : +m[1] * 10),
  })],
  [/^擲1次硬幣若為正面，則將對手的戰鬥寶可夢與附加的卡，全部放回對手的手牌$/, () => ({
    after: async ctx => {
      if (!ctx.opp.active || !ctx.g.coin(ctx.me)) return;
      const s = ctx.opp.active;
      ctx.g.removeSlot(ctx.opp, s);
      ctx.opp.hand.push(...ctx.g.allCardsOf(s));
      ctx.g.log(`${ctx.g.top(s).name}回到了對手的手牌`);
      if (ctx.opp.bench.length) {
        const n = await pickSlot(ctx.g, ctx.opp, benchOf(ctx.opp), { title: '選擇新的戰鬥寶可夢', purpose: 'promote' });
        ctx.g.switchActive(ctx.opp, n);
      } else ctx.g.checkWin();
    },
  })],
  [/^擲1次硬幣若為正面，則選擇1個對手的戰鬥寶可夢身上附加的能量，將其丟棄$/, () => ({
    after: async ctx => {
      const d = ctx.opp.active;
      if (!d || !d.energy.length || !ctx.g.coin(ctx.me)) return;
      const [e] = await pick(ctx.g, ctx.me, [...d.energy], { min: 1, max: 1, title: '選擇要丟棄的對手能量', purpose: 'discardOppEnergy' });
      if (e) ctx.g.discardEnergy(d, e);
    },
  })],
  [/^擲硬幣直到出現反面，選擇與正面出現的次數相同數量的對手的戰鬥寶可夢身上附加的能量，將其丟棄$/, () => ({
    after: async ctx => {
      let h = 0; while (ctx.g.coin(ctx.me)) h++;
      const d = ctx.opp.active;
      if (!d || !h) return;
      const ch = await pick(ctx.g, ctx.me, [...d.energy], { min: Math.min(h, d.energy.length), max: h, title: `選擇要丟棄的對手能量（${h}個）`, purpose: 'discardOppEnergy' });
      for (const e of ch) ctx.g.discardEnergy(d, e);
    },
  })],
  [/^將自己的手牌全部丟棄，從牌庫抽出(\d+)張卡$/, m => ({
    after: ctx => { ctx.me.discard.push(...ctx.me.hand); ctx.me.hand = []; drawN(ctx.g, ctx.me, +m[1]); },
  })],
  [/^將這隻寶可夢與附加的卡，全部放回自己的牌庫並重洗$/, () => ({
    after: async ctx => {
      ctx.g.returnSlotToDeck(ctx.me, ctx.attacker);
      ctx.g.log(`${ctx.card.name}回到了牌庫`);
      if (ctx.me.bench.length) {
        const s = await pickSlot(ctx.g, ctx.me, benchOf(ctx.me), { title: '選擇新的戰鬥寶可夢', purpose: 'promote' });
        ctx.g.switchActive(ctx.me, s);
      }
    },
  })],
  [/^若對手的寶可夢因這個招式的傷害而【昏厥】了，則多獲得1張獎賞卡$/, () => ({
    before: ctx => { ctx.extraPrize = 1; },
  })],
];

function benchFilter(desc) {
  // 例：「【基礎】寶可夢」「【草】屬性的【基礎】寶可夢」「【雷】屬性的【基礎】寶可夢」
  const tm = desc.match(/【(.)】屬性的/);
  return c => isBasicPokemon(c) && (!tm || c.type === T2L[tm[1]]);
}
function moveDiscardToHand(g, p, insts) {
  for (const i of insts) { p.discard.splice(p.discard.indexOf(i), 1); p.hand.push(i); }
  if (insts.length) g.log(`${p.name}將${insts.map(i => card(g, i).name).join('、')}從棄牌區加入手牌`);
}
export function getProvides(g, inst, slot) {
  const c = card(g, inst);
  if (isBasicEnergy(c)) return [c.provides];
  return getEnergyImpl(c).provides(g, slot);
}

// 無法以句型處理的招式，以完整文字為鍵
const MANUAL_ATTACKS = {
  '選擇1個對手的戰鬥寶可夢持有的招式。在下個對手的回合，受到這個招式的寶可夢無法使用被選擇的招式。': {
    after: async ctx => {
      const d = ctx.opp.active;
      if (!d) return;
      const atks = ctx.g.top(d).attacks;
      if (!atks.length) return;
      const idx = await ctx.g.ask(ctx.me, { kind: 'option', title: '選擇對手無法使用的招式', options: atks.map(a => a.name), purpose: 'disableAttack' });
      ctx.g.addEffect(d, { kind: 'noAttackName', name: atks[idx].name, turn: ctx.g.turn + 1 });
      ctx.g.log(`${ctx.g.top(d).name}在下回合無法使用「${atks[idx].name}」`);
    },
  },
  '查看自己的牌庫上方3張卡。將那些卡加入手牌。或者將那些卡丟棄，從自己的牌庫抽出3張卡。': {
    after: async ctx => {
      const top = ctx.me.deck.slice(0, 3);
      const keep = await ctx.g.ask(ctx.me, { kind: 'yesno', title: `牌庫上方3張：${top.map(i => card(ctx.g, i).name).join('、')}。要加入手牌嗎？（否＝丟棄後抽3張）`, purpose: 'keepTop3' });
      ctx.me.deck.splice(0, top.length);
      if (keep) ctx.me.hand.push(...top);
      else { ctx.me.discard.push(...top); drawN(ctx.g, ctx.me, 3); }
    },
  },
  '選擇自己的場上寶可夢身上附加的任意數量的【超】能量，以任意方式改附於自己的寶可夢身上。': {
    after: async ctx => { await moveEnergyFreely(ctx.g, ctx.me, 'P'); },
  },
  '擲1次硬幣若為正面，則增加140點傷害。若為反面，則在下個自己的回合，這隻寶可夢無法使用招式。': {
    before: ctx => { ctx.data.coin = ctx.g.coin(ctx.me); if (ctx.data.coin) ctx.base += 140; },
    after: ctx => { if (!ctx.data.coin) ctx.g.addEffect(ctx.attacker, { kind: 'noAttack', turn: ctx.g.turn + 2 }); },
    est: b => b + 70,
  },
  '將自己的場上寶可夢身上附加的任意數量的基本能量卡丟棄，造成其張數×70點傷害。': {
    before: async ctx => {
      const g = ctx.g, p = ctx.me;
      const all = [];
      for (const s of g.slots(p)) for (const e of s.energy) if (isBasicEnergy(card(g, e))) all.push({ s, e });
      const chosen = await pick(g, p, all.map(x => x.e), { min: 0, max: all.length, title: '選擇要丟棄的基本能量（每張70點傷害）', purpose: 'ragingBolt' });
      for (const e of chosen) { const x = all.find(y => y.e === e); g.discardEnergy(x.s, e); }
      ctx.base = chosen.length * 70;
    },
    est: (b, e) => { let n = 0; for (const s of e.g.slots(e.me)) n += s.energy.filter(x => isBasicEnergy(card(e.g, x))).length; return n * 70; },
  },
  '在對手的戰鬥寶可夢身上放置自己手牌張數×2個傷害指示物。': {
    after: ctx => { if (ctx.opp.active) ctx.g.placeCounters(ctx.opp.active, ctx.me.hand.length * 2); },
    est: (b, e) => e.me.hand.length * 20,
  },
  '從自己的棄牌區選擇最多2張「基本【雷】能量」卡，附於1隻備戰寶可夢身上。': {
    after: async ctx => {
      if (!ctx.me.bench.length) return;
      const cands = ctx.me.discard.filter(i => { const c = card(ctx.g, i); return isBasicEnergy(c) && c.provides === 'L'; });
      const ch = await pick(ctx.g, ctx.me, cands, { max: 2, title: '選擇最多2張基本雷能量', purpose: 'discardEnergyToAttach' });
      if (!ch.length) return;
      const s = await pickSlot(ctx.g, ctx.me, benchOf(ctx.me), { title: '選擇要附上能量的備戰寶可夢', purpose: 'attachTarget' });
      ctx.me.discard = ctx.me.discard.filter(i => !ch.includes(i));
      s.energy.push(...ch);
      ctx.g.log(`${ctx.g.top(s).name}附上了${ch.length}張基本雷能量`);
    },
  },
  '擲3次硬幣，從自己的棄牌區選擇最多與正面出現的次數相同數量的「基本【雷】能量」卡，以任意方式附於備戰寶可夢身上。': {
    after: async ctx => {
      let h = 0;
      for (let i = 0; i < 3; i++) if (ctx.g.coin(ctx.me)) h++;
      if (!h || !ctx.me.bench.length) return;
      const cands = ctx.me.discard.filter(i => { const c = card(ctx.g, i); return isBasicEnergy(c) && c.provides === 'L'; });
      const ch = await pick(ctx.g, ctx.me, cands, { max: h, title: `從棄牌區選擇最多${h}張基本雷能量`, purpose: 'discardEnergyToAttach' });
      ctx.me.discard = ctx.me.discard.filter(i => !ch.includes(i));
      await attachEach(ctx.g, ctx.me, ch, benchOf(ctx.me), '選擇要附上能量的備戰寶可夢');
    },
  },
  '選擇1個對手的戰鬥寶可夢身上附加的能量，將其丟棄。': {
    after: async ctx => {
      const d = ctx.opp.active;
      if (!d || !d.energy.length) return;
      const [e] = await pick(ctx.g, ctx.me, [...d.energy], { min: 1, max: 1, title: '選擇要丟棄的對手能量', purpose: 'discardOppEnergy' });
      if (e) ctx.g.discardEnergy(d, e);
    },
  },
  '若希望，將場上的競技場卡丟棄。': {
    after: async ctx => {
      const g = ctx.g;
      if (!g.stadium) return;
      const yes = await g.ask(ctx.me, { kind: 'yesno', title: `要丟棄競技場「${card(g, g.stadium.inst).name}」嗎？`, purpose: 'discardStadium', owner: g.stadium.owner });
      if (yes) { g.players[g.stadium.owner].discard.push(g.stadium.inst); g.log(`競技場「${card(g, g.stadium.inst).name}」被丟棄了`); g.stadium = null; }
    },
  },
  '選擇1隻對手的備戰寶可夢，與戰鬥寶可夢互換。然後，新上場的寶可夢受到30點傷害。': {
    after: async ctx => { await ctx.g.gust(ctx.me); if (ctx.opp.active) ctx.g.dealAttackDamage(ctx.attacker, ctx.opp.active, 30); },
    est: () => 30,
  },
};

async function moveEnergyFreely(g, p, type) {
  for (let i = 0; i < 20; i++) {
    const src = g.slots(p).filter(s => s.energy.some(e => getProvides(g, e, s).includes(type)));
    if (!src.length) return;
    const from = await pickSlot(g, p, src, { title: '選擇要移出能量的寶可夢（可取消結束）', purpose: 'moveEnergyFrom', optional: true });
    if (!from) return;
    const e = from.energy.find(x => getProvides(g, x, from).includes(type));
    const to = await pickSlot(g, p, g.slots(p).filter(s => s !== from), { title: '選擇要附上能量的寶可夢', purpose: 'moveEnergyTo', optional: true });
    if (!to) return;
    from.energy = from.energy.filter(x => x !== e);
    to.energy.push(e);
    g.log(`將${card(g, e).name}從${g.top(from).name}移到${g.top(to).name}`);
  }
}

const attackCache = new Map();
const unimplemented = new Set();
export function compileAttack(text) {
  if (MANUAL_ATTACKS[text]) return { ok: true, ...MANUAL_ATTACKS[text] };
  const sentences = text.replace(/\[[^\]]*\]/g, '').replace(/（[^）]*）/g, '').split(/[。]/).map(s => s.trim()).filter(Boolean);
  const befores = [], afters = [], ests = [], canUses = [];
  let opts = {};
  let ok = true;
  for (const s of sentences) {
    const sn = s.replace(/^並且重洗牌庫$/, '');
    if (!sn) continue;
    let matched = false;
    for (const [re, fn] of PATTERNS) {
      const m = sn.match(re);
      if (m) {
        const r = fn(m);
        if (r.before) befores.push(r.before);
        if (r.after) afters.push(r.after);
        if (r.est) ests.push(r.est);
        if (r.canUse) canUses.push(r.canUse);
        if (r.opts) opts = { ...opts, ...r.opts };
        matched = true;
        break;
      }
    }
    if (!matched) { ok = false; unimplemented.add(sn); }
  }
  return {
    ok,
    before: befores.length || Object.keys(opts).length ? async ctx => {
      Object.assign(ctx.opts, opts);
      for (const b of befores) if ((await b(ctx)) === false) return false;
    } : null,
    after: afters.length ? async ctx => { for (const a of afters) await a(ctx); } : null,
    est: ests.length ? (b, env) => ests.reduce((x, f) => f(x, env), b) : null,
    canUse: canUses.length ? (g, p, s) => canUses.every(f => f(g, p, s)) : null,
  };
}
export function getAttackImpl(c, idx) {
  const key = `${c.id}:${idx}`;
  if (!attackCache.has(key)) {
    const atk = c.attacks[idx];
    attackCache.set(key, atk.text ? compileAttack(atk.text) : { ok: true });
  }
  return attackCache.get(key);
}
export function listUnimplemented(cards) {
  const out = [];
  for (const c of cards) {
    if (c.cat === 'P') {
      c.attacks.forEach((a, i) => { if (a.text && !getAttackImpl(c, i).ok) out.push(`${c.id} ${c.name}「${a.name}」${a.text}`); });
      for (const ab of c.abilities) if (!ABILITIES[ab.text]) out.push(`${c.id} ${c.name} 特性「${ab.name}」`);
    } else if (c.cat === 'T') {
      const impl = TRAINER_BY_TEXT[c.text] || TOOLS[c.text] || STADIUMS[c.text];
      if (!impl) out.push(`${c.id} ${c.name} 訓練家`);
    } else if (c.energy === 'special' && !SPECIAL_ENERGY[c.text]) out.push(`${c.id} ${c.name} 特殊能量`);
  }
  return out;
}
export function estimateAttack(g, p, slot, idx, def) {
  const c = g.top(slot);
  const atk = c.attacks[idx];
  const impl = getAttackImpl(c, idx);
  let b = parseInt(atk.dmg) || 0;
  if (impl.est) b = impl.est(b, { g, me: p, slot, def });
  return b;
}

// ================= 特性 =================
const ABILITIES = {
  '這隻寶可夢在戰鬥場受到對手的寶可夢招式的傷害時，在使用招式的寶可夢身上放置3個傷害指示物。': {
    onDamagedActive: (g, self, attacker) => { attacker.damage += 30; g.log(`「反擊針」在${g.top(attacker).name}身上放置3個傷害指示物`); },
  },
  '在自己的回合時可使用1次。將在備戰區的這隻寶可夢與戰鬥寶可夢互換。或者將在戰鬥場的這隻寶可夢與備戰寶可夢互換。': {
    canUse: (g, p, s) => p.bench.length > 0,
    use: async (g, p, s) => { if (p.active === s) await g.switchOwn(p); else g.switchActive(p, s); },
  },
  '這隻寶可夢在戰鬥場上受到對手的寶可夢招式的傷害時，將使用招式的寶可夢【灼傷】。': {
    onDamagedActive: (g, self, attacker) => g.setCondition(attacker, 'burn'),
  },
  '只要這隻寶可夢在場上，自己的所有身上附有【超】能量的寶可夢【撤退】所需的能量全部消除。': {
    retreatCost: (g, self, slot, cost) => (g.energyUnits(slot).includes('P') ? 0 : cost),
  },
  '在自己的回合，若從自己的手牌將1張能量卡丟棄，則可使用1次。從牌庫抽卡直到自己的手牌滿6張為止。': {
    canUse: (g, p) => p.hand.some(i => card(g, i).cat === 'E') && p.hand.length <= 6,
    use: async (g, p) => {
      const [e] = await pick(g, p, p.hand.filter(i => card(g, i).cat === 'E'), { min: 1, max: 1, title: '選擇要丟棄的能量卡', purpose: 'discardFromHand' });
      g.removeFromHand(p, e); p.discard.push(e);
      drawN(g, p, Math.max(0, 6 - p.hand.length));
    },
  },
  '這隻寶可夢受到招式的傷害「-20」點。': { reduceDamage: () => 20 },
  '這隻寶可夢不會【麻痺】。': { immune: ['paralyzed'] },
  '在自己的回合時可使用1次，若使用，則將這隻寶可夢【昏厥】。從自己的棄牌區選擇最多3張基本能量卡，以任意方式附於自己的【雷】寶可夢身上。': {
    canUse: (g, p, s) => p.discard.some(i => isBasicEnergy(card(g, i))) && g.slots(p).some(x => x !== s && g.top(x).type === 'L'),
    use: async (g, p, s) => {
      s.damage = 9999;
      g.log(`${g.top(s).name}昏厥了自己`);
      const cands = p.discard.filter(i => isBasicEnergy(card(g, i)));
      const ch = await pick(g, p, cands, { max: 3, title: '選擇最多3張基本能量', purpose: 'discardEnergyToAttach' });
      p.discard = p.discard.filter(i => !ch.includes(i));
      await attachEach(g, p, ch, g.slots(p).filter(x => x !== s && g.top(x).type === 'L'), '選擇要附上能量的雷寶可夢');
    },
  },
  '在自己的回合時可使用1次。從自己的牌庫選擇最多2張【雷】屬性的【基礎】寶可夢卡，放置於備戰區。並且重洗牌庫。': {
    canUse: (g, p) => p.bench.length < 5 && p.deck.length > 0,
    use: (g, p) => searchDeck(g, p, c => isBasicPokemon(c) && c.type === 'L', { max: Math.min(2, 5 - p.bench.length), title: '選擇最多2張雷屬性基礎寶可夢', purpose: 'benchSearch', dest: 'bench' }),
  },
  '在自己的回合，從手牌使出這張卡並完成進化時，可使用1次。從自己的牌庫選擇最多3張「基本【火】能量」卡，以任意方式附於自己的寶可夢身上。並且重洗牌庫。': {
    onEvolve: async (g, p) => {
      const ch = await searchDeck(g, p, c => isBasicEnergy(c) && c.provides === 'R', { max: 3, title: '從牌庫選擇最多3張基本火能量', purpose: 'searchEnergy', dest: 'none' });
      await attachEach(g, p, ch, g.slots(p), '選擇要附上火能量的寶可夢');
    },
  },
  '在自己的回合時可使用1次。從自己的牌庫任意選擇1張卡加入手牌。並且重洗牌庫。在這個回合，若已經使出了其他的「音速搜索」，則這個特性無法使用。': {
    globalKey: '音速搜索',
    canUse: (g, p) => p.deck.length > 0,
    use: (g, p) => searchDeck(g, p, () => true, { max: 1, title: '從牌庫選擇任意1張卡', purpose: 'searchAny' }),
  },
  '在自己的回合時可使用1次。查看自己的牌庫上方2張卡，選擇其中1張，加入手牌。將剩餘卡放回牌庫下方。': {
    canUse: (g, p) => p.deck.length > 0,
    use: async (g, p) => {
      const top = p.deck.splice(0, 2);
      const [k] = await pick(g, p, top, { min: 1, max: 1, title: '選擇1張加入手牌', purpose: 'searchAny' });
      p.hand.push(k);
      p.deck.push(...top.filter(i => i !== k));
    },
  },
  '在自己的回合時，可不限次數使用。從自己的棄牌區選擇1張「基本【超】能量」卡，附於自己的【超】寶可夢身上。然後，在附上那張卡的寶可夢身上放置2個傷害指示物。（這個特性無法對會【昏厥】的寶可夢使用。）': {
    oncePerTurn: false,
    canUse: (g, p) => p.discard.some(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'P'; }) && g.slots(p).some(s => g.top(s).type === 'P' && g.hpLeft(s) > 20),
    use: async (g, p) => {
      const e = p.discard.find(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'P'; });
      const s = await pickSlot(g, p, g.slots(p).filter(s => g.top(s).type === 'P' && g.hpLeft(s) > 20), { title: '選擇要附上超能量的超寶可夢', purpose: 'psychicEmbrace' });
      p.discard.splice(p.discard.indexOf(e), 1);
      s.energy.push(e);
      s.damage += 20;
      g.log(`${g.top(s).name}附上了基本超能量並放置2個傷害指示物`);
    },
  },
  '若這隻寶可夢身上附有【惡】能量卡，則在自己的回合時可使用1次。選擇最多3個自己的1隻場上寶可夢身上放置的傷害指示物，改放於對手的1隻場上寶可夢身上。': {
    canUse: (g, p, s) => s.energy.some(e => card(g, e).provides === 'D') && g.slots(p).some(x => x.damage > 0),
    use: async (g, p) => {
      const from = await pickSlot(g, p, g.slots(p).filter(x => x.damage > 0), { title: '選擇要移走傷害指示物的自己寶可夢', purpose: 'healMost' });
      const n = Math.min(3, from.damage / 10);
      const o = g.opp(p);
      const to = await pickSlot(g, p, g.slots(o), { title: `選擇要放置${n}個傷害指示物的對手寶可夢`, purpose: 'counterTarget', target: o.index });
      from.damage -= n * 10;
      g.placeCounters(to, n);
    },
  },
  '在自己的回合時可使用1次，若使用，則將這隻寶可夢【昏厥】。在對手的1隻寶可夢身上放置5個傷害指示物。': cursedBomb(5),
  '在自己的回合時可使用1次，若使用，則將這隻寶可夢【昏厥】。在對手的1隻寶可夢身上放置13個傷害指示物。': cursedBomb(13),
  '在上個對手的回合，若自己的寶可夢【昏厥】了，則在自己的回合時可使用1次。從自己的牌庫抽出3張卡。在這個回合，若已經使出了其他的「扭轉乾坤」，則這個特性無法使用。': {
    globalKey: '扭轉乾坤',
    canUse: (g, p) => p.lastKoTurn === g.turn - 1 && p.deck.length > 0,
    use: (g, p) => drawN(g, p, 3),
  },
  '在自己的回合，從手牌使出這張卡並完成進化時，可使用1次。從自己的牌庫抽出2張卡。': { onEvolve: (g, p) => drawN(g, p, 2) },
  '在自己的回合，從手牌使出這張卡並完成進化時，可使用1次。從自己的牌庫抽出3張卡。': { onEvolve: (g, p) => drawN(g, p, 3) },
  '在自己的回合時可使用1次。從自己的牌庫抽出3張卡。然後，將這隻寶可夢與附加的卡，全部放回自己的牌庫並重洗。': {
    canUse: (g, p, s) => p.deck.length > 0 && (p.active !== s || p.bench.length > 0),
    use: async (g, p, s) => {
      drawN(g, p, 3);
      const wasActive = p.active === s;
      g.returnSlotToDeck(p, s);
      g.log(`${g.top(s).name}回到了牌庫`);
      if (wasActive) {
        const n = await pickSlot(g, p, benchOf(p), { title: '選擇新的戰鬥寶可夢', purpose: 'promote' });
        g.switchActive(p, n);
      }
    },
  },
};
function cursedBomb(n) {
  return {
    canUse: () => true,
    use: async (g, p, s) => {
      const o = g.opp(p);
      s.damage = 9999;
      g.log(`${g.top(s).name}昏厥了自己`);
      const t = await pickSlot(g, p, g.slots(o), { title: `選擇要放置${n}個傷害指示物的對手寶可夢`, purpose: 'counterTarget', target: o.index, extra: { counters: n } });
      g.placeCounters(t, n);
    },
  };
}
const oppSwitchByOpp = {
  canUse: (g, p) => g.opp(p).bench.length > 0,
  use: async (g, p) => {
    const o = g.opp(p);
    const s = await pickSlot(g, o, benchOf(o), { title: '選擇要換上場的寶可夢', purpose: 'switchIn' });
    g.switchActive(o, s);
  },
};
ABILITIES['在自己的回合時可使用1次。將對手的戰鬥寶可夢與備戰寶可夢互換。[由對手選擇放置於戰鬥場的寶可夢。]'] = oppSwitchByOpp;
ABILITIES['若這隻寶可夢在戰鬥場上，則在自己的回合時可使用1次。將對手的戰鬥寶可夢與備戰寶可夢互換。[由對手選擇放置於戰鬥場的寶可夢。]'] = {
  ...oppSwitchByOpp,
  canUse: (g, p, s) => p.active === s && g.opp(p).bench.length > 0,
};

export function getAbilityImpl(c) {
  if (c.cat !== 'P' || !c.abilities.length) return null;
  return ABILITIES[c.abilities[0].text] || null;
}

// ================= 訓練家 =================
const draw = n => ({ play: (g, p) => drawN(g, p, n), canPlay: (g, p) => p.deck.length > 0 });
function discardCost(n) {
  return {
    canPlay: (g, p) => p.hand.length - 1 >= n,
    pay: async (g, p) => {
      const others = p.hand.filter(i => i !== g.inPlayTrainer);
      const ch = await pick(g, p, others, { min: n, max: n, title: `選擇要丟棄的${n}張手牌`, purpose: 'discardFromHand', extra: { count: n } });
      for (const i of ch) { g.removeFromHand(p, i); p.discard.push(i); }
      return ch;
    },
  };
}
const gustItem = { canPlay: (g, p) => g.opp(p).bench.length > 0, play: (g, p) => g.gust(p) };

const TRAINER_BY_TEXT = {
  '從自己的棄牌區選擇最多2張基本能量卡，在給對手看過後加入手牌。': {
    canPlay: (g, p) => p.discard.some(i => isBasicEnergy(card(g, i))),
    play: async (g, p) => moveDiscardToHand(g, p, await pick(g, p, p.discard.filter(i => isBasicEnergy(card(g, i))), { max: 2, title: '選擇最多2張基本能量', purpose: 'recoverEnergy' })),
  },
  '選擇1個自己的場上寶可夢身上附加的基本能量，改附於自己的其他寶可夢身上。': {
    canPlay: (g, p) => g.slots(p).length > 1 && g.slots(p).some(s => s.energy.some(e => isBasicEnergy(card(g, e)))),
    play: async (g, p) => {
      const from = await pickSlot(g, p, g.slots(p).filter(s => s.energy.some(e => isBasicEnergy(card(g, e)))), { title: '選擇要移出能量的寶可夢', purpose: 'moveEnergyFrom' });
      const [e] = await pick(g, p, from.energy.filter(e => isBasicEnergy(card(g, e))), { min: 1, max: 1, title: '選擇要移動的能量', purpose: 'moveEnergy' });
      const to = await pickSlot(g, p, g.slots(p).filter(s => s !== from), { title: '選擇要附上能量的寶可夢', purpose: 'moveEnergyTo' });
      from.energy = from.energy.filter(x => x !== e);
      to.energy.push(e);
      g.log(`將${card(g, e).name}從${g.top(from).name}移到${g.top(to).name}`);
    },
  },
  '從自己的牌庫選擇1張基本能量卡，在給對手看過後加入手牌。並且重洗牌庫。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: (g, p) => searchDeck(g, p, isBasicEnergy, { max: 1, title: '選擇1張基本能量', purpose: 'searchEnergy' }),
  },
  '查看自己的牌庫上方5張卡，從其中選擇最多2張「基本【雷】能量」卡，以任意方式附於備戰區的【雷】寶可夢身上。將剩餘卡放回牌庫並重洗。': {
    canPlay: (g, p) => p.bench.some(s => g.top(s).type === 'L') && p.deck.length > 0,
    play: async (g, p) => {
      const top = p.deck.slice(0, 5);
      const ch = await pick(g, p, top.filter(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'L'; }), { max: 2, title: '選擇最多2張基本雷能量', purpose: 'searchEnergy', extra: { looked: top } });
      fromDeck(g, p, ch);
      await attachEach(g, p, ch, p.bench.filter(s => g.top(s).type === 'L'), '選擇要附上雷能量的備戰寶可夢');
      g.shuffle(p.deck);
    },
  },
  '擲2次硬幣，若全部為正面，則從自己的牌庫任意選擇1張卡加入手牌。並且重洗牌庫。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => { const a = g.coin(p), b = g.coin(p); if (a && b) await searchDeck(g, p, () => true, { max: 1, title: '選擇任意1張卡', purpose: 'searchAny' }); },
  },
  '將自己的1隻寶可夢恢復「30」HP。': {
    canPlay: (g, p) => g.slots(p).some(s => s.damage > 0),
    play: async (g, p) => { const s = await pickSlot(g, p, g.slots(p).filter(s => s.damage > 0), { title: '選擇要恢復的寶可夢', purpose: 'heal' }); g.heal(s, 30); },
  },
  '擲1次硬幣若為正面，則選擇1個對手的場上寶可夢身上附加的能量，將其丟棄。': {
    canPlay: (g, p) => g.slots(g.opp(p)).some(s => s.energy.length),
    play: async (g, p) => {
      if (!g.coin(p)) return;
      const o = g.opp(p);
      const s = await pickSlot(g, p, g.slots(o).filter(s => s.energy.length), { title: '選擇對手的寶可夢', purpose: 'discardOppEnergySlot', target: o.index });
      const [e] = await pick(g, p, [...s.energy], { min: 1, max: 1, title: '選擇要丟棄的能量', purpose: 'discardOppEnergy' });
      g.discardEnergy(s, e);
    },
  },
  '查看自己的牌庫上方7張卡，從其中選擇1張寶可夢卡，在給對手看過後加入手牌。將剩餘卡放回牌庫並重洗。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      const top = p.deck.slice(0, 7);
      const ch = await pick(g, p, top.filter(i => isPokemon(card(g, i))), { max: 1, title: '選擇1張寶可夢卡', purpose: 'searchPokemon', extra: { looked: top } });
      fromDeck(g, p, ch); p.hand.push(...ch); g.shuffle(p.deck);
      if (ch.length) g.log(`${p.name}將${card(g, ch[0]).name}加入手牌`);
    },
  },
  '從自己的牌庫選擇1張【基礎】寶可夢卡，放置於備戰區。並且重洗牌庫。': {
    canPlay: (g, p) => p.bench.length < 5 && p.deck.length > 0,
    play: (g, p) => searchDeck(g, p, isBasicPokemon, { max: 1, title: '選擇1張基礎寶可夢放到備戰區', purpose: 'benchSearch', dest: 'bench' }),
  },
  '這張卡必須將自己的2張手牌丟棄才可使用。 從自己的牌庫選擇1張寶可夢卡，在給對手看過後加入手牌。並且重洗牌庫。': {
    ...discardCost(2),
    play: async function (g, p) { await this.pay(g, p); await searchDeck(g, p, isPokemon, { max: 1, title: '選擇1張寶可夢卡', purpose: 'searchPokemon' }); },
  },
  '從自己的手牌選擇1張【2階進化】寶可夢卡，放置於自己的場上的可進化成那隻寶可夢的【基礎】寶可夢身上，跳過【1階進化】完成進化。（無法對自己的最初回合或剛使出的寶可夢使用。）': {
    canPlay: (g, p) => rareCandyTargets(g, p).length > 0,
    play: async (g, p) => {
      const pairs = rareCandyTargets(g, p);
      const [inst] = await pick(g, p, [...new Set(pairs.map(x => x.inst))], { min: 1, max: 1, title: '選擇2階進化寶可夢', purpose: 'rareCandyCard' });
      const s = await pickSlot(g, p, pairs.filter(x => x.inst === inst).map(x => x.slot), { title: '選擇要進化的基礎寶可夢', purpose: 'rareCandyTarget' });
      await g.evolve(p, s, inst, true);
    },
  },
  '查看自己的牌庫上方7張卡，從其中選擇1張支援者卡，在給對手看過後加入手牌。將剩餘卡放回牌庫並重洗。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      const top = p.deck.slice(0, 7);
      const ch = await pick(g, p, top.filter(i => card(g, i).trainer === 'Supporter'), { max: 1, title: '選擇1張支援者卡', purpose: 'searchSupporter', extra: { looked: top } });
      fromDeck(g, p, ch); p.hand.push(...ch); g.shuffle(p.deck);
    },
  },
  '將自己的戰鬥寶可夢與備戰寶可夢互換。': { canPlay: (g, p) => p.bench.length > 0, play: (g, p) => g.switchOwn(p) },
  '擲1次硬幣若為正面，則選擇1隻對手的備戰寶可夢，與戰鬥寶可夢互換。': { canPlay: gustItem.canPlay, play: (g, p) => (g.coin(p) ? g.gust(p) : null) },
  '選擇1張自己的手牌，放回牌庫下方。然後，從牌庫抽卡直到自己的手牌滿5張為止。（若自己的手牌只有這1張，則無法使用這張卡。）': {
    canPlay: (g, p) => p.hand.length >= 2,
    play: async (g, p) => {
      const [i] = await pick(g, p, [...p.hand], { min: 1, max: 1, title: '選擇要放回牌庫下方的手牌', purpose: 'discardFromHand' });
      g.removeFromHand(p, i); p.deck.push(i);
      drawN(g, p, Math.max(0, 5 - p.hand.length));
    },
  },
  '選擇最多2隻自己的寶可夢，各恢復「50」HP。': {
    canPlay: (g, p) => g.slots(p).some(s => s.damage > 0),
    play: async (g, p) => {
      const ch = await g.ask(p, { kind: 'slots', title: '選擇最多2隻要恢復的寶可夢', slots: g.slots(p).filter(s => s.damage > 0), min: 1, max: 2, purpose: 'heal' });
      for (const s of ch) g.heal(s, 50);
    },
  },
  '從自己的牌庫選擇最多2張進化寶可夢卡，在給對手看過後加入手牌。並且重洗牌庫。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: (g, p) => searchDeck(g, p, c => isPokemon(c) && c.stage > 0, { max: 2, title: '選擇最多2張進化寶可夢', purpose: 'searchEvolution' }),
  },
  '雙方玩家各自將手牌全部放回牌庫並重洗。然後，各自從牌庫抽出4張卡。': {
    play: (g, p) => { for (const pl of g.players) { pl.deck.push(...pl.hand); pl.hand = []; g.shuffle(pl.deck); drawN(g, pl, 4); } },
  },
  '選擇1個對手的戰鬥寶可夢身上附加的能量，放回對手的牌庫上方。': {
    canPlay: (g, p) => g.opp(p).active?.energy.length > 0,
    play: async (g, p) => {
      const o = g.opp(p);
      const [e] = await pick(g, p, [...o.active.energy], { min: 1, max: 1, title: '選擇要放回對手牌庫上方的能量', purpose: 'discardOppEnergy' });
      o.active.energy = o.active.energy.filter(x => x !== e);
      o.deck.unshift(e);
      g.log(`${card(g, e).name}被放回對手的牌庫上方`);
    },
  },
  '將自己的手牌全部放回牌庫並重洗。然後，從牌庫抽出5張卡。': {
    play: (g, p) => { p.deck.push(...p.hand); p.hand = []; g.shuffle(p.deck); drawN(g, p, 5); },
  },
  '從自己的牌庫抽出3張卡。': draw(3),
  '將自己的手牌全部丟棄，從牌庫抽出7張卡。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: (g, p) => { p.discard.push(...p.hand); p.hand = []; drawN(g, p, 7); },
  },
  '從自己的牌庫選擇「物品」卡與「寶可夢道具」卡各1張，在給對手看過後加入手牌。並且重洗牌庫。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      await searchDeck(g, p, c => c.trainer === 'Item', { max: 1, title: '選擇1張物品卡', purpose: 'searchItem' });
      await searchDeck(g, p, c => c.trainer === 'Tool', { max: 1, title: '選擇1張寶可夢道具卡', purpose: 'searchTool' });
    },
  },
  '選擇1隻對手的備戰寶可夢，與戰鬥寶可夢互換。': gustItem,
  '擲1次硬幣若為正面，則從自己的棄牌區選擇1張基本能量卡，附於備戰寶可夢身上。': {
    canPlay: (g, p) => p.bench.length > 0 && p.discard.some(i => isBasicEnergy(card(g, i))),
    play: async (g, p) => {
      if (!g.coin(p)) return;
      const [e] = await pick(g, p, p.discard.filter(i => isBasicEnergy(card(g, i))), { min: 1, max: 1, title: '選擇1張基本能量', purpose: 'discardEnergyToAttach' });
      if (!e) return;
      p.discard.splice(p.discard.indexOf(e), 1);
      await attachEach(g, p, [e], benchOf(p), '選擇要附上能量的備戰寶可夢');
    },
  },
  '查看自己的牌庫上方4張卡，從其中選擇任意數量的支援者卡，在給對手看過後加入手牌。將剩餘卡放回牌庫並重洗。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      const top = p.deck.slice(0, 4);
      const ch = await pick(g, p, top.filter(i => card(g, i).trainer === 'Supporter'), { max: 4, title: '選擇任意數量的支援者卡', purpose: 'searchSupporter', extra: { looked: top } });
      fromDeck(g, p, ch); p.hand.push(...ch); g.shuffle(p.deck);
      if (ch.length) g.log(`${p.name}將${ch.map(i => card(g, i).name).join('、')}加入手牌`);
    },
  },
  '這張卡必須將自己的1張手牌丟棄才可使用。 從牌庫抽卡直到自己的手牌滿6張為止。': {
    ...discardCost(1),
    canPlay: (g, p) => p.hand.length >= 2 && p.deck.length > 0,
    play: async function (g, p) { await this.pay(g, p); drawN(g, p, Math.max(0, 6 - p.hand.length)); },
  },
  '雙方玩家各將手牌全部放回牌庫並重洗。然後，自己擲1次硬幣，若為正面，則從牌庫抽卡，自己抽出5張，對手抽出3張。若為反面，則從牌庫抽卡，自己抽出3張，對手抽出5張。': {
    play: (g, p) => {
      for (const pl of g.players) { pl.deck.push(...pl.hand); pl.hand = []; g.shuffle(pl.deck); }
      const heads = g.coin(p);
      drawN(g, p, heads ? 5 : 3);
      drawN(g, g.opp(p), heads ? 3 : 5);
    },
  },
  '這張卡必須將自己的2張手牌丟棄才可使用。從自己的牌庫選擇1張寶可夢卡，在給對手看過後加入手牌。並且重洗牌庫。': null,
  '選擇1隻對手的備戰寶可夢，與戰鬥寶可夢互換。然後，將自己的戰鬥寶可夢與備戰寶可夢互換。': {
    canPlay: (g, p) => g.opp(p).bench.length > 0 || p.bench.length > 0,
    play: async (g, p) => { await g.gust(p); await g.switchOwn(p); },
  },
  '從自己的棄牌區選擇1張寶可夢卡或者基本能量卡，在給對手看過後加入手牌。': {
    canPlay: (g, p) => p.discard.some(i => { const c = card(g, i); return isPokemon(c) || isBasicEnergy(c); }),
    play: async (g, p) => moveDiscardToHand(g, p, await pick(g, p, p.discard.filter(i => { const c = card(g, i); return isPokemon(c) || isBasicEnergy(c); }), { min: 1, max: 1, title: '選擇1張寶可夢卡或基本能量卡', purpose: 'recoverAny' })),
  },
  '這張卡只有在自己剩餘獎賞卡的張數比對手剩餘獎賞卡的張數多時才可使用。選擇1隻對手的備戰寶可夢，與戰鬥寶可夢互換。': {
    canPlay: (g, p) => p.prizes.length > g.opp(p).prizes.length && g.opp(p).bench.length > 0,
    play: (g, p) => g.gust(p),
  },
  '這張卡必須將自己的2張手牌丟棄才可使用。 從自己的棄牌區選擇最多4張基本能量卡，在給對手看過後加入手牌。（不可選擇因這張卡的效果而丟棄的能量卡。）': {
    ...discardCost(2),
    canPlay: (g, p) => p.hand.length >= 3 && p.discard.some(i => isBasicEnergy(card(g, i))),
    play: async function (g, p) {
      const before = p.discard.filter(i => isBasicEnergy(card(g, i)));
      await this.pay(g, p);
      moveDiscardToHand(g, p, await pick(g, p, before, { max: 4, title: '選擇最多4張基本能量', purpose: 'recoverEnergy' }));
    },
  },
  '這張卡可在先攻玩家的最初回合使用。 將自己的手牌全部丟棄，從牌庫抽出5張卡。': {
    firstTurnOk: true,
    canPlay: (g, p) => p.deck.length > 0,
    play: (g, p) => { p.discard.push(...p.hand); p.hand = []; drawN(g, p, 5); },
  },
  '查看對手的手牌，從其中選擇1張【基礎】寶可夢卡，放置於對手的備戰區。然後，將那隻寶可夢與戰鬥寶可夢互換。': {
    canPlay: (g, p) => g.opp(p).bench.length < 5,
    play: async (g, p) => {
      const o = g.opp(p);
      g.log(`${p.name}查看了對手的手牌`);
      const [i] = await pick(g, p, o.hand.filter(x => isBasicPokemon(card(g, x))), { min: 1, max: 1, title: '選擇對手手牌中的基礎寶可夢', purpose: 'bossBasic', extra: { looked: [...o.hand] } });
      if (!i) return;
      g.removeFromHand(o, i);
      const s = g.putOnBench(o, i);
      g.switchActive(o, s);
    },
  },
  '這張卡必須將自己的3張手牌丟棄才可使用。 從自己的牌庫選擇「物品」「寶可夢道具」「支援者」「競技場」卡各1張，在給對手看過後加入手牌。並且重洗牌庫。': {
    ...discardCost(3),
    play: async function (g, p) {
      await this.pay(g, p);
      for (const [t, n] of [['Item', '物品'], ['Tool', '寶可夢道具'], ['Supporter', '支援者'], ['Stadium', '競技場']]) {
        await searchDeck(g, p, c => c.trainer === t, { max: 1, title: `選擇1張${n}卡`, purpose: 'search' + t });
      }
    },
  },
  '雙方玩家各將自己的手牌全部翻回反面並重洗，放回牌庫下方。然後，各從牌庫抽出與自己剩餘獎賞卡的張數相同數量的卡。': {
    play: (g, p) => {
      for (const pl of g.players) { g.shuffle(pl.hand); pl.deck.push(...pl.hand); pl.hand = []; }
      for (const pl of g.players) drawN(g, pl, pl.prizes.length);
    },
  },
  '將自己的戰鬥寶可夢與備戰寶可夢互換。然後，選擇換入備戰區的寶可夢身上附加的任意數量的能量卡，改附於新的戰鬥寶可夢身上。': {
    canPlay: (g, p) => p.bench.length > 0,
    play: async (g, p) => {
      const old = p.active;
      await g.switchOwn(p);
      if (!old.energy.length) return;
      const ch = await pick(g, p, [...old.energy], { max: old.energy.length, title: '選擇要移到新戰鬥寶可夢的能量', purpose: 'moveEnergyAll' });
      old.energy = old.energy.filter(e => !ch.includes(e));
      p.active.energy.push(...ch);
    },
  },
  '從自己的牌庫選擇最多3張「寶可夢【ex】」卡，在給對手看過後加入手牌。並且重洗牌庫。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: (g, p) => searchDeck(g, p, c => c.cat === 'P' && c.ex, { max: 3, title: '選擇最多3張寶可夢ex', purpose: 'searchPokemon' }),
  },
  '將自己的所有【雷】寶可夢各恢復「60」HP。': {
    play: (g, p) => { for (const s of g.slots(p)) if (g.top(s).type === 'L') g.heal(s, 60); },
  },
  '在下個對手的回合，自己的所有寶可夢受到對手的寶可夢招式的傷害「-30」點。（包含新上場的寶可夢。）': {
    play: (g, p) => { p.effects.push({ kind: 'reduceDamage', amount: 30, turn: g.turn + 1 }); },
  },
};
function rareCandyTargets(g, p) {
  if (g.turn <= 2) return [];
  const out = [];
  for (const inst of p.hand) {
    const c = card(g, inst);
    if (c.cat !== 'P' || c.stage !== 2) continue;
    const mid = [...cardDataByName(c.from)];
    for (const s of g.slots(p)) {
      const t = g.top(s);
      if (t.stage === 0 && s.playedTurn !== g.turn && mid.some(m => m.from === t.name)) out.push({ inst, slot: s });
    }
  }
  return out;
}
function* cardDataByName(name) { for (const c of CARDS) if (c.name === name) yield c; }

TRAINER_BY_TEXT['這張卡必須將自己的2張手牌丟棄才可使用。從自己的牌庫選擇1張寶可夢卡，在給對手看過後加入手牌。並且重洗牌庫。'] =
  TRAINER_BY_TEXT['這張卡必須將自己的2張手牌丟棄才可使用。 從自己的牌庫選擇1張寶可夢卡，在給對手看過後加入手牌。並且重洗牌庫。'];

export function getTrainerImpl(c) {
  return TRAINER_BY_TEXT[c.text] || {};
}

// ================= 寶可夢道具 =================
const TOOLS = {
  '附有這張卡的【鬥】寶可夢，受到對手的寶可夢招式的傷害「-30」點。': { reduceDamage: (g, s) => (g.top(s).type === 'F' ? 30 : 0) },
  '附有這張卡的寶可夢使用的招式，對對手的戰鬥寶可夢造成的傷害「+10」點。': { damageBonus: () => 10 },
  '當附有這張卡的寶可夢在戰鬥場受到對手的寶可夢招式的傷害時，在使用招式的寶可夢身上放置2個傷害指示物。': {
    onDamagedActive: (g, s, attacker) => { attacker.damage += 20; g.log(`「凸凸頭盔」在${g.top(attacker).name}身上放置2個傷害指示物`); },
  },
  '附有這張卡的【基礎】寶可夢的最大HP「+50」。': { hpBonus: (g, s, c) => (c.stage === 0 ? 50 : 0) },
};
export function getToolImpl(c) { return TOOLS[c.text] || {}; }

// ================= 競技場 =================
const STADIUMS = {
  '雙方場上所有【基礎】寶可夢的最大HP各「+30」。': { hpBonus: (g, s, c) => (c.stage === 0 ? 30 : 0) },
  '雙方場上所有【2階進化】寶可夢的最大HP各「-30」。': { hpBonus: (g, s, c) => (c.stage === 2 ? -30 : 0) },
  '雙方玩家在每個自己的回合時，可使用1次，可從自己的牌庫選擇1張【基礎】寶可夢卡（「擁有規則的寶可夢」除外），放置於備戰區。並且重洗牌庫。': {
    canUse: (g, p) => p.bench.length < 5 && p.deck.length > 0,
    use: (g, p) => searchDeck(g, p, c => isBasicPokemon(c) && !hasRule(c), { max: 1, title: '選擇1張基礎寶可夢（無規則）', purpose: 'benchSearch', dest: 'bench' }),
  },
  '雙方場上【基礎】寶可夢使用招式所需的能量，各增加1個【無】能量。': { extraCost: (g, s) => (g.top(s).stage === 0 ? ['C'] : []) },
};
export function getStadiumImpl(c) { return STADIUMS[c.text] || {}; }

// ================= 特殊能量 =================
const SPECIAL_ENERGY = {
  '只要這張卡附於寶可夢身上，視為提供1個【無】能量。 若自己剩餘獎賞卡的張數，比對手剩餘獎賞卡的張數多，則只要這張卡附於進化寶可夢（「擁有規則的寶可夢」除外）身上，視為提供3個所有屬性的能量。': {
    provides: (g, s) => {
      const p = g.ownerOf(s);
      const c = g.top(s);
      if (p && c.stage > 0 && !hasRule(c) && p.prizes.length > g.opp(p).prizes.length) return ['*', '*', '*'];
      return ['C'];
    },
  },
  '只要這張卡附於寶可夢身上，視為提供1個【無】能量。 從手牌將這張卡附於備戰寶可夢身上時，將附有這張卡的寶可夢與戰鬥寶可夢互換。': {
    provides: () => ['C'],
    onAttach: (g, p, s) => { if (p.active !== s) g.switchActive(p, s); },
  },
  '只要這張卡附於寶可夢身上，視為提供1個【無】能量。 附有這張卡的寶可夢不會【睡眠】・【麻痺】・【混亂】，受到的【睡眠】・【麻痺】・【混亂】全部恢復。': {
    provides: () => ['C'],
    immune: ['asleep', 'paralyzed', 'confused'],
    onAttach: (g, p, s) => { delete s.cond.asleep; delete s.cond.paralyzed; delete s.cond.confused; },
  },
};
export function getEnergyImpl(c) { return SPECIAL_ENERGY[c.text] || { provides: () => ['C'] }; }
