// 3D Bin Packing — Extreme-Point Heuristic + FFD
// Per SDD §8

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
        priority: c.priority ?? 'normal',
        groupSameSku: c.groupSameSku ?? false,
        // FR-4: pallet-as-unit — packed as one box; sub-items are statistical
        isPallet: c.isPallet ?? false,
        palletItems: c.palletItems ?? null,
      });
    }
  }

  // 2. Sort: priority then volume desc (FFD)
  const priorityRank = { urgent: 0, normal: 1, lifo: 2 };
  allBoxes.sort((a, b) => {
    const pa = priorityRank[a.priority] ?? 1;
    const pb = priorityRank[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    const va = a.L * a.W * a.H;
    const vb = b.L * b.W * b.H;
    return vb - va;
  });


  // 3. Loop containers
  const containers = [];
  let remaining = [...allBoxes];
  let containerCount = 0;

  while (remaining.length > 0 && containerCount < opts.maxContainers) {
    containerCount++;
    const result = packOneContainer(remaining, containerSpec, containerCount);
    containers.push({
      containerId: `${containerSpec.id}-${containerCount}`,
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
  // Evaluate large containers first: they establish a low container-count
  // baseline early, which makes the pruning cap below effective.
  const ordered = [...containerSpecs].sort((a, b) =>
    (b.internal.length * b.internal.width * b.internal.height) -
    (a.internal.length * a.internal.width * a.internal.height)
  );
  for (const spec of ordered) {
    const opts = { ...options };
    // Prune: once a complete plan (0 unplaced) exists, a candidate needing
    // more containers than best loses regardless — cap the search there and
    // let the resulting unplaced count disqualify it cheaply.
    if (best && best.unplacedCount === 0) {
      opts.maxContainers = Math.min(opts.maxContainers ?? 20, best.containerCount);
    }
    const result = pack(cargoTypes, spec, opts);
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

  for (const box of boxes) {
    // Container weight check
    if (totalWeight + box.weightKg > container.payloadKg + EPSILON) {
      box.unplacedReason = box.weightKg > container.payloadKg ? 'overweight' : 'nospace';
      unplaced.push(box);
      continue;
    }

    const orientations = getValidOrientations(box);

    // Oversize: no orientation fits even an empty container
    const internal = container.internal;
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
    let placed = false;

    // Sort EPs to encourage back-to-front, bottom-up packing.
    // Door is at +X end → low x = furthest from door = preferred.
    // This naturally produces a "staircase to door" pattern when not full,
    // with tall stacks at the back supporting lighter ones in front.
    let sortedEPs = [...extremePoints].sort(
      (a, b) => a.z - b.z || a.x - b.x || a.y - b.y
    );

    // groupSameSku (FR 3.4): prefer placement points nearest to boxes of the
    // same cargo already placed, so the SKU forms one spatial cluster.
    if (box.groupSameSku) {
      const same = placements.filter((p) => p.cargoId === box.cargoId);
      if (same.length > 0) {
        const distSq = (ep) => {
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
        sortedEPs = sortedEPs
          .map((ep) => ({ ep, d: distSq(ep) }))
          .sort((a, b) => a.d - b.d)
          .map((x) => x.ep);
      }
    }

    for (const ep of sortedEPs) {
      for (const orient of orientations) {
        if (canPlace(ep, orient, box, placements, container)) {
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
            isPallet: box.isPallet,
            palletItems: box.palletItems,
            nonStackable: box.maxStackLayers <= 1 || box.maxLoadOnTopKg <= 0,
            yaw: orient.yaw,
            pitch: orient.pitch,
            roll: orient.roll,
            containerNum,
          };
          placements.push(placement);
          totalWeight += box.weightKg;
          extremePoints = updateExtremePoints(extremePoints, placement);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed) {
      box.unplacedReason = 'nospace';
      unplaced.push(box);
    }
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

function canPlace(ep, orient, box, placed, container) {
  const { x, y, z } = ep;
  const { L, W, H } = orient;
  const internal = container.internal;

  // 1. Boundary check
  if (
    x + L > internal.length + EPSILON ||
    y + W > internal.width + EPSILON ||
    z + H > internal.height + EPSILON
  ) return false;

  // 2. Collision check (AABB)
  for (const p of placed) {
    if (intersects(x, y, z, L, W, H, p.x, p.y, p.z, p.L, p.W, p.H)) {
      return false;
    }
  }

  // 3. Support / stacking check
  if (z > EPSILON) {
    const supporters = placed.filter(
      (p) => Math.abs(p.z + p.H - z) < EPSILON &&
             rectanglesIntersect(x, y, L, W, p.x, p.y, p.L, p.W)
    );
    if (supporters.length === 0) return false;

    // Support ratio (bottom area covered)
    const baseArea = L * W;
    let supportedArea = 0;
    for (const s of supporters) {
      const ix = Math.max(x, s.x);
      const iy = Math.max(y, s.y);
      const ax = Math.min(x + L, s.x + s.L);
      const ay = Math.min(y + W, s.y + s.W);
      supportedArea += Math.max(0, ax - ix) * Math.max(0, ay - iy);
    }
    if (supportedArea / baseArea < box.supportRatioMin - EPSILON) return false;

    // 4. Top-load weight check on each supporter chain
    for (const s of supporters) {
      const topLoad = computeTopLoad(s, placed) + box.weightKg;
      const supporterCargo = placed.find((p) => p.instanceId === s.instanceId);
      // We need the original maxLoadOnTopKg — store on placement
      const limit = s.maxLoadOnTopKg ?? Infinity;
      if (topLoad > limit + EPSILON) return false;
    }

    // 5. Max stack layers
    const myLayer = computeLayer(x, y, z, L, W, placed) + 1;
    if (myLayer > box.maxStackLayers) return false;
  }

  return true;
}

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

function computeTopLoad(supporter, placed) {
  // Sum weight of all boxes resting (directly or transitively) on supporter
  let load = 0;
  const above = placed.filter(
    (p) => Math.abs(p.z - (supporter.z + supporter.H)) < EPSILON &&
           rectanglesIntersect(supporter.x, supporter.y, supporter.L, supporter.W, p.x, p.y, p.L, p.W)
  );
  for (const a of above) {
    load += a.weightKg + computeTopLoad(a, placed);
  }
  return load;
}

function computeLayer(x, y, z, L, W, placed) {
  // Count vertical stack height beneath (x,y,L,W) at z
  if (z < EPSILON) return 0;
  const supporters = placed.filter(
    (p) => Math.abs(p.z + p.H - z) < EPSILON &&
           rectanglesIntersect(x, y, L, W, p.x, p.y, p.L, p.W)
  );
  let maxBelow = 0;
  for (const s of supporters) {
    const sLayer = computeLayer(s.x, s.y, s.z, s.L, s.W, placed) + 1;
    maxBelow = Math.max(maxBelow, sLayer);
  }
  return maxBelow;
}

function updateExtremePoints(currentEPs, placement) {
  const { x, y, z, L, W, H } = placement;
  const newPoints = [
    { x: x + L, y, z },
    { x, y: y + W, z },
    { x, y, z: z + H },
  ];

  // Remove EPs covered by the new placement
  const filtered = currentEPs.filter((ep) => {
    return !(
      ep.x >= x - EPSILON && ep.x < x + L - EPSILON &&
      ep.y >= y - EPSILON && ep.y < y + W - EPSILON &&
      ep.z >= z - EPSILON && ep.z < z + H - EPSILON
    );
  });

  // Add new, dedupe
  const result = [...filtered];
  for (const np of newPoints) {
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
