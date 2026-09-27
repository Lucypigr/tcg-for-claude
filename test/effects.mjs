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
// 8. 虛無歸零：化石可放到備戰區、不能撤退、不會陷入特殊狀態、可丟棄，並可進化
{
  const g = setup(); const [A, B] = g.players;
  put(g, A, 'SVD-092'); put(g, B, 'SVD-092');
  const f = makeInst('M3-069'); A.hand.push(f);
  ok(g.legalActions(A).some(a => a.type === 'bench' && a.uid === f.uid), '陳舊的鰭之化石可以放到備戰區');
  await g.perform(A, { type: 'bench', uid: f.uid });
  const fs = A.bench.find(s => s.cards[0] === f);
  ok(fs && g.maxHp(fs) === 60, '化石在場上是HP60的寶可夢');
  g.switchActive(A, fs);
  ok(!g.legalActions(A).some(a => a.type === 'retreat'), '化石無法撤退');
  g.setCondition(fs, 'poison');
  ok(!fs.cond.poison, '化石不會陷入特殊狀態');
  g.turn = 5; fs.playedTurn = 3;
  A.hand.push(makeInst('M3-022'));
  ok(g.legalActions(A).some(a => a.type === 'evolve' && a.target === fs.id), '冰雪龍可以從陳舊的鰭之化石進化');
  ok(g.legalActions(A).some(a => a.type === 'discardFossil' && a.target === fs.id), '可以把場上的化石丟棄');
}
// 9. 化石不能當作起手的基礎寶可夢
{
  const { validateDeck } = await import('../js/engine/cards.js');
  ok(validateDeck(Object.fromEntries([['M3-068', 4], ['SVD-FIG', 56]])).some(e => /基礎寶可夢/.test(e)), '只有化石的牌組不符合「至少1張基礎寶可夢」');
}
// 10. 核心記憶碟：超級基格爾德ex可使用大地光炮
{
  const g = setup(); const [A, B] = g.players;
  const z = put(g, A, 'M3-046'); energy(z, 'SVD-FIG', 4);
  const def = put(g, B, 'SV8a-134'); put(g, B, 'SVD-092', true);
  ok(g.top(z).attacks.length === 2, '沒有道具時只有2個招式');
  z.tool = makeInst('M3-072');
  ok(g.top(z).attacks.length === 3 && g.canUseAttack(A, z, 2), '附上核心記憶碟後可以使用大地光炮');
  await g.attack(A, 2);
  ok(!g.slots(B).includes(def) && z.energy.length === 0, '大地光炮擊倒了對手並丟棄能量');
}
// 11. 耿鬼「無限之影」：被招式擊倒時放回手牌
{
  const g = setup(); const [A, B] = g.players;
  const atk = put(g, A, 'SV6-081'); energy(atk, 'SVD-FIR'); energy(atk, 'SVD-PSY');
  const gg = put(g, B, 'M3-049'); energy(gg, 'SVD-DAR');
  put(g, B, 'SVD-092', true);
  gg.damage = 120;
  g.inAttack = true; g.currentAttacker = atk;
  g.dealAttackDamage(atk, gg, 100, {});
  g.inAttack = false;
  await g.checkKnockouts({ attackerOwner: A, attacker: atk });
  ok(B.hand.filter(i => i.cid === 'M3-049').length === 1 && B.discard.some(i => i.cid === 'SVD-DAR'), '耿鬼回到手牌，能量丟棄');
  ok(A.prizes.length === 5, '對手仍然獲得獎賞卡');
}
// 12. 伊裴爾塔爾ex「死亡靈魂」：擊倒所有剩餘HP 50以下的寶可夢
{
  const g = setup(); const [A, B] = g.players;
  const y = put(g, A, 'M3-052'); energy(y, 'SVD-DAR', 3);
  const a1 = put(g, B, 'SVD-092'); const b1 = put(g, B, 'SVD-092', true); const b2 = put(g, B, 'SVD-092', true);
  a1.damage = g.maxHp(a1) - 40; b1.damage = g.maxHp(b1) - 50; b2.damage = 0;
  const idx = g.top(y).attacks.findIndex(x => x.name === '死亡靈魂');
  energy(y, 'SVD-DAR', 3);
  await g.attack(A, idx);
  ok(!g.slots(B).includes(b1) && g.slots(B).includes(b2), '死亡靈魂擊倒了剩餘HP 50以下的寶可夢');
}
// 13. 冰雪巨龍「凍原堡壘」：附有水能量的寶可夢受到傷害-50
{
  const g = setup(); const [A, B] = g.players;
  const atk = put(g, A, 'SVD-092');
  const def = put(g, B, 'SVD-092'); energy(def, 'SVD-WAT');
  put(g, B, 'M3-023', true);
  g.inAttack = true; g.currentAttacker = atk;
  const d = g.dealAttackDamage(atk, def, 100, {});
  ok(d === 50, `凍原堡壘：100 → ${d}`);
}
// 14. 密阿雷市：使用後回合結束
{
  const g = setup(); const [A, B] = g.players;
  put(g, A, 'SVD-092'); put(g, B, 'SVD-092');
  A.deck.unshift(makeInst('SVD-092'));
  g.stadium = { inst: makeInst('M3-077'), owner: 0 };
  ok(g.legalActions(A).some(a => a.type === 'stadium'), '可以使用密阿雷市');
  const ends = await g.perform(A, { type: 'stadium' });
  ok(ends === true && A.bench.length === 1, '密阿雷市：放置基礎寶可夢後回合結束');
}
console.log(fail ? `${fail} 項失敗` : '全部通過');
process.exit(fail ? 1 : 0);
