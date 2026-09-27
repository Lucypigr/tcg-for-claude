// 對戰畫面與玩家操作
import { Game } from '../engine/game.js';
import { AIController } from '../ai/ai.js';
import { cardData, TYPE_NAMES, isPokemon } from '../engine/cards.js';
import { getStadiumImpl } from '../engine/effects.js';
import { deckToList } from '../data/decks.js';
import { cardHTML, miniCardHTML, slotHTML, energyIcon, esc } from './cardview.js';
import { showModal, toast } from './modal.js';
import { FX } from './fx.js';
import { Coach, TUTORIAL_STEPS } from './tutorial.js';

const LEVEL_NAME = { easy: '簡單', normal: '普通', hard: '困難' };

// ================= 玩家控制器 =================
class HumanController {
  constructor(view) { this.view = view; this.pending = null; }
  chooseAction(g, actions) {
    return new Promise(resolve => {
      this.pending = { actions, resolve };
      this.view.mode = null;
      this.view.render(true);
    });
  }
  act(a) {
    if (!this.pending) return;
    const { resolve } = this.pending;
    this.pending = null;
    this.view.mode = null;
    resolve(a);
  }
  choose(g, req) { return this.view.askChoice(req); }
}

// ================= 對戰畫面 =================
export class BattleView {
  constructor(root, { playerDeck, aiDeck, level, playerName = '你', onEnd, tutorial = null }) {
    this.tutorial = tutorial;
    this.playerList = deckToList(playerDeck.cards);
    this.root = root;
    this.level = level;
    this.aiDeck = aiDeck;
    this.playerDeck = playerDeck;
    this.onEnd = onEnd;
    this.human = new HumanController(this);
    const l0 = deckToList(playerDeck.cards);
    const l1 = deckToList(aiDeck.cards);
    this.ai = new AIController(level, l1);
    this.ai.delay = 700;
    // AI 等待特效播放完畢再行動
    this.fxBusy = 0;
    this.ai.wait = async () => {
      const t = Math.max(this.ai.delay, this.fxBusy - performance.now() + 250);
      await new Promise(r => setTimeout(r, t));
    };
    this.game = new Game({
      decks: [l0, l1],
      names: [playerName, aiDeck.trainer],
      controllers: [this.human, this.ai],
      seed: Math.floor(Math.random() * 2 ** 31),
      onEvent: e => this.onEvent(e),
      firstPlayer: tutorial?.firstPlayer ?? null,
      stacks: tutorial?.stacks ?? null,
    });
    this.mode = null; // { kind: 'target', actions, label }
    this.fx = [];
    this.renderQueued = false;
    this.buildLayout();
  }

  async start() {
    await this.introModal();
    if (this.tutorial) this.coach = new Coach(this, TUTORIAL_STEPS);
    const winner = await this.game.run();
    this.render(true);
    return winner;
  }

  introModal() {
    return new Promise(resolve => {
      const d = this.aiDeck;
      showModal(`<div class="intro">
        <div class="vs-title">對戰開始</div>
        <div class="vs-row">
          <div class="vs-side"><div class="vs-label">你的牌組</div><div class="vs-deck">${esc(this.playerDeck.name)}</div></div>
          <div class="vs-mid">VS</div>
          <div class="vs-side"><div class="vs-label">${esc(d.trainer)}（${LEVEL_NAME[this.level]}）</div><div class="vs-deck">${esc(d.name)}</div></div>
        </div>
        <div class="vs-cover">${cardHTML(d.cover)}</div>
        <p class="vs-desc">${esc(d.desc)}</p>
      </div>`, { buttons: [{ label: '開始！', primary: true, value: true }], dismissable: false }).then(resolve);
    });
  }

