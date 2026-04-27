// Application orchestration — wires UI ↔ packer ↔ scene
import { initScene, renderResult, setOpacity, setLabelsVisible, onBoxClick } from './scene.js?v=5';
import * as ui from './ui.js?v=5';
import { pack } from './packer.js?v=5';
import { getContainer } from './containers.js?v=5';
import { loadDemo } from './demo.js?v=5';

function start() {
  initScene(document.getElementById('canvas'));
  ui.init();

  function runPack() {
    const state = ui.getState();
    const container = getContainer(state.containerId);
    if (state.cargoTypes.length === 0) return null;
    const t0 = performance.now();
    const result = pack(state.cargoTypes, container, { allowMultiContainer: true, maxContainers: 20 });
    const t1 = performance.now();
    console.log(`Pack took ${(t1 - t0).toFixed(1)}ms`);
    renderResult(result, container);
    ui.renderStats(result);
    return result;
  }

  ui.on('pack', () => {
    if (!runPack()) alert('請先新增至少一種貨物');
  });

  ui.on('containerChanged', () => {
    // Auto re-pack only if there's already cargo
    const state = ui.getState();
    if (state.cargoTypes.length > 0) runPack();
  });

  ui.on('changed', (payload) => {
    if (payload?.opacity !== undefined) {
      setOpacity(payload.opacity);
    }
  });

  ui.on('labelsToggle', (visible) => {
    setLabelsVisible(visible);
  });

  onBoxClick((placement) => {
    ui.showDetails(placement);
  });

  // Demo button
  document.getElementById('demoBtn')?.addEventListener('click', () => {
    if (!confirm('載入示範資料將覆蓋目前內容，確定？')) return;
    loadDemo();
    location.reload();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
