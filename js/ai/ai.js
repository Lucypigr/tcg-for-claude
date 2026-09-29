// AI 對手：easy（簡單）/ normal（普通）/ hard（困難）
import { cardData, isBasicEnergy, isBasicPokemon, isPokemon, prizeValue, hasRule } from '../engine/cards.js';
import { estimateAttack, getAbilityImpl, getTrainerImpl, getProvides, getStadiumImpl } from '../engine/effects.js';

const rand = arr => arr[Math.floor(Math.random() * arr.length)];

export class AIController {
  constructor(level = 'normal', deckList = []) {
    this.level = level;
    this.deckList = deckList;
    this.actionsThisTurn = 0;
    this.turnSeen = -1;
    this.delay = 0;
    // 進化線：名稱 → 最終進化型態
    this.finalForm = new Map();
    const datas = [...new Set(deckList)].map(cardData).filter(isPokemon);
    for (const c of datas) {
      let best = c;
      for (let i = 0; i < 3; i++) {
        const next = datas.filter(x => x.from === best.name).sort((a, b) => b.stage - a.stage || b.hp - a.hp)[0];
        if (!next) break;
        best = next;
      }
      this.finalForm.set(c.name, best);
    }
  }
  get smart() { return this.level !== 'easy'; }
  get hard() { return this.level === 'hard'; }
  // 普通難度偶爾會做出不夠精準的判斷
  sloppy(rate = 0.25) { return this.level === 'normal' && Math.random() < rate; }

  async wait() { if (this.delay) await new Promise(r => setTimeout(r, this.delay)); }

  // ================= 傷害估算 =================
  damageVs(g, p, slot, idx, def) {
    if (!def) return 0;
    const c = g.top(slot);
    let base = estimateAttack(g, p, slot, idx, def);
    const txt = c.attacks[idx].text || '';
    if (base <= 0) return 0;
    // 放置傷害指示物的招式不計算弱點抵抗力
    if (!c.attacks[idx].dmg) return /備戰/.test(txt) ? 0 : base;
    const d = g.top(def);
    if (slot.tool && cardData(slot.tool.cid).name === '活力頭帶') base += 10;
    if (d.weak === c.type && !txt.includes('不計算弱點')) base *= 2;
    if (d.resist === c.type) base -= 30;
    const ab = getAbilityImpl(d);
    if (ab?.reduceDamage) base -= 20;
    if (d.type === 'F' && def.tool && cardData(def.tool.cid).name === '岩石胸甲') base -= 30;
    for (const e of def.effects) if (e.kind === 'reduceDamage' && e.turn >= g.turn) base -= e.amount;
    if (def.effects.some(e => (e.kind === 'preventDamage' || e.kind === 'preventAll') && e.turn >= g.turn)) return 0;
    return Math.max(0, base);
  }
  bestAttack(g, p, slot, def, requireUsable = true) {
    const c = g.top(slot);
    let best = null;
    c.attacks.forEach((a, idx) => {
      if (requireUsable && !g.canUseAttack(p, slot, idx)) return;
      const dmg = this.damageVs(g, p, slot, idx, def);
      const ko = def && dmg >= g.hpLeft(def);
      let score = dmg + (ko ? 1000 + prizeValue(g.top(def)) * 200 : 0);
      // 自我限制的招式稍微扣分
      if (/無法使用招式|全部丟棄/.test(a.text) && !ko) score -= 30;
      if (/抽出|加入手牌|放置於備戰區|附於/.test(a.text) && dmg === 0) score += 15;
      if (!best || score > best.score) best = { idx, dmg, ko, score };
    });
    return best;
  }
  canKoNow(g, p, def) {
    const a = p.active;
    if (!a || !def) return false;
    const b = this.bestAttack(g, p, a, def);
    return b?.ko;
  }
  // 若拉出該寶可夢到戰鬥場，能否擊倒
  koIfActive(g, p, def) {
    const a = p.active;
    if (!a) return null;
    const b = this.bestAttack(g, p, a, def);
    return b && b.ko ? b : null;
  }

