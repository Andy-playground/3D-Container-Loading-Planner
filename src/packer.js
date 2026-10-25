// 3D Bin Packing — Extreme-Point Heuristic + FFD
// Per SDD §8

const EPSILON = 0.001;
// Valid spots checked past the first one when looking for a spot that
// overloads nothing below (see packOneContainer).
const OVERLOAD_LOOKAHEAD = 40;

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
    // Nothing left fits (oversize / door / overweight): opening more
    // containers would only add empty ones. Keep the first so the UI
    // still has a container to show.
    if (result.placements.length === 0 && containerCount > 1) {
      remaining = result.unplaced;
      break;
    }
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
  // A box can overhang its supporter toward the back, so a plain position sort
  // could list it before the box it rests on — every supporter goes first.
  let globalSeq = 0;
  for (const ct of containers) {
    for (const p of loadingOrder(ct.placements)) p.loadSeq = ++globalSeq;
  }

  // 3c. Top-load warnings (advisory — overloading is common practice, the
  // user decides). topLoadKg is accumulated while packing: each box's weight
  // is shared among its supporters by contact area, down the whole chain.
  for (const ct of containers) {
    for (const p of ct.placements) {
      p.overloaded = p.topLoadKg > (p.maxLoadOnTopKg ?? Infinity) + EPSILON;
    }
    ct.stats.overloaded = ct.placements
      .filter((p) => p.overloaded)
      .map((p) => ({
        instanceId: p.instanceId, cargoId: p.cargoId, name: p.name,
        loadSeq: p.loadSeq, topLoadKg: p.topLoadKg, limitKg: p.maxLoadOnTopKg,
      }));
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

  for (const box of boxes) {
    // Container weight check
    if (totalWeight + box.weightKg > container.payloadKg + EPSILON) {
      box.unplacedReason = box.weightKg > container.payloadKg ? 'overweight' : 'payloadFull';
      unplaced.push(box);
      continue;
    }

    // Oversize: no orientation fits even an empty container
    const internal = container.internal;
    const fitsInside = getValidOrientations(box).filter(
      (o) => o.L <= internal.length + EPSILON &&
             o.W <= internal.width + EPSILON &&
             o.H <= internal.height + EPSILON
    );
    if (fitsInside.length === 0) {
      box.unplacedReason = 'oversize';
      unplaced.push(box);
      continue;
    }

    // Door opening (smaller than the interior): the box goes in lengthwise
    // along X, so its placed cross-section W×H must pass the door.
    const orientations = fitsInside.filter((o) => fitsDoor(o, container));
    if (orientations.length === 0) {
      box.unplacedReason = 'door';
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

    // Loaders avoid crushing cargo when they can: take the first spot that
    // overloads nobody below; only if every valid spot would, accept the first
    // valid one anyway (flagged as a warning in §3c — the user decides).
    // The look-ahead past the first valid spot is bounded, as on the dock.
    let fallback = null;
    let choice = null;
    let lookahead = OVERLOAD_LOOKAHEAD;
    for (const ep of sortedEPs) {
      for (const orient of orientations) {
        if (!canPlace(ep, orient, box, placements, container)) continue;
        fallback ??= { ep, orient };
        if (!wouldOverload(ep, orient, box.weightKg, placements)) {
          choice = { ep, orient };
          break;
        }
        if (--lookahead < 0) break;
      }
      if (choice || lookahead < 0) break;
    }
    choice ??= fallback;

    if (choice) {
      const { ep, orient } = choice;
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
        topLoadKg: 0,
        maxStackLayers: box.maxStackLayers,
        thisSideUp: box.thisSideUp,
        // DO NOT STACK marking. Fragile goods may still be stacked —
        // their top-load limit only raises a warning (§3c).
        nonStackable: box.maxStackLayers <= 1,
        yaw: orient.yaw,
        pitch: orient.pitch,
        roll: orient.roll,
        containerNum,
      };
      placements.push(placement);
      addTopLoad(placement, placements);
      totalWeight += box.weightKg;
      extremePoints = updateExtremePoints(extremePoints, placement);
      placed = true;
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

function fitsDoor(orient, container) {
  const door = container.door;
  if (!door) return true;
  return orient.W <= door.width + EPSILON && orient.H <= door.height + EPSILON;
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

    // 4. Nothing may rest on a DO NOT STACK box (maxStackLayers 1).
    // Top-load limits are only a warning (§3c), never a block.
    if (supporters.some((s) => s.nonStackable)) return false;

    // 5. Max stack layers — the new layer may exceed neither this box's
    // limit nor that of any box beneath it in the stack.
    const myLayer = computeLayer(x, y, z, L, W, placed) + 1;
    if (myLayer > box.maxStackLayers) return false;
    if (stackBelow(supporters, placed).some((s) => myLayer > s.maxStackLayers)) return false;
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

function supportersOf(p, placed) {
  return placed.filter(
    (s) => s !== p &&
           Math.abs(s.z + s.H - p.z) < EPSILON &&
           rectanglesIntersect(p.x, p.y, p.L, p.W, s.x, s.y, s.L, s.W)
  );
}

function contactArea(a, b) {
  return Math.max(0, Math.min(a.x + a.L, b.x + b.L) - Math.max(a.x, b.x)) *
         Math.max(0, Math.min(a.y + a.W, b.y + b.W) - Math.max(a.y, b.y));
}

// Every box beneath the given supporters, transitively (each once).
function stackBelow(supporters, placed) {
  const seen = new Set();
  const stack = [...supporters];
  while (stack.length) {
    const s = stack.pop();
    if (seen.has(s)) continue;
    seen.add(s);
    if (s.z > EPSILON) stack.push(...supportersOf(s, placed));
  }
  return [...seen];
}

// Supporters first, then back of the container (low x) → front, bottom → top.
function loadingOrder(placements) {
  const sorted = [...placements].sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
  const below = new Map(sorted.map((p) => [p, p.z > EPSILON ? supportersOf(p, placements) : []]));
  const done = new Set();
  const order = [];
  while (order.length < sorted.length) {
    const next = sorted.find((p) => !done.has(p) && below.get(p).every((s) => done.has(s)));
    done.add(next);
    order.push(next);
  }
  return order;
}

// Extra load each box below receives when `weight` comes to rest on
// `supporters`: shared by contact area, passed down the support chain level
// by level (highest first, so each box forwards its total share once).
function loadDeltas(rect, weight, supporters, placed) {
  const delta = new Map();
  const share = (r, load, below) => {
    const areas = below.map((s) => contactArea(r, s));
    const total = areas.reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    below.forEach((s, i) => delta.set(s, (delta.get(s) ?? 0) + load * areas[i] / total));
  };
  share(rect, weight, supporters);
  const done = new Set();
  for (;;) {
    let top = null;
    for (const p of delta.keys()) if (!done.has(p) && (!top || p.z > top.z)) top = p;
    if (!top) return delta;
    done.add(top);
    if (top.z > EPSILON) share(top, delta.get(top), supportersOf(top, placed));
  }
}

function wouldOverload(ep, orient, weight, placed) {
  if (ep.z <= EPSILON) return false;
  const rect = { x: ep.x, y: ep.y, z: ep.z, L: orient.L, W: orient.W };
  const delta = loadDeltas(rect, weight, supportersOf(rect, placed), placed);
  for (const [s, d] of delta) {
    if (s.topLoadKg + d > (s.maxLoadOnTopKg ?? Infinity) + EPSILON) return true;
  }
  return false;
}

// Record a new placement's weight on every box beneath it.
function addTopLoad(p, placed) {
  if (p.z <= EPSILON) return;
  for (const [s, d] of loadDeltas(p, p.weightKg, supportersOf(p, placed), placed)) {
    s.topLoadKg += d;
  }
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
