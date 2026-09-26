// 隨機牌組模糊測試：從整個牌池隨機組牌讓 AI 對戰，確認所有卡片效果不會出錯
// 用法: node test/fuzz.mjs [場數] [只用某擴充包，例如 SV8]
import { Game } from '../js/engine/game.js';
import { AIController } from '../js/ai/ai.js';
import { CARDS } from '../js/data/cards.js';
import { validateDeck, ruleName, BASIC_ENERGY_ID } from '../js/engine/cards.js';

const games = +(process.argv[2] || 50);
const setFilter = process.argv[3];
const pool = CARDS.filter(c => !(c.cat === 'E' && c.energy === 'basic') && (!setFilter || c.set === setFilter || c.cat === 'T'));
const rnd = a => a[Math.floor(Math.random() * a.length)];

function randomDeck() {
  const deck = {};
  const count = () => Object.values(deck).reduce((a, b) => a + b, 0);
  const byName = c => Object.entries(deck).reduce((n, [id, k]) => n + (ruleName(CARDS.find(x => x.id === id)) === ruleName(c) ? k : 0), 0);
  const add = (c, n) => { n = Math.min(n, 4 - byName(c)); if (c.ace) { if (Object.keys(deck).some(id => CARDS.find(x => x.id === id).ace)) return; n = 1; } if (n > 0) deck[c.id] = (deck[c.id] || 0) + n; };
  const pokes = pool.filter(c => c.cat === 'P');
  const types = new Set();
  while (Object.keys(deck).length < 8) {
    const c = rnd(pokes);
    // 進化寶可夢要連同進化前一起加入
    const line = [c];
    let cur = c;
    while (cur.stage > 0) { const prev = CARDS.find(x => x.name === cur.from && x.cat === 'P'); if (!prev) break; line.unshift(prev); cur = prev; }
    for (const x of line) { add(x, 2 + Math.floor(Math.random() * 2)); types.add(x.type); }
  }
  const trainers = pool.filter(c => c.cat !== 'P');
  while (count() < 44) add(rnd(trainers), 1 + Math.floor(Math.random() * 3));
  const et = [...types].filter(t => BASIC_ENERGY_ID[t]);
  if (!et.length) et.push('F');
  let i = 0;
  while (count() < 60) { const id = BASIC_ENERGY_ID[et[i++ % et.length]]; deck[id] = (deck[id] || 0) + 1; }
  while (count() > 60) { const k = Object.keys(deck).find(id => !id.startsWith('SVD-') || deck[id] > 1); deck[k]--; if (!deck[k]) delete deck[k]; }
  return deck;
}
const toList = d => Object.entries(d).flatMap(([id, n]) => Array(n).fill(id));

let errors = 0, done = 0;
for (let k = 0; k < games; k++) {
  let d0, d1;
  do { d0 = randomDeck(); } while (validateDeck(d0).length);
  do { d1 = randomDeck(); } while (validateDeck(d1).length);
  const l0 = toList(d0), l1 = toList(d1);
  const lv = rnd(['easy', 'normal', 'hard']);
  const g = new Game({ decks: [l0, l1], names: ['A', 'B'], controllers: [new AIController(lv, l0), new AIController(lv, l1)], seed: k * 7919 + 1 });
  try {
    await Promise.race([g.run(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);
    done++;
  } catch (e) {
    errors++;
    console.log('ERROR game', k, e.stack.split('\n').slice(0, 5).join('\n'));
    console.log(g.logs.slice(-6).map(l => l.msg).join('\n'));
  }
}
console.log(`fuzz games ${done}/${games}, errors ${errors}`);
process.exit(errors ? 1 : 0);