  // ================= 能量需求 =================
  plannedCard(g, slot) {
    const c = g.top(slot);
    return this.finalForm.get(c.name) || c;
  }
  missingEnergy(g, slot, forCard = null) {
    const c = forCard || this.plannedCard(g, slot);
    if (!c.attacks?.length) return [];
    // 以最高傷害的招式為目標
    const atk = [...c.attacks].sort((a, b) => (parseInt(b.dmg) || 0) - (parseInt(a.dmg) || 0))[0];
    const units = [...g.energyUnits(slot)];
    const missing = [];
    for (const t of atk.cost.filter(t => t !== 'C')) {
      const i = units.indexOf(t);
      if (i >= 0) units.splice(i, 1);
      else { const w = units.indexOf('*'); if (w >= 0) units.splice(w, 1); else missing.push(t); }
    }
    const colorless = atk.cost.filter(t => t === 'C').length;
    for (let i = units.length; i < colorless; i++) missing.push('C');
    return missing;
  }
  attackerValue(g, slot) {
    const c = this.plannedCard(g, slot);
    let v = 0;
    if (c.ex) v += 30;
    if (c.stage === 2) v += 20;
    const maxDmg = Math.max(0, ...c.attacks.map(a => parseInt(a.dmg) || 0));
    v += maxDmg / 10;
    return v;
  }
  energyTargetScore(g, p, slot, eCard) {
    const missing = this.missingEnergy(g, slot);
    const type = eCard.provides || 'C';
    const fits = missing.includes(type) || (missing.includes('C'));
    if (!fits) return missing.length === 0 ? -5 : 2;
    let s = 10 + this.attackerValue(g, slot);
    if (p.active === slot) {
      s += 15;
      const cur = g.top(slot);
      if (this.missingEnergy(g, slot, cur).length === 1) s += 40; // 本回合即可攻擊
    }
    // 超級路卡利歐ex之類：戰鬥場上若有會回收能量的招式，優先附在戰鬥場
    return s;
  }

  // ================= 手牌價值 =================
  handValue(g, p, inst) {
    const c = cardData(inst.cid);
    if (isBasicEnergy(c)) {
      const need = g.slots(p).some(s => this.missingEnergy(g, s).some(t => t === c.provides || t === 'C'));
      const count = p.hand.filter(i => i.cid === inst.cid).length;
      return need ? 30 - count * 3 : 10 - count;
    }
    if (isPokemon(c)) {
      if (c.stage > 0) return g.slots(p).some(s => g.top(s).name === c.from) ? 70 : 35;
      return p.bench.length < 3 ? 50 : 20;
    }
    if (c.trainer === 'Supporter') return p.supporterPlayed ? 25 : 45;
    if (c.name === '神奇糖果') return p.hand.some(i => { const x = cardData(i.cid); return x.stage === 2; }) ? 60 : 30;
    return 35;
  }

  // ================= 行動選擇 =================
  async chooseAction(g, actions) {
    await this.wait();
    const p = g.me;
    if (this.turnSeen !== g.turn) { this.turnSeen = g.turn; this.actionsThisTurn = 0; this.usedPlan = {}; }
    this.actionsThisTurn++;
    const attacks = actions.filter(a => a.type === 'attack');
    if (this.actionsThisTurn > 80) return attacks.length ? this.pickAttack(g, p, attacks) : { type: 'end' };

    if (this.level === 'easy') return this.easyAction(g, p, actions);

    let best = null, bestScore = 0;
    for (const a of actions) {
      if (a.type === 'attack' || a.type === 'end') continue;
      const s = this.scoreAction(g, p, a);
      if (s > bestScore) { bestScore = s; best = a; }
    }
    if (best) return best;
    if (attacks.length) return this.pickAttack(g, p, attacks);
    return { type: 'end' };
  }

