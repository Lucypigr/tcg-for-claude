// 對話框與提示訊息
import { esc } from './cardview.js';

export function showModal(html, { buttons = [{ label: '確定', primary: true, value: true }], dismissable = true, wide = false, onButton = null, onClick = null } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}"><div class="modal-body"></div><div class="modal-buttons">${buttons.map((b, i) =>
      `<button class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}" data-mb="${i}" ${b.disabled ? 'disabled' : ''}>${esc(b.label)}</button>`).join('')}</div></div>`;
    const body = wrap.querySelector('.modal-body');
    body.innerHTML = html;
    let done = false;
    const close = value => {
      if (done) return;
      done = true;
      wrap.classList.add('closing');
      setTimeout(() => wrap.remove(), 120);
      resolve(value);
    };
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-mb]');
      if (b) {
        const btn = buttons[+b.dataset.mb];
        if (btn.disabled) return;
        if (onButton) { if (onButton(btn.value)) close(btn.value); }
        else close(btn.value);
        return;
      }
      if (onClick && body.contains(e.target)) onClick(e, body, () => close(undefined));
      else if (e.target === wrap && dismissable) close(null);
    });
    document.body.appendChild(wrap);
  });
}

let toastBox = null;
export function toast(msg, cls = '') {
  if (!toastBox || !document.body.contains(toastBox)) {
    toastBox = document.createElement('div');
    toastBox.className = 'toasts';
    document.body.appendChild(toastBox);
  }
  const t = document.createElement('div');
  t.className = `toast ${cls}`;
  t.textContent = msg;
  toastBox.appendChild(t);
  setTimeout(() => t.classList.add('out'), 1400);
  setTimeout(() => t.remove(), 1800);
}
