// Unit system (metric cm/kg ↔ imperial in/lb) — display/input conversion only.
// All internal storage, packing math, JSON and CSV interchange stay metric.

const STORAGE_KEY = 'clp:units';
const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

let current = 'metric';

export function getUnitSystem() { return current; }

export function setUnitSystem(u) {
  if (u !== 'metric' && u !== 'imperial') return;
  current = u;
  try { localStorage.setItem(STORAGE_KEY, u); } catch {}
}

export function initUnits() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'metric' || saved === 'imperial') current = saved;
  } catch {}
}

export function lenUnit() { return current === 'imperial' ? 'in' : 'cm'; }
export function wtUnit() { return current === 'imperial' ? 'lb' : 'kg'; }

/** cm (internal) → display number. */
export function cmToDisplay(cm) {
  return current === 'imperial' ? cm / CM_PER_IN : cm;
}

/** display input number → cm (internal). */
export function displayToCm(v) {
  return current === 'imperial' ? v * CM_PER_IN : v;
}

/** kg (internal) → display number. */
export function kgToDisplay(kg) {
  return current === 'imperial' ? kg / KG_PER_LB : kg;
}

/** display input number → kg (internal). */
export function displayToKg(v) {
  return current === 'imperial' ? v * KG_PER_LB : v;
}

/** Format a length stored in cm for display, with up to `digits` decimals. */
export function fmtLen(cm, digits = 1) {
  return trimZeros(cmToDisplay(cm), digits);
}

/** Format a weight stored in kg for display. */
export function fmtWt(kg, digits = 1) {
  if (!isFinite(kg)) return '∞';
  return trimZeros(kgToDisplay(kg), digits);
}

function trimZeros(v, digits) {
  const s = Number(v).toFixed(digits);
  return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}
