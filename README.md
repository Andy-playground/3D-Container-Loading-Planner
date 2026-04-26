# 3D Container Loading Planner

3D 貨櫃裝載規劃器 — 純前端、無需 build、瀏覽器即開即用。

> 📐 完整設計規格請見 [SDD.md](./SDD.md)

## 功能（Phase 1 MVP）

- ✅ 10 款內建貨櫃（Ocean / Truck / Rail）
- ✅ 多貨物類型混裝
- ✅ Extreme-Point 3D bin-packing 演算法
- ✅ 多貨櫃自動展開
- ✅ 約束：重量、堆疊層數、支撐比例、頂壓承重、面朝上
- ✅ 3D 視覺化（Three.js）+ OrbitControls
- ✅ localStorage 自動存檔 + JSON 匯入/匯出
- ✅ 透明度調節
- ✅ 響應式 UI（桌機/平板/手機）

## 快速開始

### 直接開啟
雙擊 `index.html` 即可在瀏覽器執行（需要網路：Three.js 從 esm.sh CDN 載入）。

### 本機伺服器（推薦）
```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```
然後開啟 http://localhost:8000

### 執行演算法測試
```bash
node tests/packer.test.js
```

## 檔案結構

```
.
├── index.html              # 入口
├── SDD.md                  # 系統設計文件
├── package.json
├── src/
│   ├── app.js              # 模組編排
│   ├── ui.js               # 表單、列表、localStorage、JSON I/O
│   ├── scene.js            # Three.js 場景
│   ├── packer.js           # Extreme-Point 3D bin-packing
│   ├── containers.js       # 10 款內建貨櫃
│   └── demo.js             # 示範資料
├── styles/
│   └── main.css
├── tests/
│   └── packer.test.js      # 5 個 selftest
└── legacy/
    └── loading.html        # v0 單檔版本（保留參考）
```

## 開發路線

| Phase | 版本 | 範圍 |
|---|---|---|
| **1** | v1.0 MVP | 模組架構、packer、約束、多櫃、持久化 ← *目前* |
| 2 | v1.1 | 旋轉軸向、This-Side-Up、3D 標籤、頂壓 |
| 3 | v1.2 | 棧板化、填充規則、優先權、相同貨物聚集 |
| 4 | v2.0 | TXT/CSV/PDF 匯出、重心計算、i18n |

詳見 [SDD §11](./SDD.md#11-開發路線圖)。

## License
MIT
