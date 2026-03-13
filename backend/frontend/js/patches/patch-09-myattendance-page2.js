// ==============================================================
// HRnova — patch-09-myattendance-page2.js
// My Attendance page — Part 2 + navigation
// Lines 1842–2350 of original patch.js
// ==============================================================

// ================================================================
// 9. ATTENDANCE MODULE
//    — Add to HR nav + PAGES
//    — renderAttendance: 3 tabs: Daily | Import | Payroll Report
// ================================================================

// Add to HR pages list and nav
PAGES.hr = [...PAGES.hr, 'attendance'];
NAV.push({ id:'attendance', icon:'🕐', label:'Attendance', group:'hr' });

// Register in navigate() map — patch via override
const _origNavigate = window.navigate;
window.navigate = function(page) {
  if (page === 'attendance') {
    const content = document.getElementById('main-content');
    if (content) {
      document.querySelectorAll('.nav-item').forEach(b =>
        b.classList.toggle('active', b.dataset.page === 'attendance')
      );
      content.innerHTML = '<div class="loader"><div class="spinner"></div>Loading…</div>';
      renderAttendance(content);
    }
    return;
  }
  _origNavigate(page);
};

// ── API helpers ─────────────────────────────────────────────────
api.attSummary  = (p) => { const t=localStorage.getItem('hr_token')||''; return fetch(`/api/attendance/summary?${new URLSearchParams(p)}`,{headers:{'Authorization':'Bearer '+t}}).then(r=>r.json()); };
api.attPayroll  = (p) => { const t=localStorage.getItem('hr_token')||''; return fetch(`/api/attendance/payroll?${new URLSearchParams(p)}`,{headers:{'Authorization':'Bearer '+t}}).then(r=>r.json()); };
api.attImport   = (rows) => { const t=localStorage.getItem('hr_token')||''; return fetch('/api/attendance/import',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify({rows})}).then(r=>r.json()); };
api.attCompute  = (from,to) => { const t=localStorage.getItem('hr_token')||''; return fetch('/api/attendance/compute',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify({from,to})}).then(r=>r.json()); };

// ── Status config ────────────────────────────────────────────────
const ATT_STATUS = {
  PRESENT:    { label:'Present',    bg:'#e3fcef', color:'#006644' },
  LATE:       { label:'Late',       bg:'#fff7d6', color:'#974f0c' },
  EARLY_EXIT: { label:'Early Exit', bg:'#fff0e0', color:'#b35a00' },
  LATE_EARLY: { label:'Late+Early', bg:'#ffe0b2', color:'#7a3500' },
  ABSENT:     { label:'Absent',     bg:'#ffebe6', color:'#bf2600' },
  ON_LEAVE:   { label:'On Leave',   bg:'#e9f0ff', color:'#0052cc' },
  HOLIDAY:    { label:'Holiday',    bg:'#f3e6ff', color:'#403294' },
  HALF_DAY:   { label:'Half Day',   bg:'#fff7d6', color:'#974f0c' },
  WEEKEND:    { label:'Weekend',    bg:'#f4f5f7', color:'#b3bac5' },
};

function attBadge(status) {
  const s = ATT_STATUS[status] || { label: status, bg:'#f4f5f7', color:'#8993a4' };
  return `<span style="background:${s.bg};color:${s.color};border-radius:3px;
                       padding:2px 8px;font-size:.7rem;font-weight:700;
                       white-space:nowrap">${s.label}</span>`;
}

