// 主程式：畫面切換、商店、收藏、牌組編輯
import { CARDS } from './data/cards.js';
import { AI_DECKS } from './data/decks.js';
import { CARD_MAP, validateDeck, isBasicEnergy, isPokemon, TYPE_NAMES, ruleName } from './engine/cards.js';
import * as store from './store.js';
import { PACKS, openPack, RARITY_LABEL, RARITY_RANK } from './shop.js';
import { cardHTML, miniCardHTML, esc, energyIcon, getShowImages, setShowImages } from './ui/cardview.js';
import { showModal, toast } from './ui/modal.js';
import { BattleView } from './ui/battle.js';
import { showRulesSlides, TUTORIAL_BATTLE } from './ui/tutorial.js';

// 商店卡包封面卡
const PACK_COVER = { basic: 'SVC-001', meta: 'SV6-081', sv8: 'SV8-033', sv8a: 'SV8a-136', m3: 'M3-046', ex: 'SV1S-028' };

const app = document.getElementById('app');
const LEVELS = [
  { id: 'easy', name: '簡單', desc: 'AI會隨機行動，適合熟悉規則。' },
  { id: 'normal', name: '普通', desc: 'AI會正常組織攻勢，偶爾判斷失誤。' },
  { id: 'hard', name: '困難', desc: 'AI會計算擊倒、精準使用老大的指令並保護寶可夢ex。' },
];

function header(active = '') {
  const s = store.load();
  const nav = [['home', '主選單'], ['setup', '對戰'], ['decks', '牌組'], ['shop', '商店'], ['collection', '收藏'], ['tutorial', '教學'], ['rules', '規則']];
  return `<header class="top">
    <div class="logo" data-go="home"><span class="ball"></span>寶可夢卡牌 <b>AI對戰</b></div>
    <nav>${nav.map(([id, n]) => `<button class="nav ${active === id ? 'on' : ''}" data-go="${id}">${n}</button>`).join('')}</nav>
    <div class="coins" title="金幣">🪙 <b>${s.coins}</b></div>
  </header>`;
}

function mount(html, active) {
  app.innerHTML = header(active) + `<main class="screen">${html}</main>`;
  window.scrollTo(0, 0);
}

app.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go && !app.querySelector('.battle')) route(go.dataset.go);
});

export function route(name, arg) {
  ({ home, setup, decks, shop, collection, rules, tutorial, edit: editDeck })[name]?.(arg);
}

// ================= 主選單 =================
function home() {
  const s = store.load();
  const total = CARDS.filter(c => !isBasicEnergy(c)).length;
  const have = CARDS.filter(c => !isBasicEnergy(c) && s.collection[c.id]).length;
  const st = s.stats;
  mount(`<section class="hero">
      <div class="hero-cards">${['SVC-001', 'SV6-081', 'M1L-029'].map(id => cardHTML(id)).join('')}</div>
      <div class="hero-text">
        <h1>寶可夢集換式卡牌<br><span>AI 挑戰賽</span></h1>
        <p>用「ex初階牌組 皮卡丘 (SVQP)」等繁體中文版卡片組成牌組，挑戰使用環境主流牌組的AI訓練家！打贏對戰賺取金幣，到商店購買卡包擴充收藏，自由組出你的最強牌組。</p>
        <div class="hero-btns">
          <button class="btn big primary" data-go="setup">⚔ 開始對戰</button>
          <button class="btn big" data-go="shop">🛒 商店</button>
          <button class="btn big" data-go="decks">🃏 牌組編輯</button>
          <button class="btn big tutorial-btn" data-go="tutorial">📖 新手教學${s.tutorialDone ? '' : ' <span class="tag new-tag">NEW</span>'}</button>
        </div>
      </div>
    </section>
    <section class="stats-row">
      <div class="stat"><small>金幣</small><b>🪙 ${s.coins}</b></div>
      <div class="stat"><small>收藏進度</small><b>${have} / ${total}</b></div>
      ${LEVELS.map(l => `<div class="stat"><small>${l.name} 勝/敗</small><b>${st[l.id][0]} / ${st[l.id][1]}</b></div>`).join('')}
      <div class="stat"><small>已開卡包</small><b>${s.packsOpened}</b></div>
    </section>`, 'home');
  if (!s.seenIntro) {
    s.seenIntro = true;
    store.save();
    showModal(`<h2>歡迎來到寶可夢卡牌 AI 對戰！</h2>
      <ul class="intro-list">
        <li>你擁有兩套起始牌組：<b>皮卡丘ex 初階牌組</b>與<b>噴火龍ex 初階牌組</b>，兩套牌的卡片也已加入你的收藏。</li>
        <li>AI 會從 <b>${AI_DECKS.length} 套牌組</b>（包含環境主流牌組）中隨機挑選一套與你對戰。</li>
        <li>獲勝可得金幣：簡單 ${store.REWARDS.easy.win}、普通 ${store.REWARDS.normal.win}、困難 ${store.REWARDS.hard.win}（落敗也有少量金幣）。</li>
        <li>到<b>商店</b>用金幣購買卡包，卡包會隨機掉落卡片。</li>
        <li>在<b>牌組編輯</b>中用收藏的卡片自由組牌（基本能量無限供應）。</li>
      </ul>
      <p class="tut-invite">第一次玩寶可夢卡牌嗎？建議先看<b>新手教學</b>，完成練習賽可以獲得 🪙${TUTORIAL_REWARD} 金幣！</p>`, {
      buttons: [{ label: '之後再說', value: false }, { label: '📖 開始新手教學', primary: true, value: true }],
    }).then(v => { if (v) tutorial(); });
  }
}

