// Packer self-tests per SDD §8.4
// Run: node tests/packer.test.js

import { pack, packAuto } from '../src/packer.js';
import { getContainer, getAllContainers } from '../src/containers.js';
import { computeCOG, computeAxleLoads, computeLateralBalance, enrichResult } from '../src/analytics.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; failures.push(msg); }
}

function checkNoOverlap(placements) {
  const eps = 0.001;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i], b = placements[j];
      const overlap = a.x + a.L > b.x + eps && b.x + b.L > a.x + eps &&
                      a.y + a.W > b.y + eps && b.y + b.W > a.y + eps &&
                      a.z + a.H > b.z + eps && b.z + b.H > a.z + eps;
      if (overlap) return { i, j, a, b };
    }
  }
  return null;
}

function checkInBounds(placements, container) {
  const eps = 0.001;
  for (const p of placements) {
    if (p.x < -eps || p.y < -eps || p.z < -eps) return p;
    if (p.x + p.L > container.internal.length + eps) return p;
    if (p.y + p.W > container.internal.width + eps) return p;
    if (p.z + p.H > container.internal.height + eps) return p;
  }
  return null;
}

// ===== T1: Single SKU baseline =====
console.log('T1: 單一 SKU 整齊裝載');
{
  const cargo = [{
    id: 'A', name: 'Box A', length: 100, width: 100, height: 100,
    weightKg: 10, quantity: 50, color: '#f00',
    rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
    maxStackLayers: 99, maxLoadOnTopKg: 1000, supportRatioMin: 0.8,
  }];
  const c = getContainer('OCEAN_40HQ');
  const result = pack(cargo, c);
  const total = result.containers.reduce((s, ct) => s + ct.placements.length, 0);
  assert(total > 0, 'T1: no boxes placed');
  assert(checkNoOverlap(result.containers[0].placements) === null, 'T1: overlap detected');
  assert(checkInBounds(result.containers[0].placements, c) === null, 'T1: out of bounds');
  console.log(`  → 裝載 ${total}/50 箱, 利用率 ${(result.containers[0].stats.volumeUtilization*100).toFixed(1)}%`);
}

// ===== T2: Multi-SKU mixed loading =====
console.log('T2: 多 SKU 混裝');
{
  const cargo = [
    { id: 'A', name: 'Big', length: 120, width: 80, height: 80, weightKg: 20, quantity: 10, color: '#f00',
      rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
      maxStackLayers: 99, maxLoadOnTopKg: 500, supportRatioMin: 0.8 },
    { id: 'B', name: 'Small', length: 50, width: 50, height: 50, weightKg: 5, quantity: 30, color: '#0f0',
      rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
      maxStackLayers: 99, maxLoadOnTopKg: 200, supportRatioMin: 0.8 },
  ];
  const c = getContainer('OCEAN_20GP');
  const result = pack(cargo, c);
  const placements = result.containers.flatMap(ct => ct.placements);
  assert(placements.length > 0, 'T2: no boxes placed');
  const overlap = checkNoOverlap(placements);
  assert(overlap === null, `T2: overlap between ${overlap?.a.name} and ${overlap?.b.name}`);
  assert(checkInBounds(placements, c) === null, 'T2: out of bounds');
  console.log(`  → 裝載 ${placements.length}/40 箱`);
}

// ===== T3: Weight limit triggers new container =====
console.log('T3: 重量限制觸發換櫃');
{
  // 100 boxes × 500kg = 50000kg, but 40HQ payload = 26500kg → must use 2 containers
  const cargo = [{
    id: 'HEAVY', name: 'Heavy', length: 100, width: 100, height: 100,
    weightKg: 500, quantity: 100, color: '#00f',
    rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
    maxStackLayers: 99, maxLoadOnTopKg: 5000, supportRatioMin: 0.8,
  }];
  const c = getContainer('OCEAN_40HQ');
  const result = pack(cargo, c);
  assert(result.containers.length >= 2, `T3: expected ≥2 containers, got ${result.containers.length}`);
  for (const ct of result.containers) {
    assert(ct.stats.usedWeightKg <= c.payloadKg + 0.01, `T3: container exceeds payload (${ct.stats.usedWeightKg} > ${c.payloadKg})`);
  }
  console.log(`  → 使用 ${result.containers.length} 個貨櫃，每櫃重量 ${result.containers.map(ct=>ct.stats.usedWeightKg.toFixed(0)+'kg').join(', ')}`);
}

