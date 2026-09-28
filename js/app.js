// 主程式：畫面切換、商店、收藏、牌組編輯
import { CARDS } from './data/cards.js';
import { AI_DECKS, STARTER_DECKS } from './data/decks.js';
import { CARD_MAP, validateDeck, isBasicEnergy, isPokemon, TYPE_NAMES, ruleName } from './engine/cards.js';
import * as store from './store.js';
import { PACKS, openPack, RARITY_LABEL, RARITY_RANK, packsFor } from './shop.js';
import { cardHTML, miniCardHTML, esc, energyIcon, getShowImages, setShowImages } from './ui/cardview.js';
import { showModal, toast } from './ui/modal.js';
import { BattleView } from './ui/battle.js';
import { showRulesSlides, TUTORIAL_BATTLE } from './ui/tutorial.js';
import { TIERS, tierOf, makeOpponent, pointsDelta, RANK_REWARD } from './ranked.js';

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
  const nav = [['home', '主選單'], ['setup', '對戰'], ['ranked', '排位'], ['decks', '牌組'], ['shop', '商店'], ['collection', '圖鑑'], ['tutorial', '教學'], ['saves', '存檔'], ['rules', '規則']];
  return `<header class="top">
    <div class="logo" data-go="home"><span class="ball"></span>寶可夢卡牌 <b>AI對戰</b></div>
    <nav>${nav.map(([id, n]) => `<button class="nav ${active === id ? 'on' : ''}" data-go="${id}">${n}</button>`).join('')}</nav>
    <div class="coins" title="目前存檔：${esc(store.activeSlot()?.name || '')}" data-go="saves"><span class="slot-name">💾 ${esc(store.activeSlot()?.name || '')}</span>🪙 <b>${s.coins}</b></div>
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
  ({ home, setup, ranked, decks, shop, collection, rules, tutorial, saves, edit: editDeck })[name]?.(arg);
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
          <button class="btn big ranked-btn" data-go="ranked">🌐 排位對戰</button>
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

// ================= 存檔 =================
function fmtTime(t) {
  if (!t) return '－';
  const d = new Date(t);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
async function askName(title, value) {
  const v = await showModal(`<h3>${esc(title)}</h3><input class="deck-name slot-input" id="slot-name" maxlength="20" value="${esc(value)}">`, {
    buttons: [{ label: '取消', value: null }, { label: '確定', primary: true, value: 'ok' }],
  });
  return v === 'ok' ? (document.querySelector('#slot-name')?.value || value).trim() : null;
}
function saves() {
  const list = store.listSlots();
  const full = list.length >= store.MAX_SLOTS;
  mount(`<h2>存檔</h2>
    <p class="sub">遊戲會自動儲存到「使用中」的存檔。每個存檔有各自的金幣、收藏、牌組與戰績，最多 ${store.MAX_SLOTS} 個。</p>
    <div class="save-actions">
      <button class="btn primary" id="slot-new" ${full ? 'disabled' : ''}>＋ 新增存檔</button>
      <button class="btn" id="slot-import" ${full ? 'disabled' : ''}>📥 匯入存檔檔案</button>
      <input type="file" id="slot-file" accept=".json,application/json" hidden>
    </div>
    <div class="save-list">${list.map(x => `<div class="save-card ${x.active ? 'on' : ''}">
      <div class="save-head"><b>${esc(x.name)}</b>${x.active ? '<span class="tag">使用中</span>' : ''}</div>
      <div class="save-stats">
        <span>🪙 ${x.coins}</span><span>🃏 ${x.cards} 種卡</span><span>🏆 ${x.wins} 勝 ${x.losses} 敗</span><span>🎴 ${x.packs} 包</span>
      </div>
      <div class="save-time">最後遊玩：${fmtTime(x.updated)}</div>
      <div class="save-btns">
        ${x.active ? '' : `<button class="btn tiny primary" data-slot-load="${x.id}">載入</button>`}
        <button class="btn tiny" data-slot-rename="${x.id}">重新命名</button>
        <button class="btn tiny" data-slot-copy="${x.id}" ${full ? 'disabled' : ''}>複製</button>
        <button class="btn tiny" data-slot-export="${x.id}">匯出</button>
        ${list.length > 1 ? `<button class="btn tiny danger" data-slot-del="${x.id}">刪除</button>` : ''}
      </div></div>`).join('')}</div>
    <p class="sub">💡 「匯出」會下載一個存檔檔案，可以在其他電腦或手機用「匯入存檔檔案」繼續玩，也可以當作備份。</p>`, 'saves');
  const name = id => list.find(x => x.id === id)?.name || '';
  app.querySelector('#slot-new').onclick = async () => {
    const n = await askName('新存檔名稱', `存檔 ${list.length + 1}`);
    if (n === null) return;
    store.createSlot(n);
    toast(`已建立並切換到「${n}」`, 'good');
    saves();
  };
  const file = app.querySelector('#slot-file');
  app.querySelector('#slot-import').onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const id = store.importSlot(await f.text());
      if (!id) throw new Error('存檔數量已達上限');
      toast('匯入成功！', 'good');
    } catch (e) { toast(`匯入失敗：${e.message}`, 'bad', 2500); }
    saves();
  };
  app.querySelectorAll('[data-slot-load]').forEach(b => b.onclick = () => {
    store.switchSlot(b.dataset.slotLoad);
    toast(`已載入「${name(b.dataset.slotLoad)}」`, 'good');
    saves();
  });
  app.querySelectorAll('[data-slot-rename]').forEach(b => b.onclick = async () => {
    const n = await askName('重新命名存檔', name(b.dataset.slotRename));
    if (n) { store.renameSlot(b.dataset.slotRename, n); saves(); }
  });
  app.querySelectorAll('[data-slot-copy]').forEach(b => b.onclick = () => {
    if (store.duplicateSlot(b.dataset.slotCopy)) toast('已複製存檔', 'good');
    saves();
  });
  app.querySelectorAll('[data-slot-export]').forEach(b => b.onclick = () => {
    const blob = new Blob([store.exportSlot(b.dataset.slotExport)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = `ptcg-save-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${b.dataset.slotExport}.json`;
    toast(`已匯出「${name(b.dataset.slotExport)}」`, 'good');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  app.querySelectorAll('[data-slot-del]').forEach(b => b.onclick = async () => {
    const ok = await showModal(`<p>確定要刪除「${esc(name(b.dataset.slotDel))}」嗎？這個存檔的金幣、收藏與牌組都會消失，無法復原。</p>`, { buttons: [{ label: '取消', value: false }, { label: '刪除', danger: true, value: true }] });
    if (!ok) return;
    store.deleteSlot(b.dataset.slotDel);
    saves();
  });
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

// ================= 排位對戰 =================
function rankBadge(pts) {
  const t = tierOf(pts);
  return `<span class="rank-badge" style="--rc:${t.color}">${t.icon} ${esc(t.name)}</span>`;
}
function ranked() {
  const s = store.load();
  const r = store.rankedData();
  const decks = store.allDecks();
  const deckOk = d => !validateDeck(d.cards).length && !store.missingCards(d).length;
  let deckId = decks.find(d => d.id === s.lastDeck) ? s.lastDeck : decks[0].id;
  const t = tierOf(r.pts);
  const next = TIERS[TIERS.indexOf(t) + 1];
  const render = () => {
    mount(`<h2>排位對戰</h2>
      <div class="rank-panel" style="--rc:${t.color}">
        <div class="rank-icon">${t.icon}</div>
        <div class="rank-main"><div class="rank-name">${esc(t.name)}</div>
          <div class="rank-pts"><b>${r.pts}</b> 分${next ? `<small>・距離「${esc(next.name)}」還差 ${next.min - r.pts} 分</small>` : '<small>・最高牌位！</small>'}</div>
          ${next ? `<div class="progress thin"><div style="width:${(r.pts - t.min) / (next.min - t.min) * 100}%"></div></div>` : ''}
        </div>
        <div class="rank-rec"><div>${r.wins} 勝 ${r.losses} 敗</div><div>${r.streak > 1 ? `🔥 ${r.streak} 連勝` : r.streak < -1 ? `${-r.streak} 連敗` : ''}</div><small>最高 ${r.best} 分</small></div>
      </div>
      <p class="sub">和其他訓練家隨機配對！對手的強度與牌組都不會事先告訴你，牌位越高，遇到高手的機會越大。勝利 🪙${RANK_REWARD.win}・落敗 🪙${RANK_REWARD.lose}，連勝可獲得額外積分。</p>
      <div class="tier-row">${TIERS.map(x => `<span class="tier ${x === t ? 'on' : ''}" style="--rc:${x.color}">${x.icon} ${esc(x.name)}<small>${x.min}+</small></span>`).join('')}</div>
      <h3>選擇你的牌組</h3>
      <div class="deck-row">${decks.map(d => {
        const ok = deckOk(d);
        return `<div class="deck-tile ${deckId === d.id ? 'on' : ''} ${ok ? '' : 'bad'}" data-deck="${d.id}">
          <div class="deck-cover">${d.cover ? cardHTML(d.cover, { small: true }) : ''}</div>
          <div><b>${esc(d.name)}</b>${d.preset ? '<span class="tag">起始牌組</span>' : ''}<p>${ok ? `${Object.values(d.cards).reduce((a, b) => a + b, 0)}張` : '牌組不完整或卡片不足'}</p></div></div>`;
      }).join('')}</div>
      <div class="start-row"><button class="btn big primary" id="match">🌐 開始配對</button></div>`, 'ranked');
    app.querySelectorAll('[data-deck]').forEach(el => el.onclick = () => { deckId = el.dataset.deck; render(); });
    app.querySelector('#match').onclick = () => {
      const d = store.getDeck(deckId);
      if (!deckOk(d)) { toast('這副牌組無法使用，請先到牌組編輯修正', 'bad'); return; }
      s.lastDeck = deckId; store.save();
      matchmaking(d);
    };
  };
  render();
}

// 配對畫面：等待數秒後「找到」對手
function matchmaking(deck) {
  const r = store.rankedData();
  const opp = makeOpponent(r.pts);
  const wait = 2500 + Math.random() * 5000;
  const wrap = document.createElement('div');
  wrap.className = 'match-stage';
  wrap.innerHTML = `<div class="match-box">
      <div class="match-ball"></div>
      <div class="match-title">尋找對手中…</div>
      <div class="match-time">00:00</div>
      <div class="match-info">${rankBadge(r.pts)}・${r.pts} 分・${esc(deck.name)}</div>
      <button class="btn" id="match-cancel">取消</button>
    </div>`;
  document.body.appendChild(wrap);
  const t0 = Date.now();
  let cancelled = false;
  const timer = setInterval(() => {
    const sec = Math.floor((Date.now() - t0) / 1000);
    wrap.querySelector('.match-time').textContent = `00:${String(sec).padStart(2, '0')}`;
  }, 250);
  const close = () => { clearInterval(timer); wrap.classList.add('closing'); setTimeout(() => wrap.remove(), 250); };
  wrap.querySelector('#match-cancel').onclick = () => { cancelled = true; close(); };
  setTimeout(() => {
    if (cancelled) return;
    clearInterval(timer);
    wrap.querySelector('.match-box').innerHTML = `<div class="match-found">配對成功！</div>
      <div class="match-opp">
        <div class="match-avatar">${opp.avatar}</div>
        <div><div class="match-name">${esc(opp.name)}</div>
          <div>${rankBadge(opp.pts)} <small>${opp.pts} 分</small></div>
          <small class="sub">${opp.games} 場・勝率 ${opp.winRate}%</small></div>
      </div>
      <div class="match-loading">連線中…</div>`;
    setTimeout(() => { if (cancelled) return; close(); rankedBattle(deck, opp); }, 2200);
  }, wait);
}

async function rankedBattle(deck, opp) {
  app.innerHTML = '<div id="battle-root"></div>';
  const view = new BattleView(app.querySelector('#battle-root'), {
    playerDeck: deck, aiDeck: opp.deck, level: opp.level, opponent: opp,
    onEnd: async (won, reason) => {
      const r = store.rankedData();
      const delta = pointsDelta(won, r.streak);
      const coins = won ? RANK_REWARD.win : RANK_REWARD.lose;
      const beforeTier = tierOf(r.pts);
      const res = store.recordRanked(won, delta, coins);
      const afterTier = tierOf(res.after);
      const up = TIERS.indexOf(afterTier) > TIERS.indexOf(beforeTier);
      const down = TIERS.indexOf(afterTier) < TIERS.indexOf(beforeTier);
      await new Promise(x => setTimeout(x, 1200));
      const v = await showModal(`<div class="result ${won ? 'win' : 'lose'}">
        <div class="result-title">${won ? '🏆 勝利！' : '落敗…'}</div>
        <p>${esc(reason)}</p>
        <p class="sub">對手：${opp.avatar} ${esc(opp.name)}・使用牌組「${esc(opp.deck.name)}」</p>
        <div class="rank-change ${delta >= 0 ? 'plus' : 'minus'}">${rankBadge(res.after)} <b>${res.after}</b> 分 <span>${delta >= 0 ? '+' : ''}${res.after - res.before}</span></div>
        ${up ? `<p class="rank-up">⬆ 晉級到「${esc(afterTier.name)}」！</p>` : down ? `<p class="rank-down">⬇ 降級到「${esc(afterTier.name)}」</p>` : ''}
        <p class="result-coins">獲得 🪙 <b>${coins}</b> 金幣</p></div>`, {
        dismissable: false,
        buttons: [{ label: '返回', value: 'ranked' }, { label: '前往商店', value: 'shop' }, { label: '繼續配對', primary: true, value: 'again' }],
      });
      if (v === 'again') matchmaking(deck);
      else route(v);
    },
  });
  try { await view.start(); } catch (e) { console.error(e); await showModal(`<p>對戰發生錯誤：${esc(e.message)}</p>`); route('home'); }
}

// ================= 商店 =================
function shop(focus) {
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
  // 從圖鑑前往：捲動到指定卡包並閃爍提示
  const target = focus && app.querySelector(`[data-buy="${focus}"]`)?.closest('.pack');
  if (target) { target.classList.add('focus'); setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }
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

// 開包（沉浸式）：全螢幕舞台 → 滑動撕開卡包 → 卡片從包裡升起成一疊，逐張滑走 → 本包總覽
const rankOf = c => RARITY_RANK[c.rarity] || 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const buzz = ms => { if (navigator.vibrate) try { navigator.vibrate(ms); } catch { /* ignore */ } };

async function packOpening(cards, before, pack) {
  const seen = { ...before };
  const isNew = cards.map(c => { const n = !seen[c.id]; seen[c.id] = (seen[c.id] || 0) + 1; return n; });
  const total = Math.ceil(cards.length / pack.size);
  const stage = document.createElement('div');
  stage.className = 'po-stage';
  stage.style.setProperty('--pc', pack.color);
  stage.innerHTML = `<div class="po-rays"></div><div class="po-banner">卡牌包<b>開封！</b></div>
    <div class="po-top"><span class="po-count"></span><span class="po-top-btns"></span></div>
    <div class="po-main"></div><div class="po-foot"></div>`;
  document.body.appendChild(stage);
  document.body.classList.add('po-lock');
  const ctx = { stage, main: stage.querySelector('.po-main'), foot: stage.querySelector('.po-foot'), skip: false, skipAll: false };
  const skipBtns = stage.querySelector('.po-top-btns');
  const cellsOf = (from, to) => cards.slice(from, to).map((c, i) => ({ c, isNew: isNew[from + i] }));
  try {
    for (let p = 0; p < total; p++) {
      const from = p * pack.size;
      const chunk = cellsOf(from, from + pack.size);
      const left = total - p;
      stage.querySelector('.po-count').textContent = `${pack.name}${total > 1 ? `・${p + 1} / ${total}` : ''}`;
      skipBtns.innerHTML = `<button class="po-skip" data-po="skip">略過 ▸</button>${left > 1 ? '<button class="po-skip" data-po="all">全部略過 ▸▸</button>' : ''}`;
      skipBtns.querySelector('[data-po="skip"]').onclick = () => { ctx.skip = true; ctx.onSkip?.(); };
      const all = skipBtns.querySelector('[data-po="all"]');
      if (all) all.onclick = () => { ctx.skip = ctx.skipAll = true; ctx.onSkip?.(); };
      ctx.skip = false;
      const best = Math.max(...chunk.map(x => rankOf(x.c)));
      await poTear(ctx, pack, best);
      if (!ctx.skip) await poStack(ctx, chunk);
      skipBtns.innerHTML = '';
      if (ctx.skipAll) { await poSummary(ctx, cellsOf(from), '完成'); break; }
      await poSummary(ctx, chunk, p === total - 1 ? '完成' : `下一包（${p + 2}/${total}）`);
    }
  } finally {
    stage.classList.add('closing');
    document.body.classList.remove('po-lock');
    setTimeout(() => stage.remove(), 250);
  }
}

// 第一階段：卡包漂浮，沿上緣虛線滑動撕開
function poTear(ctx, pack, best) {
  return new Promise(resolve => {
    const { stage, main, foot } = ctx;
    stage.classList.remove('po-summary-mode');
    stage.classList.toggle('rare-glow', best >= 5);
    stage.classList.toggle('gold-glow', best >= 3 && best < 5);
    main.innerHTML = `<div class="tpack po-pack" style="--pc:${pack.color}">
        <div class="tpack-top"><span>✂ ─ ─ ─ ─ ─ ─ ─ ─</span></div>
        <div class="tpack-body"><div class="pack-logo">${esc(pack.name)}</div><div class="pack-cover">${cardHTML(PACK_COVER[pack.id], { small: true })}</div></div>
        <div class="tear-line"><div class="tear-progress"></div><div class="tear-spark"></div></div>
        <div class="tear-hand">👆</div>
      </div>`;
    foot.innerHTML = '<p class="po-hint">沿著卡包上方的虛線 <b>向右滑動</b> 撕開卡包</p>';
    const tpack = main.querySelector('.tpack');
    const top = tpack.querySelector('.tpack-top');
    const body = tpack.querySelector('.tpack-body');
    const prog = tpack.querySelector('.tear-progress');
    const spark = tpack.querySelector('.tear-spark');
    tpack.animate([{ transform: 'translateY(60vh) scale(.6) rotate(-10deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 600, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    let startX = null, p = 0, done = false;
    const set = v => {
      p = Math.max(0, Math.min(1, v));
      prog.style.width = `${p * 100}%`;
      spark.style.left = `${p * 100}%`;
      spark.style.opacity = p > 0 && p < 1 ? 1 : 0;
      top.style.transform = `rotate(${-p * 9}deg) translateY(${-p * 10}px)`;
      tpack.classList.toggle('tearing', p > 0);
    };
    let ended = false;
    const end = () => { if (ended) return; ended = true; ctx.onSkip = null; resolve(); };
    ctx.onSkip = () => { done = true; end(); };
    const finish = async () => {
      if (done) return;
      done = true;
      set(1);
      tpack.classList.remove('po-float');
      stage.classList.add('torn');
      buzz(30);
      await Promise.all([
        top.animate([{ transform: top.style.transform }, { transform: 'translate(120px, -260px) rotate(-40deg)', opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).finished,
        body.animate([{ transform: 'none' }, { transform: 'translateY(-8px) scale(1.03)', offset: .3 }, { transform: 'translateY(8px)' }], { duration: 500, delay: 150, easing: 'ease-out', fill: 'forwards' }).finished,
      ].map(x => x.catch(() => {})));
      stage.classList.remove('torn');
      end();
    };
    tpack.classList.add('po-float');
    tpack.addEventListener('pointerdown', e => {
      if (done) return;
      startX = e.clientX;
      tpack.setPointerCapture?.(e.pointerId);
      tpack.querySelector('.tear-hand').style.display = 'none';
    });
    tpack.addEventListener('pointermove', e => {
      if (startX === null || done) return;
      set((e.clientX - startX) / (tpack.clientWidth * 0.7));
      if (p >= 1) finish();
    });
    const release = () => {
      if (startX === null || done) return;
      startX = null;
      if (p >= 0.85) { finish(); return; }
      const from = p, t0 = performance.now();
      const back = now => { const k = Math.min(1, (now - t0) / 220); set(from * (1 - k)); if (k < 1 && !done) requestAnimationFrame(back); };
      requestAnimationFrame(back);
      if (from < 0.08) tpack.animate([{ rotate: '0deg' }, { rotate: '-3deg' }, { rotate: '3deg' }, { rotate: '0deg' }], { duration: 300 });
    };
    tpack.addEventListener('pointerup', release);
    tpack.addEventListener('pointercancel', release);
  });
}

// 第二階段：卡片從包裡升起成一疊，由普通到稀有排列；稀有卡先背面朝上，點一下翻開
function poStack(ctx, chunk) {
  return new Promise(resolve => {
    const { stage, main, foot } = ctx;
    const order = chunk.map((x, i) => ({ ...x, i })).sort((a, b) => rankOf(a.c) - rankOf(b.c) || a.i - b.i);
    const packEl = main.querySelector('.tpack');
    const deck = document.createElement('div');
    deck.className = 'po-deck';
    // 最後一張（最稀有）放在最底下，所以反向插入
    deck.innerHTML = order.map((x, k) => {
      const r = rankOf(x.c);
      const hidden = r >= 4;
      return `<div class="po-card ${hidden ? 'hidden' : 'shown'} ${r >= 5 ? 'special' : r >= 3 ? 'gold' : ''}" data-k="${k}" style="z-index:${order.length - k}">
        <div class="po-flip">
          <div class="po-back"><span class="ball"></span></div>
          <div class="po-front">${cardHTML(x.c)}${x.isNew ? '<span class="new">NEW</span>' : ''}<span class="rar-tag">${RARITY_LABEL[x.c.rarity]}${x.c.variant ? '・特別版' : ''}</span></div>
        </div></div>`;
    }).join('');
    main.appendChild(deck);
    foot.innerHTML = `<p class="po-hint">左右滑動卡片（或點一下）看下一張</p><div class="po-dots">${order.map(() => '<i></i>').join('')}</div>`;
    const els = [...deck.querySelectorAll('.po-card')];
    const dots = [...foot.querySelectorAll('.po-dots i')];
    let idx = 0, busy = true, done = false;
    const end = () => { if (done) return; done = true; ctx.onSkip = null; deck.remove(); resolve(); };
    ctx.onSkip = end;

    // 卡疊從包裡升起，包往下沉
    (async () => {
      els.forEach((el, k) => el.style.transform = `translateY(${Math.min(k, 3) * 4}px)`);
      if (packEl) packEl.querySelector('.tpack-body').animate([{ transform: 'translateY(8px)' }, { transform: 'translateY(75vh)', opacity: 0 }], { duration: 700, delay: 350, easing: 'ease-in', fill: 'forwards' });
      await deck.animate([{ transform: 'translateY(22%) scale(.78)', clipPath: 'inset(-50% -50% 72% -50%)' }, { transform: 'translateY(-6%) scale(1.02)', clipPath: 'inset(-50% -50% -50% -50%)', offset: .7 }, { transform: 'none', clipPath: 'inset(-50% -50% -50% -50%)' }], { duration: 850, delay: 150, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' }).finished.catch(() => {});
      packEl?.remove();
      busy = false;
      prep();
    })();

    const prep = () => {
      dots.forEach((d, k) => d.classList.toggle('on', k === idx));
      const el = els[idx];
      if (!el) return;
      el.classList.add('top');
      // 下一張是稀有卡時，整疊跟著發光預告
      stage.classList.toggle('rare-glow', el.classList.contains('special') && el.classList.contains('hidden'));
      stage.classList.toggle('gold-glow', el.classList.contains('gold') && el.classList.contains('hidden'));
      if (el.classList.contains('hidden')) foot.querySelector('.po-hint').textContent = '✨ 稀有卡！點一下翻開';
      else foot.querySelector('.po-hint').textContent = '左右滑動卡片（或點一下）看下一張';
    };

    const reveal = async el => {
      busy = true;
      const special = el.classList.contains('special');
      buzz(special ? [30, 40, 60] : 25);
      el.classList.add('charging');
      await sleep(special ? 700 : 350);
      el.classList.remove('charging', 'hidden');
      el.classList.add('shown', 'burst');
      stage.classList.add('flash');
      setTimeout(() => stage.classList.remove('flash'), 400);
      await sleep(600);
      el.classList.remove('burst');
      stage.classList.remove('rare-glow', 'gold-glow');
      foot.querySelector('.po-hint').textContent = '左右滑動卡片（或點一下）看下一張';
      busy = false;
    };

    const fly = async (el, dir) => {
      busy = true;
      el.classList.remove('top');
      const cur = el.style.transform || 'none';
      const a = el.animate([{ transform: cur }, { transform: `translate(${dir * 130}vw, -8vh) rotate(${dir * 28}deg)` }], { duration: 380, easing: 'cubic-bezier(.4,.1,.7,.6)', fill: 'forwards' });
      idx++;
      els.slice(idx).forEach((e2, k) => e2.animate([{ transform: e2.style.transform }, { transform: `translateY(${Math.min(k, 3) * 4}px)` }], { duration: 250, fill: 'forwards' }));
      await a.finished.catch(() => {});
      el.remove();
      if (idx >= els.length) { end(); return; }
      busy = false;
      prep();
    };

    // 拖曳：卡片跟著手指移動並傾斜，超過門檻就飛走，否則彈回
    let sx = null, sy = 0, dx = 0, moved = false;
    deck.addEventListener('pointerdown', e => {
      const el = els[idx];
      if (busy || !el || !el.contains(e.target)) return;
      sx = e.clientX; sy = e.clientY; dx = 0; moved = false;
      deck.setPointerCapture?.(e.pointerId);
    });
    deck.addEventListener('pointermove', e => {
      const el = els[idx];
      if (sx === null || busy || !el) return;
      dx = e.clientX - sx;
      const dy = (e.clientY - sy) * 0.3;
      if (Math.abs(dx) > 6) moved = true;
      if (el.classList.contains('hidden')) { el.style.transform = `translate(${dx * 0.15}px, ${dy * 0.3}px) rotate(${dx * 0.02}deg)`; return; }
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.06}deg)`;
    });
    const up = () => {
      const el = els[idx];
      if (sx === null || !el) return;
      sx = null;
      if (busy) return;
      if (el.classList.contains('hidden')) { el.style.transform = ''; reveal(el); return; }
      if (!moved) { fly(el, -1); return; }
      if (Math.abs(dx) > Math.min(110, deck.clientWidth * 0.35)) { fly(el, Math.sign(dx)); return; }
      el.animate([{ transform: el.style.transform }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
      el.style.transform = '';
    };
    deck.addEventListener('pointerup', up);
    deck.addEventListener('pointercancel', () => { sx = null; const el = els[idx]; if (el) el.style.transform = ''; });
  });
}

