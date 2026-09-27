// 新手教學：規則說明投影片 + 教學對戰的引導
import { cardHTML, energyIcon, esc } from './cardview.js';
import { showModal } from './modal.js';

// ================= 規則說明投影片 =================
const back = '<div class="tut-back"><span class="ball"></span></div>';
const SLIDES = [
  {
    title: '對戰的目標',
    art: `<div class="tut-prizes">${back.repeat(6)}</div>`,
    body: `<p>雙方各自在一旁放 <b>6 張獎賞卡</b>。每擊倒對手 1 隻寶可夢，就能拿 1 張獎賞卡。</p>
      <p class="big">🏆 先拿完 6 張獎賞卡的人獲勝！</p>
      <p class="sub">另外，對手場上沒有寶可夢、或對手回合開始時牌庫已經沒有卡可以抽，你也會獲勝。</p>`,
  },
  {
    title: '三種卡片',
    art: `<div class="tut-cards">${['SVD-034', 'SVD-118', 'SVD-LIG'].map(id => cardHTML(id, { small: true })).join('')}</div>`,
    body: `<ul><li><b>寶可夢</b>：上場戰鬥的夥伴。「基礎」寶可夢可以直接放上場，「1階／2階進化」要疊在進化前的寶可夢身上。</li>
      <li><b>訓練家</b>：幫你抽卡、找卡、換位置的道具。<b>物品</b>每回合可用很多張，<b>支援者</b>每回合只能用 1 張。</li>
      <li><b>能量</b>：附在寶可夢身上，湊齊招式需要的能量才能攻擊。</li></ul>`,
  },
  {
    title: '場地介紹',
    art: `<div class="tut-field">
      <div class="tf-row"><div class="tf-box prize">獎賞卡<br>6張</div><div class="tf-box bench">備戰區<br><small>最多5隻候補</small></div><div class="tf-box deck">牌庫</div></div>
      <div class="tf-row"><div class="tf-box active">戰鬥場<br><small>負責戰鬥的1隻</small></div><div class="tf-box discard">棄牌區</div></div></div>`,
    body: `<ul><li><b>戰鬥場</b>：只有這隻寶可夢能攻擊，也會被對手攻擊。</li>
      <li><b>備戰區</b>：最多 5 隻候補。戰鬥寶可夢被擊倒時，從這裡選一隻上場。</li>
      <li><b>牌庫／棄牌區</b>：用過的卡、被擊倒的寶可夢會進到棄牌區。</li></ul>`,
  },
  {
    title: '回合流程',
    art: `<div class="tut-flow"><div>① 抽 1 張卡</div><span>→</span><div>② 準備行動</div><span>→</span><div>③ 攻擊<br><small>回合結束</small></div></div>`,
    body: `<p>② 準備行動可以用任意順序做：</p>
      <ul><li>把基礎寶可夢放到備戰區</li><li>讓寶可夢進化</li><li>附加能量（<b>每回合 1 次</b>）</li>
      <li>使用訓練家卡（支援者每回合 1 張）</li><li>撤退：丟棄能量，和備戰寶可夢交換（每回合 1 次）</li></ul>
      <p class="sub">⚠️ 先攻玩家的第 1 回合不能攻擊，也不能用支援者卡。</p>`,
  },
  {
    title: '能量與招式',
    art: `<div class="tut-cards">${cardHTML('SVD-034')}</div>`,
    body: `<p>每個招式左邊的圖示是<b>需要的能量</b>。例如皮卡丘的「皮卡伏特」需要 ${energyIcon('L')}${energyIcon('C')}：</p>
      <ul><li>${energyIcon('L')} 要用<b>雷能量</b></li><li>${energyIcon('C')}（無色）用<b>任何能量</b>都可以</li></ul>
      <p>所以皮卡丘身上有 2 張雷能量，就能使用「皮卡伏特」造成 30 點傷害。受到的傷害達到 HP 就會<b>昏厥</b>（被擊倒）。</p>`,
  },
  {
    title: '進化',
    art: `<div class="tut-cards">${cardHTML('SVD-034', { small: true })}<div class="tut-arrow">➜</div>${cardHTML('SVD-035', { small: true })}</div>`,
    body: `<p>把「雷丘」疊到場上的「皮卡丘」身上就是<b>進化</b>，HP 和招式都會變強，身上的能量和傷害會保留。</p>
      <p class="sub">雙方的第 1 回合不能進化；剛放上場的寶可夢也要等到下個回合才能進化。</p>`,
  },
  {
    title: '弱點與寶可夢ex',
    art: `<div class="tut-cards">${cardHTML('SVD-030', { small: true })}${cardHTML('SVC-001', { small: true })}</div>`,
    body: `<ul><li><b>弱點</b>：卡片下方的「弱點 ${energyIcon('L')}×2」代表被雷屬性攻擊時傷害變成 <b>2 倍</b>。</li>
      <li><b>抵抗力</b>：受到該屬性攻擊時傷害 -30。</li>
      <li><b>寶可夢ex</b>：HP 高、招式強，但被擊倒時對手可以拿 <b>2 張</b>獎賞卡（超級進化ex 是 3 張）。</li></ul>`,
  },
  {
    title: '遊戲操作',
    art: '<div class="tut-flow ops"><div>👆 點手牌<br><small>放寶可夢・附能量・用卡</small></div><div>👆 點自己的寶可夢<br><small>攻擊・撤退・特性</small></div><div>💡 提示<br><small>不知道怎麼辦時</small></div></div>',
    body: `<ul><li>會發光的手牌代表現在可以使用。</li>
      <li>要選擇目標時，可以點的寶可夢會閃爍黃色外框。</li>
      <li>對戰中按「<b>💡 提示</b>」，AI 會建議你下一步怎麼做。</li>
      <li>右邊（手機在下方）的對戰紀錄會記下雙方做過的事。</li></ul>
      <p class="big">準備好了嗎？來打一場練習賽吧！</p>`,
  },
];