// ================= 新手教學 =================
const TUTORIAL_REWARD = 300;
async function tutorial() {
  const go = await showRulesSlides();
  if (!go) { route('home'); return; }
  app.innerHTML = '<div id="battle-root"></div>';
  const view = new BattleView(app.querySelector('#battle-root'), {
    playerDeck: TUTORIAL_BATTLE.playerDeck, aiDeck: TUTORIAL_BATTLE.aiDeck, level: 'normal', tutorial: TUTORIAL_BATTLE,
    onEnd: async (won) => {
      const s = store.load();
      const first = !s.tutorialDone;
      if (first) { s.tutorialDone = true; s.coins += TUTORIAL_REWARD; store.save(); }
      const v = await showModal(`<div class="result ${won ? 'win' : 'lose'}">
        <div class="result-title">${won ? '🎉 練習賽勝利！' : '練習賽結束'}</div>
        <p>你已經學會寶可夢卡牌的基本玩法了！</p>
        ${first ? `<p class="result-coins">新手教學獎勵 🪙 <b>${TUTORIAL_REWARD}</b> 金幣</p>` : ''}
        <p class="sub">接下來可以用起始牌組挑戰「簡單」難度的 AI，贏得金幣後到商店買卡包。</p></div>`, {
        dismissable: false,
        buttons: [{ label: '再看一次教學', value: 'tutorial' }, { label: '返回主選單', value: 'home' }, { label: '挑戰 AI！', primary: true, value: 'setup' }],
      });
      route(v);
    },
  });
  try { await view.start(); } catch (e) { console.error(e); route('home'); }
}

// ================= 對戰設定 =================
function setup() {
  const s = store.load();
  const decks = store.allDecks();
  let level = s.lastLevel || 'normal';
  let deckId = decks.find(d => d.id === s.lastDeck) ? s.lastDeck : decks[0].id;
  const deckOk = d => !validateDeck(d.cards).length && !store.missingCards(d).length;
  const render = () => {
    mount(`<h2>對戰設定</h2>
      <h3>1. 選擇難度</h3>
      <div class="level-row">${LEVELS.map(l => `<div class="level ${level === l.id ? 'on' : ''}" data-level="${l.id}">
        <b>${l.name}</b><p>${l.desc}</p><div class="reward">勝利 🪙${store.REWARDS[l.id].win}・落敗 🪙${store.REWARDS[l.id].lose}</div></div>`).join('')}</div>
      <h3>2. 選擇你的牌組</h3>
      <div class="deck-row">${decks.map(d => {
        const ok = deckOk(d);
        return `<div class="deck-tile ${deckId === d.id ? 'on' : ''} ${ok ? '' : 'bad'}" data-deck="${d.id}">
          <div class="deck-cover">${d.cover ? cardHTML(d.cover, { small: true }) : ''}</div>
          <div><b>${esc(d.name)}</b>${d.preset ? '<span class="tag">起始牌組</span>' : ''}<p>${ok ? `${Object.values(d.cards).reduce((a, b) => a + b, 0)}張` : '牌組不完整或卡片不足'}</p></div></div>`;
      }).join('')}</div>
      <h3>3. AI 對手</h3>
      <div class="mystery"><div class="mystery-card">？</div><div><b>隨機對手</b><p>AI 會從 ${AI_DECKS.length} 套牌組中隨機挑選一套，對戰開始時才揭曉！</p></div></div>
      <div class="start-row"><button class="btn big primary" id="start">⚔ 開始對戰</button></div>`, 'setup');
    app.querySelectorAll('[data-level]').forEach(el => el.onclick = () => { level = el.dataset.level; render(); });
    app.querySelectorAll('[data-deck]').forEach(el => el.onclick = () => { deckId = el.dataset.deck; render(); });
    app.querySelector('#start').onclick = () => {
      const d = store.getDeck(deckId);
      if (!deckOk(d)) { toast('這副牌組無法使用，請先到牌組編輯修正', 'bad'); return; }
      s.lastDeck = deckId; s.lastLevel = level; store.save();
      battle(d, level);
    };
  };
  render();
}