  easyAction(g, p, actions) {
    const nonEnd = actions.filter(a => a.type !== 'end' && a.type !== 'attack' && a.type !== 'retreat' && a.type !== 'discardFossil' && !(a.type === 'stadium' && getStadiumImpl(cardData(g.stadium.inst.cid)).endsTurn));
    const attacks = actions.filter(a => a.type === 'attack');
    // 簡單AI：隨機但有基本常識
    const useful = nonEnd.filter(a => {
      if (a.type === 'energy') return this.usedPlan.energy === undefined && (a.target === p.active?.id || Math.random() < 0.4);
      if (a.type === 'ability') {
        const s = g.findSlot(p, a.target);
        const n = g.top(s).abilities[0]?.name;
        if (n === '咒詛炸彈' || n === '過度放電') return false;
        return Math.random() < 0.7;
      }
      if (a.type === 'trainer') return Math.random() < 0.6;
      return Math.random() < 0.8;
    });
    if (useful.length && Math.random() < 0.9) {
      const a = rand(useful);
      if (a.type === 'energy') this.usedPlan.energy = true;
      return a;
    }
    if (attacks.length) return attacks[0];
    return { type: 'end' };
  }

  pickAttack(g, p, attacks) {
    const def = g.opp(p).active;
    let best = attacks[0], bs = -Infinity;
    for (const a of attacks) {
      const b = this.bestAttack(g, p, p.active, def);
      if (!b) break;
      const dmg = this.damageVs(g, p, p.active, a.idx, def);
      const ko = def && dmg >= g.hpLeft(def);
      let s = dmg + (ko ? 1000 : 0);
      const txt = g.top(p.active).attacks[a.idx].text || '';
      if (/抽出|加入手牌|放置於備戰區|附於|放置.*傷害指示物/.test(txt)) s += 20;
      if (/全部丟棄/.test(txt) && !ko) s -= 40;
      if (s > bs) { bs = s; best = a; }
    }
    return best;
  }

  scoreAction(g, p, a) {
    const o = g.opp(p);
    switch (a.type) {
      case 'bench': {
        const c = cardData(g.findHand(p, a.uid).cid);
        if (p.bench.length >= 5) return 0;
        // 保留空位
        if (p.bench.length >= 4 && !this.finalForm.get(c.name)?.ex && hasRule(c) === false && c.hp < 100) return 5;
        return 80 + (this.finalForm.get(c.name) !== c ? 10 : 0);
      }
      case 'evolve': {
        const c = cardData(g.findHand(p, a.uid).cid);
        const s = g.findSlot(p, a.target);
        return 90 + c.stage * 5 + (s === p.active ? 5 : 0);
      }
      case 'energy': {
        if (p.energyAttached) return 0;
        const inst = g.findHand(p, a.uid);
        const c = cardData(inst.cid);
        const s = g.findSlot(p, a.target);
        if (c.name === '噴射能量') return s !== p.active && this.readyToAttack(g, p, s) ? 60 : 0;
        const sc = this.energyTargetScore(g, p, s, c);
        if (this.sloppy(0.45)) return 40 + Math.random() * 10;
        return sc > 0 ? 40 + sc / 4 : 0;
      }
      case 'ability': return this.scoreAbility(g, p, a);
      case 'stadium': {
        // 「密阿雷市」等使用後回合結束的競技場：只在無法攻擊時使用
        if (getStadiumImpl(cardData(g.stadium.inst.cid)).endsTurn) return p.bench.length < 4 && !(p.active && g.top(p.active).attacks.some((_, i) => g.canUseAttack(p, p.active, i))) ? 3 : 0;
        return p.bench.length < 5 ? 75 : 0;
      }
      case 'discardFossil': return 0;
      case 'retreat': return this.scoreRetreat(g, p, a);
      case 'trainer': return this.scoreTrainer(g, p, a);
    }
    return 0;
  }

