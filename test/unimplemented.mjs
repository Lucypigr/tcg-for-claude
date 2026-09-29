import { CARDS } from '../js/data/cards.js';
import { listUnimplemented } from '../js/engine/effects.js';
const u = listUnimplemented(CARDS);
console.log(u.join('\n'));
console.log(`未實作: ${u.length}`);
process.exit(u.length ? 1 : 0);
