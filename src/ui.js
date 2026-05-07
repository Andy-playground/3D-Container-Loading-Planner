// UI: form, cargo list, localStorage, JSON import/export — per SDD §9, §10
import { CONTAINERS, getContainer } from './containers.js';
import { t } from './i18n.js';

const STORAGE_KEY = 'clp:current';

const state = {
  containerId: 'OCEAN_40HQ',
  cargoTypes: [],
  nextCargoId: 1,
};

const listeners = {
  changed: [],
  pack: [],
  containerChanged: [],
  labelsToggle: [],
  cogToggle: [],
};

export function on(event, fn) {
  listeners[event]?.push(fn);
}
function emit(event, payload) {
  listeners[event]?.forEach((fn) => fn(payload));
}

export function getState() {
  return { ...state, cargoTypes: state.cargoTypes.map((c) => ({ ...c })) };
}

export function init() {
  bindContainerSelect();
  bindCargoForm();
  bindActions();
  loadFromStorage();
  renderAll();
}

function bindContainerSelect() {
  const sel = document.getElementById('containerSelect');
  for (const c of CONTAINERS) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `[${c.mode.toUpperCase()}] ${c.label}`;
    sel.appendChild(opt);
  }
  sel.value = state.containerId;
  sel.addEventListener('change', () => {
    state.containerId = sel.value;
    renderContainerInfo();
    saveToStorage();
    emit('changed');
    emit('containerChanged');
  });
}

function bindCargoForm() {
  document.getElementById('addCargoBtn').addEventListener('click', () => {
    const name = document.getElementById('cargoName').value.trim() || `${t('name')} ${state.cargoTypes.length + 1}`;
    const length = parseFloat(document.getElementById('cargoL').value);
    const width = parseFloat(document.getElementById('cargoW').value);
    const height = parseFloat(document.getElementById('cargoH').value);
    const weightKg = parseFloat(document.getElementById('cargoWeight').value) || 0;
    const quantity = parseInt(document.getElementById('cargoQty').value);
    const color = document.getElementById('cargoColor').value;
    const maxStackLayers = parseInt(document.getElementById('cargoMaxLayers').value) || 99;
    const maxLoadOnTopKg = parseFloat(document.getElementById('cargoMaxLoadTop').value) || Infinity;
    const supportRatioMin = (parseFloat(document.getElementById('cargoSupportRatio').value) || 80) / 100;
    const allowYaw = document.getElementById('cargoYaw').checked;
    const allowPitch = document.getElementById('cargoPitch').checked;
    const allowRoll = document.getElementById('cargoRoll').checked;
    const thisSideUp = document.getElementById('cargoThisSideUp').checked;
    const priority = document.getElementById('cargoPriority').value;

    if (!isFinite(length) || !isFinite(width) || !isFinite(height) || !isFinite(quantity) ||
        length <= 0 || width <= 0 || height <= 0 || quantity <= 0) {
      alert(t('inputValidPositive'));
      return;
    }

    state.cargoTypes.push({
      id: `C${state.nextCargoId++}`,
      name, length, width, height, weightKg, quantity, color,
      rotatable: { yaw: allowYaw, pitch: allowPitch, roll: allowRoll },
      thisSideUp,
      maxStackLayers, maxLoadOnTopKg, supportRatioMin,
      priority,
    });

    document.getElementById('cargoName').value = `${t('name')} ${String.fromCharCode(64 + Math.min(state.cargoTypes.length + 1, 26))}`;
    renderCargoList();
    saveToStorage();
    emit('changed');
  });
}

function bindActions() {
  document.getElementById('packBtn').addEventListener('click', () => emit('pack'));
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (state.cargoTypes.length && !confirm(t('confirmClear'))) return;
    state.cargoTypes = [];
    renderCargoList();
    saveToStorage();
    emit('changed');
  });
  document.getElementById('exportBtn').addEventListener('click', exportJSON);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importJSON);
  document.getElementById('opacitySlider').addEventListener('input', (e) => {
    emit('changed', { opacity: e.target.value / 100 });
  });
  document.getElementById('labelsToggle').addEventListener('change', (e) => {
    emit('labelsToggle', e.target.checked);
  });
  document.getElementById('cogToggle')?.addEventListener('change', (e) => {
    emit('cogToggle', e.target.checked);
  });
  document.getElementById('detailsClose')?.addEventListener('click', () => {
    hideDetails();
  });
}

