// UI: form, cargo list, localStorage, JSON/CSV import/export — per SDD §9, §10
import {
  getAllContainers, getContainer, getCustomContainers,
  addCustomContainer, removeCustomContainer,
} from './containers.js';
import { t } from './i18n.js';

const STORAGE_KEY = 'clp:current';

export const AUTO_CONTAINER_ID = '__AUTO__';

const state = {
  containerId: 'OCEAN_40HQ',
  cargoTypes: [],
  nextCargoId: 1,
  planTitle: '',
};

let editingId = null; // cargo id currently loaded in the form for editing

// Common cargo/pallet size presets (cm / kg)
const PRESETS = [
  { key: 'eur1', name: 'EUR Pallet (EPAL 1)', length: 120, width: 80, height: 144, weightKg: 300 },
  { key: 'eur2', name: 'EUR Pallet (EPAL 2)', length: 120, width: 100, height: 144, weightKg: 350 },
  { key: 'us48', name: 'US Pallet 48×40"', length: 121.9, width: 101.6, height: 150, weightKg: 350 },
  { key: 'carton_s', name: 'Carton S 40×30×30', length: 40, width: 30, height: 30, weightKg: 5 },
  { key: 'carton_m', name: 'Carton M 60×40×40', length: 60, width: 40, height: 40, weightKg: 10 },
  { key: 'carton_l', name: 'Carton L 80×60×60', length: 80, width: 60, height: 60, weightKg: 20 },
  { key: 'drum', name: 'Drum 200L 60×60×90', length: 60, width: 60, height: 90, weightKg: 200 },
];

const listeners = {
  changed: [],
  pack: [],
  containerChanged: [],
  labelsToggle: [],
  cogToggle: [],
  visibilityToggle: [],
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

/** Cargo ids currently toggled hidden (visual only — packing is unaffected). */
export function getHiddenCargoIds() {
  return state.cargoTypes.filter((c) => c.visible === false).map((c) => c.id);
}

export function init() {
  bindContainerSelect();
  bindCustomContainerForm();
  bindPresets();
  bindCargoForm();
  bindCsvImport();
  bindActions();
  loadFromStorage();
  renderAll();
}

// ===== Container selection =====
function rebuildContainerSelect() {
  const sel = document.getElementById('containerSelect');
  sel.innerHTML = '';

  const autoOpt = document.createElement('option');
  autoOpt.value = AUTO_CONTAINER_ID;
  autoOpt.textContent = t('autoContainer');
  sel.appendChild(autoOpt);

  const groups = [
    ['ocean', 'Ocean'],
    ['truck', 'Truck'],
    ['rail', 'Rail'],
    ['custom', t('customContainer')],
  ];
  const all = getAllContainers();
  for (const [mode, label] of groups) {
    const items = all.filter((c) => c.mode === mode);
    if (!items.length) continue;
    const og = document.createElement('optgroup');
    og.label = label;
    for (const c of items) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
  sel.value = state.containerId;
  if (sel.value !== state.containerId) {
    // selected container no longer exists (e.g. custom deleted)
    state.containerId = 'OCEAN_40HQ';
    sel.value = state.containerId;
  }
}

function bindContainerSelect() {
  rebuildContainerSelect();
  const sel = document.getElementById('containerSelect');
  sel.addEventListener('change', () => {
    state.containerId = sel.value;
    renderContainerInfo();
    saveToStorage();
    emit('changed');
    emit('containerChanged');
  });
}

function bindCustomContainerForm() {
  const toggle = document.getElementById('customContainerToggle');
  const form = document.getElementById('customContainerForm');
  toggle?.addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('ccSaveBtn')?.addEventListener('click', () => {
    const label = document.getElementById('ccName').value.trim() || `Custom ${getCustomContainers().length + 1}`;
    const length = parseFloat(document.getElementById('ccL').value);
    const width = parseFloat(document.getElementById('ccW').value);
    const height = parseFloat(document.getElementById('ccH').value);
    const payloadKg = parseFloat(document.getElementById('ccPayload').value);
    if (![length, width, height, payloadKg].every((v) => isFinite(v) && v > 0)) {
      alert(t('invalidContainerInput'));
      return;
    }
    const c = addCustomContainer({ label, length, width, height, payloadKg });
    state.containerId = c.id;
    rebuildContainerSelect();
    renderContainerInfo();
    form.style.display = 'none';
    saveToStorage();
    emit('changed');
    emit('containerChanged');
  });
  document.getElementById('ccDeleteBtn')?.addEventListener('click', () => {
    const c = getContainer(state.containerId);
    if (!c || c.mode !== 'custom') return;
    if (!confirm(t('confirmDeleteContainer'))) return;
    removeCustomContainer(c.id);
    state.containerId = 'OCEAN_40HQ';
    rebuildContainerSelect();
    renderContainerInfo();
    saveToStorage();
    emit('changed');
    emit('containerChanged');
  });
}

// ===== Presets =====
function bindPresets() {
  const sel = document.getElementById('cargoPreset');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const p = PRESETS.find((x) => x.key === sel.value);
    if (!p) return;
    document.getElementById('cargoName').value = p.name;
    document.getElementById('cargoL').value = p.length;
    document.getElementById('cargoW').value = p.width;
    document.getElementById('cargoH').value = p.height;
    document.getElementById('cargoWeight').value = p.weightKg;
    sel.value = '';
  });
}

