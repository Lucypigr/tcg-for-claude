// 從 tcgdex/cards-database (data-asia) 產生遊戲用的卡片資料 js/data/cards.js
// 用法: node tools/build-cards.mjs [path-to-cards-database]
// 預設路徑: ../tcgdex/cards-database
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CUSTOM_CARDS } from './custom-cards.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = process.argv[2] || path.resolve(here, '../../tcgdex/cards-database');
const root = path.join(dbRoot, 'data-asia');

// 牌池：SVD (ex初階牌組) 全套 + SVC (皮卡丘ex起始組合) + 環境主流卡
const SOURCES = [];
for (let i = 1; i <= 139; i++) SOURCES.push(`SV/SVD/${String(i).padStart(3, '0')}.ts`);
for (const e of ['GRA', 'FIR', 'WAT', 'LIG', 'PSY', 'FIG', 'DAR', 'MET']) SOURCES.push(`SV/SVD/${e}.ts`);
for (let i = 1; i <= 21; i++) SOURCES.push(`SV/SVC/${String(i).padStart(3, '0')}.ts`);
SOURCES.push(
  // 雷
  'SV/SV1V/029.ts', 'SV/SV8/034.ts', 'SV/SV8/035.ts', 'SV/SV8/036.ts', 'SV/SV1V/037.ts', 'SV/SV4M/027.ts',
  // 火 / 噴火龍
  'SV/SV3/012.ts', 'SV/SV3/013.ts', 'SV/SV3/066.ts', 'SV/SV3/087.ts', 'SV/SV3/088.ts', 'SV/SV3/089.ts',
  // 多龍巴魯托
  'SV/SV6/079.ts', 'SV/SV6/080.ts', 'SV/SV6/081.ts',
  // 沙奈朵
  'SV/SV1S/026.ts', 'SV/SV1S/027.ts', 'SV/SV1S/028.ts', 'SV/SV6/055.ts',
  'SV/SV6a/018.ts', 'SV/SV6a/019.ts', 'SV/SV6a/020.ts',
  // 其他
  'SV/SV6a/038.ts', 'SV/SV1V/059.ts',
  // 訓練家
  'SV/SV5M/062.ts', 'SV/SV6a/056.ts', 'SV/SV4M/059.ts', 'SV/SV1a/064.ts', 'SV/SV2D/067.ts',
  'SV/SV1S/076.ts', 'SV/SV6/097.ts', 'SV/SV2a/161.ts', 'SV/SV6/092.ts', 'SV/SV2D/069.ts',
  'SV/SV8/095.ts', 'SV/SV8/102.ts', 'SV/SV8/103.ts', 'SV/SV8/104.ts', 'SV/SVD/120.ts',
  'SV/SV8/105.ts', 'SV/SV8/106.ts', 'SV/SV1a/070.ts', 'SV/SV3/108.ts',
  'SV/SV1a/072.ts', 'SV/SV2D/071.ts',
);

const TYPE = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M', Dragon: 'N', Colorless: 'C', Fairy: 'P' };
const RARITY = { Common: 'C', Uncommon: 'U', Rare: 'R', 'Double rare': 'RR', 'Ultra Rare': 'SR', 'ACE SPEC Rare': 'ACE', None: 'C' };

