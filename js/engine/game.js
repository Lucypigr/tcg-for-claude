// 寶可夢集換式卡牌遊戲 對戰規則引擎
// 所有玩家選擇皆透過 controller（真人UI或AI）以 async 方式取得
import { cardData, isBasicPokemon, isBasicEnergy, isEnergy, isPokemon, prizeValue, TYPE_NAMES } from './cards.js';
import { getAttackImpl, getAbilityImpl, getTrainerImpl, getEnergyImpl, getStadiumImpl, getToolImpl } from './effects.js';

let UID = 1;
export const makeInst = cid => ({ uid: UID++, cid });

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const COND_NAMES = { poison: '中毒', burn: '灼傷', asleep: '睡眠', paralyzed: '麻痺', confused: '混亂' };

export class GameOver extends Error {
  constructor(winner, reason) { super('game over'); this.winner = winner; this.reason = reason; }
}

export class Game {
  constructor({ decks, names, controllers, seed = Date.now(), onEvent = () => {} }) {
    this.rng = mulberry32(seed);
    this.controllers = controllers;
    this.onEvent = onEvent;
    this.turn = 0;
    this.current = 0;
    this.winner = null;
    this.winReason = '';
    this.stadium = null; // { inst, owner }
    this.logs = [];
    this.players = [0, 1].map(i => ({
      index: i,
      name: names[i],
      deck: decks[i].map(cid => makeInst(cid)),
      hand: [], discard: [], prizes: [],
      active: null, bench: [],
      supporterPlayed: false, energyAttached: false, retreated: false, stadiumPlayed: false,
      lastKoTurn: -99, lastKoByAttackTypes: [], effects: [],
    }));
  }

  // ---------- 基本工具 ----------
  opp(p) { return this.players[1 - p.index]; }
  get me() { return this.players[this.current]; }
  card(inst) { return cardData(inst.cid); }
  top(slot) { return cardData(slot.cards[slot.cards.length - 1].cid); }
  slots(p) { return p.active ? [p.active, ...p.bench] : [...p.bench]; }
  ownerOf(slot) { return this.players.find(p => p.active === slot || p.bench.includes(slot)); }
  isActive(slot) { return this.players.some(p => p.active === slot); }
  log(msg, cls = '') { this.logs.push({ msg, cls, turn: this.turn }); this.onEvent({ type: 'log', msg, cls }); }
  emit(type = 'update', extra = {}) { this.onEvent({ type, ...extra }); }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  coin(p, label = '') {
    const heads = this.rng() < 0.5;
    this.log(`${p.name}擲硬幣${label ? `（${label}）` : ''}：${heads ? '正面' : '反面'}`, 'coin');
    this.emit('coin', { heads });
    return heads;
  }
  async ask(p, req) {
    req.player = p.index;
    return this.controllers[p.index].choose(this, req);
  }