export function showRulesSlides() {
  return new Promise(resolve => {
    let i = 0;
    const html = () => {
      const s = SLIDES[i];
      return `<div class="tut-slide"><div class="tut-step">${i + 1} / ${SLIDES.length}</div><h2>${esc(s.title)}</h2>
        <div class="tut-art">${s.art}</div><div class="tut-body">${s.body}</div>
        <div class="tut-dots">${SLIDES.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div></div>`;
    };
    const open = () => showModal(html(), {
      wide: true,
      buttons: [
        { label: '離開', value: 'quit' },
        ...(i > 0 ? [{ label: '← 上一頁', value: 'prev' }] : []),
        i < SLIDES.length - 1 ? { label: '下一頁 →', primary: true, value: 'next' } : { label: '開始練習對戰！', primary: true, value: 'battle' },
      ],
    }).then(v => {
      if (v === 'next') { i++; open(); } else if (v === 'prev') { i--; open(); } else resolve(v === 'battle');
    });
    open();
  });
}

// ================= 教學對戰設定 =================
export const TUTORIAL_BATTLE = {
  playerDeck: {
    id: 'tutorial-player', name: '教學用 皮卡丘牌組', cover: 'SVD-034',
    cards: {
      'SVD-034': 4, 'SVD-035': 3, 'SVD-036': 4, 'SVD-037': 2, 'SVC-001': 2,
      'SVD-118': 4, 'SVD-117': 3, 'SVD-135': 3, 'SVD-133': 2, 'SVD-122': 2,
      'SVD-LIG': 31,
    },
  },
  aiDeck: {
    id: 'tutorial-ai', name: '水系練習牌組', trainer: '新手訓練家 小遊', cover: 'SVD-030',
    desc: '這是練習賽，對手會手下留情。跟著畫面上方的教學提示一步一步來吧！',
    cards: { 'SVD-030': 4, 'SVD-024': 4, 'SVD-027': 4, 'SVD-115': 2, 'SVD-133': 2, 'SVD-WAT': 44 },
  },
  firstPlayer: 0,
  stacks: {
    0: { hand: ['SVD-034', 'SVD-036', 'SVD-118', 'SVD-LIG', 'SVD-LIG', 'SVD-035', 'SVD-133'], draws: ['SVD-LIG', 'SVD-LIG', 'SVC-001', 'SVD-LIG'] },
    1: { hand: ['SVD-030', 'SVD-WAT', 'SVD-WAT', 'SVD-WAT', 'SVD-115', 'SVD-WAT', 'SVD-133'], draws: ['SVD-WAT', 'SVD-024', 'SVD-WAT'] },
  },
};