function renderPresets() {
  const sel = document.getElementById('cargoPreset');
  if (!sel) return;
  sel.innerHTML = '';
  const def = document.createElement('option');
  def.value = '';
  def.textContent = t('presetPick');
  sel.appendChild(def);
  for (const p of PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.key;
    opt.textContent = `${p.name} · ${p.length}×${p.width}×${p.height}cm`;
    sel.appendChild(opt);
  }
}

// ===== Cargo form =====
// Parse a numeric field where 0 is a meaningful value (so `|| default`
// would silently discard it) — fall back only on blank/invalid input.
function numOr(value, fallback) {
  const v = parseFloat(value);
  return isFinite(v) ? v : fallback;
}

function sanitizeColor(c, fallback = '#3498db') {
  return /^#[0-9a-fA-F]{6}$/.test(String(c ?? '')) ? c : fallback;
}

function readCargoForm() {
  const name = document.getElementById('cargoName').value.trim() || `${t('name')} ${state.cargoTypes.length + 1}`;
  const length = parseFloat(document.getElementById('cargoL').value);
  const width = parseFloat(document.getElementById('cargoW').value);
  const height = parseFloat(document.getElementById('cargoH').value);
  const weightKg = Math.max(0, numOr(document.getElementById('cargoWeight').value, 0));
  const quantity = parseInt(document.getElementById('cargoQty').value);
  const color = sanitizeColor(document.getElementById('cargoColor').value);
  const maxStackLayers = Math.max(1, Math.round(numOr(document.getElementById('cargoMaxLayers').value, 99)));
  const maxLoadOnTopKg = Math.max(0, numOr(document.getElementById('cargoMaxLoadTop').value, Infinity));
  const supportRatioMin = Math.min(1, Math.max(0, numOr(document.getElementById('cargoSupportRatio').value, 80) / 100));
  const allowYaw = document.getElementById('cargoYaw').checked;
  const allowPitch = document.getElementById('cargoPitch').checked;
  const allowRoll = document.getElementById('cargoRoll').checked;
  const thisSideUp = document.getElementById('cargoThisSideUp').checked;
  const groupSameSku = document.getElementById('cargoGroupSku')?.checked ?? false;
  const priority = document.getElementById('cargoPriority').value;

  if (!isFinite(length) || !isFinite(width) || !isFinite(height) || !isFinite(quantity) ||
      length <= 0 || width <= 0 || height <= 0 || quantity <= 0) {
    alert(t('inputValidPositive'));
    return null;
  }

  return {
    name, length, width, height, weightKg, quantity, color,
    rotatable: { yaw: allowYaw, pitch: allowPitch, roll: allowRoll },
    thisSideUp,
    maxStackLayers, maxLoadOnTopKg, supportRatioMin,
    groupSameSku,
    priority,
  };
}