async function battle(deck, level) {
  const aiDeck = AI_DECKS[Math.floor(Math.random() * AI_DECKS.length)];
  app.innerHTML = '<div id="battle-root"></div>';
  const view = new BattleView(app.querySelector('#battle-root'), {
    playerDeck: deck, aiDeck, level,
    onEnd: async (won, reason) => {
      const coins = store.recordResult(level, won);
      const v = await showModal(`<div class="result ${won ? 'win' : 'lose'}">
        <div class="result-title">${won ? '🏆 勝利！' : '落敗…'}</div>
        <p>${esc(reason)}</p>
        <p class="result-coins">獲得 🪙 <b>${coins}</b> 金幣</p>
        <p class="sub">目前金幣：${store.load().coins}</p></div>`, {
        dismissable: false,
        buttons: [{ label: '返回主選單', value: 'home' }, { label: '前往商店', value: 'shop' }, { label: '再戰一場', primary: true, value: 'again' }],
      });
      if (v === 'again') battle(deck, level);
      else route(v);
    },
  });
  try {
    await view.start();
  } catch (e) {
    console.error(e);
    await showModal(`<p>對戰發生錯誤：${esc(e.message)}</p>`);
    route('home');
  }
}

// ================= 商店 =================
function shop() {
  const s = store.load();
  const ex = store.extras();
  const exCoins = ex.reduce((a, e) => a + e.n * e.price, 0);
  mount(`<h2>商店</h2>
    <p class="sub">用對戰贏得的金幣購買卡包。每包5張卡，稀有度：C ● / U ◆ / R ★ / RR ★★ / SR ★★★ / ACE SPEC</p>
    <div class="pack-row">${PACKS.map(p => `<div class="pack" style="--pc:${p.color}">
      <div class="pack-art"><div class="pack-logo">${esc(p.name)}</div><div class="pack-cover">${cardHTML(PACK_COVER[p.id], { small: true })}</div></div>
      <p>${esc(p.desc)}</p>
      <div class="pack-buy"><span>🪙 ${p.price}</span>
        <button class="btn primary" data-buy="${p.id}" ${s.coins < p.price ? 'disabled' : ''}>購買1包</button>
        <button class="btn" data-buy5="${p.id}" ${s.coins < p.price * 5 ? 'disabled' : ''}>購買5包</button></div>
    </div>`).join('')}</div>
    <div class="sell-box"><h3>出售重複卡片</h3>
      <p>同一張卡超過4張的部分可以出售換取金幣（C 5 / U 10 / R 30 / RR 80 / ACE 120 / AR 100 / SR 150 / SAR 300 / UR 400）。</p>
      <p>目前可出售：<b>${ex.reduce((a, e) => a + e.n, 0)}</b> 張，共 🪙 <b>${exCoins}</b></p>
      <button class="btn" id="sell" ${ex.length ? '' : 'disabled'}>全部出售</button></div>`, 'shop');
  app.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy, 1));
  app.querySelectorAll('[data-buy5]').forEach(b => b.onclick = () => buy(b.dataset.buy5, 5));
  app.querySelector('#sell').onclick = async () => {
    const ok = await showModal(`<p>確定要出售 ${ex.reduce((a, e) => a + e.n, 0)} 張重複卡片，換取 🪙${exCoins} 嗎？</p>`, { buttons: [{ label: '取消', value: false }, { label: '出售', primary: true, value: true }] });
    if (!ok) return;
    const r = store.sellExtras();
    toast(`出售了${r.count}張卡，獲得🪙${r.coins}`, 'good');
    shop();
  };
}

async function buy(packId, n) {
  const before = { ...store.load().collection };
  const all = [];
  for (let i = 0; i < n; i++) {
    const cards = openPack(packId);
    if (!cards) break;
    all.push(...cards);
    store.load().packsOpened++;
  }
  store.save();
  if (!all.length) { toast('金幣不足', 'bad'); return; }
  await packOpening(all, before, PACKS.find(p => p.id === packId));
  shop();
}

// 開包：每包先滑動撕開，再翻開卡片
async function packOpening(cards, before, pack) {
  const seen = { ...before };
  const isNew = cards.map(c => { const n = !seen[c.id]; seen[c.id] = (seen[c.id] || 0) + 1; return n; });
  const total = Math.ceil(cards.length / pack.size);
  for (let p = 0; p < total; p++) {
    const from = p * pack.size;
    const chunk = cards.slice(from, from + pack.size);
    const best = Math.max(...chunk.map(c => RARITY_RANK[c.rarity] || 0));
    const skip = await tearPack(pack, p, total, best);
    if (skip) {
      await revealCards(cards.slice(from), isNew.slice(from), pack, '完成');
      return;
    }
    await revealCards(chunk, isNew.slice(from, from + pack.size), pack, p < total - 1 ? `下一包（${p + 2}/${total}）` : '完成');
  }
}

