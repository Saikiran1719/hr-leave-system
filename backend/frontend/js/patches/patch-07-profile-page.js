// ==============================================================
// HRnova — patch-07-profile-page.js
// My Profile page — edit info, change password
// Lines 1096–1561 of original patch.js
// ==============================================================

// ================================================================
// 7. NEW renderReports — 3 tabs:
//    Overview | Employee-wise drilldown | Attendance / Salary cycle
// ================================================================
async function renderReports(container) {
  let tab       = 'overview';
  let drillUID  = null;
  const curYear = new Date().getFullYear();
  let selYear   = curYear;

  function defaultPeriod() {
    const now   = new Date();
    const m     = now.getMonth();
    const y     = now.getFullYear();
    const ps    = new Date(y, m - 1, 26);
    const pe    = new Date(y, m,     25);
    return { from: ps.toISOString().slice(0,10), to: pe.toISOString().slice(0,10) };
  }

  let { from: attFrom, to: attTo } = defaultPeriod();
  let attData    = null;
  let attLoading = false;

  async function render() {
    try {
      const { summary, byType, byDept, byEmployee } = await api.reports(selYear);
      const maxD = Math.max(...byType.map(t => t.Days), 1);

      container.innerHTML = `
      <div class="page-anim">
        <div style="display:flex;justify-content:space-between;align-items:center;
                    flex-wrap:wrap;gap:10px;margin-bottom:20px">
          <h2 class="page-title" style="margin:0">Reports &amp; Analytics</h2>
          <div style="display:flex;align-items:center;gap:8px">
            <label style="font-size:.82rem;color:var(--text3);font-weight:600">Year</label>
            <select class="form-control" id="rpt-year" style="width:90px;padding:6px 10px">
              ${[curYear,curYear-1,curYear-2].map(y =>
                `<option value="${y}"${y===selYear?' selected':''}>${y}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="tabs" style="margin-bottom:20px">
          <button class="tab${tab==='overview'?  ' active':''}" data-tab="overview">📊 Overview</button>
          <button class="tab${tab==='employee'?  ' active':''}" data-tab="employee">👤 Employee-wise</button>
          <button class="tab${tab==='attendance'?' active':''}" data-tab="attendance">📅 Attendance / Salary</button>
        </div>

        ${tab==='overview' ? renderOverviewTab(summary, byType, byDept, maxD) : ''}
        ${tab==='employee' ? renderEmployeeTab(byEmployee) : ''}
        ${tab==='attendance' ? renderAttendanceTab() : ''}
      </div>`;

      // Year
      document.getElementById('rpt-year')?.addEventListener('change', function () {
        selYear = parseInt(this.value); render();
      });

      // Tabs
      container.querySelectorAll('[data-tab]').forEach(t =>
        t.addEventListener('click', () => { tab=t.dataset.tab; drillUID=null; attData=null; render(); })
      );

      // Employee drilldown
      container.querySelectorAll('[data-drill]').forEach(btn =>
        btn.addEventListener('click', async () => {
          drillUID = parseInt(btn.dataset.drill);
          document.getElementById('drill-modal').classList.add('open');
          document.getElementById('drill-title').textContent = btn.dataset.name + ' — '+selYear;
          const body = document.getElementById('drill-body');
          body.innerHTML = '<div class="loader"><div class="spinner"></div>Loading…</div>';
          try {
            const token = localStorage.getItem('hr_token')||'';
            const res = await fetch(`/api/users/reports/employee/${drillUID}?year=${selYear}`,
              { headers:{'Authorization':'Bearer '+token} });
            const d = await res.json();
            body.innerHTML = renderDrillBody(d);
          } catch(e) { body.innerHTML = `<div style="color:#bf2600">${e.message}</div>`; }
        })
      );
      document.getElementById('drill-close')?.addEventListener('click', () => {
        drillUID=null; document.getElementById('drill-modal').classList.remove('open');
      });

      // Employee CSV export
      document.getElementById('btn-emp-rpt-export')?.addEventListener('click', async () => {
        const hdr = ['EmployeeCode','FullName','Department','TotalRequests','DaysApproved','Rejected','Pending'];
        const csv = [hdr.join(','), ...byEmployee.map(e =>
          [`"${e.EmployeeCode||''}"`,`"${e.FullName}"`,`"${e.DepartmentName||''}"`,
           e.TotalRequests,e.DaysApproved,e.Rejected,e.Pending].join(','))].join('\r\n');
        dlCSV(csv, `employee_report_${selYear}.csv`);
        toast.success('Downloaded!');
      });

      // Attendance quick-pick
      container.querySelectorAll('[data-cycle]').forEach(btn =>
        btn.addEventListener('click', () => {
          [attFrom, attTo] = btn.dataset.cycle.split('|');
          attData=null; render();
        })
      );

      // Load attendance
      document.getElementById('btn-att-load')?.addEventListener('click', async () => {
        attFrom = document.getElementById('att-from').value;
        attTo   = document.getElementById('att-to').value;
        if (!attFrom||!attTo||attFrom>attTo) { toast.error('Select a valid range'); return; }
        attLoading=true; attData=null; render();
        try {
          const token = localStorage.getItem('hr_token')||'';
          const r = await fetch(`/api/users/reports/attendance?from=${attFrom}&to=${attTo}`,
            { headers:{'Authorization':'Bearer '+token} });
          attData = await r.json();
        } catch(e) { toast.error(e.message); attData=[]; }
        attLoading=false; render();
      });

      // Export attendance
      document.getElementById('btn-att-export')?.addEventListener('click', async () => {
        const token = localStorage.getItem('hr_token')||'';
        const res = await fetch(
          `/api/users/reports/attendance/export?from=${attFrom}&to=${attTo}`,
          { headers:{'Authorization':'Bearer '+token} });
        if (!res.ok) { toast.error('Export failed'); return; }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `attendance_${attFrom}_to_${attTo}.csv`;
        a.click();
        toast.success('Downloaded!');
      });

    } catch(e) {
      container.innerHTML = `<div style="color:#bf2600;padding:20px">${e.message}</div>`;
    }
  }

  function renderOverviewTab(summary, byType, byDept, maxD) {
    return `
    <div class="stats-row" style="margin-bottom:20px">
      ${[['Total Employees',summary.TotalEmployees,'#0052cc','#e9f0ff','👥'],
         ['Applications',  summary.Total,          '#5243aa','#eae6ff','📋'],
         ['Approved',      summary.Approved,        '#006644','#e3fcef','✅'],
         ['Pending',       summary.Pending,         '#974f0c','#fff7d6','⏳']].map(([l,v,c,bg,ic])=>`
        <div class="stat-card">
          <div class="stat-icon-wrap" style="background:${bg}">${ic}</div>
          <div class="stat-body">
            <div class="stat-val" style="color:${c}">${v}</div>
            <div class="stat-label">${l}</div>
          </div>
        </div>`).join('')}
    </div>
    <div class="grid-dash" style="margin-bottom:18px">
      <div class="card">
        <div class="card-title">Leave Days by Type (Approved)</div>
        ${byType.length===0
          ? `<div class="empty" style="padding:20px 0"><p>No approved leaves yet.</p></div>`
          : byType.map(t=>`
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;font-size:.84rem;margin-bottom:5px">
              <span style="display:flex;align-items:center;gap:6px">
                <span style="width:10px;height:10px;border-radius:2px;background:${t.ColorHex};display:inline-block"></span>
                ${t.TypeName}
              </span>
              <span style="font-weight:700;color:${t.ColorHex}">${t.Days}d
                <span style="color:var(--text3);font-weight:400;font-size:.76rem">· ${t.Requests}</span>
              </span>
            </div>
            <div class="progress"><div class="bar" style="width:${(t.Days/maxD)*100}%;background:${t.ColorHex}"></div></div>
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title">Status Breakdown</div>
        <div class="grid-2" style="gap:10px;margin-bottom:0">
          ${[['Approved',summary.Approved,'#006644','#e3fcef'],
             ['Rejected',summary.Rejected,'#bf2600','#ffebe6'],
             ['Pending', summary.Pending, '#974f0c','#fff7d6'],
             ['Total Days',summary.TotalDays,'#0052cc','#e9f0ff']].map(([l,v,c,bg])=>`
            <div style="background:${bg};border-radius:6px;padding:14px;text-align:center">
              <div style="font-size:1.4rem;font-weight:700;color:${c}">${v}</div>
              <div style="font-size:.72rem;color:${c};opacity:.8;margin-top:2px">${l}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Department Summary</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Department</th><th>Employees</th><th>Requests</th><th>Days Taken</th><th>Avg/Person</th></tr></thead>
          <tbody>
            ${byDept.map(d=>`
              <tr>
                <td><b>${d.DepartmentName}</b></td><td>${d.Employees}</td>
                <td style="color:#0052cc;font-weight:600">${d.Requests}</td>
                <td style="color:#974f0c;font-weight:600">${d.Days}d</td>
                <td style="color:#006644">${d.Employees?(d.Days/d.Employees).toFixed(1)+'d':'—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function renderEmployeeTab(byEmployee) {
    return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px">
        <div class="card-title" style="margin:0">All Employees — ${selYear}</div>
        <button class="btn btn-ghost btn-sm" id="btn-emp-rpt-export">⬇ Export CSV</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Emp ID</th><th>Employee</th><th>Department</th>
            <th>Requests</th><th>Days Taken</th><th>Rejected</th><th>Pending</th><th></th>
          </tr></thead>
          <tbody>
            ${byEmployee.map(e=>`
              <tr>
                <td>${e.EmployeeCode
                  ? `<span style="background:#e9f0ff;color:#0052cc;border-radius:3px;
                                 padding:2px 7px;font-size:.7rem;font-weight:700;font-family:monospace">#${e.EmployeeCode}</span>`
                  : '—'}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    ${avatarHtml(getInitials(e.FullName),28)}
                    <span style="font-weight:600">${e.FullName}</span>
                  </div>
                </td>
                <td style="color:var(--text3)">${e.DepartmentName||'—'}</td>
                <td style="color:#0052cc;font-weight:600">${e.TotalRequests}</td>
                <td style="color:#006644;font-weight:700">${e.DaysApproved}d</td>
                <td style="color:${e.Rejected>0?'#bf2600':'var(--text3)'}">${e.Rejected}</td>
                <td style="color:${e.Pending>0?'#974f0c':'var(--text3)'}">${e.Pending}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" data-drill="${e.UserID}" data-name="${e.FullName}">
                    View →
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <!-- Drilldown modal -->
    <div class="modal-overlay${drillUID?' open':''}" id="drill-modal">
      <div class="modal" style="max-width:820px">
        <div class="modal-header">
          <span class="modal-title" id="drill-title">Employee Details</span>
          <button class="modal-close" id="drill-close">✕</button>
        </div>
        <div class="modal-body" id="drill-body">
          <div class="loader"><div class="spinner"></div>Loading…</div>
        </div>
      </div>
    </div>`;
  }

  function renderAttendanceTab() {
    const cycles = [];
    const now = new Date();
    for (let i=0;i<4;i++) {
      const m=now.getMonth()-i, y=now.getFullYear();
      const ps=new Date(y,m-1,26), pe=new Date(y,m,25);
      const lbl = ps.toLocaleDateString('en-IN',{month:'short',day:'numeric'})
                + ' – '
                + pe.toLocaleDateString('en-IN',{month:'short',day:'numeric',year:'numeric'});
      cycles.push({from:ps.toISOString().slice(0,10), to:pe.toISOString().slice(0,10), lbl});
    }
    return `
    <!-- Period picker card -->
    <div class="card" style="margin-bottom:18px">
      <div class="card-title">Attendance Period (Salary Cycle)</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:14px">
        <div class="form-group" style="margin:0;min-width:160px">
          <label class="form-label">Period From</label>
          <input class="form-control" type="date" id="att-from" value="${attFrom}" />
        </div>
        <div class="form-group" style="margin:0;min-width:160px">
          <label class="form-label">Period To</label>
          <input class="form-control" type="date" id="att-to" value="${attTo}" />
        </div>
        <div style="display:flex;gap:8px;padding-bottom:1px">
          <button class="btn btn-primary" id="btn-att-load">Load Report</button>
          <button class="btn btn-ghost btn-sm" id="btn-att-export" ${!attData?'disabled style="opacity:.5"':''}>
            ⬇ Export CSV
          </button>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span style="font-size:.75rem;color:var(--text3);font-weight:600">Quick:</span>
        ${cycles.map(c=>`
          <button class="btn btn-ghost btn-sm" data-cycle="${c.from}|${c.to}"
            style="font-size:.73rem;padding:3px 9px;border-radius:3px">${c.lbl}</button>`).join('')}
      </div>
    </div>

    ${attLoading ? `<div class="loader"><div class="spinner"></div>Loading attendance data…</div>` : ''}

    ${attData!==null && !attLoading ? `
    <!-- Summary strip -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:18px">
      ${(function(){
        const app=attData.filter(r=>r.Status==='approved');
        const rej=attData.filter(r=>r.Status==='rejected');
        const days=app.reduce((s,r)=>s+r.TotalDays,0);
        const emps=new Set(attData.map(r=>r.EmployeeCode||r.FullName)).size;
        return [
          ['Employees Affected', emps,         '#0052cc','#e9f0ff','👥'],
          ['Total Records',      attData.length,'#5243aa','#eae6ff','📋'],
          ['Approved Leaves',    app.length,   '#006644','#e3fcef','✅'],
          ['Days to Deduct',     days+'d',     '#974f0c','#fff7d6','📆'],
          ['Rejected',           rej.length,   '#bf2600','#ffebe6','✕'],
        ].map(([l,v,c,bg,ic])=>`
          <div style="background:${bg};border-radius:8px;padding:14px 16px;border:1px solid ${c}22">
            <div style="font-size:1.1rem;margin-bottom:4px">${ic}</div>
            <div style="font-size:1.25rem;font-weight:700;color:${c}">${v}</div>
            <div style="font-size:.7rem;color:${c};opacity:.8;margin-top:2px">${l}</div>
          </div>`).join('');
      })()}
    </div>

    <!-- Info banner -->
    <div style="background:#e9f0ff;border:1px solid #b3d4ff;border-left:3px solid #0052cc;
                border-radius:6px;padding:10px 14px;font-size:.82rem;color:#0052cc;
                margin-bottom:14px;line-height:1.7">
      📋 <strong>Period:</strong> ${fmtDate(attFrom)} → ${fmtDate(attTo)}
      &nbsp;&nbsp;|&nbsp;&nbsp;
      Salary payout: <strong>${(()=>{
        const pe = new Date(attTo+'T00:00:00');
        const sd = new Date(pe.getFullYear(), pe.getMonth()+1, 1);
        return sd.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
      })()}</strong>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      ${attData.length} leave record${attData.length!==1?'s':''} found
    </div>

    <!-- Table -->
    <div class="card">
      <div class="card-title">Leave Details — for Salary Processing</div>
      ${attData.length===0
        ? `<div class="empty"><div class="empty-icon">📋</div><p>No approved or rejected leaves in this period.</p></div>`
        : `<div class="table-wrap">
          <table>
            <thead><tr>
              <th>Emp ID</th><th>Employee</th><th>Department</th>
              <th>Type</th><th>From</th><th>To</th><th>Days</th>
              <th>Status</th><th>Approved By</th><th>Manager</th><th>Note</th>
            </tr></thead>
            <tbody>
              ${attData.map(r=>`
                <tr style="${r.Status==='rejected'?'opacity:.7':''}">
                  <td>${r.EmployeeCode
                    ? `<span style="background:#e9f0ff;color:#0052cc;border-radius:3px;
                                   padding:2px 6px;font-size:.7rem;font-weight:700;font-family:monospace">#${r.EmployeeCode}</span>`
                    : '—'}</td>
                  <td style="font-weight:600;white-space:nowrap">${r.FullName}</td>
                  <td style="color:var(--text3);white-space:nowrap">${r.DepartmentName||'—'}</td>
                  <td>
                    <span style="background:${r.ColorHex}18;color:${r.ColorHex};border-radius:3px;
                                 padding:2px 6px;font-size:.7rem;font-weight:700">${r.TypeCode}</span>
                  </td>
                  <td style="white-space:nowrap">${fmtDate(r.FromDate)}</td>
                  <td style="white-space:nowrap">${fmtDate(r.ToDate)}</td>
                  <td style="font-weight:700;color:${r.Status==='approved'?'#bf2600':'#8993a4'}">
                    ${r.TotalDays}${r.IsHalfDay?' <small>(½)</small>':''}
                  </td>
                  <td>${statusBadge(r.Status)}</td>
                  <td style="color:var(--text3);font-size:.8rem;white-space:nowrap">${r.ApprovedBy||'—'}</td>
                  <td style="color:var(--text3);font-size:.8rem;white-space:nowrap">${r.ManagerName||'—'}</td>
                  <td style="font-size:.76rem;color:var(--text3);max-width:130px;
                             overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                      title="${(r.ApproverComment||'').replace(/"/g,'&quot;')}">
                    ${r.ApproverComment||'—'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`}
    </div>` : ''}

    ${attData===null && !attLoading ? `
    <div class="empty" style="border:2px dashed var(--border);border-radius:8px;padding:48px 20px">
      <div class="empty-icon">📅</div>
      <p style="font-size:.95rem"><b>Select an attendance period and click Load Report</b></p>
      <p style="font-size:.82rem;margin-top:8px;color:var(--text3)">
        Your cycle: 26th of month → 25th of next month &nbsp;·&nbsp;
        Salary paid on 1st of following month
      </p>
    </div>` : ''}`;
  }

  function renderDrillBody(d) {
    const { profile, leaves, balance } = d;
    if (!profile) return '<p style="color:#bf2600">Employee not found</p>';
    const appDays = leaves.filter(l=>l.Status==='approved').reduce((s,l)=>s+l.TotalDays,0);
    return `
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;
                padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:14px">
      ${avatarHtml(getInitials(profile.FullName), 46)}
      <div style="flex:1">
        <div style="font-weight:700;font-size:1rem">${profile.FullName}</div>
        <div style="font-size:.8rem;color:var(--text3);margin-top:3px">
          ${profile.EmployeeCode?`<b style="color:#0052cc">#${profile.EmployeeCode}</b> · `:''}
          ${profile.DepartmentName||''} · ${profile.ManagerName?'Mgr: '+profile.ManagerName:''}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:1.5rem;font-weight:700;color:#0052cc">${appDays}d</div>
        <div style="font-size:.7rem;color:var(--text3)">Total approved</div>
      </div>
    </div>
    <!-- Balance mini-grid -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;margin-bottom:16px">
      ${balance.map(b=>`
        <div style="background:var(--surface2);border-radius:6px;padding:10px;text-align:center;
                    border-left:3px solid ${b.ColorHex}">
          <div style="font-size:.62rem;color:var(--text3);margin-bottom:3px">${b.TypeCode}</div>
          <div style="font-size:1.1rem;font-weight:700;color:${b.ColorHex}">${b.RemainingDays}</div>
          <div style="font-size:.62rem;color:var(--text3)">/ ${b.TotalDays}</div>
        </div>`).join('')}
    </div>
    <!-- Leave table -->
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Type</th><th>From</th><th>To</th><th>Days</th>
          <th>Status</th><th>Approved By</th><th>Note</th>
        </tr></thead>
        <tbody>
          ${leaves.length===0
            ? `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">No leaves this year</td></tr>`
            : leaves.map(l=>`
              <tr>
                <td><span style="background:${l.ColorHex}18;color:${l.ColorHex};border-radius:3px;
                                 padding:2px 6px;font-size:.7rem;font-weight:700">${l.TypeCode}</span></td>
                <td style="white-space:nowrap">${fmtDate(l.FromDate)}</td>
                <td style="white-space:nowrap">${fmtDate(l.ToDate)}</td>
                <td style="font-weight:700;color:#0052cc">${l.TotalDays}${l.IsHalfDay?' <small>(½)</small>':''}</td>
                <td>${statusBadge(l.Status)}</td>
                <td style="color:var(--text3);font-size:.8rem">${l.ApproverName||'—'}</td>
                <td style="font-size:.76rem;color:var(--text3)">${l.ApproverComment||'—'}</td>
              </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function dlCSV(csv, name) {
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = name; a.click();
  }

  render();
}

// api helper — reports now accepts year
const _origApiReports = api.reports.bind(api);
api.reports = function(year) {
  return _origApiReports(year);
};

console.log('✅ patch.js — Reports + Attendance Cycle + Employee Drilldown loaded');