// 進化來源 (繁中名)
const EVOLVES = {
  敗露球菇: '哎呀球菇', 投羽梟: '木木梟', 狙射樹梟ex: '投羽梟', 奧利紐: '迷你芙', 奧利瓦: '奧利紐',
  燈火幽靈: '燭光靈', 水晶燈火靈: '燈火幽靈', 火神蛾: '燃燒蟲', 紅蓮鎧騎: '炭小侍', 浮潛鼬: '泳圈鼬',
  呱頭蛙: '呱呱泡蛙', 甲賀忍蛙ex: '呱頭蛙', 三海地鼠: '海地鼠', 浩大鯨: '走鯨', 雷丘: '皮卡丘',
  三合一磁怪: '小磁怪', 自爆磁怪: '三合一磁怪', 電肚蛙: '光蚪仔', 大電海燕: '電海燕', 皮可西ex: '皮皮',
  布魯皇: '布魯', 隨風球: '飄飄球', 超能豔鴕: '飄飄雛', 路卡利歐: '利歐路', 混混鱷: '黑眼鱷',
  流氓鱷: '混混鱷', 陸地水母: '原野水母', '帕底亞 土王': '帕底亞 烏波', 黑魯加ex: '戴魯比',
  焰后蜥: '夜盜火蜥', 獒教父: '偶叫獒', 佛烈托斯: '榛果球', 龍頭地鼠: '螺釘地鼠', 美錄梅塔ex: '美錄坦',
  普隆隆姆: '噗隆隆', 哈克龍: '迷你龍', 快龍ex: '哈克龍', 哈約克: '小約克', 長毛狗: '哈約克',
  藏飽栗鼠ex: '貪心栗鼠', 飄香豚: '愛吃豚', 一家鼠: '一對鼠', 頑皮雷彈: '霹靂電球',
  火恐龍: '小火龍', 噴火龍ex: '火恐龍', 比比鳥: '波波', 大比鳥ex: '比比鳥',
  布土撥: '布撥', 巴布土撥: '布土撥', 多龍奇: '多龍梅西亞', 多龍巴魯托ex: '多龍奇', 奇魯莉安: '拉魯拉絲', 沙奈朵ex: '奇魯莉安',
  彷徨夜靈: '夜巡靈', 黑夜魔靈: '彷徨夜靈', 巧鍛匠: '小鍛匠', 巨鍛匠: '巧鍛匠',
};

// 資料中部分文字仍為日文或有瑕疵，於此修正
const FIX = {
  // 太晶寶可夢：在備戰區不會受到招式的傷害
  'SV3-066': c => { c.tera = true; },
  'SV6-081': c => { c.tera = true; },
  'SV6a-038': c => {
    c.abilities = [{ name: '扭轉乾坤', text: '在上個對手的回合，若自己的寶可夢【昏厥】了，則在自己的回合時可使用1次。從自己的牌庫抽出3張卡。在這個回合，若已經使出了其他的「扭轉乾坤」，則這個特性無法使用。' }];
    c.attacks = [{ name: '衝撞', cost: ['D', 'C', 'C'], dmg: '130', text: '' }];
  },
  'SV6a-019': c => {
    c.abilities = [{ name: '咒詛炸彈', text: '在自己的回合時可使用1次，若使用，則將這隻寶可夢【昏厥】。在對手的1隻寶可夢身上放置5個傷害指示物。' }];
    c.attacks = [{ name: '暗影拳', cost: ['P', 'P'], dmg: '50', text: '' }];
  },
  'SV6a-020': c => {
    c.abilities = [{ name: '咒詛炸彈', text: '在自己的回合時可使用1次，若使用，則將這隻寶可夢【昏厥】。在對手的1隻寶可夢身上放置13個傷害指示物。' }];
    c.attacks = [{ name: '暗影拳', cost: ['P', 'P', 'C'], dmg: '150', text: '' }];
  },
};

function load(file) {
  let t = fs.readFileSync(path.join(root, file), 'utf8');
  t = t.replace(/^import.*$/mg, '').replace(/export default card;?/, '')
    .replace(/const card\s*:\s*Card\s*=/, 'return ').replace(/set:\s*Set,?/, '');
  return (new Function(t))();
}
const zh = o => o ? String(o['zh-tw'] ?? o['zh-cn'] ?? o.ja ?? o.en ?? '').replace(/‌/g, '').trim() : '';
const clean = s => s.replace(/‌/g, '').replace(/\s+/g, ' ').trim();