function fillCargoForm(c) {
  document.getElementById('cargoName').value = c.name;
  document.getElementById('cargoL').value = c.length;
  document.getElementById('cargoW').value = c.width;
  document.getElementById('cargoH').value = c.height;
  document.getElementById('cargoWeight').value = c.weightKg;
  document.getElementById('cargoQty').value = c.quantity;
  document.getElementById('cargoColor').value = c.color;
  document.getElementById('cargoMaxLayers').value = c.maxStackLayers === 99 ? 99 : c.maxStackLayers;
  document.getElementById('cargoMaxLoadTop').value = c.maxLoadOnTopKg === Infinity ? '' : c.maxLoadOnTopKg;
  document.getElementById('cargoSupportRatio').value = Math.round((c.supportRatioMin ?? 0.8) * 100);
  document.getElementById('cargoYaw').checked = !!c.rotatable?.yaw;
  document.getElementById('cargoPitch').checked = !!c.rotatable?.pitch;
  document.getElementById('cargoRoll').checked = !!c.rotatable?.roll;
  document.getElementById('cargoThisSideUp').checked = !!c.thisSideUp;
  const gs = document.getElementById('cargoGroupSku');
  if (gs) gs.checked = !!c.groupSameSku;
  document.getElementById('cargoPriority').value = c.priority ?? 'normal';
}

function setEditMode(id) {
  editingId = id;
  const addBtn = document.getElementById('addCargoBtn');
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (id) {
    addBtn.textContent = t('updateCargo');
    addBtn.classList.add('editing');
    cancelBtn.style.display = 'block';
  } else {
    addBtn.textContent = t('addCargo');
    addBtn.classList.remove('editing');
    cancelBtn.style.display = 'none';
  }
}

function bindCargoForm() {
  document.getElementById('addCargoBtn').addEventListener('click', () => {
    const data = readCargoForm();
    if (!data) return;

    if (editingId) {
      const idx = state.cargoTypes.findIndex((c) => c.id === editingId);
      if (idx >= 0) {
        state.cargoTypes[idx] = { ...state.cargoTypes[idx], ...data };
      }
      setEditMode(null);
    } else {
      state.cargoTypes.push({ id: `C${state.nextCargoId++}`, visible: true, ...data });
      document.getElementById('cargoName').value = `${t('name')} ${String.fromCharCode(64 + Math.min(state.cargoTypes.length + 1, 26))}`;
    }

    renderCargoList();
    saveToStorage();
    emit('changed', { cargo: true });
  });

  document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
    setEditMode(null);
  });
}

