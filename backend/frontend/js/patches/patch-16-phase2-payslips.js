// ==============================================================
// HRnova — patch-16-phase2-payslips.js
// Phase 2 — Payslip Generator + Salary Structures
// Lines 4491–5049 of original patch.js
// ==============================================================

// ================================================================
// PHASE 2: PAYSLIP GENERATOR
// ================================================================

api.payslipSalaryAll   = ()           => req('GET',  '/payslip/salary');
api.payslipSalaryExport = ()          => `/api/payslip/salary/export`;
api.payslipSalaryOne   = (uid)        => req('GET',  `/payslip/salary/${uid}`);
api.payslipSalarySet   = (data)       => req('POST', '/payslip/salary', data);
api.payslipList        = (p)          => req('GET',  `/payslip/list?${new URLSearchParams(p||{}).toString()}`);
api.payslipGenerate    = (data)       => req('POST', '/payslip/generate', data);
api.payslipPublish     = (id)         => req('PATCH', `/payslip/${id}/publish`, {});
api.payslipPDF         = (id)         => `/api/payslip/${id}/html`;
// Open payslip HTML with auth token via Blob URL
async function openPayslip(id) {
  try {
    const token = localStorage.getItem('hr_token');
    const resp = await fetch(`/api/payslip/${id}/html`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) {
      const e = await resp.json().catch(()=>({error:'Failed'}));
      alert('Error: '+(e.error||resp.status)); return;
    }
    const html = await resp.text();
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (win) setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch(e) { alert('Could not open payslip: ' + e.message); }
}

PAGES.employee = [...PAGES.employee, 'payslip'];
PAGES.manager  = [...PAGES.manager,  'payslip'];
PAGES.hr       = [...PAGES.hr,       'payslip'];
NAV.push({ id:'payslip', icon:'💵', label:'Payslips', group:'main' });

const _origNavPayslip = window.navigate;
window.navigate = function(page) {
  const content = document.getElementById('main-content') || document.getElementById('page-content');
  if (page === 'payslip' && content) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page==='payslip'));
    renderPayslip(content); return;
  }
  return _origNavPayslip(page);
};

const PS_MONTHS = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];

async function renderPayslip(container) {
  const user  = getUser();
  const isHR  = user?.role === 'hr';
  const now   = new Date();
  let tab     = isHR ? 'manage' : 'my';

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <h2 class="page-title" style="margin:0">💵 Payslips</h2>
      ${isHR ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="ps-tab btn" data-tab="manage"
                style="background:linear-gradient(135deg,#1a3c6e,#2563eb);color:#fff;border:none;font-weight:700">
          📊 Manage Payslips
        </button>
        <button class="ps-tab btn btn-secondary" data-tab="salary">💰 Salary Structures</button>
      </div>` : ''}
    </div>
    <div id="ps-content"></div>`;

  if (isHR) {
    container.querySelectorAll('.ps-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab;
        container.querySelectorAll('.ps-tab').forEach(b => {
          const active = b.dataset.tab === tab;
          b.style.background = active ? 'linear-gradient(135deg,#1a3c6e,#2563eb)' : '';
          b.style.color = active ? '#fff' : '';
          b.className = active ? 'ps-tab btn' : 'ps-tab btn btn-secondary';
        });
        loadTab();
      });
    });
  }

  async function loadTab() {
    const el = document.getElementById('ps-content');
    if (!el) return;
    if (tab === 'salary') { await renderSalaryTab(el); return; }
    if (tab === 'manage') { await renderManageTab(el); return; }
    await renderMyPayslips(el);
  }

  loadTab();
}

