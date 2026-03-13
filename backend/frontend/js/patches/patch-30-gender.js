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

// ── Profile page gender injection REMOVED ────────────────────────
// Gender is already shown in the profile info grid via patch-05.
// Having it here too caused the field to appear twice.

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