// ===== CSV import / template =====
function bindCsvImport() {
  document.getElementById('importCsvBtn')?.addEventListener('click', () => {
    document.getElementById('importCsvFile').click();
  });
  document.getElementById('importCsvFile')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const added = importCargoCSV(evt.target.result);
        renderCargoList();
        saveToStorage();
        emit('changed', { cargo: true });
        alert(`${t('csvImportedPrefix')}${added}`);
      } catch (err) {
        alert(t('csvError') + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  document.getElementById('csvTemplateBtn')?.addEventListener('click', downloadCsvTemplate);
}

const CSV_COLUMNS = ['name', 'length_cm', 'width_cm', 'height_cm', 'weight_kg', 'quantity', 'color', 'max_stack_layers', 'max_load_on_top_kg', 'this_side_up', 'priority'];

function downloadCsvTemplate() {
  const rows = [
    CSV_COLUMNS.join(','),
    'Cargo A,100,80,60,10,20,#3498db,99,500,1,normal',
    'Cargo B,120,100,90,25,8,#e74c3c,3,200,1,urgent',
    'Fragile C,60,40,40,5,30,#2ecc71,1,0,1,lifo',
  ];
  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cargo-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function importCargoCSV(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('empty CSV');
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s-]+/g, '_'));
  const col = (row, name) => {
    const i = header.indexOf(name);
    return i >= 0 ? row[i] : undefined;
  };
  const palette = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
  let added = 0;
  for (let li = 1; li < lines.length; li++) {
    const row = parseCsvLine(lines[li]);
    const length = parseFloat(col(row, 'length_cm') ?? col(row, 'length'));
    const width = parseFloat(col(row, 'width_cm') ?? col(row, 'width'));
    const height = parseFloat(col(row, 'height_cm') ?? col(row, 'height'));
    const quantity = parseInt(col(row, 'quantity') ?? '1');
    if (![length, width, height].every((v) => isFinite(v) && v > 0) || !isFinite(quantity) || quantity <= 0) {
      throw new Error(`row ${li + 1}`);
    }
    const tsu = (col(row, 'this_side_up') ?? '1').toLowerCase();
    state.cargoTypes.push({
      id: `C${state.nextCargoId++}`,
      name: col(row, 'name') || `Cargo ${state.nextCargoId}`,
      length, width, height,
      weightKg: parseFloat(col(row, 'weight_kg') ?? col(row, 'weight')) || 0,
      quantity,
      color: sanitizeColor(col(row, 'color'), palette[(state.nextCargoId - 1) % palette.length]),
      rotatable: { yaw: true, pitch: false, roll: false },
      thisSideUp: !(tsu === '0' || tsu === 'false' || tsu === 'no'),
      maxStackLayers: parseInt(col(row, 'max_stack_layers')) || 99,
      maxLoadOnTopKg: (() => {
        const v = parseFloat(col(row, 'max_load_on_top_kg'));
        return isFinite(v) ? v : Infinity;
      })(),
      supportRatioMin: 0.8,
      groupSameSku: false,
      priority: ['normal', 'urgent', 'lifo'].includes((col(row, 'priority') ?? '').toLowerCase())
        ? col(row, 'priority').toLowerCase() : 'normal',
      visible: true,
    });
    added++;
  }
  return added;
}

