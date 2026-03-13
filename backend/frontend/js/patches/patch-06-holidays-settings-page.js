// ==============================================================
// HRnova — patch-06-holidays-settings-page.js
// Holidays page + Settings page (HR)
// Lines 779–1095 of original patch.js
// ==============================================================

// ================================================================
// 6. NEW renderBalances — adds Import & Export to leave balances page
//    Import: CSV keyed by EmployeeCode + LeaveType (TypeCode)
//    Export: downloads all balances for selected year as CSV
//    All existing per-employee balance editing is fully preserved
// ================================================================
async function renderBalances(container) {
  let selUID      = null;
  let showImport  = false;
  const curYear   = new Date().getFullYear();

  async function render() {
    try {
      const users = await api.users({});
      if (!selUID && users.length) selUID = users[0].UserID;
      const selUser = users.find(u => u.UserID === selUID);
      const bal     = selUID ? await api.userBalance2(selUID) : [];

      container.innerHTML = `
      <div class="page-anim">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;
                    flex-wrap:wrap;gap:10px;margin-bottom:20px">
          <h2 class="page-title" style="margin:0">Manage Leave Balances</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="btn-bal-export" title="Download all balances as CSV">
              ⬇ Export CSV
            </button>
            <button class="btn btn-ghost btn-sm" id="btn-bal-import-toggle">
              ⬆ Import CSV
            </button>
          </div>
        </div>

        <!-- Import panel -->
        ${showImport ? _renderBalImportPanel() : ''}

        <!-- Existing layout: employee list + balance editor -->
        <div style="display:flex;flex-direction:${isMobile()?'column':'row'};gap:16px">

          <!-- Employee sidebar -->
          <div style="width:${isMobile()?'100%':'220px'};flex-shrink:0">
            <div class="card" style="padding:0;overflow:hidden">
              <div style="padding:10px 14px;background:var(--surface2);
                          font-size:.65rem;color:var(--text3);font-weight:700;letter-spacing:.1em">
                EMPLOYEES
              </div>
              ${isMobile() ? `
                <select class="form-control" id="bal-sel"
                  style="border-radius:0;border:none;border-top:1px solid var(--border)">
                  ${users.map(u => `<option value="${u.UserID}"${u.UserID===selUID?' selected':''}>
                    ${u.EmployeeCode ? '['+u.EmployeeCode+'] ' : ''}${u.FullName}
                  </option>`).join('')}
                </select>` :
                users.map(u => `
                  <button data-uid="${u.UserID}"
                    style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 14px;
                      background:${u.UserID===selUID?'#e9f0ff':'none'};border:none;
                      border-left:2.5px solid ${u.UserID===selUID?'var(--primary)':'transparent'};
                      cursor:pointer;text-align:left;font-size:.86rem;transition:background .12s">
                    ${avatarHtml(getInitials(u.FullName), 28)}
                    <div style="min-width:0">
                      <div style="font-weight:${u.UserID===selUID?'600':'400'};font-size:.82rem;
                                  color:${u.UserID===selUID?'var(--primary)':'var(--text)'};
                                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        ${u.FullName}
                      </div>
                      <div style="font-size:.68rem;color:var(--text3);margin-top:1px">
                        ${u.EmployeeCode ? '#'+u.EmployeeCode+' · ' : ''}${u.DepartmentName||''}
                      </div>
                    </div>
                  </button>`).join('')
              }
            </div>
          </div>

          <!-- Balance editor (right side) -->
          <div style="flex:1;min-width:0">
            ${selUser ? `
              <div class="card">
                <!-- Employee header -->
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;
                            padding-bottom:16px;border-bottom:1px solid var(--border);flex-wrap:wrap">
                  ${avatarHtml(getInitials(selUser.FullName), 50)}
                  <div>
                    <div style="font-weight:700;font-size:1.05rem">${selUser.FullName}</div>
                    <div style="font-size:.8rem;color:var(--text3);display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:3px">
                      ${selUser.EmployeeCode ? `<span style="background:#e9f0ff;color:#0052cc;border-radius:3px;
                        padding:1px 7px;font-size:.7rem;font-weight:700;font-family:monospace">
                        #${selUser.EmployeeCode}</span>` : ''}
                      <span>${selUser.DepartmentName||''}</span>
                      ${roleChip(selUser.Role)}
                    </div>
                  </div>
                </div>

                <!-- Balance grid (fully preserved) -->
                <div class="grid-4" id="bal-grid">
                  ${bal.map(b => `
                  <div style="background:var(--surface2);border:1px solid var(--border);
                              border-radius:var(--radius);padding:14px">
                    <div style="font-size:.72rem;color:var(--text3);margin-bottom:6px;font-weight:600">
                      ${b.TypeName}
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
                      <input type="number" min="0" max="365" value="${b.TotalDays}"
                        data-lt="${b.LeaveTypeID}" data-year="${b.Year}"
                        style="width:56px;background:#fff;border:2px solid ${b.ColorHex}60;
                               border-radius:6px;padding:5px 6px;color:${b.ColorHex};
                               font-size:1rem;font-weight:700;text-align:center;
                               outline:none;transition:border-color .15s"
                        onfocus="this.style.borderColor='${b.ColorHex}'"
                        onblur="this.style.borderColor='${b.ColorHex}60'" />
                      <span style="font-size:.76rem;color:var(--text3)">/ ${b.MaxDaysPerYear||'?'}</span>
                    </div>
                    <div class="progress">
                      <div class="bar" style="width:${Math.min(100,(b.UsedDays/(b.TotalDays||1))*100)}%;
                                              background:${b.ColorHex}"></div>
                    </div>
                    <div style="font-size:.68rem;color:var(--text3);margin-top:5px">
                      ${b.UsedDays} used &nbsp;·&nbsp; ${b.RemainingDays} left
                    </div>
                  </div>`).join('')}
                </div>

                <button class="btn btn-primary" id="btn-save-bal"
                  style="margin-top:16px;width:auto;padding:10px 24px">
                  Save Balances
                </button>
              </div>` :
              `<div class="empty"><div class="empty-icon">⚖️</div><p>Select an employee to view balances.</p></div>`
            }
          </div>
        </div>
      </div>`;

      // ── Employee select (mobile)
      document.getElementById('bal-sel')?.addEventListener('change', function () {
        selUID = parseInt(this.value); render();
      });

      // ── Employee buttons (desktop) — preserved exactly
      container.querySelectorAll('[data-uid]').forEach(btn =>
        btn.addEventListener('click', () => { selUID = parseInt(btn.dataset.uid); render(); })
      );

      // ── Save balances — preserved exactly
      document.getElementById('btn-save-bal')?.addEventListener('click', async () => {
        const inputs = document.querySelectorAll('#bal-grid input');
        try {
          await Promise.all([...inputs].map(inp =>
            api.updateBalance(selUID, { leaveTypeID: inp.dataset.lt, totalDays: inp.value, year: inp.dataset.year })
          ));
          toast.success('Balances saved!'); render();
        } catch (e) { toast.error(e.message); }
      });

      // ── Export CSV
      document.getElementById('btn-bal-export')?.addEventListener('click', async () => {
        try {
          const token = localStorage.getItem('hr_token') || '';
          const res = await fetch(`/api/users/balance/export?year=${curYear}`, {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          if (!res.ok) { toast.error('Export failed'); return; }
          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement('a');
          a.href = url;
          a.download = `leave_balances_${curYear}.csv`;
          a.click(); URL.revokeObjectURL(url);
          toast.success('Balances CSV downloaded!');
        } catch (e) { toast.error(e.message); }
      });

      // ── Import panel toggle
      document.getElementById('btn-bal-import-toggle')?.addEventListener('click', () => {
        showImport = !showImport; render();
      });

      // ── Template download
      document.getElementById('btn-bal-template')?.addEventListener('click', () => {
        const csv = [
          'EmployeeCode,LeaveType,TotalDays',
          '1001,CL,12',
          '1001,SL,10',
          '1001,EL,15',
          '1002,CL,12',
          '1002,SL,10',
        ].join('\r\n');
        const a = document.createElement('a');
        a.href = 'data:text/csv,' + encodeURIComponent(csv);
        a.download = 'balance_import_template.csv';
        a.click();
        toast.info('Template downloaded!');
      });

      // ── File upload
      document.getElementById('bal-import-file')?.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
          document.getElementById('bal-import-text').value = e.target.result;
          toast.info('File loaded — review and click Import.');
        };
        reader.readAsText(file);
      });

      // ── Run import
      document.getElementById('btn-bal-run-import')?.addEventListener('click', async () => {
        const raw = document.getElementById('bal-import-text').value.trim();
        if (!raw) { toast.error('Paste or upload CSV first.'); return; }
        const rows = _parseCSV(raw);
        if (!rows.length) { toast.error('No valid rows found.'); return; }

        const btn = document.getElementById('btn-bal-run-import');
        btn.disabled = true; btn.textContent = 'Importing…';
        try {
          const token = localStorage.getItem('hr_token') || '';
          const res = await fetch('/api/users/balance/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ rows, year: curYear })
          });
          const d = await res.json();
          _showBalImportResult(d);
          if (d.updated > 0) { showImport = false; render(); }
        } catch (e) { toast.error(e.message); }
        finally { btn.disabled = false; btn.textContent = 'Import Balances'; }
      });

      // ── Cancel import panel
      document.getElementById('btn-bal-cancel-import')?.addEventListener('click', () => {
        showImport = false; render();
      });

    } catch (e) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px">${e.message}</div>`;
    }
  }
  function _renderBalImportPanel() {
    return `
    <div class="card" style="border:2px solid #36b37e;margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;
                  flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;
                    letter-spacing:.06em;color:#006644">
          ⬆ Bulk Import Leave Balances (${new Date().getFullYear()})
        </div>
        <button class="btn btn-ghost btn-sm" id="btn-bal-template">⬇ Download Template</button>
      </div>

      <!-- Info box -->
      <div style="background:#e3fcef;border:1px solid #abf5d1;border-radius:6px;
                  padding:10px 14px;font-size:.82rem;color:#006644;
                  margin-bottom:14px;line-height:1.8">
        <strong>Required columns:</strong>
        <code style="background:#d4fae8;padding:1px 6px;border-radius:3px;font-size:.8rem">EmployeeCode</code>
        <code style="background:#d4fae8;padding:1px 6px;border-radius:3px;font-size:.8rem">LeaveType</code>
        <code style="background:#d4fae8;padding:1px 6px;border-radius:3px;font-size:.8rem">TotalDays</code><br>
        <strong>LeaveType</strong> must be the type code (e.g.
        <code style="background:#d4fae8;padding:1px 5px;border-radius:3px">CL</code>
        <code style="background:#d4fae8;padding:1px 5px;border-radius:3px">SL</code>
        <code style="background:#d4fae8;padding:1px 5px;border-radius:3px">EL</code>
        <code style="background:#d4fae8;padding:1px 5px;border-radius:3px">ML</code>
        <code style="background:#d4fae8;padding:1px 5px;border-radius:3px">PL</code> …)<br>
        <strong>EmployeeCode</strong> is the employee's ID number (e.g. 1252).
        Existing balances will be <strong>updated</strong>; missing ones will be <strong>created</strong>.
      </div>

      <!-- File upload -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">
          📁 Upload CSV file
          <input type="file" id="bal-import-file" accept=".csv,.txt" style="display:none" />
        </label>
        <span style="color:var(--text3);font-size:.82rem">— or paste CSV text below —</span>
      </div>

      <textarea class="form-control" id="bal-import-text" rows="7"
        style="font-family:monospace;font-size:.8rem;margin-bottom:12px"
        placeholder="EmployeeCode,LeaveType,TotalDays&#10;1001,CL,12&#10;1001,SL,10&#10;1001,EL,15&#10;1002,CL,12&#10;1002,ML,180"></textarea>

      <div id="bal-import-result"></div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-success" id="btn-bal-run-import">Import Balances</button>
        <button class="btn btn-ghost" id="btn-bal-cancel-import">Cancel</button>
      </div>
    </div>`;
  }

  // ── Import result display ────────────────────────────────────
  function _showBalImportResult(d) {
    const el = document.getElementById('bal-import-result');
    if (!el) return;
    el.innerHTML = `
    <div style="background:${d.updated>0?'#e3fcef':'#fff7d6'};
                border:1px solid ${d.updated>0?'#abf5d1':'#f6d860'};
                border-radius:6px;padding:12px 14px;margin-bottom:12px;font-size:.84rem">
      <div style="font-weight:700;color:${d.updated>0?'#006644':'#974f0c'};margin-bottom:6px">
        ${d.updated>0?'✓ ':''} ${d.message}
      </div>
      ${d.errors?.length ? `
      <div style="margin-top:8px;font-size:.78rem;color:#974f0c">
        <strong>Issues:</strong><br>
        ${d.errors.map(e => `Row ${e.row}: ${e.reason}`).join('<br>')}
      </div>` : ''}
    </div>`;
  }

  render();
}



