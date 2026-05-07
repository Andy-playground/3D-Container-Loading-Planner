# 3D Container Loading Planner

3D 貨櫃裝載規劃器 — 純前端、無需 build、瀏覽器即開即用。

> 📐 完整設計規格請見 [SDD.md](./SDD.md)

## 功能

- ✅ 10 款內建貨櫃（Ocean / Truck / Rail）
- ✅ 多貨物類型混裝
- ✅ Extreme-Point 3D bin-packing 演算法
- ✅ 多貨櫃自動展開
- ✅ 約束：重量、堆疊層數、支撐比例、頂壓承重、面朝上
- ✅ 旋轉軸向（yaw / pitch / roll）+ This-Side-Up
- ✅ 3D 視覺化（Three.js）+ OrbitControls
- ✅ Door 指示、staircase packing、貨物面標籤（5 面）
- ✅ 點擊箱子顯示明細、變更貨櫃自動 re-pack
- ✅ 裝載優先權（normal / urgent / lifo）
- ✅ localStorage 自動存檔 + JSON 匯入/匯出
- ✅ **TXT / CSV / 列印-PDF 匯出**（v2.0）
- ✅ **重心 (COG) 計算 + 3D 標示**（v2.0）
- ✅ **軸載重均衡（truck only）**（v2.0）
- ✅ **中／英文 i18n 切換**（v2.0）
- ✅ 透明度調節、COG 顯示開關、響應式 UI

## 快速開始

### 直接開啟
雙擊 `index.html` 即可在瀏覽器執行（需要網路：Three.js 從 esm.sh CDN 載入）。

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
測試涵蓋 packer 5 案例 + COG / 軸載 / enrichResult 整合（共 30+ 斷言）。

## 檔案結構

```
.
├── index.html              # 入口
├── SDD.md                  # 系統設計文件
├── package.json
├── serve.py                # 開發伺服器（no-cache）
├── src/
│   ├── app.js              # 模組編排
│   ├── ui.js               # 表單、列表、localStorage、JSON I/O
│   ├── scene.js            # Three.js 場景
│   ├── packer.js           # Extreme-Point 3D bin-packing
│   ├── containers.js       # 10 款內建貨櫃
│   ├── analytics.js        # 重心 + 軸載計算（v2.0）
│   ├── exporters.js        # TXT / CSV / PDF 匯出（v2.0）
│   ├── i18n.js             # 中／英 翻譯（v2.0）
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
| 3 | v1.2 | 棧板化、填充規則、優先權、相同貨物聚集 | ✅（priority 已做；棧板化簡化處理）|
| 4 | v2.0 | TXT/CSV/PDF 匯出、重心、軸載、i18n | ✅ |

詳見 [SDD §11](./SDD.md#11-開發路線圖)。

## License
MIT