// 第三階段：本包總覽（稀有卡有提示），點卡可放大
function poSummary(ctx, list, doneLabel) {
  return new Promise(resolve => {
    const { stage, main, foot } = ctx;
    stage.classList.remove('rare-glow', 'gold-glow');
    stage.classList.add('po-summary-mode');
    ctx.onSkip = null;
    main.innerHTML = `<div class="po-grid ${list.length > 5 ? 'many' : ''}">${list.map((x, i) => `<div class="po-cell ${rankOf(x.c) >= 5 ? 'special' : rankOf(x.c) >= 3 ? 'gold' : ''}" data-zi="${i}" style="animation-delay:${Math.min(i, 14) * 70}ms">
      ${cardHTML(x.c, { small: true })}${x.isNew ? '<span class="new">NEW</span>' : ''}<span class="rar-tag">${RARITY_LABEL[x.c.rarity]}${x.c.variant ? '・特別版' : ''}</span></div>`).join('')}</div>`;
    const newN = list.filter(x => x.isNew).length;
    foot.innerHTML = `<p class="po-hint">${newN ? `獲得 <b>${newN}</b> 張新卡！` : '開包結果'}　點卡片可以放大</p><div class="po-buttons"><button class="btn primary" data-po="next">${esc(doneLabel)}</button></div>`;
    main.querySelectorAll('[data-zi]').forEach(el => el.onclick = () => showModal(`<div class="zoom">${cardHTML(list[+el.dataset.zi].c)}</div>`, { buttons: [{ label: '關閉', value: null }] }));
    foot.querySelector('[data-po="next"]').onclick = () => {
      stage.classList.remove('po-summary-mode');
      main.innerHTML = '';
      resolve();
    };
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

// ================= 圖鑑 =================
// 依擴充包分區：擁有的卡會亮起，沒有的卡變暗，點擊可查看在哪個卡包取得
const DEX_SETS = [
  { id: 'starter', name: '基礎系列', desc: 'ex初階牌組・皮卡丘ex起始組合・SVQP', match: c => ['SVD', 'SVC', 'SVQP'].includes(c.set) },
  { id: 'meta', name: '環境強化卡', desc: '各擴充包的環境主流卡', match: c => !['SVD', 'SVC', 'SVQP', 'SV8', 'SV8a', 'M3'].includes(c.set) },
  { id: 'SV8', name: '超電突圍', desc: 'SV8', match: c => c.set === 'SV8' },
  { id: 'SV8a', name: '太晶慶典', desc: 'SV8a', match: c => c.set === 'SV8a' },
  { id: 'M3', name: '虛無歸零', desc: 'M3', match: c => c.set === 'M3' },
];
const dexCards = CARDS.filter(c => !isBasicEnergy(c));
const dexNum = c => { const n = c.id.split('-')[1]; return /^\d+$/.test(n) ? +n : 999; };
const DEX_SORTED = [...dexCards].sort((a, b) => a.set.localeCompare(b.set) || dexNum(a) - dexNum(b));
function collection() {
  const state = { q: '', cat: '', type: '', owned: false, ownedToggle: false, tab: 'all', show: 'all' };
  const render = (keepFocus = false) => {
    const s = store.load();
    const have = c => (s.collection[c.id] || 0) > 0;
    const tabs = [{ id: 'all', name: '全部' }, ...DEX_SETS, { id: 'variant', name: '特別插畫版', match: c => !!c.variant }];
    const inTab = (t, c) => t.id === 'all' || (t.id === 'variant' ? !!c.variant : !c.variant && t.match(c));
    const prog = t => { const l = dexCards.filter(c => inTab(t, c)); return [l.filter(have).length, l.length]; };
    const [hv, tot] = prog(tabs[0]);
    const tile = c => {
      const n = s.collection[c.id] || 0;
      return `<div class="dex-item ${n ? 'got' : 'locked'}" data-zoom="${c.id}">${cardHTML(c, { small: true, count: n || null, extraClass: n ? '' : 'dex-locked' })}
        ${n ? '' : `<div class="dex-lock"><span>？</span><small>${esc(c.set)} ${esc(c.id.split('-')[1])}</small></div>`}</div>`;
    };
    const filtered = applyFilter(DEX_SORTED, state).filter(c => state.show === 'all' || (state.show === 'got') === have(c));
    const sections = (state.tab === 'all' ? tabs.slice(1) : tabs.filter(t => t.id === state.tab)).map(t => {
      const list = filtered.filter(c => inTab(t, c));
      if (!list.length) return '';
      const [a, b] = prog(t);
      return `<section class="dex-sec"><h3>${esc(t.name)} <small>${a} / ${b}</small></h3>
        <div class="progress thin"><div style="width:${a / b * 100}%"></div></div>
        <div class="card-grid">${list.map(tile).join('')}</div></section>`;
    }).join('') || '<p class="sub">沒有符合條件的卡片</p>';
    if (keepFocus && app.querySelector('#dex-body')) { app.querySelector('#dex-body').innerHTML = sections; return; }
    mount(`<h2>圖鑑 <small>${hv} / ${tot}（${Math.round(hv / tot * 100)}%）</small></h2>
      <div class="progress"><div style="width:${hv / tot * 100}%"></div></div>
      <p class="sub">已擁有的卡片會亮起來；還沒有的卡片點一下，可以查看在哪個卡包能開到。</p>
      <div class="dex-tabs">${tabs.map(t => { const [a, b] = prog(t); return `<button class="dex-tab ${state.tab === t.id ? 'on' : ''}" data-tab="${t.id}">${esc(t.name)}<small>${a}/${b}</small></button>`; }).join('')}</div>
      ${filterBar(state)}
      <div class="dex-show">${[['all', '全部'], ['got', '已擁有'], ['missing', '未擁有']].map(([k, n]) => `<button class="tf-show ${state.show === k ? 'on' : ''}" data-show="${k}">${n}</button>`).join('')}
        <label><input type="checkbox" id="imgs" ${getShowImages() ? 'checked' : ''}> 顯示官方卡圖</label></div>
      <div id="dex-body">${sections}</div>`, 'collection');
    bindFilter(state, render);
    app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; render(); });
    app.querySelectorAll('[data-show]').forEach(b => b.onclick = () => { state.show = b.dataset.show; render(); });
    app.querySelector('#imgs').onchange = e => { setShowImages(e.target.checked); render(); };
  };
  render();
}
// 卡片詳細：持有張數與取得方式
document.addEventListener('click', e => {
  const z = e.target.closest('[data-zoom]');
  if (!z) return;
  const c = CARD_MAP.get(z.dataset.zoom);
  if (isBasicEnergy(c)) { showModal(`<div class="zoom">${cardHTML(c)}</div><p class="sub center">基本能量：無限供應</p>`, { buttons: [{ label: '關閉', value: null }] }); return; }
  const n = store.owned(c.id);
  const packs = packsFor(c);
  // 對戰中、編輯牌組中或在其他對話框裡時，不顯示前往商店的按鈕
  const canGo = !document.querySelector('.modal-wrap') && !app.querySelector('.battle, .editor');
  const starters = STARTER_DECKS.filter(d => d.cards[c.id]);
  const pct = x => (x >= 0.1 ? `${(x * 100).toFixed(0)}%` : x >= 0.01 ? `${(x * 100).toFixed(1)}%` : `${(x * 100).toFixed(2)}%`);
  const base = c.variant ? CARD_MAP.get(c.variant) : null;
  const html = `<div class="dex-detail"><div class="zoom">${cardHTML(c)}</div>
    <div class="dex-info">
      <div class="dex-own ${n ? 'got' : ''}">${n ? `✅ 已擁有 ${n} 張` : '🔒 尚未擁有'}</div>
      <p class="sub">${esc(c.set)} ${esc(c.id.split('-')[1])}・稀有度 ${RARITY_LABEL[c.rarity] || c.rarity}${c.variant ? '・特別插畫版' : ''}</p>
      ${base ? `<p class="sub">效果與一般版「${esc(base.name)}」（${esc(base.id)}）相同，組牌時合計最多 4 張。</p>` : ''}
      <h4>取得方式</h4>
      ${starters.length ? `<div class="get-row"><span>🎁 起始牌組「${starters.map(d => esc(d.name)).join('」「')}」內含</span></div>` : ''}
      ${packs.map(({ pack, chance }) => `<div class="get-row" style="--pc:${pack.color}">
        <span class="get-pack">${esc(pack.name)}</span>
        <span class="get-rate">每包約 ${pct(chance)}</span>
        ${canGo ? `<button class="btn tiny primary" data-goshop="${pack.id}">🪙 ${pack.price} 去購買</button>` : `<span class="get-price">🪙 ${pack.price}</span>`}</div>`).join('') || '<p class="sub">目前無法從卡包取得</p>'}
      <p class="sub tiny-note">機率為依卡包各欄位稀有度估算的數值。</p>
    </div></div>`;
  showModal(html, {
    wide: true,
    buttons: [{ label: '關閉', value: null }],
    onClick: (ev, body, close) => {
      const b = ev.target.closest('[data-goshop]');
      if (!b) return;
      close();
      route('shop', b.dataset.goshop);
    },
  });
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
    <div class="danger-zone"><button class="btn danger" id="reset">重置目前存檔</button></div>
  </div>`, 'rules');
  app.querySelector('#reset').onclick = async () => {
    const ok = await showModal(`<p>確定要重置目前的存檔「${esc(store.activeSlot()?.name || '')}」（金幣、收藏、牌組、戰績）嗎？其他存檔不受影響。</p>`, { buttons: [{ label: '取消', value: false }, { label: '重置', danger: true, value: true }] });
    if (ok) { store.reset(); home(); }
  };
}

route('home');
