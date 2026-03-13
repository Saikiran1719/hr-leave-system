// ==============================================================
// HRnova — patch-17-phase3a-shifts.js
// Phase 3A — Shift Management
// Lines 5050–5488 of original patch.js
// ==============================================================

// ================================================================
// PHASE 3A: SHIFT MANAGEMENT
// ================================================================

api.shiftsList       = ()       => req('GET',  '/shifts');
api.shiftsCreate     = (d)      => req('POST', '/shifts', d);
api.shiftsUpdate     = (id,d)   => req('PATCH',`/shifts/${id}`, d);
api.shiftsDelete     = (id)     => req('DELETE',`/shifts/${id}`);
api.shiftsAssign     = (d)      => req('POST', '/shifts/assign', d);
api.shiftsAssigned   = ()       => req('GET',  '/shifts/assignments');
api.shiftsUnassigned = ()       => req('GET',  '/shifts/unassigned');
api.shiftsMy         = ()       => req('GET',  '/shifts/my');

PAGES.employee = [...PAGES.employee, 'shifts'];
PAGES.manager  = [...PAGES.manager,  'shifts'];
PAGES.hr       = [...PAGES.hr,       'shifts'];
NAV.push({ id:'shifts', icon:'🕐', label:'Shift Management', group:'main' });

const _origNavShifts = window.navigate;
window.navigate = function(page) {
  const content = document.getElementById('main-content') || document.getElementById('page-content');
  if (page === 'shifts' && content) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page==='shifts'));
    renderShifts(content); return;
  }
  return _origNavShifts(page);
};

async function renderShifts(container) {
  const user = getUser();
  const isHR = user?.role === 'hr';
  const isMgr = user?.role === 'manager' || isHR;
  let tab = isHR ? 'assignments' : 'my';

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <h2 class="page-title" style="margin:0">🕐 Shift Management</h2>
      ${isHR ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="sh-tab btn btn-primary" data-tab="assignments" style="font-size:.83rem">👥 Assignments</button>
        <button class="sh-tab btn btn-secondary" data-tab="shifts" style="font-size:.83rem">⚙️ Manage Shifts</button>
      </div>` : ''}
    </div>
    <div id="sh-content"></div>`;

  if (isHR) {
    container.querySelectorAll('.sh-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab;
        container.querySelectorAll('.sh-tab').forEach(b => {
          b.className = b.dataset.tab===tab ? 'sh-tab btn btn-primary' : 'sh-tab btn btn-secondary';
          b.style.fontSize = '.83rem';
        });
        loadShiftTab();
      });
    });
  }

  async function loadShiftTab() {
    const el = document.getElementById('sh-content');
    if (!el) return;
    if (tab === 'shifts') { await renderShiftMaster(el); return; }
    if (tab === 'assignments') { await renderShiftAssignments(el); return; }
    await renderMyShift(el);
  }

  loadShiftTab();
}

