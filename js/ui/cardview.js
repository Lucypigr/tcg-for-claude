// 卡片外觀（以CSS繪製，可選擇載入官方卡圖）
import { cardData, stageName, TYPE_NAMES } from '../engine/cards.js';
import { COND_NAMES } from '../engine/game.js';
import { IMAGE_IDS } from '../data/images.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

let showImages = true;
try { showImages = localStorage.getItem('ptcg-images') !== 'off'; } catch { /* ignore */ }
export function setShowImages(v) { showImages = v; try { localStorage.setItem('ptcg-images', v ? 'on' : 'off'); } catch { /* ignore */ } }
export function getShowImages() { return showImages; }

export function energyIcon(t, cls = '') {
  return `<span class="eicon t-${t} ${cls}" title="${TYPE_NAMES[t]}">${t === '*' ? '★' : TYPE_NAMES[t]}</span>`;
}

// 官方卡圖（台灣寶可夢卡牌官方訓練家網站），載入失敗時自動改用文字卡面
export function imageUrl(c) {
  const id = IMAGE_IDS[c.id];
  return id ? `https://asia.pokemon-card.com/tw/card-img/tw${String(id).padStart(8, '0')}.png` : null;
}
// 優先使用專案內的縮小版卡圖（img/cards），失敗時改讀官方網站，再失敗則使用文字卡面
export function imgTag(c) {
  const remote = showImages && imageUrl(c);
  if (!remote) return '';
  return `<img class="card-img" loading="lazy" alt="" src="img/cards/${c.id}.webp" data-alt="${remote}" onload="this.classList.add('ok')" onerror="if(this.dataset.alt){this.src=this.dataset.alt;this.dataset.alt=''}else{this.remove()}">`;
}

const RARITY_MARK = { C: '●', U: '◆', R: '★', RR: '★★', SR: '★★★', ACE: 'ACE' };

export function cardHTML(c, { small = false, count = null, dim = false, extraClass = '', uid = '' } = {}) {
  if (typeof c === 'string') c = cardData(c);
  const typeCls = c.cat === 'P' ? `t-${c.type}` : c.cat === 'E' ? `t-${c.provides || 'C'} energy` : `trainer tr-${c.trainer}`;
  let body = '';
  if (c.cat === 'P') {
    for (const ab of c.abilities) body += `<div class="ability"><span class="ab-tag">特性</span><b>${esc(ab.name)}</b><p>${esc(ab.text)}</p></div>`;
    for (const a of c.attacks) {
      body += `<div class="attack"><div class="atk-line"><span class="cost">${a.cost.map(t => energyIcon(t)).join('') || '<span class="nocost">－</span>'}</span><b class="atk-name">${esc(a.name)}</b><span class="dmg">${esc(a.dmg)}</span></div>${a.text ? `<p>${esc(a.text)}</p>` : ''}</div>`;
    }
  } else if (c.cat === 'T' || c.energy === 'special') {
    body = `<p class="ttext">${esc(c.text)}</p>`;
    if (c.cat === 'T') body += `<p class="trule">${c.trainer === 'Supporter' ? '每回合只能使用1張支援者卡。' : c.trainer === 'Stadium' ? '競技場卡會留在場上。' : c.trainer === 'Tool' ? '每隻寶可夢只能附1張寶可夢道具。' : '在自己的回合可使用任意張數。'}</p>`;
  } else {
    body = `<div class="big-energy">${energyIcon(c.provides, 'huge')}</div>`;
  }
  const foot = c.cat === 'P'
    ? `<div class="card-foot"><span>弱點 ${c.weak ? energyIcon(c.weak) + '×2' : '－'}</span><span>抵抗 ${c.resist ? energyIcon(c.resist) + '-30' : '－'}</span><span>撤退 ${c.retreat ? energyIcon('C').repeat(c.retreat) : '－'}</span></div>`
    : '';
  const head = c.cat === 'P'
    ? `<div class="card-top"><span class="stage">${stageName(c)}${c.from ? `<small>從${esc(c.from)}進化</small>` : ''}</span><span class="name">${esc(c.name)}</span><span class="hp"><small>HP</small>${c.hp}</span>${energyIcon(c.type)}</div>`
    : `<div class="card-top"><span class="stage">${stageName(c)}</span><span class="name">${esc(c.name)}</span>${c.ace ? '<span class="ace">ACE SPEC</span>' : ''}</div>`;
  const rule = (c.tera ? '<div class="rulebox tera">太晶：只要這隻寶可夢在備戰區，就不會受到招式的傷害。</div>' : '') +
    (c.cat === 'P' && (c.ex || c.mega) ? `<div class="rulebox">${c.mega ? '超級進化寶可夢ex昏厥時，對手獲得3張獎賞卡。' : '寶可夢ex昏厥時，對手獲得2張獎賞卡。'}</div>` : '');
  const glyph = c.cat === 'P' ? TYPE_NAMES[c.type] : c.cat === 'E' ? TYPE_NAMES[c.provides || 'C'] : { Item: '物', Supporter: '支', Stadium: '場', Tool: '具' }[c.trainer];
  return `<div class="card ${typeCls} rar-${c.rarity} ${small ? 'small' : ''} ${dim ? 'dim' : ''} ${c.ex ? 'is-ex' : ''} ${extraClass}" data-cid="${c.id}" ${uid ? `data-uid="${uid}"` : ''}>
    ${head}
    <div class="card-art"><span class="art-glyph">${glyph}</span>${small ? '' : ''}</div>
    <div class="card-body">${body}</div>
    ${rule}${foot}
    <div class="card-meta"><span>${c.set} ${c.id.split('-')[1]}</span><span class="rar">${RARITY_MARK[c.rarity] || ''}</span></div>
    ${imgTag(c)}
    ${count !== null ? `<div class="count-badge">×${count}</div>` : ''}
  </div>`;
}

