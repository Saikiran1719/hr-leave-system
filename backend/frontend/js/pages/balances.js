// frontend/js/pages/balances.js
async function renderBalances(container) {
  let selUID = null;

  async function render() {
    try {
      const users = await api.users({});
      if (!selUID && users.length) selUID = users[0].UserID;
      const selUser = users.find(u => u.UserID === selUID);
      const bal = selUID ? await api.userBalance2(selUID) : [];

      container.innerHTML = `
      <div class="page-anim">
        <h2 class="page-title">Manage Leave Balances</h2>
        <div style="display:flex;flex-direction:${isMobile()?'column':'row'};gap:16px">

          <div style="width:${isMobile()?'100%':'220px'};flex-shrink:0">
            <div class="card" style="padding:0;overflow:hidden">
              <div style="padding:10px 14px;background:var(--bg2);font-size:.65rem;color:var(--text3);font-weight:700;letter-spacing:.1em">EMPLOYEES</div>
              ${isMobile() ? `
                <select class="form-control" id="bal-sel" style="border-radius:0;border:none;border-top:1px solid var(--border)">
                  ${users.map(u=>`<option value="${u.UserID}"${u.UserID===selUID?' selected':''}>${u.FullName}</option>`).join('')}
                </select>` :
                users.map(u=>`
                  <button data-uid="${u.UserID}" style="width:100%;display:flex;align-items:center;gap:10px;padding:11px 14px;
                    background:${u.UserID===selUID?'rgba(99,102,241,.1)':'none'};border:none;
                    border-left:2.5px solid ${u.UserID===selUID?'var(--primary)':'transparent'};
                    color:${u.UserID===selUID?'#a5b4fc':'var(--text3)'};cursor:pointer;text-align:left;font-size:.86rem">
                    ${avatarHtml(getInitials(u.FullName),28)}
                    <div>
                      <div style="font-weight:${u.UserID===selUID?'600':'400'};font-size:.82rem">${u.FullName}</div>
                      <div style="font-size:.7rem;color:var(--text3)">${u.DepartmentName||''}</div>
                    </div>
                  </button>`).join('')
              }
            </div>
          </div>

          <div style="flex:1;min-width:0">
            ${selUser ? `
              <div class="card">
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">
                  ${avatarHtml(getInitials(selUser.FullName), 50)}
                  <div>
                    <div style="font-weight:700;font-size:1.05rem">${selUser.FullName}</div>
                    <div style="font-size:.8rem;color:var(--text3)">${selUser.DepartmentName||''} · ${roleChip(selUser.Role)}</div>
                  </div>
                </div>
                <div class="grid-4" id="bal-grid">
                  ${bal.map(b=>`
                  <div style="background:var(--bg);border-radius:var(--radius-sm);padding:14px">
                    <div style="font-size:.72rem;color:var(--text3);margin-bottom:6px">${b.TypeName}</div>
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
                      <input type="number" min="0" max="365" value="${b.TotalDays}"
                        data-lt="${b.LeaveTypeID}" data-year="${b.Year}"
                        style="width:52px;background:var(--surface);border:1px solid ${b.ColorHex}50;
                               border-radius:6px;padding:5px 6px;color:${b.ColorHex};
                               font-size:1rem;font-weight:700;text-align:center" />
                      <span style="font-size:.76rem;color:var(--text3)">/${b.MaxDaysPerYear||'?'}</span>
                    </div>
                    <div class="progress">
                      <div class="bar" style="width:${Math.min(100,(b.UsedDays/(b.TotalDays||1))*100)}%;background:${b.ColorHex}"></div>
                    </div>
                    <div style="font-size:.68rem;color:var(--text3);margin-top:4px">${b.UsedDays} used · ${b.RemainingDays} left</div>
                  </div>`).join('')}
                </div>
                <button class="btn btn-primary" id="btn-save-bal" style="margin-top:16px;width:auto;padding:10px 24px">Save Balances</button>
              </div>` : empty('Select an employee.')
            }
          </div>
        </div>
      </div>`;

      // Employee select (mobile)
      document.getElementById('bal-sel')?.addEventListener('change', function () {
        selUID = parseInt(this.value); render();
      });
      // Employee buttons (desktop)
      container.querySelectorAll('[data-uid]').forEach(btn =>
        btn.addEventListener('click', () => { selUID = parseInt(btn.dataset.uid); render(); })
      );
      // Save balances
      document.getElementById('btn-save-bal')?.addEventListener('click', async () => {
        const inputs = document.querySelectorAll('#bal-grid input');
        try {
          await Promise.all([...inputs].map(inp =>
            api.updateBalance(selUID, { leaveTypeID: inp.dataset.lt, totalDays: inp.value, year: inp.dataset.year })
          ));
          toast.success('Balances saved!'); render();
        } catch (e) { toast.error(e.message); }
      });
    } catch (e) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px">${e.message}</div>`;
    }
  }
  render();
}