// ===== Top bar actions =====
function bindActions() {
  document.getElementById('packBtn').addEventListener('click', () => emit('pack'));
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (state.cargoTypes.length && !confirm(t('confirmClear'))) return;
    state.cargoTypes = [];
    setEditMode(null);
    renderCargoList();
    saveToStorage();
    emit('changed', { cargo: true });
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
  document.getElementById('planTitle')?.addEventListener('input', (e) => {
    state.planTitle = e.target.value;
    saveToStorage();
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
    <div class="d-row"><span>${t('loadSeqCol')}</span>#${p.loadSeq ?? '—'}</div>
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
  rebuildContainerSelect();
  renderContainerInfo();
  renderPresets();
  renderCargoList();
  setEditMode(editingId);
  const titleInput = document.getElementById('planTitle');
  if (titleInput) {
    titleInput.value = state.planTitle;
    titleInput.placeholder = t('planTitlePlaceholder');
  }
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
  const info = document.getElementById('containerInfo');
  const delBtn = document.getElementById('ccDeleteBtn');
  if (state.containerId === AUTO_CONTAINER_ID) {
    info.innerHTML = `<div>${t('autoContainer')}</div>`;
    if (delBtn) delBtn.style.display = 'none';
    return;
  }
  const c = getContainer(state.containerId);
  if (c) {
    info.innerHTML = `
      <div>${c.internal.length} × ${c.internal.width} × ${c.internal.height} cm</div>
      <div>≤ ${c.payloadKg.toLocaleString()} kg</div>
    `;
  }
  if (delBtn) delBtn.style.display = c?.mode === 'custom' ? 'block' : 'none';
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
    const hidden = c.visible === false;
    const row = document.createElement('div');
    row.className = 'cargo-row' + (hidden ? ' hidden-cargo' : '');
    row.innerHTML = `
      <div class="swatch" style="background:${c.color}"></div>
      <div class="cargo-info">
        <div class="cargo-name">${escapeHtml(c.name)} <span class="qty">×${c.quantity}</span> ${priorityBadge}</div>
        <div class="cargo-meta">${c.length}×${c.width}×${c.height}cm · ${c.weightKg}kg</div>
        <div class="cargo-meta">≤${c.maxStackLayers === 99 ? '∞' : c.maxStackLayers} · top≤${c.maxLoadOnTopKg === Infinity ? '∞' : c.maxLoadOnTopKg}kg · ${rotAxes.join('') || '—'}${c.thisSideUp ? ' ·↑' : ''}${c.groupSameSku ? ' ·▦' : ''}</div>
      </div>
      <div class="row-actions">
        <button class="icon-btn eye-btn" data-id="${c.id}" title="${t('hideTitle')}">${hidden ? '🙈' : '👁'}</button>
        <button class="icon-btn edit-btn" data-id="${c.id}" title="${t('editTitle')}">✎</button>
        <button class="icon-btn dup-btn" data-id="${c.id}" title="${t('duplicateTitle')}">⧉</button>
        <button class="remove-btn" data-id="${c.id}">✕</button>
      </div>
    `;
    listEl.appendChild(row);
  }
  listEl.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.cargoTypes = state.cargoTypes.filter((c) => c.id !== btn.dataset.id);
      if (editingId === btn.dataset.id) setEditMode(null);
      renderCargoList();
      saveToStorage();
      emit('changed', { cargo: true });
    });
  });
  listEl.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = state.cargoTypes.find((x) => x.id === btn.dataset.id);
      if (!c) return;
      fillCargoForm(c);
      setEditMode(c.id);
      document.getElementById('cargoName').focus();
    });
  });
  listEl.querySelectorAll('.dup-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = state.cargoTypes.find((x) => x.id === btn.dataset.id);
      if (!c) return;
      const copy = { ...c, rotatable: { ...c.rotatable }, id: `C${state.nextCargoId++}`, name: `${c.name} (copy)` };
      const idx = state.cargoTypes.indexOf(c);
      state.cargoTypes.splice(idx + 1, 0, copy);
      renderCargoList();
      saveToStorage();
      emit('changed', { cargo: true });
    });
  });
  listEl.querySelectorAll('.eye-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = state.cargoTypes.find((x) => x.id === btn.dataset.id);
      if (!c) return;
      c.visible = c.visible === false;
      renderCargoList();
      saveToStorage();
      emit('visibilityToggle', { cargoId: c.id, visible: c.visible !== false });
    });
  });
}

const REASON_KEYS = { oversize: 'reasonOversize', overweight: 'reasonOverweight', nospace: 'reasonNospace' };

