// Packer self-tests per SDD §8.4
// Run: node tests/packer.test.js

import { pack } from '../src/packer.js';
import { getContainer } from '../src/containers.js';

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
