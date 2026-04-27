// Application orchestration — wires UI ↔ packer ↔ scene
import { initScene, renderResult, setOpacity } from './scene.js?v=3';
import * as ui from './ui.js?v=3';
import { pack } from './packer.js?v=3';
import { getContainer } from './containers.js?v=3';
import { loadDemo } from './demo.js?v=3';

function start() {
  initScene(document.getElementById('canvas'));
  ui.init();

  ui.on('pack', () => {
    const state = ui.getState();
    const container = getContainer(state.containerId);
    if (state.cargoTypes.length === 0) {
      alert('請先新增至少一種貨物');
      return;
    }
    const t0 = performance.now();
    const result = pack(state.cargoTypes, container, { allowMultiContainer: true, maxContainers: 20 });
    const t1 = performance.now();
    console.log(`Pack took ${(t1 - t0).toFixed(1)}ms`);
    renderResult(result, container);
    ui.renderStats(result);
  });

  ui.on('changed', (payload) => {
    if (payload?.opacity !== undefined) {
      setOpacity(payload.opacity);
    }
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
