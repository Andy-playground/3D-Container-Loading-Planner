// 3D Bin Packing — Extreme-Point Heuristic + weight-first FFD (pyramid loading)
// Per SDD §8
//
// Placement strategy (v3.2):
//   1. Boxes are sorted priority → weight (heavy first) → volume, so heavy
//      cargo claims the floor and light cargo naturally ends up on top
//      ("pyramid" loading).
//   2. For each box every feasible (extreme point × orientation) pair is
//      scored and the best one wins (best-fit), instead of taking the first
//      fit. Score prefers: lowest z → not resting on lighter boxes →
//      deepest into the container (low x) → left (low y).
//   3. Top-load limits are verified down the whole support chain. A box's
//      weight is distributed to its supporters proportionally to contact
//      area and propagated transitively, so a limit three layers down can
//      still veto a placement.
//   4. nonStackable cargo (palletized lithium batteries, wheelsets, …) is
//      floor-only and nothing may ever rest on it.

const EPSILON = 0.001;

/**
 * Pack cargo into containers.
 * @param {Array} cargoTypes - Array of CargoItem (per SDD §6.1)
 * @param {Object} containerSpec - Container (per SDD §6.2)
 * @param {Object} options - { allowMultiContainer: boolean, maxContainers: number }
 * @returns {Object} { containers: [{containerId, placements, stats}], unplaced: [...] }
 */