// ===== T4: Fragile boxes — non-stackable =====
console.log('T4: 易碎品不可堆疊 (maxStackLayers=1)');
{
  const cargo = [{
    id: 'FRAGILE', name: 'Fragile', length: 80, width: 60, height: 50,
    weightKg: 5, quantity: 100, color: '#ff0',
    rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
    maxStackLayers: 1, maxLoadOnTopKg: 0, supportRatioMin: 0.8,
  }];
  const c = getContainer('OCEAN_40HQ');
  const result = pack(cargo, c);
  const placements = result.containers.flatMap(ct => ct.placements);
  // All boxes must be on floor (z = 0)
  const stacked = placements.filter(p => p.z > 0.01);
  assert(stacked.length === 0, `T4: ${stacked.length} boxes were stacked despite maxStackLayers=1`);
  console.log(`  → 裝載 ${placements.length} 箱，全部於底層 (z=0)`);
}

// ===== T5: Multi-container auto-expansion =====
console.log('T5: 多貨櫃自動展開');
{
  // 200 boxes that obviously won't fit in one 20GP
  const cargo = [{
    id: 'BULK', name: 'Bulk', length: 100, width: 100, height: 100,
    weightKg: 10, quantity: 200, color: '#f0f',
    rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
    maxStackLayers: 99, maxLoadOnTopKg: 1000, supportRatioMin: 0.8,
  }];
  const c = getContainer('OCEAN_20GP');
  const result = pack(cargo, c);
  assert(result.containers.length >= 2, `T5: expected ≥2 containers, got ${result.containers.length}`);
  const totalPlaced = result.containers.reduce((s, ct) => s + ct.placements.length, 0);
  const totalUnplaced = result.unplaced.reduce((s, u) => s + u.count, 0);
  assert(totalPlaced + totalUnplaced === 200, `T5: total mismatch ${totalPlaced}+${totalUnplaced} ≠ 200`);
  console.log(`  → ${result.containers.length} 個貨櫃，已裝 ${totalPlaced}，未裝 ${totalUnplaced}`);
}

// ===== T6: COG calculation =====
console.log('T6: 重心計算 (COG)');
{
  // Two equal-weight cubes at known positions → COG should be midway
  const placements = [
    { x: 0, y: 0, z: 0, L: 100, W: 100, H: 100, weightKg: 10 },
    { x: 200, y: 0, z: 0, L: 100, W: 100, H: 100, weightKg: 10 },
  ];
  const cog = computeCOG(placements);
  // Centers are at (50,50,50) and (250,50,50) → COG at (150,50,50)
  assert(Math.abs(cog.x - 150) < 0.01, `T6: COG.x expected 150, got ${cog.x}`);
  assert(Math.abs(cog.y - 50) < 0.01, `T6: COG.y expected 50, got ${cog.y}`);
  assert(Math.abs(cog.z - 50) < 0.01, `T6: COG.z expected 50, got ${cog.z}`);
  assert(cog.totalWeightKg === 20, `T6: totalWeight expected 20, got ${cog.totalWeightKg}`);
  assert(cog.hasWeight === true, 'T6: hasWeight expected true');

  // Weighted: heavy box at x=0 dominates
  const heavyLight = [
    { x: 0, y: 0, z: 0, L: 100, W: 100, H: 100, weightKg: 90 },
    { x: 200, y: 0, z: 0, L: 100, W: 100, H: 100, weightKg: 10 },
  ];
  const cog2 = computeCOG(heavyLight);
  // (50*90 + 250*10) / 100 = (4500 + 2500) / 100 = 70
  assert(Math.abs(cog2.x - 70) < 0.01, `T6w: weighted COG.x expected 70, got ${cog2.x}`);

  // Zero-weight fallback to volume centroid
  const vol = [
    { x: 0, y: 0, z: 0, L: 100, W: 100, H: 100, weightKg: 0 },
    { x: 200, y: 0, z: 0, L: 100, W: 100, H: 100, weightKg: 0 },
  ];
  const cog3 = computeCOG(vol);
  assert(cog3.hasWeight === false, 'T6: zero-weight should set hasWeight=false');
  assert(Math.abs(cog3.x - 150) < 0.01, `T6: vol-centroid COG.x expected 150, got ${cog3.x}`);
  console.log('  → COG 測試通過 (等重、加權、零重量退回體積中心)');
}

