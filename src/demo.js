// Demo dataset — for one-click sample loading

const DEMO = {
  containerId: 'OCEAN_40HQ',
  nextCargoId: 5,
  cargoTypes: [
    {
      id: 'C1', name: 'Tacmac SW8', length: 120, width: 25, height: 80,
      weightKg: 10, quantity: 162, color: '#e74c3c',
      rotatable: { yaw: true, pitch: false, roll: false },
      thisSideUp: true,
      maxStackLayers: 99, maxLoadOnTopKg: 200, supportRatioMin: 0.8,
      priority: 'normal',
    },
    {
      id: 'C2', name: 'Aethos', length: 120, width: 25, height: 60,
      weightKg: 10, quantity: 45, color: '#3498db',
      rotatable: { yaw: true, pitch: false, roll: false },
      thisSideUp: true,
      maxStackLayers: 99, maxLoadOnTopKg: 150, supportRatioMin: 0.8,
      priority: 'normal',
    },
    {
      id: 'C3', name: 'Roubaix', length: 120, width: 25, height: 70,
      weightKg: 12, quantity: 36, color: '#2ecc71',
      rotatable: { yaw: true, pitch: false, roll: false },
      thisSideUp: true,
      maxStackLayers: 99, maxLoadOnTopKg: 180, supportRatioMin: 0.8,
      priority: 'normal',
    },
    {
      // 打棧板的輪組：不可堆疊 → 僅放地面、上方不放貨
      id: 'C4', name: 'Wheelset Pallet', length: 120, width: 100, height: 130,
      weightKg: 180, quantity: 4, color: '#f39c12',
      rotatable: { yaw: true, pitch: false, roll: false },
      thisSideUp: true,
      maxStackLayers: 1, maxLoadOnTopKg: 0, supportRatioMin: 0.8,
      nonStackable: true,
      priority: 'normal',
    },
  ],
};

/** Deep-cloned demo plan, in the same shape applyImportedData() accepts. */
export function getDemoData() {
  return JSON.parse(JSON.stringify(DEMO));
}
