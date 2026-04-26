// Demo dataset — for one-click sample loading

const STORAGE_KEY = 'clp:current';

const DEMO = {
  containerId: 'OCEAN_40HQ',
  nextCargoId: 4,
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
  ],
};

export function loadDemo() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO));
}
