// AI 對 AI 模擬測試：確認所有牌組組合都能正常跑完對戰
import { Game } from '../js/engine/game.js';
import { AIController } from '../js/ai/ai.js';
import { STARTER_DECKS, AI_DECKS, deckToList } from '../js/data/decks.js';
import { validateDeck } from '../js/engine/cards.js';

const decks = [...STARTER_DECKS, ...AI_DECKS];
let bad = 0;
for (const d of decks) { const e = validateDeck(d.cards); if (e.length) { console.log(d.name, e); bad++; } }
if (bad) process.exit(1);

const games = +(process.argv[2] || 2);
const level = process.argv[3] || 'normal';
const level2 = process.argv[4] || level;
const stats = {};
let turnsTotal = 0, n = 0, errors = 0;
for (let i = 0; i < decks.length; i++) for (let j = 0; j < decks.length; j++) {
  if (i === j) continue;
  for (let k = 0; k < games; k++) {
    const l0 = deckToList(decks[i].cards), l1 = deckToList(decks[j].cards);
    const g = new Game({ decks: [l0, l1], names: [decks[i].name, decks[j].name], controllers: [new AIController(level, l0), new AIController(level2, l1)], seed: 1000 * i + 37 * j + k });
    try {
      const w = await Promise.race([g.run(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);
      if (g.turn > 200) console.log('long game', decks[i].name, decks[j].name, g.turn);
      turnsTotal += g.turn; n++;
      const wn = decks[w === 0 ? i : j].name;
      stats[wn] = (stats[wn] || 0) + 1;
      const lv = `side${w}(${w === 0 ? level : level2})`; stats[lv] = (stats[lv] || 0) + 1;
      if (g.winReason === '對手場上沒有寶可夢' && g.turn <= 4) stats.earlySweep = (stats.earlySweep || 0) + 1;
      if (g.winReason !== '獲得所有獎賞卡') stats['*' + g.winReason] = (stats['*' + g.winReason] || 0) + 1;
    } catch (e) {
      errors++;
      console.log('ERROR', decks[i].name, 'vs', decks[j].name, 'seed', 1000 * i + 37 * j + k, e.stack.split('\n').slice(0, 6).join('\n'));
      console.log(g.logs.slice(-8).map(l => l.msg).join('\n'));
    }
  }
}
console.log(stats);
console.log(`games ${n}, avg turns ${(turnsTotal / n).toFixed(1)}, errors ${errors}`);
process.exit(errors ? 1 : 0);