  // ---------- 卡片移動 ----------
  draw(p, n = 1) {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (!p.deck.length) break;
      p.hand.push(p.deck.shift());
      drawn++;
    }
    return drawn;
  }
  removeFromHand(p, inst) {
    const i = p.hand.indexOf(inst);
    if (i >= 0) p.hand.splice(i, 1);
  }
  newSlot(inst) {
    return { id: inst.uid, cards: [inst], energy: [], tool: null, damage: 0, cond: {}, playedTurn: this.turn, evolvedTurn: -1, effects: [] };
  }
  putOnBench(p, inst) {
    if (p.bench.length >= 5) return null;
    const s = this.newSlot(inst);
    p.bench.push(s);
    return s;
  }
  allCardsOf(slot) {
    return [...slot.cards, ...slot.energy, ...(slot.tool ? [slot.tool] : [])];
  }
  removeSlot(p, slot) {
    if (p.active === slot) p.active = null;
    else p.bench = p.bench.filter(s => s !== slot);
  }
  discardSlot(p, slot) {
    this.removeSlot(p, slot);
    p.discard.push(...this.allCardsOf(slot));
  }
  returnSlotToDeck(p, slot) {
    this.removeSlot(p, slot);
    p.deck.push(...this.allCardsOf(slot));
    this.shuffle(p.deck);
  }
  discardEnergy(slot, inst) {
    const p = this.ownerOf(slot);
    slot.energy = slot.energy.filter(e => e !== inst);
    p.discard.push(inst);
  }

  // ---------- 狀態計算 ----------
  maxHp(slot) {
    const c = this.top(slot);
    let hp = c.hp;
    if (slot.tool) { const t = getToolImpl(this.card(slot.tool)); if (t.hpBonus) hp += t.hpBonus(this, slot, c); }
    if (this.stadium) { const s = getStadiumImpl(this.card(this.stadium.inst)); if (s.hpBonus) hp += s.hpBonus(this, slot, c); }
    return hp;
  }
  hpLeft(slot) { return this.maxHp(slot) - slot.damage; }
  hasEffect(slot, kind, pred = () => true) { return slot.effects.some(e => e.kind === kind && e.turn === this.turn && pred(e)); }
  playerEffect(p, kind) { return p.effects.filter(e => e.kind === kind && e.turn === this.turn); }
  addEffect(slot, eff) { slot.effects.push(eff); }

  // 能量提供：回傳屬性陣列，'*' 表示任意屬性
  energyUnits(slot) {
    const units = [];
    for (const e of slot.energy) {
      const c = this.card(e);
      if (isBasicEnergy(c)) units.push(c.provides);
      else units.push(...getEnergyImpl(c).provides(this, slot));
    }
    return units;
  }
  countEnergy(slot, type) {
    return this.energyUnits(slot).filter(u => !type || u === type || u === '*').length;
  }
  attackCost(slot, atk) {
    const cost = [...atk.cost];
    if (this.stadium) {
      const s = getStadiumImpl(this.card(this.stadium.inst));
      if (s.extraCost) cost.push(...s.extraCost(this, slot));
    }
    return cost;
  }
  canPay(cost, units) {
    const pool = [...units];
    const take = t => { const i = pool.indexOf(t); if (i >= 0) { pool.splice(i, 1); return true; } return false; };
    const specific = cost.filter(t => t !== 'C');
    const missing = [];
    for (const t of specific) if (!take(t)) missing.push(t);
    for (const t of missing) if (!take('*')) return false;
    return pool.length >= cost.filter(t => t === 'C').length;
  }
  retreatCost(slot) {
    const p = this.ownerOf(slot);
    let cost = this.top(slot).retreat;
    for (const s of this.slots(p)) {
      const ab = getAbilityImpl(this.top(s));
      if (ab?.retreatCost) cost = ab.retreatCost(this, s, slot, cost);
    }
    return Math.max(0, cost);
  }

  // ---------- 傷害 ----------
  // 招式傷害：對戰鬥寶可夢計算弱點/抵抗力及各種增減
  attackDamage(attacker, target, base, opts = {}) {
    const atkCard = this.top(attacker);
    const defCard = this.top(target);
    const attackerOwner = this.ownerOf(attacker);
    const defOwner = this.ownerOf(target);
    const toActive = defOwner.active === target;
    let dmg = base;
    if (dmg <= 0) return 0;
    if (toActive) {
      if (attacker.tool && !opts.noModifiers) { const t = getToolImpl(this.card(attacker.tool)); if (t.damageBonus) dmg += t.damageBonus(this, attacker, target); }
      for (const e of attacker.effects) if (e.kind === 'attackMinus' && e.turn === this.turn) dmg -= e.amount;
      if (!opts.noWeakness && defCard.weak && defCard.weak === atkCard.type) dmg *= 2;
      if (!opts.noResistance && defCard.resist && defCard.resist === atkCard.type) dmg -= 30;
      if (!opts.noModifiers) {
        for (const e of target.effects) if (e.kind === 'reduceDamage' && e.turn === this.turn) dmg -= e.amount;
        for (const e of this.playerEffect(defOwner, 'reduceDamage')) dmg -= e.amount;
        const ab = getAbilityImpl(defCard);
        if (ab?.reduceDamage) dmg -= ab.reduceDamage(this, target, attacker);
        if (target.tool) { const t = getToolImpl(this.card(target.tool)); if (t.reduceDamage) dmg -= t.reduceDamage(this, target, attacker); }
      }
    } else if (defCard.tera) {
      return 0;
    }
    return Math.max(0, dmg);
  }
  isProtected(target, attacker) {
    if (this.hasEffect(target, 'preventDamage')) return true;
    if (this.hasEffect(target, 'preventAll')) return true;
    return false;
  }
  // 由招式造成傷害（含效果）；回傳實際傷害
  dealAttackDamage(attacker, target, base, opts = {}) {
    if (this.ownerOf(attacker) === this.ownerOf(target)) {
      // 對自己的寶可夢（自傷）不計算弱點抵抗力
      target.damage += base;
      return base;
    }
    if (this.isProtected(target, attacker)) { this.log(`${this.top(target).name}不受招式的傷害影響！`); return 0; }
    const dmg = this.attackDamage(attacker, target, base, opts);
    if (dmg > 0) {
      target.damage += dmg;
      this.log(`${this.top(target).name}受到${dmg}點傷害`, 'dmg');
      this.emit('damage', { slot: target.id, amount: dmg });
      const defOwner = this.ownerOf(target);
      if (defOwner.active === target) {
        const ab = getAbilityImpl(this.top(target));
        if (ab?.onDamagedActive) ab.onDamagedActive(this, target, attacker);
        if (target.tool) { const t = getToolImpl(this.card(target.tool)); if (t.onDamagedActive) t.onDamagedActive(this, target, attacker); }
      }
    }
    return dmg;
  }
  placeCounters(target, n) {
    if (n <= 0) return;
    if (this.hasEffect(target, 'preventAll')) { this.log(`${this.top(target).name}不受招式的效果影響！`); return; }
    target.damage += n * 10;
    this.log(`在${this.top(target).name}身上放置${n}個傷害指示物`, 'dmg');
    this.emit('damage', { slot: target.id, amount: n * 10 });
  }
  heal(slot, amount) {
    const h = Math.min(slot.damage, amount);
    slot.damage -= h;
    if (h > 0) this.log(`${this.top(slot).name}恢復了${h}HP`, 'heal');
    return h;
  }
  setCondition(slot, cond) {
    const c = this.top(slot);
    const ab = getAbilityImpl(c);
    if (ab?.immune?.includes(cond)) { this.log(`${c.name}不會${COND_NAMES[cond]}`); return; }
    if (slot.energy.some(e => getEnergyImpl(this.card(e))?.immune?.includes(cond))) { this.log(`${c.name}不會${COND_NAMES[cond]}`); return; }
    if (this.hasEffect(slot, 'preventAll')) return;
    if (['asleep', 'paralyzed', 'confused'].includes(cond)) { delete slot.cond.asleep; delete slot.cond.paralyzed; delete slot.cond.confused; }
    slot.cond[cond] = true;
    this.log(`${c.name}陷入${COND_NAMES[cond]}狀態`, 'cond');
  }
  clearConditions(slot) { slot.cond = {}; }

  // ---------- 換位 ----------
  switchActive(p, benchSlot) {
    const old = p.active;
    p.bench = p.bench.filter(s => s !== benchSlot);
    if (old) {
      this.clearConditions(old);
      old.effects = old.effects.filter(e => e.persist);
      p.bench.push(old);
    }
    p.active = benchSlot;
    this.log(`${p.name}的${this.top(benchSlot).name}上場成為戰鬥寶可夢`);
  }
  async chooseBench(p, chooser, title, purpose, optional = false) {
    if (!p.bench.length) return null;
    return this.ask(chooser, { kind: 'slot', title, slots: [...p.bench], min: optional ? 0 : 1, purpose, target: p.index });
  }
  // 將自己的戰鬥寶可夢與備戰寶可夢互換（自己選擇）
  async switchOwn(p, optional = false) {
    if (!p.bench.length) return false;
    const s = await this.chooseBench(p, p, '選擇要換上場的備戰寶可夢', 'switchIn', optional);
    if (!s) return false;
    this.switchActive(p, s);
    return true;
  }
  // 對手的備戰寶可夢拉上場（由自己選擇）
  async gust(me, optional = false) {
    const o = this.opp(me);
    if (!o.bench.length) return false;
    const s = await this.chooseBench(o, me, '選擇要拉到戰鬥場的對手備戰寶可夢', 'gust', optional);
    if (!s) return false;
    this.switchActive(o, s);
    return true;
  }

  // ---------- 昏厥處理 ----------
  async checkKnockouts(attackCtx = null) {
    let any = false;
    for (let loop = 0; loop < 3; loop++) {
      let found = false;
      // 先處理非當前玩家（被攻擊方）
      for (const p of [this.opp(this.me), this.me]) {
        for (const slot of this.slots(p)) {
          if (slot.damage >= this.maxHp(slot)) {
            found = any = true;
            const c = this.top(slot);
            this.log(`${p.name}的${c.name}昏厥了！`, 'ko');
            this.emit('ko', { slot: slot.id });
            p.lastKoTurn = this.turn;
            if (attackCtx && attackCtx.attackerOwner !== p) p.lastKoByAttackTypes.push({ turn: this.turn, type: c.type });
            this.discardSlot(p, slot);
            const taker = this.opp(p);
            let n = prizeValue(c);
            if (attackCtx?.extraPrize && attackCtx.attackerOwner === taker) n += attackCtx.extraPrize;
            await this.takePrizes(taker, n);
          }
        }
      }
      if (!found) break;
    }
    this.checkWin();
    // 補上戰鬥寶可夢
    for (const p of [this.me, this.opp(this.me)]) {
      if (!p.active && p.bench.length) {
        const s = await this.ask(p, { kind: 'slot', title: '選擇新的戰鬥寶可夢', slots: [...p.bench], min: 1, purpose: 'promote', target: p.index });
        this.switchActive(p, s);
      }
    }
    this.checkWin();
    if (any) this.emit();
    return any;
  }
  async takePrizes(p, n) {
    n = Math.min(n, p.prizes.length);
    for (let i = 0; i < n; i++) p.hand.push(p.prizes.shift());
    if (n > 0) { this.log(`${p.name}獲得了${n}張獎賞卡（剩餘${p.prizes.length}張）`, 'prize'); this.emit('prize', { player: p.index, n }); }
    if (p.prizes.length === 0) this.finish(p.index, '獲得所有獎賞卡');
  }
  checkWin() {
    for (const p of this.players) {
      if (!p.active && !p.bench.length && this.turn > 0) this.finish(1 - p.index, '對手場上沒有寶可夢');
    }
  }
  finish(winnerIndex, reason) {
    if (this.winner !== null) return;
    this.winner = winnerIndex;
    this.winReason = reason;
    this.log(`${this.players[winnerIndex].name}獲勝！（${reason}）`, 'win');
    throw new GameOver(winnerIndex, reason);
  }

  // ---------- 遊戲流程 ----------
  async run() {
    try {
      await this.setup();
      for (;;) await this.playTurn();
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
    this.emit('gameover', { winner: this.winner, reason: this.winReason });
    return this.winner;
  }

  async setup() {
    const mull = [0, 0];
    for (const p of this.players) {
      for (;;) {
        this.shuffle(p.deck);
        this.draw(p, 7);
        if (p.hand.some(i => isBasicPokemon(this.card(i)))) break;
        mull[p.index]++;
        this.log(`${p.name}手牌中沒有基礎寶可夢，重新抽牌`);
        p.deck.push(...p.hand); p.hand = [];
        if (mull[p.index] > 20) throw new Error('牌組中沒有基礎寶可夢');
      }
    }
    for (const p of this.players) {
      const extra = mull[1 - p.index];
      if (extra) { this.draw(p, extra); this.log(`${p.name}因對手重抽而多抽了${extra}張卡`); }
    }
    this.current = this.rng() < 0.5 ? 0 : 1;
    this.first = this.current;
    this.log(`擲硬幣決定先攻：${this.players[this.current].name}先攻`, 'coin');
    for (const p of this.players) {
      const basics = p.hand.filter(i => isBasicPokemon(this.card(i)));
      const [act] = await this.ask(p, { kind: 'cards', title: '選擇戰鬥寶可夢', cards: basics, min: 1, max: 1, purpose: 'setupActive' });
      this.removeFromHand(p, act);
      p.active = this.newSlot(act);
      const rest = p.hand.filter(i => isBasicPokemon(this.card(i)));
      if (rest.length) {
        const bench = await this.ask(p, { kind: 'cards', title: '選擇要放到備戰區的寶可夢（最多5張）', cards: rest, min: 0, max: Math.min(5, rest.length), purpose: 'setupBench' });
        for (const i of bench) { this.removeFromHand(p, i); this.putOnBench(p, i); }
      }
      for (let i = 0; i < 6; i++) p.prizes.push(p.deck.shift());
    }
    this.log('對戰開始！', 'turn');
    this.emit();
  }

  async playTurn() {
    this.turn++;
    const p = this.me;
    p.supporterPlayed = p.energyAttached = p.retreated = p.stadiumPlayed = false;
    p.abilityUsed = {};
    p.effects = p.effects.filter(e => e.turn >= this.turn);
    for (const s of this.slots(p)) s.effects = s.effects.filter(e => e.turn >= this.turn);
    for (const s of this.slots(this.opp(p))) s.effects = s.effects.filter(e => e.turn >= this.turn);
    this.log(`── 第${this.turn}回合：${p.name} ──`, 'turn');
    this.emit('turn', { player: p.index });
    if (!p.deck.length) this.finish(1 - p.index, '對手無法抽牌');
    this.draw(p, 1);
    this.emit();
    for (;;) {
      const actions = this.legalActions(p);
      const act = await this.controllers[p.index].chooseAction(this, actions);
      if (!act || act.type === 'end') break;
      if (act.type === 'forfeit') this.finish(1 - p.index, '對手投降');
      const endsTurn = await this.perform(p, act);
      this.emit();
      if (endsTurn) break;
    }
    await this.betweenTurns();
    this.current = 1 - this.current;
  }

  async betweenTurns() {
    const p = this.me;
    for (const pl of [p, this.opp(p)]) {
      const s = pl.active;
      if (!s) continue;
      const name = this.top(s).name;
      if (s.cond.poison) { s.damage += 10; this.log(`${name}因中毒受到10點傷害`, 'cond'); }
      if (s.cond.burn) {
        s.damage += 20; this.log(`${name}因灼傷受到20點傷害`, 'cond');
        if (this.coin(pl, '灼傷')) { delete s.cond.burn; this.log(`${name}的灼傷恢復了`); }
      }
      if (s.cond.asleep) {
        if (this.coin(pl, '睡眠')) { delete s.cond.asleep; this.log(`${name}醒過來了`); }
      }
    }
    // 麻痺在自己的回合結束時恢復
    if (p.active?.cond.paralyzed && p.active.paralyzedTurn !== this.turn) { delete p.active.cond.paralyzed; this.log(`${this.top(p.active).name}的麻痺恢復了`); }
    await this.checkKnockouts();
    this.emit();
  }

  // ---------- 合法行動 ----------
  legalActions(p) {
    const acts = [];
    const firstTurnOfPlayer = this.turn <= 2;
    for (const inst of p.hand) {
      const c = this.card(inst);
      if (isPokemon(c)) {
        if (c.stage === 0 && p.bench.length < 5) acts.push({ type: 'bench', uid: inst.uid });
        if (c.stage > 0 && !firstTurnOfPlayer) {
          for (const s of this.slots(p)) {
            const t = this.top(s);
            if (t.name === c.from && s.playedTurn !== this.turn && s.evolvedTurn !== this.turn) acts.push({ type: 'evolve', uid: inst.uid, target: s.id });
          }
        }
      } else if (isEnergy(c)) {
        if (!p.energyAttached) for (const s of this.slots(p)) acts.push({ type: 'energy', uid: inst.uid, target: s.id });
      } else {
        const impl = getTrainerImpl(c);
        if (c.trainer === 'Supporter' && (p.supporterPlayed || (this.turn === 1 && !impl.firstTurnOk))) continue;
        if (c.trainer === 'Stadium' && (p.stadiumPlayed || (this.stadium && this.card(this.stadium.inst).name === c.name))) continue;
        if (c.trainer === 'Tool') {
          for (const s of this.slots(p)) if (!s.tool) acts.push({ type: 'trainer', uid: inst.uid, target: s.id });
          continue;
        }
        if (impl.canPlay && !impl.canPlay(this, p, inst)) continue;
        acts.push({ type: 'trainer', uid: inst.uid });
      }
    }
    for (const s of this.slots(p)) {
      const c = this.top(s);
      const ab = getAbilityImpl(c);
      if (ab?.use && !(ab.oncePerTurn !== false && p.abilityUsed[`${s.id}:${ab.key || c.id}`]) && !(ab.globalKey && p.abilityUsed[ab.globalKey])) {
        if (!ab.canUse || ab.canUse(this, p, s)) acts.push({ type: 'ability', target: s.id });
      }
    }
    // 竟技場效果（深缽鎮）
    if (this.stadium) {
      const st = getStadiumImpl(this.card(this.stadium.inst));
      if (st.use && !p.abilityUsed.stadium && (!st.canUse || st.canUse(this, p))) acts.push({ type: 'stadium' });
    }
    const a = p.active;
    if (a) {
      if (!p.retreated && p.bench.length && !a.cond.paralyzed && !a.cond.asleep && !this.hasEffect(a, 'noRetreat') && this.countEnergy(a) >= this.retreatCost(a)) {
        for (const b of p.bench) acts.push({ type: 'retreat', target: b.id });
      }
      if (!(this.turn === 1) && !a.cond.paralyzed && !a.cond.asleep) {
        const c = this.top(a);
        c.attacks.forEach((atk, idx) => {
          if (this.canUseAttack(p, a, idx)) acts.push({ type: 'attack', idx });
        });
      }
    }
    acts.push({ type: 'end' });
    return acts;
  }
  canUseAttack(p, slot, idx) {
    const c = this.top(slot);
    const atk = c.attacks[idx];
    if (!this.canPay(this.attackCost(slot, atk), this.energyUnits(slot))) return false;
    if (this.hasEffect(slot, 'noAttack')) return false;
    if (this.hasEffect(slot, 'noAttackName', e => e.name === atk.name)) return false;
    const impl = getAttackImpl(c, idx);
    if (impl.canUse && !impl.canUse(this, p, slot)) return false;
    return true;
  }
  findSlot(p, id) { return this.slots(p).find(s => s.id === id); }
  findHand(p, uid) { return p.hand.find(i => i.uid === uid); }

  // ---------- 執行行動 ----------
  async perform(p, act) {
    switch (act.type) {
      case 'bench': {
        const inst = this.findHand(p, act.uid);
        this.removeFromHand(p, inst);
        this.putOnBench(p, inst);
        this.log(`${p.name}將${this.card(inst).name}放到備戰區`);
        return false;
      }
      case 'evolve': {
        const inst = this.findHand(p, act.uid);
        const s = this.findSlot(p, act.target);
        await this.evolve(p, s, inst, true);
        return false;
      }
      case 'energy': {
        const inst = this.findHand(p, act.uid);
        const s = this.findSlot(p, act.target);
        this.removeFromHand(p, inst);
        s.energy.push(inst);
        p.energyAttached = true;
        this.log(`${p.name}將${this.card(inst).name}附於${this.top(s).name}身上`);
        this.emit('energy', { slot: s.id, etype: this.card(inst).provides || 'C', player: p.index });
        const impl = getEnergyImpl(this.card(inst));
        if (impl?.onAttach) await impl.onAttach(this, p, s);
        return false;
      }
      case 'trainer': {
        const inst = this.findHand(p, act.uid);
        const c = this.card(inst);
        this.removeFromHand(p, inst);
        this.log(`${p.name}使用了${c.name}`, 'trainer');
        this.emit('trainer', { cid: c.id, player: p.index });
        if (c.trainer === 'Tool') {
          const s = this.findSlot(p, act.target);
          s.tool = inst;
          return false;
        }
        if (c.trainer === 'Stadium') {
          if (this.stadium) { this.players[this.stadium.owner].discard.push(this.stadium.inst); }
          this.stadium = { inst, owner: p.index };
          p.stadiumPlayed = true;
          return false;
        }
        if (c.trainer === 'Supporter') p.supporterPlayed = true;
        const impl = getTrainerImpl(c);
        this.inPlayTrainer = inst;
        try {
          if (impl.play) await impl.play(this, p, inst);
        } finally { this.inPlayTrainer = null; }
        p.discard.push(inst);
        await this.checkKnockouts();
        return false;
      }
      case 'ability': {
        const s = this.findSlot(p, act.target);
        const c = this.top(s);
        const ab = getAbilityImpl(c);
        p.abilityUsed[`${s.id}:${ab.key || c.id}`] = true;
        if (ab.globalKey) p.abilityUsed[ab.globalKey] = true;
        this.log(`${p.name}的${c.name}使用了特性「${c.abilities[0]?.name}」`, 'ability');
        this.emit('ability', { slot: s.id });
        await ab.use(this, p, s);
        await this.checkKnockouts();
        return false;
      }
      case 'stadium': {
        const st = getStadiumImpl(this.card(this.stadium.inst));
        p.abilityUsed.stadium = true;
        this.log(`${p.name}使用了競技場「${this.card(this.stadium.inst).name}」的效果`);
        await st.use(this, p);
        return false;
      }
      case 'retreat': {
        const a = p.active;
        const b = this.findSlot(p, act.target);
        const cost = this.retreatCost(a);
        if (cost > 0) {
          let toDiscard;
          if (a.energy.length === cost) toDiscard = [...a.energy];
          else toDiscard = await this.ask(p, { kind: 'cards', title: `選擇要丟棄的能量（${cost}個）`, cards: [...a.energy], min: cost, max: cost, purpose: 'retreatDiscard', count: cost });
          for (const e of toDiscard) this.discardEnergy(a, e);
        }
        p.retreated = true;
        this.log(`${p.name}的${this.top(a).name}撤退了`);
        this.switchActive(p, b);
        return false;
      }
      case 'attack':
        await this.attack(p, act.idx);
        return true;
    }
    return false;
  }

  async evolve(p, slot, inst, fromHand) {
    const c = this.card(inst);
    const prev = this.top(slot);
    this.removeFromHand(p, inst);
    slot.cards.push(inst);
    slot.evolvedTurn = this.turn;
    this.clearConditions(slot);
    slot.effects = slot.effects.filter(e => e.persist);
    this.log(`${p.name}的${prev.name}進化成${c.name}`, 'evolve');
    this.emit('evolve', { slot: slot.id, cid: c.id, player: p.index });
    const ab = getAbilityImpl(c);
    if (fromHand && ab?.onEvolve) {
      const yes = await this.ask(p, { kind: 'yesno', title: `要使用「${c.abilities[0].name}」嗎？`, purpose: 'onEvolve', card: c.id });
      if (yes) {
        this.log(`${c.name}使用了特性「${c.abilities[0].name}」`, 'ability');
        await ab.onEvolve(this, p, slot);
      }
    }
  }

  async attack(p, idx) {
    const a = p.active;
    const c = this.top(a);
    const atk = c.attacks[idx];
    const o = this.opp(p);
    this.log(`${p.name}的${c.name}使用了「${atk.name}」`, 'attack');
    this.emit('attack', { slot: a.id, name: atk.name, ptype: c.type, target: o.active?.id, player: p.index });
    if (a.cond.confused) {
      if (!this.coin(p, '混亂')) {
        this.log(`${c.name}因混亂而攻擊失敗，自己受到30點傷害`);
        a.damage += 30;
        await this.checkKnockouts();
        return;
      }
    }
    a.lastAttack = { name: atk.name, turn: this.turn };
    const impl = getAttackImpl(c, idx);
    const ctx = {
      g: this, me: p, opp: o, attacker: a, defender: o.active, atk, card: c,
      base: parseInt(atk.dmg) || 0, opts: {}, attackerOwner: p, extraPrize: 0, data: {},
    };
    let failed = false;
    if (impl.before) failed = (await impl.before(ctx)) === false;
    if (failed) {
      this.log(`招式「${atk.name}」失敗了`);
    } else {
      if (ctx.base > 0 && ctx.defender && !ctx.noMainDamage) {
        ctx.dealt = this.dealAttackDamage(a, ctx.defender, ctx.base, ctx.opts);
      }
      if (impl.after && p.active === a) await impl.after(ctx);
      else if (impl.after && impl.afterEvenIfMoved) await impl.after(ctx);
    }
    await this.checkKnockouts(ctx);
  }
}

export { TYPE_NAMES };
