# 堆疊演算法評估報告(Algorithm Review)

> 評估日期:2026-07-02
> 範圍:`src/packer.js`(Extreme-Point + First-Fit-Decreasing)、`src/analytics.js`、`src/scene.js` 座標映射、`tests/packer.test.js`
> 目的:檢驗「每個貨物功能是否正確反映在 3D 模擬」以及「堆疊演算法是否符合實際裝櫃邏輯」。
> 本報告僅記錄發現與建議,**不包含程式碼修改**。

---

## 1. 總結

| 面向 | 結論 |
|---|---|
| 貨物功能 → 演算法 → 3D 的資料流 | ✅ 絕大多數屬性完整貫通(見 §2) |
| 幾何正確性(不重疊、不出界、不懸空、旋轉) | ✅ 驗證正確(見 §4) |
| 座標映射(packer ↔ Three.js) | ✅ 全程一致,無軸向錯位(見 §5) |
| 承重限制(maxLoadOnTopKg) | ⚠️ **只驗直接支撐層,支撐鏈下層可能超載(Bug 2)** |
| 多櫃迴圈 | ⚠️ **無進度保護,可能產生大量空櫃(Bug 1)** |
| 效能 | ⚠️ 最壞 ~O(n³),數百箱內流暢,1000 箱屬邊緣(見 §6) |
| SDD 規格覆蓋 | ⚠️ 三項規格已定義但未實作(見 §3) |
| 測試覆蓋 | ⚠️ 承重、支撐率、旋轉尺寸等關鍵約束無測試(見 §7) |

---

## 2. 貨物功能貫通性檢驗(輸入 → 演算法 → 放置結果 → 3D 渲染)

逐一追蹤每個 UI 欄位的資料流(`ui.js` 表單/CSV → `packer.js:24-42` → placement → `scene.js:332-397`):

| 屬性 | 演算法有執行? | 3D 有反映? | 備註 |
|---|---|---|---|
| 長/寬/高(cm) | ✅ 邊界、碰撞、旋轉 | ✅ BoxGeometry 尺寸 | |
| 重量(kg) | ✅ payload 閘門、承重、COG | ✅ 點選詳情顯示 | |
| 數量 | ✅ 展開為個別箱(`packer.js:22-23`) | ✅ | |
| 顏色 | —(僅顯示用) | ✅ 材質色 + 明度自動反差文字 | |
| 旋轉 yaw/pitch/roll | ✅ `getValidOrientations`(`packer.js:230-261`) | ✅ 依 orientation 後的 L/W/H 畫箱 | 尺寸交換六種組合皆正確 |
| 此面朝上(thisSideUp) | ✅ 封鎖 pitch/roll | ✅ 箱面 ↑ 圖示 | |
| 最大堆疊層數 | ✅ 遞迴 `computeLayer`(`packer.js:312-313`) | ✅(不可疊時 ⊘ 圖示) | |
| 頂部最大承重 | ⚠️ **部分執行**(Bug 2) | ✅ 詳情面板顯示 | |
| 支撐面積比 | ✅ `packer.js:283-300` | ✅(反映於放置位置) | |
| 同 SKU 集中 | ✅ EP 距離重排(`packer.js:167-186`) | ✅ | |
| 優先度 normal/urgent/lifo | ✅ 排序(`packer.js:46-50`) | ✅ 清單徽章 | lifo 僅為排序偏置,非真門邏輯(§3) |
| 顯示/隱藏(眼睛) | —(純視覺) | ✅ | 設計如此,合理 |

**結論:除承重鏈(Bug 2)外,所有貨物功能都正確地在 3D 模擬中被執行。**

---

## 3. 與實際裝櫃邏輯的差異(SDD 已定義、程式未實作)

1. **`rotationStep`(SDD.md §FR 貨物欄位,90/45/15°)** — packer 只做 90° 換邊(`packer.js:230-261`),無任意角度。對紙箱/棧板場景 90° 即符合實務,建議從 SDD 移除或標註 future。
2. **棧板整體單位 `isPallet` / `palletItems[]`(SDD.md FR-4)** — 完全無程式碼。實務上棧板貨常以「棧板為單位」裝櫃,目前只能把棧板當一般箱輸入(可行的 workaround)。
3. **櫃門尺寸 `doorWidth`/`doorHeight` 與真 LIFO 門邏輯(SDD.md Container 欄位)** — `containers.js` 無門尺寸;`priority:'lifo'` 只是「最後排序 → 通常落在靠門端」的鬆散近似,演算法不保證後卸貨物不被擋住。與實際裝櫃「先進後出、卸貨順序」的營運需求有落差,是最值得補強的一項。

---

## 4. 正確性檢驗結果

### 4.1 已確認的 Bug

**Bug 1 — 剩餘貨物全數無法放置時,產生大量空櫃**(`packer.js:62-73`)

多櫃 while 迴圈沒有「本輪放置數為零就停止」的保護:

```
while (remaining.length > 0 && containerCount < opts.maxContainers) {
  const result = packOneContainer(remaining, containerSpec, containerCount);
  containers.push({ ... });          // ← 即使 result.placements 為空也照樣開新櫃
  remaining = result.unplaced;
}
```

若剩餘的箱皆為 oversize/overweight,每輪放置 0 箱但仍開新櫃,直到 `maxContainers`(預設 20)。後果:
- 統計顯示「需要 20 個貨櫃」,3D 畫出 20 個空櫃框;
- `packAuto` 的「櫃數最少」評分被扭曲,可能選錯櫃型。

測試 T10(`tests/packer.test.js:256-277`)餵的全是無法放置的貨,實際產生 20 個近空櫃,但因未斷言 `containers.length` 而通過。