// ================= 教學提示 =================
const me = g => g.players[0];
const handHas = (g, cid) => me(g).hand.some(i => i.cid === cid);
const ev = (evs, pred) => evs.some(pred);
const modalOpen = () => !!document.querySelector('.modal-wrap:not(.closing)');

export const TUTORIAL_STEPS = [
  {
    text: '歡迎來到練習賽！首先選出<b>戰鬥寶可夢</b>：點選「<b>皮卡丘</b>」，再按「確定」。它會站在最前面負責戰鬥。',
    target: () => '.modal .pick:has([data-cid="SVD-034"]), .modal-buttons .btn.primary',
    done: g => !!me(g).active,
  },
  {
    text: '手上其他的<b>基礎寶可夢</b>可以放到<b>備戰區</b>當候補。點選「<b>小磁怪</b>」後按「確定」。',
    target: () => '.modal .pick:has([data-cid="SVD-036"]), .modal-buttons .btn.primary',
    done: g => g.turn >= 1,
  },
  {
    text: '你先攻！回合開始時會自動抽 1 張卡。先試試訓練家卡：點手牌中發光的「<b>巢穴球</b>」，再按「使用」。',
    modalText: '在視窗中選擇要放到備戰區的寶可夢，然後按「確定」。',
    target: () => (modalOpen() ? '.modal .pick, .modal-buttons .btn.primary' : '#hand .mini[data-cid="SVD-118"]'),
    done: (g, evs) => ev(evs, e => e.type === 'trainer' && e.player === 0) && !modalOpen(),
    skip: g => g.current === 0 && g.turn === 1 && !handHas(g, 'SVD-118'),
  },
  {
    text: '接著<b>附加能量</b>：點手牌的「<b>基本雷能量</b>」→「附加能量」→ 點戰鬥場上的皮卡丘。<br><small>能量每回合只能附加 1 張，要好好規劃！</small>',
    target: g => (document.querySelector('.slot.highlight') ? '.slot.highlight' : modalOpen() ? '.modal-buttons .btn.primary' : '#hand .mini[data-cid="SVD-LIG"]'),
    done: (g, evs) => ev(evs, e => e.type === 'energy' && e.player === 0) || me(g).energyAttached,
  },
  {
    text: '<b>先攻玩家的第 1 回合不能攻擊</b>，也不能使用支援者卡。準備好了就按「<b>結束回合</b>」。',
    target: () => '[data-act=end]',
    done: g => g.current === 1 || g.turn >= 2,
  },
  {
    text: '現在是對手的回合，看看對手做了什麼。對戰紀錄會記下雙方的每個行動。',
    target: () => '#log-panel',
    done: g => g.current === 0 && g.turn >= 3,
  },
  {
    text: '又輪到你了！皮卡丘的「<b>皮卡伏特</b>」需要 ${L}${C} 2 個能量。再<b>附加 1 張雷能量</b>給戰鬥場上的皮卡丘。',
    target: g => (document.querySelector('.slot.highlight') ? '.slot.highlight' : modalOpen() ? '.modal-buttons .btn.primary' : '#hand .mini[data-cid="SVD-LIG"]'),
    done: (g, evs) => ev(evs, e => e.type === 'energy' && e.player === 0) || me(g).energyAttached,
  },
  {
    text: '看看對手的海地鼠：它的<b>弱點是 ${L} ×2</b>！皮卡伏特 30 點會變成 60 點，剛好擊倒它。按「<b>⚔ 攻擊</b>」→「皮卡伏特」！',
    target: () => (modalOpen() ? '.modal-buttons .atk-1' : '[data-act=attack-menu]'),
    done: (g, evs) => ev(evs, e => e.type === 'attack' && e.player === 0),
    skip: g => g.current === 0 && !g.legalActions(me(g)).some(a => a.type === 'attack') && me(g).energyAttached,
  },
  {
    text: g => (me(g).prizes.length < 6
      ? '漂亮！擊倒對手的寶可夢，你拿到了 1 張<b>獎賞卡</b>（加入手牌）。拿完 6 張就獲勝！<br><small>攻擊之後回合會自動結束。</small>'
      : '這次沒有擊倒對手。擊倒對手的寶可夢就能拿 1 張<b>獎賞卡</b>，拿完 6 張就獲勝！<br><small>攻擊之後回合會自動結束。</small>'),
    target: () => null,
    done: g => g.current === 0 && g.turn >= 5,
  },
  {
    text: '來試試<b>進化</b>：點手牌中的「<b>雷丘</b>」→「進化」→ 點皮卡丘。雷丘 HP 140，招式也更強！',
    target: g => (document.querySelector('.slot.highlight') ? '.slot.highlight' : modalOpen() ? '.modal-buttons .btn.primary' : '#hand .mini[data-cid="SVD-035"]'),
    done: (g, evs) => ev(evs, e => e.type === 'evolve' && e.player === 0),
    skip: g => !handHas(g, 'SVD-035') || !me(g).active || !['皮卡丘'].includes(g.top(me(g).active).name) && !me(g).bench.some(s => g.top(s).name === '皮卡丘'),
  },
  {
    text: '基本操作都學會了！接下來<b>自由對戰</b>，打倒對手吧。<br>不知道下一步要做什麼時，按「<b>💡 提示</b>」讓 AI 給你建議。',
    target: () => '[data-act=hint]',
    done: () => false,
    last: true,
  },
];

