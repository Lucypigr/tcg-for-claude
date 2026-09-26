// 從台灣官方訓練家網站對應每張卡的官方卡圖 ID，輸出 js/data/images.js
// 用法: node tools/fetch-images.mjs
import fs from 'fs';
import { execFileSync } from 'child_process';
import { CARDS } from '../js/data/cards.js';

const BASE = 'https://asia.pokemon-card.com/tw/card-search';
const get = url => execFileSync('curl', ['-sS', '--max-time', '30', '--retry', '3', url], { encoding: 'utf8', maxBuffer: 1 << 24 });

const detailCache = new Map();
function detail(id) {
  if (!detailCache.has(id)) {
    const h = get(`${BASE}/detail/${id}/`);
    const num = (h.match(/collectorNumber">\s*([^<\s]+)/) || [])[1] || '';
    const set = (h.match(/list\/\?expansionCodes=([^"&]+)/) || [])[1] || '';
    const name = (h.match(/<title>([^|<]+)/) || [])[1]?.trim() || '';
    detailCache.set(id, { num: num.split('/')[0], set, name });
  }
  return detailCache.get(id);
}
const norm = s => String(s).replace(/^0+/, '');

const out = {};
const bySet = {};
for (const c of CARDS) (bySet[c.set] ||= []).push(c);
for (const [set, cards] of Object.entries(bySet)) {
  const first = get(`${BASE}/list/?expansionCodes=${set}`);
  const pages = +(first.match(/共 (\d+) 頁/) || [0, 1])[1];
  const ids = [];
  for (let p = 1; p <= pages; p++) {
    const h = p === 1 ? first : get(`${BASE}/list/?pageNo=${p}&expansionCodes=${set}`);
    for (const m of h.matchAll(/detail\/(\d+)\//g)) if (!ids.includes(+m[1])) ids.push(+m[1]);
  }
  for (const c of cards) {
    const num = c.id.split('-')[1];
    let found = null;
    if (/^\d+$/.test(num)) {
      const guess = +num - 1;
      for (const d of [0, -1, 1, -2, 2, -3, 3]) {
        const id = ids[guess + d];
        if (id && norm(detail(id).num) === norm(num)) { found = id; break; }
      }
    }
    if (!found) {
      // 名稱比對（能量卡等）
      const base = c.name.replace(/能量$/, '');
      for (const id of ids) { const d = detail(id); if (d.name === c.name || (c.energy === 'basic' && d.name.includes(base.slice(2)) && d.name.includes('能量'))) { found = id; break; } }
    }
    if (found) out[c.id] = found; else console.log('找不到', c.id, c.name);
  }
  console.log(set, `${cards.filter(c => out[c.id]).length}/${cards.length}`);
}
fs.writeFileSync(new URL('../js/data/images.js', import.meta.url),
  `// 由 tools/fetch-images.mjs 產生：卡片ID → 台灣官方訓練家網站卡圖編號\n// 圖片網址: https://asia.pokemon-card.com/tw/card-img/tw{8位數編號}.png\nexport const IMAGE_IDS = ${JSON.stringify(out)};\n`);
