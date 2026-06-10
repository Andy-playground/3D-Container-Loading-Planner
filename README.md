# 3D Container Loading Planner

3D 貨櫃裝載規劃器 — 純前端、無需 build、瀏覽器即開即用、完全離線可用。

> 📐 完整設計規格請見 [SDD.md](./SDD.md)

## 功能

### 核心
- ✅ 10 款內建貨櫃（Ocean / Truck / Rail）+ **自訂貨櫃尺寸**（v3.0）
- ✅ **自動選櫃 AUTO**：演算法評比所有櫃型，自動挑最佳方案（v3.0）
- ✅ 多貨物類型混裝、Extreme-Point 3D bin-packing 演算法
- ✅ 多貨櫃自動展開
- ✅ 約束：重量、堆疊層數、支撐比例、頂壓承重、面朝上
- ✅ 旋轉軸向（yaw / pitch / roll）+ This-Side-Up
- ✅ 裝載優先權（normal / urgent / lifo）+ **同 SKU 空間聚集**（v3.0）

### 貨物管理
- ✅ **貨物編輯／複製／顯示隱藏**（v3.0）
- ✅ **CSV 貨物清單匯入 + 範本下載**（v3.0）
- ✅ 常用尺寸 preset（歐規／美規棧板、標準紙箱、油桶）（v3.0）
- ✅ localStorage 自動存檔 + JSON 匯入/匯出（含自訂貨櫃）
- ✅ 計畫名稱（顯示於所有報表）（v3.0）

### 3D 視覺化
- ✅ Three.js + OrbitControls（**已 vendor 進專案，離線可用**）
- ✅ Door 指示、staircase packing、貨物面標籤（5 面）
- ✅ **裝載順序播放器**：slider + 動畫逐箱重播裝載過程（v3.0）
- ✅ 點擊箱子顯示明細（含裝載序）、變更貨櫃自動 re-pack
- ✅ 透明度調節、COG 顯示開關、響應式 UI
- ✅ **公英制單位切換（cm/kg ↔ in/lb）**，報表跟隨顯示單位（v3.1）

### 分析與報表
- ✅ 重心 (COG) 計算 + 3D 標示
- ✅ 軸載重均衡（truck only）+ **左右橫向平衡警示**（v3.0）
- ✅ **未裝載原因報告**（超尺寸／超重／空間不足）（v3.0）
- ✅ TXT / CSV / 列印-PDF 匯出（依**裝載順序**排列）
- ✅ **PDF 報告內嵌 3D 快照**、貨物彙總表（v3.0）
- ✅ **3D 截圖 PNG 匯出**（v3.0）
- ✅ 中／英文 i18n 切換

## 快速開始

### 直接開啟
雙擊 `index.html` 即可在瀏覽器執行（Three.js 已 vendor 至 `vendor/`，無需網路）。

### 本機伺服器（推薦）
```bash
# Python（含 no-cache header，方便開發）
python3 serve.py 8765

# 或標準 http.server
python3 -m http.server 8000
```
然後開啟 http://localhost:8765

### 執行演算法測試
```bash
node tests/packer.test.js
```
測試涵蓋 packer / COG / 軸載 / 橫向平衡 / loadSeq / 未裝載原因 / packAuto / groupSameSku / i18n 鍵一致性 / 單位轉換（共 77 斷言）。

### CSV 匯入格式
側欄「下載 CSV 範本」可取得範本，欄位：
```
name, length_cm, width_cm, height_cm, weight_kg, quantity, color, max_stack_layers, max_load_on_top_kg, this_side_up, priority
```

## 檔案結構

```
.
├── index.html              # 入口
├── SDD.md                  # 系統設計文件
├── package.json
├── serve.py                # 開發伺服器（no-cache）
├── vendor/
│   ├── three.module.min.js # Three.js r160（vendored，離線可用）
│   └── OrbitControls.js
├── src/
│   ├── app.js              # 模組編排、AUTO 選櫃、播放器
│   ├── ui.js               # 表單、編輯/複製/隱藏、CSV 匯入、自訂貨櫃
│   ├── scene.js            # Three.js 場景、步驟播放、截圖
│   ├── packer.js           # Extreme-Point packer、packAuto、loadSeq
│   ├── containers.js       # 內建 + 自訂貨櫃
│   ├── analytics.js        # 重心 + 軸載 + 橫向平衡
│   ├── exporters.js        # TXT / CSV / PDF（內嵌 3D 快照）
│   ├── i18n.js             # 中／英 翻譯
│   ├── units.js            # 公英制單位轉換
│   └── demo.js             # 示範資料
├── styles/
│   └── main.css
├── tests/
│   └── packer.test.js      # selftest（packer + analytics）
└── legacy/
    └── loading.html        # v0 單檔版本（保留參考）
```

## 開發路線

| Phase | 版本 | 範圍 | 狀態 |
|---|---|---|---|
| 1 | v1.0 MVP | 模組架構、packer、約束、多櫃、持久化 | ✅ |
| 2 | v1.1 | 旋轉軸向、This-Side-Up、3D 標籤、頂壓 | ✅ |
| 3 | v1.2 | 棧板化、填充規則、優先權、相同貨物聚集 | ✅ |
| 4 | v2.0 | TXT/CSV/PDF 匯出、重心、軸載、i18n | ✅ |
| 5 | v3.0 | 編輯/複製、自訂貨櫃、AUTO 選櫃、裝載順序播放、CSV 匯入、未裝載原因、橫向平衡、PNG/PDF 快照、離線化 | ✅ |
| 6 | v3.1 | QA 循環：安全/正確性修補、packAuto 剪枝、公英制單位（詳見 QA_LOG.md） | ✅ |

詳見 [SDD §11](./SDD.md#11-開發路線圖)。

## License
MIT
