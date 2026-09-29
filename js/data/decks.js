// 牌組清單：玩家起始牌組2套 + AI牌組
// 格式：{ 卡片ID: 張數 }
import { ALIASES } from './cards.js';

// 與其他版本完全相同而合併的卡片，換成保留的ID
function resolve(cards) {
  const out = {};
  for (const [id, n] of Object.entries(cards)) { const k = ALIASES[id] || id; out[k] = (out[k] || 0) + n; }
  return out;
}

export const STARTER_DECKS = [
  {
    id: 'starter-pikachu',
    name: '皮卡丘ex 初階牌組',
    desc: '依照「ex初階牌組 皮卡丘」(SVQP) 官方收錄的23種卡片組成。皮卡丘ex的「極限伏特」一擊220點，帕奇利茲「啪滋啪滋充電」從棄牌區回收雷能量。（官方未公布各卡張數，張數為自行配置）',
    cover: 'SVC-001',
    type: 'L',
    cards: resolve({
      'SVQP-001': 2, 'SVQP-002': 3, 'SVQP-003': 2, 'SVQP-004': 2, 'SVQP-005': 1, 'SVQP-006': 2, 'SVQP-007': 2, 'SVQP-008': 2,
      'SVQP-009': 1, 'SVQP-010': 2, 'SVQP-011': 2, 'SVQP-012': 1,
      'SVQP-013': 2, 'SVQP-014': 3, 'SVQP-015': 1, 'SVQP-016': 2, 'SVQP-017': 2, 'SVQP-018': 2,
      'SVQP-019': 2, 'SVQP-020': 1, 'SVQP-021': 1, 'SVQP-022': 2, 'SVQP-023': 3,
      'SVD-LIG': 17,
    }),
  },
  {
    id: 'starter-charizard',
    name: '噴火龍ex 初階牌組',
    desc: '以「ex初階牌組 噴火龍」為藍本。用神奇糖果快速進化成噴火龍ex，「煉獄支配」一口氣從牌庫附上3張火能量。',
    cover: 'SV3-066',
    type: 'R',
    cards: {
      'SV3-012': 4, 'SV3-013': 2, 'SV3-066': 2, 'SV3-087': 2, 'SV3-088': 1, 'SV3-089': 1, 'SVD-018': 2, 'SVD-019': 1, 'SVD-101': 1, 'SVD-092': 2,
      'SVD-120': 3, 'SVD-118': 4, 'SVD-117': 3, 'SVD-122': 2, 'SVD-123': 2, 'SVD-110': 1, 'SVD-112': 1, 'SVD-115': 2, 'SVD-125': 2,
      'SVD-135': 3, 'SVD-133': 2, 'SVD-130': 2, 'SVD-129': 2, 'SVD-138': 1,
      'SVD-FIR': 12,
    },
  },
];

