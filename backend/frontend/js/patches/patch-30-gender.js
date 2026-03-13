// ================================================================
// HRnova — patch-30-gender.js
// Gender display helpers + gender-aware leave type UI
// ================================================================

// ── Leave apply page: show gender restriction info ───────────────
// Backend already filters leave types by gender.
// This patch adds a visible note when a restricted type is shown.
const _origRenderApply = window.renderApply;
if (_origRenderApply) {
  window.renderApply = async function(container) {
    await _origRenderApply(container);
    setTimeout(() => _labelGenderLeaves(container), 250);
  };
}

function _labelGenderLeaves(container) {
  const sel = container.querySelector('select[id*="type"], select[id*="leave"], #la-type');
  if (!sel) return;
  sel.querySelectorAll('option').forEach(opt => {
    const t = opt.textContent.toLowerCase();
    if (t.includes('maternity') && !t.includes('females'))
      opt.textContent += ' (Females only)';
    if (t.includes('paternity') && !t.includes('males'))
      opt.textContent += ' (Males only)';
  });
}

// ── Profile page: show gender field with edit support ────────────
const _origRenderProfile = window.renderProfile;
if (_origRenderProfile) {
  window.renderProfile = async function(container) {
    await _origRenderProfile(container);
    setTimeout(() => _injectGenderInProfile(container), 250);
  };
}

async function _injectGenderInProfile(container) {
  if (container.querySelector('[data-gender-injected]')) return;

  // Always fetch fresh from API — localStorage may be stale
  let gender = null;
  try {
    const profile = await api.me();
    gender = profile?.Gender || profile?.gender || null;
  } catch(e) {
    // fallback to localStorage
    const user = getUser();
    gender = user?.Gender || user?.gender || null;
  }

  // Find the info grid cells
  const cells = container.querySelectorAll('[style*="background:var(--bg)"][style*="border-radius"]');
  if (!cells.length) return;

  const gCfg = {
    male:   { icon:'♂', label:'Male',   color:'#3b82f6', bg:'#eff6ff' },
    female: { icon:'♀', label:'Female', color:'#ec4899', bg:'#fdf2f8' },
    other:  { icon:'⚧', label:'Other',  color:'#8b5cf6', bg:'#f5f3ff' },
  };
  const cfg = gCfg[gender];
  const badge = cfg
    ? `<span style="background:${cfg.bg};color:${cfg.color};border-radius:20px;
         padding:2px 9px;font-size:.82rem;font-weight:700">${cfg.icon} ${cfg.label}</span>`
    : `<span style="color:var(--text3);font-size:.82rem">Not set</span>`;

  // Insert after the Phone cell
  const phoneCell = [...cells].find(c =>
    c.querySelector('div')?.textContent?.trim().toLowerCase() === 'phone'
  );
  if (!phoneCell) return;

  const gCell = document.createElement('div');
  gCell.setAttribute('data-gender-injected','1');
  gCell.style.cssText = phoneCell.style.cssText;
  gCell.innerHTML = `
    <div style="font-size:.68rem;color:var(--text3);margin-bottom:3px;
                text-transform:uppercase;letter-spacing:.06em">Gender</div>
    <div style="font-weight:500;font-size:.88rem">${badge}</div>`;
  phoneCell.after(gCell);
}

// ── Leave Balances: hide gender-restricted types from balance view
// Backend already does this; this is just a safety UI layer
const _origRenderBalances2 = window.renderBalancesEmployee;
// No-op: backend handles this correctly via AllowedGender filter

// ── Settings → Leave Types table: show "Allowed For" column ─────
const _origRenderSettings = window.renderSettings;
if (_origRenderSettings) {
  window.renderSettings = async function(container) {
    await _origRenderSettings(container);
    setTimeout(() => _addGenderColumnToLeaveTypes(container), 300);
  };
}

function _addGenderColumnToLeaveTypes(container) {
  // Find the leave types table (has TypeCode/TypeName columns)
  const tables = container.querySelectorAll('table');
  tables.forEach(tbl => {
    const ths = tbl.querySelectorAll('th');
    if (![...ths].some(h => h.textContent.toLowerCase().includes('code'))) return;
    if ([...ths].some(h => h.textContent.toLowerCase().includes('allowed'))) return;

    // Add header
    const lastTh = ths[ths.length - 1];
    const gTh = document.createElement('th');
    gTh.style.cssText = lastTh.style.cssText || 'padding:8px 12px;font-size:.68rem;color:var(--text3)';
    gTh.textContent = 'Allowed For';
    lastTh.after(gTh);

    // Add cells
    tbl.querySelectorAll('tbody tr').forEach(row => {
      const name = (row.cells[1]?.textContent || row.cells[0]?.textContent || '').toLowerCase();
      let html = '<span style="color:var(--text3);font-size:.75rem">All Genders</span>';
      if (name.includes('maternity'))
        html = '<span style="background:#fdf2f8;color:#ec4899;border-radius:20px;padding:2px 8px;font-size:.72rem;font-weight:700">♀ Females Only</span>';
      else if (name.includes('paternity'))
        html = '<span style="background:#eff6ff;color:#3b82f6;border-radius:20px;padding:2px 8px;font-size:.72rem;font-weight:700">♂ Males Only</span>';

      const gTd = document.createElement('td');
      gTd.style.cssText = 'padding:8px 12px';
      gTd.innerHTML = html;
      row.cells[row.cells.length - 1].after(gTd);
    });
  });
}

console.log('⚧ Gender support patch loaded');
