// Application orchestration — wires UI ↔ packer ↔ scene
// NOTE: keep these imports query-free — mixing `?v=` and plain specifiers
// creates duplicate module instances (separate i18n state). Cache-busting
// is handled by the `?v=` on the entry <script> tag in index.html only.
import {
  initScene, renderResult, setOpacity, setLabelsVisible, setCOGVisible,
  onBoxClick, setCargoVisibility, setStepLimit, getTotalSteps, captureImage,
} from './scene.js';
import * as ui from './ui.js';
import { pack, packAuto } from './packer.js';
import { getContainer, getAllContainers } from './containers.js';
import { loadDemo } from './demo.js';
import { enrichResult } from './analytics.js';
import { exportTXT, exportCSV, exportPDF } from './exporters.js';
import { initLang, toggleLang, t } from './i18n.js';

let lastResult = null;
let lastContainerSpec = null;
let lastMeta = {};
let playTimer = null;

function start() {
  initLang();
  initScene(document.getElementById('canvas'));
  ui.init();

  function runPack() {
    const state = ui.getState();
    if (state.cargoTypes.length === 0) return null;

    const t0 = performance.now();
    let result, container, meta = {};
    if (state.containerId === ui.AUTO_CONTAINER_ID) {
      const best = packAuto(state.cargoTypes, getAllContainers(), { allowMultiContainer: true, maxContainers: 20 });
      if (!best) return null;
      result = best.result;
      container = best.containerSpec;
      meta.autoChosen = true;
    } else {
      container = getContainer(state.containerId);
      if (!container) return null;
      result = pack(state.cargoTypes, container, { allowMultiContainer: true, maxContainers: 20 });
    }
    enrichResult(result, container);
    const t1 = performance.now();
    console.log(`Pack took ${(t1 - t0).toFixed(1)}ms`);

    meta.title = state.planTitle;
    lastResult = result;
    lastContainerSpec = container;
    lastMeta = meta;
    renderResult(result, container);
    // Sync per-cargo visibility (eye toggles) with the fresh scene
    for (const c of state.cargoTypes) {
      setCargoVisibility(c.id, c.visible !== false);
    }
    ui.renderStats(result, container, meta);
    resetSequenceBar();
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
  ui.on('visibilityToggle', ({ cargoId, visible }) => {
    setCargoVisibility(cargoId, visible);
  });

  onBoxClick((placement) => ui.showDetails(placement));

  document.getElementById('demoBtn')?.addEventListener('click', () => {
    if (!confirm(t('confirmDemo'))) return;
    loadDemo();
    location.reload();
  });

  // ===== Loading sequence playback =====
  const seqBar = document.getElementById('seqBar');
  const seqSlider = document.getElementById('seqSlider');
  const seqLabel = document.getElementById('seqLabel');
  const seqPlayBtn = document.getElementById('seqPlayBtn');

  function stopPlayback() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    if (seqPlayBtn) seqPlayBtn.textContent = '▶';
  }

  function updateSeqLabel() {
    const total = getTotalSteps();
    const v = parseInt(seqSlider.value);
    seqLabel.textContent = v >= total
      ? `${t('seqStep')}: ${t('seqAll')} (${total})`
      : `${t('seqStep')}: ${v} / ${total}`;
  }

  function resetSequenceBar() {
    stopPlayback();
    const total = getTotalSteps();
    if (!seqBar) return;
    if (total === 0) {
      seqBar.style.display = 'none';
      return;
    }
    seqBar.style.display = 'flex';
    seqSlider.max = total;
    seqSlider.value = total;
    setStepLimit(null);
    updateSeqLabel();
  }

  seqSlider?.addEventListener('input', () => {
    stopPlayback();
    const total = getTotalSteps();
    const v = parseInt(seqSlider.value);
    setStepLimit(v >= total ? null : v);
    updateSeqLabel();
  });

  seqPlayBtn?.addEventListener('click', () => {
    if (playTimer) { stopPlayback(); return; }
    const total = getTotalSteps();
    if (total === 0) return;
    let v = parseInt(seqSlider.value);
    if (v >= total) v = 0;
    seqPlayBtn.textContent = '⏸';
    playTimer = setInterval(() => {
      v++;
      seqSlider.value = v;
      setStepLimit(v >= total ? null : v);
      updateSeqLabel();
      if (v >= total) stopPlayback();
    }, 120);
  });

  // ===== Exports =====
  function ensureResult() {
    if (!lastResult) runPack();
    return lastResult;
  }

  document.getElementById('exportTxtBtn')?.addEventListener('click', () => {
    if (ensureResult()) exportTXT(lastResult, lastContainerSpec, lastMeta);
  });
  document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
    if (ensureResult()) exportCSV(lastResult, lastContainerSpec, lastMeta);
  });
  document.getElementById('exportPdfBtn')?.addEventListener('click', () => {
    if (ensureResult()) {
      exportPDF(lastResult, lastContainerSpec, { ...lastMeta, snapshotDataUrl: captureImage() });
    }
  });
  document.getElementById('exportPngBtn')?.addEventListener('click', () => {
    if (!ensureResult()) return;
    const a = document.createElement('a');
    a.href = captureImage();
    a.download = `loading-plan-${Date.now()}.png`;
    a.click();
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
  });

  document.addEventListener('langchange', () => {
    ui.renderAll();
    if (lastResult) ui.renderStats(lastResult, lastContainerSpec, lastMeta);
    if (seqBar?.style.display !== 'none') updateSeqLabel();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
