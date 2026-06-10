# 3D Container Loading Planner — 系統設計文件 (SDD)

**版本**：1.0
**日期**：2026-04-27
**作者**：Andy Yang
**Repo**：https://github.com/Andy-playground/3D-Container-Loading-Planner

---

## 目錄
1. [文件目的與範圍](#1-文件目的與範圍)
2. [系統概述](#2-系統概述)
3. [使用者故事](#3-使用者故事)
4. [功能需求](#4-功能需求)
5. [非功能需求](#5-非功能需求)
6. [資料模型](#6-資料模型)
7. [系統架構](#7-系統架構)
8. [演算法設計](#8-演算法設計)
9. [UI/UX 規格](#9-uiux-規格)
10. [資料持久化與匯入/匯出](#10-資料持久化與匯入匯出)
11. [開發路線圖](#11-開發路線圖)
12. [驗收測試](#12-驗收測試)

---

## 1. 文件目的與範圍

本文件定義「3D 貨櫃裝載規劃系統」之系統需求、設計與開發規格，作為實作、測試與驗收的單一真實來源（Single Source of Truth）。

**範圍內**：
- 純瀏覽器端（client-side）3D 視覺化裝櫃模擬
- 多種貨櫃類型（海運／陸運／鐵運）
- 多貨物類型混裝、自動排櫃演算法
- 約束條件（重量、堆疊、方向、棧板）
- 結果匯出（JSON、報表）

**範圍外（未來版本）**：
- 後端 API、多人協作、雲端儲存
- 危險品（DG/IMO）分區規則
- 海關文件自動化

---

## 2. 系統概述

3D 貨櫃裝載規劃器（以下簡稱「系統」）為一個**單頁應用**（SPA），協助物流規劃人員、出貨單位、業務人員快速判斷一批貨物所需的貨櫃數量、裝載方式與空間利用率，並以 3D 視覺化呈現結果。

### 2.1 核心價值
- **規劃前**：估算所需貨櫃數量、避免「裝不下才發現」
- **規劃中**：即時調整貨物清單與約束條件，看到 3D 結果
- **規劃後**：匯出裝載計畫（JSON/報表），交付倉儲現場執行

### 2.2 技術選型
| 層級 | 技術 | 說明 |
|---|---|---|
| 渲染引擎 | Three.js (r160) | vendored 至 `vendor/`（import map），無需 build、離線可用 |
| 模組化 | ES Modules | 原生 `import`/`export` |
| 演算法 | Extreme-Point 3D bin-packing | 純 JavaScript |
| 持久化 | localStorage | 瀏覽器端 |
| UI | 原生 HTML + CSS | 不引入 framework |

---

## 3. 使用者故事

| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-1 | 物流規劃員 | 選擇貨櫃類型並輸入多種貨物 | 看到模擬裝載結果 |
| US-2 | 業務 | 知道一批貨需要幾個貨櫃 | 報價給客戶 |
| US-3 | 倉儲現場主管 | 看到每件貨物的 X/Y/Z 座標 | 指揮現場堆疊 |
| US-4 | 規劃員 | 設定「易碎品不可堆疊」 | 避免破損 |
| US-5 | 規劃員 | 標記「This Side Up」貨物 | 確保不被翻倒 |
| US-6 | 規劃員 | 將計畫存檔，下次再開啟 | 重複利用 |
| US-7 | 規劃員 | 匯出 JSON 給其他系統 | 整合 ERP/WMS |
| US-8 | 規劃員 | 設定「先進後出」順序 | 配合卸貨順序 |
| US-9 | 規劃員 | 以棧板為單位裝載 | 配合堆高機作業 |

---

## 4. 功能需求

### 4.1 貨物基本屬性（FR-1）

| ID | 功能 | 描述 | 優先級 | 現狀 |
|---|---|---|---|---|
| 1.1 | 尺寸 L/W/H | 公分輸入，正整數或小數 | P0 | ✅ |
| 1.2 | 重量 | kg，每箱重量 | P0 | ❌ |
| 1.3 | 數量 | 整數，該類貨物總箱數 | P0 | ✅ |
| 1.4 | 裝載優先權 | normal / urgent / lifo | P1 | ❌ |

**1.4 詳細規格**：
- `urgent`：優先排入第一個貨櫃
- `lifo`（後進先出 → 先卸貨者後裝）：靠門邊或上層
- `normal`：依 FFD 排序

### 4.2 旋轉與方向控制（FR-2）

| ID | 功能 | 描述 | 優先級 | 現狀 |
|---|---|---|---|---|
| 2.1 | 旋轉許可（分軸向） | yaw / pitch / roll 三軸獨立 | P1 | ⚠️ 僅 yaw |
| 2.2 | 面朝上限制（This Side Up） | 獨立旗標，禁止 pitch/roll | P1 | ⚠️ 隱含 |
| 2.3 | 旋轉步長 | 預設 90°，可選 45°/15° | P2 | ❌ |

**2.1 規格**：
```
rotatable: {
  yaw:   true,  // 繞垂直軸（L↔W 互換）
  pitch: false, // 繞前後軸（W↔H 互換，會翻倒）
  roll:  false  // 繞左右軸（L↔H 互換，會翻倒）
}
```

**2.2 規格**：
- `thisSideUp = true` → 強制 `pitch=false, roll=false`，UI 顯示 ↑ 標誌

### 4.3 堆疊規則（FR-3）

| ID | 功能 | 描述 | 優先級 | 現狀 |
|---|---|---|---|---|
| 3.1 | 最大堆疊層數 | maxStackLayers（含自身）| P1 | ❌ |
| 3.2 | 承重上限 | maxLoadOnTopKg（每箱頂面承重）| P1 | ❌ |
| 3.3 | 懸空容忍度 | supportRatioMin（底面被支撐比例 0~1）| P1 | ❌ |
| 3.4 | 相同貨物集中 | groupSameSku（同類聚集擺放）| P2 | ❌ |

**3.2 範例**：
- 紙箱 A 設 `maxLoadOnTopKg=20`，則其上方累計重量 ≤ 20kg
- 演算法在每次放置後，檢查所有「下方箱子」的累計頂壓

**3.3 範例**：
- `supportRatioMin=0.8` → 該箱底面至少 80% 面積被下層支撐
- 設為 0 等同允許懸空（不建議）

### 4.4 棧板化（FR-4）

| ID | 功能 | 描述 | 優先級 | 現狀 |
|---|---|---|---|---|
| 4.1 | 棧板化（pallet as unit）| 一個棧板含多箱，整體裝載 | P2 | ✅ v3.1 |
| 4.2 | 填充規則 | columnFill（整列）/ mixed（混裝）| P2 | ❌ |

**4.1 規格**：
- 棧板本身為一個 cargo（含尺寸、重量、堆疊層數）
- `palletItems[]` 描述其上的子貨物（僅統計用，演算法視為整體）
- 常見尺寸：歐規 1200×800、美規 1200×1000

**4.2 規格**：
- `columnFill`：整一列（同 SKU）填滿才換下一列 → 卸貨容易
- `mixed`：依空間最佳化混合擺 → 利用率高

### 4.5 視覺化（FR-5）

| ID | 功能 | 描述 | 優先級 | 現狀 |
|---|---|---|---|---|
| 5.1 | 顏色標示 | 每種貨物獨立顏色 | P0 | ✅ |
| 5.2 | 3D 標籤顯示 | 箱頂浮動文字（名稱）| P1 | ⚠️ 部分（僅貼圖）|
| 5.3 | 透明度調節 | 全域 slider 0~100% | P2 | ❌ |

---

## 5. 非功能需求

| ID | 類別 | 需求 |
|---|---|---|
| NFR-1 | 效能 | 1000 箱以下，演算法 < 3 秒；3D 渲染 ≥ 30 FPS |
| NFR-2 | 相容性 | Chrome 100+ / Safari 15+ / Edge 100+ |
| NFR-3 | 響應式 | ≥ 1024px 橫向；< 860px 直向 |
| NFR-4 | 可離線 | 首次載入後離線可用（CDN 資源除外）|
| NFR-5 | 持久化 | localStorage 自動存檔，重整不遺失 |
| NFR-6 | 可攜性 | 純前端、無後端依賴；可部署於 GitHub Pages |
| NFR-7 | 國際化 | UI 文字字串集中於 i18n 檔（v1.2 以後）|

---

## 6. 資料模型

### 6.1 CargoItem（貨物類型）

```typescript
interface CargoItem {
  id: string                 // 唯一識別
  name: string               // 顯示名稱
  // 基本屬性
  length: number             // cm
  width: number              // cm
  height: number             // cm
  weightKg: number           // 每箱重量
  quantity: number           // 該類總箱數
  color: string              // hex e.g. "#007bff"
  // 旋轉
  rotatable: {
    yaw: boolean             // L↔W
    pitch: boolean           // W↔H（翻倒）
    roll: boolean            // L↔H（翻倒）
  }
  thisSideUp: boolean        // 強制 pitch=roll=false
  rotationStep: number       // degrees (90 | 45 | 15)
  // 堆疊
  maxStackLayers: number     // 含自身（1=不可堆疊）
  maxLoadOnTopKg: number     // 頂面可承重 kg
  supportRatioMin: number    // 0~1
  groupSameSku: boolean      // 同 SKU 聚集
  // 棧板
  isPallet: boolean
  palletItems?: SubItem[]    // 棧板上的子貨物（統計用）
  // 優先權
  priority: 'normal' | 'urgent' | 'lifo'
}

interface SubItem {
  name: string
  quantity: number
  weightKg: number
}
```

### 6.2 Container（貨櫃）

```typescript
interface Container {
  id: string
  mode: 'ocean' | 'truck' | 'rail'
  type: string               // e.g. "20GP", "40HQ", "53FT-DRYVAN"
  internal: {
    length: number           // cm
    width: number            // cm
    height: number           // cm
  }
  payloadKg: number          // 最大載重
  doorWidth?: number         // 門寬（用於 LIFO 規劃）
  doorHeight?: number
}
```

**內建貨櫃清單（10 款）**：

| Mode | Type | L (cm) | W (cm) | H (cm) | Payload (kg) |
|---|---|---|---|---|---|
| Ocean | 20GP | 589.6 | 235.0 | 239.3 | 28,200 |
| Ocean | 40GP | 1203.2 | 235.0 | 239.3 | 26,700 |
| Ocean | 40HQ | 1203.2 | 235.0 | 269.7 | 26,500 |
| Ocean | 45HQ | 1355.5 | 235.0 | 269.7 | 27,600 |
| Truck | 20FT Box | 580.0 | 240.0 | 240.0 | 12,000 |
| Truck | 40FT Box | 1200.0 | 240.0 | 260.0 | 22,000 |
| Truck | 53FT Dry Van | 1610.0 | 254.0 | 274.0 | 20,000 |
| Rail | 40FT Flatcar | 1218.0 | 244.0 | 290.0 | 30,000 |
| Rail | 60FT Boxcar | 1828.0 | 290.0 | 320.0 | 50,000 |
| Rail | 89FT Hi-Cube | 2710.0 | 290.0 | 350.0 | 60,000 |

### 6.3 PlacedItem（裝載結果）

```typescript
interface PlacedItem {
  cargoId: string
  containerId: string
  position: { x: number, y: number, z: number }  // cm，左下後角為原點
  orientation: { yaw: 0|90|180|270, pitch: 0|90, roll: 0|90 }
  finalDims: { L: number, W: number, H: number }  // 旋轉後實際佔用
}
```

### 6.4 LoadingPlan（完整計畫）

```typescript
interface LoadingPlan {
  metadata: {
    createdAt: string        // ISO 8601
    version: string          // SDD version
    title: string            // user-defined
  }
  cargoTypes: CargoItem[]
  containers: Container[]    // 已使用的貨櫃實例
  placements: PlacedItem[]
  stats: {
    totalBoxes: number
    placedBoxes: number
    volumeUtilization: number  // 0~1
    weightUtilization: number  // 0~1
    perContainerStats: ContainerStat[]
  }
}
```

---

## 7. 系統架構

### 7.1 模組關係

```
┌──────────────────────────────────────┐
│            index.html                │
│   <script type="module" src=app.js>  │
└──────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   ┌─────────┐             ┌─────────┐
   │ app.js  │ ─────────►  │ ui.js   │
   │ (orch)  │             │         │
   └─────────┘             └─────────┘
        │                       │
        ├──────────┬────────────┼──────────┐
        ▼          ▼            ▼          ▼
   ┌────────┐ ┌────────┐  ┌─────────┐ ┌─────────┐
   │packer  │ │scene   │  │container│ │demo.js  │
   │.js     │ │.js     │  │s.js     │ │         │
   └────────┘ └────────┘  └─────────┘ └─────────┘
                  │
                  ▼
           ┌──────────────┐
           │ three.js     │
           │ (esm.sh CDN) │
           └──────────────┘
```

### 7.2 模組職責

| 模組 | 職責 | 對外 API |
|---|---|---|
| `containers.js` | 內建 10 款貨櫃定義、查詢 | `CONTAINERS`, `getContainer(id)` |
| `packer.js` | 3D bin-packing 演算法、約束檢查 | `pack(cargoTypes, containerType, options)` |
| `scene.js` | Three.js 場景、相機、光源、box 渲染 | `init()`, `render(plan)`, `setOpacity(v)`, `toggleLabels()` |
| `ui.js` | 表單、列表、localStorage、JSON I/O | `bindEvents()`, `renderCargoList()`, `save()`, `load()`, `exportJSON()`, `importJSON()` |
| `app.js` | 模組編排、事件總線 | `start()` |
| `demo.js` | 示範資料 | `DEMO_PLANS` |

### 7.3 檔案結構

```
3D-Container-Loading-Planner/
├── index.html                # entry
├── SDD.md                    # 本文件
├── README.md
├── LICENSE
├── src/
│   ├── app.js
│   ├── ui.js
│   ├── scene.js
│   ├── packer.js
│   ├── containers.js
│   └── demo.js
├── styles/
│   └── main.css
├── tests/
│   └── packer.test.js        # Node selftest
└── docs/
    ├── algorithm.md          # 演算法細節
    └── screenshots/
```

---

## 8. 演算法設計

### 8.1 主演算法：Extreme-Point Heuristic + FFD

**Pre-processing**：
1. 展開 `quantity` 為個別 box instance
2. 依 `priority` 分組：urgent → normal → lifo
3. 組內依 `max(L,W,H) × volume` 由大到小排序（FFD）

**Main loop**（每個 container）：
```
EP = [{x:0, y:0, z:0}]                  // 初始極點
placed = []
for each box in sortedBoxes:
    for each orientation in validOrientations(box):
        for each ep in EP (sorted by z, y, x ASC):
            if canPlace(ep, orientation, placed, container):
                place(box at ep, orientation)
                EP = updateExtremePoints(EP, box, ep)
                break
        if placed: break
    if not placed: skip → 開新 container
```

**`canPlace` 檢查項目**：
1. **邊界**：`ep + dims ≤ container.internal`
2. **碰撞**：與 `placed[]` 任何 box 之 AABB 不相交
3. **支撐**：`z=0` 或 `supportArea/baseArea ≥ supportRatioMin`
4. **頂壓**：對所有下方支撐者，加上自身重量後 ≤ 其 `maxLoadOnTopKg`
5. **層數**：自頂向下計算，總層數 ≤ `maxStackLayers`
6. **重量**：container 已用重量 + 自身 ≤ `payloadKg`
7. **方向**：`thisSideUp` 限制 pitch/roll = 0

### 8.2 Extreme Point 更新規則

放置一個 box 在 (x, y, z) 大小 (L, W, H) 後，新增極點：
- `(x+L, y, z)` — 沿 X 推進
- `(x, y+W, z)` — 沿 Y 推進
- `(x, y, z+H)` — 沿 Z 推進（堆疊）
- 同時移除被覆蓋的舊 EP

### 8.3 多貨櫃展開

當所有 EP 嘗試後仍無法放入當前 container，觸發新 container：
- 預設使用相同 type
- 進階：嘗試其他可用 container type（最佳尺寸選擇）

### 8.4 Self-test（5 案例）

| # | 名稱 | 驗證項目 |
|---|---|---|
| T1 | 單一 SKU 整齊裝載 | 基準利用率 |
| T2 | 多 SKU 混裝 | 碰撞偵測正確性 |
| T3 | 重量限制觸發換櫃 | payload 約束 |
| T4 | 易碎品不可堆疊 | maxStackLayers=1 |
| T5 | 多貨櫃自動展開 | multi-bin |

執行方式：`node tests/packer.test.js`，全 PASS 才允許 commit。

---

## 9. UI/UX 規格

### 9.1 版面（≥ 860px 寬）

```
┌─────────────────────────────────────────────────────────┐
│  Top Bar: [裝載] [清除] [匯入] [匯出]   已裝載: 0/0  88%  │
├──────────────────┬──────────────────────────────────────┤
│ Sidebar 350px    │                                      │
│                  │                                      │
│ ▸ 貨櫃選擇       │         3D Canvas                   │
│   [Ocean ▾]      │         (Three.js)                  │
│   [40HQ   ▾]     │                                      │
│                  │      [滑鼠拖曳旋轉]                 │
│ ▸ 新增貨物       │      [滾輪縮放]                     │
│   名稱 [____]    │                                      │
│   尺寸 [_×_×_]  │                                      │
│   重量 [____]    │                                      │
│   數量 [____]    │                                      │
│   顏色 [■]       │                                      │
│   ...更多選項... │                                      │
│   [+ 加入]       │                                      │
│                  │                                      │
│ ▸ 已定義列表     │                                      │
│   ▪ 貨物A 50箱   │                                      │
│   ▪ 貨物B 30箱   │                                      │
│                  │                                      │
│ ▸ 顯示選項       │                                      │
│   透明度 [====]  │                                      │
│   ☑ 顯示標籤     │                                      │
│                  │                                      │
└──────────────────┴──────────────────────────────────────┘
```

### 9.2 小螢幕（< 860px）
- Sidebar 在上、Canvas 在下
- Top Bar 改為下拉選單

### 9.3 互動規格

| 事件 | 行為 |
|---|---|
| Sidebar 表單變更 | 即時驗證（紅框＋tooltip） |
| 點 [+ 加入] | 加入列表，表單清空為下一筆 |
| 點 [裝載] | 執行 packer，顯示載入動畫 |
| 點 3D box | 浮動 panel 顯示明細（座標、來源 SKU） |
| 滑鼠左鍵拖曳 | 旋轉視角 |
| 滑鼠右鍵拖曳 | 平移視角 |
| 滾輪 | 縮放 |
| 透明度 slider | 即時改變 box 透明度 |
| ☑ 顯示標籤 | toggle 文字 sprite |

### 9.4 統計面板

```
已裝載：248 / 250 箱  (99.2%)
體積利用率：78.5%
重量利用率：65.2%
所需貨櫃：1× 40HQ
未裝載：2 箱（貨物B）— 原因：超出體積
```

---

## 10. 資料持久化與匯入/匯出

### 10.1 localStorage

**Key**：`clp:current`
**Value**：`LoadingPlan` JSON 字串
**觸發**：每次新增/移除貨物、執行裝載後自動存檔
**容量**：< 5MB（瀏覽器限制）

### 10.2 JSON 匯入/匯出

**匯出檔名**：`loading-plan-{timestamp}.json`
**Schema**：完整 `LoadingPlan` 物件（見 6.4）

**匯入流程**：
1. 點 [匯入] → 檔案選擇對話框
2. 解析 JSON，驗證 schema version
3. 取代當前 plan（先警告：「將覆蓋目前資料」）
4. 重新渲染

### 10.3 報表匯出（v1.2）

**TXT 格式**（向下相容舊版）：
```
CONTAINER LOADING PLAN
==========================
Generated: 2026-04-27 17:03:03
Total Containers: 1
Total Items: 243
=== Container 1 (40HQ) ===
1. 貨物A
   Position: X=60cm, Y=40cm, Z=13cm
   Dimensions: 120×25×80cm
   Weight: 10kg
...
```

**CSV 格式**：欄位 `seq, name, container, x, y, z, L, W, H, weight, orientation`

---

## 11. 開發路線圖

### Phase 1: MVP（v1.0）— 核心架構
- [ ] M1-1: 拆分模組（containers/packer/scene/ui/app）
- [ ] M1-2: 實作 extreme-point packer + 5 selftest
- [ ] M1-3: 約束 — 重量（1.2）+ 堆疊層數（3.1）+ support ratio（3.3）
- [ ] M1-4: 多貨櫃自動展開
- [ ] M1-5: localStorage + JSON 匯入/匯出
- [ ] M1-6: README + 部署到 GitHub Pages

### Phase 2: 旋轉與標示（v1.1）
- [ ] M2-1: 旋轉軸向控制 yaw/pitch/roll（2.1）
- [ ] M2-2: This-Side-Up 旗標（2.2）
- [ ] M2-3: 3D 文字標籤（5.2）
- [ ] M2-4: 透明度調節（5.3）
- [ ] M2-5: 頂壓重量檢查（3.2）

### Phase 3: 進階規則（v1.2）
- [ ] M3-1: 棧板化（4.1）
- [ ] M3-2: 填充規則 columnFill / mixed（4.2）
- [ ] M3-3: 裝載優先權 LIFO / urgent（1.4）
- [ ] M3-4: 旋轉步長自訂（2.3）
- [ ] M3-5: 相同貨物聚集（3.4）

### Phase 4: 報表與整合（v2.0）
- [x] M4-1: TXT/CSV/PDF 匯出（PDF 走 `window.print()` 路徑，避免 CJK 字型內嵌問題）
- [x] M4-2: 重心計算（`src/analytics.js`，3D 場景中以橘色球體 + 落地線標示）
- [x] M4-3: 軸載重均衡（truck only；前/後軸槓桿規則 + 失衡警示）
- [x] M4-4: i18n（中/英；`src/i18n.js`，topbar 「Language」按鈕切換）

### Phase 5: 商務級功能（v3.0）
- [x] M5-1: 貨物編輯／複製／顯示隱藏（列表列操作按鈕）
- [x] M5-2: 自訂貨櫃（localStorage 持久化；JSON 匯出含自訂貨櫃）
- [x] M5-3: 自動選櫃 `packAuto`（評比準則：未裝載數 → 櫃數 → 平均體積利用率）
- [x] M5-4: 裝載順序 `loadSeq`（櫃內由內而外、由下而上）+ 3D 步驟播放器
- [x] M5-5: CSV 貨物清單匯入 + 範本下載
- [x] M5-6: 未裝載原因（oversize / overweight / nospace）
- [x] M5-7: 同 SKU 空間聚集（FR 3.4；EP 依距同類箱距離優先排序）
- [x] M5-8: 左右橫向平衡檢查（COG 對寬度中線偏移 > 8% 警示）
- [x] M5-9: 3D 截圖 PNG 匯出；PDF 報告內嵌 3D 快照 + 貨物彙總表
- [x] M5-10: 計畫名稱、常用尺寸 preset（EUR/US 棧板、紙箱、油桶）
- [x] M5-11: Three.js vendor 化（`vendor/`，OrbitControls patch 直接引用），完全離線可用（NFR-4）

### Phase 6: QA 循環（v3.1）
- [x] M6-1: 安全/正確性修補（0 值欄位、color 消毒、JSON 驗證；QA_LOG Iteration 1）
- [x] M6-2: UX 一致性 — 貨物變更自動 re-pack（Iteration 2）
- [x] M6-3: `packAuto` 剪枝 2.2×、公英制單位 cm/kg ↔ in/lb（Iteration 3）
- [x] M6-4: 棧板化 FR-4.1 完整實作 + 明細就地刷新（Iteration 4）

### Future（無排程）
- 危險品分隔規則（IMO/IMDG）
- 後端 API + 多人協作
- AI 建議（基於歷史資料）

---

## 12. 驗收測試

### 12.1 演算法測試（packer.test.js）

每個 PR 必須通過所有 5 個 selftest（見 8.4），CI 自動執行。

### 12.2 瀏覽器煙霧測試（手動）

| # | 步驟 | 預期結果 |
|---|---|---|
| S1 | 開啟 index.html | 載入 < 2 秒，顯示空 40HQ 貨櫃 |
| S2 | 載入 demo「243 箱混裝」 | 演算 < 3 秒，3D 顯示無重疊 |
| S3 | 拖曳旋轉視角 | 流暢 ≥ 30 FPS |
| S4 | 點任一 box | 浮動 panel 顯示明細 |
| S5 | 切換透明度 100% → 30% | 即時生效 |
| S6 | 匯出 JSON → 重整頁面 → 匯入 | 還原一致 |
| S7 | 切換貨櫃為 20GP | 自動重新演算，顯示新結果 |
| S8 | 加入「不可堆疊」貨物 | 該類僅出現於底層 |

### 12.3 跨瀏覽器測試
最少需在 Chrome、Safari、Edge 最新版各通過一次 S1-S8。

---

## 附錄 A：術語表

| 術語 | 解釋 |
|---|---|
| AABB | Axis-Aligned Bounding Box，軸對齊邊界框 |
| EP | Extreme Point，極點（候選擺放位置） |
| FFD | First-Fit-Decreasing，由大至小依序填入 |
| HQ | High Cube，高櫃（貨櫃內高 > 標準櫃） |
| LIFO | Last-In-First-Out，後進先出 |
| SKU | Stock Keeping Unit，貨品編號 |
| Yaw/Pitch/Roll | 偏航／俯仰／翻滾，三軸旋轉 |

## 附錄 B：參考資料

- ISO 668:2020 — 貨櫃尺寸標準
- Crainic, T.G. et al. (2008) — Extreme Point-Based Heuristics for Three-Dimensional Bin Packing
- Three.js Documentation — https://threejs.org/docs/
