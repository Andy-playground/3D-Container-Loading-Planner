// Small helpers shared by the UI, app and exporters.

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Packer unplaced-reason code → i18n key. */
export const REASON_KEYS = {
  oversize: 'reasonOversize',
  overweight: 'reasonOverweight',
  payload: 'reasonPayload',
  nospace: 'reasonNospace',
};

/** Local timestamp for download filenames: YYYYMMDD-HHMMSS. */
export function tsForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