// 滑動撕開卡包（滑鼠拖曳或手指滑動），回傳 true 表示略過剩下的動畫
function tearPack(pack, idx, total, best) {
  return new Promise(resolve => {
    const stage = document.createElement('div');
    stage.className = `tear-stage ${best >= 5 ? 'rare-glow' : best >= 3 ? 'gold-glow' : ''}`;
    stage.innerHTML = `
      <div class="tear-count">${esc(pack.name)}${total > 1 ? `・第 ${idx + 1} / ${total} 包` : ''}</div>
      <div class="tpack" style="--pc:${pack.color}">
        <div class="tpack-top"><span>✂ ─ ─ ─ ─ ─ ─ ─ ─</span></div>
        <div class="tpack-body"><div class="pack-logo">${esc(pack.name)}</div><div class="pack-cover">${cardHTML(PACK_COVER[pack.id], { small: true })}</div></div>
        <div class="tear-line"><div class="tear-progress"></div><div class="tear-spark"></div></div>
        <div class="tear-hand">👆</div>
      </div>
      <p class="tear-hint">沿著卡包上方的虛線 <b>向右滑動</b> 撕開卡包！</p>
      <div class="tear-buttons"><button class="btn" data-tear="open">直接打開</button>${total - idx > 1 ? '<button class="btn" data-tear="skip">略過全部</button>' : ''}</div>`;
    document.body.appendChild(stage);
    const tpack = stage.querySelector('.tpack');
    const top = stage.querySelector('.tpack-top');
    const prog = stage.querySelector('.tear-progress');
    const spark = stage.querySelector('.tear-spark');
    let startX = null, p = 0, done = false;
    const set = v => {
      p = Math.max(0, Math.min(1, v));
      prog.style.width = `${p * 100}%`;
      spark.style.left = `${p * 100}%`;
      spark.style.opacity = p > 0 && p < 1 ? 1 : 0;
      top.style.transform = `rotate(${-p * 9}deg) translateY(${-p * 10}px)`;
      tpack.classList.toggle('tearing', p > 0);
    };
    const finish = async skipAll => {
      if (done) return;
      done = true;
      set(1);
      stage.classList.add('torn');
      if (navigator.vibrate) try { navigator.vibrate(30); } catch { /* ignore */ }
      const anims = [
        top.animate([{ transform: top.style.transform }, { transform: 'translate(90px, -220px) rotate(-38deg)', opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }),
        stage.querySelector('.tpack-body').animate([{ transform: 'none' }, { transform: 'translateY(-6px) scale(1.02)', offset: .25 }, { transform: 'translateY(90px) scale(.96)', opacity: 0 }], { duration: 750, delay: 250, easing: 'ease-in', fill: 'forwards' }),
      ];
      await Promise.all(anims.map(a => a.finished.catch(() => {})));
      stage.classList.add('closing');
      setTimeout(() => stage.remove(), 200);
      resolve(skipAll);
    };
    tpack.addEventListener('pointerdown', e => {
      if (done) return;
      startX = e.clientX;
      tpack.setPointerCapture?.(e.pointerId);
      stage.querySelector('.tear-hand').style.display = 'none';
    });
    tpack.addEventListener('pointermove', e => {
      if (startX === null || done) return;
      set((e.clientX - startX) / (tpack.clientWidth * 0.7));
      if (p >= 1) finish(false);
    });
    const release = () => {
      if (startX === null || done) return;
      startX = null;
      if (p >= 0.85) { finish(false); return; }
      // 沒撕完：彈回去
      const from = p;
      const t0 = performance.now();
      const back = now => { const k = Math.min(1, (now - t0) / 220); set(from * (1 - k)); if (k < 1 && !done) requestAnimationFrame(back); };
      requestAnimationFrame(back);
      if (from < 0.08) tpack.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-2deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(0)' }], { duration: 300 });
    };
    tpack.addEventListener('pointerup', release);
    tpack.addEventListener('pointercancel', release);
    stage.querySelector('[data-tear="open"]').onclick = () => finish(false);
    const sk = stage.querySelector('[data-tear="skip"]');
    if (sk) sk.onclick = () => finish(true);
  });
}

// 翻開卡片
function revealCards(cards, isNew, pack, doneLabel) {
  return new Promise(resolve => {
    const flipped = new Set();
    const html = `<h3>${esc(pack.name)}・開包結果</h3>
      <p class="sub">點擊卡片翻開（翻開後再點一次可放大）</p>
      <div class="open-grid">${cards.map((c, i) => `<div class="flip deal rar-${c.rarity} ${(RARITY_RANK[c.rarity] || 0) >= 5 ? 'special' : ''}" data-flip="${i}" style="animation-delay:${i * 90}ms">
        <div class="flip-back"><span class="ball"></span></div>
        <div class="flip-front">${cardHTML(c, { small: true })}${isNew[i] ? '<span class="new">NEW</span>' : ''}<span class="rar-tag">${RARITY_LABEL[c.rarity]}${c.variant ? '・特別版' : ''}</span></div></div>`).join('')}</div>`;
    const flip = (i, el) => {
      if (flipped.has(i)) return;
      flipped.add(i);
      el.classList.add('on');
      const r = RARITY_RANK[cards[i].rarity] || 0;
      if (r >= 4) toast(`✨ ${cards[i].name}（${RARITY_LABEL[cards[i].rarity]}${cards[i].variant ? '・特別版' : ''}）`, r >= 5 ? 'good rainbow' : 'good');
    };
    showModal(html, {
      wide: true, dismissable: false,
      buttons: [{ label: '全部翻開', value: 'all' }, { label: doneLabel, primary: true, value: 'done' }],
      onButton: v => {
        if (v === 'all') { document.querySelectorAll('.open-grid .flip').forEach((el, i) => setTimeout(() => flip(i, el), i * 80)); return false; }
        resolve();
        return true;
      },
      onClick: (e) => {
        const f = e.target.closest('[data-flip]');
        if (!f) return;
        const i = +f.dataset.flip;
        if (flipped.has(i)) { showModal(`<div class="zoom">${cardHTML(cards[i])}</div>`, { buttons: [{ label: '關閉', value: null }] }); return; }
        flip(i, f);
      },
    });
  });
}

// ================= 收藏 =================
function filterBar(state) {
  const types = ['G', 'R', 'W', 'L', 'P', 'F', 'D', 'M', 'N', 'C'];
  return `<div class="filters">
    <input type="search" id="q" placeholder="搜尋卡名或效果…" value="${esc(state.q)}">
    <select id="cat"><option value="">全部種類</option><option value="P" ${state.cat === 'P' ? 'selected' : ''}>寶可夢</option><option value="T" ${state.cat === 'T' ? 'selected' : ''}>訓練家</option><option value="E" ${state.cat === 'E' ? 'selected' : ''}>能量</option></select>
    <div class="type-filter">${types.map(t => `<button class="tf ${state.type === t ? 'on' : ''}" data-tf="${t}">${energyIcon(t)}</button>`).join('')}</div>
    ${state.ownedToggle ? `<label><input type="checkbox" id="owned" ${state.owned ? 'checked' : ''}> 只顯示已擁有</label>` : ''}
  </div>`;
}
function applyFilter(list, state) {
  const q = state.q.trim();
  return list.filter(c => {
    if (state.cat && c.cat !== state.cat) return false;
    if (state.type && !(c.cat === 'P' ? c.type === state.type : c.cat === 'E' && c.provides === state.type)) return false;
    if (state.owned && !store.owned(c.id)) return false;
    if (q) {
      const text = [c.name, c.text, ...(c.attacks || []).map(a => a.name + a.text), ...(c.abilities || []).map(a => a.name + a.text)].join(' ');
      if (!text.includes(q)) return false;
    }
    return true;
  });
}
function bindFilter(state, rerender) {
  const q = app.querySelector('#q');
  q.oninput = () => { state.q = q.value; rerender(true); };
  app.querySelector('#cat').onchange = e => { state.cat = e.target.value; rerender(); };
  app.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { state.type = state.type === b.dataset.tf ? '' : b.dataset.tf; rerender(); });
  const o = app.querySelector('#owned');
  if (o) o.onchange = () => { state.owned = o.checked; rerender(); };
}