  readyToAttack(g, p, slot) {
    const c = g.top(slot);
    return c.attacks.some(atk => g.canPay(g.attackCost(slot, atk), g.energyUnits(slot)) && (parseInt(atk.dmg) || 0) > 0);
  }

  scoreRetreat(g, p, a) {
    if (!this.smart) return 0;
    if (this.level === 'normal' && this.bestAttack(g, p, p.active, g.opp(p).active)) return 0;
    const act = p.active;
    const to = g.findSlot(p, a.target);
    const def = g.opp(p).active;
    const cur = this.bestAttack(g, p, act, def);
    // 撤退後會失去能量，檢查新的寶可夢
    const tb = this.bestAttack(g, p, to, def);
    const curDmg = cur ? cur.dmg : 0;
    const curKo = cur?.ko;
    if (curKo) return 0;
    const willDie = def && this.threatToActive(g, p) >= g.hpLeft(act);
    if (tb && tb.ko) return 70;
    if (tb && tb.dmg > curDmg + 40 && g.retreatCost(act) <= 1) return 55;
    if (!cur && tb && tb.dmg > 0) return 50;
    if (hasRule(g.top(act)) && willDie && !hasRule(g.top(to)) && g.retreatCost(act) <= 1 && this.hard) return 40;
    if (act.cond.asleep || act.cond.paralyzed || act.cond.confused) return tb ? 45 : 20;
    return 0;
  }
  threatToActive(g, p) {
    const o = g.opp(p);
    if (!o.active || !p.active) return 0;
    const c = g.top(o.active);
    let m = 0;
    c.attacks.forEach((atk, idx) => {
      const d = this.damageVs(g, o, o.active, idx, p.active);
      m = Math.max(m, d);
    });
    return m;
  }

  // 牌庫剩餘張數不足時避免過度抽牌
  drawSafe(p, n) { return p.deck.length - n >= (this.hard ? 8 : 4); }

  scoreAbility(g, p, a) {
    const s = g.findSlot(p, a.target);
    const c = g.top(s);
    const name = c.abilities[0]?.name;
    const o = g.opp(p);
    switch (name) {
      case '精神擁抱': {
        // 只在需要能量攻擊時使用
        const targets = g.slots(p).filter(x => g.top(x).type === 'P' && g.hpLeft(x) > 20);
        const need = targets.find(x => this.missingEnergy(g, x).length > 0 && (x === p.active || this.attackerValue(g, x) > 20) && g.hpLeft(x) > 40);
        return need ? 85 : 0;
      }
      case '咒詛炸彈': {
        const n = c.name === '黑夜魔靈' ? 13 : 5;
        const target = g.slots(o).find(x => g.hpLeft(x) <= n * 10);
        if (!target) return 0;
        const val = prizeValue(g.top(target));
        return val >= 2 || this.hard ? 65 : 30;
      }
      case '過度放電': {
        const energies = p.discard.filter(i => isBasicEnergy(cardData(i.cid))).length;
        const needs = g.slots(p).filter(x => x !== s && g.top(x).type === 'L' && this.missingEnergy(g, x).length > 0);
        return energies >= 2 && needs.length ? 60 : 0;
      }
      case '逃跑抽牌': if (!this.drawSafe(p, 3)) return 0; return p.hand.length <= 5 && p.bench.length >= 2 && s !== p.active ? 70 : p.hand.length <= 3 ? 50 : 0;
      case '無拘無束': return s !== p.active && this.bestAttack(g, p, s, o.active)?.ko ? 70 : 0;
      case '威嚇長嚎': case '大吼叫': return o.bench.some(x => this.koIfActive(g, p, x)) ? 0 : 30;
      case '腎上腺腦力': return 60;
      case '轟鳴引擎': return p.hand.length <= 4 ? 60 : 0;
      case '扭轉乾坤': return this.drawSafe(p, 3) ? 72 : 0;
      case '沖刷': return p.active && this.missingEnergy(g, p.active).length > 0 ? 70 : 0;
      case '大飛翅': return o.hand.length >= 6 ? 65 : 0;
      case '穹天狩獵': return o.hand.length ? 60 : 0;
      default: return p.deck.length > 2 ? 72 : 0; // 抽牌/檢索類特性
    }
  }

