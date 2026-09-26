// 指定情境的效果測試（手動建立場面，檢查關鍵機制）
import { Game, makeInst } from '../js/engine/game.js';
import { AIController } from '../js/ai/ai.js';

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const filler = Array(60).fill('SVD-FIG');
function setup() {
  const g = new Game({ decks: [filler, filler], names: ['A', 'B'], controllers: [new AIController('hard', []), new AIController('hard', [])], seed: 1 });
  g.turn = 3; g.current = 0;
  for (const p of g.players) { p.abilityUsed = {}; for (let i = 0; i < 6; i++) p.prizes.push(p.deck.shift()); }
  return g;
}
const put = (g, p, cid, bench = false) => { const s = g.newSlot(makeInst(cid)); s.playedTurn = 0; if (bench) p.bench.push(s); else p.active = s; return s; };
const energy = (s, cid, n = 1) => { for (let i = 0; i < n; i++) s.energy.push(makeInst(cid)); };

// 1. 伊布「提升進化」：在戰鬥場上可於剛使出的回合進化；伊布ex「虹色DNA」
{
  const g = setup(); const [A] = g.players;
  const e = put(g, A, 'SV8a-125'); e.playedTurn = g.turn;
  A.hand.push(makeInst('SV8a-003'));
  const acts = g.legalActions(A).filter(a => a.type === 'evolve');
  ok(acts.length === 1, '伊布在戰鬥場上剛使出的回合也可以進化成葉伊布ex');
  const b = put(g, A, 'SV8a-125', true); b.playedTurn = g.turn;
  ok(g.legalActions(A).filter(a => a.type === 'evolve' && a.target === b.id).length === 0, '備戰區剛使出的伊布不能進化');
}
// 2. 月月熊 赫月ex「老練招式」：對手拿了4張獎賞卡時，血月只需1個無色
{
  const g = setup(); const [A, B] = g.players;
  const u = put(g, A, 'SV8a-134'); put(g, B, 'SVD-092');
  energy(u, 'SVD-FIG', 1);
  ok(!g.canUseAttack(A, u, 0), '對手沒拿獎賞卡時，1個能量不能用血月');
  B.prizes.splice(0, 4);
  ok(g.canUseAttack(A, u, 0), '對手拿了4張獎賞卡時，1個能量就能用血月');
}
// 3. 璀璨結晶：太晶寶可夢所需能量減少1個
{
  const g = setup(); const [A, B] = g.players;
  const t = put(g, A, 'SV8a-136'); put(g, B, 'SVD-092');
  energy(t, 'SVD-GRA'); energy(t, 'SVD-WAT');
  ok(!g.canUseAttack(A, t, 1), '沒有璀璨結晶時 GW 無法使用 GWL 招式');
  t.tool = makeInst('SV8a-152');
  ok(g.canUseAttack(A, t, 1), '附上璀璨結晶後 GW 可以使用 GWL 招式');
}
// 4. 祭典樂舞：有「祭典會場」時招式使用2次
{
  const g = setup(); const [A, B] = g.players;
  const d = put(g, A, 'SV8a-009'); energy(d, 'SVD-GRA');
  put(g, A, 'SVD-092', true); put(g, A, 'SVD-092', true);
  const def = put(g, B, 'SV8-087'); // 爆炸頭水牛 130HP
  g.stadium = { inst: makeInst('SV8a-180'), owner: 0 };
  await g.attack(A, 0);
  ok(def.damage === 80, `祭典樂舞：朋友之環(2隻備戰×20=40)打2次 → ${def.damage}`);
}
// 5. 振翼髮「暗夜羽擊」：消除對手戰鬥寶可夢的特性
{
  const g = setup(); const [A, B] = g.players;
  put(g, A, 'SV8a-072');
  const x = put(g, B, 'SVD-098'); // 爆炸頭水牛（爆炸頭防守）
  ok(g.abilityOf(x) === null, '振翼髮在戰鬥場時，對手戰鬥寶可夢的特性消除');
}
// 6. 莓榴果：受到龍寶可夢傷害-60並丟棄
{
  const g = setup(); const [A, B] = g.players;
  const atk = put(g, A, 'SV6-081'); const def = put(g, B, 'SVD-098');
  def.tool = makeInst('SV8a-156');
  g.inAttack = true; g.currentAttacker = atk;
  const dealt = g.dealAttackDamage(atk, def, 200, {});
  ok(dealt === 200 - 60 - 20 && def.tool === null, `莓榴果：200 → ${dealt}（-60 樹果、-20 爆炸頭防守），樹果已丟棄`);
}
// 7. 蟲甲聖「球形盾牌」：備戰寶可夢不受傷害
{
  const g = setup(); const [A, B] = g.players;
  const atk = put(g, A, 'SV6-081'); put(g, B, 'SV8a-014', false);
  const bench = put(g, B, 'SVD-092', true);
  g.inAttack = true; g.currentAttacker = atk;
  g.dealAttackDamage(atk, bench, 50, {});
  g.placeCounters(bench, 3);
  ok(bench.damage === 0, '球形盾牌：備戰寶可夢不受招式傷害與傷害指示物');
}
console.log(fail ? `${fail} 項失敗` : '全部通過');
process.exit(fail ? 1 : 0);