  buildLayout() {
    this.root.innerHTML = `<div class="battle">
      <div class="board">
        <div class="side opp" id="opp-side"></div>
        <div class="midline" id="midline"></div>
        <div class="side me" id="my-side"></div>
        <div class="hand-wrap"><div class="hand" id="hand"></div></div>
        <div class="action-bar" id="action-bar"></div>
      </div>
      <aside class="log-panel" id="log-panel">
        <div class="log-head"><span>對戰紀錄</span><button class="btn tiny" id="log-toggle">收合</button></div>
        <div class="log" id="log"></div>
      </aside>
    </div>`;
    this.root.querySelector('#log-toggle').onclick = () => this.root.querySelector('#log-panel').classList.toggle('collapsed');
    this.root.addEventListener('click', e => this.onClick(e));
  }

  onEvent(e) {
    this.coach?.onEvent(e);
    if (e.type === 'log') {
      const log = this.root.querySelector('#log');
      if (log) {
        const div = document.createElement('div');
        div.className = `log-line ${e.cls || ''}`;
        div.textContent = e.msg;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
      }
      return;
    }
    if (['coin', 'damage', 'ko', 'attack', 'turn', 'trainer', 'energy', 'evolve', 'ability', 'prize'].includes(e.type)) this.fx.push(e);
    if (e.type === 'gameover') { this.render(true); this.gameOver(e.winner, e.reason); return; }
    this.render();
  }

