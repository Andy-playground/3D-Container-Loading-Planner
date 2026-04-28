// UI: form, cargo list, localStorage, JSON import/export — per SDD §9, §10
import { CONTAINERS, getContainer, getLabel } from './containers.js?v=6';
import { t, getLang, setLang, onLangChange, applyDomI18n } from './i18n.js?v=6';

const STORAGE_KEY = 'clp:current';

const state = {
  containerId: 'OCEAN_40HQ',
  cargoTypes: [],
  nextCargoId: 1,
  editingId: null,
};

let lastResult = null;
let lastShownPlacement = null;

const listeners = {
  changed: [],
  pack: [],
  containerChanged: [],
  labelsToggle: [],
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
  bindLanguageSelect();
  applyDomI18n();
  bindContainerSelect();
  bindCargoForm();
  bindActions();
  loadFromStorage();
  renderAll();
  // Re-render dynamic content when language changes
  onLangChange(() => {
    renderAll();
    document.getElementById('addCargoBtn').textContent = state.editingId ? t('btn.saveEdit') : t('btn.addCargo');
    document.getElementById('cancelEditBtn').textContent = t('btn.cancelEdit');
    document.getElementById('cargoListEmpty').textContent = t('cargo.empty');
    if (lastResult) renderStats(lastResult);
    if (lastShownPlacement) showDetails(lastShownPlacement);
  });
}

function bindLanguageSelect() {
  const sel = document.getElementById('langSelect');
  if (!sel) return;
  sel.value = getLang();
  sel.addEventListener('change', () => setLang(sel.value));
}

function bindContainerSelect() {
  const sel = document.getElementById('containerSelect');
  populateContainerOptions(sel);
  sel.value = state.containerId;
  sel.addEventListener('change', () => {
    state.containerId = sel.value;
    renderContainerInfo();
    saveToStorage();
    emit('changed');
    emit('containerChanged');
  });
  // Re-populate options when language changes
  onLangChange(() => {
    const cur = sel.value;
    populateContainerOptions(sel);
    sel.value = cur;
  });
}

function populateContainerOptions(sel) {
  sel.innerHTML = '';
  const lang = getLang();
  for (const c of CONTAINERS) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `[${c.mode.toUpperCase()}] ${getLabel(c, lang)}`;
    sel.appendChild(opt);
  }
}

function bindCargoForm() {
  document.getElementById('addCargoBtn').addEventListener('click', submitCargoForm);
  document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
}

function submitCargoForm() {
  const name = document.getElementById('cargoName').value.trim() || t('cargo.defaultName', { letter: defaultLetter() });
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
    alert(t('alert.invalidInput'));
    return;
  }

  const cargo = {
    name, length, width, height, weightKg, quantity, color,
    rotatable: { yaw: allowYaw, pitch: allowPitch, roll: allowRoll },
    thisSideUp,
    maxStackLayers, maxLoadOnTopKg, supportRatioMin,
    priority,
  };

  if (state.editingId) {
    const idx = state.cargoTypes.findIndex((c) => c.id === state.editingId);
    if (idx >= 0) {
      state.cargoTypes[idx] = { ...state.cargoTypes[idx], ...cargo };
    }
    cancelEdit();
  } else {
    cargo.id = `C${state.nextCargoId++}`;
    state.cargoTypes.push(cargo);
    document.getElementById('cargoName').value = t('cargo.defaultName', { letter: defaultLetter() });
  }

  renderCargoList();
  saveToStorage();
  emit('changed');
}

function defaultLetter() {
  return String.fromCharCode(64 + Math.min(state.cargoTypes.length + 1, 26));
}