function fmtMins(mins) {
  if (!mins && mins !== 0) return '—';
  const h = Math.floor(mins/60), m = mins%60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(t) {
  if (!t || t === 'NULL') return '—';
  var s = String(t).trim();
  // 24-hour format: extract HH:MM directly
  var hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return ('0'+parseInt(hm[1])).slice(-2) + ':' + hm[2];
  // datetime string — split on T or space, take time part
  var sp = s.replace('T',' ').replace(/\..*$/,'').split(' ');
  if (sp.length > 1) {
    var tp = sp[1].split(':');
    return ('0'+parseInt(tp[0])).slice(-2) + ':' + tp[1];
  }
  return s;
}

// ── Main render ──────────────────────────────────────────────────
async function renderAttendance(container) {
  let tab        = 'daily';
  let dailyDate  = todayStr();
  let importShow = false;

  // Payroll period defaults to current cycle (26th prev → 25th curr)
  function cycleDefault() {
    const now=new Date(), m=now.getMonth(), y=now.getFullYear();
    return { from: new Date(y,m-1,26).toISOString().slice(0,10),
             to:   new Date(y,m,  25).toISOString().slice(0,10) };
  }
  let { from: payFrom, to: payTo } = cycleDefault();
  let payData    = null;
  let payLoading = false;
  let deptFilter = '';

  async function render() {
    try {
      const depts = await api.departments();
      container.innerHTML = `
      <div class="page-anim">
        <div style="display:flex;justify-content:space-between;align-items:center;
                    flex-wrap:wrap;gap:10px;margin-bottom:20px">
          <h2 class="page-title" style="margin:0">🕐 Attendance</h2>
          <div style="font-size:.78rem;color:var(--text3);background:var(--surface2);
                      border-radius:6px;padding:6px 12px">
            Office: <b>08:30 – 17:00</b> &nbsp;·&nbsp;
            Grace: <b>±15 min</b> &nbsp;·&nbsp;
            Full day: <b>8 hrs</b>
          </div>
        </div>

        <div class="tabs" style="margin-bottom:20px">
          <button class="tab${tab==='daily'?  ' active':''}" data-tab="daily">📅 Daily View</button>
          <button class="tab${tab==='import'? ' active':''}" data-tab="import">⬆ Import Punches</button>
          <button class="tab${tab==='payroll'?' active':''}" data-tab="payroll">💰 Payroll Report</button>
        </div>

        ${tab==='daily'  ? renderDailyTab(depts)   : ''}
        ${tab==='import' ? renderImportTab()        : ''}
        ${tab==='payroll'? renderPayrollTab(depts)  : ''}
      </div>`;

      // Tab switch
      container.querySelectorAll('[data-tab]').forEach(t =>
        t.addEventListener('click', () => { tab=t.dataset.tab; render(); })
      );

      // ── DAILY TAB wiring ────────────────────────────────────────
      if (tab === 'daily') {
        // Date nav
        document.getElementById('att-date-input')?.addEventListener('change', function() {
          dailyDate = this.value; loadDaily();
        });
        document.getElementById('att-prev')?.addEventListener('click', () => {
          dailyDate = new Date(new Date(dailyDate).getTime()-86400000).toISOString().slice(0,10);
          document.getElementById('att-date-input').value = dailyDate; loadDaily();
        });
        document.getElementById('att-next')?.addEventListener('click', () => {
          dailyDate = new Date(new Date(dailyDate).getTime()+86400000).toISOString().slice(0,10);
          document.getElementById('att-date-input').value = dailyDate; loadDaily();
        });
        document.getElementById('att-today')?.addEventListener('click', () => {
          dailyDate = todayStr(); document.getElementById('att-date-input').value = dailyDate; loadDaily();
        });
        document.getElementById('att-dept-filter')?.addEventListener('change', function() {
          deptFilter = this.value; loadDaily();
        });
        document.getElementById('btn-att-compute')?.addEventListener('click', async () => {
          const btn = document.getElementById('btn-att-compute');
          btn.disabled=true; btn.textContent='Computing…';
          try {
            await api.attCompute(dailyDate, dailyDate);
            toast.success('Recomputed!'); loadDaily();
          } catch(e) { toast.error(e.message); }
          btn.disabled=false; btn.textContent='⟳ Recompute';
        });
        loadDaily();
      }

      // ── IMPORT TAB wiring ───────────────────────────────────────
      if (tab === 'import') {
        document.getElementById('att-import-file')?.addEventListener('change', function() {
          const file = this.files[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = e => {
            document.getElementById('att-import-text').value = e.target.result;
            toast.info('File loaded — click Import.');
          };
          reader.readAsText(file);
        });

        document.getElementById('btn-att-dl-template')?.addEventListener('click', () => {
          const csv = [
            'EmployeeCode,PunchTime,PunchType',
            '1252,2026-03-09 08:27:00,IN',
            '1252,2026-03-09 13:02:00,OUT',
            '1252,2026-03-09 13:35:00,IN',
            '1252,2026-03-09 17:04:00,OUT',
            '1243,2026-03-09 08:31:00,IN',
            '1243,2026-03-09 17:01:00,OUT',
          ].join('\r\n');
          const a=document.createElement('a');
          a.href='data:text/csv,'+encodeURIComponent(csv);
          a.download='attendance_import_template.csv'; a.click();
          toast.info('Template downloaded!');
        });

        document.getElementById('btn-att-run-import')?.addEventListener('click', async () => {
          const raw = document.getElementById('att-import-text').value.trim();
          if (!raw) { toast.error('Paste or upload CSV first'); return; }
          const rows = _parseCSV(raw);
          if (!rows.length) { toast.error('No valid rows found'); return; }
          const btn = document.getElementById('btn-att-run-import');
          btn.disabled=true; btn.textContent='Importing…';
          try {
            const d = await api.attImport(rows);
            _showAttImportResult(d);
            if (d.added > 0) toast.success(d.message);
          } catch(e) { toast.error(e.message); }
          btn.disabled=false; btn.textContent='Import Punches';
        });
      }

      // ── PAYROLL TAB wiring ──────────────────────────────────────
      if (tab === 'payroll') {
        // Quick cycle buttons
        container.querySelectorAll('[data-cycle]').forEach(btn =>
          btn.addEventListener('click', () => {
            [payFrom, payTo] = btn.dataset.cycle.split('|');
            payData=null; render();
          })
        );
        document.getElementById('btn-pay-load')?.addEventListener('click', async () => {
          payFrom = document.getElementById('pay-from').value;
          payTo   = document.getElementById('pay-to').value;
          if (!payFrom||!payTo||payFrom>payTo) { toast.error('Select valid range'); return; }
          payLoading=true; payData=null; render();
          try {
            const d = await api.attPayroll({ from: payFrom, to: payTo });
            payData = d.data;
          } catch(e) { toast.error(e.message); payData=[]; }
          payLoading=false; render();
        });
        document.getElementById('btn-pay-export')?.addEventListener('click', async () => {
          const t=localStorage.getItem('hr_token')||'';
          const res = await fetch(`/api/attendance/payroll/export?from=${payFrom}&to=${payTo}`,
            {headers:{'Authorization':'Bearer '+t}});
          if (!res.ok) { toast.error('Export failed'); return; }
          const blob=await res.blob(), a=document.createElement('a');
          a.href=URL.createObjectURL(blob);
          a.download=`payroll_attendance_${payFrom}_to_${payTo}.csv`;
          a.click(); toast.success('Downloaded!');
        });
      }

    } catch(e) { container.innerHTML=`<div style="color:#bf2600;padding:20px">${e.message}</div>`; }
  }

  // ── Load daily attendance data ──────────────────────────────────
  async function loadDaily() {
    const grid = document.getElementById('att-daily-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="loader"><div class="spinner"></div>Loading…</div>';
    try {
      const params = { from: dailyDate, to: dailyDate };
      if (deptFilter) params.dept = deptFilter;
      const rows = await api.attSummary(params);
      if (rows.length === 0) {
        grid.innerHTML = `<div class="empty"><div class="empty-icon">🕐</div>
          <p>No attendance data for this date.</p>
          <p style="font-size:.8rem;color:var(--text3)">Import punch data or click ⟳ Recompute.</p></div>`;
        return;
      }
      // Summary strip
      const present = rows.filter(r=>['PRESENT','LATE','EARLY_EXIT','LATE_EARLY'].includes(r.Status)).length;
      const absent  = rows.filter(r=>r.Status==='ABSENT').length;
      const onLeave = rows.filter(r=>r.Status==='ON_LEAVE').length;
      const late    = rows.filter(r=>['LATE','LATE_EARLY'].includes(r.Status)).length;
      grid.innerHTML = `
      <!-- Stats strip -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:16px">
        ${[['Present',present,'#006644','#e3fcef'],['Absent',absent,'#bf2600','#ffebe6'],
           ['On Leave',onLeave,'#0052cc','#e9f0ff'],['Late',late,'#974f0c','#fff7d6']].map(([l,v,c,bg])=>`
          <div style="background:${bg};border-radius:8px;padding:12px 14px;text-align:center">
            <div style="font-size:1.3rem;font-weight:700;color:${c}">${v}</div>
            <div style="font-size:.72rem;color:${c};opacity:.8;margin-top:2px">${l}</div>
          </div>`).join('')}
      </div>
      <!-- Table -->
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Emp ID</th><th>Employee</th><th>Department</th>
            <th>First In</th><th>Last Out</th><th>Work Hours</th>
            <th>Status</th><th>Late By</th><th>Early By</th>
          </tr></thead>
          <tbody>
            ${rows.filter(r=>r.Status!=='WEEKEND').map(r=>`
              <tr>
                <td>${r.EmployeeCode?`<span style="background:#e9f0ff;color:#0052cc;border-radius:3px;
                                             padding:2px 6px;font-size:.7rem;font-weight:700;
                                             font-family:monospace">#${r.EmployeeCode}</span>`:'—'}</td>
                <td style="font-weight:600">${r.FullName}</td>
                <td style="color:var(--text3)">${r.DepartmentName||'—'}</td>
                <td style="font-family:monospace;font-size:.85rem;color:${r.IsLate?'#bf2600':'var(--text)'}">${fmtTime(r.FirstIn)}</td>
                <td style="font-family:monospace;font-size:.85rem;color:${r.IsEarlyExit?'#bf2600':'var(--text)'}">${fmtTime(r.LastOut)}</td>
                <td style="font-weight:600;color:${(r.WorkMinutes||0)<480?'#974f0c':'#006644'}">
                  ${fmtMins(r.WorkMinutes)}
                </td>
                <td>${attBadge(r.Status)}${r.LeaveType?`<span style="font-size:.7rem;color:#0052cc;margin-left:4px">${r.LeaveType}</span>`:''}</td>
                <td style="color:${r.LateMinutes>0?'#bf2600':'var(--text3)'}">
                  ${r.LateMinutes>0?fmtMins(r.LateMinutes):'—'}
                </td>
                <td style="color:${r.EarlyExitMins>0?'#bf2600':'var(--text3)'}">
                  ${r.EarlyExitMins>0?fmtMins(r.EarlyExitMins):'—'}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    } catch(e) { grid.innerHTML=`<div style="color:#bf2600;padding:20px">${e.message}</div>`; }
  }

  // ── Tab HTML builders ────────────────────────────────────────────
  function renderDailyTab(depts) {
    const dispDate = new Date(dailyDate+'T00:00:00').toLocaleDateString('en-IN',
      {weekday:'long',day:'numeric',month:'long',year:'numeric'});
    return `
    <!-- Date navigator -->
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px">
      <button class="btn btn-ghost btn-sm" id="att-prev">‹ Prev</button>
      <input class="form-control" type="date" id="att-date-input" value="${dailyDate}"
        style="width:160px" />
      <button class="btn btn-ghost btn-sm" id="att-next">Next ›</button>
      <button class="btn btn-ghost btn-sm" id="att-today">Today</button>
      <span style="font-size:.84rem;color:var(--text3);font-weight:600">${dispDate}</span>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select class="form-control" id="att-dept-filter" style="width:160px;padding:6px 10px">
          <option value="">All Departments</option>
          ${depts.map(d=>`<option value="${d.DepartmentID}"${deptFilter==d.DepartmentID?' selected':''}>${d.DepartmentName}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" id="btn-att-compute" title="Recompute from raw punches">⟳ Recompute</button>
      </div>
    </div>
    <div id="att-daily-grid">
      <div class="loader"><div class="spinner"></div>Loading…</div>
    </div>`;
  }

  function renderImportTab() {
    return `
    <div class="card" style="border:2px solid #36b37e;max-width:720px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#006644">
          ⬆ Import Punch Data (CSV)
        </div>
        <button class="btn btn-ghost btn-sm" id="btn-att-dl-template">⬇ Download Template</button>
      </div>

      <div style="background:#e3fcef;border:1px solid #abf5d1;border-radius:6px;
                  padding:10px 14px;font-size:.82rem;color:#006644;margin-bottom:14px;line-height:1.8">
        <strong>Required columns:</strong>
        <code style="background:#d4fae8;padding:1px 6px;border-radius:3px">EmployeeCode</code>
        <code style="background:#d4fae8;padding:1px 6px;border-radius:3px">PunchTime</code>
        <code style="background:#d4fae8;padding:1px 6px;border-radius:3px">PunchType</code><br>
        <strong>PunchType:</strong> <code>IN</code> or <code>OUT</code> (or <code>BRK</code> for break)<br>
        <strong>PunchTime format:</strong> <code>YYYY-MM-DD HH:MM:SS</code> (e.g. 2026-03-09 08:27:00)<br>
        Also accepts ESSL columns: <code>USERID</code>, <code>CHECKTIME</code>, <code>CHECKTYPE</code>
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">
          📁 Upload CSV
          <input type="file" id="att-import-file" accept=".csv,.txt" style="display:none" />
        </label>
        <span style="font-size:.8rem;color:var(--text3)">— or paste CSV below —</span>
      </div>

      <textarea class="form-control" id="att-import-text" rows="8"
        style="font-family:monospace;font-size:.79rem;margin-bottom:12px"
        placeholder="EmployeeCode,PunchTime,PunchType&#10;1252,2026-03-09 08:27:00,IN&#10;1252,2026-03-09 17:04:00,OUT&#10;1243,2026-03-09 08:31:00,IN&#10;1243,2026-03-09 17:01:00,OUT"></textarea>

      <div id="att-import-result"></div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-success" id="btn-att-run-import">Import Punches</button>
      </div>

      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);
                  font-size:.78rem;color:var(--text3);line-height:1.7">
        💡 After import, attendance summaries (Present/Absent/Late/etc.) are <b>auto-computed</b>
        for all affected dates. Go to <b>Daily View</b> to see results.<br>
        When your ESSL machine is ready, we'll replace this with a live sync — same column format.
      </div>
    </div>`;
  }

  function renderPayrollTab(depts) {
    const now=new Date(), m=now.getMonth(), y=now.getFullYear();
    const cycles=[];
    for(let i=0;i<4;i++){
      const ps=new Date(y,m-1-i,26), pe=new Date(y,m-i,25);
      cycles.push({
        from:ps.toISOString().slice(0,10), to:pe.toISOString().slice(0,10),
        lbl: ps.toLocaleDateString('en-IN',{month:'short',day:'numeric'})
           + ' – '
           + pe.toLocaleDateString('en-IN',{month:'short',day:'numeric',year:'numeric'})
      });
    }
    return `
    <!-- Period picker -->
    <div class="card" style="margin-bottom:18px">
      <div class="card-title">Salary / Payroll Period</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:12px">
        <div class="form-group" style="margin:0;min-width:160px">
          <label class="form-label">From</label>
          <input class="form-control" type="date" id="pay-from" value="${payFrom}" />
        </div>
        <div class="form-group" style="margin:0;min-width:160px">
          <label class="form-label">To</label>
          <input class="form-control" type="date" id="pay-to" value="${payTo}" />
        </div>
        <div style="display:flex;gap:8px;padding-bottom:1px">
          <button class="btn btn-primary" id="btn-pay-load">Load Report</button>
          <button class="btn btn-ghost btn-sm" id="btn-pay-export" ${!payData?'disabled style="opacity:.5"':''}>
            ⬇ Export CSV
          </button>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span style="font-size:.75rem;color:var(--text3);font-weight:600">Quick:</span>
        ${cycles.map(c=>`
          <button class="btn btn-ghost btn-sm" data-cycle="${c.from}|${c.to}"
            style="font-size:.73rem;padding:3px 9px">${c.lbl}</button>`).join('')}
      </div>
    </div>

    ${payLoading?`<div class="loader"><div class="spinner"></div>Generating report…</div>`:''}

    ${payData!==null && !payLoading ? `
    <!-- Summary strip -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:18px">
      ${(()=>{
        const tot=payData.reduce((s,r)=>({
          p:s.p+r.PresentDays, a:s.a+r.AbsentDays, l:s.l+r.LeaveDays,
          late:s.late+r.LateDays, h:s.h+(r.TotalWorkMinutes||0)
        }),{p:0,a:0,l:0,late:0,h:0});
        return [
          ['Total Present', tot.p,    '#006644','#e3fcef','✅'],
          ['Total Absent',  tot.a,    '#bf2600','#ffebe6','❌'],
          ['On Leave',      tot.l,    '#0052cc','#e9f0ff','📋'],
          ['Late Days',     tot.late, '#974f0c','#fff7d6','⏰'],
          ['Work Hours',    (tot.h/60).toFixed(0)+'h','#5243aa','#eae6ff','🕐'],
        ].map(([l,v,c,bg,ic])=>`
          <div style="background:${bg};border-radius:8px;padding:14px 16px;border:1px solid ${c}22">
            <div style="font-size:1.1rem;margin-bottom:4px">${ic}</div>
            <div style="font-size:1.3rem;font-weight:700;color:${c}">${v}</div>
            <div style="font-size:.7rem;color:${c};opacity:.8;margin-top:2px">${l}</div>
          </div>`).join('');
      })()}
    </div>

    <!-- Info banner -->
    <div style="background:#e9f0ff;border-left:3px solid #0052cc;border-radius:0 6px 6px 0;
                padding:10px 14px;font-size:.82rem;color:#0052cc;margin-bottom:14px">
      📅 Period: <b>${fmtDate(payFrom)}</b> → <b>${fmtDate(payTo)}</b>
      &nbsp;·&nbsp; Salary Date: <b>${(()=>{
        const pe=new Date(payTo+'T00:00:00');
        return new Date(pe.getFullYear(),pe.getMonth()+1,1)
          .toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
      })()}</b>
      &nbsp;·&nbsp; ${payData.length} employees
    </div>

    <!-- Payroll table -->
    <div class="card">
      <div class="card-title">Employee Attendance Summary — Payroll Ready</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Emp ID</th><th>Employee</th><th>Department</th>
            <th style="color:#006644">Present</th>
            <th style="color:#bf2600">Absent</th>
            <th style="color:#0052cc">Leave</th>
            <th style="color:#974f0c">Late Days</th>
            <th style="color:#b35a00">Early Exit</th>
            <th>Holidays</th>
            <th>Work Hours</th>
          </tr></thead>
          <tbody>
            ${payData.map(r=>`
              <tr>
                <td>${r.EmployeeCode?`<span style="background:#e9f0ff;color:#0052cc;border-radius:3px;
                                           padding:2px 6px;font-size:.7rem;font-weight:700;
                                           font-family:monospace">#${r.EmployeeCode}</span>`:'—'}</td>
                <td style="font-weight:600">${r.FullName}</td>
                <td style="color:var(--text3)">${r.DepartmentName||'—'}</td>
                <td style="color:#006644;font-weight:700;text-align:center">${r.PresentDays}</td>
                <td style="color:${r.AbsentDays>0?'#bf2600':'var(--text3)'};text-align:center;font-weight:${r.AbsentDays>0?700:400}">${r.AbsentDays}</td>
                <td style="color:${r.LeaveDays>0?'#0052cc':'var(--text3)'};text-align:center">${r.LeaveDays}</td>
                <td style="color:${r.LateDays>0?'#974f0c':'var(--text3)'};text-align:center">${r.LateDays}</td>
                <td style="color:${r.EarlyExitDays>0?'#b35a00':'var(--text3)'};text-align:center">${r.EarlyExitDays}</td>
                <td style="text-align:center;color:var(--text3)">${r.Holidays}</td>
                <td style="font-weight:600;color:#5243aa">${((r.TotalWorkMinutes||0)/60).toFixed(1)}h</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    ${payData===null && !payLoading ? `
    <div class="empty" style="border:2px dashed var(--border);border-radius:8px;padding:48px 20px">
      <div class="empty-icon">💰</div>
      <p><b>Select a period and click Load Report</b></p>
      <p style="font-size:.8rem;margin-top:6px;color:var(--text3)">
        Cycle: 26th → 25th &nbsp;·&nbsp; Salary on 1st of next month
      </p>
    </div>` : ''}`;
  }

  function _showAttImportResult(d) {
    const el=document.getElementById('att-import-result'); if(!el) return;
    el.innerHTML=`
    <div style="background:${d.added>0?'#e3fcef':'#fff7d6'};border:1px solid ${d.added>0?'#abf5d1':'#f6d860'};
                border-radius:6px;padding:12px 14px;margin-bottom:12px;font-size:.84rem">
      <div style="font-weight:700;color:${d.added>0?'#006644':'#974f0c'};margin-bottom:6px">
        ${d.added>0?'✓ ':''}${d.message}
      </div>
      ${d.errors?.length?`<div style="margin-top:8px;font-size:.78rem;color:#974f0c">
        <strong>Issues:</strong><br>${d.errors.map(e=>`Row ${e.row}: ${e.reason}`).join('<br>')}
      </div>`:''}
    </div>`;
  }

  render();
}