export function pack(cargoTypes, containerSpec, options = {}) {
  const opts = {
    allowMultiContainer: true,
    maxContainers: 20,
    ...options,
  };

  // 1. Expand quantity → individual box instances
  const allBoxes = [];
  for (const c of cargoTypes) {
    for (let i = 0; i < c.quantity; i++) {
      allBoxes.push({
        instanceId: `${c.id}#${i}`,
        cargoId: c.id,
        name: c.name,
        color: c.color,
        L: c.length,
        W: c.width,
        H: c.height,
        weightKg: c.weightKg ?? 0,
        // Constraints
        rotatable: c.rotatable ?? { yaw: true, pitch: false, roll: false },
        thisSideUp: c.thisSideUp ?? true,
        maxStackLayers: c.maxStackLayers ?? 99,
        maxLoadOnTopKg: c.maxLoadOnTopKg ?? Infinity,
        supportRatioMin: c.supportRatioMin ?? 0.8,
        nonStackable: c.nonStackable ?? false,
        priority: c.priority ?? 'normal',
        groupSameSku: c.groupSameSku ?? false,
      });
    }
  }

  // 2. Sort: priority → weight desc (heavy loads first = pyramid) → volume desc (FFD)
  const priorityRank = { urgent: 0, normal: 1, lifo: 2 };
  allBoxes.sort((a, b) => {
    const pa = priorityRank[a.priority] ?? 1;
    const pb = priorityRank[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    if (Math.abs(b.weightKg - a.weightKg) > EPSILON) return b.weightKg - a.weightKg;
    const va = a.L * a.W * a.H;
    const vb = b.L * b.W * b.H;
    return vb - va;
  });


  // 3. Loop containers
  const containers = [];
  let remaining = [...allBoxes];

  while (remaining.length > 0 && containers.length < opts.maxContainers) {
    const result = packOneContainer(remaining, containerSpec, containers.length + 1);
    // No box fit in a fresh empty container → adding more containers can
    // never make progress; stop instead of emitting empty containers.
    if (result.placements.length === 0) break;
    containers.push({
      containerId: `${containerSpec.id}-${containers.length + 1}`,
      containerSpec,
      placements: result.placements,
      stats: computeStats(result.placements, containerSpec),
    });
    remaining = result.unplaced;
    if (!opts.allowMultiContainer) break;
  }

  // 3b. Loading sequence: per container, physical load order is back of the
  // container first (door at +X), bottom before top; global seq spans containers.
  let globalSeq = 0;
  for (const ct of containers) {
    const ordered = [...ct.placements].sort(
      (a, b) => a.x - b.x || a.z - b.z || a.y - b.y
    );
    for (const p of ordered) p.loadSeq = ++globalSeq;
  }

  // 4. Unplaced summary by cargoId (+ failure reason from last attempt)
  const unplacedMap = new Map();
  for (const box of remaining) {
    const key = box.cargoId;
    const entry = unplacedMap.get(key) ?? { cargoId: key, name: box.name, count: 0, reasons: {} };
    entry.count++;
    const r = box.unplacedReason ?? 'nospace';
    entry.reasons[r] = (entry.reasons[r] ?? 0) + 1;
    unplacedMap.set(key, entry);
  }
  const unplaced = Array.from(unplacedMap.values());

  return { containers, unplaced };
}

/**
 * Try every candidate container spec and return the best plan.
 * Score: fewest unplaced boxes → fewest containers → highest avg volume utilization.
 * @returns {Object} { result, containerSpec }
 */
export function packAuto(cargoTypes, containerSpecs, options = {}) {
  let best = null;
  for (const spec of containerSpecs) {
    const result = pack(cargoTypes, spec, options);
    const unplacedCount = result.unplaced.reduce((s, u) => s + u.count, 0);
    const containerCount = result.containers.length;
    const avgUtil = containerCount
      ? result.containers.reduce((s, ct) => s + ct.stats.volumeUtilization, 0) / containerCount
      : 0;
    const candidate = { result, containerSpec: spec, unplacedCount, containerCount, avgUtil };
    if (
      !best ||
      candidate.unplacedCount < best.unplacedCount ||
      (candidate.unplacedCount === best.unplacedCount && candidate.containerCount < best.containerCount) ||
      (candidate.unplacedCount === best.unplacedCount && candidate.containerCount === best.containerCount && candidate.avgUtil > best.avgUtil)
    ) {
      best = candidate;
    }
  }
  return best ? { result: best.result, containerSpec: best.containerSpec } : null;
}

function packOneContainer(boxes, container, containerNum) {
  const placements = [];
  const unplaced = [];
  let extremePoints = [{ x: 0, y: 0, z: 0 }];
  let totalWeight = 0;
  const internal = container.internal;

  for (const box of boxes) {
    // Container weight check
    if (totalWeight + box.weightKg > container.payloadKg + EPSILON) {
      box.unplacedReason = box.weightKg > container.payloadKg ? 'overweight' : 'nospace';
      unplaced.push(box);
      continue;
    }

    const orientations = getValidOrientations(box);

    // Oversize: no orientation fits even an empty container
    const fitsAtAll = orientations.some(
      (o) => o.L <= internal.length + EPSILON &&
             o.W <= internal.width + EPSILON &&
             o.H <= internal.height + EPSILON
    );
    if (!fitsAtAll) {
      box.unplacedReason = 'oversize';
      unplaced.push(box);
      continue;
    }

    // Sort EPs to encourage back-to-front, bottom-up packing.
    // Door is at +X end → low x = furthest from door = preferred.
    const sortedEPs = [...extremePoints].sort(
      (a, b) => a.z - b.z || a.x - b.x || a.y - b.y
    );

    // groupSameSku (FR 3.4): pull the box toward the cluster of already
    // placed boxes of the same cargo, so the SKU stays spatially together.
    let clusterDist = null;
    if (box.groupSameSku) {
      const same = placements.filter((p) => p.cargoId === box.cargoId);
      if (same.length > 0) {
        clusterDist = (ep) => {
          let min = Infinity;
          for (const p of same) {
            const dx = ep.x - (p.x + p.L / 2);
            const dy = ep.y - (p.y + p.W / 2);
            const dz = ep.z - (p.z + p.H / 2);
            const d = dx * dx + dy * dy + dz * dz;
            if (d < min) min = d;
          }
          return min;
        };
      }
    }

    // Best-fit: score every feasible (EP × orientation) and keep the best.
    // Key is lexicographic; when not clustering it starts with z, so once a
    // feasible spot exists no EP at a higher level can win → early break.
    let best = null;
    for (const ep of sortedEPs) {
      if (best && !clusterDist && ep.z > best.key[0] + EPSILON) break;
      for (let oi = 0; oi < orientations.length; oi++) {
        const ev = evaluatePlacement(ep, orientations[oi], box, placements, container);
        if (!ev) continue;
        const key = clusterDist
          ? [clusterDist(ep), ep.z, ev.penalty, ep.x, ep.y, oi]
          : [ep.z, ev.penalty, ep.x, ep.y, oi];
        if (!best || lexLess(key, best.key)) {
          best = { ep, orient: orientations[oi], ev, key };
        }
      }
    }

    if (!best) {
      box.unplacedReason = 'nospace';
      unplaced.push(box);
      continue;
    }

    const { ep, orient, ev } = best;
    const placement = {
      instanceId: box.instanceId,
      cargoId: box.cargoId,
      name: box.name,
      color: box.color,
      x: ep.x,
      y: ep.y,
      z: ep.z,
      L: orient.L,
      W: orient.W,
      H: orient.H,
      weightKg: box.weightKg,
      maxLoadOnTopKg: box.maxLoadOnTopKg,
      thisSideUp: box.thisSideUp,
      nonStackable: box.nonStackable || box.maxLoadOnTopKg <= 0,
      yaw: orient.yaw,
      pitch: orient.pitch,
      roll: orient.roll,
      containerNum,
      // Support graph (internal): direct supporters + contact-area fraction,
      // stack layer (floor = 1), and total load currently carried on top.
      supports: ev.supports,
      layer: ev.layer,
      carriedKg: 0,
    };
    // Commit this box's distributed weight down the support chain.
    for (const [p, addKg] of ev.loadAdditions) p.carriedKg += addKg;
    placements.push(placement);
    totalWeight += box.weightKg;
    extremePoints = updateExtremePoints(extremePoints, placement, placements, internal);
  }

  return { placements, unplaced };
}

function getValidOrientations(box) {
  const orientations = [];
  const { L, W, H, rotatable, thisSideUp } = box;

  // Identity
  orientations.push({ L, W, H, yaw: 0, pitch: 0, roll: 0 });

  // Yaw 90°: swap L and W
  if (rotatable.yaw) {
    orientations.push({ L: W, W: L, H, yaw: 90, pitch: 0, roll: 0 });
  }

  // Pitch/Roll: only if thisSideUp is false
  if (!thisSideUp) {
    if (rotatable.pitch) {
      // W ↔ H
      orientations.push({ L, W: H, H: W, yaw: 0, pitch: 90, roll: 0 });
      if (rotatable.yaw) {
        orientations.push({ L: H, W: L, H: W, yaw: 90, pitch: 90, roll: 0 });
      }
    }
    if (rotatable.roll) {
      // L ↔ H
      orientations.push({ L: H, W, H: L, yaw: 0, pitch: 0, roll: 90 });
      if (rotatable.yaw) {
        orientations.push({ L: W, W: H, H: L, yaw: 90, pitch: 0, roll: 90 });
      }
    }
  }

  return orientations;
}

function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i] - EPSILON) return true;
    if (a[i] > b[i] + EPSILON) return false;
  }
  return false;
}

