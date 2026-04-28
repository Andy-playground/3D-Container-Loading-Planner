// Preset container definitions per SDD §6.2
// All dimensions in cm, weight in kg
// Labels are bilingual { zh, en }

export const CONTAINERS = [
  // ===== Ocean =====
  {
    id: 'OCEAN_20GP',
    mode: 'ocean',
    type: '20GP',
    label: { zh: '20ft 標準櫃 (20GP)', en: '20ft Standard (20GP)' },
    internal: { length: 589.6, width: 235.0, height: 239.3 },
    payloadKg: 28200,
  },
  {
    id: 'OCEAN_40GP',
    mode: 'ocean',
    type: '40GP',
    label: { zh: '40ft 標準櫃 (40GP)', en: '40ft Standard (40GP)' },
    internal: { length: 1203.2, width: 235.0, height: 239.3 },
    payloadKg: 26700,
  },
  {
    id: 'OCEAN_40HQ',
    mode: 'ocean',
    type: '40HQ',
    label: { zh: '40ft 高櫃 (40HQ)', en: '40ft High Cube (40HQ)' },
    internal: { length: 1203.2, width: 235.0, height: 269.7 },
    payloadKg: 26500,
  },
  {
    id: 'OCEAN_45HQ',
    mode: 'ocean',
    type: '45HQ',
    label: { zh: '45ft 高櫃 (45HQ)', en: '45ft High Cube (45HQ)' },
    internal: { length: 1355.5, width: 235.0, height: 269.7 },
    payloadKg: 27600,
  },

  // ===== Truck =====
  {
    id: 'TRUCK_20FT_BOX',
    mode: 'truck',
    type: '20FT-BOX',
    label: { zh: '20ft 廂式貨車', en: '20ft Box Truck' },
    internal: { length: 580.0, width: 240.0, height: 240.0 },
    payloadKg: 12000,
  },
  {
    id: 'TRUCK_40FT_BOX',
    mode: 'truck',
    type: '40FT-BOX',
    label: { zh: '40ft 廂式貨車', en: '40ft Box Truck' },
    internal: { length: 1200.0, width: 240.0, height: 260.0 },
    payloadKg: 22000,
  },
  {
    id: 'TRUCK_53FT_DRYVAN',
    mode: 'truck',
    type: '53FT-DRYVAN',
    label: { zh: '53ft Dry Van', en: '53ft Dry Van' },
    internal: { length: 1610.0, width: 254.0, height: 274.0 },
    payloadKg: 20000,
  },

  // ===== Rail =====
  {
    id: 'RAIL_40FT_FLATCAR',
    mode: 'rail',
    type: '40FT-FLATCAR',
    label: { zh: '40ft 鐵路平車', en: '40ft Flatcar' },
    internal: { length: 1218.0, width: 244.0, height: 290.0 },
    payloadKg: 30000,
  },
  {
    id: 'RAIL_60FT_BOXCAR',
    mode: 'rail',
    type: '60FT-BOXCAR',
    label: { zh: '60ft 鐵路廂車', en: '60ft Boxcar' },
    internal: { length: 1828.0, width: 290.0, height: 320.0 },
    payloadKg: 50000,
  },
  {
    id: 'RAIL_89FT_HICUBE',
    mode: 'rail',
    type: '89FT-HICUBE',
    label: { zh: '89ft 鐵路高櫃', en: '89ft Hi-Cube Boxcar' },
    internal: { length: 2710.0, width: 290.0, height: 350.0 },
    payloadKg: 60000,
  },
];

export function getContainer(id) {
  return CONTAINERS.find((c) => c.id === id);
}

export function getContainersByMode(mode) {
  return CONTAINERS.filter((c) => c.mode === mode);
}

/** Returns the localized label for a container, falling back to zh. */
export function getLabel(container, lang) {
  if (!container?.label) return '';
  if (typeof container.label === 'string') return container.label;
  return container.label[lang] ?? container.label.zh;
}
