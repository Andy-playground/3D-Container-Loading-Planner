// TXT / CSV / PDF exporters per SDD §10.3 + M4-1
// PDF is implemented via window.print() of a generated HTML page so that
// CJK text and colors render correctly without bundling a CJK font.

import { t, getLang } from './i18n.js';
import { toast } from './toast.js';

function tsForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function tsHuman() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

function fmtRot(p) {
  const parts = [];
  if (p.yaw) parts.push(`yaw=${p.yaw}°`);
  if (p.pitch) parts.push(`pitch=${p.pitch}°`);
  if (p.roll) parts.push(`roll=${p.roll}°`);
  return parts.length ? parts.join(',') : '0';
}

const REASON_KEYS = { oversize: 'reasonOversize', overweight: 'reasonOverweight', nospace: 'reasonNospace' };

function fmtReasons(u) {
  const parts = Object.entries(u.reasons ?? {}).map(([r, n]) => `${t(REASON_KEYS[r] ?? r)}×${n}`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

// ===== TXT =====
export function exportTXT(result, containerSpec, meta = {}) {
  if (!result?.containers?.length) {
    toast(t('addAtLeastOne'), 'error');
    return;
  }
  const lines = [];
  lines.push(meta.title || t('printTitle'));
  lines.push('==========================');
  lines.push(`${t('generated')}: ${tsHuman()}`);
  lines.push(`${t('chooseContainer')}: [${containerSpec.mode.toUpperCase()}] ${containerSpec.label}`);
  lines.push(`${t('totalContainers')}: ${result.containers.length}`);
  const totalItems = result.containers.reduce((s, c) => s + c.placements.length, 0);
  lines.push(`${t('totalItems')}: ${totalItems}`);
  lines.push('');

  for (let i = 0; i < result.containers.length; i++) {
    const ct = result.containers[i];
    lines.push(`=== ${t('container')} ${i + 1} (${containerSpec.type}) ===`);
    lines.push(`${t('placedLabel')}: ${ct.placements.length} ${t('boxes')}`);
    lines.push(`${t('volume')}: ${(ct.stats.volumeUtilization * 100).toFixed(1)}%`);
    lines.push(`${t('weight')}: ${ct.stats.usedWeightKg.toFixed(0)}/${ct.stats.payloadKg} kg`);
    if (ct.cog) {
      lines.push(`${t('cog')} (cm): X=${ct.cog.x.toFixed(1)} Y=${ct.cog.y.toFixed(1)} Z=${ct.cog.z.toFixed(1)}${ct.cog.hasWeight ? '' : ' (volume-weighted)'}`);
    }
    if (ct.axleLoads) {
      const a = ct.axleLoads;
      lines.push(`${t('axleFront')}: ${a.frontKg.toFixed(0)} kg (${(a.frontPct * 100).toFixed(0)}%)  ${t('axleRear')}: ${a.rearKg.toFixed(0)} kg (${(a.rearPct * 100).toFixed(0)}%)  ${a.balanced ? t('balanced') : t('notBalanced')}`);
    }
    if (ct.lateral && !ct.lateral.ok) {
      lines.push(`${t('lateralWarn')}: ${t('lateralOffset')} ${ct.lateral.offsetCm.toFixed(1)} cm`);
    }
    lines.push('');
    // Items in physical loading order (back of container first)
    const ordered = [...ct.placements].sort((a, b) => (a.loadSeq ?? 0) - (b.loadSeq ?? 0));
    for (const p of ordered) {
      lines.push(`${p.loadSeq ?? '?'}. ${p.name}`);
      lines.push(`   Position: X=${p.x.toFixed(0)}cm, Y=${p.y.toFixed(0)}cm, Z=${p.z.toFixed(0)}cm`);
      lines.push(`   Dimensions: ${p.L}×${p.W}×${p.H}cm`);
      lines.push(`   Weight: ${(p.weightKg ?? 0)}kg  Orientation: ${fmtRot(p)}`);
    }
    lines.push('');
  }
  if (result.unplaced?.length) {
    lines.push(`=== ${t('unplacedLabel')} ===`);
    for (const u of result.unplaced) {
      lines.push(`  ${u.name ?? u.cargoId}: ${u.count}${fmtReasons(u)}`);
    }
  }
  downloadBlob(lines.join('\n'), `loading-plan-${tsForFilename()}.txt`, 'text/plain;charset=utf-8');
}

// ===== CSV =====
function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportCSV(result, containerSpec, meta = {}) {
  if (!result?.containers?.length) {
    toast(t('addAtLeastOne'), 'error');
    return;
  }
  const rows = [];
  rows.push(['load_seq', 'name', 'container', 'x_cm', 'y_cm', 'z_cm', 'L_cm', 'W_cm', 'H_cm', 'weight_kg', 'orientation']);
  for (let i = 0; i < result.containers.length; i++) {
    const ct = result.containers[i];
    const ordered = [...ct.placements].sort((a, b) => (a.loadSeq ?? 0) - (b.loadSeq ?? 0));
    for (const p of ordered) {
      rows.push([
        p.loadSeq ?? '',
        p.name,
        `${i + 1}/${containerSpec.type}`,
        p.x.toFixed(1),
        p.y.toFixed(1),
        p.z.toFixed(1),
        p.L,
        p.W,
        p.H,
        p.weightKg ?? 0,
        fmtRot(p),
      ]);
    }
  }
  // BOM so Excel opens UTF-8 cleanly
  const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
  downloadBlob(csv, `loading-plan-${tsForFilename()}.csv`, 'text/csv;charset=utf-8');
}

// ===== PDF (via print) =====
export function exportPDF(result, containerSpec, meta = {}) {
  if (!result?.containers?.length) {
    toast(t('addAtLeastOne'), 'error');
    return;
  }
  const win = window.open('', '_blank');
  if (!win) {
    toast('Popup blocked — please allow popups to export PDF.', 'error');
    return;
  }

  const totalItems = result.containers.reduce((s, c) => s + c.placements.length, 0);
  const html = renderPrintHTML(result, containerSpec, totalItems, meta);
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Defer print until layout is ready
  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
    }, 200);
  };
}

