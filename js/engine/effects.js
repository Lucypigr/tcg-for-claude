// 卡片效果：招式文字自動編譯 + 手動實作的特性/訓練家/能量
import { cardData, isBasicEnergy, isBasicPokemon, isPokemon, hasRule, isAncient, isFuture, prizeValue } from './cards.js';
import { CARDS } from '../data/cards.js';

const T2L = { 草: 'G', 火: 'R', 水: 'W', 雷: 'L', 超: 'P', 鬥: 'F', 惡: 'D', 鋼: 'M', 龍: 'N', 無: 'C' };
const COND = { 麻痺: 'paralyzed', 中毒: 'poison', 灼傷: 'burn', 睡眠: 'asleep', 混亂: 'confused' };
const card = (g, inst) => cardData(inst.cid);
const COND_NAMES_TW = { poison: '中毒', burn: '灼傷', asleep: '睡眠', paralyzed: '麻痺', confused: '混亂' };

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
  // ---- 虛無歸零 追加句型 ----
  [/^從自己的牌庫選擇(\d+)張能量卡，附於備戰區的【(.)】寶可夢身上$/, m => ({
    after: async ctx => {
      const targets = ctx.me.bench.filter(s => ctx.g.typesOf(s).includes(T2L[m[2]]));
      if (!targets.length) { ctx.g.shuffle(ctx.me.deck); return; }
      const ch = await searchDeck(ctx.g, ctx.me, c => c.cat === 'E', { max: +m[1], title: `選擇${m[1]}張能量卡`, purpose: 'searchEnergy', dest: 'none' });
      await attachEach(ctx.g, ctx.me, ch, targets, '選擇要附上能量的寶可夢');
    },
  })],
  [/^造成自己的場上寶可夢的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = ctx.g.slots(ctx.me).length * +m[1]; },
    est: (b, e) => e.g.slots(e.me).length * +m[1],
  })],
  [/^若自己的棄牌區有「(.+)」，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.me.discard.some(i => card(ctx.g, i).name === m[1])) ctx.base += +m[2]; },
    est: (b, e) => b + (e.me.discard.some(i => cardData(i.cid).name === m[1]) ? +m[2] : 0),
  })],
  [/^若場上有競技場卡，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.g.stadium) ctx.base += +m[1]; },
    est: (b, e) => b + (e.g.stadium ? +m[1] : 0),
  })],
  [/^從自己的牌庫任意選擇最多(\d+)張卡加入手牌$/, m => ({
    after: ctx => searchDeck(ctx.g, ctx.me, () => true, { max: +m[1], title: `從牌庫選擇最多${m[1]}張卡`, purpose: 'searchAny' }),
  })],
  [/^在下個對手的回合，受到這個招式的寶可夢，?無法使用招式$/, () => ({
    after: ctx => { if (ctx.defender && ctx.opp.active === ctx.defender) ctx.g.addEffect(ctx.defender, { kind: 'noAttack', turn: ctx.g.turn + 1 }); },
  })],
  [/^造成自己已經獲得的獎賞卡的張數×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = (6 - ctx.me.prizes.length) * +m[1]; },
    est: (b, e) => (6 - e.me.prizes.length) * +m[1],
  })],
  [/^若希望，從自己的手牌將最多(\d+)張能量卡丟棄，增加其張數×(\d+)點傷害$/, m => ({
    before: async ctx => {
      const ch = await pick(ctx.g, ctx.me, ctx.me.hand.filter(i => card(ctx.g, i).cat === 'E'), { min: 0, max: +m[1], title: `選擇最多${m[1]}張能量卡丟棄（每張+${m[2]}點傷害）`, purpose: 'discardForDamage' });
      for (const i of ch) { ctx.g.removeFromHand(ctx.me, i); ctx.me.discard.push(i); }
      ctx.base += ch.length * +m[2];
    },
    est: (b, e) => b + Math.min(+m[1], e.me.hand.filter(i => cardData(i.cid).cat === 'E').length) * +m[2],
  })],
  [/^從自己的手牌將最多(\d+)張能量卡丟棄，造成其張數×(\d+)點傷害$/, m => ({
    before: async ctx => {
      const ch = await pick(ctx.g, ctx.me, ctx.me.hand.filter(i => card(ctx.g, i).cat === 'E'), { min: 0, max: +m[1], title: `選擇最多${m[1]}張能量卡丟棄（每張${m[2]}點傷害）`, purpose: 'discardForDamage' });
      for (const i of ch) { ctx.g.removeFromHand(ctx.me, i); ctx.me.discard.push(i); }
      ctx.base = ch.length * +m[2];
    },
    est: (b, e) => Math.min(+m[1], e.me.hand.filter(i => cardData(i.cid).cat === 'E').length) * +m[2],
  })],
  [/^將自己的1隻寶可夢恢復「(\d+)」HP$/, m => ({
    after: async ctx => {
      const hurt = ctx.g.slots(ctx.me).filter(s => s.damage > 0);
      const s = await pickSlot(ctx.g, ctx.me, hurt, { title: `選擇要恢復${m[1]}HP的寶可夢`, purpose: 'heal' });
      if (s) ctx.g.heal(s, +m[1]);
    },
  })],
  [/^在這個回合，若從手牌使出了「(.+)」，則將對手的牌庫上方(\d+)張卡丟棄$/, m => ({
    after: ctx => {
      if (!ctx.g.playerEffect(ctx.me, 'playedSupporter').some(e => e.name === m[1])) return;
      const t = ctx.opp.deck.splice(0, +m[2]); ctx.opp.discard.push(...t);
      if (t.length) ctx.g.log(`丟棄了對手牌庫上方${t.length}張卡`);
    },
  })],
  [/^擲硬幣直到出現反面，將對手的牌庫上方與正面出現的次數相同數量的卡丟棄$/, () => ({
    after: ctx => {
      let h = 0; while (ctx.g.coin(ctx.me)) h++;
      const t = ctx.opp.deck.splice(0, h); ctx.opp.discard.push(...t);
      if (t.length) ctx.g.log(`丟棄了對手牌庫上方${t.length}張卡`);
    },
  })],
  [/^若自己的備戰寶可夢身上放置有傷害指示物，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.me.bench.some(s => s.damage > 0)) ctx.base += +m[1]; },
    est: (b, e) => b + (e.me.bench.some(s => s.damage > 0) ? +m[1] : 0),
  })],
  [/^對於對手的所有寶可夢，各自擲1次硬幣，所有出現正面的寶可夢，各受到(\d+)點傷害$/, m => ({
    after: ctx => { for (const s of ctx.g.slots(ctx.opp)) if (ctx.g.coin(ctx.me, ctx.g.top(s).name)) ctx.g.dealAttackDamage(ctx.attacker, s, +m[1]); },
    est: () => +m[1] / 2,
  })],
  [/^在對手的戰鬥寶可夢身上放置(\d+)個傷害指示物$/, m => ({
    after: ctx => { if (ctx.opp.active) ctx.g.placeCounters(ctx.opp.active, +m[1]); },
    est: b => b + +m[1] * 10,
  })],
  [/^將對手所有剩餘HP為「(\d+)」以下的寶可夢【昏厥】$/, m => ({
    after: ctx => {
      const g = ctx.g;
      for (const s of g.slots(ctx.opp)) {
        if (g.hpLeft(s) > +m[1]) continue;
        if (g.effectBlocked(s) || g.hasEffect(s, 'preventAll')) { g.log(`${g.top(s).name}不受招式的效果影響！`); continue; }
        s.damage = Math.max(s.damage, g.maxHp(s));
        g.log(`${g.top(s).name}被「${ctx.atk.name}」擊倒了`, 'dmg');
      }
    },
    est: (b, e) => (e.def && e.g.hpLeft(e.def) <= +m[1] ? e.g.hpLeft(e.def) : 0),
  })],
  [/^在造成傷害前，將對手的戰鬥寶可夢身上附加的「寶可夢道具」卡丟棄$/, () => ({
    before: ctx => {
      const d = ctx.defender;
      if (!d?.tool || ctx.g.effectBlocked(d)) return;
      ctx.opp.discard.push(d.tool); ctx.g.log(`${card(ctx.g, d.tool).name}被丟棄了`); d.tool = null;
    },
  })],
  [/^造成自己備戰區的所有「(.+)」身上放置的傷害指示物的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = ctx.me.bench.filter(s => ctx.g.top(s).name === m[1]).reduce((n, s) => n + s.damage / 10, 0) * +m[2]; },
    est: (b, e) => e.me.bench.filter(s => e.g.top(s).name === m[1]).reduce((n, s) => n + s.damage / 10, 0) * +m[2],
  })],
  [/^將這隻寶可夢與附加的卡，全部放回手牌$/, () => ({
    after: async ctx => { if (bounceBlocked(ctx.g, ctx.me)) return; if (ctx.me.active === ctx.attacker && (ctx.me.bench.length || true)) await returnToHand(ctx.g, ctx.me, ctx.attacker, false); },
  })],
  [/^擲硬幣直到出現反面，從自己的牌庫選擇最多與正面出現的次數相同數量的基本能量卡，附於這隻寶可夢身上$/, () => ({
    after: async ctx => {
      let h = 0; while (ctx.g.coin(ctx.me)) h++;
      if (!h) return;
      const ch = await searchDeck(ctx.g, ctx.me, c => isBasicEnergy(c), { max: h, title: `選擇最多${h}張基本能量`, purpose: 'searchEnergy', dest: 'none' });
      ctx.attacker.energy.push(...ch);
      if (ch.length) ctx.g.log(`將${ch.length}張能量附於${ctx.card.name}身上`);
    },
  })],
  [/^從自己的牌庫選擇最多(\d+)張抵抗力為【(.)】屬性的寶可夢卡，在給對手看過後加入手牌$/, m => ({
    after: ctx => searchDeck(ctx.g, ctx.me, c => isPokemon(c) && c.resist === T2L[m[2]], { max: +m[1], title: `選擇最多${m[1]}張抵抗力為${m[2]}的寶可夢`, purpose: 'searchPokemon' }),
  })],
  [/^在不看正面的情況下，將對手的手牌丟棄直到張數變為(\d+)張為止$/, m => ({
    after: ctx => {
      const g = ctx.g, o = ctx.opp;
      let n = 0;
      while (o.hand.length > +m[1]) { const i = o.hand.splice(Math.floor(g.rng() * o.hand.length), 1)[0]; o.discard.push(i); n++; }
      if (n) g.log(`隨機丟棄了對手的${n}張手牌`);
    },
  })],
  // ---- 太晶慶典 追加句型 ----
  [/^從自己的棄牌區選擇最多(\d+)張「基本【(.)】能量」卡，附於自己的1隻寶可夢身上$/, m => ({
    after: async ctx => {
      const cands = ctx.me.discard.filter(i => { const c = card(ctx.g, i); return isBasicEnergy(c) && c.provides === T2L[m[2]]; });
      const ch = await pick(ctx.g, ctx.me, cands, { max: +m[1], title: `從棄牌區選擇最多${m[1]}張基本${m[2]}能量`, purpose: 'discardEnergyToAttach' });
      if (!ch.length) return;
      const s = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.me), { title: '選擇要附上能量的寶可夢', purpose: 'attachTarget', extra: { energy: ch[0].cid } });
      ctx.me.discard = ctx.me.discard.filter(i => !ch.includes(i));
      s.energy.push(...ch);
      ctx.g.log(`${ctx.g.top(s).name}附上了${ch.length}張能量`);
    },
  })],
  [/^造成自己的備戰寶可夢的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = ctx.me.bench.length * +m[1]; },
    est: (b, e) => e.me.bench.length * +m[1],
  })],
  [/^增加自己的所有寶可夢身上附加的【(.)】能量的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base += ctx.g.slots(ctx.me).reduce((n, s) => n + ctx.g.countEnergy(s, T2L[m[1]]), 0) * +m[2]; },
    est: (b, e) => b + e.g.slots(e.me).reduce((n, s) => n + e.g.countEnergy(s, T2L[m[1]]), 0) * +m[2],
  })],
  [/^擲與這隻寶可夢身上附加的能量的數量相同次數的硬幣，造成正面出現的次數×(\d+)點傷害$/, m => ({
    before: ctx => { const n = ctx.g.countEnergy(ctx.attacker); let h = 0; for (let i = 0; i < n; i++) if (ctx.g.coin(ctx.me)) h++; ctx.base = h * +m[1]; },
    est: (b, e) => e.g.countEnergy(e.slot) * +m[1] / 2,
  })],
  [/^在下個對手的回合，受到這個招式的寶可夢使用招式所需的能量增加(\d+)個【無】能量$/, m => ({
    after: ctx => { if (ctx.defender && ctx.opp.active === ctx.defender) ctx.g.addEffect(ctx.defender, { kind: 'extraCost', n: +m[1], turn: ctx.g.turn + 1 }); },
  })],
  [/^將自己的所有(備戰)?寶可夢各恢復「(\d+)」HP$/, m => ({
    after: ctx => { for (const s of m[1] ? benchOf(ctx.me) : ctx.g.slots(ctx.me)) ctx.g.heal(s, +m[2]); },
  })],
  [/^增加雙方的戰鬥寶可夢身上附加的能量的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base += (ctx.g.countEnergy(ctx.attacker) + (ctx.defender ? ctx.g.countEnergy(ctx.defender) : 0)) * +m[1]; },
    est: (b, e) => b + (e.g.countEnergy(e.slot) + (e.def ? e.g.countEnergy(e.def) : 0)) * +m[1],
  })],
  [/^若對手的戰鬥寶可夢為「寶可夢【ex】・【V】」，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.defender && isExV(ctx.g.top(ctx.defender))) ctx.base += +m[1]; },
    est: (b, e) => b + (e.def && isExV(e.g.top(e.def)) ? +m[1] : 0),
  })],
  [/^從自己的牌庫選擇最多(\d+)張基本能量卡，附於自己的1隻寶可夢身上$/, m => ({
    after: async ctx => {
      const ch = await searchDeck(ctx.g, ctx.me, isBasicEnergy, { max: +m[1], title: `選擇最多${m[1]}張基本能量`, purpose: 'searchEnergy', dest: 'none' });
      if (!ch.length) return;
      const s = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.me), { title: '選擇要附上能量的寶可夢', purpose: 'attachTarget', extra: { energy: ch[0].cid } });
      s.energy.push(...ch);
    },
  })],
  [/^在上個對手的回合，若自己的寶可夢因招式的傷害而【昏厥】了，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.me.lastKoByAttackTypes.some(k => k.turn === ctx.g.turn - 1)) ctx.base += +m[1]; },
    est: (b, e) => b + (e.me.lastKoByAttackTypes.some(k => k.turn === e.g.turn - 1) ? +m[1] : 0),
  })],
  [/^從自己的牌庫選擇1張物品卡，在給對手看過後加入手牌$/, () => ({
    after: ctx => searchDeck(ctx.g, ctx.me, c => c.trainer === 'Item', { max: 1, title: '選擇1張物品卡', purpose: 'searchItem' }),
  })],
  [/^在下個對手的回合，受到這個招式的進化寶可夢無法使用招式$/, () => ({
    after: ctx => { if (ctx.defender && ctx.opp.active === ctx.defender && ctx.g.top(ctx.defender).stage > 0) ctx.g.addEffect(ctx.defender, { kind: 'noAttack', turn: ctx.g.turn + 1 }); },
  })],
  [/^若對手的戰鬥寶可夢處於特殊狀態，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.defender && Object.keys(ctx.defender.cond).length) ctx.base += +m[1]; },
    est: (b, e) => b + (e.def && Object.keys(e.def.cond).length ? +m[1] : 0),
  })],
  [/^增加對手的備戰寶可夢的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base += ctx.opp.bench.length * +m[1]; },
    est: (b, e) => b + e.g.opp(e.me).bench.length * +m[1],
  })],
  [/^在對手的1隻寶可夢身上放置(\d+)個傷害指示物$/, m => ({
    after: async ctx => {
      const s = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.opp), { title: `選擇要放置${m[1]}個傷害指示物的對手寶可夢`, purpose: 'counterTarget', target: ctx.opp.index, extra: { counters: +m[1] } });
      if (s) ctx.g.placeCounters(s, +m[1]);
    },
    est: b => b + +m[1] * 10,
  })],
  [/^造成這隻寶可夢身上附加的能量的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = ctx.g.countEnergy(ctx.attacker) * +m[1]; },
    est: (b, e) => e.g.countEnergy(e.slot) * +m[1],
  })],
  [/^若自己的手牌與對手的手牌不是相同張數，則這個招式失敗$/, () => ({
    before: ctx => ctx.me.hand.length === ctx.opp.hand.length,
    canUse: (g, p) => p.hand.length === g.opp(p).hand.length,
  })],
  [/^從自己的手牌選擇1張「基本【(.)】能量」卡，附於自己的寶可夢身上$/, m => ({
    after: async ctx => {
      const [e] = await pick(ctx.g, ctx.me, ctx.me.hand.filter(i => { const c = card(ctx.g, i); return isBasicEnergy(c) && c.provides === T2L[m[1]]; }), { max: 1, title: `選擇1張基本${m[1]}能量`, purpose: 'searchEnergy' });
      if (!e) return;
      ctx.g.removeFromHand(ctx.me, e);
      await attachEach(ctx.g, ctx.me, [e], ctx.g.slots(ctx.me), '選擇要附上能量的寶可夢');
    },
  })],
  [/^若對手的場上有「未來」寶可夢，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.g.slots(ctx.opp).some(s => isFuture(ctx.g.top(s)))) ctx.base += +m[1]; },
    est: (b, e) => b + (e.g.slots(e.g.opp(e.me)).some(s => isFuture(e.g.top(s))) ? +m[1] : 0),
  })],
  [/^若這隻寶可夢身上放置有(\d+)個以上的傷害指示物，則這個招式失敗$/, m => ({
    before: ctx => ctx.attacker.damage / 10 < +m[1],
    canUse: (g, p, s) => s.damage / 10 < +m[1],
  })],
  [/^這個招式的傷害不計算弱點・抵抗力與對手的戰鬥寶可夢身上的附加效果$/, () => ({ opts: { noWeakness: true, noResistance: true, ignoreEffects: true } })],
  [/^造成對手的場上的「寶可夢【ex】・【V】」的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = ctx.g.slots(ctx.opp).filter(s => isExV(ctx.g.top(s))).length * +m[1]; },
    est: (b, e) => e.g.slots(e.g.opp(e.me)).filter(s => isExV(e.g.top(s))).length * +m[1],
  })],
  [/^增加自己的棄牌區的「古代」卡的張數×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base += ctx.me.discard.filter(i => ancientCard(card(ctx.g, i))).length * +m[1]; },
    est: (b, e) => b + e.me.discard.filter(i => ancientCard(cardData(i.cid))).length * +m[1],
  })],
  [/^若這隻寶可夢【中毒】，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.attacker.cond.poison) ctx.base += +m[1]; },
    est: (b, e) => b + (e.slot.cond.poison ? +m[1] : 0),
  })],
  [/^造成對手已經獲得的獎賞卡的張數×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = (6 - ctx.opp.prizes.length) * +m[1]; },
    est: (b, e) => (6 - e.g.opp(e.me).prizes.length) * +m[1],
  })],
  [/^從自己的牌庫選擇最多(\d+)張基本能量卡，在給對手看過後加入手牌$/, m => ({
    after: ctx => searchDeck(ctx.g, ctx.me, isBasicEnergy, { max: +m[1], title: `選擇最多${m[1]}張基本能量`, purpose: 'searchEnergy' }),
  })],
  [/^造成自己的場上的「古代」寶可夢的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = ctx.g.slots(ctx.me).filter(s => isAncient(ctx.g.top(s))).length * +m[1]; },
    est: (b, e) => e.g.slots(e.me).filter(s => isAncient(e.g.top(s))).length * +m[1],
  })],
  [/^若場上沒有競技場卡，則這個招式失敗$/, () => ({ before: ctx => !!ctx.g.stadium, canUse: g => !!g.stadium })],
  [/^若對手的戰鬥寶可夢為「太晶」寶可夢，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.defender && ctx.g.top(ctx.defender).tera) ctx.base += +m[1]; },
    est: (b, e) => b + (e.def && e.g.top(e.def).tera ? +m[1] : 0),
  })],
  [/^增加自己的棄牌區的能量卡的張數×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base += ctx.me.discard.filter(i => card(ctx.g, i).cat === 'E').length * +m[1]; },
    est: (b, e) => b + e.me.discard.filter(i => cardData(i.cid).cat === 'E').length * +m[1],
  })],
  [/^在下個對手的回合，對手無法從手牌使出物品卡$/, () => ({
    after: ctx => { ctx.opp.effects.push({ kind: 'noItems', turn: ctx.g.turn + 1 }); ctx.g.log('下個對手的回合，對手無法使用物品卡'); },
  })],
  [/^這個招式在後攻玩家的最初回合無法使用$/, () => ({ canUse: g => g.turn !== 2 })],
  [/^若使用了這個招式，則這隻寶可夢離開戰鬥場前無法使用「(.+)」$/, m => ({
    after: ctx => ctx.g.addEffect(ctx.attacker, { kind: 'noAttackName', name: m[1], turn: Infinity }),
  })],

  // ---- 超電突圍 追加句型 ----
  [/^若自己的牌庫的剩餘張數為(\d+)張以下，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.me.deck.length <= +m[1]) ctx.base += +m[2]; },
    est: (b, e) => b + (e.me.deck.length <= +m[1] ? +m[2] : 0),
  })],
  [/^將自己的牌庫上方(\d+)張卡丟棄$/, m => ({
    after: ctx => { const t = ctx.me.deck.splice(0, +m[1]); ctx.me.discard.push(...t); if (t.length) ctx.g.log(`${ctx.me.name}丟棄了牌庫上方${t.length}張卡`); },
  })],
  [/^將對手的牌庫上方(\d+)張卡丟棄$/, m => ({
    after: ctx => { const t = ctx.opp.deck.splice(0, +m[1]); ctx.opp.discard.push(...t); if (t.length) ctx.g.log(`丟棄了對手牌庫上方${t.length}張卡`); },
  })],
  [/^若對手的戰鬥寶可夢為【(\d)階進化】寶可夢，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.defender && ctx.g.top(ctx.defender).stage === +m[1]) ctx.base += +m[2]; },
    est: (b, e) => b + (e.def && e.g.top(e.def).stage === +m[1] ? +m[2] : 0),
  })],
  [/^將這隻寶可夢恢復對對手的戰鬥寶可夢造成的傷害相同數值的HP$/, () => ({
    after: ctx => { if (ctx.dealt) ctx.g.heal(ctx.attacker, ctx.dealt); },
  })],
  [/^增加雙方的備戰寶可夢的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base += (ctx.me.bench.length + ctx.opp.bench.length) * +m[1]; },
    est: (b, e) => b + (e.me.bench.length + e.g.opp(e.me).bench.length) * +m[1],
  })],
  [/^減少對手的戰鬥寶可夢【撤退】所需的能量的數量×(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.defender) ctx.base = Math.max(0, ctx.base - ctx.g.retreatCost(ctx.defender) * +m[1]); },
    est: (b, e) => (e.def ? Math.max(0, b - e.g.retreatCost(e.def) * +m[1]) : b),
  })],
  [/^選擇1個這隻寶可夢身上附加的能量，放回手牌$/, () => ({
    after: async ctx => {
      const [e] = await pick(ctx.g, ctx.me, [...ctx.attacker.energy], { min: 1, max: 1, title: '選擇要放回手牌的能量', purpose: 'discardOwnEnergy' });
      if (!e) return;
      ctx.attacker.energy = ctx.attacker.energy.filter(x => x !== e);
      ctx.me.hand.push(e);
    },
  })],
  [/^造成對手的戰鬥寶可夢身上附加的能量的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = ctx.defender ? ctx.g.countEnergy(ctx.defender) * +m[1] : 0; },
    est: (b, e) => (e.def ? e.g.countEnergy(e.def) * +m[1] : 0),
  })],
  [/^從自己的牌庫選擇最多(\d+)張【(.)】寶可夢卡，在給對手看過後加入手牌$/, m => ({
    after: ctx => searchDeck(ctx.g, ctx.me, c => c.cat === 'P' && c.type === T2L[m[2]], { max: +m[1], title: `選擇最多${m[1]}張${m[2]}寶可夢`, purpose: 'searchPokemon' }),
  })],
  [/^若自己剩餘獎賞卡的張數，比對手剩餘獎賞卡的張數多，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.me.prizes.length > ctx.opp.prizes.length) ctx.base += +m[1]; },
    est: (b, e) => b + (e.me.prizes.length > e.g.opp(e.me).prizes.length ? +m[1] : 0),
  })],
  [/^在對手的所有寶可夢身上各放置(\d+)個傷害指示物$/, m => ({
    after: ctx => { for (const s of ctx.g.slots(ctx.opp)) ctx.g.placeCounters(s, +m[1]); },
    est: b => b + +m[1] * 10,
  })],
  [/^增加對手的所有寶可夢身上放置的傷害指示物的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base += ctx.g.slots(ctx.opp).reduce((n, s) => n + s.damage / 10, 0) * +m[1]; },
    est: (b, e) => b + e.g.slots(e.g.opp(e.me)).reduce((n, s) => n + s.damage / 10, 0) * +m[1],
  })],
  [/^從自己的棄牌區選擇1張訓練家卡，在給對手看過後加入手牌$/, () => ({
    after: async ctx => moveDiscardToHand(ctx.g, ctx.me, await pick(ctx.g, ctx.me, ctx.me.discard.filter(i => card(ctx.g, i).cat === 'T'), { max: 1, title: '選擇1張訓練家卡', purpose: 'recoverItem' })),
  })],
  [/^這個招式的傷害不計算對手的戰鬥寶可夢身上的附加效果$/, () => ({ opts: { ignoreEffects: true } })],
  [/^在下個對手的回合，受到這個招式的寶可夢，無法附上從手牌使出的能量卡$/, () => ({
    after: ctx => { if (ctx.defender && ctx.opp.active === ctx.defender) ctx.g.addEffect(ctx.defender, { kind: 'noEnergyAttach', turn: ctx.g.turn + 1 }); },
  })],
  [/^造成對手的所有寶可夢身上附加的能量的數量×(\d+)點傷害$/, m => ({
    before: ctx => { ctx.base = ctx.g.slots(ctx.opp).reduce((n, s) => n + ctx.g.countEnergy(s), 0) * +m[1]; },
    est: (b, e) => e.g.slots(e.g.opp(e.me)).reduce((n, s) => n + e.g.countEnergy(s), 0) * +m[1],
  })],
  [/^若自己的手牌不是(\d+)張，則這個招式失敗$/, m => ({
    before: ctx => ctx.me.hand.length === +m[1],
    canUse: (g, p) => p.hand.length === +m[1],
  })],
  [/^若對手的戰鬥寶可夢為「寶可夢【ex】」，則增加(\d+)點傷害$/, m => ({
    before: ctx => { if (ctx.defender && ctx.g.top(ctx.defender).ex) ctx.base += +m[1]; },
    est: (b, e) => b + (e.def && e.g.top(e.def).ex ? +m[1] : 0),
  })],
  [/^在下個自己的回合，這隻寶可夢無法撤退$/, () => ({
    after: ctx => ctx.g.addEffect(ctx.attacker, { kind: 'noRetreat', turn: ctx.g.turn + 2 }),
  })],
  [/^在下個對手的回合，這隻寶可夢受到招式的傷害時，在使用招式的寶可夢身上放置(\d+)個傷害指示物$/, m => ({
    after: ctx => ctx.g.addEffect(ctx.attacker, { kind: 'counterAttack', n: +m[1], turn: ctx.g.turn + 1 }),
  })],
  [/^從自己的牌庫選擇最多(\d+)張能量卡，在給對手看過後加入手牌$/, m => ({
    after: ctx => searchDeck(ctx.g, ctx.me, c => c.cat === 'E', { max: +m[1], title: `選擇最多${m[1]}張能量卡`, purpose: 'searchEnergy' }),
  })],
  [/^在下個自己的回合結束前，受到這個招式的寶可夢弱點改爲【無】屬性$/, () => ({
    after: ctx => {
      if (!ctx.defender || ctx.opp.active !== ctx.defender) return;
      ctx.g.addEffect(ctx.defender, { kind: 'weakC', turn: ctx.g.turn + 1 });
      ctx.g.addEffect(ctx.defender, { kind: 'weakC', turn: ctx.g.turn + 2 });
    },
  })],
  [/^在下個對手的回合，這隻寶可夢受到招式的傷害「-(\d+)」點$/, m => ({
    after: ctx => ctx.g.addEffect(ctx.attacker, { kind: 'reduceDamage', amount: +m[1], turn: ctx.g.turn + 1 }),
  })],
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
  [/^從自己的棄牌區選擇最多(\d+)張「基本【(.)】能量」卡，以任意方式附於(?:自己的)?備戰寶可夢身上$/, m => ({
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

// ---- 太晶慶典用輔助 ----
function isExV(c) { return c.cat === 'P' && (c.ex || /V$|VMAX$|VSTAR$/.test(c.name)); }
function ancientCard(c) { return isAncient(c) || /古代|奧琳博士的氣魄/.test(c.name); }
function futureCard(c) { return isFuture(c) || /未來|弗圖博士的劇本|高科技雷達/.test(c.name); }
// 「平穩境地」：對手場上有這個特性時，自己的寶可夢無法放回手牌
function bounceBlocked(g, p) { return g.slots(g.opp(p)).some(s => g.abilityOf(s)?.noBounce); }
async function returnToHand(g, p, s, onlyPokemon) {
  const wasActive = p.active === s;
  g.removeSlot(p, s);
  if (onlyPokemon) { p.hand.push(...s.cards); p.discard.push(...s.energy, ...(s.tool ? [s.tool] : [])); }
  else p.hand.push(...g.allCardsOf(s));
  g.log(`${g.top(s).name}回到了手牌`);
  if (wasActive && p.bench.length) {
    const n = await pickSlot(g, p, benchOf(p), { title: '選擇新的戰鬥寶可夢', purpose: 'promote' });
    g.switchActive(p, n);
  }
}
function fieldEnergyDiscard(max, per, filter) {
  return {
    before: async ctx => {
      const g = ctx.g, all = [];
      for (const s of g.slots(ctx.me)) for (const e of s.energy) if (filter(card(g, e))) all.push({ s, e });
      const ch = await pick(g, ctx.me, all.map(x => x.e), { min: 0, max, title: `選擇最多${max}張能量丟棄（每張${per}點傷害）`, purpose: 'ragingBolt', extra: { per } });
      for (const e of ch) g.discardEnergy(all.find(x => x.e === e).s, e);
      ctx.base = ch.length * per;
    },
    est: (b, e) => Math.min(max, e.g.slots(e.me).reduce((n, s) => n + s.energy.filter(x => filter(cardData(x.cid))).length, 0)) * per,
  };
}
function handDiscardDamage(filter, per, label) {
  return {
    before: async ctx => {
      const ch = await pick(ctx.g, ctx.me, ctx.me.hand.filter(i => filter(card(ctx.g, i))), { min: 0, max: 99, title: `選擇要丟棄的${label}（每張${per}點傷害）`, purpose: 'discardForDamage' });
      for (const i of ch) { ctx.g.removeFromHand(ctx.me, i); ctx.me.discard.push(i); }
      ctx.base = ch.length * per;
    },
    est: (b, e) => e.me.hand.filter(i => filter(cardData(i.cid))).length * per,
  };
}

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
  // ---- 虛無歸零 ----
  '將這隻寶可夢身上附加的能量卡全部丟棄，對手的1隻寶可夢受到90點傷害。[在備戰區不計算弱點・抵抗力。]': {
    before: ctx => { ctx.noMainDamage = true; },
    after: async ctx => {
      for (const e of [...ctx.attacker.energy]) ctx.g.discardEnergy(ctx.attacker, e);
      const s = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.opp), { title: '選擇要受到90點傷害的對手寶可夢', purpose: 'snipe', target: ctx.opp.index });
      if (s) ctx.g.dealAttackDamage(ctx.attacker, s, 90);
    },
    est: () => 90,
  },
  '將這隻寶可夢身上附加的能量卡全部放回牌庫並重洗，對手的1隻寶可夢受到220點傷害。[在備戰區不計算弱點・抵抗力。]': {
    before: ctx => { ctx.noMainDamage = true; },
    after: async ctx => {
      ctx.me.deck.push(...ctx.attacker.energy); ctx.attacker.energy = []; ctx.g.shuffle(ctx.me.deck);
      ctx.g.log(`${ctx.card.name}的能量全部放回了牌庫`);
      const s = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.opp), { title: '選擇要受到220點傷害的對手寶可夢', purpose: 'snipe', target: ctx.opp.index });
      if (s) ctx.g.dealAttackDamage(ctx.attacker, s, 220);
    },
    est: () => 220,
  },
  '從自己的棄牌區選擇最多與對手的所有寶可夢身上附加的能量的數量相同數量的「基本【雷】能量」卡，以任意方式附於自己的【雷】寶可夢身上。': {
    after: async ctx => {
      const n = ctx.g.slots(ctx.opp).reduce((k, s) => k + ctx.g.countEnergy(s), 0);
      const targets = ctx.g.slots(ctx.me).filter(s => ctx.g.typesOf(s).includes('L'));
      if (!n || !targets.length) return;
      const ch = await pick(ctx.g, ctx.me, ctx.me.discard.filter(i => { const c = card(ctx.g, i); return isBasicEnergy(c) && c.provides === 'L'; }), { max: n, title: `選擇最多${n}張基本雷能量`, purpose: 'recoverEnergy' });
      for (const e of ch) ctx.me.discard.splice(ctx.me.discard.indexOf(e), 1);
      await attachEach(ctx.g, ctx.me, ch, targets, '選擇要附上雷能量的寶可夢');
    },
  },
  '在下個對手的回合，受到這個招式的寶可夢使用招式時，對手擲1次硬幣。若為反面，則那個招式失敗。': {
    after: ctx => { if (ctx.defender && ctx.opp.active === ctx.defender) ctx.g.addEffect(ctx.defender, { kind: 'attackCoinFail', turn: ctx.g.turn + 1 }); },
  },
  '從自己的手牌將任意數量的「獨劍鞘」「雙劍鞘」「堅盾劍怪」給對手看過後，造成其張數×60點傷害。': {
    before: async ctx => {
      const names = ['獨劍鞘', '雙劍鞘', '堅盾劍怪'];
      const ch = await pick(ctx.g, ctx.me, ctx.me.hand.filter(i => names.includes(card(ctx.g, i).name)), { min: 0, max: 99, title: '選擇要給對手看的卡（每張60點傷害）', purpose: 'reveal' });
      if (ch.length) ctx.g.log(`${ctx.me.name}展示了${ch.map(i => card(ctx.g, i).name).join('、')}`);
      ctx.base = ch.length * 60;
    },
    est: (b, e) => e.me.hand.filter(i => ['獨劍鞘', '雙劍鞘', '堅盾劍怪'].includes(cardData(i.cid).name)).length * 60,
  },
  // ---- 太晶慶典 ----
  '從自己的手牌選擇1張「基本【草】能量」卡，附於備戰寶可夢身上。然後，將附上這些卡的寶可夢的HP全部恢復。': {
    after: async ctx => {
      const [e] = await pick(ctx.g, ctx.me, ctx.me.hand.filter(i => { const c = card(ctx.g, i); return isBasicEnergy(c) && c.provides === 'G'; }), { max: 1, title: '選擇1張基本草能量', purpose: 'searchEnergy' });
      if (!e || !ctx.me.bench.length) return;
      const s = await pickSlot(ctx.g, ctx.me, benchOf(ctx.me), { title: '選擇要附上能量的備戰寶可夢', purpose: 'heal' });
      ctx.g.removeFromHand(ctx.me, e); s.energy.push(e); ctx.g.heal(s, s.damage);
    },
  },
  '將最多3張自己的場上寶可夢身上附加的【草】能量卡丟棄，造成其張數×70點傷害。': fieldEnergyDiscard(3, 70, c => c.provides === 'G'),
  '將最多4張自己的場上寶可夢身上附加的能量卡丟棄，造成其張數×60點傷害。': fieldEnergyDiscard(4, 60, () => true),
  '在給對手看過自己的棄牌區的所有「基本【草】能量」卡後，將與其張數×2個的相同數量的傷害指示物，放置於對手的1隻寶可夢身上。然後，將給對手看過的能量卡放回牌庫並重洗。': {
    after: async ctx => {
      const es = ctx.me.discard.filter(i => { const c = card(ctx.g, i); return isBasicEnergy(c) && c.provides === 'G'; });
      if (!es.length) return;
      const n = es.length * 2;
      const s = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.opp), { title: `選擇要放置${n}個傷害指示物的對手寶可夢`, purpose: 'counterTarget', target: ctx.opp.index, extra: { counters: n } });
      if (s) ctx.g.placeCounters(s, n);
      ctx.me.discard = ctx.me.discard.filter(i => !es.includes(i));
      ctx.me.deck.push(...es); ctx.g.shuffle(ctx.me.deck);
    },
    est: (b, e) => e.me.discard.filter(i => { const c = cardData(i.cid); return isBasicEnergy(c) && c.provides === 'G'; }).length * 20,
  },
  '若對手的戰鬥寶可夢為進化寶可夢，則增加140點傷害。這個情況下，將這隻寶可夢身上附加的能量卡全部丟棄。': {
    before: ctx => { if (ctx.defender && ctx.g.top(ctx.defender).stage > 0) { ctx.base += 140; ctx.data.discardAll = true; } },
    after: ctx => { if (ctx.data.discardAll) for (const e of [...ctx.attacker.energy]) ctx.g.discardEnergy(ctx.attacker, e); },
    est: (b, e) => b + (e.def && e.g.top(e.def).stage > 0 ? 140 : 0),
  },
  '對手的所有「寶可夢【ex】」各受到60點傷害。這個招式的傷害不計算弱點・抵抗力。': {
    before: ctx => { ctx.noMainDamage = true; },
    after: ctx => { for (const s of ctx.g.slots(ctx.opp)) if (ctx.g.top(s).ex) ctx.g.dealAttackDamage(ctx.attacker, s, 60, { noWeakness: true, noResistance: true }); },
    est: (b, e) => (e.def && e.g.top(e.def).ex ? 60 : 0),
  },
  '在不看正面的情況下，從對手的手牌選擇1張，查看那張卡的正面後放回對手的牌庫並重洗。': {
    after: ctx => {
      if (!ctx.opp.hand.length) return;
      const i = ctx.opp.hand[Math.floor(ctx.g.rng() * ctx.opp.hand.length)];
      ctx.g.removeFromHand(ctx.opp, i); ctx.opp.deck.push(i); ctx.g.shuffle(ctx.opp.deck);
      ctx.g.log(`將對手手牌中的${card(ctx.g, i).name}放回牌庫`);
    },
  },
  '將2個這隻寶可夢身上附加的能量丟棄，對手的1隻寶可夢受到120點傷害。[在備戰區不計算弱點・抵抗力。]': {
    before: ctx => { ctx.noMainDamage = true; },
    after: async ctx => {
      const ch = await pick(ctx.g, ctx.me, [...ctx.attacker.energy], { min: Math.min(2, ctx.attacker.energy.length), max: 2, title: '選擇要丟棄的2個能量', purpose: 'discardOwnEnergy' });
      for (const e of ch) ctx.g.discardEnergy(ctx.attacker, e);
      const s = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.opp), { title: '選擇要受到120點傷害的對手寶可夢', purpose: 'snipe', target: ctx.opp.index });
      if (s) ctx.g.dealAttackDamage(ctx.attacker, s, 120);
    },
    est: () => 120,
  },
  '在下個對手的回合結束時，在受到這個招式的寶可夢身上放置9個傷害指示物。': {
    after: ctx => { if (ctx.defender && ctx.opp.active === ctx.defender) ctx.g.addEffect(ctx.defender, { kind: 'delayedCounters', n: 9, turn: ctx.g.turn + 1 }); },
  },
  '選擇1隻對手的身上放置有6個傷害指示物的寶可夢，將其【昏厥】。': {
    after: async ctx => {
      const s = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.opp).filter(x => x.damage === 60), { title: '選擇要昏厥的對手寶可夢', purpose: 'gust', target: ctx.opp.index });
      if (s && !ctx.g.effectBlocked(s)) { s.damage = Math.max(s.damage, ctx.g.maxHp(s)); ctx.g.log(`${ctx.g.top(s).name}昏厥了`); }
    },
    canUse: (g, p) => g.slots(g.opp(p)).some(x => x.damage === 60),
    est: (b, e) => (e.def?.damage === 60 ? 999 : 0),
  },
  '若希望，選擇3個這隻寶可夢身上附加的能量，放回牌庫並重洗。這個情況下，對手的1隻備戰寶可夢也受到120點傷害。[在備戰區不計算弱點・抵抗力。]': {
    after: async ctx => {
      if (ctx.attacker.energy.length < 3 || !ctx.opp.bench.length) return;
      const yes = await ctx.g.ask(ctx.me, { kind: 'yesno', title: '要將3個能量放回牌庫，對備戰寶可夢造成120點傷害嗎？', purpose: 'forceSwitch' });
      if (!yes) return;
      const ch = await pick(ctx.g, ctx.me, [...ctx.attacker.energy], { min: 3, max: 3, title: '選擇3個能量放回牌庫', purpose: 'discardOwnEnergy' });
      ctx.attacker.energy = ctx.attacker.energy.filter(e => !ch.includes(e));
      ctx.me.deck.push(...ch); ctx.g.shuffle(ctx.me.deck);
      const s = await pickSlot(ctx.g, ctx.me, benchOf(ctx.opp), { title: '選擇要受到120點傷害的對手備戰寶可夢', purpose: 'snipe', target: ctx.opp.index });
      if (s) ctx.g.dealAttackDamage(ctx.attacker, s, 120);
    },
  },
  '若希望，將最多2張自己的備戰寶可夢身上附加的基本能量卡丟棄，增加其張數×90點傷害。': {
    before: async ctx => {
      const all = [];
      for (const s of ctx.me.bench) for (const e of s.energy) if (isBasicEnergy(card(ctx.g, e))) all.push({ s, e });
      const ch = await pick(ctx.g, ctx.me, all.map(x => x.e), { min: 0, max: 2, title: '選擇最多2張備戰寶可夢身上的基本能量丟棄（每張+90）', purpose: 'ragingBolt' });
      for (const e of ch) ctx.g.discardEnergy(all.find(x => x.e === e).s, e);
      ctx.base += ch.length * 90;
    },
    est: (b, e) => b + Math.min(2, e.me.bench.reduce((n, s) => n + s.energy.length, 0)) * 90,
  },
  '將自己的牌庫上方5張卡翻到正面，造成其中的「未來」卡的張數×70點傷害。將翻到正面的「未來」卡丟棄，將剩餘卡放回牌庫並重洗。': {
    before: ctx => {
      const top = ctx.me.deck.splice(0, 5);
      const fut = top.filter(i => futureCard(card(ctx.g, i)));
      ctx.g.log(`翻開：${top.map(i => card(ctx.g, i).name).join('、')}`);
      ctx.me.discard.push(...fut);
      ctx.me.deck.push(...top.filter(i => !fut.includes(i))); ctx.g.shuffle(ctx.me.deck);
      ctx.base = fut.length * 70;
    },
    est: () => 70,
  },
  '選擇1個這隻寶可夢身上附加的能量，改附於備戰寶可夢身上。': {
    after: async ctx => {
      if (!ctx.attacker.energy.length || !ctx.me.bench.length) return;
      const [e] = await pick(ctx.g, ctx.me, [...ctx.attacker.energy], { min: 1, max: 1, title: '選擇要移動的能量', purpose: 'moveEnergy' });
      ctx.attacker.energy = ctx.attacker.energy.filter(x => x !== e);
      await attachEach(ctx.g, ctx.me, [e], benchOf(ctx.me), '選擇要附上能量的備戰寶可夢');
    },
  },
  '將對手的戰鬥寶可夢【混亂】。選擇任意數量的對手的場上寶可夢身上放置的傷害指示物，以任意方式改放於對手的場上寶可夢身上。': {
    after: async ctx => {
      if (ctx.opp.active) ctx.g.setCondition(ctx.opp.active, 'confused');
      for (let i = 0; i < 3; i++) {
        const from = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.opp).filter(s => s.damage > 0), { title: '選擇要移走傷害指示物的對手寶可夢（可不選）', purpose: 'moveEnergyFrom', optional: true, target: ctx.opp.index });
        if (!from) return;
        const to = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.opp).filter(s => s !== from), { title: '選擇要放上傷害指示物的對手寶可夢', purpose: 'counterTarget', target: ctx.opp.index });
        if (!to) return;
        const n = from.damage / 10;
        from.damage = 0;
        ctx.g.placeCounters(to, n);
      }
    },
  },
  '在不看正面的情況下，從對手的手牌選擇1張，將其丟棄。': {
    after: ctx => {
      if (!ctx.opp.hand.length) return;
      const i = ctx.opp.hand[Math.floor(ctx.g.rng() * ctx.opp.hand.length)];
      ctx.g.removeFromHand(ctx.opp, i); ctx.opp.discard.push(i);
      ctx.g.log(`丟棄了對手手牌中的${card(ctx.g, i).name}`);
    },
  },
  '從對手的所有進化的寶可夢身上，各移除1張「進化卡」使其退化。將移除的卡放回對手的牌庫並重洗。': {
    after: ctx => {
      for (const s of ctx.g.slots(ctx.opp)) {
        if (s.cards.length < 2 || ctx.g.effectBlocked(s)) continue;
        const top = s.cards.pop();
        ctx.opp.deck.push(top);
        ctx.g.log(`${card(ctx.g, top).name}退化了`);
      }
      ctx.g.shuffle(ctx.opp.deck);
    },
  },
  '擲1次硬幣若為正面，則選擇1隻對手的備戰寶可夢，將那隻寶可夢與附加的卡全部放回對手的牌庫並重洗。': {
    after: async ctx => {
      if (!ctx.opp.bench.length || !ctx.g.coin(ctx.me)) return;
      const s = await pickSlot(ctx.g, ctx.me, benchOf(ctx.opp), { title: '選擇要放回牌庫的對手備戰寶可夢', purpose: 'gust', target: ctx.opp.index });
      if (s && !ctx.g.effectBlocked(s)) { ctx.g.returnSlotToDeck(ctx.opp, s); ctx.g.log(`${ctx.g.top(s).name}回到了對手的牌庫`); }
    },
  },
  '選擇2隻對手的備戰寶可夢，將那些寶可夢與附加的卡全部放回牌庫並重洗。在上個自己的回合，若自己的寶可夢使出了「天仙石」，則無法使用這個招式。': {
    canUse: (g, p) => !(p.lastAttackNames?.name === '天仙石' && p.lastAttackNames.turn === g.turn - 2),
    after: async ctx => {
      const ch = await ctx.g.ask(ctx.me, { kind: 'slots', title: '選擇2隻對手的備戰寶可夢放回牌庫', slots: benchOf(ctx.opp), min: Math.min(2, ctx.opp.bench.length), max: 2, purpose: 'benchDamage', target: ctx.opp.index });
      for (const s of ch || []) if (!ctx.g.effectBlocked(s)) { ctx.g.returnSlotToDeck(ctx.opp, s); ctx.g.log(`${ctx.g.top(s).name}回到了對手的牌庫`); }
    },
  },
  '對手的1隻寶可夢受到這隻寶可夢身上放置的傷害指示物的數量×20點傷害。[在備戰區不計算弱點・抵抗力。]': {
    before: ctx => { ctx.noMainDamage = true; },
    after: async ctx => {
      const s = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.opp), { title: '選擇要受到傷害的對手寶可夢', purpose: 'snipe', target: ctx.opp.index });
      if (s) ctx.g.dealAttackDamage(ctx.attacker, s, ctx.attacker.damage / 10 * 20);
    },
    est: (b, e) => e.slot.damage / 10 * 20,
  },
  '對手的2隻寶可夢各受到50點傷害。這個招式的傷害不計算弱點・抵抗力與受到傷害的寶可夢身上的附加效果。': {
    before: ctx => { ctx.noMainDamage = true; },
    after: async ctx => {
      const ch = await ctx.g.ask(ctx.me, { kind: 'slots', title: '選擇2隻對手的寶可夢', slots: ctx.g.slots(ctx.opp), min: Math.min(2, ctx.g.slots(ctx.opp).length), max: 2, purpose: 'benchDamage', target: ctx.opp.index });
      for (const s of ch || []) ctx.g.dealAttackDamage(ctx.attacker, s, 50, { noWeakness: true, noResistance: true, ignoreEffects: true });
    },
    est: () => 50,
  },
  '對手的1隻寶可夢受到50點傷害。這個招式的傷害不計算弱點・抵抗力與受到傷害的寶可夢身上的附加效果。': {
    before: ctx => { ctx.noMainDamage = true; },
    after: async ctx => {
      const s = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.opp), { title: '選擇要受到50點傷害的對手寶可夢', purpose: 'snipe', target: ctx.opp.index });
      if (s) ctx.g.dealAttackDamage(ctx.attacker, s, 50, { noWeakness: true, noResistance: true, ignoreEffects: true });
    },
    est: () => 50,
  },
  '將對手的牌庫上方1張卡丟棄。在這個回合，若從手牌使出了「古代」支援者卡，則再丟棄3張。': {
    after: ctx => {
      const n = ctx.me.ancientSupporterTurn === ctx.g.turn ? 4 : 1;
      const t = ctx.opp.deck.splice(0, n); ctx.opp.discard.push(...t);
      if (t.length) ctx.g.log(`丟棄了對手牌庫上方${t.length}張卡`);
    },
  },
  '將這隻寶可夢身上附加的能量卡全部丟棄，獲得1張自己的獎賞卡。': {
    after: async ctx => {
      for (const e of [...ctx.attacker.energy]) ctx.g.discardEnergy(ctx.attacker, e);
      await ctx.g.takePrizes(ctx.me, 1);
    },
  },
  '從自己的手牌將任意數量的「寶可夢道具」卡丟棄，造成其張數×50點傷害。': handDiscardDamage(c => c.trainer === 'Tool', 50, '寶可夢道具'),
  '從自己的手牌將任意數量的基本能量卡丟棄，造成其張數×50點傷害。': handDiscardDamage(c => isBasicEnergy(c), 50, '基本能量'),
  '選擇2個這隻寶可夢身上附加的【惡】能量，改附於1隻備戰寶可夢身上。': {
    after: async ctx => {
      const ds = ctx.attacker.energy.filter(e => getProvides(ctx.g, e, ctx.attacker).includes('D')).slice(0, 2);
      if (!ds.length || !ctx.me.bench.length) return;
      const s = await pickSlot(ctx.g, ctx.me, benchOf(ctx.me), { title: '選擇要附上惡能量的備戰寶可夢', purpose: 'attachTarget' });
      ctx.attacker.energy = ctx.attacker.energy.filter(e => !ds.includes(e));
      s.energy.push(...ds);
    },
  },
  '將對手的戰鬥寶可夢【昏厥】。然後，這隻寶可夢受到200點傷害。': {
    after: ctx => {
      const d = ctx.opp.active;
      if (d && !ctx.g.effectBlocked(d)) d.damage = Math.max(d.damage, ctx.g.maxHp(d));
      ctx.attacker.damage += 200;
    },
    est: () => 999,
  },
  '若希望，將場上的競技場卡丟棄。這個情況下，增加120點傷害。': {
    before: async ctx => {
      const g = ctx.g;
      if (!g.stadium) return;
      const yes = await g.ask(ctx.me, { kind: 'yesno', title: `要丟棄競技場「${card(g, g.stadium.inst).name}」並增加120點傷害嗎？`, purpose: 'discardStadiumBonus' });
      if (!yes) return;
      g.players[g.stadium.owner].discard.push(g.stadium.inst); g.stadium = null;
      ctx.base += 120;
    },
    est: (b, e) => b + (e.g.stadium ? 120 : 0),
  },
  '從自己的牌庫選擇最多2張「基本【惡】能量」卡，附於這隻寶可夢身上。並且重洗牌庫。附上卡的情況下，將這隻寶可夢【中毒】。': {
    after: async ctx => {
      const ch = await searchDeck(ctx.g, ctx.me, c => isBasicEnergy(c) && c.provides === 'D', { max: 2, title: '選擇最多2張基本惡能量', purpose: 'searchEnergy', dest: 'none' });
      ctx.attacker.energy.push(...ch);
      if (ch.length) ctx.g.setCondition(ctx.attacker, 'poison');
    },
  },
  '從自己的牌庫選擇最多2張基本能量卡，以任意方式附於自己的「未來」寶可夢身上。並且重洗牌庫。': {
    after: async ctx => {
      const targets = ctx.g.slots(ctx.me).filter(s => isFuture(ctx.g.top(s)));
      if (!targets.length) return;
      const ch = await searchDeck(ctx.g, ctx.me, isBasicEnergy, { max: 2, title: '選擇最多2張基本能量', purpose: 'searchEnergy', dest: 'none' });
      await attachEach(ctx.g, ctx.me, ch, targets, '選擇要附上能量的未來寶可夢');
    },
  },
  '對手的身上放置有傷害指示物的3隻寶可夢各受到50點傷害。[在備戰區不計算弱點・抵抗力。]': {
    before: ctx => { ctx.noMainDamage = true; },
    after: async ctx => {
      const cands = ctx.g.slots(ctx.opp).filter(s => s.damage > 0);
      const ch = cands.length <= 3 ? cands : await ctx.g.ask(ctx.me, { kind: 'slots', title: '選擇3隻身上有傷害指示物的對手寶可夢', slots: cands, min: 3, max: 3, purpose: 'benchDamage', target: ctx.opp.index });
      for (const s of ch || []) ctx.g.dealAttackDamage(ctx.attacker, s, 50);
    },
    est: (b, e) => (e.def?.damage ? 50 : 0),
  },
  '若這隻寶可夢身上附有「驅勁能量 未來」，則這個招式只需要3個【無】能量即可使用。': {
    costOverride: (g, s) => (g.hasToolNamed(s, '驅勁能量 未來') ? ['C', 'C', 'C'] : null),
  },
  '在下個對手的回合，這隻寶可夢不會受到【基礎】寶可夢（【無】寶可夢除外）招式的傷害。': {
    after: ctx => ctx.g.addEffect(ctx.attacker, { kind: 'preventFromBasicNonC', turn: ctx.g.turn + 1 }),
  },

  // ---- 超電突圍 ----
  '擲與雙方的戰鬥寶可夢身上附加的能量的數量相同次數的硬幣，造成正面出現的次數×60點傷害。': {
    before: ctx => {
      const n = ctx.g.countEnergy(ctx.attacker) + (ctx.defender ? ctx.g.countEnergy(ctx.defender) : 0);
      let h = 0; for (let i = 0; i < n; i++) if (ctx.g.coin(ctx.me)) h++;
      ctx.base = h * 60;
    },
    est: (b, e) => (e.g.countEnergy(e.slot) + (e.def ? e.g.countEnergy(e.def) : 0)) * 30,
  },
  '從自己的牌庫，選擇自己的所有備戰寶可夢進化而來的卡各1張，放置於各自身上完成進化。並且重洗牌庫。': {
    after: async ctx => {
      const g = ctx.g, p = ctx.me;
      for (const s of [...p.bench]) {
        const t = g.top(s);
        const cands = p.deck.filter(i => { const c = card(g, i); return c.cat === 'P' && c.from === t.name; });
        if (!cands.length) continue;
        const [inst] = await pick(g, p, cands, { max: 1, title: `選擇要讓${t.name}進化的卡`, purpose: 'searchEvolution' });
        if (!inst) continue;
        fromDeck(g, p, [inst]);
        p.hand.push(inst);
        await g.evolve(p, s, inst, false);
      }
      g.shuffle(p.deck);
    },
  },
  '若自己的牌庫的剩餘張數為3張以下，則對手的2隻備戰寶可夢也各受到120點傷害。[在備戰區不計算弱點・抵抗力。]': {
    after: async ctx => {
      if (ctx.me.deck.length > 3 || !ctx.opp.bench.length) return;
      const ch = await ctx.g.ask(ctx.me, { kind: 'slots', title: '選擇2隻對手的備戰寶可夢', slots: benchOf(ctx.opp), min: Math.min(2, ctx.opp.bench.length), max: 2, purpose: 'benchDamage', target: ctx.opp.index });
      for (const s of ch || []) ctx.g.dealAttackDamage(ctx.attacker, s, 120);
    },
  },
  '將這隻寶可夢身上附加的【火】能量卡全部丟棄，對手的1隻備戰寶可夢受到180點傷害。[在備戰區不計算弱點・抵抗力。]': {
    before: ctx => { ctx.noMainDamage = true; },
    after: async ctx => {
      for (const e of [...ctx.attacker.energy]) if (card(ctx.g, e).provides === 'R') ctx.g.discardEnergy(ctx.attacker, e);
      const s = await pickSlot(ctx.g, ctx.me, benchOf(ctx.opp), { title: '選擇要受到180點傷害的對手備戰寶可夢', purpose: 'snipe', target: ctx.opp.index });
      if (s) ctx.g.dealAttackDamage(ctx.attacker, s, 180);
    },
  },
  '將對手的所有寶可夢身上附加的特殊能量卡全部丟棄。': {
    after: ctx => { for (const s of ctx.g.slots(ctx.opp)) for (const e of [...s.energy]) if (card(ctx.g, e).energy === 'special') ctx.g.discardEnergy(s, e); },
  },
  '若希望，選擇2個對手的戰鬥場的【2階進化】寶可夢身上附加的能量，放回對手的手牌。': {
    after: async ctx => {
      const d = ctx.opp.active;
      if (!d || ctx.g.top(d).stage !== 2 || !d.energy.length) return;
      const ch = await pick(ctx.g, ctx.me, [...d.energy], { min: 0, max: 2, title: '選擇最多2個要放回對手手牌的能量', purpose: 'discardOppEnergy' });
      for (const e of ch) { d.energy = d.energy.filter(x => x !== e); ctx.opp.hand.push(e); }
    },
  },
  '在下個對手的回合，身上附加的能量為2個以下的所有寶可夢無法使用招式。（包含新上場的寶可夢。）': {
    after: ctx => { ctx.opp.effects.push({ kind: 'lowEnergyNoAttack', turn: ctx.g.turn + 1 }); ctx.g.log('下個對手的回合，能量2個以下的寶可夢無法使用招式'); },
  },
  '查看對手的手牌，將其中的「物品」卡與「寶可夢道具」卡全部丟棄。': {
    after: ctx => {
      const out = ctx.opp.hand.filter(i => ['Item', 'Tool'].includes(card(ctx.g, i).trainer));
      ctx.opp.hand = ctx.opp.hand.filter(i => !out.includes(i));
      ctx.opp.discard.push(...out);
      ctx.g.log(out.length ? `丟棄了對手手牌中的${out.map(i => card(ctx.g, i).name).join('、')}` : '對手手牌中沒有物品或寶可夢道具');
    },
  },
  '擲1次硬幣若為正面，則將對手的戰鬥寶可夢【麻痺】。再選擇1個那隻寶可夢身上附加的能量，將其丟棄。': {
    after: async ctx => {
      const d = ctx.opp.active;
      if (!d || !ctx.g.coin(ctx.me)) return;
      ctx.g.setCondition(d, 'paralyzed');
      if (!d.energy.length || ctx.g.effectBlocked(d)) return;
      const [e] = await pick(ctx.g, ctx.me, [...d.energy], { min: 1, max: 1, title: '選擇要丟棄的對手能量', purpose: 'discardOppEnergy' });
      if (e) ctx.g.discardEnergy(d, e);
    },
  },
  '將這隻寶可夢身上附加的所有能量卡，以任意方式改附於備戰寶可夢身上。': {
    after: async ctx => {
      const es = [...ctx.attacker.energy];
      if (!es.length || !ctx.me.bench.length) return;
      ctx.attacker.energy = [];
      await attachEach(ctx.g, ctx.me, es, benchOf(ctx.me), '選擇要改附能量的備戰寶可夢');
    },
  },
  '在下個對手的回合，自己的所有「未來」寶可夢不會受到「寶可夢【ex】」招式的傷害。若這隻寶可夢離開戰鬥場，則這個效果消除。': {
    after: ctx => ctx.me.effects.push({ kind: 'futureExShield', turn: ctx.g.turn + 1, source: ctx.attacker.id }),
  },
  '從自己的手牌選擇最多2張「基本【超】能量」卡，以任意方式附於自己的寶可夢身上。': {
    after: async ctx => {
      const cands = ctx.me.hand.filter(i => { const c = card(ctx.g, i); return isBasicEnergy(c) && c.provides === 'P'; });
      const ch = await pick(ctx.g, ctx.me, cands, { max: 2, title: '選擇最多2張基本超能量', purpose: 'searchEnergy' });
      for (const e of ch) ctx.g.removeFromHand(ctx.me, e);
      await attachEach(ctx.g, ctx.me, ch, ctx.g.slots(ctx.me), '選擇要附上超能量的寶可夢');
    },
  },
  '若自己的備戰區沒有「由克希」「亞克諾姆」，則這個招式失敗。': {
    before: ctx => ['由克希', '亞克諾姆'].every(n => ctx.me.bench.some(s => ctx.g.top(s).name === n)),
    canUse: (g, p) => ['由克希', '亞克諾姆'].every(n => p.bench.some(s => g.top(s).name === n)),
  },
  '在雙方的所有擁有特性的寶可夢身上，各放置6個傷害指示物。': {
    after: ctx => { for (const pl of ctx.g.players) for (const s of ctx.g.slots(pl)) if (ctx.g.top(s).abilities.length) ctx.g.placeCounters(s, 6); },
  },
  '查看對手的手牌。': {
    after: ctx => ctx.g.log(`對手的手牌：${ctx.opp.hand.map(i => card(ctx.g, i).name).join('、') || '（沒有手牌）'}`),
  },
  '在對手的所有備戰寶可夢身上放置傷害指示物直到各自的剩餘HP變為「100」為止。': {
    after: ctx => { for (const s of benchOf(ctx.opp)) { const n = Math.floor((ctx.g.hpLeft(s) - 100) / 10); if (n > 0) ctx.g.placeCounters(s, n); } },
    est: (b, e) => benchOf(e.g.opp(e.me)).reduce((n, s) => n + Math.max(0, e.g.hpLeft(s) - 100), 0) / 2,
  },
  '選擇1隻自己的備戰區的「古代」寶可夢，將所選的寶可夢身上放置的傷害指示物，全部改放於對手的戰鬥寶可夢身上。': {
    after: async ctx => {
      const cands = ctx.me.bench.filter(s => isAncient(ctx.g.top(s)) && s.damage > 0);
      const s = await pickSlot(ctx.g, ctx.me, cands, { title: '選擇古代寶可夢', purpose: 'healMost' });
      if (!s || !ctx.opp.active) return;
      const n = s.damage / 10;
      s.damage = 0;
      ctx.g.placeCounters(ctx.opp.active, n);
    },
  },
  '將雙方的戰鬥寶可夢【昏厥】。': {
    after: ctx => {
      for (const s of [ctx.me.active, ctx.opp.active]) if (s && !(s === ctx.opp.active && ctx.g.effectBlocked(s))) s.damage = Math.max(s.damage, ctx.g.maxHp(s));
    },
  },
  '在上個自己的回合，若這隻寶可夢以外的「古代」寶可夢使用了招式，則增加150點傷害。': {
    before: ctx => {
      const la = ctx.me.lastAttacker;
      if (la && la.turn === ctx.g.turn - 2 && la.slot !== ctx.attacker.id && isAncient(cardData(la.card))) ctx.base += 150;
    },
  },
  '從對手的棄牌區選擇最多3張能量卡，以任意方式附於對手的寶可夢身上。': {
    after: async ctx => {
      const ch = await pick(ctx.g, ctx.me, ctx.opp.discard.filter(i => card(ctx.g, i).cat === 'E'), { max: 3, title: '選擇最多3張對手的能量卡', purpose: 'discardEnergyToAttach' });
      ctx.opp.discard = ctx.opp.discard.filter(i => !ch.includes(i));
      for (const e of ch) {
        const s = await pickSlot(ctx.g, ctx.me, ctx.g.slots(ctx.opp), { title: `選擇要附上${card(ctx.g, e).name}的對手寶可夢`, purpose: 'counterTarget', target: ctx.opp.index });
        s.energy.push(e);
      }
    },
  },
  '將場上的競技場卡丟棄。若無法丟棄，則這個招式失敗。': {
    before: ctx => {
      const g = ctx.g;
      if (!g.stadium) return false;
      g.players[g.stadium.owner].discard.push(g.stadium.inst);
      g.log(`競技場「${card(g, g.stadium.inst).name}」被丟棄了`);
      g.stadium = null;
    },
    canUse: g => !!g.stadium,
  },
  '查看自己的牌庫上方10張卡，從其中選擇任意數量的寶可夢卡，放置於備戰區。將剩餘卡放回牌庫並重洗。': {
    after: async ctx => {
      const top = ctx.me.deck.slice(0, 10);
      const ch = await pick(ctx.g, ctx.me, top.filter(i => isBasicPokemon(card(ctx.g, i))), { max: 5 - ctx.me.bench.length, title: '選擇要放到備戰區的基礎寶可夢', purpose: 'benchSearch', extra: { looked: top } });
      fromDeck(ctx.g, ctx.me, ch);
      for (const i of ch) ctx.g.putOnBench(ctx.me, i);
      ctx.g.shuffle(ctx.me.deck);
    },
  },
  '擲3次硬幣。若出現1次正面，則增加20點傷害。若出現2次正面，則增加50點傷害。若全部為正面，則增加80點傷害。': {
    before: ctx => { let h = 0; for (let i = 0; i < 3; i++) if (ctx.g.coin(ctx.me)) h++; ctx.base += [0, 20, 50, 80][h]; },
    est: b => b + 35,
  },
  '從自己的牌庫選擇最多2張「一家鼠（包含『寶可夢【ex】』）」，放置於備戰區。並且重洗牌庫。': {
    after: ctx => searchDeck(ctx.g, ctx.me, c => /^一家鼠/.test(c.name), { max: Math.min(2, 5 - ctx.me.bench.length), title: '選擇最多2張一家鼠', purpose: 'benchSearch', dest: 'bench' }),
  },
  '從自己的牌庫選擇最多3張各不同屬性的基本能量卡，以任意方式附於自己的「太晶」寶可夢身上。並且重洗牌庫。': {
    after: async ctx => {
      const g = ctx.g, p = ctx.me;
      const targets = g.slots(p).filter(s => g.top(s).tera);
      if (!targets.length) return;
      const got = [];
      for (let i = 0; i < 3; i++) {
        const used = got.map(e => card(g, e).provides);
        const cands = p.deck.filter(x => { const c = card(g, x); return isBasicEnergy(c) && !used.includes(c.provides); });
        const [e] = await pick(g, p, cands, { max: 1, title: `選擇不同屬性的基本能量（${i + 1}/3）`, purpose: 'searchEnergy' });
        if (!e) break;
        fromDeck(g, p, [e]);
        got.push(e);
      }
      await attachEach(g, p, got, targets, '選擇要附上能量的太晶寶可夢');
      g.shuffle(p.deck);
    },
  },
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
  // ---- 虛無歸零 ----
  '在自己的回合時可使用1次。對手將對手自己的手牌全部翻回反面並重洗，放回牌庫下方。然後，對手從牌庫抽出4張卡。': {
    use: (g, p) => {
      const o = g.opp(p);
      const h = g.shuffle([...o.hand]); o.hand = []; o.deck.push(...h);
      g.log(`${o.name}將${h.length}張手牌放回牌庫下方`);
      drawN(g, o, 4);
    },
  },
  '若對手的手牌為4張，則這隻寶可夢使用招式所需的【無】能量全部消除。': { costReduce: (g, s) => (g.opp(g.ownerOf(s)).hand.length === 4 ? 99 : 0) },
  '在自己的回合時可使用1次。擲1次硬幣若為正面，則在不看正面的情況下，從對手的手牌選擇1張，將其丟棄。': {
    canUse: (g, p) => g.opp(p).hand.length > 0,
    use: (g, p) => {
      if (!g.coin(p)) return;
      const o = g.opp(p);
      const i = o.hand.splice(Math.floor(g.rng() * o.hand.length), 1)[0];
      o.discard.push(i); g.log(`丟棄了對手手牌中的${card(g, i).name}`);
    },
  },
  '這隻寶可夢在戰鬥場上受到對手的寶可夢招式的傷害時，選擇1個使用招式的寶可夢身上附加的能量，將其丟棄。': {
    onDamagedActive: (g, s, attacker) => {
      if (!attacker.energy.length || !g.ownerOf(attacker)) return;
      const e = attacker.energy.find(x => card(g, x).energy === 'special') || attacker.energy[0];
      g.discardEnergy(attacker, e);
      g.log(`「甲殼刺」丟棄了${g.top(attacker).name}身上的${card(g, e).name}`);
    },
  },
  '在自己的回合時，可不限次數使用。選擇1個自己的備戰寶可夢身上附加的【水】能量，改附於戰鬥寶可夢身上。': {
    oncePerTurn: false,
    canUse: (g, p) => !!p.active && p.bench.some(b => b.energy.some(e => getProvides(g, e, b).includes('W'))),
    use: async (g, p) => {
      const all = [];
      for (const b of p.bench) for (const e of b.energy) if (getProvides(g, e, b).includes('W')) all.push({ b, e });
      const [e] = await pick(g, p, all.map(x => x.e), { min: 1, max: 1, title: '選擇要改附到戰鬥寶可夢的水能量', purpose: 'moveEnergyAll' });
      const x = all.find(y => y.e === e);
      x.b.energy = x.b.energy.filter(z => z !== e); p.active.energy.push(e);
      g.log(`將${card(g, e).name}改附於${g.top(p.active).name}身上`);
    },
  },
  '只要這隻寶可夢在場上，自己的所有身上附有【水】能量卡的寶可夢，受到對手的寶可夢招式的傷害「-50」點。這個特性的效果不會重複。': {
    teamReduce: (g, target) => (target.energy.some(e => card(g, e).cat === 'E' && getProvides(g, e, target).includes('W')) ? 50 : 0),
  },
  '若對手的戰鬥寶可夢為「寶可夢【ex】」，則這隻寶可夢就算在自己的最初回合或者剛使出的回合，也可進化。': {
    evolveAnytime: (g, p) => { const oa = g.opp(p).active; return !!oa && !!g.top(oa).ex; },
  },
  '這隻寶可夢不會受到對手的寶可夢特性效果的影響。': { oppAbilityImmune: true },
  '在自己的回合時可使用1次。從自己的牌庫選擇最多2張「基本【超】能量」卡，在給對手看過後加入手牌。並且重洗牌庫。': {
    canUse: (g, p) => p.deck.length > 0,
    use: (g, p) => searchDeck(g, p, c => isBasicEnergy(c) && c.provides === 'P', { max: 2, title: '選擇最多2張基本超能量', purpose: 'searchEnergy' }),
  },
  '在自己的回合時可使用1次。從自己的手牌選擇1張「基本【鬥】能量」卡，附於自己的【鬥】寶可夢身上。': {
    canUse: (g, p) => p.hand.some(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'F'; }) && g.slots(p).some(s => g.typesOf(s).includes('F')),
    use: async (g, p) => {
      const e = p.hand.find(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'F'; });
      const s = await pickSlot(g, p, g.slots(p).filter(x => g.typesOf(x).includes('F')), { title: '選擇要附上鬥能量的寶可夢', purpose: 'attachTarget', extra: { energy: e.cid } });
      g.removeFromHand(p, e); s.energy.push(e);
      g.log(`將${card(g, e).name}附於${g.top(s).name}身上`);
    },
  },
  '若這隻寶可夢身上附有特殊能量卡，則這隻寶可夢的最大HP「+150」。': { hpBonus: (g, s) => (s.energy.some(e => card(g, e).energy === 'special') ? 150 : 0) },
  '這隻寶可夢受到對手的寶可夢招式的傷害而【昏厥】時，不丟棄這隻寶可夢，而是放回手牌。（寶可夢以外的卡全部丟棄。）': { koToHand: true },
  '在自己的回合，從手牌將這張卡放置於備戰區時，可使用1次。從自己的牌庫選擇1張支援者卡，在給對手看過後加入手牌。並且重洗牌庫。在這個回合，若已經使出了名稱中有「殺手鐧」的特性，則這個特性無法使用。': {
    canBench: (g, p) => !p.abilityUsed.killer && p.deck.length > 0,
    onBench: async (g, p) => {
      p.abilityUsed.killer = true;
      await searchDeck(g, p, c => c.trainer === 'Supporter', { max: 1, title: '選擇1張支援者卡', purpose: 'searchSupporter' });
    },
  },
  '只要這隻寶可夢在戰鬥場上，對手的戰鬥寶可夢使用的招式的傷害「-30」點。': { reduceDamage: (g, s) => (g.isActive(s) ? 30 : 0) },
  '對手從手牌使出支援者卡時，這隻寶可夢不會受到那個效果的影響。': { supporterImmune: true },
  // ---- 太晶慶典 ----
  '在自己的回合，從手牌使出這張卡並完成進化時，可使用1次。將自己的戰鬥場的【草】寶可夢的HP全部恢復。然後，將恢復的寶可夢身上附加的能量全部丟棄。': {
    onEvolve: (g, p) => {
      const a = p.active;
      if (!a || !g.typesOf(a).includes('G') || !a.damage) return;
      g.heal(a, a.damage);
      for (const e of [...a.energy]) g.discardEnergy(a, e);
    },
  },
  '若自己的戰鬥寶可夢為擁有特性「祭典樂舞」的寶可夢，則在自己的回合時可使用1次。從自己的牌庫任意選擇1張卡加入手牌。並且重洗牌庫。': {
    canUse: (g, p) => p.active && p.active.cards.length && g.top(p.active).abilities.some(a => a.name === '祭典樂舞') && p.deck.length > 0,
    use: (g, p) => searchDeck(g, p, () => true, { max: 1, title: '從牌庫選擇任意1張卡', purpose: 'searchAny' }),
  },
  '若場上有「祭典會場」，則這隻寶可夢可使用持有的招式2次。（若對手的戰鬥寶可夢因第1次的招式而【昏厥】了，則在下一隻寶可夢放置後，使用第2次的招式。）': {
    doubleAttack: g => !!g.stadium && card(g, g.stadium.inst).name === '祭典會場',
  },
  '在自己的回合時可使用1次。從自己的手牌選擇1張「基本【草】能量」卡，附於自己的寶可夢身上。然後，將附上那張卡的寶可夢恢復「30」HP。': {
    canUse: (g, p) => p.hand.some(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'G'; }),
    use: async (g, p) => {
      const e = p.hand.find(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'G'; });
      const s = await pickSlot(g, p, g.slots(p), { title: '選擇要附上草能量的寶可夢', purpose: 'attachTarget', extra: { energy: e.cid } });
      g.removeFromHand(p, e); s.energy.push(e); g.heal(s, 30);
    },
  },
  '這隻寶可夢的最大HP，依對手已經獲得的獎賞卡每1張「+50」。': { hpBonus: (g, s) => (6 - g.opp(g.ownerOf(s)).prizes.length) * 50 },
  '只要這隻寶可夢在場上，自己的所有備戰寶可夢不會受到對手的寶可夢招式的傷害與效果的影響。': { benchShield: true },
  '在自己的回合，從手牌將這張卡放置於備戰區時，可使用1次。將這隻寶可夢與戰鬥寶可夢互換。互換的情況下，選擇自己的場上寶可夢身上附加的任意數量的能量卡，改附於這隻寶可夢身上。': {
    onBench: async (g, p, s) => {
      g.switchActive(p, s);
      const all = [];
      for (const x of g.slots(p)) if (x !== s) for (const e of x.energy) all.push({ x, e });
      const ch = await pick(g, p, all.map(a => a.e), { max: all.length, title: '選擇要改附到這隻寶可夢身上的能量', purpose: 'moveEnergyAll' });
      for (const e of ch) { const a = all.find(y => y.e === e); a.x.energy = a.x.energy.filter(z => z !== e); s.energy.push(e); }
    },
  },
  '只要這隻寶可夢在備戰區，不會受到對手的寶可夢招式的傷害與效果的影響。': { benchSelfShield: true },
  '在自己的回合時可使用1次。從自己的手牌選擇1張「基本【草】能量」卡，附於這隻寶可夢身上。然後，從自己的牌庫抽出1張卡。': {
    canUse: (g, p) => p.hand.some(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'G'; }),
    use: (g, p, s) => {
      const e = p.hand.find(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'G'; });
      g.removeFromHand(p, e); s.energy.push(e); drawN(g, p, 1);
    },
  },
  '在自己的回合，從備戰區將這隻寶可夢放置於戰鬥場時，可使用1次。選擇自己的場上寶可夢身上附加的任意數量的【火】能量卡，改附於這隻寶可夢身上。': {
    onPromote: async (g, p, s) => {
      const all = [];
      for (const x of g.slots(p)) if (x !== s) for (const e of x.energy) if (card(g, e).provides === 'R') all.push({ x, e });
      const ch = await pick(g, p, all.map(a => a.e), { max: all.length, title: '選擇要改附的火能量', purpose: 'moveEnergyAll' });
      for (const e of ch) { const a = all.find(y => y.e === e); a.x.energy = a.x.energy.filter(z => z !== e); s.energy.push(e); }
    },
  },
  '在自己的回合時可使用1次。在這隻寶可夢身上放置5個傷害指示物。這個情況下，在這個回合，這隻寶可夢使用的招式，對對手的戰鬥寶可夢造成的傷害「+120」點。': {
    canUse: (g, p, s) => g.hpLeft(s) > 50,
    use: (g, p, s) => { s.damage += 50; g.addEffect(s, { kind: 'attackPlus', amount: 120, turn: g.turn }); g.log(`${g.top(s).name}的招式傷害+120`); },
  },
  '只要這隻寶可夢在場上，對手的場上寶可夢與那隻寶可夢身上附加的所有卡，無法放回手牌。': { noBounce: true },
  '只要這隻寶可夢在場上，每次寶可夢檢查時，在雙方的擁有特性的所有寶可夢（「雪妖女」除外）身上各放置1個傷害指示物。': { chillCurtain: true },
  '在自己的回合，從手牌使出這張卡並完成進化時，可使用1次。從自己的牌庫選擇最多3張「寶可夢道具」卡，在給對手看過後加入手牌。並且重洗牌庫。': {
    onEvolve: (g, p) => searchDeck(g, p, c => c.trainer === 'Tool', { max: 3, title: '選擇最多3張寶可夢道具', purpose: 'searchTool' }),
  },
  '若這隻寶可夢在備戰區，則在自己的回合時可使用1次。將對手的戰鬥寶可夢與備戰寶可夢互換（由對手選擇放置於戰鬥場的寶可夢）。然後，將這隻寶可夢與附加的卡全部丟棄。': {
    canUse: (g, p, s) => p.active !== s && g.opp(p).bench.length > 0,
    use: async (g, p, s) => {
      const o = g.opp(p);
      const n = await pickSlot(g, o, benchOf(o), { title: '選擇要換上場的寶可夢', purpose: 'switchIn' });
      g.switchActive(o, n);
      g.discardSlot(p, s);
      g.log(`${g.top(s).name}被丟棄了`);
    },
  },
  '這隻寶可夢使用招式的傷害，不計算對手的戰鬥寶可夢身上的附加效果。': { ignoreDefenderEffects: true },
  '只要這隻寶可夢在戰鬥場上，雙方場上「擁有規則的寶可夢」（「未來」寶可夢除外）的特性全部消除。': { nullifyRuleBox: true },
  '若這隻寶可夢在戰鬥場上，則在自己的回合時可使用1次。將這隻寶可夢與附加的卡，全部放回自己的牌庫並重洗。': {
    canUse: (g, p, s) => p.active === s && p.bench.length > 0,
    use: async (g, p, s) => {
      g.returnSlotToDeck(p, s);
      g.log(`${g.top(s).name}回到了牌庫`);
      const n = await pickSlot(g, p, benchOf(p), { title: '選擇新的戰鬥寶可夢', purpose: 'promote' });
      g.switchActive(p, n);
    },
  },
  '在自己的回合時可使用1次。從自己的手牌選擇1張「基本【超】能量」卡，附於備戰寶可夢身上。然後，從自己的牌庫抽出2張卡。': {
    canUse: (g, p) => p.bench.length > 0 && p.hand.some(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'P'; }),
    use: async (g, p) => {
      const e = p.hand.find(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'P'; });
      g.removeFromHand(p, e);
      await attachEach(g, p, [e], benchOf(p), '選擇要附上超能量的備戰寶可夢');
      drawN(g, p, 2);
    },
  },
  '只要這隻寶可夢在戰鬥場上，對手的戰鬥寶可夢的特性（「暗夜羽擊」除外）全部消除。': { nullifyOppActive: true },
  '在自己的回合，從備戰區將這隻寶可夢放置於戰鬥場時，可使用1次。在對手的1隻寶可夢身上放置2個傷害指示物。': {
    onPromote: async (g, p) => {
      const o = g.opp(p);
      const t = await pickSlot(g, p, g.slots(o), { title: '選擇要放置2個傷害指示物的對手寶可夢', purpose: 'counterTarget', target: o.index, extra: { counters: 2 } });
      if (t) g.placeCounters(t, 2);
    },
  },
  '若這隻寶可夢身上附有【惡】能量卡，則這隻寶可夢受到招式的傷害時，自己擲1次硬幣。若為正面，則這隻寶可夢不會受到那個傷害。': {
    evade: (g, s) => s.energy.some(e => card(g, e).provides === 'D'),
  },
  '只要這隻寶可夢在場上，自己的「未來」寶可夢（「鐵頭殼【ex】」除外）使用的招式，對對手的戰鬥寶可夢造成的傷害「+20」點。': {
    attackBonus: (g, self, attacker) => (isFuture(g.top(attacker)) && g.top(attacker).name !== '鐵頭殼ex' ? 20 : 0),
  },
  '在自己的回合，從手牌將這張卡放置於備戰區時，可使用1次。從自己的牌庫選擇最多3張「基本【鬥】能量」卡，將其丟棄。並且重洗牌庫。': {
    onBench: async (g, p) => {
      const ch = await searchDeck(g, p, c => isBasicEnergy(c) && c.provides === 'F', { max: 3, title: '選擇最多3張基本鬥能量丟棄', purpose: 'searchEnergy', dest: 'none' });
      p.discard.push(...ch);
    },
  },
  '在自己的回合，從手牌將這張卡放置於備戰區時，可使用1次。在對手的2隻備戰寶可夢身上，各放置1個傷害指示物。': {
    canBench: (g, p) => g.opp(p).bench.length > 0,
    onBench: async (g, p) => {
      const o = g.opp(p);
      const ch = await g.ask(p, { kind: 'slots', title: '選擇2隻對手的備戰寶可夢', slots: benchOf(o), min: Math.min(2, o.bench.length), max: 2, purpose: 'benchDamage', target: o.index });
      for (const s of ch || []) g.placeCounters(s, 1);
    },
  },
  '在自己的回合，從手牌將這張卡放置於備戰區時，可使用1次。從自己的手牌選擇最多2張「基本【鬥】能量」卡，附於這隻寶可夢身上。': {
    canBench: (g, p) => p.hand.some(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'F'; }),
    onBench: async (g, p, s) => {
      const ch = await pick(g, p, p.hand.filter(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'F'; }), { max: 2, title: '選擇最多2張基本鬥能量', purpose: 'searchEnergy' });
      for (const e of ch) { g.removeFromHand(p, e); s.energy.push(e); }
    },
  },
  '若對手剩餘獎賞卡的張數為4張以下，則在自己的回合時可使用1次。從自己的棄牌區選擇1張「基本【鬥】能量」卡，附於這隻寶可夢身上。': {
    canUse: (g, p) => g.opp(p).prizes.length <= 4 && p.discard.some(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'F'; }),
    use: (g, p, s) => {
      const e = p.discard.find(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'F'; });
      p.discard.splice(p.discard.indexOf(e), 1); s.energy.push(e);
    },
  },
  '若這隻寶可夢身上附有【惡】能量卡，則這隻寶可夢的最大HP「+100」，這隻寶可夢使用的招式，對對手的戰鬥寶可夢造成的傷害「+100」點。': {
    hpBonus: (g, s) => (s.energy.some(e => card(g, e).provides === 'D') ? 100 : 0),
    attackBonus: (g, self, attacker) => (self === attacker && self.energy.some(e => card(g, e).provides === 'D') ? 100 : 0),
  },
  '這隻寶可夢不會受到對手的擁有特性的寶可夢招式的傷害。': { abilityAttackerImmune: true },
  '若這隻寶可夢身上沒有附加能量卡，則這隻寶可夢【撤退】所需的能量全部消除。': {
    retreatCost: (g, self, slot, cost) => (slot === self && !self.energy.length ? 0 : cost),
  },
  '若這隻寶可夢身上附有「驅勁能量 古代」，則在自己的回合時可使用1次。將雙方的戰鬥寶可夢【中毒】。': {
    canUse: (g, p, s) => g.hasToolNamed(s, '驅勁能量 古代'),
    use: (g, p) => { for (const pl of g.players) if (pl.active) g.setCondition(pl.active, 'poison'); },
  },
  '這隻寶可夢受到對手的寶可夢招式的傷害而【昏厥】時，若自己的場上有「桃歹郎【ex】」，則被獲得的獎賞卡減少1張。': {
    prizeReduce: (g, p) => g.slots(p).some(s => g.top(s).name === '桃歹郎ex'),
  },
  '在自己的回合時可使用1次。選擇1隻自己的備戰區的【惡】寶可夢（「桃歹郎【ex】」除外），與戰鬥寶可夢互換。然後，將新的戰鬥寶可夢【中毒】。在這個回合，若已經使出了其他的「支配鎖鏈」，則這個特性無法使用。': {
    globalKey: '支配鎖鏈',
    canUse: (g, p) => p.bench.some(s => g.typesOf(s).includes('D') && g.top(s).name !== '桃歹郎ex'),
    use: async (g, p) => {
      const s = await pickSlot(g, p, p.bench.filter(x => g.typesOf(x).includes('D') && g.top(x).name !== '桃歹郎ex'), { title: '選擇要換上場的惡寶可夢', purpose: 'switchIn' });
      g.switchActive(p, s);
      g.setCondition(s, 'poison');
    },
  },
  '在自己的回合時可使用1次。查看自己的牌庫上方4張卡，從其中選擇任意數量的「基本【鋼】能量」卡，以任意方式附於自己的寶可夢身上。將剩餘卡全部翻回反面並重洗，放回牌庫下方。': {
    canUse: (g, p) => p.deck.length > 0,
    use: async (g, p) => {
      const top = p.deck.splice(0, 4);
      const ch = await pick(g, p, top.filter(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'M'; }), { max: 4, title: '選擇要附上的基本鋼能量', purpose: 'searchEnergy', extra: { looked: top } });
      await attachEach(g, p, ch, g.slots(p), '選擇要附上鋼能量的寶可夢');
      p.deck.push(...g.shuffle(top.filter(i => !ch.includes(i))));
    },
  },
  '只要這隻寶可夢在場上，自己的所有備戰寶可夢，不會因對手的【基礎】寶可夢使用招式的效果而被放置傷害指示物。': { benchCounterShield: true },
  '這隻寶可夢不會受到對手的「寶可夢【ex】・【V】」招式的傷害。': { exVImmune: true },
  '只要這隻寶可夢在場上，自己的所有身上附有【鋼】能量的寶可夢【撤退】所需的能量全部消除。': {
    retreatCost: (g, self, slot, cost) => (g.energyUnits(slot).includes('M') ? 0 : cost),
  },
  '只要這隻寶可夢身上附有「驅勁能量 未來」，這隻寶可夢改為【鬥】與【鋼】2種屬性。': {
    types: ['F', 'M'],
    typesIf: (g, s) => g.hasToolNamed(s, '驅勁能量 未來'),
  },
  '在自己的回合時可使用1次。從自己的牌庫抽出1張卡。若這隻寶可夢在戰鬥場上，則再抽出1張卡。': {
    canUse: (g, p) => p.deck.length > 0,
    use: (g, p, s) => drawN(g, p, p.active === s ? 2 : 1),
  },
  '若這隻寶可夢在戰鬥場上，則在自己的回合時可使用1次。查看自己的牌庫上方6張卡，從其中選擇1張支援者卡，在給對手看過後加入手牌。將剩餘卡放回牌庫並重洗。': {
    canUse: (g, p, s) => p.active === s && p.deck.length > 0,
    use: async (g, p) => {
      const top = p.deck.slice(0, 6);
      const ch = await pick(g, p, top.filter(i => card(g, i).trainer === 'Supporter'), { max: 1, title: '選擇1張支援者卡', purpose: 'searchSupporter', extra: { looked: top } });
      fromDeck(g, p, ch); p.hand.push(...ch); g.shuffle(p.deck);
    },
  },
  '只要這隻寶可夢在戰鬥場上，就算在自己的最初回合或者剛使出的回合，也可進化。': { evolveAnytime: true },
  '這隻寶可夢可從手牌使出從「伊布」進化而來的「寶可夢【ex】」，放置於這隻寶可夢身上完成進化。（在自己的最初回合或者剛使出的回合無法進化。）': { evolveIntoEeveeEx: true },
  '這隻寶可夢不會【睡眠】。': { immune: ['asleep'] },
  '在自己的回合，從手牌使出這張卡並完成進化時，若自己的場上有「太晶」寶可夢，則可使用1次。從自己的牌庫選擇最多2張訓練家卡，在給對手看過後加入手牌。並且重洗牌庫。': {
    onEvolve: async (g, p) => {
      if (!g.slots(p).some(s => g.top(s).tera)) { g.log('場上沒有太晶寶可夢，特性沒有效果'); return; }
      await searchDeck(g, p, c => c.cat === 'T', { max: 2, title: '選擇最多2張訓練家卡', purpose: 'searchSupporter' });
    },
  },
  '只有在自己的最初回合可使用1次。從自己的牌庫選擇最多3張HP為「100」以下的【無】寶可夢卡，在給對手看過後加入手牌。並且重洗牌庫。在這個回合，若已經使出了其他的「風扇呼喚」，則這個特性無法使用。': {
    globalKey: '風扇呼喚',
    canUse: g => g.turn <= 2 && g.me.deck.length > 0,
    use: (g, p) => searchDeck(g, p, c => c.cat === 'P' && c.type === 'C' && c.hp <= 100, { max: 3, title: '選擇最多3張HP100以下的無寶可夢', purpose: 'searchPokemon' }),
  },
  '只要這隻寶可夢與自己的其他「爆炸頭水牛」在場上，自己的所有【無】屬性的【基礎】寶可夢受到對手的寶可夢招式的傷害「-60」點。無論有多少隻擁有這個特性的寶可夢，這個效果也不會重複。': {
    teamReduce: (g, target, owner) => (g.slots(owner).filter(s => g.top(s).name === '爆炸頭水牛').length >= 2 && g.top(target).stage === 0 && g.typesOf(target).includes('C') ? 60 : 0),
  },
  '這隻寶可夢使用「血月」所需的【無】能量，減少對手已經獲得的獎賞卡的張數數量。': {
    costReduce: (g, s, atk) => (atk.name === '血月' ? 6 - g.opp(g.ownerOf(s)).prizes.length : 0),
  },

  // ---- 超電突圍 ----
  '在自己的回合，從手牌將這張卡放置於備戰區時，可使用1次。將對手的牌庫上方1張卡丟棄。': {
    canBench: (g, p) => g.opp(p).deck.length > 0,
    onBench: (g, p) => { const o = g.opp(p); const c = o.deck.shift(); if (c) { o.discard.push(c); g.log(`丟棄了對手牌庫上方的${card(g, c).name}`); } },
  },
  '只要這隻寶可夢在場上，自己的【火】屬性的進化寶可夢使用的招式，對對手的戰鬥寶可夢造成的傷害「+10」點。': {
    attackBonus: (g, self, attacker) => (g.typesOf(attacker).includes('R') && g.top(attacker).stage > 0 ? 10 : 0),
  },
  '這隻寶可夢不會受到對手的寶可夢使用招式的效果的影響。': { noEffects: true },
  '只要這隻寶可夢在場上，改為【草】與【火】2種屬性。': { types: ['G', 'R'] },
  '這隻寶可夢不會受到對手的「太晶」寶可夢招式的傷害與效果的影響。': { teraImmune: true },
  '在自己的回合，從手牌將這張卡放置於備戰區時，可使用1次。將場上的競技場卡丟棄。': {
    canBench: g => !!g.stadium,
    onBench: g => { g.players[g.stadium.owner].discard.push(g.stadium.inst); g.log(`競技場「${card(g, g.stadium.inst).name}」被丟棄了`); g.stadium = null; },
  },
  '這隻寶可夢的HP是全滿的狀態下，這隻寶可夢受到招式的傷害而【昏厥】時，這隻寶可夢不會【昏厥】，而是以剩餘HP為「10」的狀態留在場上。': { sturdy: true },
  '只要這隻寶可夢在場上，每次當對手的戰鬥寶可夢【昏厥】時，自己擲1次硬幣。若為正面，則多獲得1張獎賞卡。無論有多少隻擁有這個特性的寶可夢，這個效果也不會重複。': { miracleKiss: true },
  '在自己的回合，若從自己的手牌將1張「悠哉尾草棒」丟棄，則可使用1次。選擇1隻對手的備戰寶可夢，與戰鬥寶可夢互換。': {
    canUse: (g, p) => g.opp(p).bench.length > 0 && p.hand.some(i => card(g, i).name === '悠哉尾草棒'),
    use: async (g, p) => {
      const i = p.hand.find(x => card(g, x).name === '悠哉尾草棒');
      g.removeFromHand(p, i); p.discard.push(i);
      await g.gust(p);
    },
  },
  '在自己的回合，從手牌將這張卡放置於備戰區時，可使用1次。將自己的戰鬥寶可夢恢復「30」HP，特殊狀態也恢復1個。': {
    canBench: (g, p) => p.active && (p.active.damage > 0 || Object.keys(p.active.cond).length > 0),
    onBench: (g, p) => {
      g.heal(p.active, 30);
      const k = Object.keys(p.active.cond)[0];
      if (k) { delete p.active.cond[k]; g.log(`${g.top(p.active).name}的特殊狀態恢復了`); }
    },
  },
  '只要這隻寶可夢在備戰區，雙方的備戰區的【2階進化】寶可夢的特性全部消除。': { benchStage2Lock: true },
  '只要這隻寶可夢在戰鬥場上，對手的【中毒】的寶可夢，因【中毒】而放置的傷害指示物的數量增加5個。': { poisonBoost: 5 },
  '若對手的場上沒有「寶可夢【ex】・【V】」，則這隻寶可夢無法使用招式。': {
    attackCondition: (g, p) => g.slots(g.opp(p)).some(s => { const c = g.top(s); return c.ex || /V$|VMAX$|VSTAR$/.test(c.name); }),
  },
  '這隻寶可夢受到招式的傷害時，自己擲1次硬幣。若為正面，則這隻寶可夢不會受到那個傷害。': { evade: true },
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
  // ---- 虛無歸零 ----
  '查看對手的手牌，從其中選擇1張能量卡，放回對手的牌庫下方。': {
    canPlay: (g, p) => g.opp(p).hand.length > 0,
    play: async (g, p) => {
      const o = g.opp(p);
      g.log(`${p.name}查看了對手的手牌：${o.hand.map(i => card(g, i).name).join('、')}`);
      const [e] = await pick(g, p, o.hand.filter(i => card(g, i).cat === 'E'), { min: 1, max: 1, title: '選擇要放回對手牌庫下方的能量卡', purpose: 'discardOppEnergy', extra: { looked: [...o.hand] } });
      if (!e) return;
      g.removeFromHand(o, e); o.deck.push(e);
      g.log(`將對手的${card(g, e).name}放回牌庫下方`);
    },
  },
  '從自己的牌庫選擇1張寶可夢卡（「擁有規則的寶可夢」除外），在給對手看過後加入手牌。並且重洗牌庫。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: (g, p) => searchDeck(g, p, c => isPokemon(c) && !hasRule(c), { max: 1, title: '選擇1張寶可夢（擁有規則的除外）', purpose: 'searchPokemon' }),
  },
  '將自己的戰鬥寶可夢恢復「20」HP，特殊狀態也恢復1個。': {
    canPlay: (g, p) => !!p.active && (p.active.damage > 0 || Object.keys(p.active.cond).length > 0),
    play: async (g, p) => {
      g.heal(p.active, 20);
      const conds = Object.keys(p.active.cond);
      if (!conds.length) return;
      let k = conds[0];
      if (conds.length > 1) k = conds[await g.ask(p, { kind: 'option', title: '選擇要恢復的特殊狀態', options: conds.map(x => COND_NAMES_TW[x]), purpose: 'option' })] || conds[0];
      delete p.active.cond[k];
      g.log(`${g.top(p.active).name}的${COND_NAMES_TW[k]}恢復了`);
    },
  },
  '從自己的棄牌區選擇【鬥】寶可夢卡與「基本【鬥】能量」卡合計最多4張，在給對手看過後加入手牌。': {
    canPlay: (g, p) => p.discard.some(i => { const c = card(g, i); return (isPokemon(c) && c.type === 'F') || (isBasicEnergy(c) && c.provides === 'F'); }),
    play: async (g, p) => moveDiscardToHand(g, p, await pick(g, p, p.discard.filter(i => { const c = card(g, i); return (isPokemon(c) && c.type === 'F') || (isBasicEnergy(c) && c.provides === 'F'); }), { max: 4, title: '選擇最多4張鬥寶可夢或基本鬥能量', purpose: 'recoverAny' })),
  },
  '從牌庫抽卡直到自己的手牌滿5張為止。若希望，在從牌庫抽卡前，將自己的任意數量的手牌丟棄。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      const ch = await pick(g, p, [...p.hand], { min: 0, max: p.hand.length, title: '選擇要丟棄的手牌（可不選）', purpose: 'optionalDiscard' });
      for (const i of ch) { g.removeFromHand(p, i); p.discard.push(i); }
      if (ch.length) g.log(`${p.name}丟棄了${ch.length}張手牌`);
      drawN(g, p, Math.max(0, 5 - p.hand.length));
    },
  },
  '這張卡只有在自己剩餘獎賞卡的張數比對手剩餘獎賞卡的張數多時才可使用。 從自己的棄牌區選擇最多2張基本能量卡，附於自己的1隻【2階進化】寶可夢身上。': {
    canPlay: (g, p) => p.prizes.length > g.opp(p).prizes.length && g.slots(p).some(s => g.top(s).stage === 2) && p.discard.some(i => isBasicEnergy(card(g, i))),
    play: async (g, p) => {
      const s = await pickSlot(g, p, g.slots(p).filter(x => g.top(x).stage === 2), { title: '選擇1隻2階進化寶可夢', purpose: 'attachTarget' });
      const ch = await pick(g, p, p.discard.filter(i => isBasicEnergy(card(g, i))), { max: 2, title: '選擇最多2張基本能量', purpose: 'recoverEnergy' });
      for (const e of ch) { p.discard.splice(p.discard.indexOf(e), 1); s.energy.push(e); }
      if (ch.length) g.log(`將${ch.length}張能量附於${g.top(s).name}身上`);
    },
  },
  '將自己的1隻【超】寶可夢恢復「150」HP。': {
    canPlay: (g, p) => g.slots(p).some(s => s.damage > 0 && g.typesOf(s).includes('P')),
    play: async (g, p) => {
      const s = await pickSlot(g, p, g.slots(p).filter(x => x.damage > 0 && g.typesOf(x).includes('P')), { title: '選擇要恢復150HP的超寶可夢', purpose: 'heal' });
      if (s) g.heal(s, 150);
    },
  },
  '從自己的棄牌區選擇最多5張基本能量卡，在給對手看過後放回牌庫並重洗。': {
    canPlay: (g, p) => p.discard.some(i => isBasicEnergy(card(g, i))),
    play: async (g, p) => {
      const ch = await pick(g, p, p.discard.filter(i => isBasicEnergy(card(g, i))), { max: 5, title: '選擇最多5張基本能量放回牌庫', purpose: 'recoverEnergy' });
      for (const i of ch) p.discard.splice(p.discard.indexOf(i), 1);
      p.deck.push(...ch); g.shuffle(p.deck);
      if (ch.length) g.log(`${p.name}將${ch.length}張基本能量放回牌庫`);
    },
  },
  '從自己的棄牌區選擇最多5張寶可夢卡，在給對手看過後放回牌庫並重洗。': {
    canPlay: (g, p) => p.discard.some(i => isPokemon(card(g, i))),
    play: async (g, p) => {
      const ch = await pick(g, p, p.discard.filter(i => isPokemon(card(g, i))), { max: 5, title: '選擇最多5張寶可夢放回牌庫', purpose: 'recoverAny' });
      for (const i of ch) p.discard.splice(p.discard.indexOf(i), 1);
      p.deck.push(...ch); g.shuffle(p.deck);
      if (ch.length) g.log(`${p.name}將${ch.map(i => card(g, i).name).join('、')}放回牌庫`);
    },
  },
  '從自己的棄牌區選擇1張「基本【超】能量」卡，附於備戰區的【超】寶可夢身上。': {
    canPlay: (g, p) => p.discard.some(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'P'; }) && p.bench.some(s => g.typesOf(s).includes('P')),
    play: async (g, p) => {
      const e = p.discard.find(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'P'; });
      p.discard.splice(p.discard.indexOf(e), 1);
      await attachEach(g, p, [e], p.bench.filter(s => g.typesOf(s).includes('P')), '選擇要附上超能量的備戰寶可夢');
    },
  },
  // ---- 太晶慶典 ----
  '從自己的棄牌區選擇1張名稱中有「厄鬼椪」的「寶可夢【ex】」卡，與自己的場上的1隻名稱中有「厄鬼椪」的「寶可夢【ex】」互換（所附加的卡・傷害指示物・特殊狀態・效果等全部保留）。將換下的寶可夢丟棄。': {
    canPlay: (g, p) => p.discard.some(i => { const c = card(g, i); return c.ex && c.name.includes('厄鬼椪'); }) && g.slots(p).some(s => g.top(s).ex && g.top(s).name.includes('厄鬼椪')),
    play: async (g, p) => {
      const [inst] = await pick(g, p, p.discard.filter(i => { const c = card(g, i); return c.ex && c.name.includes('厄鬼椪'); }), { min: 1, max: 1, title: '選擇棄牌區的厄鬼椪ex', purpose: 'searchPokemon' });
      const s = await pickSlot(g, p, g.slots(p).filter(x => g.top(x).ex && g.top(x).name.includes('厄鬼椪')), { title: '選擇要換下的厄鬼椪ex', purpose: 'heal' });
      p.discard.splice(p.discard.indexOf(inst), 1);
      const old = s.cards.pop();
      s.cards.push(inst);
      p.discard.push(old);
      g.log(`${card(g, old).name}換成了${card(g, inst).name}`);
    },
  },
  '選擇1個對手的場上寶可夢身上附加的特殊能量，將其丟棄。': {
    canPlay: (g, p) => g.slots(g.opp(p)).some(s => s.energy.some(e => card(g, e).energy === 'special')),
    play: async (g, p) => {
      const o = g.opp(p);
      const s = await pickSlot(g, p, g.slots(o).filter(x => x.energy.some(e => card(g, e).energy === 'special')), { title: '選擇對手的寶可夢', purpose: 'discardOppEnergySlot', target: o.index });
      const [e] = await pick(g, p, s.energy.filter(x => card(g, x).energy === 'special'), { min: 1, max: 1, title: '選擇要丟棄的特殊能量', purpose: 'discardOppEnergy' });
      g.discardEnergy(s, e);
    },
  },
  '這張卡只有在自己的場上有「太晶」寶可夢時才可使用。 選擇最多2隻自己的備戰區的【無】寶可夢，從棄牌區附給那些寶可夢各1張基本能量卡。': {
    canPlay: (g, p) => g.slots(p).some(s => g.top(s).tera) && p.bench.some(s => g.typesOf(s).includes('C')) && p.discard.some(i => isBasicEnergy(card(g, i))),
    play: async (g, p) => {
      const ch = await g.ask(p, { kind: 'slots', title: '選擇最多2隻備戰區的無寶可夢', slots: p.bench.filter(s => g.typesOf(s).includes('C')), min: 1, max: 2, purpose: 'attachTarget' });
      for (const s of ch || []) {
        const [e] = await pick(g, p, p.discard.filter(i => isBasicEnergy(card(g, i))), { min: 1, max: 1, title: `選擇要附給${g.top(s).name}的基本能量`, purpose: 'recoverEnergy' });
        if (!e) break;
        p.discard.splice(p.discard.indexOf(e), 1); s.energy.push(e);
      }
    },
  },
  '從自己的棄牌區選擇寶可夢卡與基本能量卡合計最多5張，在給對手看過後加入手牌。': {
    canPlay: (g, p) => p.discard.some(i => { const c = card(g, i); return isPokemon(c) || isBasicEnergy(c); }),
    play: async (g, p) => moveDiscardToHand(g, p, await pick(g, p, p.discard.filter(i => { const c = card(g, i); return isPokemon(c) || isBasicEnergy(c); }), { max: 5, title: '選擇最多5張寶可夢卡或基本能量卡', purpose: 'recoverAny' })),
  },
  '這張卡必須將自己的1張手牌丟棄才可使用。 從自己的牌庫選擇最多2張基本能量卡，在給對手看過後加入手牌。並且重洗牌庫。': {
    ...discardCost(1),
    play: async function (g, p) { await this.pay(g, p); await searchDeck(g, p, isBasicEnergy, { max: 2, title: '選擇最多2張基本能量', purpose: 'searchEnergy' }); },
  },
  '這張卡必須將自己的1張手牌丟棄才可使用。 從自己的牌庫選擇最多2張「未來」寶可夢卡，在給對手看過後加入手牌。並且重洗牌庫。': {
    ...discardCost(1),
    play: async function (g, p) { await this.pay(g, p); await searchDeck(g, p, isFuture, { max: 2, title: '選擇最多2張未來寶可夢', purpose: 'searchPokemon' }); },
  },
  '從自己的牌庫選擇1張「太晶」寶可夢卡，在給對手看過後加入手牌。並且重洗牌庫。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: (g, p) => searchDeck(g, p, c => c.cat === 'P' && c.tera, { max: 1, title: '選擇1張太晶寶可夢', purpose: 'searchPokemon' }),
  },
  '從自己的牌庫選擇最多5張「寶可夢道具」卡，在給對手看過後加入手牌。並且重洗牌庫。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: (g, p) => searchDeck(g, p, c => c.trainer === 'Tool', { max: 5, title: '選擇最多5張寶可夢道具', purpose: 'searchTool' }),
  },
  '從自己的牌庫選擇最多2張HP為「70」以下的【基礎】寶可夢卡，放置於備戰區。並且重洗牌庫。': {
    canPlay: (g, p) => p.bench.length < 5 && p.deck.length > 0,
    play: (g, p) => searchDeck(g, p, c => isBasicPokemon(c) && c.hp <= 70, { max: Math.min(2, 5 - p.bench.length), title: '選擇最多2張HP70以下的基礎寶可夢', purpose: 'benchSearch', dest: 'bench' }),
  },
  '選擇1隻自己的場上寶可夢，將那隻寶可夢與附加的卡，全部放回手牌。': {
    canPlay: (g, p) => g.slots(p).length > 1 && !bounceBlocked(g, p),
    play: async (g, p) => {
      const s = await pickSlot(g, p, g.slots(p), { title: '選擇要放回手牌的寶可夢', purpose: 'heal' });
      await returnToHand(g, p, s, false);
    },
  },
  '查看自己的牌庫上方7張卡，從其中選擇【草】寶可夢卡與「基本【草】能量」卡合計最多2張，在給對手看過後加入手牌。將剩餘卡放回牌庫並重洗。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      const top = p.deck.slice(0, 7);
      const ch = await pick(g, p, top.filter(i => { const c = card(g, i); return (c.cat === 'P' && c.type === 'G') || (isBasicEnergy(c) && c.provides === 'G'); }), { max: 2, title: '選擇最多2張草寶可夢或基本草能量', purpose: 'searchPokemon', extra: { looked: top } });
      fromDeck(g, p, ch); p.hand.push(...ch); g.shuffle(p.deck);
    },
  },
  '將自己的手牌全部丟棄，從自己的牌庫選擇「寶可夢」卡「支援者」卡「基本能量」卡各1張，在給對手看過後加入手牌。並且重洗牌庫。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      p.discard.push(...p.hand); p.hand = [];
      await searchDeck(g, p, isPokemon, { max: 1, title: '選擇1張寶可夢卡', purpose: 'searchPokemon' });
      await searchDeck(g, p, c => c.trainer === 'Supporter', { max: 1, title: '選擇1張支援者卡', purpose: 'searchSupporter' });
      await searchDeck(g, p, isBasicEnergy, { max: 1, title: '選擇1張基本能量', purpose: 'searchEnergy' });
    },
  },
  '從自己的牌庫選擇最多2張各不同屬性的基本能量卡，在給對手看過後，其中1張加入手牌，剩餘的能量卡附於自己的寶可夢身上。並且重洗牌庫。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      const [a] = await pick(g, p, p.deck.filter(i => isBasicEnergy(card(g, i))), { max: 1, title: '選擇要加入手牌的基本能量', purpose: 'searchEnergy' });
      if (!a) return;
      fromDeck(g, p, [a]); p.hand.push(a);
      const [b] = await pick(g, p, p.deck.filter(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides !== card(g, a).provides; }), { max: 1, title: '選擇要附上的不同屬性基本能量', purpose: 'searchEnergy' });
      if (b) { fromDeck(g, p, [b]); await attachEach(g, p, [b], g.slots(p), '選擇要附上能量的寶可夢'); }
      g.shuffle(p.deck);
    },
  },
  '從自己的牌庫選擇競技場卡與能量卡各1張，在給對手看過後加入手牌。並且重洗牌庫。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      await searchDeck(g, p, c => c.trainer === 'Stadium', { max: 1, title: '選擇1張競技場卡', purpose: 'searchStadium' });
      await searchDeck(g, p, c => c.cat === 'E', { max: 1, title: '選擇1張能量卡', purpose: 'searchEnergy' });
    },
  },
  '從自己的牌庫任意選擇2張卡。重洗剩餘牌庫，將所選的卡以任意順序排列，放回牌庫上方。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      const ch = await pick(g, p, [...p.deck], { min: Math.min(2, p.deck.length), max: 2, title: '選擇2張要放在牌庫上方的卡（先選的在最上面）', purpose: 'searchAny' });
      fromDeck(g, p, ch); g.shuffle(p.deck); p.deck.unshift(...ch);
    },
  },
  '選擇最多2隻自己的【惡】寶可夢，從自己的牌庫附給那些寶可夢各1張「基本【惡】能量」卡。並且重洗牌庫。附於戰鬥寶可夢身上的情況下，將那隻寶可夢【中毒】。': {
    canPlay: (g, p) => g.slots(p).some(s => g.typesOf(s).includes('D')),
    play: async (g, p) => {
      const ch = await g.ask(p, { kind: 'slots', title: '選擇最多2隻惡寶可夢', slots: g.slots(p).filter(s => g.typesOf(s).includes('D')), min: 1, max: 2, purpose: 'attachTarget' });
      for (const s of ch || []) {
        const e = p.deck.find(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'D'; });
        if (!e) break;
        fromDeck(g, p, [e]); s.energy.push(e);
        if (p.active === s) g.setCondition(s, 'poison');
      }
      g.shuffle(p.deck);
    },
  },
  '選擇最多2隻自己的「古代」寶可夢，從棄牌區附給那些寶可夢各1張基本能量卡。然後，從自己的牌庫抽出3張卡。': {
    ancient: true,
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      p.ancientSupporterTurn = g.turn;
      const targets = g.slots(p).filter(s => isAncient(g.top(s)));
      if (targets.length && p.discard.some(i => isBasicEnergy(card(g, i)))) {
        const ch = await g.ask(p, { kind: 'slots', title: '選擇最多2隻古代寶可夢', slots: targets, min: 0, max: 2, purpose: 'attachTarget' });
        for (const s of ch || []) {
          const [e] = await pick(g, p, p.discard.filter(i => isBasicEnergy(card(g, i))), { min: 1, max: 1, title: `選擇要附給${g.top(s).name}的基本能量`, purpose: 'recoverEnergy' });
          if (!e) break;
          p.discard.splice(p.discard.indexOf(e), 1); s.energy.push(e);
        }
      }
      drawN(g, p, 3);
    },
  },
  '從自己的棄牌區選擇寶可夢卡（「擁有規則的寶可夢」除外）與基本能量卡合計最多3張，在給對手看過後加入手牌。': {
    canPlay: (g, p) => p.discard.some(i => { const c = card(g, i); return (isPokemon(c) && !hasRule(c)) || isBasicEnergy(c); }),
    play: async (g, p) => moveDiscardToHand(g, p, await pick(g, p, p.discard.filter(i => { const c = card(g, i); return (isPokemon(c) && !hasRule(c)) || isBasicEnergy(c); }), { max: 3, title: '選擇最多3張寶可夢卡或基本能量卡', purpose: 'recoverAny' })),
  },
  '這張卡從2種效果中選擇1種使用。 ◆將自己的戰鬥寶可夢與備戰寶可夢互換。 ◆在這個回合，自己的寶可夢使用的招式，對對手的戰鬥場的「寶可夢【ex】・【V】」造成的傷害「+30」點。': {
    play: async (g, p) => {
      const opts = p.bench.length ? ['將戰鬥寶可夢與備戰寶可夢互換', '這個回合對寶可夢ex・V的傷害+30'] : ['這個回合對寶可夢ex・V的傷害+30'];
      const i = await g.ask(p, { kind: 'option', title: '選擇烏栗的效果', options: opts, purpose: 'boss2' });
      if (opts[i].startsWith('將')) await g.switchOwn(p);
      else p.effects.push({ kind: 'exVBonus', amount: 30, turn: g.turn });
    },
  },
  '將自己的手牌全部放回牌庫並重洗。然後，從牌庫抽出4張卡。若對手剩餘獎賞卡的張數為3張以下，則改爲抽出8張卡。': {
    play: (g, p) => { p.deck.push(...p.hand); p.hand = []; g.shuffle(p.deck); drawN(g, p, g.opp(p).prizes.length <= 3 ? 8 : 4); },
  },
  '查看自己的牌庫上方6張卡，從其中選擇2張卡加入手牌。將剩餘卡丟棄。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      const top = p.deck.splice(0, 6);
      const ch = await pick(g, p, top, { min: Math.min(2, top.length), max: 2, title: '選擇2張加入手牌（其餘丟棄）', purpose: 'searchAny' });
      p.hand.push(...ch); p.discard.push(...top.filter(i => !ch.includes(i)));
    },
  },
  '從自己的牌庫抽出4張卡。在使用了這張卡的回合結束時，若自己的手牌有5張以上，則將自己的手牌全部丟棄。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: (g, p) => { drawN(g, p, 4); p.effects.push({ kind: 'endTurnDiscardHand', turn: g.turn }); },
  },
  '選擇1隻自己的場上寶可夢，放回手牌。（寶可夢以外的卡全部丟棄。）': {
    canPlay: (g, p) => g.slots(p).length > 1 && !bounceBlocked(g, p),
    play: async (g, p) => {
      const s = await pickSlot(g, p, g.slots(p), { title: '選擇要放回手牌的寶可夢', purpose: 'heal' });
      await returnToHand(g, p, s, true);
    },
  },
  '這張卡只有在對手剩餘獎賞卡的張數為2張時才可使用。 在這個回合，若對手的戰鬥寶可夢因自己的「太晶」寶可夢使用的招式的傷害而【昏厥】了，則多獲得1張獎賞卡。': {
    canPlay: (g, p) => g.opp(p).prizes.length === 2,
    play: (g, p) => p.effects.push({ kind: 'teraExtraPrize', turn: g.turn }),
  },
  '將自己的1隻剩餘HP為「30」以下的寶可夢的HP全部恢復。': {
    canPlay: (g, p) => g.slots(p).some(s => s.damage > 0 && g.hpLeft(s) <= 30),
    play: async (g, p) => {
      const s = await pickSlot(g, p, g.slots(p).filter(x => x.damage > 0 && g.hpLeft(x) <= 30), { title: '選擇要恢復的寶可夢', purpose: 'heal' });
      g.heal(s, s.damage);
    },
  },
  '這張卡必須將自己的1張手牌丟棄才可使用。 從自己的牌庫抽出與對手的備戰寶可夢相同數量的卡。': {
    ...discardCost(1),
    canPlay: (g, p) => p.hand.length >= 2 && g.opp(p).bench.length > 0 && p.deck.length > 0,
    play: async function (g, p) { await this.pay(g, p); drawN(g, p, g.opp(p).bench.length); },
  },
  '這張卡必須在上個對手的回合自己的寶可夢【昏厥】了才可使用。 從自己的棄牌區選擇1張「基本【火】能量」卡，附於自己的寶可夢身上。然後，從牌庫抽卡直到自己的手牌滿6張為止。': {
    canPlay: (g, p) => p.lastKoTurn === g.turn - 1,
    play: async (g, p) => {
      const e = p.discard.find(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'R'; });
      if (e) { p.discard.splice(p.discard.indexOf(e), 1); await attachEach(g, p, [e], g.slots(p), '選擇要附上火能量的寶可夢'); }
      drawN(g, p, Math.max(0, 6 - p.hand.length));
    },
  },
  '查看對手的手牌，從其中任意選擇1張卡，放回對手的牌庫下方。然後，對手若希望，從牌庫抽出1張卡。': {
    canPlay: (g, p) => g.opp(p).hand.length > 0,
    play: async (g, p) => {
      const o = g.opp(p);
      const [i] = await pick(g, p, [...o.hand], { min: 1, max: 1, title: '選擇要放回對手牌庫下方的卡', purpose: 'discardOppHand' });
      if (i) { g.removeFromHand(o, i); o.deck.push(i); g.log(`${card(g, i).name}被放回對手的牌庫下方`); }
      if (o.deck.length && await g.ask(o, { kind: 'yesno', title: '要從牌庫抽出1張卡嗎？', purpose: 'drawOne' })) drawN(g, o, 1);
    },
  },
  '將自己的所有手牌放回牌庫並重洗。然後，從牌庫抽出比放回張數多1張的卡。': {
    play: (g, p) => { const n = p.hand.length; p.deck.push(...p.hand); p.hand = []; g.shuffle(p.deck); drawN(g, p, n + 1); },
  },
  '這張卡只有在對手的戰鬥寶可夢【中毒】時才可使用。 將自己的手牌全部放回牌庫並重洗。然後，從牌庫抽出7張卡。': {
    canPlay: (g, p) => !!g.opp(p).active?.cond.poison,
    play: (g, p) => { p.deck.push(...p.hand); p.hand = []; g.shuffle(p.deck); drawN(g, p, 7); },
  },
  '選擇對手的所有寶可夢身上各自附加的特殊能量各1個，將其丟棄。': {
    canPlay: (g, p) => g.slots(g.opp(p)).some(s => s.energy.some(e => card(g, e).energy === 'special')),
    play: (g, p) => { for (const s of g.slots(g.opp(p))) { const e = s.energy.find(x => card(g, x).energy === 'special'); if (e) g.discardEnergy(s, e); } },
  },
  '查看對手的手牌，從其中選擇最多2張物品卡，將其丟棄。': {
    canPlay: (g, p) => g.opp(p).hand.length > 0,
    play: async (g, p) => {
      const o = g.opp(p);
      const ch = await pick(g, p, o.hand.filter(i => card(g, i).trainer === 'Item'), { max: 2, title: '選擇最多2張物品卡丟棄', purpose: 'discardOppHand', extra: { looked: [...o.hand] } });
      for (const i of ch) { g.removeFromHand(o, i); o.discard.push(i); }
      if (ch.length) g.log(`丟棄了對手的${ch.map(i => card(g, i).name).join('、')}`);
    },
  },
  '查看自己的牌庫上方5張卡，從其中選擇任意數量的卡，將其丟棄。將剩餘卡以任意順序排列，放回牌庫上方。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      const top = p.deck.slice(0, 5);
      const ch = await pick(g, p, top, { min: 0, max: top.length, title: '選擇要丟棄的卡（其餘放回牌庫上方）', purpose: 'discardFromHand' });
      p.deck = p.deck.filter(i => !ch.includes(i));
      p.discard.push(...ch);
    },
  },
  '查看自己的牌庫上方7張卡，從其中選擇寶可夢卡與訓練家卡各1張，在給對手看過後加入手牌。將剩餘卡放回牌庫並重洗。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      const top = p.deck.slice(0, 7);
      const a = await pick(g, p, top.filter(i => isPokemon(card(g, i))), { max: 1, title: '選擇1張寶可夢卡', purpose: 'searchPokemon', extra: { looked: top } });
      const b = await pick(g, p, top.filter(i => card(g, i).cat === 'T'), { max: 1, title: '選擇1張訓練家卡', purpose: 'searchSupporter', extra: { looked: top } });
      fromDeck(g, p, [...a, ...b]); p.hand.push(...a, ...b); g.shuffle(p.deck);
    },
  },

  // ---- 超電突圍 ----
  '查看自己的牌庫上方3張卡，以任意順序排列，放回牌庫上方。或者將那些卡全部翻回反面並重洗，放回牌庫下方。': {
    canPlay: (g, p) => p.deck.length > 0,
    play: async (g, p) => {
      const top = p.deck.slice(0, 3);
      const keep = await g.ask(p, { kind: 'yesno', title: `牌庫上方3張：${top.map(i => card(g, i).name).join('、')}。要保留在牌庫上方嗎？（否＝重洗後放到牌庫下方）`, purpose: 'keepTop3' });
      if (keep) {
        // 選擇最上面的一張，其餘依原順序
        const [first] = await pick(g, p, top, { min: 1, max: 1, title: '選擇要放在最上面的卡', purpose: 'searchAny' });
        p.deck.splice(0, top.length, first, ...top.filter(i => i !== first));
      } else {
        p.deck.splice(0, top.length);
        p.deck.push(...g.shuffle(top));
      }
    },
  },
  '這張卡只可在後攻玩家的最初回合使用。 選擇1個對手的場上寶可夢身上附加的能量，放回對手的手牌。': {
    canPlay: (g, p) => g.turn === 2 && g.slots(g.opp(p)).some(s => s.energy.length),
    play: async (g, p) => {
      const o = g.opp(p);
      const s = await pickSlot(g, p, g.slots(o).filter(x => x.energy.length), { title: '選擇對手的寶可夢', purpose: 'discardOppEnergySlot', target: o.index });
      const [e] = await pick(g, p, [...s.energy], { min: 1, max: 1, title: '選擇要放回對手手牌的能量', purpose: 'discardOppEnergy' });
      s.energy = s.energy.filter(x => x !== e);
      o.hand.push(e);
    },
  },
  '從自己的棄牌區選擇最多2張支援者卡，在給對手看過後加入手牌。': {
    canPlay: (g, p) => p.discard.some(i => card(g, i).trainer === 'Supporter'),
    play: async (g, p) => moveDiscardToHand(g, p, await pick(g, p, p.discard.filter(i => card(g, i).trainer === 'Supporter'), { max: 2, title: '選擇最多2張支援者卡', purpose: 'recoverItem' })),
  },
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
  // ---- 虛無歸零 ----
  '附有這張卡的「超級基格爾德【ex】」可使用這張卡上寫的招式。[需要有足夠使用招式的能量。] 大地光炮 350 將這隻寶可夢身上附加的能量卡全部丟棄。': {},
  // ---- 太晶慶典 ----
  '附有這張卡的「太晶」寶可夢使用招式時，使用那個招式所需的能量減少1個。（減少的能量任何屬性皆可。）': { reduceAnyCost: true },
  '附有這張卡的寶可夢，【撤退】所需的能量減少1個。若那隻寶可夢的剩餘HP為「30」以下，則【撤退】所需的能量全部消除。': {
    retreatCost: (g, s, cost) => (g.hpLeft(s) <= 30 ? 0 : cost - 1),
  },
  '附有這張卡的【中毒】的寶可夢使用的招式，對對手的戰鬥寶可夢造成的傷害「+40」點。': { damageBonus: (g, s) => (s.cond.poison ? 40 : 0) },
  '附有這張卡的寶可夢（「擁有規則的寶可夢」除外）的最大HP「+100」，那隻寶可夢受到對手的寶可夢招式的傷害而【昏厥】時，被獲得的獎賞卡的張數增加1張。': {
    hpBonus: (g, s, c) => (hasRule(c) ? 0 : 100),
    extraPrize: 1,
  },
  '附有這張卡的寶可夢受到對手的【龍】寶可夢招式的傷害時，那個傷害「-60」點，將這張卡丟棄。': {
    reduceDamage: (g, s, attacker) => (g.typesOf(attacker).includes('N') ? 60 : 0),
    consumeWhen: (g, s, attacker) => g.typesOf(attacker).includes('N'),
  },
  '附有這張卡的「古代」寶可夢的最大HP「+60」，那隻寶可夢不會陷入特殊狀態，並將受到的特殊狀態全部恢復。': {
    hpBonus: (g, s, c) => (isAncient(c) ? 60 : 0),
    noConditions: (g, s) => isAncient(g.top(s)),
  },
  '附有這張卡的「未來」寶可夢【撤退】所需的能量全部消除，那隻寶可夢使用的招式，對對手的戰鬥寶可夢造成的傷害「+20」點。': {
    retreatCost: (g, s, cost) => (isFuture(g.top(s)) ? 0 : cost),
    damageBonus: (g, s) => (isFuture(g.top(s)) ? 20 : 0),
  },
  '附有這張卡的寶可夢使用的招式，對對手的戰鬥場的「寶可夢【ex】」造成的傷害「+50」點。': { damageBonus: (g, s, target) => (g.top(target).ex ? 50 : 0) },

  '附有這張卡的寶可夢受到對手的寶可夢招式的傷害而【昏厥】時，從自己的牌庫任意選擇最多3張卡加入手牌。並且重洗牌庫。': {
    onKO: (g, p) => searchDeck(g, p, () => true, { max: 3, title: '希望護身符：從牌庫選擇最多3張卡', purpose: 'searchAny' }),
  },
  '附有這張卡的寶可夢受到對手的【惡】寶可夢招式的傷害時，那個傷害「-60」點，將這張卡丟棄。': {
    reduceDamage: (g, s, attacker) => (g.typesOf(attacker).includes('D') ? 60 : 0),
    consumeWhen: (g, s, attacker) => g.typesOf(attacker).includes('D'),
  },
  '附有這張卡的寶可夢受到對手的【鋼】寶可夢招式的傷害時，那個傷害「-60」點，將這張卡丟棄。': {
    reduceDamage: (g, s, attacker) => (g.typesOf(attacker).includes('M') ? 60 : 0),
    consumeWhen: (g, s, attacker) => g.typesOf(attacker).includes('M'),
  },
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
  // ---- 虛無歸零 ----
  '雙方玩家在每個自己的回合時，可使用1次，可從自己的牌庫選擇1張【基礎】寶可夢卡，放置於備戰區。並且重洗牌庫。若使用了這個效果，則自己的回合結束。': {
    canUse: (g, p) => p.bench.length < 5 && p.deck.length > 0,
    use: (g, p) => searchDeck(g, p, c => isBasicPokemon(c), { max: 1, title: '選擇1張基礎寶可夢放到備戰區', purpose: 'benchSearch', dest: 'bench' }),
    endsTurn: true,
  },
  '雙方的所有【草】寶可夢就算在剛使出的回合（自己的最初回合除外）也可進化成【草】寶可夢。': {
    evolveSameTurn: (from, to) => from.type === 'G' && to.type === 'G',
  },
  // ---- 太晶慶典 ----
  '雙方的所有身上附有能量卡的寶可夢不會陷入特殊狀態，並將受到的特殊狀態全部恢復。': { energyNoConditions: true },
  '雙方的所有寶可夢身上附加的「寶可夢道具」卡的效果全部消除。': { noTools: true },
  '雙方玩家在每個自己的回合時，可使用1次，若從自己的手牌將1張「基本【超】能量」卡丟棄，則可將自己的所有寶可夢各恢復「30」HP。': {
    canUse: (g, p) => g.slots(p).some(s => s.damage > 0) && p.hand.some(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'P'; }),
    use: (g, p) => {
      const e = p.hand.find(i => { const c = card(g, i); return isBasicEnergy(c) && c.provides === 'P'; });
      g.removeFromHand(p, e); p.discard.push(e);
      for (const s of g.slots(p)) g.heal(s, 30);
    },
  },
  '雙方的所有寶可夢（「擁有規則的寶可夢」除外），不會受到對手的「寶可夢【ex】・【V】」招式的傷害。 這張卡只要在棄牌區，無法加入手牌，無法放回牌庫。': { exVShield: true },

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
  // ---- 虛無歸零 ----
  '只要這張卡附於寶可夢身上，視為提供1個【草】能量。 附有這張卡的【草】寶可夢的最大HP「+20」。': {
    provides: () => ['G'],
    hpBonus: (g, s, c) => (c.type === 'G' ? 20 : 0),
  },
  '只要這張卡附於寶可夢身上，視為提供1個【超】能量。 從手牌將這張卡附於【超】寶可夢身上時，從自己的牌庫選擇最多2張【超】屬性的【基礎】寶可夢卡，放置於備戰區。並且重洗牌庫。': {
    provides: () => ['P'],
    onAttach: async (g, p, s) => {
      if (!g.typesOf(s).includes('P') || p.bench.length >= 5) return;
      await searchDeck(g, p, c => isBasicPokemon(c) && c.type === 'P', { max: Math.min(2, 5 - p.bench.length), title: '選擇最多2張超屬性基礎寶可夢放到備戰區', purpose: 'benchSearch', dest: 'bench' });
    },
  },
  '只要這張卡附於寶可夢身上，視為提供1個【鬥】能量。 附有這張卡的【鬥】寶可夢不會受到對手的寶可夢使用招式的效果的影響。（已經受到的效果不會消除。）': {
    provides: () => ['F'],
    noEffects: (g, s) => g.typesOf(s).includes('F'),
  },
  '只要這張卡附於寶可夢身上，視為提供1個【無】能量。 附有這張卡的寶可夢不會受到對手的寶可夢使用招式的效果的影響。（已經受到的效果不會消除。）': {
    provides: () => ['C'],
    noEffects: true,
  },
  '只要這張卡附於寶可夢身上，視為提供1個所有屬性的能量。 附有這張卡的寶可夢受到對手的寶可夢招式的傷害而【昏厥】時，被獲得的獎賞卡減少1張。對戰中，自己的「古舊能量」的這個效果只生效1次。': {
    provides: () => ['*'],
  },

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