function startEdit(id) {
  const c = state.cargoTypes.find((x) => x.id === id);
  if (!c) return;
  state.editingId = id;
  document.getElementById('cargoName').value = c.name;
  document.getElementById('cargoL').value = c.length;
  document.getElementById('cargoW').value = c.width;
  document.getElementById('cargoH').value = c.height;
  document.getElementById('cargoWeight').value = c.weightKg;
  document.getElementById('cargoQty').value = c.quantity;
  document.getElementById('cargoColor').value = c.color;
  document.getElementById('cargoMaxLayers').value = c.maxStackLayers === 99 ? 99 : c.maxStackLayers;
  document.getElementById('cargoMaxLoadTop').value = isFinite(c.maxLoadOnTopKg) ? c.maxLoadOnTopKg : 0;
  document.getElementById('cargoSupportRatio').value = Math.round((c.supportRatioMin ?? 0.8) * 100);
  document.getElementById('cargoYaw').checked = !!c.rotatable?.yaw;
  document.getElementById('cargoPitch').checked = !!c.rotatable?.pitch;
  document.getElementById('cargoRoll').checked = !!c.rotatable?.roll;
  document.getElementById('cargoThisSideUp').checked = !!c.thisSideUp;
  document.getElementById('cargoPriority').value = c.priority || 'normal';
  document.getElementById('addCargoBtn').textContent = t('btn.saveEdit');
  document.getElementById('addCargoBtn').classList.add('editing');
  document.getElementById('cancelEditBtn').style.display = 'inline-block';
  document.getElementById('addCargoSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderCargoList(); // refresh to show "editing" highlight
}

function cancelEdit() {
  state.editingId = null;
  document.getElementById('addCargoBtn').textContent = t('btn.addCargo');
  document.getElementById('addCargoBtn').classList.remove('editing');
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('cargoName').value = t('cargo.defaultName', { letter: defaultLetter() });
  renderCargoList();
}

function bindActions() {
  document.getElementById('packBtn').addEventListener('click', () => emit('pack'));
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (state.cargoTypes.length && !confirm(t('confirm.clear'))) return;
    state.cargoTypes = [];
    cancelEdit();
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
  document.getElementById('detailsClose')?.addEventListener('click', () => {
    hideDetails();
  });
}

export function showDetails(p) {
  const panel = document.getElementById('detailsPanel');
  if (!panel) return;
  if (!p) { lastShownPlacement = null; panel.style.display = 'none'; return; }
  lastShownPlacement = p;
  document.getElementById('detailsTitle').textContent = t('details.title');
  const rotLabel = (p.yaw || p.pitch || p.roll)
    ? `yaw=${p.yaw}° pitch=${p.pitch}° roll=${p.roll}°`
    : t('details.originalOrient');
  const constraints = [
    p.thisSideUp ? t('details.thisSideUp') : '',
    p.nonStackable ? t('details.nonStackable') : '',
  ].filter(Boolean).join(' ') || '—';
  document.getElementById('detailsBody').innerHTML = `
    <div class="d-row"><span>${t('details.name')}</span><strong>${escapeHtml(p.name)}</strong></div>
    <div class="d-row"><span>${t('details.container')}</span>${t('stats.containerN', { n: p.containerNum })}</div>
    <div class="d-row"><span>${t('details.position')}</span>X=${p.x.toFixed(0)} · Y=${p.y.toFixed(0)} · Z=${p.z.toFixed(0)} cm</div>
    <div class="d-row"><span>${t('details.actualDim')}</span>${p.L}×${p.W}×${p.H} cm</div>
    <div class="d-row"><span>${t('details.orientation')}</span>${rotLabel}</div>
    <div class="d-row"><span>${t('details.weight')}</span>${p.weightKg ?? 0} kg</div>
    <div class="d-row"><span>${t('details.maxLoadOnTop')}</span>${p.maxLoadOnTopKg === Infinity || p.maxLoadOnTopKg == null ? '∞' : p.maxLoadOnTopKg + ' kg'}</div>
    <div class="d-row"><span>${t('details.constraints')}</span>${constraints}</div>
  `;
  panel.style.display = 'block';
}

function hideDetails() {
  lastShownPlacement = null;
  const panel = document.getElementById('detailsPanel');
  if (panel) panel.style.display = 'none';
}

export function renderAll() {
  renderContainerInfo();
  renderCargoList();
}

function renderContainerInfo() {
  const c = getContainer(state.containerId);
  const info = document.getElementById('containerInfo');
  if (c) {
    info.innerHTML = `
      <div>${t('container.intDim')}: ${c.internal.length} × ${c.internal.width} × ${c.internal.height} cm</div>
      <div>${t('container.maxPayload')}: ${c.payloadKg.toLocaleString()} kg</div>
    `;
  }
}

function renderCargoList() {
  const listEl = document.getElementById('cargoList');
  const empty = document.getElementById('cargoListEmpty');
  listEl.innerHTML = '';
  empty.textContent = t('cargo.empty');
  if (state.cargoTypes.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  const kgPerBox = t('cargo.kgPerBox');
  const lbLayers = t('cargo.layers');
  const lbTopLoad = t('cargo.topLoad');
  const lbRotation = t('cargo.rotation');
  for (const c of state.cargoTypes) {
    const rotAxes = [];
    if (c.rotatable?.yaw) rotAxes.push('Y');
    if (c.rotatable?.pitch) rotAxes.push('P');
    if (c.rotatable?.roll) rotAxes.push('R');
    const priorityBadge = c.priority && c.priority !== 'normal'
      ? `<span class="badge ${c.priority}">${c.priority}</span>` : '';
    const editingClass = state.editingId === c.id ? ' editing-row' : '';
    const editingLabel = state.editingId === c.id ? `<span class="editing-tag">${t('cargo.editing')}</span>` : '';
    const row = document.createElement('div');
    row.className = 'cargo-row' + editingClass;
    row.innerHTML = `
      <div class="swatch" style="background:${c.color}"></div>
      <div class="cargo-info">
        <div class="cargo-name">${escapeHtml(c.name)} <span class="qty">×${c.quantity}</span> ${priorityBadge}${editingLabel}</div>
        <div class="cargo-meta">${c.length}×${c.width}×${c.height}cm · ${c.weightKg}${kgPerBox}</div>
        <div class="cargo-meta">${lbLayers}≤${c.maxStackLayers === 99 ? '∞' : c.maxStackLayers} · ${lbTopLoad}≤${c.maxLoadOnTopKg === Infinity ? '∞' : c.maxLoadOnTopKg}kg · ${lbRotation}:${rotAxes.join('') || '—'}${c.thisSideUp ? ' · ↑' : ''}</div>
      </div>
      <div class="cargo-actions">
        <button class="edit-btn" data-id="${c.id}">${t('cargo.btnEdit')}</button>
        <button class="remove-btn" data-id="${c.id}">${t('cargo.btnRemove')}</button>
      </div>
    `;
    listEl.appendChild(row);
  }
  listEl.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (state.editingId === id) cancelEdit();
      state.cargoTypes = state.cargoTypes.filter((c) => c.id !== id);
      renderCargoList();
      saveToStorage();
      emit('changed');
    });
  });
  listEl.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => startEdit(btn.dataset.id));
  });
}