// ── MY PAYSLIPS (Employee view) ───────────────────────────────
async function renderMyPayslips(el) {
  el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text3)">Loading...</div>`;
  try {
    const r = await api.payslipList();
    const slips = (r?.payslips || []).filter(p => p.Status === 'published');

    if (!slips.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text3)">
        <div style="font-size:2.5rem;margin-bottom:12px">💵</div>
        <div style="font-weight:600">No payslips available yet</div>
        <div style="font-size:.85rem;margin-top:6px">Your HR will publish payslips each month</div>
      </div>`;
      return;
    }

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
        ${slips.map(p => `
          <div style="background:#fff;border-radius:14px;border:1.5px solid #e0e7ff;
                      padding:20px;transition:box-shadow .2s"
               onmouseover="this.style.boxShadow='0 4px 20px rgba(99,102,241,.15)'"
               onmouseout="this.style.boxShadow=''">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
              <div>
                <div style="font-weight:800;font-size:1rem;color:#1e293b">
                  ${PS_MONTHS[p.Month-1]} ${p.Year}
                </div>
                <div style="font-size:.72rem;color:var(--text3);margin-top:2px">
                  ${p.PresentDays}/${p.WorkingDays} days present
                </div>
              </div>
              <div style="background:#eef2ff;width:42px;height:42px;border-radius:10px;
                          display:flex;align-items:center;justify-content:center;font-size:1.2rem">💵</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
              <div style="background:#f0fdf4;border-radius:8px;padding:8px 12px">
                <div style="font-size:.65rem;color:#16a34a;font-weight:700;text-transform:uppercase">Gross</div>
                <div style="font-weight:800;color:#16a34a;font-size:.9rem">
                  ₹${parseFloat(p.GrossSalary).toLocaleString('en-IN')}
                </div>
              </div>
              <div style="background:#f0f9ff;border-radius:8px;padding:8px 12px">
                <div style="font-size:.65rem;color:#1a3c6e;font-weight:700;text-transform:uppercase">Net Pay</div>
                <div style="font-weight:800;color:#1a3c6e;font-size:.9rem">
                  ₹${parseFloat(p.NetSalary).toLocaleString('en-IN')}
                </div>
              </div>
            </div>
            <button onclick="openPayslip(${p.PayslipID})"
               style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;
                      background:linear-gradient(135deg,#1a3c6e,#2563eb);color:#fff;
                      border:none;border-radius:8px;padding:9px;cursor:pointer;font-weight:700;
                      font-size:.83rem">
              🖨️ View & Print PDF
            </button>
          </div>`).join('')}
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`;
  }
}