export function renderStats(result, containerSpec, meta = {}) {
  const el = document.getElementById('stats');
  const containers = result.containers ?? [];
  const totalPlaced = containers.reduce((s, ct) => s + ct.placements.length, 0);
  const totalRequested = state.cargoTypes.reduce((s, c) => s + c.quantity, 0);
  const totalUnplaced = result.unplaced.reduce((s, u) => s + u.count, 0);

  let html = `<div><strong>${t('placedLabel')}</strong>: ${totalPlaced} / ${totalRequested}</div>`;
  if (totalUnplaced > 0) {
    const reasons = result.unplaced.map((u) => {
      const parts = Object.entries(u.reasons ?? {})
        .map(([r, n]) => `${t(REASON_KEYS[r] ?? r)}×${n}`).join('、');
      return `${escapeHtml(u.name ?? u.cargoId)}: ${u.count}${parts ? ` (${parts})` : ''}`;
    }).join(' · ');
    html += `<div class="warn"><strong>${t('unplacedLabel')}</strong>: ${totalUnplaced} — ${reasons}</div>`;
  }
  let containerLabel = `${containers.length}`;
  if (meta.autoChosen && containerSpec) {
    containerLabel += ` × ${escapeHtml(containerSpec.label)} (${t('autoChosen')})`;
  }
  html += `<div><strong>${t('containersNeeded')}</strong>: ${containerLabel}</div>`;
  for (let i = 0; i < containers.length; i++) {
    const ct = containers[i];
    let line = `${t('container')} ${i + 1}: ${ct.placements.length} · ${t('volume')} ${(ct.stats.volumeUtilization * 100).toFixed(1)}% · ${ct.stats.usedWeightKg.toFixed(0)}/${ct.stats.payloadKg}kg`;
    if (ct.cog) {
      line += ` · ${t('cog')} (${ct.cog.x.toFixed(0)}, ${ct.cog.y.toFixed(0)}, ${ct.cog.z.toFixed(0)})`;
    }
    html += `<div class="container-stat">${line}</div>`;
    if (ct.lateral && !ct.lateral.ok) {
      html += `<div class="container-stat warn">↳ ${t('lateralWarn')} (${t('lateralOffset')} ${ct.lateral.offsetCm.toFixed(0)}cm)</div>`;
    }
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
    const data = {
      containerId: state.containerId,
      cargoTypes: state.cargoTypes,
      nextCargoId: state.nextCargoId,
      planTitle: state.planTitle,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('localStorage save failed', e);
  }
}

/** Returns a sane cargo object, or null if dims/quantity are unusable. */
function normalizeCargo(c) {
  const length = parseFloat(c?.length);
  const width = parseFloat(c?.width);
  const height = parseFloat(c?.height);
  const quantity = parseInt(c?.quantity);
  if (![length, width, height].every((v) => isFinite(v) && v > 0) || !isFinite(quantity) || quantity <= 0) {
    return null;
  }
  return {
    ...c,
    name: String(c.name ?? 'Cargo'),
    length, width, height, quantity,
    weightKg: Math.max(0, numOr(c.weightKg, 0)),
    color: sanitizeColor(c.color),
    rotatable: c.rotatable ?? { yaw: true, pitch: false, roll: false },
    thisSideUp: c.thisSideUp ?? true,
    maxStackLayers: Math.max(1, Math.round(numOr(c.maxStackLayers, 99))),
    maxLoadOnTopKg: Math.max(0, numOr(c.maxLoadOnTopKg, Infinity)),
    supportRatioMin: Math.min(1, Math.max(0, numOr(c.supportRatioMin, 0.8))),
    groupSameSku: c.groupSameSku ?? false,
    priority: ['normal', 'urgent', 'lifo'].includes(c.priority) ? c.priority : 'normal',
    visible: c.visible !== false,
  };
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.containerId) state.containerId = data.containerId;
    if (Array.isArray(data.cargoTypes)) {
      state.cargoTypes = data.cargoTypes.map(normalizeCargo).filter(Boolean);
    }
    if (data.nextCargoId) state.nextCargoId = data.nextCargoId;
    if (typeof data.planTitle === 'string') state.planTitle = data.planTitle;
    rebuildContainerSelect();
  } catch (e) {
    console.warn('localStorage load failed', e);
  }
}

// ===== JSON I/O =====
function exportJSON() {
  const data = {
    metadata: {
      createdAt: new Date().toISOString(),
      version: '3.0',
      title: state.planTitle || t('planTitlePlaceholder'),
    },
    containerId: state.containerId,
    customContainers: getCustomContainers(),
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
      if (Array.isArray(data.customContainers)) {
        for (const cc of data.customContainers) {
          if (cc?.internal && !getContainer(cc.id)) {
            addCustomContainer({
              id: cc.id,
              label: cc.label,
              length: cc.internal.length,
              width: cc.internal.width,
              height: cc.internal.height,
              payloadKg: cc.payloadKg,
            });
          }
        }
      }
      if (data.containerId) state.containerId = data.containerId;
      if (Array.isArray(data.cargoTypes)) state.cargoTypes = data.cargoTypes.map(normalizeCargo).filter(Boolean);
      if (typeof data.metadata?.title === 'string') state.planTitle = data.metadata.title;
      renderAll();
      saveToStorage();
      emit('changed', { cargo: true });
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
