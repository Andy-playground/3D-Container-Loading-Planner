// Post-pack analytics: center of gravity (M4-2) + axle loads (M4-3)
// Per SDD §11 Phase 4

/**
 * Compute center of gravity for one container's placements.
 * Origin (0,0,0) = back-left-floor corner of the container interior.
 *   x axis: along container length (back → door)
 *   y axis: along container width (left → right)
 *   z axis: vertical
 *
 * @param {Array} placements - PlacedItem[]
 * @returns {Object} { x, y, z, totalWeightKg, hasWeight }
 *          When all weights are 0, falls back to volume-weighted centroid
 *          and sets hasWeight=false so callers can render an advisory.
 */
export function computeCOG(placements) {
  if (!placements || placements.length === 0) {
    return { x: 0, y: 0, z: 0, totalWeightKg: 0, hasWeight: false };
  }

  let totalWeight = 0;
  let mx = 0, my = 0, mz = 0;
  for (const p of placements) {
    const cx = p.x + p.L / 2;
    const cy = p.y + p.W / 2;
    const cz = p.z + p.H / 2;
    const w = p.weightKg || 0;
    totalWeight += w;
    mx += cx * w;
    my += cy * w;
    mz += cz * w;
  }

  if (totalWeight > 0) {
    return {
      x: mx / totalWeight,
      y: my / totalWeight,
      z: mz / totalWeight,
      totalWeightKg: totalWeight,
      hasWeight: true,
    };
  }

  // Fallback: volume-weighted centroid
  let totalVol = 0;
  mx = my = mz = 0;
  for (const p of placements) {
    const v = p.L * p.W * p.H;
    totalVol += v;
    mx += (p.x + p.L / 2) * v;
    my += (p.y + p.W / 2) * v;
    mz += (p.z + p.H / 2) * v;
  }
  if (totalVol === 0) return { x: 0, y: 0, z: 0, totalWeightKg: 0, hasWeight: false };
  return {
    x: mx / totalVol,
    y: my / totalVol,
    z: mz / totalVol,
    totalWeightKg: 0,
    hasWeight: false,
  };
}

/**
 * Estimate axle loads for a truck.
 *
 * Model: a 2-axle truck with the front axle near the cab (back of cargo bay,
 * x=0 in our coords) and the rear axle near the door (x=L). We approximate
 * each axle position at 15% inset from its respective end. The static load on
 * each axle from the cargo's COG is given by the lever rule:
 *   loadFront = totalW * (xRear - xCog) / wheelbase
 *   loadRear  = totalW * (xCog - xFront) / wheelbase
 *
 * Imbalance = |front - rear| / total. < 25% is roughly "balanced".
 *
 * @param {Object} cog - result of computeCOG
 * @param {Object} containerSpec
 * @returns {Object|null} null if not a truck or no weight; otherwise:
 *   { frontKg, rearKg, frontPct, rearPct, imbalancePct, balanced, axleFrontX, axleRearX }
 */
export function computeAxleLoads(cog, containerSpec) {
  if (!containerSpec || containerSpec.mode !== 'truck') return null;
  if (!cog || cog.totalWeightKg <= 0) return null;

  const L = containerSpec.internal.length;
  const axleFrontX = L * 0.15;
  const axleRearX = L * 0.85;
  const wheelbase = axleRearX - axleFrontX;

  const totalW = cog.totalWeightKg;
  const xCog = cog.x;

  // Clamp lever arms so a COG outside [front, rear] doesn't produce
  // negative loads (physically the over-axle case puts ~all weight on that axle).
  const armToRear = Math.max(0, Math.min(wheelbase, axleRearX - xCog));
  const armToFront = Math.max(0, Math.min(wheelbase, xCog - axleFrontX));
  const frontKg = totalW * (armToRear / wheelbase);
  const rearKg = totalW * (armToFront / wheelbase);

  const imbalancePct = totalW > 0 ? Math.abs(frontKg - rearKg) / totalW : 0;

  return {
    frontKg,
    rearKg,
    frontPct: frontKg / totalW,
    rearPct: rearKg / totalW,
    imbalancePct,
    balanced: imbalancePct < 0.25,
    axleFrontX,
    axleRearX,
  };
}

/**
 * Augment each container in a pack result with its COG and axle loads.
 * Mutates and returns the same result object for convenience.
 */
export function enrichResult(result, containerSpec) {
  if (!result?.containers) return result;
  for (const ct of result.containers) {
    ct.cog = computeCOG(ct.placements);
    ct.axleLoads = computeAxleLoads(ct.cog, containerSpec);
  }
  return result;
}