  scoreTrainer(g, p, a) {
    const inst = g.findHand(p, a.uid);
    const c = cardData(inst.cid);
    const o = g.opp(p);
    const impl = getTrainerImpl(c);
    const name = c.name.replace(/（.*）|\(.*\)/, '');
    if (c.trainer === 'Tool') {
      const s = g.findSlot(p, a.target);
      if (name === '勇氣護符') return g.top(s).stage === 0 && s === p.active ? 50 : g.top(s).stage === 0 && hasRule(g.top(s)) ? 40 : 0;
      if (name === '岩石胸甲') return g.top(s).type === 'F' ? (s === p.active ? 50 : 35) : 0;
      return s === p.active || this.attackerValue(g, s) > 30 ? 45 : 0;
    }
    if (c.trainer === 'Stadium') {
      if (g.stadium && g.stadium.owner === p.index) return 0;
      return 55;
    }
    const handSize = p.hand.length;
    const canKo = this.canKoNow(g, p, o.active);
    const gustKo = o.bench.map(x => this.koIfActive(g, p, x)).filter(Boolean);
    switch (name) {
      case '老大的指令': case '頂尖捕捉器': case '反擊捕捉器': case '寶可夢捕捉器': {
        if (!this.smart || this.sloppy(0.6)) return 0;
        if (canKo && !this.hard) return 0;
        const best = o.bench.filter(x => this.koIfActive(g, p, x)).sort((x, y) => prizeValue(g.top(y)) - prizeValue(g.top(x)))[0];
        if (!best) return 0;
        if (canKo && prizeValue(g.top(best)) <= prizeValue(g.top(o.active))) return 0;
        return name === '老大的指令' ? 88 : 89;
      }
      case '莉佳的招待': return o.hand.length > 3 && !canKo ? 30 : 0;
      case '巢穴球': return p.bench.length < 5 && p.deck.some(i => isBasicPokemon(cardData(i.cid))) ? 85 : 0;
      case '超級球': return 70;
      case '高級球': {
        if (!this.wantedFromDeck(g, p)) return 0;
        const junk = p.hand.filter(i => i !== inst && this.handValue(g, p, i) < 30).length;
        return junk >= 2 || handSize >= 6 ? 75 : 0;
      }
      case '神奇糖果': return 95;
      case '寶可裝置3.0': return p.supporterPlayed ? 0 : 68;
      case '寶可夢交替': case '急進開關': {
        const def = o.active;
        const cur = this.bestAttack(g, p, p.active, def);
        const better = p.bench.find(x => { const b = this.bestAttack(g, p, x, def); return b && (b.ko || !cur || b.dmg > (cur?.dmg || 0) + 50); });
        if (cur?.ko) return 0;
        return better ? 66 : (p.active.cond.asleep || p.active.cond.paralyzed) && p.bench.length ? 40 : 0;
      }
      case '能量回收': case '超級能量回收': {
        const inHand = p.hand.filter(i => isBasicEnergy(cardData(i.cid))).length;
        if (name === '超級能量回收' && handSize < 5) return 0;
        return inHand === 0 ? 60 : 0;
      }
      case '能量輸送': return p.hand.some(i => isBasicEnergy(cardData(i.cid))) ? 0 : 62;
      case '電氣發生器': return p.bench.some(s => g.top(s).type === 'L' && this.missingEnergy(g, s).length) ? 74 : 0;
      case '能量轉移': return 0;
      case '親送無人機': return 40;
      case '傷藥': return g.slots(p).some(s => s.damage >= 30 && g.hpLeft(s) <= 60) ? 50 : 0;
      case '粉碎之錘': return o.active?.energy.length ? 45 : 0;
      case '夜間擔架': return 55;
      case '秘密箱': return handSize >= 5 ? 50 : 0;
      case '推理組合': return 0;
      case '洛拍棒': return p.supporterPlayed ? 0 : 58;
      case '能量貼紙': return p.bench.some(b => this.missingEnergy(g, b).length) ? 45 : 0;
    }
    if (c.trainer === 'Supporter') {
      if (this.level === 'normal' && Math.random() < 0.1) return 0;
      const draws = { 博士的研究: 7, 丹瑜: 5, 妮莫: 3, 裁判: 4, 短褲小子: 5, 凰檗: 3, 黑連: 3, 艾莉絲的鬥志: 4, 滑稽演員: 5 }[name];
      if (draws && !this.drawSafe(p, draws - (['裁判', '短褲小子'].includes(name) ? handSize : 0))) return 0;
      switch (name) {
        case '博士的研究': return handSize <= 4 ? 70 : handSize <= 6 ? 50 : 20;
        case '丹瑜': return handSize <= 3 ? 68 : 0;
        case '妮莫': case '黑連': return 62;
        case '艾莉絲的鬥志': return handSize <= 4 ? 64 : 0;
        case '滑稽演員': return handSize <= 3 ? 55 : 0;
        case '裁判': return handSize <= 3 ? 69 : (o.hand.length >= 6 && handSize <= 5 ? 60 : 0);
        case '短褲小子': return handSize <= 3 ? 64 : 0;
        case '奇樹': return p.prizes.length >= 5 && handSize <= 3 ? 55 : (o.prizes.length <= 2 && this.hard ? 67 : 0);
        case '凰檗': return handSize <= 3 ? 60 : 0;
        case '吉尼亞': return this.wantedEvolutions(g, p) ? 66 : 0;
        case '派帕': return 45;
        case '席藍': return p.deck.some(i => cardData(i.cid).ex) ? 55 : 0;
        case '薩瓦羅': return g.slots(p).some(s => s.damage >= 60) ? 55 : 0;
        case '希特隆的機智': return g.slots(p).filter(s => s.damage >= 60 && g.top(s).type === 'L').length ? 55 : 0;
        case '阿蜜的目光': return 20;
        case '天星隊手下': return o.active?.energy.length && this.hard ? 50 : 0;
      }
      return impl.play ? 30 : 0;
    }
    return impl.play ? 30 : 0;
  }
  wantedFromDeck(g, p) {
    return p.deck.some(i => {
      const c = cardData(i.cid);
      return isPokemon(c) && (c.stage > 0 ? g.slots(p).some(s => g.top(s).name === c.from) : p.bench.length < 4);
    });
  }
  wantedEvolutions(g, p) {
    return p.deck.some(i => { const c = cardData(i.cid); return c.cat === 'P' && c.stage > 0 && g.slots(p).some(s => g.top(s).name === c.from || this.finalForm.get(g.top(s).name)?.name === c.name); });
  }