// 手牌中的小卡
export function miniCardHTML(c, { uid = '', playable = false, selected = false, count = null } = {}) {
  if (typeof c === 'string') c = cardData(c);
  const typeCls = c.cat === 'P' ? `t-${c.type}` : c.cat === 'E' ? `t-${c.provides || 'C'} energy` : `trainer tr-${c.trainer}`;
  let sub = '';
  if (c.cat === 'P') sub = `${stageName(c)} HP${c.hp}`;
  else sub = stageName(c);
  const glyph = c.cat === 'P' ? TYPE_NAMES[c.type] : c.cat === 'E' ? TYPE_NAMES[c.provides || 'C'] : { Item: '物', Supporter: '支', Stadium: '場', Tool: '具' }[c.trainer];
  return `<div class="mini ${typeCls} ${playable ? 'playable' : ''} ${selected ? 'selected' : ''} ${c.ex ? 'is-ex' : ''}" data-uid="${uid}" data-cid="${c.id}">
    <div class="mini-glyph">${glyph}</div>
    <div class="mini-name">${esc(c.name)}</div>
    <div class="mini-sub">${sub}</div>
    ${imgTag(c)}
    ${count !== null ? `<div class="count-badge">×${count}</div>` : ''}
  </div>`;
}

// 場上的寶可夢
export function slotHTML(g, slot, { active = false, highlight = false, owner = 0 } = {}) {
  if (!slot) return `<div class="slot empty ${active ? 'active' : ''}"></div>`;
  const c = g.top(slot);
  const max = g.maxHp(slot);
  const left = Math.max(0, max - slot.damage);
  const pct = Math.max(0, Math.min(100, left / max * 100));
  const energies = slot.energy.map(e => { const ec = g.card(e); return ec.energy === 'basic' ? energyIcon(ec.provides) : `<span class="eicon special" title="${esc(ec.name)}">特</span>`; }).join('');
  const conds = Object.keys(slot.cond).filter(k => slot.cond[k]).map(k => `<span class="cond c-${k}">${COND_NAMES[k]}</span>`).join('');
  const tool = slot.tool ? `<div class="tool" title="${esc(g.card(slot.tool).name)}">🔧${esc(g.card(slot.tool).name)}</div>` : '';
  return `<div class="slot t-${c.type} ${active ? 'active' : ''} ${highlight ? 'highlight' : ''} ${c.ex ? 'is-ex' : ''}" data-slot="${slot.id}" data-owner="${owner}">
    <div class="slot-art"><span class="art-glyph">${TYPE_NAMES[c.type]}</span>${imgTag(c)}</div>
    <div class="slot-head"><span class="slot-name">${esc(c.name)}</span>${c.stage ? `<span class="slot-stage">${c.stage}階</span>` : ''}</div>
    <div class="hpbar"><div class="hpfill ${pct < 30 ? 'low' : pct < 60 ? 'mid' : ''}" style="width:${pct}%"></div><span class="hptext">${left}/${max}</span></div>
    <div class="slot-energy">${energies}</div>
    ${conds ? `<div class="conds">${conds}</div>` : ''}
    ${tool}
    ${slot.damage ? `<div class="dmg-counter">${slot.damage}</div>` : ''}
  </div>`;
}