// ── My Shift (employee view) ──────────────────────────────────
async function renderMyShift(el) {
  try {
    const r = await api.shiftsMy();
    const shift = r?.shift;
    if (!shift) {
      el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text3)">
        <div style="font-size:3rem;margin-bottom:12px">🕐</div>
        <div style="font-weight:600;font-size:1rem">No shift assigned yet</div>
        <div style="font-size:.85rem;margin-top:6px">Contact HR to get a shift assigned</div>
      </div>`;
      return;
    }
    const pad = t => { const p = String(t||'').split(':'); return p[0].padStart(2,'0')+':'+p[1]; };
    const st = pad(shift.StartTime), et = pad(shift.EndTime);
    el.innerHTML = `
      <div style="max-width:480px;margin:0 auto">
        <div style="background:linear-gradient(135deg,${shift.ColorHex},${shift.ColorHex}cc);
                    border-radius:16px;padding:32px;text-align:center;color:#fff;margin-bottom:20px;
                    box-shadow:0 8px 32px ${shift.ColorHex}44">
          <div style="font-size:3rem;margin-bottom:10px">🕐</div>
          <div style="font-size:1.6rem;font-weight:800">${shift.ShiftName}</div>
          <div style="font-size:1rem;opacity:.85;margin-top:4px">${shift.ShiftCode}</div>
          <div style="margin-top:20px;background:rgba(255,255,255,.2);border-radius:10px;padding:14px 20px;display:inline-block">
            <div style="font-size:2rem;font-weight:800">${st} — ${et}</div>
            ${shift.IsNightShift ? '<div style="font-size:.8rem;opacity:.8;margin-top:4px">🌙 Night Shift</div>' : ''}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${[
            ['⏰ Working Hours', `${Math.floor((shift.WorkMinutes||480)/60)}h ${(shift.WorkMinutes||480)%60}m`],
            ['⏱️ Grace (Late)', `${shift.GraceLateMin} minutes`],
            ['⏱️ Grace (Early)', `${shift.GraceEarlyMin} minutes`],
            ['📅 Effective From', new Date(shift.EffectiveFrom).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})],
          ].map(([k,v]) => `
            <div style="background:#fff;border-radius:10px;border:1.5px solid #e2e8f0;padding:14px 16px">
              <div style="font-size:.7rem;color:var(--text3);font-weight:700;text-transform:uppercase">${k}</div>
              <div style="font-weight:700;font-size:.9rem;color:#1e293b;margin-top:4px">${v}</div>
            </div>`).join('')}
        </div>
      </div>`;
  } catch(e) { el.innerHTML = `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
}

