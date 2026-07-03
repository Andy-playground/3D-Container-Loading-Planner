// Application orchestration — wires UI ↔ packer ↔ scene
// NOTE: keep these imports query-free — mixing `?v=` and plain specifiers
// creates duplicate module instances (separate i18n state). Cache-busting
// is handled by the `?v=` on the entry <script> tag in index.html only.
import {
  initScene, renderResult, setOpacity, setLabelsVisible, setCOGVisible,
  onBoxClick, onBoxHover, setCargoVisibility, setStepLimit, playStep,
  getTotalSteps, captureImage,
} from './scene.js';
import * as ui from './ui.js';
import { pack, packAuto } from './packer.js';
import { getContainer, getAllContainers } from './containers.js';
import { getDemoData } from './demo.js';
import { enrichResult } from './analytics.js';
import { exportTXT, exportCSV, exportPDF } from './exporters.js';
import { initLang, toggleLang, t } from './i18n.js';
import { toast, confirmDialog } from './toast.js';

let lastResult = null;
let lastContainerSpec = null;
let lastMeta = {};
let playTimer = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
    if (!runPack()) toast(t('addAtLeastOne'), 'error');
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

  // Hover tooltip on 3D boxes
  const tooltip = document.getElementById('sceneTooltip');
  onBoxHover((p, clientX, clientY) => {
    if (!tooltip) return;
    if (!p) { tooltip.style.display = 'none'; return; }
    tooltip.innerHTML = `
      <div class="tt-name">${escapeHtml(p.name)}</div>
      <div class="tt-meta">${t('loadSeqCol')} #${p.loadSeq ?? '—'} · ${p.weightKg ?? 0} kg</div>
      <div class="tt-meta">${p.L}×${p.W}×${p.H} cm</div>`;
    const wrap = document.getElementById('canvasWrap').getBoundingClientRect();
    tooltip.style.display = 'block';
    const x = Math.min(clientX - wrap.left + 14, wrap.width - tooltip.offsetWidth - 8);
    const y = Math.min(clientY - wrap.top + 14, wrap.height - tooltip.offsetHeight - 8);
    tooltip.style.left = `${Math.max(0, x)}px`;
    tooltip.style.top = `${Math.max(0, y)}px`;
  });

  document.getElementById('demoBtn')?.addEventListener('click', async () => {
    if (!(await confirmDialog(t('confirmDemo'), { okLabel: t('ok'), cancelLabel: t('cancel') }))) return;
    ui.applyImportedData(getDemoData());
    runPack();
    toast(t('demoLoaded'), 'success');
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

  const seqSpeed = document.getElementById('seqSpeed');
  const BASE_STEP_MS = 300;

  function startPlayback() {
    const total = getTotalSteps();
    if (total === 0) return;
    let v = parseInt(seqSlider.value);
    if (v >= total) v = 0;
    seqPlayBtn.textContent = '⏸';
    const speed = parseFloat(seqSpeed?.value) || 1;
    const stepMs = BASE_STEP_MS / speed;
    playTimer = setInterval(() => {
      v++;
      seqSlider.value = v;
      playStep(v, stepMs * 0.9); // slide-in animation per revealed box
      updateSeqLabel();
      if (v >= total) stopPlayback();
    }, stepMs);
  }

  seqPlayBtn?.addEventListener('click', () => {
    if (playTimer) { stopPlayback(); return; }
    startPlayback();
  });

  seqSpeed?.addEventListener('change', () => {
    if (playTimer) { // re-pace mid-playback
      clearInterval(playTimer);
      playTimer = null;
      startPlayback();
    }
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
      exportPDF(lastResult, lastContainerSpec, {
        ...lastMeta,
        snapshotDataUrl: captureImage(),
        cargoTypes: ui.getState().cargoTypes,
      });
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