  // ================= 各種選擇 =================
  async choose(g, req) {
    const p = g.players[req.player];
    const o = g.opp(p);
    const easy = this.level === 'easy';
    switch (req.kind) {
      case 'yesno':
        if (req.purpose === 'discardStadium') return req.owner !== p.index;
        if (req.purpose === 'forceSwitch') return !this.canKoNow(g, p, o.active);
        return true;
      case 'option': {
        if (req.purpose === 'disableAttack' && o.active) {
          const c = g.top(o.active);
          let best = 0, bd = -1;
          c.attacks.forEach((a, i) => { const d = parseInt(a.dmg) || 0; if (d > bd) { bd = d; best = i; } });
          return best;
        }
        return 0;
      }
      case 'distribute': return this.distribute(g, p, req);
      case 'slots': {
        const ranked = this.rankSlots(g, p, req.slots, req.purpose);
        return ranked.slice(0, Math.max(req.min, Math.min(req.max, ranked.length)));
      }
      case 'slot': {
        if (!req.slots.length) return null;
        if (easy && !['promote', 'switchIn'].includes(req.purpose) && Math.random() < 0.5) return rand(req.slots);
        if (this.sloppy(0.4)) return rand(req.slots);
        const ranked = this.rankSlots(g, p, req.slots, req.purpose, req);
        if (req.min === 0 && ['moveEnergyFrom', 'moveEnergyTo'].includes(req.purpose)) return null;
        return ranked[0];
      }
      case 'cards': return this.chooseCards(g, p, req);
    }
    return null;
  }