/**
 * Check whether `box` in `orient` can sit at `ep`, and if so return the
 * placement metadata needed to commit it:
 *   { layer, penalty, supports: [{p, f}], loadAdditions: Map<placement, kg> }
 * Returns null when any hard constraint fails.
 */
function evaluatePlacement(ep, orient, box, placed, container) {
  const { x, y, z } = ep;
  const { L, W, H } = orient;
  const internal = container.internal;

  // 1. Boundary check
  if (
    x + L > internal.length + EPSILON ||
    y + W > internal.width + EPSILON ||
    z + H > internal.height + EPSILON
  ) return null;

  // 2. Collision check (AABB)
  for (const p of placed) {
    if (intersects(x, y, z, L, W, H, p.x, p.y, p.z, p.L, p.W, p.H)) {
      return null;
    }
  }

  // Floor placement: no supporters to validate
  if (z <= EPSILON) {
    return { layer: 1, penalty: 0, supports: [], loadAdditions: EMPTY_MAP };
  }

  // 3. nonStackable cargo travels on the floor only
  if (box.nonStackable) return null;

  // 4. Support: collect direct supporters + contact areas
  const supporters = [];
  let supportedArea = 0;
  for (const p of placed) {
    if (Math.abs(p.z + p.H - z) < EPSILON &&
        rectanglesIntersect(x, y, L, W, p.x, p.y, p.L, p.W)) {
      const ix = Math.max(x, p.x);
      const iy = Math.max(y, p.y);
      const ax = Math.min(x + L, p.x + p.L);
      const ay = Math.min(y + W, p.y + p.W);
      const area = Math.max(0, ax - ix) * Math.max(0, ay - iy);
      supporters.push({ p, area });
      supportedArea += area;
    }
  }
  if (supporters.length === 0) return null;

  // 5. Nothing may rest on a non-stackable box
  for (const s of supporters) {
    if (s.p.nonStackable) return null;
  }

  // 6. Support ratio (bottom area covered)
  if (supportedArea / (L * W) < box.supportRatioMin - EPSILON) return null;

  // 7. Max stack layers (layer is cached on each placement; floor = 1)
  let layer = 1;
  for (const s of supporters) layer = Math.max(layer, s.p.layer + 1);
  if (layer > box.maxStackLayers) return null;

  // 8. Top-load along the whole support chain: distribute the box's weight
  // to supporters proportionally to contact area, propagate transitively,
  // and verify every affected box's maxLoadOnTopKg.
  let loadAdditions = EMPTY_MAP;
  if (box.weightKg > 0) {
    loadAdditions = new Map();
    for (const s of supporters) {
      loadAdditions.set(s.p, (loadAdditions.get(s.p) ?? 0) + box.weightKg * (s.area / supportedArea));
    }
    // Collect the affected sub-graph, then propagate in z-descending order
    // (a supporter always sits strictly lower than what it carries), so each
    // node's inflow is complete before it is pushed further down.
    const seen = new Set(supporters.map((s) => s.p));
    const stack = [...seen];
    while (stack.length) {
      const p = stack.pop();
      for (const sub of p.supports) {
        if (!seen.has(sub.p)) { seen.add(sub.p); stack.push(sub.p); }
      }
    }
    const ordered = [...seen].sort((a, b) => b.z - a.z);
    for (const p of ordered) {
      const kg = loadAdditions.get(p) ?? 0;
      if (kg <= 0) continue;
      for (const sub of p.supports) {
        loadAdditions.set(sub.p, (loadAdditions.get(sub.p) ?? 0) + kg * sub.f);
      }
    }
    for (const [p, addKg] of loadAdditions) {
      if (p.carriedKg + addKg > p.maxLoadOnTopKg + EPSILON) return null;
    }
  }

  // 9. Pyramid preference (soft): avoid resting on any lighter box
  const penalty = supporters.some((s) => box.weightKg > s.p.weightKg + EPSILON) ? 1 : 0;

  return {
    layer,
    penalty,
    supports: supporters.map((s) => ({ p: s.p, f: s.area / supportedArea })),
    loadAdditions,
  };
}