export function showDetails(p) {
  const panel = document.getElementById('detailsPanel');
  if (!panel) return;
  if (!p) { panel.style.display = 'none'; return; }
  const rotLabel = (p.yaw || p.pitch || p.roll)
    ? `yaw=${p.yaw}° pitch=${p.pitch}° roll=${p.roll}°`
    : '—';
  document.getElementById('detailsBody').innerHTML = `
    <div class="d-row"><span>${t('name')}</span><strong>${escapeHtml(p.name)}</strong></div>
    <div class="d-row"><span>${t('container')}</span>${p.containerNum}</div>
    <div class="d-row"><span>${t('pos')}</span>X=${p.x.toFixed(0)} · Y=${p.y.toFixed(0)} · Z=${p.z.toFixed(0)} cm</div>
    <div class="d-row"><span>${t('actualDims')}</span>${p.L}×${p.W}×${p.H} cm</div>
    <div class="d-row"><span>${t('orientation')}</span>${rotLabel}</div>
    <div class="d-row"><span>${t('weight')}</span>${p.weightKg ?? 0} kg</div>
    <div class="d-row"><span>${t('topLoadLimit')}</span>${p.maxLoadOnTopKg === Infinity || p.maxLoadOnTopKg == null ? '∞' : p.maxLoadOnTopKg + ' kg'}</div>
    <div class="d-row"><span>${t('constraints')}</span>${p.thisSideUp ? '↑' : ''} ${p.nonStackable ? '⊘' : ''}</div>
  `;
  panel.style.display = 'block';
}

function hideDetails() {
  const panel = document.getElementById('detailsPanel');
  if (panel) panel.style.display = 'none';
}

export function renderAll() {
  renderContainerInfo();
  renderCargoList();
  // Re-render priority dropdown options text (i18n)
  const pri = document.getElementById('cargoPriority');
  if (pri) {
    const map = { normal: 'priorityNormal', urgent: 'priorityUrgent', lifo: 'priorityLifo' };
    for (const opt of pri.options) {
      const k = map[opt.value];
      if (k) opt.textContent = t(k);
    }
  }
}

function renderContainerInfo() {
  const c = getContainer(state.containerId);
  const info = document.getElementById('containerInfo');
  if (c) {
    info.innerHTML = `
      <div>${c.internal.length} × ${c.internal.width} × ${c.internal.height} cm</div>
      <div>≤ ${c.payloadKg.toLocaleString()} kg</div>
    `;
  }
}

function renderCargoList() {
  const listEl = document.getElementById('cargoList');
  const empty = document.getElementById('cargoListEmpty');
  listEl.innerHTML = '';
  if (state.cargoTypes.length === 0) {
    empty.style.display = 'block';
    empty.textContent = t('noCargoYet');
    return;
  }
  empty.style.display = 'none';
  for (const c of state.cargoTypes) {
    const rotAxes = [];
    if (c.rotatable?.yaw) rotAxes.push('Y');
    if (c.rotatable?.pitch) rotAxes.push('P');
    if (c.rotatable?.roll) rotAxes.push('R');
    const priorityBadge = c.priority && c.priority !== 'normal'
      ? `<span class="badge ${c.priority}">${c.priority}</span>` : '';
    const row = document.createElement('div');
    row.className = 'cargo-row';
    row.innerHTML = `
      <div class="swatch" style="background:${c.color}"></div>
      <div class="cargo-info">
        <div class="cargo-name">${escapeHtml(c.name)} <span class="qty">×${c.quantity}</span> ${priorityBadge}</div>
        <div class="cargo-meta">${c.length}×${c.width}×${c.height}cm · ${c.weightKg}kg</div>
        <div class="cargo-meta">≤${c.maxStackLayers === 99 ? '∞' : c.maxStackLayers} · top≤${c.maxLoadOnTopKg === Infinity ? '∞' : c.maxLoadOnTopKg}kg · ${rotAxes.join('') || '—'}${c.thisSideUp ? ' ·↑' : ''}</div>
      </div>
      <button class="remove-btn" data-id="${c.id}">✕</button>
    `;
    listEl.appendChild(row);
  }
  listEl.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.cargoTypes = state.cargoTypes.filter((c) => c.id !== btn.dataset.id);
      renderCargoList();
      saveToStorage();
      emit('changed');
    });
  });
}