function convert(file) {
  const c = load(file);
  const [, setId, num] = file.match(/SV\/([^/]+)\/(\w+)\.ts$/);
  const id = `${setId}-${num}`;
  const name = zh(c.name).replace(/【(.)】/g, '$1');
  const out = { id, set: setId, name };
  const cat = c.category;
  if (cat === 'Pokemon') {
    out.cat = 'P';
    out.stage = c.stage === 'Basic' ? 0 : c.stage === 'Stage1' ? 1 : 2;
    out.hp = c.hp;
    out.type = TYPE[c.types?.[0]] || 'C';
    if (out.stage > 0) {
      out.from = EVOLVES[name];
      if (!out.from) throw new Error(`缺少進化來源: ${id} ${name}`);
    }
    out.weak = c.weaknesses?.[0] ? TYPE[c.weaknesses[0].type] : null;
    out.resist = c.resistances?.[0] ? TYPE[c.resistances[0].type] : null;
    out.retreat = c.retreat ?? 0;
    out.ex = /ex$/.test(name);
    out.abilities = (c.abilities || []).map(a => ({ name: zh(a.name), text: clean(zh(a.effect)) }));
    out.attacks = (c.attacks || []).map(a => ({
      name: zh(a.name),
      cost: (a.cost || []).map(x => TYPE[x]),
      dmg: a.damage === undefined ? '' : String(a.damage).replace('x', '×'),
      text: clean(zh(a.effect)),
    }));
  } else if (cat === 'Trainer') {
    out.cat = 'T';
    out.trainer = c.trainerType; // Item / Supporter / Stadium / Tool
    out.text = clean(zh(c.effect));
    if (/ACE SPEC/.test(c.rarity || '')) out.ace = true;
  } else {
    out.cat = 'E';
    out.energy = c.energyType === 'Normal' || /基本/.test(name) ? 'basic' : 'special';
    if (out.energy === 'basic') {
      const m = name.match(/基本(.)能量/);
      const map = { 草: 'G', 火: 'R', 水: 'W', 雷: 'L', 超: 'P', 鬥: 'F', 惡: 'D', 鋼: 'M' };
      out.provides = map[m[1]];
      out.name = `基本${m[1]}能量`;
    } else {
      out.text = clean(zh(c.effect));
    }
  }
  out.rarity = RARITY[c.rarity] || defaultRarity(out);
  if (FIX[id]) FIX[id](out);
  return out;
}

function defaultRarity(c) {
  if (c.cat === 'P') return c.ex ? 'RR' : c.stage === 2 ? 'R' : c.stage === 1 ? 'U' : 'C';
  if (c.cat === 'T') return c.trainer === 'Supporter' || c.trainer === 'Stadium' ? 'U' : 'C';
  return c.energy === 'basic' ? 'C' : 'U';
}

const cards = [];
const seen = new Set();
for (const f of SOURCES) {
  const c = convert(f);
  if (seen.has(c.id)) continue;
  seen.add(c.id);
  cards.push(c);
}
for (const c of CUSTOM_CARDS) cards.push(c);