function collection() {
  const state = { q: '', cat: '', type: '', owned: false, ownedToggle: true };
  const list = CARDS;
  const render = (keepFocus = false) => {
    const s = store.load();
    const total = list.filter(c => !isBasicEnergy(c)).length;
    const have = list.filter(c => !isBasicEnergy(c) && s.collection[c.id]).length;
    const shown = applyFilter(list, state);
    const grid = shown.map(c => {
      const n = isBasicEnergy(c) ? null : (s.collection[c.id] || 0);
      return `<div class="coll-item" data-zoom="${c.id}">${cardHTML(c, { small: true, dim: n === 0, count: n === null ? '∞' : n })}</div>`;
    }).join('');
    if (keepFocus && app.querySelector('#coll-grid')) {
      app.querySelector('#coll-grid').innerHTML = grid;
      return;
    }
    mount(`<h2>收藏 <small>${have} / ${total}（${Math.round(have / total * 100)}%）</small></h2>
      <div class="progress"><div style="width:${have / total * 100}%"></div></div>
      <div class="opt-row"><label><input type="checkbox" id="imgs" ${getShowImages() ? 'checked' : ''}> 嘗試載入官方卡圖（需網路，載入失敗會自動改用文字卡面）</label></div>
      ${filterBar(state)}<div class="card-grid" id="coll-grid">${grid}</div>`, 'collection');
    bindFilter(state, render);
    app.querySelector('#imgs').onchange = e => { setShowImages(e.target.checked); render(); };
  };
  render();
}
document.addEventListener('click', e => {
  const z = e.target.closest('[data-zoom]');
  if (!z) return;
  showModal(`<div class="zoom">${cardHTML(z.dataset.zoom)}</div><p class="sub center">持有：${isBasicEnergy(CARD_MAP.get(z.dataset.zoom)) ? '無限' : store.owned(z.dataset.zoom)}張</p>`, { buttons: [{ label: '關閉', value: null }] });
});