// AI 牌組：參考 2026 年標準賽制主流牌組（多龍巴魯托ex、超級路卡利歐ex、沙奈朵ex、胡地、雷系基礎箱）
export const AI_DECKS = [
  {
    id: 'ai-dragapult',
    name: '多龍巴魯托ex',
    trainer: '龍使 艾嵐',
    desc: '「幻影奇襲」200點傷害並在備戰區放置6個傷害指示物，一次瞄準多張獎賞卡。',
    cover: 'SV6-081',
    type: 'N',
    cards: {
      'SV6-079': 4, 'SV6-080': 4, 'SV6-081': 3, 'SVD-092': 2, 'SV5K-057': 2, 'SV6a-038': 1,
      'SVD-119': 4, 'SVD-118': 4, 'SVD-120': 2, 'SV6a-056': 2, 'SVD-122': 2, 'SV4M-059': 1, 'SV5M-062': 1, 'SV1a-064': 1,
      'SVD-135': 4, 'SVD-130': 3, 'SVD-138': 2, 'SV6-097': 2, 'SVD-129': 2, 'SV2D-067': 1,
      'SVD-FIR': 6, 'SVD-PSY': 7,
    },
  },
  {
    id: 'ai-lucario',
    name: '超級路卡利歐ex',
    trainer: '格鬥家 剛志',
    desc: '超級進化的340HP巨漢。「波導突擊」回收鬥能量加速備戰區，「超級勇氣」270點重擊。',
    cover: 'M1L-029',
    type: 'F',
    cards: {
      'M1L-028': 4, 'M1L-029': 3, 'SVD-068': 1, 'SVD-092': 2, 'SV5K-057': 2, 'SV6a-038': 1,
      'SVD-118': 4, 'SVD-119': 3, 'SV6a-056': 2, 'SVD-122': 2, 'SV1a-064': 1, 'SV5M-062': 1, 'SVD-124': 2, 'SV2D-067': 1,
      'SVD-135': 4, 'SVD-130': 3, 'SVD-138': 2, 'SVD-129': 2, 'SVD-133': 2, 'SV8-105': 2,
      'SVD-FIG': 16,
    },
  },
  {
    id: 'ai-gardevoir',
    name: '沙奈朵ex',
    trainer: '超能力者 瑪莉',
    desc: '「精神擁抱」從棄牌區不斷附上超能量，配合飄飄球與黑夜魔靈的傷害指示物戰術。',
    cover: 'SV1S-028',
    type: 'P',
    cards: {
      'SV1S-026': 4, 'SV1S-027': 3, 'SV1S-028': 2, 'SVD-052': 2, 'SVD-053': 2, 'SV6a-018': 2, 'SV6a-019': 1, 'SV6a-020': 1, 'SV6-055': 1, 'SV6a-038': 1,
      'SVD-120': 3, 'SVD-118': 4, 'SVD-119': 3, 'SV1a-064': 1, 'SV6a-056': 2, 'SVD-122': 2, 'SV6-092': 1,
      'SVD-135': 3, 'SVD-130': 3, 'SVD-138': 2, 'SVD-129': 2, 'SV2D-067': 1,
      'SVD-PSY': 12, 'SVD-DAR': 2,
    },
  },
  {
    id: 'ai-alakazam',
    name: '胡地',
    trainer: '超能力少年 阿健',
    desc: '進化時「精神抽牌」大量補牌，「手中之力」依手牌張數放置傷害指示物，手牌越多越危險。',
    cover: 'M1S-038',
    type: 'P',
    cards: {
      'M1S-036': 4, 'M1S-037': 3, 'M1S-038': 3, 'SVD-092': 3, 'SV5K-057': 2, 'SV6a-038': 1,
      'SVD-120': 2, 'SVD-118': 4, 'SVD-119': 3, 'SV6a-056': 2, 'SVD-122': 2, 'SV4M-059': 1, 'SV5M-062': 1, 'SV2D-067': 1,
      'SVD-135': 2, 'SVD-133': 4, 'SVD-127': 1, 'SVD-129': 2, 'SVD-138': 2, 'SVD-130': 1, 'SV8-105': 2,
      'SVD-PSY': 14,
    },
  },
  {
    id: 'ai-miraidon',
    name: '密勒頓ex 雷系基礎箱',
    trainer: '電氣技師 奇樹',
    desc: '只用基礎寶可夢的速攻牌組。「串聯裝置」展開備戰區，電氣發生器加速能量，鐵臂膀ex多拿獎賞卡。',
    cover: 'SV1V-037',
    type: 'L',
    cards: {
      'SV1V-037': 2, 'SV4M-027': 2, 'SVC-001': 2, 'SVD-044': 2, 'SVD-045': 1, 'SV1V-029': 1, 'SV6a-038': 1, 'SV8-034': 2, 'SV8-035': 2,
      'SVD-118': 4, 'SVD-119': 2, 'SVD-113': 4, 'SVD-122': 2, 'SV8-095': 2, 'SV5M-062': 1, 'SVD-110': 2, 'SVD-125': 2,
      'SVD-135': 4, 'SVD-130': 2, 'SVD-138': 2, 'SV8-102': 1, 'SV8-103': 1,
      'SVD-LIG': 16,
    },
  },
  // ---- 以下牌組以「ex初階牌組」(SVD) 的卡片為主，能量張數自動補滿60張 ----
  {
    id: 'ai-charizard',
    name: '噴火龍ex・大比鳥ex',
    trainer: '火焰訓練家 阿楓',
    desc: '經典組合：噴火龍ex的「煉獄支配」一口氣加速，大比鳥ex「音速搜索」每回合找到需要的卡。',
    cover: 'SV3-066',
    type: 'R',
    cards: fill({
      'SV3-012': 4, 'SV3-013': 2, 'SV3-066': 3, 'SV3-087': 2, 'SV3-088': 1, 'SV3-089': 2, 'SV6a-038': 1,
      'SVD-120': 4, 'SVD-118': 4, 'SVD-119': 3, 'SV6a-056': 2, 'SVD-122': 2, 'SV4M-059': 1, 'SV5M-062': 1,
      'SVD-135': 4, 'SVD-130': 2, 'SVD-138': 2, 'SVD-129': 2,
    }, { R: 1 }),
  },
  {
    id: 'ai-greninja',
    name: '甲賀忍蛙ex',
    trainer: '忍者 阿杏',
    desc: '「隱密手裏劍」先在對手身上留下傷害，再用「激流斬」打出240點。',
    cover: 'SVD-029',
    type: 'W',
    cards: fill({
      'SVD-027': 4, 'SVD-028': 3, 'SVD-029': 3, 'SVD-022': 2, 'SVD-026': 2,
      'SVD-120': 2, 'SVD-118': 4, 'SVD-117': 4, 'SVD-122': 2, 'SVD-123': 2, 'SVD-110': 2, 'SVD-125': 2,
      'SVD-135': 4, 'SVD-130': 2, 'SVD-138': 2, 'SVD-129': 2, 'SVD-133': 2,
    }, { W: 1 }),
  },
  {
    id: 'ai-dragonite',
    name: '快龍ex',
    trainer: '屠龍家 小椿',
    desc: '330HP的巨龍，「流星破壞」擲出正面時造成280點傷害。',
    cover: 'SVD-090',
    type: 'N',
    cards: fill({
      'SVD-088': 4, 'SVD-089': 3, 'SVD-090': 3, 'SVD-098': 2, 'SVD-097': 1,
      'SVD-120': 3, 'SVD-118': 4, 'SVD-117': 4, 'SVD-122': 2, 'SVD-110': 2, 'SVD-125': 2,
      'SVD-135': 4, 'SVD-130': 2, 'SVD-138': 2, 'SVD-129': 2, 'SVD-133': 2,
    }, { W: 1, L: 1 }),
  },
  {
    id: 'ai-houndoom',
    name: '黑魯加ex',
    trainer: '惡黨 阿修',
    desc: '「邪惡爪」封住對手基礎寶可夢的招式，「追獵獠牙」220點強攻。',
    cover: 'SVD-072',
    type: 'D',
    cards: fill({
      'SVD-071': 4, 'SVD-072': 3, 'SVD-074': 2, 'SVD-075': 2, 'SVD-079': 2, 'SV6a-038': 1,
      'SVD-118': 4, 'SVD-117': 4, 'SVD-122': 2, 'SVD-123': 2, 'SVD-110': 2, 'SVD-126': 2, 'SVD-131': 1,
      'SVD-135': 4, 'SVD-130': 2, 'SVD-138': 2, 'SVD-129': 2, 'SVD-133': 2,
    }, { D: 1 }),
  },
  {
    id: 'ai-melmetal',
    name: '美錄梅塔ex',
    trainer: '鋼鐵工匠 阿鐵',
    desc: '「金屬吸收」自己加速能量，鋼能量越多「全金屬關節」越痛。',
    cover: 'SVD-085',
    type: 'M',
    cards: fill({
      'SVD-084': 4, 'SVD-085': 3, 'SVD-081': 3, 'SVD-083': 2, 'SVD-098': 1,
      'SVD-118': 4, 'SVD-117': 4, 'SVD-122': 3, 'SVD-112': 2, 'SVD-110': 2, 'SVD-126': 2, 'SV2D-067': 1,
      'SVD-135': 4, 'SVD-130': 2, 'SVD-138': 2, 'SVD-129': 2, 'SVD-128': 1,
    }, { M: 1 }),
  },
  {
    id: 'ai-decidueye',
    name: '狙射樹梟ex',
    trainer: '森林獵人 阿翠',
    desc: '「狩獵箭」同時打擊戰鬥場與備戰區，「無拘無束」自由進出戰場。',
    cover: 'SVD-008',
    type: 'G',
    cards: fill({
      'SVD-006': 4, 'SVD-007': 3, 'SVD-008': 3, 'SVD-003': 2, 'SVD-001': 2, 'SVD-080': 1,
      'SVD-120': 3, 'SVD-118': 4, 'SVD-117': 4, 'SVD-122': 2, 'SVD-110': 2, 'SVD-126': 1,
      'SVD-135': 4, 'SVD-130': 2, 'SVD-138': 2, 'SVD-129': 2, 'SVD-133': 2,
    }, { G: 1 }),
  },
  {
    id: 'ai-clefable',
    name: '皮可西ex',
    trainer: '月光少女 小月',
    desc: '「月表領域」讓超寶可夢撤退無需能量，「月亮奇跡」170點並自由調整能量。',
    cover: 'SVD-048',
    type: 'P',
    cards: fill({
      'SVD-047': 4, 'SVD-048': 3, 'SVD-051': 3, 'SVD-052': 2, 'SVD-053': 2,
      'SVD-118': 4, 'SVD-117': 4, 'SVD-122': 2, 'SVD-110': 2, 'SVD-111': 2, 'SVD-125': 2,
      'SVD-135': 4, 'SVD-130': 2, 'SVD-138': 2, 'SVD-129': 2, 'SVD-133': 2,
    }, { P: 1 }),
  },
  {
    id: 'ai-slaking',
    name: '請假王ex',
    trainer: '健身教練 阿力',
    desc: '「超電突圍」收錄。對手場上有寶可夢ex時，「偉大橫掃」只要2個能量就能打出280點！',
    cover: 'SV8-084',
    type: 'C',
    cards: fill({
      'SV8-082': 4, 'SV8-083': 3, 'SV8-084': 3, 'SV8-087': 2, 'SV8-085': 2, 'SV8-093': 1,
      'SVD-120': 4, 'SVD-118': 4, 'SVD-117': 4, 'SVD-122': 2, 'SVD-110': 2, 'SV8-098': 1, 'SVD-125': 2,
      'SVD-135': 4, 'SVD-130': 3, 'SVD-138': 2, 'SVD-129': 3, 'SVD-133': 2,
    }, { F: 1 }),
  },
  {
    id: 'ai-eevee',
    name: '伊布家族ex',
    trainer: '寶可夢愛好者 小愛',
    desc: '「太晶慶典」收錄。伊布的「提升進化」在戰鬥場上第1回合就能進化，太陽伊布ex、仙子伊布ex、月亮伊布ex輪番上陣。',
    cover: 'SV8a-069',
    type: 'P',
    cards: fill({
      'SV8a-125': 4, 'SV8a-126': 2, 'SV8a-063': 2, 'SV8a-069': 2, 'SV8a-093': 2, 'SV8a-062': 1, 'SV8a-068': 1,
      'SVD-118': 4, 'SVD-119': 3, 'SVD-117': 2, 'SV8a-143': 2, 'SV8a-147': 2, 'SVD-122': 2, 'SV8a-142': 1,
      'SVD-135': 3, 'SVD-130': 2, 'SVD-138': 2, 'SV8a-229': 2, 'SV8a-171': 1,
    }, { P: 2, D: 1 }),
  },
  {
    id: 'ai-terapagos',
    name: '太樂巴戈斯ex・赫月ex',
    trainer: '太晶研究員 阿晶',
    desc: '「太晶慶典」收錄。太樂巴戈斯ex「聯盟擊」依備戰區數量增加傷害，月月熊 赫月ex的「血月」隨著對手拿獎賞卡越來越便宜。',
    cover: 'SV8a-136',
    type: 'C',
    cards: fill({
      'SV8a-136': 3, 'SV8a-134': 2, 'SV8a-131': 2, 'SV8a-127': 2, 'SV8a-128': 2, 'SV8a-133': 2, 'SV6a-038': 1,
      'SVD-118': 4, 'SVD-119': 3, 'SVD-117': 2, 'SV8a-145': 2, 'SV8a-140': 2, 'SV8a-152': 1, 'SVD-122': 2,
      'SVD-135': 3, 'SVD-130': 2, 'SVD-138': 2, 'SV8a-163': 2, 'SV8a-229': 1,
    }, { G: 1, W: 1, L: 1 }),
  },
  {
    id: 'ai-zygarde',
    name: '超級基格爾德ex',
    trainer: '大地守護者 奧利',
    desc: '「虛無歸零」收錄。龜足巨鎧的「岩石武裝」加速鬥能量，超級基格爾德ex附上核心記憶碟後，「大地光炮」一擊350點！',
    cover: 'M3-046',
    type: 'F',
    cards: fill({
      'M3-046': 3, 'M3-041': 3, 'M3-042': 3, 'M3-045': 2,
      'M3-072': 2, 'M3-070': 2, 'SVD-118': 4, 'SVD-117': 3, 'SVD-122': 2,
      'M3-073': 3, 'SVD-135': 3, 'SVD-138': 2, 'SVD-130': 2, 'M3-080': 3,
    }, { F: 1 }),
  },
  {
    id: 'ai-starmie',
    name: '超級寶石海星ex',
    trainer: '密阿雷泳者 小潔',
    desc: '「虛無歸零」收錄。白海獅的「沖刷」把水能量集中到戰鬥場，超級寶石海星ex同時打擊戰鬥與備戰寶可夢；冰雪巨龍的「凍原堡壘」減輕傷害。',
    cover: 'M3-021',
    type: 'W',
    cards: fill({
      'M3-020': 4, 'M3-021': 3, 'M3-018': 3, 'M3-019': 2, 'M3-069': 2, 'M3-022': 2, 'M3-023': 2,
      'SVD-118': 4, 'SVD-117': 3, 'SVD-122': 2, 'M3-070': 2, 'M3-071': 1,
      'SVD-135': 3, 'SVD-138': 2, 'SVD-130': 2, 'M3-074': 2,
    }, { W: 1 }),
  },
  {
    id: 'ai-clefable',
    name: '超級皮可西ex',
    trainer: '月光研究員 美月',
    desc: '「虛無歸零」收錄。芳香精「收集香氣」補充超能量，超級皮可西ex丟棄手牌中的能量讓「射攻月亮」最高打出280點；由紫幫忙回復。',
    cover: 'M3-030',
    type: 'P',
    cards: fill({
      'M3-029': 4, 'M3-030': 3, 'M3-034': 3, 'M3-035': 2, 'M3-061': 1,
      'SVD-118': 4, 'SVD-117': 3, 'SVD-122': 2, 'M3-070': 2, 'M3-104': 1,
      'SVD-135': 3, 'SVD-138': 2, 'M3-076': 2, 'SVD-130': 2, 'M3-079': 3,
    }, { P: 1 }),
  },
];

// 將牌組以基本能量補滿至60張（依比例分配屬性）
function fill(cards, ratio) {
  const ENERGY = { G: 'SVD-GRA', R: 'SVD-FIR', W: 'SVD-WAT', L: 'SVD-LIG', P: 'SVD-PSY', F: 'SVD-FIG', D: 'SVD-DAR', M: 'SVD-MET' };
  const out = { ...cards };
  let left = 60 - Object.values(cards).reduce((a, b) => a + b, 0);
  const types = Object.keys(ratio);
  const total = types.reduce((a, t) => a + ratio[t], 0);
  types.forEach((t, i) => {
    const n = i === types.length - 1 ? left : Math.round((60 - Object.values(cards).reduce((a, b) => a + b, 0)) * ratio[t] / total);
    out[ENERGY[t]] = (out[ENERGY[t]] || 0) + n;
    left -= n;
  });
  return out;
}

export function deckToList(cards) {
  const out = [];
  for (const [cid, n] of Object.entries(cards)) for (let i = 0; i < n; i++) out.push(cid);
  return out;
}