// 從台灣官方訓練家網站抓取的擴充包（tools/scrape-official.mjs 產生的 tools/official/*.json）
const officialDir = path.join(here, 'official');
const officialIds = {};
// 尚未支援的卡：招式學習器（賦予招式的道具）
const EXCLUDE = ['SV8-101'];
// 官網沒有標示 ACE SPEC，依卡名判定
const ACE_NAMES = ['希望護身符', '極限腰帶', '中立中心', '豪華斗篷', '古舊能量', '寶可夢旋風回收機', '璀璨結晶', '釣竿MAX', '奇跡耳麥', '頂尖捕捉器', '秘密箱', '大師球'];
// 需要本遊戲尚未支援的機制（從牌庫替換、使用進化前招式、猜HP、備戰區8隻、賦予招式的道具）
const EXCLUDE_NAMES = ['海豚俠', '海豚俠ex', '古空棘魚', '泰姆', '零之大空洞', '招式學習器 演進', '招式學習器 衰退'];
if (fs.existsSync(officialDir)) {
  for (const f of fs.readdirSync(officialDir).filter(f => f.endsWith('.json')).sort()) {
    for (const raw of JSON.parse(fs.readFileSync(path.join(officialDir, f), 'utf8'))) {
      if (raw.cat === 'E' && raw.energy === 'basic') continue; // 基本能量沿用 SVD 版本
      if (EXCLUDE.includes(raw.id) || EXCLUDE_NAMES.includes(raw.name)) continue;
      const { officialId, ...c } = raw;
      if (seen.has(c.id)) { officialIds[c.id] = officialId; continue; } // 已由 tcgdex 資料收錄
      seen.add(c.id);
      // 官網部分特性沒有「[特性]」標記：無能量、無傷害的項目視為特性；「太晶」為規則
      if (c.cat === 'P') {
        for (const a of [...c.attacks]) {
          if (a.cost.length || a.dmg) continue;
          c.attacks = c.attacks.filter(x => x !== a);
          if (a.name === '太晶') c.tera = true;
          else if (a.text && !/^(擲|從|將|對手|查看|在|選擇)/.test(a.text) || /這隻寶可夢不會受到|只要這隻寶可夢/.test(a.text)) c.abilities.push({ name: a.name, text: a.text });
          else c.attacks.push(a);
        }
      }
      // 稀有度：優先使用 tcgdex 的資料
      const num = c.id.split('-')[1];
      const tfile = path.join(root, 'SV', c.set, `${num}.ts`);
      if (fs.existsSync(tfile)) { try { const t = load(`SV/${c.set}/${num}.ts`); if (RARITY[t.rarity] && t.rarity !== 'None') c.rarity = RARITY[t.rarity]; } catch { /* ignore */ } }
      if (!c.rarity && +num > 0 && c.set === 'SV8' && +num > 106) c.rarity = c.cat === 'P' && c.ex ? 'SR' : 'R';
      if (ACE_NAMES.includes(c.name) || c.rarity === 'ACE') { c.ace = true; c.rarity = 'ACE'; }
      c.rarity = c.rarity || defaultRarity(c);
      officialIds[c.id] = officialId;
      cards.push(c);
    }
  }
}

// 同名且文字完全相同的卡只保留一張 (例如多個版本的巢穴球)
const norm = t => (t || '').replace(/[\s。，、]/g, '');
const sig = c => JSON.stringify([c.name, c.cat, c.stage, c.hp, c.type, c.from, c.weak, c.resist, c.retreat, c.trainer, c.energy, c.provides, norm(c.text),
  (c.abilities || []).map(a => [a.name, norm(a.text)]), (c.attacks || []).map(a => [a.name, a.cost.join(''), String(a.dmg), norm(a.text)])]);
const bySig = new Map();
const final = [];
const aliases = {}; // 被合併的重複卡 → 保留的卡片ID
for (const c of cards) {
  const s = sig(c);
  if (bySig.has(s)) { if (bySig.get(s) !== c.id) aliases[c.id] = bySig.get(s); continue; }
  bySig.set(s, c.id);
  final.push(c);
}

const outFile = path.resolve(here, '../js/data/cards.js');
fs.writeFileSync(outFile,
  `// 由 tools/build-cards.mjs 產生，請勿手動修改\n// 資料來源: tcgdex/cards-database (data-asia, 繁體中文)\nexport const CARDS = ${JSON.stringify(final, null, 0).replace(/},{/g, '},\n{')};\n` +
  `// 與其他版本完全相同而合併的卡片ID\nexport const ALIASES = ${JSON.stringify(aliases)};\n`);
fs.writeFileSync(path.join(here, 'official-ids.json'), JSON.stringify(officialIds));
console.log(`寫入 ${final.length} 張卡 → ${outFile}`);