// ================= 牌組 =================
function deckCount(d) { return Object.values(d.cards).reduce((a, b) => a + b, 0); }
function decks() {
  const list = store.allDecks();
  mount(`<h2>牌組</h2>
    <p class="sub">起始牌組無法直接修改，可以「複製」後自由調整。自訂牌組只能使用收藏中擁有的卡片（基本能量無限）。</p>
    <div class="deck-actions"><button class="btn primary" id="new-deck">＋ 建立新牌組</button></div>
    <div class="deck-list">${list.map(d => {
      const errs = validateDeck(d.cards);
      const miss = store.missingCards(d);
      const ok = !errs.length && !miss.length;
      return `<div class="deck-card ${ok ? '' : 'bad'}">
        <div class="deck-cover">${d.cover ? cardHTML(d.cover, { small: true }) : '<div class="card small empty-cover">？</div>'}</div>
        <div class="deck-info"><b>${esc(d.name)}</b> ${d.preset ? '<span class="tag">起始牌組</span>' : ''}
          <p>${deckCount(d)} 張 ${ok ? '✅ 可以使用' : `⚠️ ${esc([...errs, ...(miss.length ? [`缺少${miss.reduce((a, m) => a + m.need, 0)}張卡片`] : [])].join('、'))}`}</p>
          ${d.desc ? `<p class="sub">${esc(d.desc)}</p>` : ''}
          <div class="deck-btns">
            <button class="btn tiny" data-view="${d.id}">查看</button>
            ${d.preset ? '' : `<button class="btn tiny primary" data-edit="${d.id}">編輯</button>`}
            <button class="btn tiny" data-copy="${d.id}">複製</button>
            ${d.preset ? '' : `<button class="btn tiny danger" data-del="${d.id}">刪除</button>`}
          </div></div></div>`;
    }).join('')}</div>`, 'decks');
  app.querySelector('#new-deck').onclick = () => editDeck({ id: `deck-${Date.now()}`, name: '我的牌組', cards: {}, isNew: true });
  app.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editDeck(structuredClone(store.getDeck(b.dataset.edit))));
  app.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
    const d = store.getDeck(b.dataset.copy);
    editDeck({ id: `deck-${Date.now()}`, name: `${d.name}（複製）`, cards: { ...d.cards }, cover: d.cover, isNew: true });
  });
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const ok = await showModal('<p>確定要刪除這副牌組嗎？</p>', { buttons: [{ label: '取消', value: false }, { label: '刪除', danger: true, value: true }] });
    if (ok) { store.deleteDeck(b.dataset.del); decks(); }
  });
  app.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
    const d = store.getDeck(b.dataset.view);
    showModal(`<h3>${esc(d.name)}</h3>${deckListHTML(d.cards)}`, { wide: true, buttons: [{ label: '關閉', value: null }] });
  });
}

function sortCards(ids) {
  const catOrder = { P: 0, T: 1, E: 2 };
  const trOrder = { Supporter: 0, Item: 1, Tool: 2, Stadium: 3 };
  return ids.map(id => CARD_MAP.get(id)).sort((a, b) =>
    catOrder[a.cat] - catOrder[b.cat] || (a.cat === 'P' ? a.type.localeCompare(b.type) || a.stage - b.stage : 0) ||
    (a.cat === 'T' ? trOrder[a.trainer] - trOrder[b.trainer] : 0) || a.name.localeCompare(b.name, 'zh-Hant'));
}
function deckListHTML(cards) {
  const ids = sortCards(Object.keys(cards).filter(id => cards[id] > 0));
  const groups = { P: '寶可夢', T: '訓練家', E: '能量' };
  let h = '';
  for (const cat of ['P', 'T', 'E']) {
    const g = ids.filter(c => c.cat === cat);
    if (!g.length) continue;
    h += `<h4>${groups[cat]}（${g.reduce((a, c) => a + cards[c.id], 0)}）</h4><div class="card-grid">${g.map(c => `<div data-zoom="${c.id}">${cardHTML(c, { small: true, count: cards[c.id] })}</div>`).join('')}</div>`;
  }
  return h;
}

