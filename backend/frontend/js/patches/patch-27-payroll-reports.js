// ================================================================
// HRnova — patch-27-payroll-reports.js
// Advanced Payroll Reports (HR only)
// ================================================================

api.payrollMonthly = (m,y)   => req('GET', `/payslip/reports/monthly?month=${m}&year=${y}`);
api.payrollDept    = (m,y)   => req('GET', `/payslip/reports/department?month=${m}&year=${y}`);
api.payrollLOP     = (m,y)   => req('GET', `/payslip/reports/lop?month=${m}&year=${y}`);
api.payrollYTD     = (y,uid) => req('GET', `/payslip/reports/ytd?year=${y}${uid?'&userID='+uid:''}`);

PAGES.hr = [...(PAGES.hr||[]), 'payrollreports'];
NAV.push({ id:'payrollreports', icon:'📊', label:'Payroll Reports', group:'hr' });

const _origNavPR = window.navigate;
window.navigate = function(page) {
  const mc = document.getElementById('main-content');
  if (page === 'payrollreports' && mc) {
    document.querySelectorAll('.nav-item').forEach(b =>
      b.classList.toggle('active', b.dataset.page === 'payrollreports'));
    renderPayrollReports(mc); return;
  }
  return _origNavPR(page);
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function fmtINR(n) {
  return '₹' + (parseFloat(n)||0).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2});
}

