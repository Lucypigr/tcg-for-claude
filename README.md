# 寶可夢卡牌 AI 對戰

以繁體中文版寶可夢集換式卡牌（PTCG）為基礎的網頁對戰遊戲，玩家與 AI 對戰。純前端，不需要安裝任何套件。

## 遊玩方式

用任何靜態伺服器開啟專案根目錄即可（ES modules 不能直接用 `file://` 開啟）：

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

也可以直接部署到 GitHub Pages。

## 功能

- **AI 對戰**：簡單／普通／困難三種難度。AI 每場從 15 套牌組中隨機挑選一套，對戰開始時才揭曉：
  - 環境主流：多龍巴魯托ex、超級路卡利歐ex、沙奈朵ex、胡地、密勒頓ex 雷系基礎箱、噴火龍ex・大比鳥ex
  - 主題牌組：甲賀忍蛙ex、快龍ex、黑魯加ex、美錄梅塔ex、狙射樹梟ex、皮可西ex、請假王ex（超電突圍）、伊布家族ex、太樂巴戈斯ex・赫月ex（太晶慶典）、超級基格爾德ex、超級寶石海星ex、超級皮可西ex（虛無歸零）
- **對戰特效**：招式光彈與斬擊、傷害數字、畫面震動、昏厥爆炸、使用卡片時放大展示、能量附加、進化光芒、3D 擲硬幣、回合橫幅。
- **玩家起始牌組 2 套**：依官方「ex初階牌組 皮卡丘」(SVQP) 收錄的 23 種卡片組成的 **皮卡丘ex 初階牌組**（官方未公布各卡張數，張數為自行配置），以及 **噴火龍ex 初階牌組**。
- **金幣與商店**：贏了拿金幣（簡單 100／普通 200／困難 350，輸了也有少量金幣），可購買 6 種卡包（含台灣官方擴充包「超電突圍」「太晶慶典」「虛無歸零」全卡）（每包 5 張，依稀有度隨機掉卡），重複超過 4 張的卡可以賣掉換金幣。
- **開包演出與閃卡**：買卡包後沿著虛線滑動（滑鼠拖曳或手指滑動）撕開卡包再翻卡；RR 以上與 ACE SPEC 為閃卡，滑鼠移上去會有跟著移動的彩虹反光與傾斜（手機則自動流光）。
- **特別插畫版**：「超電突圍」「太晶慶典」「虛無歸零」的高稀有度版本（AR／SR／SAR／UR）以收藏用特別版收錄，效果與一般版相同、與一般版合計最多 4 張，低機率從超電突圍、太晶慶典、虛無歸零與寶可夢ex特選包開出。
- **虛無歸零的新機制**：超級進化寶可夢ex（昏厥時對手拿 3 張獎賞卡）、化石（「陳舊的顎之化石」等物品卡可當作 HP60 的基礎寶可夢放到備戰區，不能撤退、不會陷入特殊狀態，可在自己的回合丟棄，也可以進化成冰雪龍／寶寶暴龍）、賦予招式的道具「核心記憶碟」。
- **收藏與自由組牌**：用收藏中的卡自由組 60 張牌組（同名最多 4 張、ACE SPEC 限 1 張，基本能量無限）。
- **完整規則**：先攻第 1 回合限制、進化、撤退、弱點／抵抗力、特殊狀態、寶可夢ex／超級進化ex 獎賞卡、太晶、競技場、道具、特殊能量等。
- 存檔保存在瀏覽器的 localStorage。

## 卡片資料

- 卡名與效果文字取自 [tcgdex/cards-database](https://github.com/tcgdex/cards-database) 的 `data-asia` 繁體中文資料，涵蓋 ex初階牌組 (SVD)、皮卡丘ex 起始組合 (SVC)，以及朱&紫系列的環境卡。
- 還沒有繁中資料的超級進化世代卡（超級路卡利歐ex、胡地等），依日文版內容翻譯（`tools/custom-cards.mjs`）。
- 招式效果由 `js/engine/effects.js` 解析卡片的中文文字；解析不了的效果都另外手寫實作。`npm test` 會檢查所有卡片都有實作。
- 卡圖來自[台灣官方訓練家網站](https://asia.pokemon-card.com/tw/)，縮小後存放在 `img/cards/`（`node tools/fetch-images.mjs` 產生對照表、`python3 tools/download-images.py` 下載），讀不到時改讀官網圖片，載入失敗時自動改用文字卡面（可在「收藏」頁關閉）。

重新產生卡片資料：

```bash
git clone --depth 1 https://github.com/tcgdex/cards-database ../tcgdex/cards-database
node tools/build-cards.mjs ../tcgdex/cards-database
```

### 加入官方擴充包

```bash
node tools/scrape-official.mjs SV8      # 從台灣官網抓取擴充包 → tools/official/SV8.json
node tools/build-cards.mjs              # 重新產生 js/data/cards.js
node test/unimplemented.mjs             # 列出還沒實作效果的卡
python3 tools/download-images.py        # 下載卡圖
```

目前收錄：SVD、SVC、SVQP、超電突圍 (SV8)、太晶慶典 (SV8a)、虛無歸零 (M3) 全卡（含特別插畫版），以及環境卡，共 678 張。

未收錄（需要尚未支援的機制）：招式學習器（螢石／演進／衰退）、海豚俠／海豚俠ex、古空棘魚、泰姆、零之大空洞。

## 專案結構

```
index.html            入口
css/style.css         樣式
js/app.js             畫面：主選單、對戰設定、商店、收藏、牌組編輯、規則
js/store.js           存檔（金幣、收藏、牌組、戰績）
js/shop.js            卡包與開包
js/data/cards.js      卡片資料（自動產生）
js/data/decks.js      起始牌組與 AI 牌組
js/engine/game.js     對戰規則引擎
js/engine/effects.js  招式／特性／訓練家／能量效果
js/ai/ai.js           AI（三種難度）
js/ui/                對戰畫面、卡片外觀、對話框
test/                 效果完整性檢查、AI 對 AI 模擬
tools/                卡片資料產生器
```

## 測試

```bash
npm test                      # 檢查效果實作 + 各牌組 AI 對戰模擬
node test/sim.mjs 3 hard easy # 困難 AI 對簡單 AI，每組對戰 3 場
node test/fuzz.mjs 200 SV8    # 用超電突圍的卡隨機組牌對戰 200 場
node test/effects.mjs         # 關鍵機制的情境測試
```

本作為玩家自製的非官方同人遊戲，寶可夢相關名稱與卡片內容版權屬於 The Pokémon Company／任天堂／Creatures／GAME FREAK。