// ===== T7: Axle load balancing =====
console.log('T7: 軸載計算 (truck only)');
{
  const truck = getContainer('TRUCK_40FT_BOX');
  const ocean = getContainer('OCEAN_40HQ');
  const L = truck.internal.length; // 1200

  // COG at exact center → front == rear
  const center = { x: L / 2, y: 100, z: 100, totalWeightKg: 1000, hasWeight: true };
  const ax1 = computeAxleLoads(center, truck);
  assert(ax1 !== null, 'T7: truck axle should compute');
  assert(Math.abs(ax1.frontKg - ax1.rearKg) < 0.01, `T7: balanced front=rear, got ${ax1.frontKg} vs ${ax1.rearKg}`);
  assert(ax1.balanced === true, 'T7: center COG should be balanced');

  // COG biased toward door (large x) → rear axle dominates
  const biasedRear = { x: L * 0.8, y: 100, z: 100, totalWeightKg: 1000, hasWeight: true };
  const ax2 = computeAxleLoads(biasedRear, truck);
  assert(ax2.rearKg > ax2.frontKg, `T7: biased COG.x=0.8L should load rear more, got front=${ax2.frontKg} rear=${ax2.rearKg}`);

  // Front + rear must equal total weight (when COG is between axles)
  assert(Math.abs(ax1.frontKg + ax1.rearKg - 1000) < 0.01, `T7: sum should equal total, got ${ax1.frontKg + ax1.rearKg}`);

  // Non-truck modes return null
  const axOcean = computeAxleLoads(center, ocean);
  assert(axOcean === null, 'T7: ocean container should return null axle loads');

  // Zero weight returns null
  const axZero = computeAxleLoads({ x: 0, y: 0, z: 0, totalWeightKg: 0, hasWeight: false }, truck);
  assert(axZero === null, 'T7: zero-weight COG should return null axle loads');

  console.log(`  → 中心 COG: 前${ax1.frontKg.toFixed(0)}kg 後${ax1.rearKg.toFixed(0)}kg；偏後 COG: 前${ax2.frontKg.toFixed(0)}kg 後${ax2.rearKg.toFixed(0)}kg`);
}

// ===== T8: enrichResult integration =====
console.log('T8: enrichResult 整合');
{
  const cargo = [{
    id: 'X', name: 'X', length: 100, width: 100, height: 100,
    weightKg: 100, quantity: 30, color: '#abc',
    rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
    maxStackLayers: 99, maxLoadOnTopKg: 1000, supportRatioMin: 0.8,
  }];
  const truck = getContainer('TRUCK_40FT_BOX');
  const result = pack(cargo, truck);
  enrichResult(result, truck);
  for (const ct of result.containers) {
    assert(ct.cog && typeof ct.cog.x === 'number', 'T8: each container should have COG');
    assert(ct.axleLoads && typeof ct.axleLoads.frontKg === 'number', 'T8: truck container should have axleLoads');
  }
  console.log(`  → ${result.containers.length} 個貨櫃皆已附加 COG 與軸載`);
}

