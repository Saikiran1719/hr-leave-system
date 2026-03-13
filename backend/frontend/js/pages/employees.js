// frontend/js/pages/employees.js
async function renderEmployees(container) {
  let showAdd = false;
  let editID  = null;
  let search  = '';

  async function render() {
    try {
      const [users, depts] = await Promise.all([api.users({ search }), api.departments()]);

      container.innerHTML = `
      <div class="page-anim">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px">
          <h2 class="page-title" style="margin:0">Employee Directory</h2>
          <button class="btn btn-primary" id="btn-add-emp">＋ Add Employee</button>
        </div>

        <input class="form-control" id="emp-search" placeholder="🔍 Search by name or email…"
          value="${search}" style="margin-bottom:16px" />

        ${showAdd ? renderAddForm(depts, users) : ''}

        <div id="emp-list">
          ${users.length === 0 ? empty('No employees found.','👥') :
            users.map(u => renderEmpCard(u, depts, users, editID === u.UserID)).join('')}
        </div>
      </div>`;

      // Toggle add form
      document.getElementById('btn-add-emp').onclick = () => { showAdd = !showAdd; render(); };

      // Search
      let searchTimer;
      document.getElementById('emp-search').addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { search = this.value; render(); }, 350);
      });

      // Add form submit
      if (showAdd) {
        document.getElementById('add-emp-btn').onclick = async () => {
          const fd = {
            fullName:     document.getElementById('ne-name').value.trim(),
            email:        document.getElementById('ne-email').value.trim(),
            password:     document.getElementById('ne-pw').value,
            userRole:     document.getElementById('ne-role').value,
            departmentID: document.getElementById('ne-dept').value,
            managerID:    document.getElementById('ne-mgr').value,
            phone:        document.getElementById('ne-phone').value,
            joinedDate:   document.getElementById('ne-joined').value,
          };
          if (!fd.fullName || !fd.email || !fd.password)
            return toast.error('Name, email and password are required.');
          try {
            await api.addUser(fd);
            toast.success('Employee added!');
            showAdd = false; render();
          } catch (e) { toast.error(e.message); }
        };
        document.getElementById('cancel-add-btn').onclick = () => { showAdd = false; render(); };
      }

      // Edit buttons
      container.querySelectorAll('[data-edit]').forEach(btn =>
        btn.addEventListener('click', () => {
          editID = editID === parseInt(btn.dataset.edit) ? null : parseInt(btn.dataset.edit);
          render();
        })
      );

      // Save edit buttons
      container.querySelectorAll('[data-save]').forEach(btn =>
        btn.addEventListener('click', async () => {
          const id = btn.dataset.save;
          const d = {
            fullName:     document.getElementById(`e-name-${id}`)?.value,
            phone:        document.getElementById(`e-phone-${id}`)?.value,
            userRole:     document.getElementById(`e-role-${id}`)?.value,
            departmentID: document.getElementById(`e-dept-${id}`)?.value,
          };
          try {
            await api.updateUser(id, d);
            toast.success('Employee updated!');
            editID = null; render();
          } catch (e) { toast.error(e.message); }
        })
      );
    } catch (e) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px">${e.message}</div>`;
    }
  }

  function renderAddForm(depts, users) {
    const managers = users.filter(u => u.Role === 'manager' || u.Role === 'hr');
    return `
    <div class="card" style="border-color:var(--primary);margin-bottom:16px">
      <div class="card-title" style="color:#a5b4fc">＋ New Employee</div>
      <div class="grid-2" style="margin-bottom:14px">
        <div class="form-group"><label class="form-label">Full Name *</label><input class="form-control" id="ne-name" /></div>
        <div class="form-group"><label class="form-label">Work Email *</label><input class="form-control" id="ne-email" type="email" /></div>
        <div class="form-group"><label class="form-label">Password *</label><input class="form-control" id="ne-pw" type="text" value="pass123" /></div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-control" id="ne-phone" /></div>
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
            <option value="">— Select —</option>
            ${depts.map(d=>`<option value="${d.DepartmentID}">${d.DepartmentName}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Manager</label>
          <select class="form-control" id="ne-mgr">
            <option value="">— None —</option>
            ${managers.map(m=>`<option value="${m.UserID}">${m.FullName}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Joined Date</label><input class="form-control" id="ne-joined" type="date" value="${todayStr()}" /></div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" id="add-emp-btn">Add Employee</button>
        <button class="btn btn-ghost"   id="cancel-add-btn">Cancel</button>
      </div>
    </div>`;
  }

  function renderEmpCard(u, depts, allUsers, editing) {
    const mgr = allUsers.find(x => x.UserID === u.ManagerID);
    return `
    <div class="emp-card">
      <div class="emp-card-top">
        <div style="display:flex;gap:12px;align-items:center">
          ${avatarHtml(getInitials(u.FullName), 44)}
          <div>
            <div style="font-weight:600;font-size:.95rem">${u.FullName}</div>
            <div style="font-size:.78rem;color:var(--text3)">${u.Email} · ${u.DepartmentName||'—'}</div>
            <div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap">
              ${roleChip(u.Role)}
              ${mgr?`<span style="font-size:.74rem;color:var(--text3)">→ ${mgr.FullName}</span>`:''}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" data-edit="${u.UserID}">${editing?'Cancel':'Edit'}</button>
        </div>
      </div>
      ${editing ? `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        <div class="grid-4" style="margin-bottom:12px;gap:10px">
          <div class="form-group"><label class="form-label">Name</label><input class="form-control" id="e-name-${u.UserID}" value="${u.FullName}" /></div>
          <div class="form-group"><label class="form-label">Phone</label><input class="form-control" id="e-phone-${u.UserID}" value="${u.Phone||''}" /></div>
          <div class="form-group">
            <label class="form-label">Role</label>
            <select class="form-control" id="e-role-${u.UserID}">
              ${['employee','manager','hr'].map(r=>`<option${u.Role===r?' selected':''}>${r}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Department</label>
            <select class="form-control" id="e-dept-${u.UserID}">
              <option value="">—</option>
              ${depts.map(d=>`<option value="${d.DepartmentID}"${u.DepartmentID===d.DepartmentID?' selected':''}>${d.DepartmentName}</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" data-save="${u.UserID}">Save Changes</button>
      </div>` : ''}
    </div>`;
  }

  render();
}