  render(now = false) {
    if (now) { this.doRender(); return; }
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => { this.renderQueued = false; this.doRender(); });
  }

  actionsFor(pred) { return this.human.pending ? this.human.pending.actions.filter(pred) : []; }

  doRender() {
    this.snapshotRects();
    const g = this.game;
    const me = g.players[0], opp = g.players[1];
    const targetIds = this.mode?.kind === 'target' ? new Set(this.mode.actions.map(a => a.target)) : new Set();
    const pileHTML = (p, mine) => `<div class="piles">
      <div class="pile deck" title="牌庫">🂠<span>${p.deck.length}</span><small>牌庫</small></div>
      <div class="pile discard" data-discard="${p.index}" title="棄牌區">🗑<span>${p.discard.length}</span><small>棄牌</small></div>
      <div class="pile prizes" title="獎賞卡"><div class="prize-cards">${Array.from({ length: 6 }, (_, i) => `<i class="${i < p.prizes.length ? 'on' : ''}"></i>`).join('')}</div><small>獎賞卡 ${p.prizes.length}</small></div>
      ${mine ? '' : `<div class="pile hand-count" title="手牌">✋<span>${p.hand.length}</span><small>手牌</small></div>`}
    </div>`;
    const benchHTML = (p, owner) => {
      let h = '';
      for (let i = 0; i < 5; i++) h += p.bench[i] ? slotHTML(g, p.bench[i], { owner, highlight: owner === 0 && targetIds.has(p.bench[i].id) || (this.choiceSlots?.has(p.bench[i].id)) }) : '<div class="slot empty"></div>';
      return `<div class="bench">${h}</div>`;
    };
    const activeHTML = (p, owner) => slotHTML(g, p.active, { active: true, owner, highlight: p.active && (owner === 0 && targetIds.has(p.active.id) || this.choiceSlots?.has(p.active.id)) });

    this.root.querySelector('#opp-side').innerHTML = `
      <div class="player-tag opp-tag">${esc(opp.name)} <small>${esc(this.aiDeck.name)}・${LEVEL_NAME[this.level]}</small></div>
      ${pileHTML(opp, false)}${benchHTML(opp, 1)}<div class="active-row">${activeHTML(opp, 1)}</div>`;
    this.root.querySelector('#my-side').innerHTML = `
      <div class="active-row">${activeHTML(me, 0)}</div>${benchHTML(me, 0)}${pileHTML(me, true)}
      <div class="player-tag me-tag">${esc(me.name)} <small>${esc(this.playerDeck.name)}</small></div>`;

    const st = g.stadium ? cardData(g.stadium.inst.cid) : null;
    const turnTxt = g.winner !== null ? '對戰結束' : g.turn === 0 ? '準備中' : g.current === 0 ? `第${g.turn}回合・你的回合` : `第${g.turn}回合・對手的回合`;
    const flags = g.current === 0 && g.turn > 0 ? `<span class="flag ${me.energyAttached ? 'used' : ''}">能量</span><span class="flag ${me.supporterPlayed ? 'used' : ''}">支援者</span><span class="flag ${me.retreated ? 'used' : ''}">撤退</span>` : '';
    this.root.querySelector('#midline').innerHTML = `<div class="turn-info">${turnTxt}</div><div class="flags">${flags}</div>
      ${st ? `<div class="stadium" data-cid="${st.id}">🏟 ${esc(st.name)}</div>` : ''}`;

    // 手牌
    const playableUids = new Set(this.actionsFor(a => a.uid).map(a => a.uid));
    this.root.querySelector('#hand').innerHTML = me.hand.map(i => miniCardHTML(cardData(i.cid), { uid: i.uid, playable: playableUids.has(i.uid) })).join('') || '<div class="hand-empty">沒有手牌</div>';

    // 行動按鈕
    const bar = this.root.querySelector('#action-bar');
    if (this.mode?.kind === 'target') {
      bar.innerHTML = `<div class="hint">${esc(this.mode.label)}</div><button class="btn" data-act="cancel">取消</button>`;
    } else if (this.human.pending) {
      const attacks = this.actionsFor(a => a.type === 'attack');
      const stadium = this.actionsFor(a => a.type === 'stadium');
      bar.innerHTML = `<div class="hint">點選手牌或寶可夢進行操作</div>
        ${stadium.length ? '<button class="btn" data-act="stadium">使用競技場</button>' : ''}
        <button class="btn hint-btn" data-act="hint">💡 提示</button>
        ${attacks.length ? '<button class="btn attack-btn" data-act="attack-menu">⚔ 攻擊</button>' : ''}
        <button class="btn primary" data-act="end">結束回合</button>
        <button class="btn danger tiny" data-act="forfeit">投降</button>`;
    } else if (g.winner === null) {
      bar.innerHTML = `<div class="hint thinking">${g.current === 1 ? '對手思考中…' : '請選擇…'}</div>`;
    } else {
      bar.innerHTML = '';
    }

    // 特效
    this.playFx();
    if (this.hint) this.applyHint();
  }

  snapshotRects() {
    this.prevRects = new Map();
    for (const el of this.root.querySelectorAll('.slot[data-slot]')) this.prevRects.set(+el.dataset.slot, el.getBoundingClientRect());
  }
  rectOf(id) {
    const el = this.root.querySelector(`.slot[data-slot="${id}"]`);
    return el ? el.getBoundingClientRect() : this.prevRects?.get(id);
  }
  playFx() {
    const list = this.fx.splice(0);
    if (!list.length) return;
    if (!this.fxr) this.fxr = new FX();
    const f = this.fxr;
    let hit = 0, dmgN = 0, t = 0;
    for (const e of list) {
      switch (e.type) {
        case 'turn': f.turn(e.player === 0, e.player === 0 ? '你的回合' : `${this.game.players[1].name}的回合`); t = Math.max(t, 1300); break;
        case 'attack': hit = f.attack(this.rectOf(e.slot), this.rectOf(e.target), e.ptype, e.name) || 0; t = Math.max(t, hit + 900); break;
        case 'damage': f.damage(this.rectOf(e.slot), e.amount, hit + dmgN++ * 120); t = Math.max(t, hit + 1200); break;
        case 'ko': f.ko(this.rectOf(e.slot), hit + 250); t = Math.max(t, hit + 1650); break;
        case 'coin': f.coin(e.heads); t = Math.max(t, 1300); break;
        case 'trainer': f.cardReveal(e.cid, e.player === 1); t = Math.max(t, 1150); break;
        case 'energy': f.energy(this.rectOf(e.slot), e.etype); t = Math.max(t, 700); break;
        case 'evolve': f.evolve(this.rectOf(e.slot), e.cid); t = Math.max(t, 1000); break;
        case 'ability': f.ability(this.rectOf(e.slot)); t = Math.max(t, 900); break;
        case 'prize': f.prize(e.player === 0, e.n); t = Math.max(t, 1500); break;
      }
    }
    this.fxBusy = Math.max(this.fxBusy, performance.now() + t);
  }

  // ================= 點擊處理 =================
  onClick(e) {
    const g = this.game;
    const actEl = e.target.closest('[data-act]');
    if (actEl) return this.onButton(actEl.dataset.act);
    const slotEl = e.target.closest('.slot[data-slot]');
    if (slotEl) return this.onSlot(+slotEl.dataset.slot, +slotEl.dataset.owner);
    const handEl = e.target.closest('#hand .mini');
    if (handEl) return this.onHand(+handEl.dataset.uid);
    const st = e.target.closest('.stadium');
    if (st) return this.zoom(st.dataset.cid);
    const dis = e.target.closest('[data-discard]');
    if (dis) return this.showDiscard(g.players[+dis.dataset.discard]);
  }

  onButton(act) {
    const h = this.human;
    if (act === 'cancel') { this.mode = null; this.render(true); return; }
    if (!h.pending) return;
    if (act === 'hint') { this.showHint(); return; }
    if (act === 'end') {
      const canAttack = this.actionsFor(a => a.type === 'attack').length;
      if (canAttack) {
        showModal('<p>你還可以攻擊，確定要直接結束回合嗎？</p>', { buttons: [{ label: '取消', value: false }, { label: '結束回合', primary: true, value: true }] })
          .then(v => { if (v) h.act({ type: 'end' }); });
      } else h.act({ type: 'end' });
    } else if (act === 'forfeit') {
      showModal('<p>確定要投降嗎？將視為敗北。</p>', { buttons: [{ label: '取消', value: false }, { label: '投降', danger: true, value: true }] })
        .then(v => { if (v) h.act({ type: 'forfeit' }); });
    } else if (act === 'stadium') {
      const g = this.game;
      if (getStadiumImpl(cardData(g.stadium.inst.cid)).endsTurn) {
        showModal(`<p>使用「${esc(cardData(g.stadium.inst.cid).name)}」的效果後，你的回合會結束。確定要使用嗎？</p>`, { buttons: [{ label: '取消', value: false }, { label: '使用', primary: true, value: true }] })
          .then(v => { if (v) h.act({ type: 'stadium' }); });
      } else h.act({ type: 'stadium' });
    } else if (act === 'attack-menu') {
      this.slotMenu(this.game.players[0].active);
    }
  }

  onHand(uid) {
    const g = this.game;
    const inst = g.players[0].hand.find(i => i.uid === uid);
    if (!inst) return;
    const c = cardData(inst.cid);
    const acts = this.actionsFor(a => a.uid === uid);
    if (!acts.length) return this.zoom(c.id);
    const buttons = [];
    const byType = t => acts.filter(a => a.type === t);
    if (byType('bench').length) buttons.push({ label: '放到備戰區', primary: true, value: () => this.human.act(byType('bench')[0]) });
    if (byType('evolve').length) buttons.push({ label: '進化', primary: true, value: () => this.pickTarget(byType('evolve'), `選擇要進化成${c.name}的寶可夢`) });
    if (byType('energy').length) buttons.push({ label: '附加能量', primary: true, value: () => this.pickTarget(byType('energy'), `選擇要附上${c.name}的寶可夢`) });
    const tr = byType('trainer');
    if (tr.length) {
      if (tr[0].target !== undefined) buttons.push({ label: '附加道具', primary: true, value: () => this.pickTarget(tr, `選擇要附上${c.name}的寶可夢`) });
      else buttons.push({ label: '使用', primary: true, value: () => this.human.act(tr[0]) });
    }
    buttons.push({ label: '取消', value: null });
    showModal(`<div class="zoom">${cardHTML(c)}</div>`, { buttons }).then(fn => { if (typeof fn === 'function') fn(); });
  }

  pickTarget(actions, label) {
    if (actions.length === 1) return this.human.act(actions[0]);
    this.mode = { kind: 'target', actions, label };
    this.render(true);
  }

  onSlot(id, owner) {
    const g = this.game;
    if (this.mode?.kind === 'target' && owner === 0) {
      const a = this.mode.actions.find(x => x.target === id);
      if (a) return this.human.act(a);
    }
    const p = g.players[owner];
    const slot = g.slots(p).find(s => s.id === id);
    if (!slot) return;
    if (owner === 0 && this.human.pending) return this.slotMenu(slot);
    this.slotInfo(slot);
  }

  slotInfo(slot) {
    const g = this.game;
    const c = g.top(slot);
    const extra = [];
    if (slot.cards.length > 1) extra.push(`進化：${slot.cards.map(i => cardData(i.cid).name).join(' → ')}`);
    if (slot.tool) extra.push(`道具：${cardData(slot.tool.cid).name}`);
    extra.push(`能量：${slot.energy.map(e => cardData(e.cid).name).join('、') || '無'}`);
    extra.push(`剩餘HP：${g.hpLeft(slot)} / ${g.maxHp(slot)}`);
    showModal(`<div class="zoom">${cardHTML(c)}</div><div class="slot-extra">${extra.map(x => `<div>${esc(x)}</div>`).join('')}</div>`, { buttons: [{ label: '關閉', value: null }] });
  }

  slotMenu(slot) {
    const g = this.game;
    const me = g.players[0];
    const c = g.top(slot);
    const buttons = [];
    if (slot === me.active) {
      c.attacks.forEach((atk, idx) => {
        const ok = this.actionsFor(a => a.type === 'attack' && a.idx === idx).length > 0;
        buttons.push({ label: `⚔ ${atk.name} ${atk.dmg || ''}`, primary: ok, disabled: !ok, cls: `atk-${idx}`, value: () => this.human.act({ type: 'attack', idx }) });
      });
      const rt = this.actionsFor(a => a.type === 'retreat');
      if (rt.length) buttons.push({ label: `撤退（${g.retreatCost(slot)}能量）`, value: () => this.pickTarget(rt, '選擇要換上場的備戰寶可夢') });
    }
    const ab = this.actionsFor(a => a.type === 'ability' && a.target === slot.id);
    if (ab.length) buttons.push({ label: `✦ 特性：${c.abilities[0].name}`, primary: true, value: () => this.human.act(ab[0]) });
    const fossil = this.actionsFor(a => a.type === 'discardFossil' && a.target === slot.id);
    if (fossil.length) buttons.push({ label: '🗑 將化石丟棄', danger: true, value: () => this.human.act(fossil[0]) });
    buttons.push({ label: '關閉', value: null });
    const extra = [`剩餘HP：${g.hpLeft(slot)} / ${g.maxHp(slot)}`, `能量：${slot.energy.map(e => cardData(e.cid).name).join('、') || '無'}`];
    if (slot.tool) extra.push(`道具：${cardData(slot.tool.cid).name}`);
    if (g.turn === 1 && slot === me.active) extra.push('先攻玩家的第1回合不能攻擊');
    showModal(`<div class="zoom">${cardHTML(c)}</div><div class="slot-extra">${extra.map(x => `<div>${esc(x)}</div>`).join('')}</div>`, { buttons }).then(fn => { if (typeof fn === 'function') fn(); });
  }

  zoom(cid) {
    showModal(`<div class="zoom">${cardHTML(cid)}</div>`, { buttons: [{ label: '關閉', value: null }] });
  }
  showDiscard(p) {
    const list = p.discard.map(i => cardHTML(i.cid, { small: true })).join('') || '<p>棄牌區沒有卡片</p>';
    showModal(`<h3>${esc(p.name)}的棄牌區（${p.discard.length}張）</h3><div class="card-grid">${list}</div>`, { buttons: [{ label: '關閉', value: null }], wide: true });
  }

  // ================= 選擇對話框 =================
  async askChoice(req) {
    const g = this.game;
    this.render(true);
    switch (req.kind) {
      case 'yesno':
        return showModal(`<p class="q">${esc(req.title)}</p>`, { buttons: [{ label: '否', value: false }, { label: '是', primary: true, value: true }], dismissable: false });
      case 'option':
        return showModal(`<p class="q">${esc(req.title)}</p>`, { buttons: req.options.map((o, i) => ({ label: o, primary: true, value: i })), dismissable: false });
      case 'cards': return this.chooseCardsModal(req);
      case 'slot': case 'slots': return this.chooseSlotsModal(req);
      case 'distribute': return this.distributeModal(req);
    }
    return null;
  }

  chooseCardsModal(req) {
    return new Promise(resolve => {
      const { cards, min, max } = req;
      const selected = new Set();
      const candidateUids = new Set(cards.map(c => c.uid));
      const looked = req.looked ? req.looked.filter(i => !candidateUids.has(i.uid)) : [];
      const html = () => `<h3>${esc(req.title)}</h3>
        <p class="sub">${min === max ? `請選擇${max}張` : `可選擇${min}～${max}張`}（已選${selected.size}張）${req.reveal !== undefined ? `・從牌庫中搜尋` : ''}</p>
        <div class="card-grid choose">${cards.map(i => `<div class="pick ${selected.has(i.uid) ? 'sel' : ''}" data-pick="${i.uid}">${cardHTML(i.cid, { small: true })}</div>`).join('')}
        ${looked.map(i => `<div class="pick disabled">${cardHTML(i.cid, { small: true, dim: true })}</div>`).join('')}</div>
        ${!cards.length ? '<p>沒有可選擇的卡片</p>' : ''}`;
      const m = showModal(html(), {
        wide: true, dismissable: false,
        buttons: [{ label: '確定', primary: true, value: 'ok', id: 'ok' }],
        onButton: v => {
          if (selected.size < Math.min(min, cards.length)) { toast(`至少要選擇${min}張`, 'bad'); return false; }
          resolve(cards.filter(i => selected.has(i.uid)));
          return true;
        },
        onClick: (e, body) => {
          const p = e.target.closest('[data-pick]');
          if (!p) return;
          const uid = +p.dataset.pick;
          if (selected.has(uid)) selected.delete(uid);
          else {
            if (max === 1) selected.clear();
            if (selected.size < max) selected.add(uid);
          }
          body.innerHTML = html();
        },
      });
      m.catch?.(() => {});
    });
  }

  chooseSlotsModal(req) {
    const g = this.game;
    return new Promise(resolve => {
      const multi = req.kind === 'slots';
      const { slots } = req;
      const min = req.min ?? 1;
      const max = multi ? req.max : 1;
      const selected = new Set();
      const ownerOf = s => (g.players[0].active === s || g.players[0].bench.includes(s) ? 0 : 1);
      const html = () => `<h3>${esc(req.title)}</h3>${multi ? `<p class="sub">可選擇${min}～${max}隻（已選${selected.size}隻）</p>` : ''}
        <div class="slot-grid">${slots.map(s => `<div class="pick ${selected.has(s.id) ? 'sel' : ''}" data-pick="${s.id}"><div class="pick-owner">${ownerOf(s) === 0 ? '我方' : '對手'}${g.isActive(s) ? '・戰鬥場' : '・備戰區'}</div>${slotHTML(g, s, { owner: ownerOf(s) })}</div>`).join('')}</div>`;
      const buttons = [];
      if (!multi && min === 0) buttons.push({ label: '不選擇', value: 'skip' });
      if (multi) buttons.push({ label: '確定', primary: true, value: 'ok' });
      showModal(html(), {
        wide: true, dismissable: false, buttons,
        onButton: v => {
          if (v === 'skip') { resolve(null); return true; }
          if (selected.size < Math.min(min, slots.length)) { toast(`至少要選擇${min}隻`, 'bad'); return false; }
          resolve(slots.filter(s => selected.has(s.id)));
          return true;
        },
        onClick: (e, body, close) => {
          const p = e.target.closest('[data-pick]');
          if (!p) return;
          const id = +p.dataset.pick;
          if (!multi) { close(); resolve(slots.find(s => s.id === id)); return; }
          if (selected.has(id)) selected.delete(id); else if (selected.size < max) selected.add(id);
          body.innerHTML = html();
        },
      });
    });
  }

  distributeModal(req) {
    const g = this.game;
    return new Promise(resolve => {
      const counts = req.slots.map(() => 0);
      const left = () => req.total - counts.reduce((a, b) => a + b, 0);
      const html = () => `<h3>${esc(req.title)}</h3><p class="sub">剩餘 <b>${left()}</b> 個傷害指示物</p>
        <div class="slot-grid">${req.slots.map((s, i) => `<div class="dist">${slotHTML(g, s, { owner: 1 })}
          <div class="dist-ctl"><button class="btn tiny" data-dist="${i}" data-d="-1">－</button><b>${counts[i]}</b><button class="btn tiny" data-dist="${i}" data-d="1">＋</button></div>
          <div class="dist-after">放置後剩餘HP：${Math.max(0, g.hpLeft(s) - counts[i] * 10)}</div></div>`).join('')}</div>`;
      showModal(html(), {
        wide: true, dismissable: false,
        buttons: [{ label: '確定', primary: true, value: 'ok' }],
        onButton: () => {
          if (left() > 0) { toast('請放置全部的傷害指示物', 'bad'); return false; }
          resolve(counts);
          return true;
        },
        onClick: (e, body) => {
          const b = e.target.closest('[data-dist]');
          if (!b) return;
          const i = +b.dataset.dist, d = +b.dataset.d;
          if (d > 0 && left() <= 0) return;
          counts[i] = Math.max(0, counts[i] + d);
          body.innerHTML = html();
        },
      });
    });
  }

  // 💡 提示：用困難AI評估目前最好的行動
  async showHint() {
    const g = this.game;
    const me = g.players[0];
    const acts = this.actionsFor(() => true);
    if (!acts.length) return;
    const adv = new AIController('hard', this.playerList);
    adv.delay = 0;
    const a = await adv.chooseAction(g, acts);
    const handName = uid => { const i = me.hand.find(x => x.uid === uid); return i ? cardData(i.cid).name : ''; };
    const slotName = id => { const s = g.slots(me).find(x => x.id === id); return s ? g.top(s).name : ''; };
    const tips = {
      bench: () => `把「${handName(a.uid)}」放到備戰區。基礎寶可夢多放幾隻，被擊倒時才有候補。`,
      evolve: () => `讓「${slotName(a.target)}」進化成「${handName(a.uid)}」。`,
      energy: () => `把「${handName(a.uid)}」附加到「${slotName(a.target)}」身上（每回合1次）。`,
      trainer: () => `使用「${handName(a.uid)}」${a.target ? `，附在「${slotName(a.target)}」身上` : ''}。`,
      ability: () => `使用「${slotName(a.target)}」的特性「${g.top(g.slots(me).find(x => x.id === a.target)).abilities[0]?.name}」。`,
      retreat: () => `讓戰鬥寶可夢撤退，換「${slotName(a.target)}」上場。`,
      stadium: () => '使用場上競技場卡的效果。',
      discardFossil: () => `把場上的「${slotName(a.target)}」丟棄。`,
      attack: () => `用「${g.top(me.active).attacks[a.idx].name}」攻擊！攻擊後回合會結束。`,
      end: () => '目前沒有更好的行動了，可以結束回合。',
    };
    const text = (tips[a.type] || tips.end)();
    const sel = a.uid ? `#hand .mini[data-uid="${a.uid}"]` : a.type === 'attack' ? '[data-act=attack-menu]' : a.type === 'end' ? '[data-act=end]' : a.type === 'stadium' ? '[data-act=stadium]' : a.target ? `.slot[data-slot="${a.target}"]` : null;
    this.hint = { sels: [sel, a.target && a.uid ? `.slot[data-slot="${a.target}"]` : null].filter(Boolean), until: Date.now() + 5000 };
    this.applyHint();
    toast(`💡 ${text}`, 'hint', 4500);
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { this.hint = null; this.applyHint(); }, 5000);
  }
  applyHint() {
    document.querySelectorAll('.hint-hl').forEach(el => el.classList.remove('hint-hl'));
    if (this.hint && Date.now() < this.hint.until) for (const sel of this.hint.sels) document.querySelectorAll(sel).forEach(el => el.classList.add('hint-hl'));
  }

  gameOver(winner, reason) {
    this.coach?.destroy();
    const won = winner === 0;
    setTimeout(() => this.fxr?.destroy(), 3000);
    this.onEnd?.(won, reason);
  }
}
