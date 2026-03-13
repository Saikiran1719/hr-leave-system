// ==============================================================
// HRnova — patch-02-employees-page.js
// Employees page — list, add, edit, deactivate
// Lines 115–551 of original patch.js
// ==============================================================

// ================================================================
// 3. NEW renderEmployees — with Employee Code, Soft Delete,
//    Import (CSV) and Export (CSV download)
// ================================================================
async function renderEmployees(container) {
  let showAdd    = false;
  let showImport = false;
  let editID     = null;
  let search     = '';
  let statusTab  = 'active';

  async function render() {
    try {
      const currentUser = getUser();
      const isHR = currentUser && currentUser.role === 'hr';

      const isActiveParam = statusTab==='active' ? 'true' : statusTab==='inactive' ? 'false' : 'all';
      const [users, depts, allUsers] = await Promise.all([
        api.users({ search, isActive: isActiveParam }),
        api.departments(),
        api.users({ search, isActive: 'all' }),
      ]);
      const activeCnt   = allUsers.filter(u => u.IsActive).length;
      const inactiveCnt = allUsers.filter(u => !u.IsActive).length;

      container.innerHTML = `
      <div class="page-anim">
        <!-- Page header -->
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px">
          <h2 class="page-title" style="margin:0">Employee Directory</h2>
          ${isHR ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="btn-export" title="Download all employees as CSV">
              ⬇ Export CSV
            </button>
            <button class="btn btn-ghost btn-sm" id="btn-import-toggle">
              ⬆ Import CSV
            </button>
            <button class="btn btn-primary" id="btn-add-emp">＋ Add Employee</button>
          </div>` : ''}
        </div>

        <!-- Status tabs -->
        <div class="tabs" style="margin-bottom:14px">
          <button class="tab${statusTab==='active'?' active':''}" data-tab="active">
            Active <span style="background:#e3fcef;color:#006644;border-radius:10px;padding:1px 7px;font-size:.68rem;font-weight:700;margin-left:4px">${activeCnt}</span>
          </button>
          <button class="tab${statusTab==='inactive'?' active':''}" data-tab="inactive">
            Inactive <span style="background:#f4f5f7;color:#8993a4;border-radius:10px;padding:1px 7px;font-size:.68rem;font-weight:700;margin-left:4px">${inactiveCnt}</span>
          </button>
          <button class="tab${statusTab==='all'?' active':''}" data-tab="all">
            All <span style="background:#e9f0ff;color:#0052cc;border-radius:10px;padding:1px 7px;font-size:.68rem;font-weight:700;margin-left:4px">${allUsers.length}</span>
          </button>
        </div>

        <!-- Search -->
        <input class="form-control" id="emp-search"
          placeholder="🔍 Search by name, email or employee code…"
          value="${search}" style="max-width:400px;margin-bottom:14px" />

        <!-- Import panel -->
        ${isHR && showImport ? _renderImportPanel() : ''}

        <!-- Add form -->
        ${isHR && showAdd ? _renderAddForm(depts, allUsers.filter(u=>u.IsActive)) : ''}

        <!-- Employee list -->
        <div id="emp-list">
          ${users.length === 0
            ? `<div class="empty"><div class="empty-icon">👥</div><p>No ${statusTab!=='all'?statusTab:''} employees found.</p></div>`
            : users.map(u => _renderEmpCard(u, depts, allUsers, editID===u.UserID, currentUser?.userID, isHR)).join('')
          }
        </div>
      </div>`;

      // ── Tab clicks
      container.querySelectorAll('[data-tab]').forEach(t =>
        t.addEventListener('click', ()=>{ statusTab=t.dataset.tab; editID=null; render(); })
      );

      // ── Search
      let st;
      document.getElementById('emp-search').addEventListener('input', function(){
        clearTimeout(st); st=setTimeout(()=>{ search=this.value; render(); }, 350);
      });

      // ── Export CSV
      document.getElementById('btn-export')?.addEventListener('click', async () => {
        try {
          const token = localStorage.getItem('hr_token')||'';
          const res = await fetch('/api/users/export', { headers:{'Authorization':'Bearer '+token} });
          if (!res.ok) { toast.error('Export failed'); return; }
          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement('a');
          a.href = url;
          a.download = `employees_${new Date().toISOString().slice(0,10)}.csv`;
          a.click(); URL.revokeObjectURL(url);
          toast.success('CSV downloaded!');
        } catch(e){ toast.error(e.message); }
      });

      // ── Import toggle
      document.getElementById('btn-import-toggle')?.addEventListener('click', ()=>{ showImport=!showImport; showAdd=false; render(); });

      // ── Add toggle
      document.getElementById('btn-add-emp')?.addEventListener('click', ()=>{ showAdd=!showAdd; showImport=false; render(); });

      // ── Download template
      document.getElementById('btn-dl-template')?.addEventListener('click', () => {
        const csv = [
          'EmployeeCode,FullName,Email,Role,Phone,JoinedDate,Department',
          '1001,Rahul Verma,rahul@company.com,employee,+91 98765 43210,2024-01-15,Engineering',
          '1002,Meena Patel,meena@company.com,manager,+91 87654 32109,2024-02-01,Design',
        ].join('\r\n');
        const blob = new Blob([csv], {type:'text/csv'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'employee_import_template.csv';
        a.click();
        toast.info('Template downloaded!');
      });

      // ── Import: file upload
      document.getElementById('import-file')?.addEventListener('change', function(){
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
          document.getElementById('import-csv-text').value = e.target.result;
          toast.info('File loaded — click "Import" to proceed.');
        };
        reader.readAsText(file);
      });

      // ── Import: run
      document.getElementById('btn-run-import')?.addEventListener('click', async () => {
        const raw = document.getElementById('import-csv-text').value.trim();
        if (!raw) { toast.error('Paste or upload a CSV first.'); return; }
        const rows = _parseCSV(raw);
        if (rows.length === 0) { toast.error('No valid rows found.'); return; }
        const btn = document.getElementById('btn-run-import');
        btn.disabled=true; btn.textContent='Importing…';
        try {
          const token = localStorage.getItem('hr_token')||'';
          const res = await fetch('/api/users/import', {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+token },
            body: JSON.stringify({ rows })
          });
          const d = await res.json();
          _showImportResult(d);
          if (d.added > 0) { showImport=false; render(); }
        } catch(e){ toast.error(e.message); }
        finally { btn.disabled=false; btn.textContent='Import'; }
      });

      // ── Add form submit
      if (isHR && showAdd) {
        document.getElementById('add-emp-btn').onclick = async () => {
          const fd = {
            employeeCode: document.getElementById('ne-code').value.trim(),
            fullName:     document.getElementById('ne-name').value.trim(),
            email:        document.getElementById('ne-email').value.trim(),
            password:     document.getElementById('ne-pw').value,
            userRole:     document.getElementById('ne-role').value,
            departmentID: document.getElementById('ne-dept').value,
            managerID:    document.getElementById('ne-mgr').value,
            phone:        document.getElementById('ne-phone').value,
            joinedDate:   document.getElementById('ne-joined').value,
          };
          if (!fd.fullName||!fd.email||!fd.password) return toast.error('Name, email and password required.');
          try { await api.addUser(fd); toast.success('Employee added!'); showAdd=false; statusTab='active'; render(); }
          catch(e){ toast.error(e.message); }
        };
        document.getElementById('cancel-add-btn').onclick = ()=>{ showAdd=false; render(); };
      }

      // ── Edit toggle
      container.querySelectorAll('[data-edit]').forEach(btn =>
        btn.addEventListener('click', ()=>{
          editID = editID===parseInt(btn.dataset.edit) ? null : parseInt(btn.dataset.edit);
          render();
        })
      );

      // ── Save edit
      container.querySelectorAll('[data-save]').forEach(btn =>
        btn.addEventListener('click', async () => {
          const id = btn.dataset.save;
          const d = {
            employeeCode: document.getElementById(`e-code-${id}`)?.value?.trim(),
            fullName:     document.getElementById(`e-name-${id}`)?.value,
            phone:        document.getElementById(`e-phone-${id}`)?.value,
            userRole:     document.getElementById(`e-role-${id}`)?.value,
            departmentID: document.getElementById(`e-dept-${id}`)?.value,
            managerID:    document.getElementById(`e-mgr-${id}`)?.value || null,
            dateOfBirth:  document.getElementById(`e-dob-${id}`)?.value || null,
          };
          try { await api.updateUser(id,d); toast.success('Updated!'); editID=null; render(); }
          catch(e){ toast.error(e.message); }
        })
      );

      // ── Deactivate
      container.querySelectorAll('[data-deactivate]').forEach(btn =>
        btn.addEventListener('click', ()=>{
          confirmDialog('Deactivate Employee',
            `Deactivate "${btn.dataset.empName}"? They will lose login access. All history is preserved and can be reactivated anytime.`,
            async ()=>{
              try { await api.updateUser(btn.dataset.deactivate,{isActive:false}); toast.success('Deactivated.'); statusTab='inactive'; render(); }
              catch(e){toast.error(e.message);}
            }
          );
        })
      );

      // ── Reactivate
      container.querySelectorAll('[data-reactivate]').forEach(btn =>
        btn.addEventListener('click', ()=>{
          confirmDialog('Reactivate Employee', `Reactivate "${btn.dataset.empName}"?`,
            async ()=>{
              try { await api.updateUser(btn.dataset.reactivate,{isActive:true}); toast.success('Reactivated!'); statusTab='active'; render(); }
              catch(e){toast.error(e.message);}
            }
          );
        })
      );

    } catch(e){ container.innerHTML=`<div style="color:#bf2600;padding:20px">${e.message}</div>`; }
  }

  // ── Add form HTML ────────────────────────────────────────────
  function _renderAddForm(depts, activeUsers) {
    const mgrs = activeUsers.filter(u=>u.Role==='manager'||u.Role==='hr');
    return `
    <div class="card" style="border:2px solid #0052cc;margin-bottom:16px">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#0052cc;margin-bottom:14px">＋ New Employee</div>
      <div class="grid-2" style="margin-bottom:14px">
        <div class="form-group"><label class="form-label">Employee Code <span style="color:#8993a4;font-weight:400">(optional — auto-assigned if blank)</span></label>
          <input class="form-control" id="ne-code" placeholder="e.g. 1252 or EMP0042" /></div>
        <div class="form-group"><label class="form-label">Full Name *</label>
          <input class="form-control" id="ne-name" placeholder="e.g. Priya Sharma" /></div>
        <div class="form-group"><label class="form-label">Work Email *</label>
          <input class="form-control" id="ne-email" type="email" placeholder="priya@company.com" /></div>
        <div class="form-group"><label class="form-label">Temporary Password *</label>
          <input class="form-control" id="ne-pw" value="Welcome@123" /></div>
        <div class="form-group"><label class="form-label">Phone</label>
          <input class="form-control" id="ne-phone" placeholder="+91 98765 43210" /></div>
        <div class="form-group">
          <label class="form-label">Role *</label>
          <select class="form-control" id="ne-role">
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="hr">HR</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Department</label>
          <select class="form-control" id="ne-dept">
            <option value="">— Select Department —</option>
            ${depts.map(d=>`<option value="${d.DepartmentID}">${d.DepartmentName}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Reporting Manager</label>
          <select class="form-control" id="ne-mgr">
            <option value="">— None —</option>
            ${mgrs.map(m=>`<option value="${m.UserID}">${m.FullName} (${m.Role})</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Date of Joining</label>
          <input class="form-control" id="ne-joined" type="date" value="${todayStr()}" /></div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" id="add-emp-btn">Add Employee</button>
        <button class="btn btn-ghost"   id="cancel-add-btn">Cancel</button>
      </div>
    </div>`;
  }

  // ── Import panel HTML ────────────────────────────────────────
  function _renderImportPanel() {
    return `
    <div class="card" style="border:2px solid #36b37e;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#006644">
          ⬆ Bulk Import Employees (CSV)
        </div>
        <button class="btn btn-ghost btn-sm" id="btn-dl-template">⬇ Download Template</button>
      </div>

      <div style="background:#e3fcef;border:1px solid #abf5d1;border-radius:6px;padding:10px 14px;
                  font-size:.82rem;color:#006644;margin-bottom:14px;line-height:1.7">
        <strong>Required columns:</strong> FullName, Email &nbsp;|&nbsp;
        <strong>Optional:</strong> EmployeeCode, Role (employee/manager/hr), Phone, JoinedDate (YYYY-MM-DD), Department<br>
        Default password for all imported employees: <code style="background:#d4fae8;padding:1px 5px;border-radius:3px">Welcome@123</code>
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">
          📁 Upload CSV file
          <input type="file" id="import-file" accept=".csv,.txt" style="display:none" />
        </label>
        <span style="color:#8993a4;font-size:.82rem">— or paste CSV text below —</span>
      </div>

      <textarea class="form-control" id="import-csv-text" rows="6"
        placeholder="EmployeeCode,FullName,Email,Role,Phone,JoinedDate,Department&#10;1001,Rahul Verma,rahul@company.com,employee,+91 98765 43210,2024-01-15,Engineering&#10;1002,Meena Patel,meena@company.com,manager,,2024-02-01,Design"
        style="font-family:monospace;font-size:.8rem;margin-bottom:12px"></textarea>

      <div id="import-result"></div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-success" id="btn-run-import">Import Employees</button>
        <button class="btn btn-ghost" onclick="this.closest('.card').remove()">Cancel</button>
      </div>
    </div>`;
  }

  // ── Employee Card HTML ───────────────────────────────────────
  function _renderEmpCard(u, depts, allUsers, editing, currentUserID, isHR) {
    const mgr    = allUsers.find(x=>x.UserID===u.ManagerID);
    const isSelf = u.UserID===currentUserID;
    const active = !!u.IsActive;

    const statusPill = active
      ? `<span style="background:#e3fcef;color:#006644;border-radius:3px;padding:2px 8px;
                      font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em">● Active</span>`
      : `<span style="background:#f4f5f7;color:#8993a4;border-radius:3px;padding:2px 8px;
                      font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em">○ Inactive</span>`;

    const empCodeBadge = u.EmployeeCode
      ? `<span style="background:#e9f0ff;color:#0052cc;border-radius:3px;padding:2px 8px;
                      font-size:.67rem;font-weight:700;letter-spacing:.04em;font-family:monospace"
              title="Employee ID">#${u.EmployeeCode}</span>`
      : '';

    return `
    <div class="emp-card" style="${active?'':'opacity:.72;border-style:dashed'}">
      <div class="emp-card-top">
        <!-- Left -->
        <div style="display:flex;gap:12px;align-items:center">
          <div style="position:relative">
            ${avatarHtml(getInitials(u.FullName), 44)}
            ${!active?`<span style="position:absolute;bottom:-2px;right:-2px;width:14px;height:14px;
              background:#8993a4;border:2px solid #fff;border-radius:50%;font-size:.55rem;
              display:flex;align-items:center;justify-content:center;color:#fff">✕</span>`:''}
          </div>
          <div>
            <div style="font-weight:600;font-size:.9rem;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              ${u.FullName}
              ${isSelf?`<span style="font-size:.7rem;color:#0052cc;font-weight:400">(You)</span>`:''}
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px">
              ${empCodeBadge}
              ${statusPill}
            </div>
            <div style="font-size:.78rem;color:#8993a4;margin-top:3px">${u.Email}</div>
            <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              ${roleChip(u.Role)}
              <span style="font-size:.75rem;color:#8993a4">${u.DepartmentName||'—'}</span>
              ${mgr?`<span style="font-size:.74rem;color:#8993a4">· ${mgr.FullName}</span>`:''}
            </div>
          </div>
        </div>
        <!-- Right: actions -->
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${isHR?`<button class="btn btn-ghost btn-sm" data-edit="${u.UserID}">${editing?'✕ Cancel':'✏ Edit'}</button>`:''}
          ${isHR&&!isSelf&&active?`
            <button data-deactivate="${u.UserID}" data-emp-name="${u.FullName}"
              style="background:#fff0f0;color:#bf2600;border:1px solid #ffbdad;
                     border-radius:4px;padding:5px 10px;font-size:.8rem;cursor:pointer;
                     transition:background .12s,color .12s;white-space:nowrap"
              onmouseover="this.style.background='#de350b';this.style.color='#fff'"
              onmouseout="this.style.background='#fff0f0';this.style.color='#bf2600'">⊗ Deactivate</button>`:''}
          ${isHR&&!isSelf&&!active?`
            <button data-reactivate="${u.UserID}" data-emp-name="${u.FullName}"
              style="background:#e3fcef;color:#006644;border:1px solid #abf5d1;
                     border-radius:4px;padding:5px 10px;font-size:.8rem;cursor:pointer;
                     transition:background .12s,color .12s;white-space:nowrap"
              onmouseover="this.style.background='#00875a';this.style.color='#fff'"
              onmouseout="this.style.background='#e3fcef';this.style.color='#006644'">✓ Reactivate</button>`:''}
        </div>
      </div>

      <!-- Edit panel -->
      ${isHR&&editing?`
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid #dfe1e6">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:12px">
          <div class="form-group" style="margin:0">
            <label class="form-label">Employee Code</label>
            <input class="form-control" id="e-code-${u.UserID}" value="${u.EmployeeCode||''}" placeholder="e.g. 1252" />
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Full Name</label>
            <input class="form-control" id="e-name-${u.UserID}" value="${u.FullName}" />
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Phone</label>
            <input class="form-control" id="e-phone-${u.UserID}" value="${u.Phone||''}" />
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Role</label>
            <select class="form-control" id="e-role-${u.UserID}">
              ${['employee','manager','hr'].map(r=>`<option${u.Role===r?' selected':''}>${r}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Department</label>
            <select class="form-control" id="e-dept-${u.UserID}">
              <option value="">—</option>
              ${depts.map(d=>`<option value="${d.DepartmentID}"${u.DepartmentID===d.DepartmentID?' selected':''}>${d.DepartmentName}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Reporting Manager</label>
            <select class="form-control" id="e-mgr-${u.UserID}">
              <option value="">— None —</option>
              ${allUsers.filter(x => x.UserID !== u.UserID && (x.Role==='manager'||x.Role==='hr'))
                .map(m=>`<option value="${m.UserID}"${u.ManagerID===m.UserID?' selected':''}>${m.FullName} (${m.Role})</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">🎂 Date of Birth</label>
            <input class="form-control" type="date" id="e-dob-${u.UserID}"
                   value="${u.DateOfBirth ? String(u.DateOfBirth).slice(0,10) : ''}" />
          </div>
        </div>
        <button class="btn btn-primary btn-sm" data-save="${u.UserID}">Save Changes</button>
      </div>`:''}
    </div>`;
  }

  render();
}