  rankSlots(g, p, slots, purpose, req = {}) {
    const o = g.opp(p);
    const score = s => {
      const mine = g.ownerOf(s) === p;
      const c = g.top(s);
      switch (purpose) {
        case 'promote': case 'switchIn': {
          const b = this.bestAttack(g, p, s, o.active);
          let v = (b ? 100 + b.dmg + (b.ko ? 500 : 0) : 0) + g.hpLeft(s) / 10;
          if (!b) v -= this.missingEnergy(g, s, c).length * 10;
          // 保護重要的寶可夢ex：未能攻擊時優先派出低價值的寶可夢
          if (!b && hasRule(c)) v -= 40;
          return v;
        }
        case 'gust': {
          const ko = this.koIfActive(g, p, s);
          if (ko) return 1000 + prizeValue(c) * 100;
          // 拉出無法撤退/沒有能量的寶可夢拖延
          return (s.energy.length === 0 ? 50 : 0) + g.retreatCost(s) * 20 - g.hpLeft(s) / 10;
        }
        case 'benchDamage': case 'snipe': case 'counterTarget': {
          const amt = (req.counters || 0) * 10;
          const left = g.hpLeft(s);
          if (amt && left <= amt) return 1000 + prizeValue(c) * 100;
          return prizeValue(c) * 30 - left / 10 + (s.energy.length * 5);
        }
        case 'heal': case 'healMost': return s.damage;
        case 'attachTarget': {
          const e = req.energy ? cardData(req.energy) : { provides: 'C' };
          return this.energyTargetScore(g, p, s, e);
        }
        case 'psychicEmbrace': {
          const miss = this.missingEnergy(g, s).length;
          return (s === p.active ? 50 : 0) + miss * 10 + g.hpLeft(s) / 20 + this.attackerValue(g, s);
        }
        case 'rareCandyTarget': return s === p.active ? 10 : 5;
        case 'discardOppEnergySlot': return s === o.active ? 10 : s.energy.length;
        default: return mine ? g.hpLeft(s) : -g.hpLeft(s);
      }
    };
    return [...slots].sort((a, b) => score(b) - score(a));
  }

  distribute(g, p, req) {
    const counts = req.slots.map(() => 0);
    let left = req.total;
    // 先找能擊倒的，依獎賞價值排序
    const order = req.slots.map((s, i) => ({ s, i, need: Math.ceil(g.hpLeft(s) / 10), val: prizeValue(g.top(s)) }))
      .sort((a, b) => (b.val / b.need) - (a.val / a.need));
    for (const x of order) {
      if (x.need <= left) { counts[x.i] = x.need; left -= x.need; }
    }
    if (left > 0) {
      const target = order.find(x => counts[x.i] === 0) || order[0];
      counts[target.i] += left;
    }
    return counts;
  }

