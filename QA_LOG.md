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
- [ ] P2：`packAuto` 效能剪枝（接受中，觀察）
- [ ] 公英制單位切換（商務 backlog）
- [ ] 棧板化 FR-4（SDD 既定範圍）