function editDeck(deck) {
  const state = { q: '', cat: '', type: '', owned: true, ownedToggle: true };
  const pool = CARDS;
  const count = cid => deck.cards[cid] || 0;
  const nameCount = c => Object.entries(deck.cards).reduce((a, [id, n]) => a + (ruleName(CARD_MAP.get(id)) === ruleName(c) ? n : 0), 0);
  const add = cid => {
    const c = CARD_MAP.get(cid);
    const total = deckCount(deck);
    if (total >= 60) return toast('牌組已經有60張了', 'bad');
    if (!isBasicEnergy(c) && nameCount(c) >= 4) return toast(`「${ruleName(c)}」最多4張`, 'bad');
    if (c.ace && Object.keys(deck.cards).some(id => deck.cards[id] && CARD_MAP.get(id).ace)) return toast('ACE SPEC卡最多1張', 'bad');
    if (count(cid) >= store.owned(cid)) return toast('你沒有更多這張卡了', 'bad');
    deck.cards[cid] = count(cid) + 1;
    if (!deck.cover && isPokemon(c)) deck.cover = cid;
    render(true);
  };
  const remove = cid => {
    if (!count(cid)) return;
    deck.cards[cid]--;
    if (!deck.cards[cid]) delete deck.cards[cid];
    render(true);
  };
  const render = (partial = false) => {
    const shown = sortCards(applyFilter(pool, state).map(c => c.id));
    const total = deckCount(deck);
    const errs = validateDeck(deck.cards);
    const poolHTML = shown.map(c => {
      const have = store.owned(c.id);
      const left = have === Infinity ? '∞' : have - count(c.id);
      return `<div class="pool-item ${have === 0 ? 'none' : ''}" data-add="${c.id}">${miniCardHTML(c, { count: left })}<button class="info" data-info="${c.id}" title="查看">ⓘ</button></div>`;
    }).join('');
    const ids = sortCards(Object.keys(deck.cards).filter(id => deck.cards[id] > 0));
    const listHTML = ids.map(c => `<div class="deck-line t-${c.cat === 'P' ? c.type : c.cat === 'E' ? c.provides || 'C' : 'T'}">
      <button class="btn tiny" data-rm="${c.id}">－</button><b>${deck.cards[c.id]}</b><button class="btn tiny" data-plus="${c.id}">＋</button>
      <span class="dl-name" data-info="${c.id}">${esc(c.name)}</span><small>${c.cat === 'P' ? `HP${c.hp}` : ''}</small>
      <span class="cover-pick ${deck.cover === c.id ? 'on' : ''}" data-cover="${c.id}" title="設為封面">★</span></div>`).join('');
    const counts = { P: 0, T: 0, E: 0 };
    ids.forEach(c => counts[c.cat] += deck.cards[c.id]);
    const status = `<div class="deck-status ${errs.length ? 'bad' : 'ok'}"><b>${total}/60</b> 寶可夢${counts.P}・訓練家${counts.T}・能量${counts.E}<br>${errs.length ? errs.map(esc).join('<br>') : '✅ 牌組符合規則'}</div>`;
    if (partial && app.querySelector('.editor')) {
      app.querySelector('#pool').innerHTML = poolHTML;
      app.querySelector('#deck-lines').innerHTML = listHTML;
      app.querySelector('#deck-status').innerHTML = status;
      return;
    }
    mount(`<div class="editor">
      <div class="editor-pool">
        <div class="editor-head"><h2>牌組編輯</h2><span class="sub">點擊卡片加入牌組，ⓘ 查看詳細</span></div>
        ${filterBar(state)}
        <div class="pool" id="pool">${poolHTML}</div>
      </div>
      <div class="editor-deck">
        <input class="deck-name" id="deck-name" value="${esc(deck.name)}" maxlength="20">
        <div id="deck-status">${status}</div>
        <div class="energy-quick">快速加入基本能量：${['G', 'R', 'W', 'L', 'P', 'F', 'D', 'M'].map(t => `<button class="tf" data-add-energy="${t}">${energyIcon(t)}</button>`).join('')}</div>
        <div class="deck-lines" id="deck-lines">${listHTML}</div>
        <div class="editor-btns"><button class="btn" id="cancel">取消</button><button class="btn" id="clear">清空</button><button class="btn primary" id="save">儲存</button></div>
      </div></div>`, 'decks');
    bindFilter(state, render);
    app.querySelector('#deck-name').oninput = e => { deck.name = e.target.value; };
    app.querySelector('#cancel').onclick = () => decks();
    app.querySelector('#clear').onclick = () => { deck.cards = {}; render(true); };
    app.querySelector('#save').onclick = () => {
      if (!deck.name.trim()) deck.name = '我的牌組';
      delete deck.isNew;
      store.saveDeck(deck);
      toast(errs.length ? '已儲存（牌組尚未完成，無法用於對戰）' : '牌組已儲存！', errs.length ? 'info' : 'good');
      decks();
    };
    app.querySelector('.editor').onclick = e => {
      const info = e.target.closest('[data-info]');
      if (info) { showModal(`<div class="zoom">${cardHTML(info.dataset.info)}</div>`, { buttons: [{ label: '關閉', value: null }] }); return; }
      const t = e.target.closest('[data-add],[data-rm],[data-plus],[data-cover],[data-add-energy]');
      if (!t) return;
      if (t.dataset.add) add(t.dataset.add);
      else if (t.dataset.rm) remove(t.dataset.rm);
      else if (t.dataset.plus) add(t.dataset.plus);
      else if (t.dataset.cover) { deck.cover = t.dataset.cover; render(true); }
      else if (t.dataset.addEnergy) add(CARDS.find(c => isBasicEnergy(c) && c.provides === t.dataset.addEnergy).id);
    };
  };
  render();
}