export function renderStats(result) {
  lastResult = result;
  const el = document.getElementById('stats');
  const containers = result.containers ?? [];
  const totalPlaced = containers.reduce((s, ct) => s + ct.placements.length, 0);
  const totalRequested = state.cargoTypes.reduce((s, c) => s + c.quantity, 0);
  const totalUnplaced = result.unplaced.reduce((s, u) => s + u.count, 0);
  const boxesUnit = t('stats.boxes');
  const containerWord = t('stats.containerWord');

  let html = `<div><strong>${t('stats.loaded')}</strong>: ${totalPlaced} / ${totalRequested} ${boxesUnit}</div>`;
  if (totalUnplaced > 0) {
    html += `<div class="warn"><strong>${t('stats.unloaded')}</strong>: ${totalUnplaced} ${boxesUnit}</div>`;
  }
  html += `<div><strong>${t('stats.containers')}</strong>: ${containers.length} ${containerWord}</div>`;
  for (let i = 0; i < containers.length; i++) {
    const ct = containers[i];
    html += `<div class="container-stat">
      ${t('stats.containerN', { n: i + 1 })}: ${ct.placements.length} ${boxesUnit} ·
      ${t('stats.volume')} ${(ct.stats.volumeUtilization * 100).toFixed(1)}% ·
      ${t('stats.weight')} ${ct.stats.usedWeightKg.toFixed(0)}/${ct.stats.payloadKg}kg (${(ct.stats.weightUtilization * 100).toFixed(1)}%)
    </div>`;
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
      version: '1.0-mvp',
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
      if (!confirm(t('confirm.import'))) return;
      if (data.containerId) state.containerId = data.containerId;
      if (Array.isArray(data.cargoTypes)) state.cargoTypes = data.cargoTypes;
      document.getElementById('containerSelect').value = state.containerId;
      renderAll();
      saveToStorage();
      emit('changed');
    } catch (err) {
      alert(t('alert.jsonError') + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
