// ==============================================================
// HRnova — patch-05-reports-page.js
// Reports & Analytics page (HR)
// Lines 613–778 of original patch.js
// ==============================================================

// ================================================================
// 5. NEW renderProfile — adds Employee Code badge next to role/dept chips
//    and Employee ID info box in the details grid
// ================================================================
async function renderProfile(container) {
  const user = getUser();
  let editing = false;
  let pwOpen  = false;

  async function render() {
    try {
      const [profile, bal, myLeaves] = await Promise.all([api.me(), api.myBalance(), api.myLeaves()]);
      const ok   = myLeaves.filter(l => l.Status === 'approved');
      const pen  = myLeaves.filter(l => l.Status === 'pending');
      const used = ok.reduce((s, l) => s + l.TotalDays, 0);

      // Employee Code badge
      const empCodeBadge = profile.EmployeeCode
        ? `<span style="background:#e9f0ff;color:#0052cc;border:1px solid #b3d4ff;
                        border-radius:4px;padding:3px 10px;font-size:.75rem;
                        font-weight:700;letter-spacing:.04em;font-family:monospace"
               title="Employee ID">#${profile.EmployeeCode}</span>`
        : '';

      container.innerHTML = `
      <div class="page-anim" style="max-width:760px">
        <h2 class="page-title">My Profile</h2>

        <!-- Info card -->
        <div class="card" style="margin-bottom:14px">
          <div style="display:flex;align-items:${isMobile()?'flex-start':'center'};
                      gap:18px;margin-bottom:22px;flex-wrap:wrap">
            ${avatarHtml(getInitials(profile.FullName), 68)}
            <div style="flex:1;min-width:0">
              <div style="font-size:1.3rem;font-weight:800;color:var(--text)">${profile.FullName}</div>
              <div style="color:var(--text3);font-size:.84rem;margin-top:4px">${profile.Email}</div>
              <!-- Role + Dept + Employee Code chips -->
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center">
                ${roleChip(profile.Role)}
                <span class="badge badge-approved">${profile.DepartmentName || '—'}</span>
                ${empCodeBadge}
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" id="prof-edit-btn">${editing ? '✕ Cancel' : '✏ Edit'}</button>
          </div>

          ${editing ? `
            <div class="grid-2">
              <div class="form-group"><label class="form-label">Full Name</label>
                <input class="form-control" id="p-name" value="${profile.FullName}" /></div>
              <div class="form-group"><label class="form-label">Phone</label>
                <input class="form-control" id="p-phone" value="${profile.Phone||''}" /></div>
            </div>
            <button class="btn btn-primary" id="prof-save-btn" style="width:auto;padding:10px 24px">Save Changes</button>
          ` : `
            <div class="grid-3">
              ${[
                ['Employee ID', profile.EmployeeCode ? '#' + profile.EmployeeCode : '—'],
                ['Email',       profile.Email],
                ['Phone',       profile.Phone || '—'],
                ['Department',  profile.DepartmentName || '—'],
                ['Role',        profile.Role?.toUpperCase()],
                ['Manager',     profile.ManagerName || '—'],
                ['Joined',      fmtDate(profile.JoinedDate)],
                ['Date of Birth', profile.DateOfBirth ? fmtDate(profile.DateOfBirth) : '—'],
              ].map(([k, v]) => `
                <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px">
                  <div style="font-size:.68rem;color:var(--text3);margin-bottom:3px;
                              text-transform:uppercase;letter-spacing:.06em">${k}</div>
                  <div style="color:${k==='Employee ID'?'#0052cc':'var(--text)'};
                              font-weight:${k==='Employee ID'?'700':'500'};
                              font-size:.88rem;word-break:break-all;
                              font-family:${k==='Employee ID'?'monospace':'inherit'}">${v}</div>
                </div>`).join('')}
            </div>`}
        </div>

        <!-- Stats row -->
        <div class="grid-4" style="gap:12px;margin-bottom:14px">
          ${[['Applied',myLeaves.length,'#0052cc'],['Approved',ok.length,'#006644'],
             ['Pending',pen.length,'#974f0c'],['Days Used',used,'#bf2600']].map(([l,v,c])=>`
            <div class="stat-card" style="padding:14px;text-align:center;justify-content:center;flex-direction:column;gap:4px">
              <div style="font-size:1.6rem;font-weight:700;color:${c}">${v}</div>
              <div style="font-size:.76rem;color:var(--text3)">${l}</div>
            </div>`).join('')}
        </div>

        <!-- Leave Balance -->
        <div class="card" style="margin-bottom:14px">
          <div class="card-title">My Leave Balance</div>
          <div class="grid-4">
            ${bal.map(b => `
              <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;text-align:center">
                <div style="font-size:.7rem;color:var(--text3);margin-bottom:6px">${b.TypeName}</div>
                <div style="font-size:1.3rem;font-weight:700;color:${b.ColorHex}">${b.RemainingDays}</div>
                <div style="font-size:.7rem;color:var(--text3);margin-top:2px">/ ${b.MaxDaysPerYear}</div>
                <div class="progress" style="margin-top:6px">
                  <div class="bar" style="width:${Math.min(100,(b.UsedDays/b.MaxDaysPerYear)*100)}%;background:${b.ColorHex}"></div>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <!-- Change Password -->
        <div class="card">
          <button id="pw-toggle-btn" style="width:100%;background:none;border:none;color:var(--text);
                  cursor:pointer;text-align:left;font-size:.95rem;font-weight:600;
                  display:flex;justify-content:space-between;align-items:center;padding:0">
            <span>🔐 Change Password</span>
            <span style="color:var(--text3);font-size:.8rem">${pwOpen ? '▲' : '▼'}</span>
          </button>
          ${pwOpen ? `
            <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
              <div class="grid-3">
                <div class="form-group"><label class="form-label">Current Password</label>
                  <input class="form-control" id="pw-cur" type="password" /></div>
                <div class="form-group"><label class="form-label">New Password</label>
                  <input class="form-control" id="pw-new" type="password" /></div>
                <div class="form-group"><label class="form-label">Confirm Password</label>
                  <input class="form-control" id="pw-conf" type="password" /></div>
              </div>
              <button class="btn btn-primary" id="pw-save" style="width:auto;padding:10px 24px;margin-top:4px">
                Update Password
              </button>
            </div>` : ''}
        </div>
      </div>`;

      // Wire buttons
      document.getElementById('prof-edit-btn').onclick = () => { editing = !editing; render(); };
      document.getElementById('pw-toggle-btn')?.addEventListener('click', () => { pwOpen = !pwOpen; render(); });

      document.getElementById('prof-save-btn')?.addEventListener('click', async () => {
        const name  = document.getElementById('p-name').value.trim();
        const phone = document.getElementById('p-phone').value.trim();
        if (!name) return toast.error('Name is required');
        try {
          await api.updateMe({ fullName: name, phone });
          const u = getUser();
          localStorage.setItem('hr_user', JSON.stringify({ ...u, fullName: name }));
          toast.success('Profile updated!');
          editing = false; render();
        } catch (e) { toast.error(e.message); }
      });

      document.getElementById('pw-save')?.addEventListener('click', async () => {
        const cur  = document.getElementById('pw-cur').value;
        const nw   = document.getElementById('pw-new').value;
        const conf = document.getElementById('pw-conf').value;
        if (!cur || !nw) return toast.error('All fields required');
        if (nw !== conf) return toast.error('Passwords do not match');
        if (nw.length < 6) return toast.error('Min 6 characters');
        try {
          await api.changePw(cur, nw);
          toast.success('Password changed!');
          pwOpen = false; render();
        } catch (e) { toast.error(e.message); }
      });

    } catch (e) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px">${e.message}</div>`;
    }
  }
  render();
}