// ── MANAGE PAYSLIPS (HR view) ─────────────────────────────────
async function renderManageTab(el) {
  const now = new Date();
  let selMonth = now.getMonth() + 1;
  let selYear  = now.getFullYear();

  async function load() {
    el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text3)">Loading...</div>`;
    try {
      const r = await api.payslipList({ month: selMonth, year: selYear });
      const slips = r?.payslips || [];

      el.innerHTML = `
        <!-- Period selector -->
        <div style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;
                    padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;
                    gap:12px;flex-wrap:wrap">
          <span style="font-weight:700;color:#334155;font-size:.88rem">Pay Period:</span>
          <select id="ps-month" class="form-control" style="width:auto;font-size:.85rem;padding:6px 10px">
            ${PS_MONTHS.map((m,i)=>`<option value="${i+1}" ${i+1===selMonth?'selected':''}>${m}</option>`).join('')}
          </select>
          <select id="ps-year" class="form-control" style="width:auto;font-size:.85rem;padding:6px 10px">
            ${[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y=>
              `<option value="${y}" ${y===selYear?'selected':''}>${y}</option>`).join('')}
          </select>
          <button id="ps-gen-btn" class="btn btn-primary"
                  style="background:linear-gradient(135deg,#1a3c6e,#2563eb);border:none;font-weight:700;font-size:.83rem">
            ⚡ Generate All Payslips
          </button>
          <button id="ps-pub-all" class="btn btn-secondary" style="font-size:.83rem">
            📤 Publish All Drafts
          </button>
        </div>

        <!-- Summary stats -->
        ${slips.length ? `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
          ${[
            ['Total', slips.length, '#6366f1', '#eef2ff'],
            ['Published', slips.filter(s=>s.Status==='published').length, '#16a34a', '#f0fdf4'],
            ['Drafts', slips.filter(s=>s.Status==='draft').length, '#f59e0b', '#fefce8'],
            ['Total Net', '₹'+slips.reduce((a,s)=>a+parseFloat(s.NetSalary||0),0).toLocaleString('en-IN'), '#2563eb', '#eff6ff'],
          ].map(([label,val,col,bg])=>`
            <div style="background:${bg};border-radius:10px;padding:14px 16px;border:1.5px solid ${col}22">
              <div style="font-size:1.3rem;font-weight:800;color:${col}">${val}</div>
              <div style="font-size:.7rem;color:${col};font-weight:700;text-transform:uppercase">${label}</div>
            </div>`).join('')}
        </div>` : ''}

        <!-- Payslip table -->
        <div style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;overflow:hidden">
          ${!slips.length ? `
            <div style="text-align:center;padding:40px;color:var(--text3)">
              <div style="font-size:2rem;margin-bottom:10px">💵</div>
              No payslips for ${PS_MONTHS[selMonth-1]} ${selYear}. Click Generate to create them.
            </div>` : `
          <table style="width:100%;border-collapse:collapse;font-size:.83rem">
            <thead>
              <tr style="background:#f8faff">
                <th style="padding:10px 14px;text-align:left;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Employee</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Dept</th>
                <th style="padding:10px 14px;text-align:center;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Present</th>
                <th style="padding:10px 14px;text-align:right;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Gross</th>
                <th style="padding:10px 14px;text-align:right;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Net Pay</th>
                <th style="padding:10px 14px;text-align:center;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Status</th>
                <th style="padding:10px 14px;text-align:center;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${slips.map(p => {
                const isDraft = p.Status === 'draft';
                const sc = isDraft ? '#d97706' : '#16a34a';
                const sb = isDraft ? '#fef9c3' : '#dcfce7';
                return `<tr style="border-bottom:1px solid #f1f5f9">
                  <td style="padding:10px 14px">
                    <div style="font-weight:700">${p.FullName}</div>
                    <div style="font-size:.7rem;color:var(--text3)">${p.EmployeeCode?'#'+p.EmployeeCode:''}</div>
                  </td>
                  <td style="padding:10px 14px;color:var(--text3);font-size:.8rem">${p.DepartmentName||'—'}</td>
                  <td style="padding:10px 14px;text-align:center;font-weight:600">${p.PresentDays}/${p.WorkingDays}</td>
                  <td style="padding:10px 14px;text-align:right;color:#16a34a;font-weight:700">
                    ₹${parseFloat(p.GrossSalary).toLocaleString('en-IN')}
                  </td>
                  <td style="padding:10px 14px;text-align:right;color:#1a3c6e;font-weight:800;font-size:.92rem">
                    ₹${parseFloat(p.NetSalary).toLocaleString('en-IN')}
                  </td>
                  <td style="padding:10px 14px;text-align:center">
                    <span style="background:${sb};color:${sc};border-radius:4px;
                                 padding:2px 10px;font-size:.72rem;font-weight:700">${p.Status}</span>
                  </td>
                  <td style="padding:10px 14px;text-align:center">
                    <div style="display:flex;gap:4px;justify-content:center">
                      ${isDraft ? `<button class="ps-publish" data-id="${p.PayslipID}"
                              style="background:#16a34a;color:#fff;border:none;border-radius:5px;
                                     padding:4px 10px;font-size:.72rem;cursor:pointer;font-weight:600">
                        📤 Publish
                      </button>` : ''}
                      <button onclick="openPayslip(${p.PayslipID})"
                              style="background:#eef2ff;color:#6366f1;border:none;border-radius:5px;
                                     padding:4px 10px;font-size:.72rem;font-weight:600;cursor:pointer">
                        🖨️ PDF
                      </button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>`;

      // Handlers
      document.getElementById('ps-month').onchange = function() { selMonth=parseInt(this.value); load(); };
      document.getElementById('ps-year').onchange  = function() { selYear=parseInt(this.value);  load(); };

      document.getElementById('ps-gen-btn').addEventListener('click', async () => {
        if (!confirm(`Generate payslips for all employees for ${PS_MONTHS[selMonth-1]} ${selYear}?\nThis will use attendance data and salary structures.`)) return;
        const btn = document.getElementById('ps-gen-btn');
        btn.disabled=true; btn.textContent='⚡ Generating...';
        try {
          const r = await api.payslipGenerate({ month: selMonth, year: selYear });
          const toast = document.createElement('div');
          toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
            background:#16a34a;color:#fff;padding:14px 22px;border-radius:12px;font-weight:700`;
          toast.textContent = `✅ ${r.message}`;
          document.body.appendChild(toast); setTimeout(()=>toast.remove(), 4000);
          load();
        } catch(e) { alert('Error: '+e.message); btn.disabled=false; btn.textContent='⚡ Generate All Payslips'; }
      });

      document.getElementById('ps-pub-all').addEventListener('click', async () => {
        const drafts = slips.filter(s=>s.Status==='draft');
        if (!drafts.length) { alert('No draft payslips to publish.'); return; }
        if (!confirm(`Publish ${drafts.length} payslip(s)? Employees will be notified.`)) return;
        for (const d of drafts) await api.payslipPublish(d.PayslipID).catch(()=>{});
        const toast = document.createElement('div');
        toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
          background:#2563eb;color:#fff;padding:14px 22px;border-radius:12px;font-weight:700`;
        toast.textContent = `📤 ${drafts.length} payslips published!`;
        document.body.appendChild(toast); setTimeout(()=>toast.remove(), 3500);
        load();
      });

      el.querySelectorAll('.ps-publish').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled=true; btn.textContent='...';
          try {
            await api.payslipPublish(parseInt(btn.dataset.id));
            load();
          } catch(e) { alert(e.message); btn.disabled=false; btn.textContent='📤 Publish'; }
        });
      });

    } catch(e) { el.innerHTML = `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
  }
  load();
}

// ── SALARY STRUCTURES (HR) ────────────────────────────────────
async function renderSalaryTab(el) {
  el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text3)">Loading...</div>`;
  try {
    const [salR, usersR] = await Promise.all([
      api.payslipSalaryAll(),
      req('GET', '/users')
    ]);
    const salaries = salR?.salaries || [];
    const users    = Array.isArray(usersR) ? usersR : (usersR?.users || []);
    const salMap   = Object.fromEntries(salaries.map(s=>[s.UserID, s]));

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div style="font-size:.78rem;color:var(--text3)">${salaries.length} employees with salary configured</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="btn-salary-template"
             style="background:#fefce8;color:#ca8a04;border:1.5px solid #fde047;border-radius:8px;
                    padding:7px 14px;font-size:.78rem;font-weight:700;cursor:pointer">
            📋 Download Template
          </button>
          <button id="btn-salary-export"
             style="background:#f0fdf4;color:#16a34a;border:1.5px solid #86efac;border-radius:8px;
                    padding:7px 14px;font-size:.78rem;font-weight:700;cursor:pointer">
            ⬇️ Export Data
          </button>
          <label style="background:#eff6ff;color:#2563eb;border:1.5px solid #93c5fd;border-radius:8px;
                         padding:7px 14px;font-size:.78rem;font-weight:700;cursor:pointer">
            📤 Import CSV
            <input type="file" id="salary-csv-import" accept=".csv" style="display:none" />
          </label>
          <button id="add-salary-btn" class="btn btn-primary"
                  style="background:linear-gradient(135deg,#1a3c6e,#2563eb);border:none;font-weight:700;font-size:.83rem">
            ➕ Add / Edit Salary
          </button>
        </div>
      </div>
      <div id="import-result" style="display:none;margin-bottom:12px"></div>
      <div style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:.83rem">
          <thead>
            <tr style="background:#f8faff">
              ${['Employee','Basic','HRA','DA+TA','Other Allow.','Gross','PF','ESI+Tax','Net Est.',''].map(h=>
                `<th style="padding:9px 12px;text-align:${h===''?'center':'right'};color:var(--text3);font-size:.67rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0;${h==='Employee'?'text-align:left':''}">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${salaries.map(s => {
              const gross = [s.BasicSalary,s.HRA,s.DA,s.TA,s.OtherAllowance].reduce((a,v)=>a+parseFloat(v||0),0);
              const ded   = [s.PFDeduction,s.ESIDeduction,s.TaxDeduction,s.OtherDeduction].reduce((a,v)=>a+parseFloat(v||0),0);
              const net   = gross - ded;
              const fmt   = v => '₹'+parseFloat(v||0).toLocaleString('en-IN');
              return `<tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:9px 12px">
                  <div style="font-weight:700">${s.FullName}</div>
                  <div style="font-size:.7rem;color:var(--text3)">${s.DepartmentName||''}</div>
                </td>
                <td style="padding:9px 12px;text-align:right;font-weight:600">${fmt(s.BasicSalary)}</td>
                <td style="padding:9px 12px;text-align:right;color:var(--text3)">${fmt(s.HRA)}</td>
                <td style="padding:9px 12px;text-align:right;color:var(--text3)">${fmt((parseFloat(s.DA||0)+parseFloat(s.TA||0)))}</td>
                <td style="padding:9px 12px;text-align:right;color:var(--text3)">${fmt(s.OtherAllowance)}</td>
                <td style="padding:9px 12px;text-align:right;color:#16a34a;font-weight:700">${fmt(gross)}</td>
                <td style="padding:9px 12px;text-align:right;color:#dc2626">${fmt(s.PFDeduction)}</td>
                <td style="padding:9px 12px;text-align:right;color:#dc2626">${fmt(parseFloat(s.ESIDeduction||0)+parseFloat(s.TaxDeduction||0))}</td>
                <td style="padding:9px 12px;text-align:right;color:#1a3c6e;font-weight:800">${fmt(net)}</td>
                <td style="padding:9px 12px;text-align:center">
                  <button class="edit-sal" data-uid="${s.UserID}"
                          style="background:#eef2ff;color:#6366f1;border:none;border-radius:5px;
                                 padding:4px 10px;font-size:.72rem;cursor:pointer;font-weight:600">✏️ Edit</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ${!salaries.length ? '<div style="text-align:center;padding:40px;color:var(--text3)">No salary structures yet. Click Add to create one.</div>' : ''}
      </div>`;

    document.getElementById('add-salary-btn').addEventListener('click', () => showSalaryModal(null, users, () => renderSalaryTab(el)));

    // Template download handler
    document.getElementById('btn-salary-template')?.addEventListener('click', async () => {
      try {
        // Fetch all active employees to pre-fill EmployeeCode + Name
        const token = localStorage.getItem('hr_token')||'';
        const resp  = await fetch('/api/users', { headers:{'Authorization':'Bearer '+token} });
        const emps  = await resp.json();
        const rows  = Array.isArray(emps) ? emps : [];

        const header = 'EmployeeCode,EmployeeName,Department,BasicSalary,HRA,DA,TA,OtherAllowance,PFDeduction,ESIDeduction,TaxDeduction,OtherDeduction';
        const lines  = [
          '# LeaveFlow HR - Salary Structure Import Template',
          '# Instructions:',
          '#   1. Fill BasicSalary (required). All other fields default to 0 if left blank.',
          '#   2. Do NOT change EmployeeCode column - it is used to match employees.',
          '#   3. Delete these comment lines (starting with #) before importing.',
          '#   4. Save as CSV and import using the Import CSV button.',
          '#',
          header,
          ...rows.map(u =>
            [u.EmployeeCode||'', `"${u.FullName||''}"`, `"${u.DepartmentName||''}"`,
             '0','0','0','0','0','0','0','0','0'].join(',')
          )
        ];

        const blob = new Blob([lines.join('\r\n')], { type:'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href=url; a.download='salary_import_template.csv'; a.click();
        setTimeout(()=>URL.revokeObjectURL(url), 3000);
      } catch(e) { alert('Error: '+e.message); }
    });

    // CSV Export handler
    document.getElementById('btn-salary-export')?.addEventListener('click', async () => {
      try {
        const token = localStorage.getItem('hr_token')||'';
        const resp = await fetch('/api/payslip/salary/export', { headers:{'Authorization':'Bearer '+token} });
        if (!resp.ok) throw new Error('Export failed');
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href=url; a.download='salary_structures.csv'; a.click();
        setTimeout(()=>URL.revokeObjectURL(url),3000);
      } catch(e) { alert('Export error: '+e.message); }
    });

    // CSV Import handler
    document.getElementById('salary-csv-import')?.addEventListener('change', async function() {
      const file = this.files[0];
      if (!file) return;
      const resultEl = document.getElementById('import-result');
      resultEl.style.display='';
      resultEl.innerHTML=`<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:10px 14px;font-size:.82rem;color:#1d4ed8">
        ⏳ Importing ${file.name}...</div>`;

      const formData = new FormData();
      formData.append('file', file);
      try {
        const token = localStorage.getItem('hr_token')||'';
        const resp = await fetch('/api/payslip/salary/import', {
          method:'POST', headers:{'Authorization':'Bearer '+token}, body:formData
        });
        const r = await resp.json();
        if (!resp.ok) throw new Error(r.error);
        resultEl.innerHTML=`<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;
          padding:10px 14px;font-size:.82rem;color:#16a34a;font-weight:600">
          ✅ ${r.message}
          ${r.errors?.length?`<div style="margin-top:4px;font-weight:400;color:#92400e">${r.errors.slice(0,3).join('<br/>')}</div>`:''}
        </div>`;
        setTimeout(() => renderSalaryTab(el), 1200);
      } catch(e) {
        resultEl.innerHTML=`<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;
          padding:10px 14px;font-size:.82rem;color:#dc2626">❌ ${e.message}</div>`;
      }
      this.value=''; // reset input
    });
    el.querySelectorAll('.edit-sal').forEach(btn => {
      btn.addEventListener('click', () => {
        const sal = salaries.find(s=>s.UserID===parseInt(btn.dataset.uid));
        showSalaryModal(sal, users, () => renderSalaryTab(el));
      });
    });
  } catch(e) { el.innerHTML = `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
}

function showSalaryModal(existing, users, onSave) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;
                            display:flex;align-items:center;justify-content:center;padding:20px`;
  const fields = [
    ['basicSalary','Basic Salary *','₹'],['hra','HRA','₹'],['da','Dearness Allowance','₹'],
    ['ta','Travel Allowance','₹'],['otherAllowance','Other Allowance','₹'],
    ['pfDeduction','PF Deduction','₹'],['esiDeduction','ESI','₹'],
    ['taxDeduction','Income Tax (TDS)','₹'],['otherDeduction','Other Deduction','₹'],
  ];
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:560px;width:100%;
                box-shadow:0 20px 60px rgba(0,0,0,.25);max-height:90vh;overflow-y:auto">
      <div style="font-size:1.1rem;font-weight:800;color:#1e293b;margin-bottom:18px">
        ${existing?'✏️ Edit Salary Structure':'➕ Add Salary Structure'}
      </div>
      ${!existing ? `
      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">Employee *</label>
        <select class="form-control" id="sal-uid">
          <option value="">— Select Employee —</option>
          ${users.map(u=>`<option value="${u.UserID}">${u.FullName} ${u.EmployeeCode?'(#'+u.EmployeeCode+')':''}</option>`).join('')}
        </select>
      </div>` : `<div style="font-weight:700;margin-bottom:14px;color:#1a3c6e">
        👤 ${existing.FullName}</div>`}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        ${fields.map(([id,label,prefix])=>`
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:.75rem">${label}</label>
          <div style="position:relative">
            <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);
                         color:var(--text3);font-size:.85rem">${prefix}</span>
            <input class="form-control" type="number" id="sal-${id}" min="0" step="0.01"
                   value="${existing?parseFloat(existing[id.charAt(0).toUpperCase()+id.slice(1)]||0).toFixed(2):''}"
                   placeholder="0.00" style="padding-left:22px" />
          </div>
        </div>`).join('')}
      </div>

      <div id="sal-err" style="color:#dc2626;font-size:.8rem;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button id="sal-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="sal-save" class="btn btn-primary"
                style="flex:2;background:linear-gradient(135deg,#1a3c6e,#2563eb);border:none;font-weight:700">
          💾 Save Salary Structure
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#sal-cancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });

  overlay.querySelector('#sal-save').onclick = async () => {
    const uid = existing?.UserID || parseInt(overlay.querySelector('#sal-uid')?.value||0);
    if (!uid) { overlay.querySelector('#sal-err').style.display=''; overlay.querySelector('#sal-err').textContent='Select employee'; return; }
    const basic = parseFloat(overlay.querySelector('#sal-basicSalary')?.value||0);
    if (!basic) { overlay.querySelector('#sal-err').style.display=''; overlay.querySelector('#sal-err').textContent='Basic salary required'; return; }
    const data = { userID: uid };
    fields.forEach(([id])=>{
      data[id] = parseFloat(overlay.querySelector(`#sal-${id}`)?.value||0);
    });
    const btn = overlay.querySelector('#sal-save');
    btn.disabled=true; btn.textContent='Saving...';
    try {
      await api.payslipSalarySet(data);
      overlay.remove();
      if (onSave) onSave();
    } catch(e) {
      overlay.querySelector('#sal-err').style.display='';
      overlay.querySelector('#sal-err').textContent=e.message;
      btn.disabled=false; btn.textContent='💾 Save Salary Structure';
    }
  };
}

console.log('💵 Phase 2: Payslip Generator loaded');