// ─────────────────────────────────────────────────────────────────
// frontend/js/pages/reports.js
async function renderReports(container) {
  try {
    const { summary, byType, byDept } = await api.reports();

    const stats = [
      ['Employees',    summary.TotalEmployees, 'var(--primary)', '👥'],
      ['Applications', summary.Total,          'var(--info)',    '📋'],
      ['Approved',     summary.Approved,        'var(--success)','✅'],
      ['Pending',      summary.Pending,         'var(--warning)','⏳'],
    ];

    const maxD = Math.max(...byType.map(t => t.Days), 1);

    container.innerHTML = `
    <div class="page-anim">
      <h2 class="page-title">Reports & Analytics</h2>
      <div class="stats-row" style="margin-bottom:22px">
        ${stats.map(([l,v,c,i])=>`
          <div class="stat-card">
            <div class="stat-icon">${i}</div>
            <div class="stat-val" style="color:${c}">${v}</div>
            <div class="stat-label">${l}</div>
          </div>`).join('')}
      </div>

      <div class="grid-dash" style="margin-bottom:18px">
        <div class="card">
          <div class="card-title">Leave Usage by Type (Approved)</div>
          ${byType.map(t=>`
            <div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;font-size:.84rem;margin-bottom:4px">
                <span style="color:var(--text2)">${t.TypeName}</span>
                <span style="color:${t.ColorHex}">${t.Days}d · ${t.Requests} req</span>
              </div>
              <div class="progress">
                <div class="bar" style="width:${(t.Days/maxD)*100}%;background:${t.ColorHex}"></div>
              </div>
            </div>`).join('')}
        </div>
        <div class="card">
          <div class="card-title">Status Overview</div>
          <div class="grid-2" style="margin-bottom:14px">
            ${[['Approved',summary.Approved,'var(--success)'],['Rejected',summary.Rejected,'var(--danger)'],
               ['Pending', summary.Pending, 'var(--warning)'],['Total Days',summary.TotalDays,'var(--primary)']].map(([l,v,c])=>`
              <div style="background:var(--bg);border-radius:var(--radius-sm);padding:14px;text-align:center">
                <div style="font-size:1.4rem;font-weight:700;color:${c}">${v}</div>
                <div style="font-size:.72rem;color:var(--text3);margin-top:3px">${l}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Department Summary</div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Department</th><th>Employees</th><th>Requests</th><th>Days Used</th><th>Avg/Person</th>
            </tr></thead>
            <tbody>
              ${byDept.map(d=>`
                <tr>
                  <td>${d.DepartmentName}</td>
                  <td>${d.Employees}</td>
                  <td style="color:var(--primary)">${d.Requests}</td>
                  <td style="color:var(--warning)">${d.Days}</td>
                  <td style="color:var(--success)">${d.Employees?(d.Days/d.Employees).toFixed(1):'0'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  } catch (e) {
    container.innerHTML = `<div style="color:var(--danger);padding:20px">${e.message}</div>`;
  }
}

// ─────────────────────────────────────────────────────────────────
// frontend/js/pages/holidays.js
async function renderHolidays(container) {
  try {
    const hols = await api.holidays();
    const user = getUser();
    const isHR = user?.role === 'hr';
    const year = new Date().getFullYear();

    container.innerHTML = `
    <div class="page-anim">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px">
        <h2 class="page-title" style="margin:0">Holiday Calendar</h2>
        ${isHR ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="btn-hol-template"
            style="background:#fefce8;color:#ca8a04;border:1.5px solid #fde047;border-radius:8px;
                   padding:7px 14px;font-size:.78rem;font-weight:700;cursor:pointer">
            📋 Template
          </button>
          <label style="background:#eff6ff;color:#2563eb;border:1.5px solid #93c5fd;border-radius:8px;
                        padding:7px 14px;font-size:.78rem;font-weight:700;cursor:pointer;margin:0">
            📤 Import CSV
            <input type="file" id="hol-csv-file" accept=".csv" style="display:none"/>
          </label>
        </div>` : ''}
      </div>

      <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:var(--radius-sm);padding:12px 14px;font-size:.84rem;color:var(--text3);margin-bottom:18px">
        📌 These are <strong>paid public holidays</strong>. Leave cannot be applied on these dates.
      </div>

      <div id="hol-import-result" style="display:none;margin-bottom:14px"></div>

      <div class="grid-3">
        ${hols.map(h => {
          const past = h.HolidayDate?.split('T')[0] < todayStr();
          return `
          <div style="background:${past?'var(--bg2)':'var(--surface)'};border:1px solid ${past?'var(--border)':'rgba(245,158,11,.2)'};
                      border-radius:var(--radius);padding:16px;display:flex;gap:12px;align-items:center;opacity:${past?.65:1}">
            <div style="width:46px;height:46px;border-radius:10px;background:rgba(245,158,11,.12);
                        display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0">🎉</div>
            <div>
              <div style="font-weight:600;font-size:.92rem">${h.HolidayName}</div>
              <div style="color:var(--warning);font-size:.78rem;margin-top:3px">${fmtDate(h.HolidayDate)}</div>
              <div style="color:var(--text3);font-size:.72rem;margin-top:1px">
                ${new Date(h.HolidayDate).toLocaleDateString('en-IN',{weekday:'long'})}
              </div>
            </div>
            ${past?`<span style="margin-left:auto;font-size:.68rem;color:var(--text3);background:var(--surface2);border-radius:6px;padding:2px 7px;flex-shrink:0">Past</span>`:''}
          </div>`;
        }).join('')}
      </div>
    </div>`;

    // ── HR-only: Template download ──────────────────────────────
    if (isHR) {
      document.getElementById('btn-hol-template').addEventListener('click', () => {
        const lines = [
          '# HRnova Holiday Import Template',
          '# Instructions:',
          '#   1. Fill HolidayName and Date (YYYY-MM-DD)',
          '#   2. Delete comment lines (starting with #) before importing',
          '#   3. One holiday per row',
          '#',
          'HolidayName,Date',
          'Ugadi,2026-03-30',
          'May Day,2026-05-01',
          'Independence Day,2026-08-15',
          'Gandhi Jayanthi,2026-10-02',
          'Diwali,2026-11-01',
          'Christmas,2026-12-25',
        ];
        const blob = new Blob([lines.join('\r\n')], { type:'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href=url; a.download=`holiday_template_${year}.csv`; a.click();
        setTimeout(()=>URL.revokeObjectURL(url), 3000);
      });

      // ── HR-only: CSV Import ─────────────────────────────────
      document.getElementById('hol-csv-file').addEventListener('change', async function() {
        const file = this.files[0];
        if (!file) return;
        const resultEl = document.getElementById('hol-import-result');
        resultEl.style.display='';
        resultEl.innerHTML = `<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;
          padding:10px 14px;font-size:.82rem;color:#1d4ed8">⏳ Importing ${file.name}...</div>`;

        const text  = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
        if (lines.length < 2) {
          resultEl.innerHTML = `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;font-size:.82rem;color:#dc2626">❌ CSV has no data rows</div>`;
          this.value=''; return;
        }

        const headers = lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/[^a-z]/g,''));
        const nameIdx = headers.findIndex(h=>h.includes('holiday')||h.includes('name'));
        const dateIdx = headers.findIndex(h=>h.includes('date'));

        if (nameIdx===-1 || dateIdx===-1) {
          resultEl.innerHTML = `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;font-size:.82rem;color:#dc2626">❌ CSV must have HolidayName and Date columns</div>`;
          this.value=''; return;
        }

        let added=0, skipped=0, errors=[];
        const token = localStorage.getItem('hr_token')||'';

        for (let i=1; i<lines.length; i++) {
          const cols    = lines[i].split(',').map(c=>c.replace(/^"|"$/g,'').trim());
          const name    = cols[nameIdx];
          const dateRaw = cols[dateIdx];
          if (!name || !dateRaw) { skipped++; continue; }
          const dateObj = new Date(dateRaw);
          if (isNaN(dateObj.getTime())) {
            errors.push(`Row ${i+1}: Invalid date "${dateRaw}" — use YYYY-MM-DD`); continue;
          }
          const dateStr = dateObj.toISOString().slice(0,10);
          try {
            const resp = await fetch('/api/leaves/holidays', {
              method:'POST',
              headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
              body: JSON.stringify({ holidayName:name, holidayDate:dateStr, year:dateObj.getFullYear() })
            });
            const r = await resp.json();
            if (!resp.ok) { r.error?.includes('already exists') ? skipped++ : errors.push(`Row ${i+1}: ${r.error}`); }
            else added++;
          } catch(e) { errors.push(`Row ${i+1}: ${e.message}`); }
        }

        const color = added>0 ? '#16a34a' : '#dc2626';
        const bg    = added>0 ? '#f0fdf4' : '#fee2e2';
        const bd    = added>0 ? '#86efac' : '#fca5a5';
        const icon  = added>0 ? '✅' : '❌';
        const msg   = `${added} added${skipped?', '+skipped+' skipped (duplicates)':''}${errors.length?', '+errors.length+' errors':''}`;
        resultEl.innerHTML = `<div style="background:${bg};border:1px solid ${bd};border-radius:8px;padding:10px 14px;font-size:.82rem;font-weight:600;color:${color}">
          ${icon} ${msg}
          ${errors.slice(0,3).map(e=>`<div style="font-weight:400;margin-top:3px;font-size:.75rem">${e}</div>`).join('')}
        </div>`;

        this.value='';
        if (added > 0) setTimeout(()=>renderHolidays(container), 1400);
      });
    }

  } catch (e) {
    container.innerHTML = `<div style="color:var(--danger);padding:20px">${e.message}</div>`;
  }
}