export class Coach {
  constructor(view, steps) {
    this.view = view;
    this.steps = steps;
    this.i = 0;
    this.events = [];
    this.panel = document.createElement('div');
    this.panel.className = 'coach';
    document.body.appendChild(this.panel);
    this.panel.addEventListener('click', e => {
      if (e.target.closest('[data-coach=skip]')) this.next();
      if (e.target.closest('[data-coach=close]')) this.destroy();
      if (e.target.closest('[data-coach=min]')) this.panel.classList.toggle('min');
    });
    this.timer = setInterval(() => this.tick(), 250);
  }
  onEvent(e) { this.events.push(e); }
  next() { this.i++; this.events = []; this.shown = null; this.tick(); }
  tick() {
    const g = this.view.game;
    let guard = 0;
    while (this.i < this.steps.length && guard++ < 20) {
      const s = this.steps[this.i];
      if ((s.done && s.done(g, this.events)) || (s.skip && s.skip(g))) { this.i++; this.events = []; continue; }
      break;
    }
    const s = this.steps[this.i];
    document.querySelectorAll('.coach-hl').forEach(el => el.classList.remove('coach-hl'));
    if (!s) { this.destroy(); return; }
    const raw = modalOpen() && s.modalText ? s.modalText : s.text;
    const text = (typeof raw === 'function' ? raw(g) : raw).replace(/\$\{L\}/g, energyIcon('L')).replace(/\$\{C\}/g, energyIcon('C'));
    const key = `${this.i}|${text}`;
    if (this.shown !== key) {
      this.shown = key;
      this.panel.innerHTML = `<div class="coach-head"><span>📖 新手教學 ${Math.min(this.i + 1, this.steps.length)}/${this.steps.length}</span>
        <span><button data-coach="min" title="縮小">–</button><button data-coach="close" title="關閉教學">✕</button></span></div>
        <div class="coach-text">${text}</div>
        ${s.last ? '<div class="coach-btns"><button class="btn tiny primary" data-coach="close">我知道了</button></div>' : '<div class="coach-btns"><button class="btn tiny" data-coach="skip">跳過這一步</button></div>'}`;
      this.panel.classList.remove('pop'); void this.panel.offsetWidth; this.panel.classList.add('pop');
    }
    const sel = s.target?.(g);
    if (sel) document.querySelectorAll(sel).forEach(el => el.classList.add('coach-hl'));
  }
  destroy() {
    clearInterval(this.timer);
    document.querySelectorAll('.coach-hl').forEach(el => el.classList.remove('coach-hl'));
    this.panel.remove();
    this.i = this.steps.length;
  }
}