export function renderStats(result, containerSpec) {
  const el = document.getElementById('stats');
  const containers = result.containers ?? [];
  const totalPlaced = containers.reduce((s, ct) => s + ct.placements.length, 0);
  const totalRequested = state.cargoTypes.reduce((s, c) => s + c.quantity, 0);
  const totalUnplaced = result.unplaced.reduce((s, u) => s + u.count, 0);

  let html = `<div><strong>${t('placedLabel')}</strong>: ${totalPlaced} / ${totalRequested}</div>`;
  if (totalUnplaced > 0) {
    html += `<div class="warn"><strong>${t('unplacedLabel')}</strong>: ${totalUnplaced}</div>`;
  }
  html += `<div><strong>${t('containersNeeded')}</strong>: ${containers.length}</div>`;
  for (let i = 0; i < containers.length; i++) {
    const ct = containers[i];
    let line = `${t('container')} ${i + 1}: ${ct.placements.length} · ${t('volume')} ${(ct.stats.volumeUtilization * 100).toFixed(1)}% · ${ct.stats.usedWeightKg.toFixed(0)}/${ct.stats.payloadKg}kg`;
    if (ct.cog) {
      line += ` · ${t('cog')} (${ct.cog.x.toFixed(0)}, ${ct.cog.y.toFixed(0)}, ${ct.cog.z.toFixed(0)})`;
    }
    html += `<div class="container-stat">${line}</div>`;
    if (ct.axleLoads) {
      const a = ct.axleLoads;
      const cls = a.balanced ? 'ok' : 'warn';
      html += `<div class="container-stat ${cls}">↳ ${t('axleFront')} ${a.frontKg.toFixed(0)}kg (${(a.frontPct * 100).toFixed(0)}%) · ${t('axleRear')} ${a.rearKg.toFixed(0)}kg (${(a.rearPct * 100).toFixed(0)}%) · ${a.balanced ? t('balanced') : t('notBalanced')}</div>`;
    }
  }
  el.innerHTML = html;
}

// ===== Storage =====
function saveToStorage() {
  try {
    const data = { containerId: state.containerId, cargoTypes: state.cargoTypes, nextCargoId: state.nextCargoId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('localStorage save failed', e);
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.containerId) state.containerId = data.containerId;
    if (Array.isArray(data.cargoTypes)) {
      state.cargoTypes = data.cargoTypes.map((c) => ({
        ...c,
        rotatable: c.rotatable ?? { yaw: true, pitch: false, roll: false },
        thisSideUp: c.thisSideUp ?? true,
        maxStackLayers: c.maxStackLayers ?? 99,
        maxLoadOnTopKg: c.maxLoadOnTopKg ?? Infinity,
        supportRatioMin: c.supportRatioMin ?? 0.8,
      }));
    }
    if (data.nextCargoId) state.nextCargoId = data.nextCargoId;
    document.getElementById('containerSelect').value = state.containerId;
  } catch (e) {
    console.warn('localStorage load failed', e);
  }
}

// ===== JSON I/O =====
function exportJSON() {
  const data = {
    metadata: {
      createdAt: new Date().toISOString(),
      version: '2.0',
      title: 'Loading Plan',
    },
    containerId: state.containerId,
    cargoTypes: state.cargoTypes,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `loading-plan-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!confirm(t('confirmOverwrite'))) return;
      if (data.containerId) state.containerId = data.containerId;
      if (Array.isArray(data.cargoTypes)) state.cargoTypes = data.cargoTypes;
      document.getElementById('containerSelect').value = state.containerId;
      renderAll();
      saveToStorage();
      emit('changed');
    } catch (err) {
      alert(t('jsonError') + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
