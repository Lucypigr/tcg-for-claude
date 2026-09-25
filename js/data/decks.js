// 牌組清單：玩家起始牌組2套 + AI環境牌組5套
// 格式：{ 卡片ID: 張數 }

export const STARTER_DECKS = [
  {
    id: 'starter-pikachu',
    name: '皮卡丘ex 初階牌組',
    desc: '以「ex初階牌組 皮卡丘」(SVQP) 為藍本。皮卡丘ex的「極限伏特」一擊造成220點傷害，三合一磁怪與電氣發生器負責加速能量。',
    cover: 'SVC-001',
    type: 'L',
    cards: {
      'SVC-001': 2, 'SV1V-029': 2, 'SV8-034': 3, 'SV8-035': 2, 'SVC-003': 2, 'SVC-004': 2, 'SVD-034': 2, 'SVD-035': 1, 'SVD-101': 1,
      'SVD-118': 4, 'SVD-117': 3, 'SVD-122': 2, 'SVD-123': 2, 'SVD-113': 3, 'SVD-110': 2, 'SVD-121': 1,
      'SVD-135': 3, 'SVD-133': 2, 'SVD-130': 2, 'SVD-138': 1, 'SVD-125': 2,
      'SVD-LIG': 16,
    },
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
];

export function deckToList(cards) {
  const out = [];
  for (const [cid, n] of Object.entries(cards)) for (let i = 0; i < n; i++) out.push(cid);
  return out;
}
