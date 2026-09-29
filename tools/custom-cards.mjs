// 資料庫中尚無繁體中文資料的環境卡（超級進化世代），依日文版卡片內容翻譯
export const CUSTOM_CARDS = [
  {
    id: 'M1L-028', set: 'M1L', name: '利歐路', cat: 'P', stage: 0, hp: 80, type: 'F', weak: 'P', resist: null, retreat: 2, ex: false,
    abilities: [],
    attacks: [{ name: '加速突刺', cost: ['F'], dmg: '30', text: '在下個自己的回合，這隻寶可夢無法使用「加速突刺」。' }],
    rarity: 'C',
  },
  {
    id: 'M1L-029', set: 'M1L', name: '超級路卡利歐ex', cat: 'P', stage: 1, from: '利歐路', hp: 340, type: 'F', weak: 'P', resist: null, retreat: 2, ex: true, mega: true,
    abilities: [],
    attacks: [
      { name: '波導突擊', cost: ['F'], dmg: '130', text: '從自己的棄牌區選擇最多3張「基本【鬥】能量」卡，以任意方式附於自己的備戰寶可夢身上。' },
      { name: '超級勇氣', cost: ['F', 'F'], dmg: '270', text: '在下個自己的回合，這隻寶可夢無法使用「超級勇氣」。' },
    ],
    rarity: 'RR',
  },
  {
    id: 'M1S-036', set: 'M1S', name: '凱西', cat: 'P', stage: 0, hp: 50, type: 'P', weak: 'D', resist: 'F', retreat: 1, ex: false,
    abilities: [],
    attacks: [{ name: '瞬間移動攻擊', cost: ['P'], dmg: '10', text: '將這隻寶可夢與備戰寶可夢互換。' }],
    rarity: 'C',
  },
  {
    id: 'M1S-037', set: 'M1S', name: '勇基拉', cat: 'P', stage: 1, from: '凱西', hp: 80, type: 'P', weak: 'D', resist: 'F', retreat: 1, ex: false,
    abilities: [{ name: '精神抽牌', text: '在自己的回合，從手牌使出這張卡並完成進化時，可使用1次。從自己的牌庫抽出2張卡。' }],
    attacks: [{ name: '超能力', cost: ['P'], dmg: '30', text: '' }],
    rarity: 'U',
  },
  {
    id: 'M1S-038', set: 'M1S', name: '胡地', cat: 'P', stage: 2, from: '勇基拉', hp: 140, type: 'P', weak: 'D', resist: 'F', retreat: 1, ex: false,
    abilities: [{ name: '精神抽牌', text: '在自己的回合，從手牌使出這張卡並完成進化時，可使用1次。從自己的牌庫抽出3張卡。' }],
    attacks: [{ name: '手中之力', cost: ['P'], dmg: '', text: '在對手的戰鬥寶可夢身上放置自己手牌張數×2個傷害指示物。' }],
    rarity: 'R',
  },
  {
    id: 'SV5K-057', set: 'SV5K', name: '土龍節節', cat: 'P', stage: 1, from: '土龍弟弟', hp: 140, type: 'C', weak: 'F', resist: null, retreat: 3, ex: false,
    abilities: [{ name: '逃跑抽牌', text: '在自己的回合時可使用1次。從自己的牌庫抽出3張卡。然後，將這隻寶可夢與附加的卡，全部放回自己的牌庫並重洗。' }],
    attacks: [{ name: '大地粉碎', cost: ['C', 'C', 'C'], dmg: '90', text: '' }],
    rarity: 'R',
  },
];
