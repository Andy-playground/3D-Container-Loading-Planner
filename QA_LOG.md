# QA / Production Review Log

每輪完整功能交付後，以 **Quality**（正確性、邊界、安全）與 **Production**（效能、相容性、穩定性）視角逐項審查並記錄。

---

## Iteration 1 — 2026-06-10（v3.0 交付後第一輪審查）

### 審查範圍
v3.0 全部新功能 + 既有程式碼回歸檢查（src/*.js、index.html、vendor/）。

### Production 視角

| # | 項目 | 結果 | 處置 |
|---|---|---|---|
| P1 | NFR-1 效能：1000 箱 < 3s | ✅ `pack()` 1000 箱 = **279ms**（5 櫃） | 無需處理 |
| P2 | `packAuto` 效能：1000 箱 × 10 櫃型 | ⚠️ **1.66s** — 可接受但接近上限 | 記錄觀察；若未來櫃型變多需加 early-exit |
| P3 | NFR-2 相容性：import map 需 Safari 16.4+，違反 Safari 15+ 要求 | 🔴 發現 | **已修**：改 patch vendored `OrbitControls.js` 直接 import `./three.module.min.js`，移除 import map |
| P4 | NFR-4 離線：three.js vendored | ✅ 無 CDN 依賴 | 已於 v3.0 完成 |
| P5 | 記憶體：texture/geometry dispose | ✅ `disposeGroup` 涵蓋巢狀 box group | 無需處理 |
| P6 | localStorage 失敗（隱私模式 / 超量）| ✅ 全部 try/catch + console.warn | 無需處理 |
| P7 | 瀏覽器煙霧測試（headless Chromium）| ✅ 裝載/播放/AUTO/自訂櫃/語言/PNG 零 console error | 持續每輪驗證 |

### Quality 視角

| # | 項目 | 結果 | 處置 |
|---|---|---|---|
| Q1 | 表單解析 `parseFloat(x) \|\| Infinity`：輸入 `0`（頂壓 0 = 不可堆疊）被誤判為 ∞；支撐比例 0% 變 80%（既有 bug，v1.x 引入） | 🔴 發現 | **已修**：新增 `numOr()`，0 為合法值；同時 clamp 範圍（layers ≥ 1、ratio 0–1、weight ≥ 0） |
| Q2 | CSV / JSON 匯入 `color` 未驗證即插入 `style` attribute（HTML 注入面） | 🔴 發現 | **已修**：`sanitizeColor()` 僅接受 `#RRGGBB`，否則退回調色盤 |
| Q3 | JSON 匯入貨物數值未驗證（負數/NaN 會進 packer） | 🟡 發現 | **已修**：`normalizeCargo()` 驗證 L/W/H/qty > 0，非法列直接丟棄；priority 白名單 |
| Q4 | `maxLoadOnTopKg: Infinity` JSON 序列化為 `null` 的 round-trip | ✅ `numOr(null, Infinity)` 正確還原 | 含於 Q1 修正 |
| Q5 | `computeTopLoad` 跨多支撐箱會重複計重（保守方向，不會超載） | 🟡 已知限制 | 接受（偏安全側）；記錄 |
| Q6 | 演算法測試 | ✅ 65 斷言全過（T1–T13） | 持續每輪執行 |
| Q7 | i18n 鍵完整性：zh-Hant / en 兩字典鍵集合一致 | ✅ | **已自動化**：新增 T14 鍵一致性測試（111 鍵 × 2 語系） |

### 本輪修正清單
1. 移除 import map，patch `vendor/OrbitControls.js` import 路徑（P3）
2. `ui.js`：`numOr()` 取代 `|| default`，修復 0 值欄位；範圍 clamp（Q1）
3. `ui.js`：`sanitizeColor()` 套用於表單／CSV／JSON／localStorage 四個入口（Q2）
4. `ui.js`：`normalizeCargo()` 強化驗證、非法資料列過濾（Q3）
5. `tests`：新增 T14 i18n 鍵一致性測試（Q7）

### 驗證
- `node tests/packer.test.js` → **67 斷言全過**
- Headless Chromium 煙霧測試 → 重跑通過、零 console error（無 import map 路徑亦驗證）

### 遺留事項（下輪檢視）
- [ ] P2：`packAuto` 大量櫃型時的效能上限（可加 volume 下界剪枝）
- [ ] 公英制單位切換（商務功能 backlog）
- [ ] 棧板化 FR-4（SDD 既定範圍，目前簡化處理）
- [x] 行動裝置（< 860px）下 seqBar 與 detailsPanel 重疊檢查 → Iteration 2 完成

---

## Iteration 2 — 2026-06-10（UX 一致性 + 行動版面）

### Production 視角

| # | 項目 | 結果 | 處置 |
|---|---|---|---|
| P8 | 行動裝置 390×844：seqBar 是否溢出/重疊 | ✅ boundingBox (35, 784, 320×48) 完整置於視窗內；topbar 正常換行 | 截圖驗證，無需處理 |
| P9 | 環境限制：`ScheduleWakeup`/`CronCreate` 不存在 | 🟡 | 改以 Monitor 計時喚醒驅動審查循環 |

### Quality 視角

| # | 項目 | 結果 | 處置 |
|---|---|---|---|
| Q8 | UX 不一致：換貨櫃會自動 re-pack，但編輯/刪除/複製/匯入貨物後 3D 仍顯示舊計畫 | 🔴 發現 | **已修**：cargo 變更事件帶 `{cargo:true}`，已有計畫時自動 re-pack |
| Q9 | 貨物全部刪除後場景殘留舊箱子、seqBar 殘留 | 🔴 發現 | **已修**：清空時 render 空櫃、stats 重置為「尚未裝載」、seqBar 隱藏 |
| Q10 | 清空時 AUTO / 已刪自訂櫃 id 造成 `getContainer` undefined → render crash | 🟡 邊界 | **已修**：fallback `OCEAN_40HQ` |

### 本輪修正清單
1. `ui.js`：6 處 cargo 變更 emit 加上 `{cargo:true}` 標記
2. `app.js`：cargo 變更自動 re-pack；清空時清場景 + 重置 stats/seqBar；container spec fallback

### 驗證（headless Chromium）
- 編輯數量 20→40 → stats 自動變 40/40 ✅
- 複製貨物 → 80/80 ✅
- 全部刪除 → 「尚未裝載」、seqBar 隱藏 ✅
- 行動裝置 390px 版面 ✅、零 console error
- `node tests/packer.test.js` → 67 斷言全過

### 遺留事項（下輪檢視）
- [x] P2：`packAuto` 效能剪枝 → Iteration 3 完成
- [x] 公英制單位切換 → Iteration 3 完成
- [ ] 棧板化 FR-4（SDD 既定範圍）

---

## Iteration 3 — 2026-06-10（效能剪枝 + 公英制單位）

### Production 視角

| # | 項目 | 結果 | 處置 |
|---|---|---|---|
| P10 | `packAuto` 剪枝：大櫃先評估建立 baseline，已有零未裝載解後以 best 櫃數為 `maxContainers` 上限截斷 | ✅ 1000 箱 × 10 櫃型 **1661ms → 741ms（2.2×）**，選櫃結果不變（T11 驗證） | 已實作 |
| P11 | 單位轉換不影響內部計算：儲存／packer／JSON／CSV 永遠公制，僅顯示/輸入層轉換 | ✅ 設計如此，避免累積誤差 | 記錄設計決策 |

### Quality 視角

| # | 項目 | 結果 | 處置 |
|---|---|---|---|
| Q11 | 公英制切換（cm/kg ↔ in/lb）：表單、清單、貨櫃資訊、統計、明細、TXT/PDF 報表全面跟隨；CSV 維持公制（資料交換格式，欄名 `_cm`/`_kg` 自述） | ✅ 新功能 | 已實作（`src/units.js`） |
| Q12 | 切換單位時表單已輸入值就地換算（以公制為 pivot）、語言切換後單位後綴保留、設定持久化 | ✅ Chromium 驗證：100cm↔39.37in、10in 存為 25.4cm、重整保留 | 已驗證 |
| Q13 | 初版漏 import `initUnits` → 啟動 ReferenceError（煙霧測試攔截） | 🔴 發現於測試 | **已修**；證明每輪必跑瀏覽器煙霧測試的價值 |
| Q14 | T15 單位測試：cm↔in、kg↔lb、round-trip 漂移 < 1e-9、∞ 格式、尾零修剪 | ✅ 新增 10 斷言 | 已自動化 |

### 本輪修正清單
1. `packer.js`：`packAuto` 體積降序評估 + maxContainers 剪枝（P10）
2. 新增 `src/units.js`：單位狀態、轉換、格式化（持久化 `clp:units`）
3. `ui.js`／`index.html`：單位選擇器、9 個標籤動態後綴、輸入/顯示轉換、表單值就地換算
4. `exporters.js`：TXT/PDF 跟隨顯示單位；CSV 維持公制
5. `i18n.js`：標籤鍵去硬編碼單位 + 3 個新鍵
6. `tests`：T15 單位轉換（10 斷言）

### 驗證
- `node tests/packer.test.js` → **77 斷言全過**
- Chromium 煙霧 ×3（基本流程／auto-repack／單位系統）→ 全過、零 console error

### 遺留事項（下輪檢視）
- [x] 棧板化 FR-4 完整實作 → Iteration 4 完成
- [x] 明細面板單位就地刷新 → Iteration 4 完成

---

## Iteration 4 — 2026-06-10（棧板化 FR-4 + 明細就地刷新）→ 循環收斂

### Quality 視角

| # | 項目 | 結果 | 處置 |
|---|---|---|---|
| Q15 | 棧板化 FR-4.1 完整實作：`isPallet` + `palletItems[]`（名稱/數量/單件重），整板為一個裝載單位，子貨物僅統計用（符合 SDD §4.4） | ✅ 新功能 | 表單子貨物編輯器（含合計重量提示）、清單 ▤ 徽章、3D 明細內容物、TXT/PDF 報表棧板內容、JSON round-trip 消毒（`sanitizePalletItems`） |
| Q16 | 明細面板開啟時切換單位 → 就地以新單位重繪（原為直接關閉）；語言切換亦同步刷新 | ✅ | `lastDetails` + `refreshDetails()` 併入 `renderAll()` |
| Q17 | T16 棧板測試：10 板整板裝載、`maxStackLayers=1` 全數落地、`palletItems` 隨 placement 傳遞、無重疊 | ✅ 新增 5 斷言 | 已自動化 |

### Production 視角

| # | 項目 | 結果 | 處置 |
|---|---|---|---|
| P12 | 全套回歸（4 套 Chromium 煙霧：基本流程／auto-repack／單位系統／棧板）+ 82 斷言 | ✅ 全綠、零 console error | — |
| P13 | 棧板瀏覽器流程：子貨物合計 252kg 提示、編輯回填、重整持久化、明細英制就地刷新 | ✅ | — |

### 本輪修正清單
1. `packer.js`：`isPallet`/`palletItems` 隨 box → placement 傳遞
2. `ui.js`／`index.html`／`main.css`：棧板子貨物編輯器、徽章、明細內容物、`sanitizePalletItems`
3. `ui.js`：`refreshDetails()` — 單位/語言切換時明細面板就地刷新
4. `exporters.js`：TXT 計畫頭部 + PDF 每櫃彙總表下方列出棧板內容物
5. `tests`：T16（5 斷言）

### 驗證
- `node tests/packer.test.js` → **82 斷言全過**
- Chromium 煙霧 ×4 全綠、零 console error

### 收斂前複查
複查發現 Iteration 4 的收斂聲明不精確：FR-4.2 填充規則（columnFill / mixed）尚未實作 → 進入 Iteration 5。

---

## Iteration 5 — 2026-06-10（FR-4.2 填充規則）→ 循環收斂

| # | 視角 | 項目 | 結果 |
|---|---|---|---|
| Q18 | Quality | FR-4.2：全域填充規則 `mixed`（利用率優先）/ `columnFill`（強制全部 SKU 空間聚集，卸貨優先），選擇器置於貨櫃區、切換即重排、持久化、i18n | ✅ 實作（packer `options.fillRule` → 全 box `groupSameSku=true`） |
| Q19 | Quality | T17：columnFill 下各 SKU 平均間距 ≤ mixed、箱數一致、無重疊 | ✅ 新增 5 斷言 |
| P14 | Production | Chromium：切換 columnFill 自動重排、重整持久化、英文選項標籤 | ✅ 零 console error |

### 驗證
- `node tests/packer.test.js` → **86 斷言全過**
- Chromium 煙霧 ×5 全綠

### 循環收斂聲明
QA_LOG 遺留清單已全數結案。SDD §4 功能需求現狀：FR-1～FR-5 全部實作完成，唯一例外為 FR-2.3「旋轉步長 45°/15°」（P2）——對軸對齊（AABB）bin-packing 演算法無實質意義，正式標記為**不做**（won't-do）。品質基線：86 個演算法/分析/i18n/單位斷言 + 5 套瀏覽器煙霧測試。後續若有新驗收要求，重新觸發 QA 循環即可。
