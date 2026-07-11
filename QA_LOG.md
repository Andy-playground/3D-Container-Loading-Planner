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
- [ ] 行動裝置（< 860px）下 seqBar 與 detailsPanel 重疊檢查

---

## Iteration 2 — 2026-07-11（v3.2 演算法重構）

### 審查範圍
`src/packer.js` 全面重構（依 docs/ALGORITHM_REVIEW.md 之發現）+ 不可堆疊功能貫通（UI/CSV/JSON/demo/i18n）。

### Quality 視角

| # | 項目 | 結果 | 處置 |
|---|---|---|---|
| Q1 | Bug 1：全數無法放置時產生最多 20 個空櫃、扭曲 packAuto 評分 | 🔴 發現（見 ALGORITHM_REVIEW §4.1） | **已修**：整櫃零放置即停止展開；T19 鎖住 |
| Q2 | Bug 2：`maxLoadOnTopKg` 只驗直接支撐層，支撐鏈下層可能超載 | 🔴 發現 | **已修**：重量依接觸面積比例分配、沿支撐鏈逐層驗證；T17 鎖住 |
| Q3 | 舊 `computeTopLoad` 菱形支撐重複計重（Iteration 1 Q5） | 🟡 已知限制 | **已修**：z 遞減拓撲序單次傳遞，載重守恆 |
| Q4 | 排序僅體積 FFD，重箱可能疊在輕箱上（重心偏高、壓損風險） | 🔴 發現 | **已修**：重量優先排序 + best-fit 金字塔懲罰；T15 鎖住（修正前重心 159cm → 修正後 61cm） |
| Q5 | `maxLoadOnTopKg=0` 仍可被零重量箱疊上 | 🟡 發現 | **已修**：`nonStackable`／`maxLoadOnTopKg≤0` 硬性禁止上方放置 |
| Q6 | 不可堆疊貨（鋰電池／輪組棧板）無一鍵選項 | 🟡 功能缺口 | **已加**：`nonStackable` 欄位貫通表單／CSV／JSON／demo／3D ⊘ 圖示 |
| Q7 | 承重、支撐率、旋轉尺寸、中間層數無測試 | 🔴 發現 | **已補**：T15–T22，67 → **90 斷言** |

### Production 視角

| # | 項目 | 結果 | 處置 |
|---|---|---|---|
| P1 | 熱迴圈遞迴 `computeTopLoad`/`computeLayer`（最壞 ~O(n³)） | 🔴 發現 | **已修**：支撐圖／層數／累計承載快取於 placement，增量更新 |
| P2 | NFR-1：1000 箱 < 3s | ✅ 重構後 **112ms**（舊版 279ms） | T22 自動化 |
| P3 | 利用率回歸：4 組情境 + 原始 demo 對照舊版 | ✅ 櫃數與利用率持平 | 無需處理 |
| P4 | EP 懸空側向極點浪費可放置位 | 🟡 發現 | **已修**：EP 向下投影 + 櫃壁無效點剔除 |
| P5 | Headless Chromium 煙霧測試（表單/裝載/demo/語言切換） | ✅ 零 console error | 持續每輪驗證 |

### 驗證
- `node tests/packer.test.js` → **90 斷言全過**（T1–T22）
- 金字塔行為對照：強制堆疊情境，舊版「重壓輕」10 件 → 新版 0 件
- 不可堆疊：棧板全在地面、其上 0 箱（單元測試 + 瀏覽器內實測）

### 遺留事項（下輪檢視）
- [ ] LIFO 真門邏輯（ALGORITHM_REVIEW §3-3，實務價值最高的補強）
- [ ] 承重分配模型可再進階為剛體力學近似（目前為接觸面積比例，業界常用近似）
- [ ] Iteration 1 遺留：公英制切換、行動版版面
