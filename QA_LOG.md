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

## Iteration 2 — 2026-11-11（全專案稽核）

Iteration 1 的數字（67 斷言、111 個 i18n 鍵）為當時狀態；目前為 **77 斷言、152 個 i18n 鍵 × 2 語系**。

### 修正
| # | 項目 | 處置 |
|---|---|---|
| A1 | 剩餘貨物全數放不進時開出最多 20 個空櫃 | **已修**：該輪放置 0 箱即停止 |
| A2 | 頂壓上限只檢查直接支撐層 | **已修**：沿支撐鏈逐層檢查；堆疊層數與頂壓改為放置時增量記錄 |
| A3 | Q5 多支撐箱重複計重 | **已修**：每個下層箱只計一次 |
| A4 | LIFO 僅為排序偏置 | **已修**：LIFO 箱與櫃門之間不得有非 LIFO 貨物 |
| A5 | 同 SKU 聚集因距離同分而無效 | **已修**：改以放置後箱心到同類重心的距離排序 |
| A6 | 載重已滿的未裝載原因顯示為「空間不足」 | **已修**：新增 `payload` 原因 |
| A7 | 匯入 JSON 後貨物 ID 重複；ID 與自訂貨櫃尺寸未驗證即寫入 HTML | **已修** |
| A8 | 修改貨物後畫面／統計／匯出仍為舊結果 | **已修**：自動重新裝載 |
| A9 | 確認對話框在「取消」上按 Enter 會確認 | **已修** |
| A10 | 每箱各自產生 3 張標籤貼圖 | **已修**：同類同方向共用 |
| A11 | CSV 不支援引號內換行、無法設定旋轉／支撐比例／聚集 | **已修** |
| A12 | README 稱可雙擊 `index.html`（ES modules 在 `file://` 下無法載入） | **已修**：文件更正 |

### 效能（Node，OCEAN_40HQ）
| 情境 | 修正前 | 修正後 |
|---|---|---|
| 1000 箱 60×40×40 | 104ms | 92ms |
| 2000 箱 40×30×10（深堆疊） | 435ms | 136ms |
| 3000 箱 30×30×10（深堆疊） | 866ms | 200ms |

### 驗證
- `node tests/packer.test.js` → **77 斷言全過**
- Headless Chromium：自動重新裝載、CSV 匯入、TXT/JSON 匯出、惡意 JSON 匯入、對話框鍵盤操作 → 零 console error

### 遺留事項
- [ ] 內建 40GP／40HQ 的載重上限（26,700／26,500 kg）與 `docs/container-specs.pdf`（28,800／28,620 kg）不一致，待確認採用哪一組
- [ ] 棧板化 FR-4、旋轉步長、櫃門尺寸（SDD 已標註未實作）
- [ ] 公英制單位切換
- [ ] 行動裝置（< 860px）下 seqBar 與 detailsPanel 重疊檢查