const EMPTY_MAP = new Map();

function intersects(x1, y1, z1, L1, W1, H1, x2, y2, z2, L2, W2, H2) {
  return (
    x1 + L1 > x2 + EPSILON &&
    x2 + L2 > x1 + EPSILON &&
    y1 + W1 > y2 + EPSILON &&
    y2 + W2 > y1 + EPSILON &&
    z1 + H1 > z2 + EPSILON &&
    z2 + H2 > z1 + EPSILON
  );
}

function rectanglesIntersect(x1, y1, L1, W1, x2, y2, L2, W2) {
  return (
    x1 + L1 > x2 + EPSILON &&
    x2 + L2 > x1 + EPSILON &&
    y1 + W1 > y2 + EPSILON &&
    y2 + W2 > y1 + EPSILON
  );
}

/** Highest solid surface under point (x, y) at or below height z (floor = 0). */
function projectDown(x, y, z, placements) {
  let top = 0;
  for (const p of placements) {
    if (p.z + p.H <= z + EPSILON &&
        x >= p.x - EPSILON && x < p.x + p.L - EPSILON &&
        y >= p.y - EPSILON && y < p.y + p.W - EPSILON) {
      top = Math.max(top, p.z + p.H);
    }
  }
  return top;
}

function updateExtremePoints(currentEPs, placement, placements, internal) {
  const { x, y, z, L, W, H } = placement;
  const newPoints = [
    { x: x + L, y, z },
    { x, y: y + W, z },
    { x, y, z: z + H },
  ];

  // Project the two side points down onto the nearest solid surface (or the
  // floor). Without this, side EPs of an elevated box hang in mid-air and a
  // usable spot below them is never tried.
  for (const pt of [{ x: x + L, y, z }, { x, y: y + W, z }]) {
    const zp = projectDown(pt.x, pt.y, pt.z, placements);
    if (zp < pt.z - EPSILON) newPoints.push({ x: pt.x, y: pt.y, z: zp });
  }

  // Remove EPs covered by the new placement
  const result = currentEPs.filter((ep) => {
    return !(
      ep.x >= x - EPSILON && ep.x < x + L - EPSILON &&
      ep.y >= y - EPSILON && ep.y < y + W - EPSILON &&
      ep.z >= z - EPSILON && ep.z < z + H - EPSILON
    );
  });

  // Add new, dedupe; skip points on/outside container faces (nothing fits there)
  for (const np of newPoints) {
    if (np.x >= internal.length - EPSILON ||
        np.y >= internal.width - EPSILON ||
        np.z >= internal.height - EPSILON) continue;
    if (!result.some((ep) => Math.abs(ep.x - np.x) < EPSILON && Math.abs(ep.y - np.y) < EPSILON && Math.abs(ep.z - np.z) < EPSILON)) {
      result.push(np);
    }
  }
  return result;
}

function computeStats(placements, container) {
  const internal = container.internal;
  const containerVol = internal.length * internal.width * internal.height;
  let usedVol = 0;
  let usedWeight = 0;
  const perCargo = new Map();

  for (const p of placements) {
    usedVol += p.L * p.W * p.H;
    usedWeight += p.weightKg;
    perCargo.set(p.cargoId, (perCargo.get(p.cargoId) ?? 0) + 1);
  }

  return {
    placedBoxes: placements.length,
    volumeUtilization: usedVol / containerVol,
    weightUtilization: usedWeight / container.payloadKg,
    usedWeightKg: usedWeight,
    payloadKg: container.payloadKg,
    perCargo: Array.from(perCargo.entries()).map(([cargoId, count]) => ({ cargoId, count })),
  };
}