**建議修法(未實作):** 迴圈內若 `result.placements.length === 0` 則丟棄該空櫃並 break。

**Bug 2 — `maxLoadOnTopKg` 未沿支撐鏈往下重驗**(`packer.js:303-309`)

```
for (const s of supporters) {
  const topLoad = computeTopLoad(s, placed) + box.weightKg;
  const limit = s.maxLoadOnTopKg ?? Infinity;
  if (topLoad > limit + EPSILON) return false;   // ← 只檢查「直接支撐者」s
}
```

`computeTopLoad`(`packer.js:339-350`)是遞迴累計上方全部重量——這部分正確;但**限制比較只針對直接支撐層**。新增一箱時,其重量同時壓在支撐者「以下的每一層」,那些更下層箱子的 `maxLoadOnTopKg` 沒有被重新驗證。

實例:A(限重 50kg)→ 上面放 B 40kg(B 限重 100kg)→ 再往 B 上放 C 30kg。檢查 C 時只驗 B:40+30=70 ≤ 100 通過;但 A 實際承受 B+C=70kg > 50kg,**超載卻放行**。這與實際裝櫃的紙箱抗壓邏輯不符,是兩個 bug 中對實務影響較大的一個。

**建議修法(未實作):** 對每個直接支撐者沿支撐鏈遞迴向下,逐層驗證「該層上方累計重量 ≤ 該層 maxLoadOnTopKg」。

**Bug 3 — 死碼**(`packer.js:305`):`supporterCargo` 計算後未使用,可刪除。

### 4.2 驗證為正確(無問題)

- **不懸空**:z > 0 的放置一律要求支撐者存在且支撐面積比 ≥ `supportRatioMin`(`packer.js:283-300`),EP 的側向點也適用,不可能產生浮空箱(除非使用者自行把支撐率設 0)。
- **不重疊/不出界**:AABB 碰撞(`packer.js:276-280`)與邊界檢查(`packer.js:269-273`)含 EPSILON 容差,T1/T2/T12 覆蓋。
- **旋轉尺寸**:yaw(L↔W)、pitch(W↔H)、roll(L↔H)及組合的尺寸交換全部正確(`packer.js:230-261`)。
- **重量閘門**:櫃 payload 於放置前檢查(`packer.js:135-139`)。
- **單位系統**:全程單一 cm/kg,無任何單位轉換,不存在轉換錯誤。
- **裝載順序**:`loadSeq` 以「櫃內深處優先、由下而上」排序(`packer.js:77-83`),與門在 +X 端的實際裝櫃順序一致。

---

## 5. 座標映射(packer ↔ Three.js)

packer 座標:x=長(門在 +x)、y=寬、z=高;Three.js 為 Y-up。映射 **sceneX=packX、sceneY=packZ、sceneZ=packY** 在箱體(`scene.js:376`)、櫃框(`scene.js:277-280`)、門面(+X,`scene.js:284-294`)、COG(`scene.js:174`)、軸重指示全部一致,**無軸向錯位**。僅 `drawBox` 材質順序註解用了映射前的軸名,易誤導維護者(視覺正確)。

---

## 6. 效能

- 單箱放置 = 迭代排序後的 EP(數量 ~O(n))× ≤6 個方向 × `canPlace`;`canPlace` 含 O(n) 碰撞掃描,且熱迴圈內呼叫**遞迴** `computeTopLoad` / `computeLayer`(各最壞 O(n),深堆疊時重複走訪)。
- 總體最壞 **~O(n³)**;另每箱做一次 EP 排序(`packer.js:161-163`)+ `groupSameSku` 的每-EP 距離掃描,各貢獻 O(n² log n) / O(n²)。
- 實測體感:數百箱順暢;SDD NFR-1「1000 箱 < 3 秒」在深堆疊情境屬邊緣。
- **優化建議(未實作):** (1) 對 `computeTopLoad`/`computeLayer` 建支撐圖快取,放置後增量更新;(2) EP 以有序結構維護,免每箱全排序;(3) 碰撞用網格分桶(spatial hashing)取代全掃描。三者可將實務複雜度壓至 ~O(n²) 以下。

---

## 7. 測試缺口

現有 14 組測試(67 斷言)涵蓋不重疊/出界、payload 分櫃、層數 1/99、多櫃數量守恆、COG/軸重、loadSeq、unplaced 原因、packAuto、SKU 集中、側向平衡、i18n 鍵對等。缺:

1. **`maxLoadOnTopKg` 零覆蓋** —— 正是 Bug 2 未被抓到的原因;應加「三層堆疊、下層限重被中層+上層合計超過」的案例。
2. **`supportRatioMin` 無測試** —— 無任何案例驗證支撐率門檻拒絕懸挑放置。
3. **`maxStackLayers` 只測 1 與 99** —— 中間值(2、3)與遞迴 `computeLayer` 的階梯堆疊情境未測。
4. **旋轉尺寸未斷言** —— pitch/roll(thisSideUp=false)路徑完全沒被執行過。
5. **全數無法放置時的櫃數** —— T10 應加 `containers.length === 1`(或 0)斷言,即可鎖住 Bug 1。

---

## 8. 建議處理順序(供後續迭代參考)

1. Bug 1(修法小、影響統計與 packAuto 正確性)+ T10 補斷言
2. Bug 2(承重鏈遞迴驗證)+ 新增承重測試
3. LIFO 門邏輯(與實際卸貨順序對齊,實務價值最高的功能補強)
4. 效能快取(支撐圖 memoization)
5. SDD 清理(rotationStep / pallet 標註 future 或移除)