// ================= 規則 =================
function rules() {
  mount(`<div class="rules">
    <h2>遊戲規則簡介</h2>
    <h3>勝利條件</h3>
    <ul><li>拿完自己的6張獎賞卡。</li><li>對手場上沒有寶可夢。</li><li>對手在回合開始時無法從牌庫抽牌。</li></ul>
    <h3>回合流程</h3>
    <ol><li>從牌庫抽1張卡。</li>
      <li>可以任意順序執行：將基礎寶可夢放到備戰區（最多5隻）、進化寶可夢、附加1張能量（每回合1次）、使用物品卡、使用支援者卡（每回合1張）、使用競技場卡、使用特性、撤退（每回合1次）。</li>
      <li>最後用戰鬥寶可夢使用招式攻擊，回合結束。</li></ol>
    <h3>重要規則</h3>
    <ul>
      <li>先攻玩家的第1回合不能攻擊，也不能使用支援者卡。</li>
      <li>雙方的第1回合都不能進化；剛放到場上的寶可夢當回合也不能進化。</li>
      <li>弱點：傷害×2；抵抗力：傷害-30。對備戰寶可夢造成的傷害不計算弱點與抵抗力。</li>
      <li>寶可夢ex被擊倒時對手拿2張獎賞卡，超級進化寶可夢ex拿3張。</li>
      <li>特殊狀態：中毒（每次回合間10傷害）、灼傷（20傷害後擲硬幣，正面恢復）、睡眠（無法攻擊撤退，回合間擲硬幣正面醒來）、麻痺（無法攻擊撤退，自己的下個回合結束時恢復）、混亂（攻擊時擲硬幣，反面則失敗並受到30傷害）。</li>
    </ul>
    <h3>牌組規則</h3>
    <ul><li>剛好60張，同名卡最多4張（基本能量不限）。</li><li>ACE SPEC卡整副牌只能放1張。</li><li>至少要有1張基礎寶可夢。</li></ul>
    <h3>操作說明</h3>
    <ul><li>點擊手牌：顯示可以進行的操作（放到備戰區、進化、附加能量、使用）。</li>
      <li>點擊自己的戰鬥寶可夢：使用招式、撤退或特性。</li>
      <li>點擊對手的寶可夢或棄牌區：查看詳細資訊。</li></ul>
    <h3>關於卡片資料</h3>
    <p class="sub">卡片名稱與效果文字取自繁體中文版卡片資料（tcgdex 卡片資料庫 data-asia）。以「ex初階牌組 皮卡丘」(SVQP) 為起始牌組藍本，AI牌組參考2026年標準賽制主流牌組；超級進化系列卡片依日文版內容翻譯。卡圖取自寶可夢集換式卡牌官方訓練家網站（台灣）。本作為玩家自製的非官方同人遊戲。</p>
    <p><button class="btn primary" data-go="tutorial">📖 開啟新手教學（圖解＋練習賽）</button></p>
    <div class="danger-zone"><button class="btn danger" id="reset">重置存檔</button></div>
  </div>`, 'rules');
  app.querySelector('#reset').onclick = async () => {
    const ok = await showModal('<p>確定要重置所有存檔（金幣、收藏、牌組、戰績）嗎？</p>', { buttons: [{ label: '取消', value: false }, { label: '重置', danger: true, value: true }] });
    if (ok) { store.reset(); home(); }
  };
}

route('home');
