// Lightweight toast notifications + promise-based confirm dialog.
// Replaces native alert()/confirm() so the UI stays non-blocking and styled.

const ICONS = { success: '✓', error: '✕', info: 'ℹ' };

function ensureWrap() {
  let wrap = document.getElementById('toastWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    document.body.appendChild(wrap);
  }
  return wrap;
}

/**
 * Show a toast. type: 'info' | 'success' | 'error'
 */
export function toast(message, type = 'info', durationMs = 3200) {
  const wrap = ensureWrap();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = ICONS[type] ?? ICONS.info;
  const text = document.createElement('span');
  text.textContent = message;
  el.append(icon, text);
  wrap.appendChild(el);

  const remove = () => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  const timer = setTimeout(remove, durationMs);
  el.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

/**
 * Non-blocking confirm replacement.
 * @returns {Promise<boolean>} resolves true on OK, false on cancel/escape
 */
export function confirmDialog(message, { okLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.textContent = message;

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = cancelLabel;
    const okBtn = document.createElement('button');
    okBtn.className = 'btn-primary';
    okBtn.textContent = okLabel;
    footer.append(cancelBtn, okBtn);

    modal.append(body, footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    okBtn.focus();
  });
}

/**
 * Generic modal shell for custom content (e.g. CSV import preview).
 * Returns { backdrop, body, footer, close } — caller fills body/footer.
 */
export function openModal(titleText) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const header = document.createElement('div');
  header.className = 'modal-header';
  header.textContent = titleText;
  const body = document.createElement('div');
  body.className = 'modal-body';
  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  modal.append(header, body, footer);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const close = () => {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  return { backdrop, body, footer, close };
}
