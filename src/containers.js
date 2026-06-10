// Preset container definitions per SDD §6.2
// All dimensions in cm, weight in kg

export const CONTAINERS = [
  // ===== Ocean =====
  {
    id: 'OCEAN_20GP',
    mode: 'ocean',
    type: '20GP',
    label: '20ft 標準櫃 (20GP)',
    internal: { length: 589.6, width: 235.0, height: 239.3 },
    payloadKg: 28200,
  },
  {
    id: 'OCEAN_40GP',
    mode: 'ocean',
    type: '40GP',
    label: '40ft 標準櫃 (40GP)',
    internal: { length: 1203.2, width: 235.0, height: 239.3 },
    payloadKg: 26700,
  },
  {
    id: 'OCEAN_40HQ',
    mode: 'ocean',
    type: '40HQ',
    label: '40ft 高櫃 (40HQ)',
    internal: { length: 1203.2, width: 235.0, height: 269.7 },
    payloadKg: 26500,
  },
  {
    id: 'OCEAN_45HQ',
    mode: 'ocean',
    type: '45HQ',
    label: '45ft 高櫃 (45HQ)',
    internal: { length: 1355.5, width: 235.0, height: 269.7 },
    payloadKg: 27600,
  },

  // ===== Truck =====
  {
    id: 'TRUCK_20FT_BOX',
    mode: 'truck',
    type: '20FT-BOX',
    label: '20ft 廂式貨車',
    internal: { length: 580.0, width: 240.0, height: 240.0 },
    payloadKg: 12000,
  },
  {
    id: 'TRUCK_40FT_BOX',
    mode: 'truck',
    type: '40FT-BOX',
    label: '40ft 廂式貨車',
    internal: { length: 1200.0, width: 240.0, height: 260.0 },
    payloadKg: 22000,
  },
  {
    id: 'TRUCK_53FT_DRYVAN',
    mode: 'truck',
    type: '53FT-DRYVAN',
    label: '53ft Dry Van',
    internal: { length: 1610.0, width: 254.0, height: 274.0 },
    payloadKg: 20000,
  },

  // ===== Rail =====
  {
    id: 'RAIL_40FT_FLATCAR',
    mode: 'rail',
    type: '40FT-FLATCAR',
    label: '40ft 鐵路平車',
    internal: { length: 1218.0, width: 244.0, height: 290.0 },
    payloadKg: 30000,
  },
  {
    id: 'RAIL_60FT_BOXCAR',
    mode: 'rail',
    type: '60FT-BOXCAR',
    label: '60ft 鐵路廂車',
    internal: { length: 1828.0, width: 290.0, height: 320.0 },
    payloadKg: 50000,
  },
  {
    id: 'RAIL_89FT_HICUBE',
    mode: 'rail',
    type: '89FT-HICUBE',
    label: '89ft 鐵路高櫃',
    internal: { length: 2710.0, width: 290.0, height: 350.0 },
    payloadKg: 60000,
  },
];

// ===== Custom (user-defined) containers — persisted in localStorage =====
const CUSTOM_KEY = 'clp:customContainers';

function hasStorage() {
  return typeof localStorage !== 'undefined';
}

export function getCustomContainers() {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((c) => c && c.id && c.internal) : [];
  } catch {
    return [];
  }
}

export function addCustomContainer({ id, label, length, width, height, payloadKg }) {
  const custom = getCustomContainers();
  const container = {
    id: id && !custom.some((c) => c.id === id) ? id : `CUSTOM_${Date.now()}_${custom.length}`,
    mode: 'custom',
    type: 'CUSTOM',
    label,
    internal: { length, width, height },
    payloadKg,
  };
  custom.push(container);
  if (hasStorage()) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch {}
  }
  return container;
}

export function removeCustomContainer(id) {
  const custom = getCustomContainers().filter((c) => c.id !== id);
  if (hasStorage()) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch {}
  }
}

export function getAllContainers() {
  return [...CONTAINERS, ...getCustomContainers()];
}

export function getContainer(id) {
  return getAllContainers().find((c) => c.id === id);
}

export function getContainersByMode(mode) {
  return getAllContainers().filter((c) => c.mode === mode);
}