// ===== T9: Loading sequence (loadSeq) =====
console.log('T9: 裝載順序 loadSeq');
{
  const cargo = [{
    id: 'S', name: 'Seq', length: 100, width: 100, height: 100,
    weightKg: 10, quantity: 150, color: '#0ff',
    rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
    maxStackLayers: 99, maxLoadOnTopKg: 1000, supportRatioMin: 0.8,
  }];
  const c = getContainer('OCEAN_20GP');
  const result = pack(cargo, c);
  const all = result.containers.flatMap(ct => ct.placements);
  const seqs = all.map(p => p.loadSeq).sort((a, b) => a - b);
  assert(seqs.length > 0 && seqs[0] === 1 && seqs[seqs.length - 1] === all.length,
    `T9: loadSeq should be 1..${all.length}, got ${seqs[0]}..${seqs[seqs.length - 1]}`);
  assert(new Set(seqs).size === all.length, 'T9: loadSeq must be unique');
  // Within each container, physical load order goes back (low x) to door (high x)
  for (const ct of result.containers) {
    const ordered = [...ct.placements].sort((a, b) => a.loadSeq - b.loadSeq);
    let prevX = -1;
    let monotonic = true;
    for (const p of ordered) {
      if (p.x < prevX - 0.001) { monotonic = false; break; }
      prevX = p.x;
    }
    assert(monotonic, 'T9: load order must be non-decreasing in x (back → door)');
  }
  console.log(`  → ${all.length} 箱已編裝載序 1..${all.length}`);
}

// ===== T10: Unplaced reasons =====
console.log('T10: 未裝載原因');
{
  const cargo = [
    { id: 'TOOBIG', name: 'TooBig', length: 700, width: 300, height: 300,
      weightKg: 10, quantity: 2, color: '#f00',
      rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
      maxStackLayers: 99, maxLoadOnTopKg: 1000, supportRatioMin: 0.8 },
    { id: 'TOOHEAVY', name: 'TooHeavy', length: 100, width: 100, height: 100,
      weightKg: 99999, quantity: 1, color: '#00f',
      rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
      maxStackLayers: 99, maxLoadOnTopKg: 1000, supportRatioMin: 0.8 },
  ];
  const c = getContainer('OCEAN_20GP');
  const result = pack(cargo, c);
  const big = result.unplaced.find(u => u.cargoId === 'TOOBIG');
  const heavy = result.unplaced.find(u => u.cargoId === 'TOOHEAVY');
  assert(big && big.count === 2, 'T10: oversize cargo should be unplaced');
  assert(big && big.reasons.oversize === 2, `T10: reason should be oversize, got ${JSON.stringify(big?.reasons)}`);
  assert(heavy && heavy.reasons.overweight === 1, `T10: reason should be overweight, got ${JSON.stringify(heavy?.reasons)}`);
  assert(big.name === 'TooBig', 'T10: unplaced entry should carry cargo name');
  console.log(`  → oversize×${big.reasons.oversize}, overweight×${heavy.reasons.overweight}`);
}

// ===== T11: Auto container selection =====
console.log('T11: 自動選櫃 packAuto');
{
  const cargo = [{
    id: 'A', name: 'Auto', length: 100, width: 100, height: 100,
    weightKg: 10, quantity: 10, color: '#0f0',
    rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
    maxStackLayers: 99, maxLoadOnTopKg: 1000, supportRatioMin: 0.8,
  }];
  const best = packAuto(cargo, getAllContainers());
  assert(best !== null, 'T11: packAuto should return a result');
  const unplaced = best.result.unplaced.reduce((s, u) => s + u.count, 0);
  assert(unplaced === 0, `T11: small load should fully fit, ${unplaced} unplaced`);
  assert(best.result.containers.length === 1, `T11: should need 1 container, got ${best.result.containers.length}`);
  // Best = highest utilization among 1-container solutions = smallest viable container
  const chosenVol = best.containerSpec.internal.length * best.containerSpec.internal.width * best.containerSpec.internal.height;
  for (const spec of getAllContainers()) {
    const r = pack(cargo, spec);
    const u = r.unplaced.reduce((s, x) => s + x.count, 0);
    if (u === 0 && r.containers.length === 1) {
      const v = spec.internal.length * spec.internal.width * spec.internal.height;
      assert(chosenVol <= v + 0.001, `T11: chose ${best.containerSpec.id} (vol ${chosenVol}) but ${spec.id} (vol ${v}) is smaller`);
    }
  }
  console.log(`  → 自動選擇 ${best.containerSpec.id}`);
}

