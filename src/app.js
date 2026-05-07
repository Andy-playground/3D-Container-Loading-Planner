// Application orchestration — wires UI ↔ packer ↔ scene
import { initScene, renderResult, setOpacity, setLabelsVisible, setCOGVisible, onBoxClick } from './scene.js?v=6';
import * as ui from './ui.js?v=6';
import { pack } from './packer.js?v=6';
import { getContainer } from './containers.js?v=6';
import { loadDemo } from './demo.js?v=6';
import { enrichResult } from './analytics.js?v=6';
import { exportTXT, exportCSV, exportPDF } from './exporters.js?v=6';
import { initLang, toggleLang, t } from './i18n.js?v=6';

let lastResult = null;
let lastContainerSpec = null;

function start() {
  initLang();
  initScene(document.getElementById('canvas'));
  ui.init();

  function runPack() {
    const state = ui.getState();
    const container = getContainer(state.containerId);
    if (state.cargoTypes.length === 0) return null;
    const t0 = performance.now();
    const result = pack(state.cargoTypes, container, { allowMultiContainer: true, maxContainers: 20 });
    enrichResult(result, container);
    const t1 = performance.now();
    console.log(`Pack took ${(t1 - t0).toFixed(1)}ms`);
    lastResult = result;
    lastContainerSpec = container;
    renderResult(result, container);
    ui.renderStats(result, container);
    return result;
  }

  ui.on('pack', () => {
    if (!runPack()) alert(t('addAtLeastOne'));
  });

  ui.on('containerChanged', () => {
    const state = ui.getState();
    if (state.cargoTypes.length > 0) runPack();
  });

  ui.on('changed', (payload) => {
    if (payload?.opacity !== undefined) setOpacity(payload.opacity);
  });

  ui.on('labelsToggle', (visible) => setLabelsVisible(visible));
  ui.on('cogToggle', (visible) => setCOGVisible(visible));

  onBoxClick((placement) => ui.showDetails(placement));

  document.getElementById('demoBtn')?.addEventListener('click', () => {
    if (!confirm(t('confirmDemo'))) return;
    loadDemo();
    location.reload();
  });

  // Export menu
  document.getElementById('exportTxtBtn')?.addEventListener('click', () => {
    if (!lastResult) { runPack(); }
    if (lastResult) exportTXT(lastResult, lastContainerSpec);
  });
  document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
    if (!lastResult) { runPack(); }
    if (lastResult) exportCSV(lastResult, lastContainerSpec);
  });
  document.getElementById('exportPdfBtn')?.addEventListener('click', () => {
    if (!lastResult) { runPack(); }
    if (lastResult) exportPDF(lastResult, lastContainerSpec);
  });

  // Export menu toggle
  const exportMenuBtn = document.getElementById('exportMenuBtn');
  const exportMenu = document.getElementById('exportMenu');
  if (exportMenuBtn && exportMenu) {
    exportMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('open');
    });
    document.addEventListener('click', () => exportMenu.classList.remove('open'));
  }

  // Language toggle
  document.getElementById('langBtn')?.addEventListener('click', () => {
    toggleLang();
    ui.renderAll();
    if (lastResult) ui.renderStats(lastResult, lastContainerSpec);
  });

  document.addEventListener('langchange', () => {
    ui.renderAll();
    if (lastResult) ui.renderStats(lastResult, lastContainerSpec);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
