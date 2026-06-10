// TXT / CSV / PDF exporters per SDD §10.3 + M4-1
// PDF is implemented via window.print() of a generated HTML page so that
// CJK text and colors render correctly without bundling a CJK font.

import { t, getLang } from './i18n.js';
import { lenUnit, wtUnit, fmtLen, fmtWt } from './units.js';

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
    alert(t('addAtLeastOne'));
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
    lines.push(`${t('weight')}: ${fmtWt(ct.stats.usedWeightKg, 0)}/${fmtWt(ct.stats.payloadKg, 0)} ${wtUnit()}`);
    if (ct.cog) {
      lines.push(`${t('cog')} (${lenUnit()}): X=${fmtLen(ct.cog.x)} Y=${fmtLen(ct.cog.y)} Z=${fmtLen(ct.cog.z)}${ct.cog.hasWeight ? '' : ' (volume-weighted)'}`);
    }
    if (ct.axleLoads) {
      const a = ct.axleLoads;
      lines.push(`${t('axleFront')}: ${fmtWt(a.frontKg, 0)} ${wtUnit()} (${(a.frontPct * 100).toFixed(0)}%)  ${t('axleRear')}: ${fmtWt(a.rearKg, 0)} ${wtUnit()} (${(a.rearPct * 100).toFixed(0)}%)  ${a.balanced ? t('balanced') : t('notBalanced')}`);
    }
    if (ct.lateral && !ct.lateral.ok) {
      lines.push(`${t('lateralWarn')}: ${t('lateralOffset')} ${fmtLen(ct.lateral.offsetCm)} ${lenUnit()}`);
    }
    lines.push('');
    // Items in physical loading order (back of container first)
    const ordered = [...ct.placements].sort((a, b) => (a.loadSeq ?? 0) - (b.loadSeq ?? 0));
    for (const p of ordered) {
      lines.push(`${p.loadSeq ?? '?'}. ${p.name}`);
      lines.push(`   Position: X=${fmtLen(p.x, 0)}${lenUnit()}, Y=${fmtLen(p.y, 0)}${lenUnit()}, Z=${fmtLen(p.z, 0)}${lenUnit()}`);
      lines.push(`   Dimensions: ${fmtLen(p.L)}×${fmtLen(p.W)}×${fmtLen(p.H)}${lenUnit()}`);
      lines.push(`   Weight: ${fmtWt(p.weightKg ?? 0)}${wtUnit()}  Orientation: ${fmtRot(p)}`);
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
    alert(t('addAtLeastOne'));
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
    alert(t('addAtLeastOne'));
    return;
  }
  const win = window.open('', '_blank');
  if (!win) {
    alert('Popup blocked — please allow popups to export PDF.');
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

function renderPrintHTML(result, containerSpec, totalItems, meta = {}) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const containerSections = result.containers.map((ct, i) => {
    // Per-cargo summary table for this container
    const summaryMap = new Map();
    for (const p of ct.placements) {
      const e = summaryMap.get(p.cargoId) ?? { name: p.name, color: p.color, count: 0, weightKg: 0 };
      e.count++;
      e.weightKg += p.weightKg ?? 0;
      summaryMap.set(p.cargoId, e);
    }
    const summaryRows = Array.from(summaryMap.values()).map((e) => `
      <tr>
        <td><span class="sw" style="background:${esc(e.color || '#888')}"></span>${esc(e.name)}</td>
        <td>${e.count}</td>
        <td>${fmtWt(e.weightKg, 0)}</td>
      </tr>
    `).join('');

    const ordered = [...ct.placements].sort((a, b) => (a.loadSeq ?? 0) - (b.loadSeq ?? 0));
    const rows = ordered.map((p) => `
      <tr>
        <td>${p.loadSeq ?? ''}</td>
        <td><span class="sw" style="background:${esc(p.color || '#888')}"></span>${esc(p.name)}</td>
        <td>${fmtLen(p.x, 0)}</td>
        <td>${fmtLen(p.y, 0)}</td>
        <td>${fmtLen(p.z, 0)}</td>
        <td>${fmtLen(p.L)}×${fmtLen(p.W)}×${fmtLen(p.H)}</td>
        <td>${fmtWt(p.weightKg ?? 0)}</td>
        <td>${fmtRot(p)}</td>
      </tr>
    `).join('');
    const lateral = ct.lateral && !ct.lateral.ok
      ? `<div class="meta"><span class="warn">${t('lateralWarn')}</span> (${t('lateralOffset')} ${fmtLen(ct.lateral.offsetCm)} ${lenUnit()})</div>`
      : '';
    const cog = ct.cog
      ? `<div class="meta"><strong>${t('cog')}</strong>: X=${fmtLen(ct.cog.x)} · Y=${fmtLen(ct.cog.y)} · Z=${fmtLen(ct.cog.z)} ${lenUnit()}${ct.cog.hasWeight ? '' : ' (vol-weighted)'}</div>`
      : '';
    const axle = ct.axleLoads
      ? `<div class="meta">
          <strong>${t('axleFront')}</strong>: ${fmtWt(ct.axleLoads.frontKg, 0)} ${wtUnit()} (${(ct.axleLoads.frontPct * 100).toFixed(0)}%) ·
          <strong>${t('axleRear')}</strong>: ${fmtWt(ct.axleLoads.rearKg, 0)} ${wtUnit()} (${(ct.axleLoads.rearPct * 100).toFixed(0)}%) ·
          ${ct.axleLoads.balanced ? `<span class="ok">${t('balanced')}</span>` : `<span class="warn">${t('notBalanced')}</span>`}
        </div>`
      : '';
    return `
      <section class="container-block">
        <h2>${t('container')} ${i + 1} — ${esc(containerSpec.label)}</h2>
        <div class="meta"><strong>${t('placedLabel')}</strong>: ${ct.placements.length} · <strong>${t('volume')}</strong>: ${(ct.stats.volumeUtilization * 100).toFixed(1)}% · <strong>${t('weight')}</strong>: ${fmtWt(ct.stats.usedWeightKg, 0)}/${fmtWt(ct.stats.payloadKg, 0)} ${wtUnit()}</div>
        ${cog}
        ${lateral}
        ${axle}
        <h3>${t('cargoSummary')}</h3>
        <table class="summary">
          <thead><tr><th>${t('name')}</th><th>${t('quantity')}</th><th>${t('weight')} (${wtUnit()})</th></tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
        <table>
          <thead>
            <tr>
              <th>${t('loadSeqCol')}</th><th>${t('name')}</th>
              <th>X</th><th>Y</th><th>Z</th>
              <th>${t('actualDims')} (${lenUnit()})</th>
              <th>${t('weight')} (${wtUnit()})</th>
              <th>${t('rotationLabel')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }).join('');

  const reasonLine = (u) => {
    const parts = Object.entries(u.reasons ?? {}).map(([r, n]) => `${t(REASON_KEYS[r] ?? r)}×${n}`);
    return parts.length ? ` (${parts.join(', ')})` : '';
  };
  const unplacedHtml = result.unplaced?.length
    ? `<section><h2>${t('unplacedLabel')}</h2><ul>${result.unplaced.map(u => `<li>${esc(u.name ?? u.cargoId)}: ${u.count}${esc(reasonLine(u))}</li>`).join('')}</ul></section>`
    : '';

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
  h2 { font-size: 1.1em; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #007bff; page-break-after: avoid; }
  .header-meta { color: #666; font-size: 0.9em; margin-bottom: 16px; }
  .meta { font-size: 0.85em; color: #444; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.78em; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; }
  thead th { background: #f0f4ff; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .sw { display: inline-block; width: 10px; height: 10px; border: 1px solid #999; margin-right: 6px; vertical-align: middle; }
  .ok { color: #28a745; font-weight: 600; }
  .warn { color: #dc3545; font-weight: 600; }
  .container-block { page-break-inside: avoid; }
  h3 { font-size: 0.95em; margin: 12px 0 2px; }
  table.summary { width: auto; min-width: 50%; }
  .snapshot img { max-width: 100%; border: 1px solid #ccc; border-radius: 4px; margin-top: 6px; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>${esc(meta.title || t('printTitle'))}</h1>
  <div class="header-meta">
    ${t('generated')}: ${tsHuman()} ·
    ${t('totalContainers')}: ${result.containers.length} ·
    ${t('totalItems')}: ${totalItems}
  </div>
  ${snapshotHtml}
  ${containerSections}
  ${unplacedHtml}
</body>
</html>`;
}