// ===== T12: groupSameSku spatial clustering =====
console.log('T12: 同 SKU 聚集 groupSameSku');
{
  const mk = (group) => ([
    { id: 'A', name: 'GroupA', length: 100, width: 100, height: 100,
      weightKg: 10, quantity: 8, color: '#f00', groupSameSku: group,
      rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
      maxStackLayers: 99, maxLoadOnTopKg: 1000, supportRatioMin: 0.8 },
    { id: 'B', name: 'GroupB', length: 100, width: 100, height: 100,
      weightKg: 10, quantity: 8, color: '#00f', groupSameSku: false,
      rotatable: { yaw: true, pitch: false, roll: false }, thisSideUp: true,
      maxStackLayers: 99, maxLoadOnTopKg: 1000, supportRatioMin: 0.8 },
  ]);
  const c = getContainer('OCEAN_40HQ');
  const spread = (placements, cargoId) => {
    const pts = placements.filter(p => p.cargoId === cargoId)
      .map(p => [p.x + p.L / 2, p.y + p.W / 2, p.z + p.H / 2]);
    let sum = 0, n = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        sum += Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]);
        n++;
      }
    }
    return n ? sum / n : 0;
  };
  const withGroup = pack(mk(true), c).containers[0].placements;
  const withoutGroup = pack(mk(false), c).containers[0].placements;
  assert(checkNoOverlap(withGroup) === null, 'T12: overlap with groupSameSku');
  assert(checkInBounds(withGroup, c) === null, 'T12: out of bounds with groupSameSku');
  const sWith = spread(withGroup, 'A');
  const sWithout = spread(withoutGroup, 'A');
  assert(sWith <= sWithout + 0.001, `T12: grouped spread ${sWith.toFixed(1)} should be ≤ ungrouped ${sWithout.toFixed(1)}`);
  console.log(`  → A 平均距離：聚集 ${sWith.toFixed(0)}cm vs 未聚集 ${sWithout.toFixed(0)}cm`);
}

// ===== T13: Lateral (left/right) balance =====
console.log('T13: 左右橫向平衡');
{
  const c = getContainer('OCEAN_40HQ');
  const W = c.internal.width; // 235
  const centered = computeLateralBalance({ x: 100, y: W / 2, z: 50, totalWeightKg: 1000 }, c);
  assert(centered !== null && centered.ok, 'T13: centered COG should be ok');
  assert(centered.side === 'center', `T13: side should be center, got ${centered?.side}`);
  const offset = computeLateralBalance({ x: 100, y: W * 0.8, z: 50, totalWeightKg: 1000 }, c);
  assert(offset !== null && !offset.ok, 'T13: 30% offset should be flagged');
  assert(offset.side === 'right', `T13: side should be right, got ${offset?.side}`);
  const zero = computeLateralBalance({ x: 0, y: 0, z: 0, totalWeightKg: 0 }, c);
  assert(zero === null, 'T13: zero weight returns null');
  console.log(`  → 中心 ok=${centered.ok}，偏移 ${offset.offsetCm.toFixed(0)}cm → ${offset.side} 警示`);
}

// ===== T14: i18n key parity =====
console.log('T14: i18n 鍵一致性');
{
  const { dictionaries } = await import('../src/i18n.js');
  const zh = Object.keys(dictionaries['zh-Hant']).sort();
  const en = Object.keys(dictionaries['en']).sort();
  const missingInEn = zh.filter(k => !en.includes(k));
  const missingInZh = en.filter(k => !zh.includes(k));
  assert(missingInEn.length === 0, `T14: keys missing in en: ${missingInEn.join(', ')}`);
  assert(missingInZh.length === 0, `T14: keys missing in zh-Hant: ${missingInZh.join(', ')}`);
  console.log(`  → zh-Hant ${zh.length} 鍵 = en ${en.length} 鍵`);
}

// ===== Summary =====
console.log('\n========================');
console.log(`通過: ${passed}, 失敗: ${failed}`);
if (failed > 0) {
  console.log('\n失敗項目:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log('全部通過 ✓');
}