async function renderPayrollReports(container) {
  const now   = new Date();
  let tab     = 'monthly';
  let month   = now.getMonth() + 1;
  let year    = now.getFullYear();

  function tabBtn(id, label, active) {
    return `<button class="pr-tab ${active?'pr-tab-active':''}" data-tab="${id}"
      style="padding:8px 18px;border-radius:8px;border:none;font-size:.82rem;font-weight:700;
             cursor:pointer;transition:all .15s;
             background:${active?'linear-gradient(135deg,#1a3c6e,#2563eb)':'rgba(255,255,255,.06)'};
             color:${active?'#fff':'var(--text2)'}">
      ${label}
    </button>`;
  }

  function monthYearBar() {
    return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select id="pr-month" class="form-control" style="width:130px;font-size:.82rem">
        ${MONTHS_FULL.map((m,i)=>`<option value="${i+1}" ${i+1===month?'selected':''}>${m}</option>`).join('')}
      </select>
      <select id="pr-year" class="form-control" style="width:90px;font-size:.82rem">
        ${[year-1,year,year+1].map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}
      </select>
      <button id="pr-go" class="btn btn-primary" style="font-size:.82rem;padding:7px 16px">Go</button>
      <button id="pr-export" style="background:#f0fdf4;color:#16a34a;border:1.5px solid #86efac;
        border-radius:8px;padding:7px 14px;font-size:.78rem;font-weight:700;cursor:pointer">
        ⬇️ Export CSV
      </button>
    </div>`;
  }

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <h2 class="page-title" style="margin:0">📊 Payroll Reports</h2>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap;
                background:rgba(255,255,255,.04);border-radius:10px;padding:4px;
                border:1px solid var(--border);width:fit-content">
      ${tabBtn('monthly','💰 Monthly Summary',true)}
      ${tabBtn('dept','🏢 Department-wise',false)}
      ${tabBtn('lop','❌ LOP Report',false)}
      ${tabBtn('ytd','📈 Year-to-Date',false)}
    </div>
    <div id="pr-content"></div>`;

  // Tab switching
  container.querySelectorAll('.pr-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      container.querySelectorAll('.pr-tab').forEach(b => {
        const active = b.dataset.tab === tab;
        b.style.background = active ? 'linear-gradient(135deg,#1a3c6e,#2563eb)' : 'rgba(255,255,255,.06)';
        b.style.color = active ? '#fff' : 'var(--text2)';
      });
      loadTab();
    });
  });

  async function loadTab() {
    const el = document.getElementById('pr-content');
    el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">
      <div class="spinner"></div> Loading...</div>`;

    if (tab === 'ytd') { await loadYTD(el); return; }

    try {
      const data = tab === 'monthly' ? await api.payrollMonthly(month, year)
                 : tab === 'dept'    ? await api.payrollDept(month, year)
                                     : await api.payrollLOP(month, year);

      if (tab === 'monthly') renderMonthly(el, data);
      else if (tab === 'dept') renderDept(el, data);
      else renderLOP(el, data);
    } catch(e) {
      el.innerHTML = `<div style="color:var(--danger);padding:20px">Error: ${e.message}</div>`;
    }
  }

  loadTab();

  // Go button — delegate since content re-renders
  container.addEventListener('click', e => {
    if (e.target.id === 'pr-go') {
      month = parseInt(document.getElementById('pr-month')?.value) || month;
      year  = parseInt(document.getElementById('pr-year')?.value)  || year;
      loadTab();
    }
    if (e.target.id === 'pr-export') exportCSV();
  });

  // ── MONTHLY SUMMARY ─────────────────────────────────────────
  function renderMonthly(el, data) {
    const rows = data.rows || [];
    const t    = data.totals || {};
    el.innerHTML = `
      ${monthYearBar()}
      <!-- Summary cards -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0">
        ${[
          ['👥 Employees', data.employees||0, '#60a5fa'],
          ['💰 Total Gross', fmtINR(t.gross), '#4ade80'],
          ['💵 Total Net', fmtINR(t.net), '#a78bfa'],
          ['📉 Total Deductions', fmtINR(t.deduction), '#f87171'],
        ].map(([l,v,c])=>`
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:4px">${l}</div>
          <div style="font-size:1.1rem;font-weight:800;color:${c}">${v}</div>
        </div>`).join('')}
      </div>
      <!-- Deductions breakdown -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
        ${[['PF', t.pf,'#6366f1'],['ESI', t.esi,'#0ea5e9'],['LOP', t.lop,'#f97316']].map(([l,v,c])=>`
        <div style="background:${c}11;border:1px solid ${c}33;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:.78rem;font-weight:700;color:${c}">${l} Deductions</span>
          <span style="font-size:.88rem;font-weight:800;color:${c}">${fmtINR(v)}</span>
        </div>`).join('')}
      </div>
      <!-- Table -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div style="padding:12px 16px;background:var(--surface2);font-size:.72rem;font-weight:700;
                    color:var(--text3);text-transform:uppercase;letter-spacing:.06em">
          ${MONTHS_FULL[month-1]} ${year} — ${rows.length} employees
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:.78rem">
            <thead>
              <tr style="background:var(--surface2)">
                ${['Employee','Dept','Basic','Gross','PF','ESI','LOP','Net','Status'].map(h=>
                  `<th style="padding:9px 12px;text-align:left;color:var(--text3);font-size:.68rem;
                              text-transform:uppercase;border-bottom:1px solid var(--border)">${h}</th>`
                ).join('')}
              </tr>
            </thead>
            <tbody>
              ${!rows.length ? `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text3)">
                No payslips generated for this month yet</td></tr>` :
              rows.map(r=>`
              <tr style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
                <td style="padding:9px 12px;font-weight:600">${r.FullName}<br/>
                  <span style="font-size:.65rem;color:var(--text3)">${r.EmployeeCode||''}</span></td>
                <td style="padding:9px 12px;color:var(--text3)">${r.DepartmentName||'—'}</td>
                <td style="padding:9px 12px">${fmtINR(r.BasicSalary)}</td>
                <td style="padding:9px 12px;color:#4ade80;font-weight:600">${fmtINR(r.GrossSalary)}</td>
                <td style="padding:9px 12px;color:#818cf8">${fmtINR(r.PFDeduction)}</td>
                <td style="padding:9px 12px;color:#22d3ee">${fmtINR(r.ESIDeduction)}</td>
                <td style="padding:9px 12px;color:#fb923c">${fmtINR(r.LopDeduction)}</td>
                <td style="padding:9px 12px;color:#a78bfa;font-weight:800">${fmtINR(r.NetSalary)}</td>
                <td style="padding:9px 12px">
                  <span style="background:${r.Status==='published'?'#dcfce7':'#fef9c3'};
                    color:${r.Status==='published'?'#16a34a':'#ca8a04'};border-radius:20px;
                    padding:2px 8px;font-size:.65rem;font-weight:700">${r.Status||'draft'}</span>
                </td>
              </tr>`).join('')}
              <!-- Totals row -->
              ${rows.length ? `<tr style="background:var(--surface2);font-weight:800;border-top:2px solid var(--border)">
                <td style="padding:10px 12px" colspan="3">TOTAL (${rows.length} employees)</td>
                <td style="padding:10px 12px;color:#4ade80">${fmtINR(t.gross)}</td>
                <td style="padding:10px 12px;color:#818cf8">${fmtINR(t.pf)}</td>
                <td style="padding:10px 12px;color:#22d3ee">${fmtINR(t.esi)}</td>
                <td style="padding:10px 12px;color:#fb923c">${fmtINR(t.lop)}</td>
                <td style="padding:10px 12px;color:#a78bfa">${fmtINR(t.net)}</td>
                <td></td>
              </tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>`;
    window._prExportData = { type:'monthly', rows, month, year };
  }

  // ── DEPARTMENT WISE ─────────────────────────────────────────
  function renderDept(el, data) {
    const rows = data.rows || [];
    const maxNet = Math.max(...rows.map(r=>r.TotalNet||0), 1);
    el.innerHTML = `
      ${monthYearBar()}
      <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px">
        ${!rows.length ? `<div style="text-align:center;padding:40px;color:var(--text3)">No data for this period</div>` :
        rows.map((r,i)=>{
          const pct = Math.round((r.TotalNet/maxNet)*100);
          const colors = ['#6366f1','#0ea5e9','#16a34a','#f59e0b','#ef4444','#8b5cf6','#14b8a6'];
          const c = colors[i % colors.length];
          return `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
              <div>
                <div style="font-weight:800;font-size:.95rem">${r.DepartmentName||'Unassigned'}</div>
                <div style="font-size:.72rem;color:var(--text3);margin-top:2px">${r.EmployeeCount} employees</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:1.1rem;font-weight:800;color:${c}">${fmtINR(r.TotalNet)}</div>
                <div style="font-size:.68rem;color:var(--text3)">Net Payroll</div>
              </div>
            </div>
            <div style="background:var(--border);border-radius:20px;height:6px;margin-bottom:10px">
              <div style="background:${c};height:100%;border-radius:20px;width:${pct}%;transition:width .4s"></div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;font-size:.72rem">
              ${[['Gross',r.TotalGross,'#4ade80'],['PF',r.TotalPF,'#818cf8'],
                 ['ESI',r.TotalESI,'#22d3ee'],['LOP',r.TotalLOP,'#fb923c'],
                 ['Avg Net',r.AvgNet,'#a78bfa']].map(([l,v,col])=>`
              <div style="text-align:center">
                <div style="font-weight:700;color:${col}">${fmtINR(v)}</div>
                <div style="color:var(--text3)">${l}</div>
              </div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;
    window._prExportData = { type:'dept', rows, month, year };
  }

  // ── LOP REPORT ─────────────────────────────────────────────
  function renderLOP(el, data) {
    const rows = data.rows || [];
    const totalLOP = rows.reduce((s,r)=>s+(r.LopDeduction||0),0);
    el.innerHTML = `
      ${monthYearBar()}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0">
        ${[['Affected Employees',rows.length,'#f87171'],
           ['Total LOP Amount',fmtINR(totalLOP),'#fb923c'],
           ['Avg LOP Per Person',fmtINR(rows.length?totalLOP/rows.length:0),'#fbbf24']].map(([l,v,c])=>`
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:4px">${l}</div>
          <div style="font-size:1.1rem;font-weight:800;color:${c}">${v}</div>
        </div>`).join('')}
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:.78rem">
            <thead><tr style="background:var(--surface2)">
              ${['Employee','Dept','Working Days','Present','Absent','Basic Salary','LOP Deduction','Net Salary'].map(h=>
                `<th style="padding:9px 12px;text-align:left;color:var(--text3);font-size:.68rem;
                            text-transform:uppercase;border-bottom:1px solid var(--border)">${h}</th>`
              ).join('')}
            </tr></thead>
            <tbody>
              ${!rows.length ? `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">
                ✅ No LOP deductions this month!</td></tr>` :
              rows.map(r=>`
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:9px 12px;font-weight:600">${r.FullName}<br/>
                  <span style="font-size:.65rem;color:var(--text3)">${r.EmployeeCode||''}</span></td>
                <td style="padding:9px 12px;color:var(--text3)">${r.DepartmentName||'—'}</td>
                <td style="padding:9px 12px;text-align:center">${r.WorkingDays||0}</td>
                <td style="padding:9px 12px;text-align:center;color:#4ade80;font-weight:600">${r.PresentDays||0}</td>
                <td style="padding:9px 12px;text-align:center;color:#f87171;font-weight:700">${r.AbsentDays||0}</td>
                <td style="padding:9px 12px">${fmtINR(r.BasicSalary)}</td>
                <td style="padding:9px 12px;color:#fb923c;font-weight:800">${fmtINR(r.LopDeduction)}</td>
                <td style="padding:9px 12px;color:#a78bfa;font-weight:600">${fmtINR(r.NetSalary)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    window._prExportData = { type:'lop', rows, month, year };
  }

  // ── YEAR TO DATE ────────────────────────────────────────────
  async function loadYTD(el) {
    el.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
        <select id="pr-year" class="form-control" style="width:90px;font-size:.82rem">
          ${[year-1,year,year+1].map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}
        </select>
        <button id="pr-go" class="btn btn-primary" style="font-size:.82rem;padding:7px 16px">Load</button>
        <button id="pr-export" style="background:#f0fdf4;color:#16a34a;border:1.5px solid #86efac;
          border-radius:8px;padding:7px 14px;font-size:.78rem;font-weight:700;cursor:pointer">⬇️ Export CSV</button>
      </div>
      <div id="ytd-data"><div style="text-align:center;padding:40px;color:var(--text3)">Select year and click Load</div></div>`;

    container.addEventListener('click', async function ytdLoad(e) {
      if (e.target.id !== 'pr-go' || tab !== 'ytd') return;
      year = parseInt(document.getElementById('pr-year')?.value) || year;
      const ytdEl = document.getElementById('ytd-data');
      ytdEl.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3)">Loading...</div>`;
      try {
        const data = await api.payrollYTD(year);
        const emps = data.employees || [];
        ytdEl.innerHTML = emps.length === 0
          ? `<div style="text-align:center;padding:40px;color:var(--text3)">No payroll data for ${year}</div>`
          : emps.map(emp => `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;
                      padding:16px 20px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
              <div>
                <div style="font-weight:800">${emp.FullName} <span style="font-size:.72rem;color:var(--text3)">${emp.EmployeeCode||''}</span></div>
                <div style="font-size:.72rem;color:var(--text3)">${emp.DepartmentName||'—'}</div>
              </div>
              <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:.78rem;text-align:right">
                <div><div style="color:#4ade80;font-weight:800">${fmtINR(emp.totalGross)}</div><div style="color:var(--text3)">Total Gross</div></div>
                <div><div style="color:#a78bfa;font-weight:800">${fmtINR(emp.totalNet)}</div><div style="color:var(--text3)">Total Net</div></div>
                <div><div style="color:#818cf8;font-weight:700">${fmtINR(emp.totalPF)}</div><div style="color:var(--text3)">Total PF</div></div>
                <div><div style="color:#fb923c;font-weight:700">${fmtINR(emp.totalLOP)}</div><div style="color:var(--text3)">Total LOP</div></div>
              </div>
            </div>
            <!-- Monthly bars -->
            <div style="display:flex;gap:4px;align-items:flex-end;height:48px">
              ${MONTHS.map((mn,i) => {
                const md = emp.months.find(m=>m.month===i+1);
                const h  = md ? Math.max(8, Math.round((md.net/emp.totalNet)*48)) : 0;
                return `<div style="flex:1;background:${md?'#6366f1':'var(--border)'};height:${h}px;
                              border-radius:3px 3px 0 0;cursor:default" title="${mn}: ${md?fmtINR(md.net):'No data'}"></div>`;
              }).join('')}
            </div>
            <div style="display:flex;gap:4px;margin-top:3px">
              ${MONTHS.map(mn=>`<div style="flex:1;font-size:.55rem;color:var(--text3);text-align:center">${mn}</div>`).join('')}
            </div>
          </div>`).join('');
        window._prExportData = { type:'ytd', employees: emps, year };
      } catch(e) { ytdEl.innerHTML = `<div style="color:var(--danger)">${e.message}</div>`; }
    }, { once: false });
  }

  // ── CSV EXPORT ──────────────────────────────────────────────
  function exportCSV() {
    const d = window._prExportData;
    if (!d) { alert('Load a report first'); return; }
    let csvLines = [];

    if (d.type === 'monthly') {
      csvLines = [
        `HRnova Payroll Report — ${MONTHS_FULL[d.month-1]} ${d.year}`,
        'Employee,Code,Department,Basic,Gross,PF,ESI,Tax,LOP,Other Deductions,Net,Status',
        ...(d.rows||[]).map(r =>
          [r.FullName, r.EmployeeCode||'', r.DepartmentName||'',
           r.BasicSalary, r.GrossSalary, r.PFDeduction, r.ESIDeduction,
           r.TaxDeduction, r.LopDeduction, r.OtherDeduction, r.NetSalary, r.Status].join(','))
      ];
    } else if (d.type === 'dept') {
      csvLines = [
        `HRnova Department Payroll — ${MONTHS_FULL[d.month-1]} ${d.year}`,
        'Department,Employees,Total Gross,Total Net,Total PF,Total ESI,Total LOP,Avg Net',
        ...(d.rows||[]).map(r =>
          [r.DepartmentName||'Unassigned', r.EmployeeCount, r.TotalGross,
           r.TotalNet, r.TotalPF, r.TotalESI, r.TotalLOP, r.AvgNet].join(','))
      ];
    } else if (d.type === 'lop') {
      csvLines = [
        `HRnova LOP Report — ${MONTHS_FULL[d.month-1]} ${d.year}`,
        'Employee,Code,Department,Working Days,Present,Absent,Basic,LOP Deduction,Net',
        ...(d.rows||[]).map(r =>
          [r.FullName, r.EmployeeCode||'', r.DepartmentName||'',
           r.WorkingDays, r.PresentDays, r.AbsentDays,
           r.BasicSalary, r.LopDeduction, r.NetSalary].join(','))
      ];
    } else if (d.type === 'ytd') {
      csvLines = [
        `HRnova Year-to-Date Payroll — ${d.year}`,
        'Employee,Code,Department,Total Gross,Total Net,Total PF,Total Tax,Total LOP',
        ...(d.employees||[]).map(e =>
          [e.FullName, e.EmployeeCode||'', e.DepartmentName||'',
           e.totalGross, e.totalNet, e.totalPF, e.totalTax, e.totalLOP].join(','))
      ];
    }

    const blob = new Blob([csvLines.join('\r\n')], { type:'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `hrnova_payroll_${d.type}_${d.year}${d.month?'_'+d.month:''}.csv`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 3000);
  }
}

console.log('📊 Payroll Reports loaded');