  cardScore(g, p, inst, purpose) {
    const c = cardData(inst.cid);
    const inPlay = g.slots(p).map(s => g.top(s).name);
    switch (purpose) {
      case 'setupActive': {
        let v = c.hp;
        if (hasRule(c)) v -= 60;
        if (c.abilities.length) v -= 50; // 支援型寶可夢留在備戰區
        const cheap = c.attacks.some(a => a.cost.length <= 1);
        if (cheap) v += 30;
        v -= c.retreat * 10;
        return v;
      }
      case 'setupBench': case 'benchSearch': case 'reviveBench': {
        let v = 50;
        const ff = this.finalForm.get(c.name);
        if (ff && ff !== c) v += 30 + (ff.ex ? 20 : 0);
        if (c.ex) v += 20;
        const same = inPlay.filter(n => n === c.name).length;
        v -= same * 25;
        if (c.abilities.length) v += 15;
        return v;
      }
      case 'searchPokemon': case 'searchAny': case 'searchEvolution': case 'rareCandyCard': case 'recoverAny': {
        if (!isPokemon(c)) {
          if (purpose === 'searchAny') {
            if (c.trainer === 'Supporter' && !p.supporterPlayed) return 60;
            if (c.name === '神奇糖果') return 55;
            if (isBasicEnergy(c)) return 30;
            return 20;
          }
          return isBasicEnergy(c) ? 25 : 0;
        }
        let v = 20;
        if (c.stage > 0 && inPlay.includes(c.from)) v += 70 + c.stage * 10;
        if (c.stage === 2 && p.hand.some(i => cardData(i.cid).name === '神奇糖果') && g.slots(p).some(s => this.finalForm.get(g.top(s).name)?.name === c.name)) v += 80;
        if (c.stage === 0 && !inPlay.includes(c.name)) v += 40;
        if (c.ex) v += 15;
        const inHand = p.hand.filter(i => cardData(i.cid).name === c.name).length;
        v -= inHand * 30;
        return v;
      }
      case 'searchEnergy': case 'recoverEnergy': case 'discardEnergyToAttach': {
        const need = g.slots(p).reduce((n, s) => n + this.missingEnergy(g, s).filter(t => t === c.provides).length, 0);
        return need * 10 + 5;
      }
      case 'discardFromHand': case 'retreatDiscard': case 'discardOwnEnergy':
        if (purpose === 'retreatDiscard' || purpose === 'discardOwnEnergy') return 0;
        return -this.handValue(g, p, inst);
      case 'discardOppEnergy': return isBasicEnergy(c) ? 1 : 5;
      case 'bossBasic': return -c.hp;
      case 'keepTop3': return 0;
      case 'ragingBolt': return 0;
      default: return Math.random();
    }
  }

  chooseCards(g, p, req) {
    let { cards, min, max, purpose } = req;
    if (!cards.length) return [];
    if (purpose === 'ragingBolt') {
      const o = g.opp(p);
      const need = o.active ? Math.ceil(g.hpLeft(o.active) / 70) : 1;
      return cards.slice(0, Math.min(cards.length, Math.max(1, need)));
    }
    if (purpose === 'setupBench') {
      const ranked = [...cards].sort((a, b) => this.cardScore(g, p, b, purpose) - this.cardScore(g, p, a, purpose));
      // 避免把所有寶可夢ex都擺出
      return ranked.slice(0, max);
    }
    if (purpose === 'optionalDiscard') return [];
    if (purpose === 'retreatDiscard' || purpose === 'discardOwnEnergy') {
      // 丟棄新戰鬥寶可夢不需要的能量
      return cards.slice(0, min || 1);
    }
    const scored = cards.map(c => ({ c, s: this.cardScore(g, p, c, purpose) })).sort((a, b) => b.s - a.s);
    let n = Math.max(min, Math.min(max, scored.length));
    if (purpose === 'moveEnergyAll') n = max;
    if (min === 0 && ['searchPokemon', 'searchAny', 'searchEvolution', 'benchSearch', 'searchEnergy', 'recoverEnergy', 'discardEnergyToAttach', 'searchItem', 'searchTool', 'searchSupporter', 'searchStadium', 'recoverItem', 'recoverAny'].includes(purpose)) {
      n = Math.min(max, scored.length);
    }
    if (this.level === 'easy' && Math.random() < 0.3) this.shuffleArr(scored);
    return scored.slice(0, n).map(x => x.c);
  }
  shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
}