// Report layout: header-level overview → one line per cargo type
// (boxes / weight / CBM / applied loading options) → 3D snapshot last.
function renderPrintHTML(result, containerSpec, totalItems, meta = {}) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  // --- Aggregates across all containers
  const placedBy = new Map();   // cargoId -> count
  let totalWeight = 0;
  let totalCbm = 0;
  for (const ct of result.containers) {
    for (const p of ct.placements) {
      placedBy.set(p.cargoId, (placedBy.get(p.cargoId) ?? 0) + 1);
      totalWeight += p.weightKg ?? 0;
      totalCbm += (p.L * p.W * p.H) / 1e6;
    }
  }
  const unplacedBy = new Map((result.unplaced ?? []).map((u) => [u.cargoId, u]));
  const totalUnplaced = (result.unplaced ?? []).reduce((s, u) => s + u.count, 0);
  const avgUtil = result.containers.length
    ? result.containers.reduce((s, ct) => s + ct.stats.volumeUtilization, 0) / result.containers.length
    : 0;

  // --- Header level: overview
  const overviewHtml = `
    <section>
      <h2>${t('overview')}</h2>
      <table class="overview">
        <tbody>
          <tr>
            <th>${t('chooseContainer')}</th><td>${esc(containerSpec.label)}${meta.autoChosen ? ` (${t('autoChosen')})` : ''}</td>
            <th>${t('totalContainers')}</th><td>${result.containers.length}</td>
          </tr>
          <tr>
            <th>${t('totalItems')}</th><td>${totalItems}${totalUnplaced ? ` <span class="warn">(+${totalUnplaced} ${t('unplacedShort')})</span>` : ''}</td>
            <th>${t('avgUtil')}</th><td>${(avgUtil * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <th>${t('totalWeightKg')}</th><td>${totalWeight.toFixed(0)}</td>
            <th>${t('totalCbm')}</th><td>${totalCbm.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </section>`;

  // --- Line level: one row per cargo type
  const optBadges = (c) => {
    const o = [];
    if (c.thisSideUp) o.push(t('optThisSideUp'));
    if ((c.maxStackLayers ?? 99) === 1) o.push(t('optNoStack'));
    if (c.rotatable?.yaw) o.push(t('optYaw'));
    if (c.rotatable?.pitch || c.rotatable?.roll) o.push(t('optFlip'));
    if (c.priority === 'urgent') o.push(t('optUrgent'));
    if (c.priority === 'lifo') o.push(t('optLifo'));
    if (c.groupSameSku) o.push(t('optGroup'));
    return o.map((x) => `<span class="opt">${esc(x)}</span>`).join(' ');
  };

  // Prefer the full cargo definitions (passed via meta); fall back to
  // reconstructing basic rows from placements if unavailable.
  let cargoRows = '';
  if (Array.isArray(meta.cargoTypes) && meta.cargoTypes.length) {
    cargoRows = meta.cargoTypes.map((c) => {
      const placed = placedBy.get(c.id) ?? 0;
      const un = unplacedBy.get(c.id)?.count ?? 0;
      const cbm = (c.length * c.width * c.height * placed) / 1e6;
      return `
        <tr>
          <td><span class="sw" style="background:${esc(c.color || '#888')}"></span>${esc(c.name)}</td>
          <td>${c.length}×${c.width}×${c.height}</td>
          <td>${c.weightKg ?? 0}</td>
          <td>${placed}${un ? ` <span class="warn">(+${un} ${t('unplacedShort')})</span>` : ''}</td>
          <td>${((c.weightKg ?? 0) * placed).toFixed(0)}</td>
          <td>${cbm.toFixed(2)}</td>
          <td>${optBadges(c)}</td>
        </tr>`;
    }).join('');
  } else {
    const byType = new Map();
    for (const ct of result.containers) {
      for (const p of ct.placements) {
        const e = byType.get(p.cargoId) ?? { name: p.name, color: p.color, count: 0, weightKg: 0, cbm: 0, sample: p };
        e.count++;
        e.weightKg += p.weightKg ?? 0;
        e.cbm += (p.L * p.W * p.H) / 1e6;
        byType.set(p.cargoId, e);
      }
    }
    cargoRows = Array.from(byType.values()).map((e) => `
      <tr>
        <td><span class="sw" style="background:${esc(e.color || '#888')}"></span>${esc(e.name)}</td>
        <td>${e.sample.L}×${e.sample.W}×${e.sample.H}</td>
        <td>${e.sample.weightKg ?? 0}</td>
        <td>${e.count}</td>
        <td>${e.weightKg.toFixed(0)}</td>
        <td>${e.cbm.toFixed(2)}</td>
        <td>${e.sample.thisSideUp ? `<span class="opt">${t('optThisSideUp')}</span>` : ''}</td>
      </tr>`).join('');
  }

  const cargoLinesHtml = `
    <section>
      <h2>${t('cargoLines')}</h2>
      <table>
        <thead>
          <tr>
            <th>${t('name')}</th>
            <th>${t('unitDims')}</th>
            <th>${t('unitWeight')}</th>
            <th>${t('boxCount')}</th>
            <th>${t('totalWeightKg')}</th>
            <th>${t('totalCbm')}</th>
            <th>${t('loadOptions')}</th>
          </tr>
        </thead>
        <tbody>${cargoRows}</tbody>
      </table>
    </section>`;

  // --- Per-container compact status
  const containerRows = result.containers.map((ct, i) => {
    const cog = ct.cog ? `X=${ct.cog.x.toFixed(0)} · Y=${ct.cog.y.toFixed(0)} · Z=${ct.cog.z.toFixed(0)}` : '—';
    const axle = ct.axleLoads
      ? (ct.axleLoads.balanced ? `<span class="ok">${t('balanced')}</span>` : `<span class="warn">${t('notBalanced')}</span>`)
      : '—';
    const lateral = ct.lateral && !ct.lateral.ok
      ? ` <span class="warn">${t('lateralWarn')}</span>`
      : '';
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${ct.placements.length}</td>
        <td>${(ct.stats.volumeUtilization * 100).toFixed(1)}%</td>
        <td>${ct.stats.usedWeightKg.toFixed(0)} / ${ct.stats.payloadKg}</td>
        <td>${cog}</td>
        <td>${axle}${lateral}</td>
      </tr>`;
  }).join('');

  const perContainerHtml = `
    <section>
      <h2>${t('perContainer')}</h2>
      <table>
        <thead>
          <tr>
            <th>${t('container')}</th>
            <th>${t('boxCount')}</th>
            <th>${t('utilization')}</th>
            <th>${t('weight')} (kg)</th>
            <th>${t('cog')} (cm)</th>
            <th>${t('axleBalance')}</th>
          </tr>
        </thead>
        <tbody>${containerRows}</tbody>
      </table>
    </section>`;

  const reasonLine = (u) => {
    const parts = Object.entries(u.reasons ?? {}).map(([r, n]) => `${t(REASON_KEYS[r] ?? r)}×${n}`);
    return parts.length ? ` (${parts.join(', ')})` : '';
  };
  const unplacedHtml = result.unplaced?.length
    ? `<section><h2>${t('unplacedLabel')}</h2><ul>${result.unplaced.map(u => `<li>${esc(u.name ?? u.cargoId)}: ${u.count}${esc(reasonLine(u))}</li>`).join('')}</ul></section>`
    : '';

  // --- 3D snapshot at the very bottom
  const snapshotHtml = meta.snapshotDataUrl
    ? `<section class="snapshot"><h2>${t('snapshot3d')}</h2><img src="${meta.snapshotDataUrl}" alt="3D snapshot"></section>`
    : '';

  return `<!DOCTYPE html>
<html lang="${getLang()}">
<head>
<meta charset="UTF-8">
<title>${t('printTitle')}</title>
<style>
  body { font-family: -apple-system, "Helvetica Neue", "PingFang TC", "Microsoft JhengHei", sans-serif; color: #222; margin: 24px; }
  h1 { font-size: 1.6em; margin: 0 0 4px; }
  h2 { font-size: 1.1em; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #2563eb; page-break-after: avoid; }
  .header-meta { color: #666; font-size: 0.9em; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.8em; }
  th, td { border: 1px solid #bbb; padding: 5px 7px; text-align: left; vertical-align: top; }
  thead th { background: #eff6ff; }
  tbody tr:nth-child(even) { background: #fafafa; }
  table.overview th { background: #eff6ff; width: 16%; white-space: nowrap; }
  table.overview td { width: 34%; }
  .sw { display: inline-block; width: 10px; height: 10px; border: 1px solid #999; margin-right: 6px; vertical-align: middle; }
  .ok { color: #16a34a; font-weight: 600; }
  .warn { color: #dc2626; font-weight: 600; }
  .opt { display: inline-block; background: #eef2f7; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 6px; margin: 1px 2px 1px 0; font-size: 0.92em; white-space: nowrap; }
  section { page-break-inside: avoid; }
  .snapshot img { max-width: 100%; border: 1px solid #ccc; border-radius: 4px; margin-top: 6px; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>${esc(meta.title || t('printTitle'))}</h1>
  <div class="header-meta">${t('generated')}: ${tsHuman()}</div>
  ${overviewHtml}
  ${cargoLinesHtml}
  ${perContainerHtml}
  ${unplacedHtml}
  ${snapshotHtml}
</body>
</html>`;
}
