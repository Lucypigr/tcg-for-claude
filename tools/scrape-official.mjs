// 從台灣官方訓練家網站抓取一個擴充包的卡片資料（繁體中文），輸出與 js/data/cards.js 相同的格式
// 用法: node tools/scrape-official.mjs SVQP > out.json
import { execFileSync } from 'child_process';

const BASE = 'https://asia.pokemon-card.com/tw/card-search';
const get = url => execFileSync('curl', ['-sS', '--max-time', '30', '--retry', '3', url], { encoding: 'utf8', maxBuffer: 1 << 24 });
const TYPE = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M', Dragon: 'N', Colorless: 'C' };
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[\u200b-\u200d]/g, '').replace(/\s+/g, ' ').trim();
const types = s => [...s.matchAll(/energy\/(\w+)\.png/g)].map(m => TYPE[m[1]]);

export function parseDetail(id, set) {
  const h = get(`${BASE}/detail/${id}/`);
  const header = (h.match(/<h1 class="pageHeader cardDetail">([\s\S]*?)<\/h1>/) || [])[1] || '';
  const marker = strip((header.match(/evolveMarker">([\s\S]*?)<\/span>/) || [])[1] || '');
  const name = strip(header.replace(/<span class="evolveMarker">[\s\S]*?<\/span>/, ''));
  const num = strip((h.match(/collectorNumber">([\s\S]*?)<\/span>/) || [])[1] || '').split('/')[0];
  const out = { id: `${set}-${num}`, set, name, officialId: id };
  const hp = h.match(/<span class="number">(\d+)<\/span>/);
  if (hp) {
    out.cat = 'P';
    out.stage = /2階/.test(marker) ? 2 : /1階/.test(marker) ? 1 : 0;
    out.hp = +hp[1];
    out.type = types((h.match(/mainInfomation">([\s\S]*?)<\/p>/) || [])[1] || '')[0] || 'C';
    const evo = h.match(/evolution[\s\S]*?<\/section>/);
    out.abilities = [];
    out.attacks = [];
    for (const m of h.matchAll(/<div class="skill">([\s\S]*?)<\/div>/g)) {
      const blk = m[1];
      const nm = strip((blk.match(/skillName">([\s\S]*?)<\/span>/) || [])[1] || '');
      const eff = strip((blk.match(/skillEffect">([\s\S]*?)<\/p>/) || [])[1] || '');
      const cost = types((blk.match(/skillCost">([\s\S]*?)<\/span>/) || [])[1] || '');
      const dmg = strip((blk.match(/skillDamage">([\s\S]*?)<\/span>/) || [])[1] || '').replace('x', '×');
      if (!nm) continue;
      if (/^\[特性\]/.test(nm)) out.abilities.push({ name: nm.replace(/^\[特性\]\s*/, ''), text: eff });
      else out.attacks.push({ name: nm, cost, dmg, text: eff });
    }
    const w = (h.match(/weakpoint">([\s\S]*?)<\/td>/) || [])[1] || '';
    const r = (h.match(/class="resist">([\s\S]*?)<\/td>/) || [])[1] || '';
    const e = (h.match(/class="escape">([\s\S]*?)<\/td>/) || [])[1] || '';
    out.weak = types(w)[0] || null;
    out.resist = types(r)[0] || null;
    out.retreat = types(e).length;
    out.ex = /ex$/.test(name);
    // 進化線：「進化 A B C ... No.xxx」
    const chain = evo ? (strip(evo[0]).match(/進化 (.*?) No\./) || [])[1]?.split(' ').filter(n => !/ex$/.test(n) || n === name) || [] : [];
    if (out.stage > 0) out.from = chain[out.stage - 1];
  } else if (/基本.能量/.test(name) || /基本【.】能量/.test(name)) {
    out.cat = 'E'; out.energy = 'basic';
  } else {
    const txt = strip((h.match(/<div class="skillInformation">([\s\S]*?)<div class="subInformation"|<div class="skillInformation">([\s\S]*?)<\/section>/) || [])[0] || '');
    const kind = { 物品卡: 'Item', 支援者卡: 'Supporter', 競技場卡: 'Stadium', 寶可夢道具: 'Tool' };
    const k = Object.keys(kind).find(x => txt.startsWith(x));
    if (marker.includes('特殊能量') || /^特殊能量/.test(txt)) { out.cat = 'E'; out.energy = 'special'; out.text = txt.replace(/^特殊能量卡?\s*/, ''); }
    else { out.cat = 'T'; out.trainer = k ? kind[k] : 'Item'; out.text = k ? txt.slice(k.length).trim() : txt; }
  }
  return out;
}

if (process.argv[2]) {
  const set = process.argv[2];
  const first = get(`${BASE}/list/?expansionCodes=${set}`);
  const pages = +(first.match(/共 (\d+) 頁/) || [0, 1])[1];
  const ids = new Set();
  for (let p = 1; p <= pages; p++) {
    const h = p === 1 ? first : get(`${BASE}/list/?pageNo=${p}&expansionCodes=${set}`);
    for (const m of h.matchAll(/detail\/(\d+)\//g)) ids.add(+m[1]);
  }
  const cards = [...ids].sort((a, b) => a - b).map(id => parseDetail(id, set));
  const fs = await import('fs');
  fs.mkdirSync(new URL('./official/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL(`./official/${set}.json`, import.meta.url), JSON.stringify(cards, null, 1));
  console.log(`${set}: ${cards.length} 張 → tools/official/${set}.json`);
}
