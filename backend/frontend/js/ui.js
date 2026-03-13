// frontend/js/ui.js — shared UI helpers

/* ── Toast ─────────────────────────────────────── */
const toast = (() => {
  const el = () => document.getElementById('toast-container');
  const COLORS = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
  const ICONS  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
  function show(msg, type='info') {
    const d = document.createElement('div');
    d.className = `toast ${type}`;
    d.innerHTML = `<span style="color:${COLORS[type]};margin-right:5px">${ICONS[type]}</span>${msg}`;
    el().appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }
  return { success:m=>show(m,'success'), error:m=>show(m,'error'), warning:m=>show(m,'warning'), info:m=>show(m,'info') };
})();

/* ── Date helpers ──────────────────────────────── */
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function todayStr() { return new Date().toISOString().slice(0,10); }
function diffDays(a, b) { return Math.max(1, Math.round((new Date(b)-new Date(a))/86400000)+1); }

/* ── HTML builders ─────────────────────────────── */
function statusBadge(s) {
  const M = {
    pending:   ['badge-pending',   '⏳ Pending'],
    approved:  ['badge-approved',  '✓ Approved'],
    rejected:  ['badge-rejected',  '✕ Rejected'],
    cancelled: ['badge-cancelled', '⊘ Cancelled'],
  };
  const [c,l] = M[s] || ['badge-cancelled', s];
  return `<span class="badge ${c}">${l}</span>`;
}

function roleChip(role) {
  const cls = role === 'hr' ? 'badge-hr' : role === 'manager' ? 'badge-manager' : 'badge-role';
  return `<span class="badge ${cls}">${role}</span>`;
}

function typeChip(code, color) {
  return `<span class="type-chip" style="background:${color}22;color:${color};border:1px solid ${color}40">${code}</span>`;
}

function avatarHtml(initials, size=38) {
  const fs = Math.round(size * 0.35);
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${fs}px">${initials}</div>`;
}

function getInitials(name) {
  return (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
}

function loader() {
  return `<div class="loader"><div class="spinner"></div>Loading…</div>`;
}

function empty(msg, icon='📭') {
  return `<div class="empty"><div class="empty-icon">${icon}</div>${msg}</div>`;
}

/* ── Modal helpers ─────────────────────────────── */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

/* ── Confirm dialog ────────────────────────────── */
function confirmDialog(title, msg, onOk) {
  document.getElementById('confirm-title').textContent   = title;
  document.getElementById('confirm-message').textContent = msg;
  const btn = document.getElementById('confirm-ok');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => { closeModal('modal-confirm'); onOk(); });
  openModal('modal-confirm');
}

/* ── Screen size ───────────────────────────────── */
function isMobile() { return window.innerWidth < 768; }

// Expose globally
window.toast = toast;
window.fmtDate = fmtDate;
window.todayStr = todayStr;
window.diffDays = diffDays;
window.statusBadge = statusBadge;
window.roleChip = roleChip;
window.typeChip = typeChip;
window.avatarHtml = avatarHtml;
window.getInitials = getInitials;
window.loader = loader;
window.empty = empty;
window.openModal = openModal;
window.closeModal = closeModal;
window.confirmDialog = confirmDialog;
window.isMobile = isMobile;