// ── Shift Assignments (HR) ────────────────────────────────────
async function renderShiftAssignments(el) {
  el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text3)">Loading...</div>`;
  try {
    const [assignedR, unassignedR, shiftsR] = await Promise.all([
      api.shiftsAssigned(), api.shiftsUnassigned(), api.shiftsList()
    ]);
    const assigned   = assignedR?.assignments || [];
    const unassigned = unassignedR?.employees  || [];
    const shifts     = shiftsR?.shifts        || [];

    const pad = t => { const p = String(t||'').split(':'); return p[0].padStart(2,'0')+':'+p[1]; };

    // Group assigned by shift
    const byShift = {};
    shifts.forEach(s => byShift[s.ShiftID] = { ...s, employees: [] });
    assigned.forEach(a => {
      if (byShift[a.ShiftID]) byShift[a.ShiftID].employees.push(a);
    });

    el.innerHTML = `
      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:16px">
        ${[
          ['Total Employees', assigned.length + unassigned.length, '#6366f1', '#eef2ff'],
          ['Assigned',        assigned.length,    '#16a34a', '#f0fdf4'],
          ['Unassigned',      unassigned.length,  '#dc2626', '#fee2e2'],
          ['Shifts Active',   shifts.length,      '#0ea5e9', '#e0f2fe'],
        ].map(([l,v,c,bg]) => `
          <div style="background:${bg};border-radius:10px;padding:12px 16px;border:1.5px solid ${c}22">
            <div style="font-size:1.4rem;font-weight:800;color:${c}">${v}</div>
            <div style="font-size:.7rem;color:${c};font-weight:700;text-transform:uppercase">${l}</div>
          </div>`).join('')}
      </div>

      <!-- Unassigned warning -->
      ${unassigned.length ? `
      <div style="background:#fff7ed;border:1.5px solid #f59e0b;border-radius:10px;padding:14px 16px;margin-bottom:16px">
        <div style="font-weight:700;color:#92400e;margin-bottom:8px">⚠️ ${unassigned.length} employee${unassigned.length>1?'s':''} without a shift</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${unassigned.map(u => `
            <div style="display:flex;align-items:center;gap:8px;background:#fff;border-radius:8px;
                        padding:6px 12px;border:1px solid #fde68a">
              <span style="font-size:.83rem;font-weight:600">${u.FullName}</span>
              <span style="font-size:.7rem;color:var(--text3)">${u.DepartmentName||''}</span>
              <button class="btn-quick-assign" data-uid="${u.UserID}" data-name="${u.FullName}"
                      style="background:#f59e0b;color:#fff;border:none;border-radius:5px;
                             padding:3px 8px;font-size:.7rem;cursor:pointer;font-weight:700">
                Assign
              </button>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Shift groups -->
      <div style="display:flex;flex-direction:column;gap:14px">
        ${Object.values(byShift).map(sh => !sh.employees.length ? '' : `
          <div style="background:#fff;border-radius:12px;border:1.5px solid ${sh.ColorHex}44;overflow:hidden">
            <div style="background:${sh.ColorHex}18;border-bottom:1.5px solid ${sh.ColorHex}33;
                        padding:12px 16px;display:flex;align-items:center;justify-content:space-between">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:12px;height:12px;border-radius:50%;background:${sh.ColorHex}"></div>
                <div>
                  <span style="font-weight:800;color:#1e293b">${sh.ShiftName}</span>
                  <span style="color:${sh.ColorHex};font-family:monospace;font-size:.78rem;margin-left:8px">${sh.ShiftCode}</span>
                  <span style="color:var(--text3);font-size:.78rem;margin-left:8px">
                    ${pad(sh.StartTime)} – ${pad(sh.EndTime)}
                  </span>
                </div>
              </div>
              <span style="background:${sh.ColorHex};color:#fff;border-radius:20px;
                           padding:2px 12px;font-size:.72rem;font-weight:700">
                ${sh.employees.length} employee${sh.employees.length!==1?'s':''}
              </span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px">
              ${sh.employees.map(e => `
                <div style="display:flex;align-items:center;gap:8px;background:#f8faff;
                            border:1px solid #e0e7ff;border-radius:8px;padding:8px 12px">
                  <div style="width:32px;height:32px;border-radius:50%;background:${sh.ColorHex};
                              display:flex;align-items:center;justify-content:center;
                              color:#fff;font-weight:700;font-size:.78rem;flex-shrink:0">
                    ${(e.FullName||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div style="font-weight:700;font-size:.83rem">${e.FullName}
                      ${e.EmployeeCode?`<span style="color:#0052cc;font-family:monospace;font-size:.7rem">#${e.EmployeeCode}</span>`:''}
                    </div>
                    <div style="font-size:.7rem;color:var(--text3)">${e.DepartmentName||''}</div>
                  </div>
                  <button class="btn-reassign" data-uid="${e.UserID}" data-name="${e.FullName}"
                          style="background:#f1f5f9;color:#64748b;border:none;border-radius:5px;
                                 padding:3px 8px;font-size:.7rem;cursor:pointer;margin-left:4px">
                    🔄 Reassign
                  </button>
                </div>`).join('')}
            </div>
          </div>`).join('')}
      </div>`;

    // Handlers
    el.querySelectorAll('.btn-quick-assign, .btn-reassign').forEach(btn => {
      btn.addEventListener('click', () => {
        showAssignShiftModal(parseInt(btn.dataset.uid), btn.dataset.name, shifts, () => renderShiftAssignments(el));
      });
    });
  } catch(e) { el.innerHTML = `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
}

// ── Shift Master (HR) ─────────────────────────────────────────
async function renderShiftMaster(el) {
  try {
    const r = await api.shiftsList();
    const shifts = r?.shifts || [];
    const pad = t => { const p = String(t||'').split(':'); return p[0].padStart(2,'0')+':'+p[1]; };

    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
        <button id="btn-add-shift" class="btn btn-primary"
                style="background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;font-weight:700">
          ➕ Add New Shift
        </button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
        ${shifts.map(s => `
          <div style="background:#fff;border-radius:14px;border:2px solid ${s.ColorHex}44;
                      overflow:hidden;box-shadow:0 2px 12px ${s.ColorHex}22">
            <div style="background:${s.ColorHex};padding:16px 20px;color:#fff">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <div>
                  <div style="font-weight:800;font-size:1rem">${s.ShiftName}</div>
                  <div style="opacity:.8;font-size:.8rem;font-family:monospace">${s.ShiftCode}</div>
                </div>
                ${s.IsNightShift ? '<span style="font-size:1.2rem">🌙</span>' : '<span style="font-size:1.2rem">☀️</span>'}
              </div>
              <div style="margin-top:12px;font-size:1.4rem;font-weight:800">
                ${pad(s.StartTime)} – ${pad(s.EndTime)}
              </div>
            </div>
            <div style="padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div><div style="font-size:.68rem;color:var(--text3);font-weight:700">WORK HRS</div>
                   <div style="font-weight:700">${Math.floor((s.WorkMinutes||480)/60)}h ${(s.WorkMinutes||480)%60}m</div></div>
              <div><div style="font-size:.68rem;color:var(--text3);font-weight:700">GRACE LATE</div>
                   <div style="font-weight:700">${s.GraceLateMin} min</div></div>
            </div>
            <div style="padding:0 16px 14px;display:flex;gap:8px">
              <button class="btn-edit-shift" data-id="${s.ShiftID}"
                      style="flex:1;background:#eef2ff;color:#6366f1;border:none;border-radius:7px;
                             padding:7px;font-size:.78rem;cursor:pointer;font-weight:600">✏️ Edit</button>
              <button class="btn-del-shift" data-id="${s.ShiftID}"
                      style="background:#fee2e2;color:#dc2626;border:none;border-radius:7px;
                             padding:7px 12px;font-size:.78rem;cursor:pointer;font-weight:600">🗑</button>
            </div>
          </div>`).join('')}
      </div>`;

    document.getElementById('btn-add-shift').addEventListener('click', () => showShiftModal(null, () => renderShiftMaster(el)));
    el.querySelectorAll('.btn-edit-shift').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = shifts.find(x=>x.ShiftID===parseInt(btn.dataset.id));
        showShiftModal(s, () => renderShiftMaster(el));
      });
    });
    el.querySelectorAll('.btn-del-shift').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this shift?')) return;
        await api.shiftsDelete(parseInt(btn.dataset.id));
        renderShiftMaster(el);
      });
    });
  } catch(e) { el.innerHTML = `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
}

function showShiftModal(existing, onSave) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;
    display:flex;align-items:center;justify-content:center;padding:20px`;
  const colors = ['#6366f1','#0ea5e9','#f59e0b','#7c3aed','#10b981','#ef4444','#ec4899'];
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:480px;width:100%;
                box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:20px">
        ${existing?'✏️ Edit Shift':'➕ New Shift'}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Shift Name *</label>
          <input class="form-control" id="sh-name" value="${existing?.ShiftName||''}" placeholder="e.g. Morning Shift" />
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Shift Code *</label>
          <input class="form-control" id="sh-code" value="${existing?.ShiftCode||''}" placeholder="e.g. MORN" ${existing?'readonly':''} style="text-transform:uppercase" />
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Start Time *</label>
          <input class="form-control" type="time" id="sh-start" value="${String(existing?.StartTime||'08:30').slice(0,5)}" />
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">End Time *</label>
          <input class="form-control" type="time" id="sh-end" value="${String(existing?.EndTime||'17:00').slice(0,5)}" />
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Grace Late (min)</label>
          <input class="form-control" type="number" id="sh-grace-late" value="${existing?.GraceLateMin||15}" />
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Grace Early (min)</label>
          <input class="form-control" type="number" id="sh-grace-early" value="${existing?.GraceEarlyMin||15}" />
        </div>
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">Color</label>
        <div style="display:flex;gap:8px">
          ${colors.map(c=>`<div class="sh-color" data-col="${c}" style="width:28px;height:28px;border-radius:50%;
            background:${c};cursor:pointer;border:3px solid ${(existing?.ColorHex||'#6366f1')===c?'#1e293b':'transparent'}"></div>`).join('')}
        </div>
        <input type="hidden" id="sh-color" value="${existing?.ColorHex||'#6366f1'}" />
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:18px;font-size:.85rem">
        <input type="checkbox" id="sh-night" ${existing?.IsNightShift?'checked':''} style="accent-color:#7c3aed" />
        🌙 Night Shift (crosses midnight)
      </label>
      <div id="sh-err" style="color:#dc2626;font-size:.8rem;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button id="sh-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="sh-save" class="btn btn-primary" style="flex:2;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;font-weight:700">
          💾 Save Shift
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelectorAll('.sh-color').forEach(d => {
    d.addEventListener('click', () => {
      overlay.querySelectorAll('.sh-color').forEach(x => x.style.border='3px solid transparent');
      d.style.border = '3px solid #1e293b';
      overlay.querySelector('#sh-color').value = d.dataset.col;
    });
  });
  overlay.querySelector('#sh-cancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });

  overlay.querySelector('#sh-save').onclick = async () => {
    const name  = overlay.querySelector('#sh-name').value.trim();
    const code  = overlay.querySelector('#sh-code').value.trim().toUpperCase();
    const start = overlay.querySelector('#sh-start').value;
    const end   = overlay.querySelector('#sh-end').value;
    const errEl = overlay.querySelector('#sh-err');
    if (!name||!code||!start||!end) { errEl.style.display=''; errEl.textContent='All required fields must be filled.'; return; }
    const data = {
      shiftName: name, shiftCode: code, startTime: start, endTime: end,
      graceLateMin: parseInt(overlay.querySelector('#sh-grace-late').value||15),
      graceEarlyMin: parseInt(overlay.querySelector('#sh-grace-early').value||15),
      workMinutes: 480, colorHex: overlay.querySelector('#sh-color').value,
      isNightShift: overlay.querySelector('#sh-night').checked,
    };
    const btn = overlay.querySelector('#sh-save');
    btn.disabled=true; btn.textContent='Saving...';
    try {
      if (existing) await api.shiftsUpdate(existing.ShiftID, data);
      else await api.shiftsCreate(data);
      overlay.remove(); if (onSave) onSave();
    } catch(e) { errEl.style.display=''; errEl.textContent=e.message; btn.disabled=false; btn.textContent='💾 Save Shift'; }
  };
}

function showAssignShiftModal(userID, userName, shifts, onSave) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;
    display:flex;align-items:center;justify-content:center;padding:20px`;
  const today = new Date().toISOString().slice(0,10);
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:420px;width:100%;
                box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:6px">🕐 Assign Shift</div>
      <div style="color:var(--text3);font-size:.83rem;margin-bottom:20px">for ${userName}</div>
      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">Select Shift *</label>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${shifts.map(s => `
            <label style="display:flex;align-items:center;gap:12px;padding:10px 14px;
                           border:1.5px solid #e2e8f0;border-radius:8px;cursor:pointer;
                           transition:border-color .15s" class="shift-opt">
              <input type="radio" name="sh-pick" value="${s.ShiftID}"
                     style="accent-color:${s.ColorHex};width:16px;height:16px" />
              <div style="width:10px;height:10px;border-radius:50%;background:${s.ColorHex};flex-shrink:0"></div>
              <div style="flex:1">
                <div style="font-weight:700;font-size:.88rem">${s.ShiftName}
                  <span style="color:var(--text3);font-family:monospace;font-size:.72rem">${s.ShiftCode}</span>
                </div>
                <div style="font-size:.72rem;color:var(--text3)">${String(s.StartTime||'').slice(0,5)} – ${String(s.EndTime||'').slice(0,5)}</div>
              </div>
            </label>`).join('')}
        </div>
      </div>
      <div class="form-group" style="margin-bottom:18px">
        <label class="form-label">Effective From</label>
        <input class="form-control" type="date" id="sh-eff-from" value="${today}" />
      </div>
      <div id="sh-assign-err" style="color:#dc2626;font-size:.8rem;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button id="sh-assign-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="sh-assign-save" class="btn btn-primary"
                style="flex:2;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;font-weight:700">
          ✅ Assign Shift
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#sh-assign-cancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });

  overlay.querySelector('#sh-assign-save').onclick = async () => {
    const shiftID = overlay.querySelector('input[name="sh-pick"]:checked')?.value;
    const from    = overlay.querySelector('#sh-eff-from').value;
    const errEl   = overlay.querySelector('#sh-assign-err');
    if (!shiftID) { errEl.style.display=''; errEl.textContent='Please select a shift.'; return; }
    const btn = overlay.querySelector('#sh-assign-save');
    btn.disabled=true; btn.textContent='Assigning...';
    try {
      await api.shiftsAssign({ userID, shiftID: parseInt(shiftID), effectiveFrom: from });
      overlay.remove(); if (onSave) onSave();
    } catch(e) { errEl.style.display=''; errEl.textContent=e.message; btn.disabled=false; btn.textContent='✅ Assign Shift'; }
  };
}

