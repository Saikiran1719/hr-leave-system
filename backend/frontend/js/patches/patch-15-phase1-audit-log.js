// ==============================================================
// HRnova — patch-15-phase1-audit-log.js
// Phase 1 — Audit Log page (HR)
// Lines 3917–4490 of original patch.js
// ==============================================================

// ================================================================
// PHASE 1: BULK APPROVALS + LEAVE ENCASHMENT + AUDIT LOG
// ================================================================

// ── API ──────────────────────────────────────────────────────
api.bulkStatus      = (ids, status, comment) => req('PATCH', '/leaves/bulk-status', { ids, status, comment });

// SQL Server is in IST — parse datetime string directly as local (no offset needed)
function parseIST(dtStr) {
  if (!dtStr) return new Date();
  // Remove trailing microseconds, replace T with space
  // Adding no timezone means JS treats it as LOCAL time — correct since server is IST
  const s = String(dtStr).replace('T',' ').replace(/\.\d+$/,'').trim();
  // Parse as local time by splitting manually
  const [datePart, timePart] = s.split(' ');
  if (!timePart) return new Date(datePart);
  const [y,mo,d] = datePart.split('-').map(Number);
  const [h,mi,se] = timePart.split(':').map(Number);
  return new Date(y, mo-1, d, h, mi, se||0);
}
function fmtISTTime(dtStr) {
  const d = parseIST(dtStr);
  return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true});
}
function fmtISTDate(dtStr) {
  const d = parseIST(dtStr);
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
api.encashTypes     = ()          => req('GET',  '/encashment/types');
api.encashMy        = ()          => req('GET',  '/encashment/my');
api.encashAll       = ()          => req('GET',  '/encashment/all');
api.encashRequest   = (data)      => req('POST', '/encashment/request', data);
api.encashAction    = (id, data)  => req('PATCH', `/encashment/${id}/action`, data);
api.encashYearEnd   = (data)      => req('POST', '/encashment/year-end', data);
api.auditLogs       = (params)    => req('GET',  `/audit?${new URLSearchParams(params).toString()}`);

// ── NAV ──────────────────────────────────────────────────────
PAGES.employee = [...PAGES.employee, 'encashment'];
PAGES.manager  = [...PAGES.manager,  'encashment'];
PAGES.hr       = [...PAGES.hr,       'encashment', 'auditlog'];
NAV.push({ id:'encashment', icon:'💰', label:'Leave Encashment', group:'main' });
NAV.push({ id:'auditlog',   icon:'📋', label:'Audit Log',        group:'main' });

// ── Navigate patch ────────────────────────────────────────────
const _origNavPhase1 = window.navigate;
window.navigate = function(page) {
  const content = document.getElementById('main-content') || document.getElementById('page-content');
  if (page === 'encashment' && content) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page==='encashment'));
    renderEncashment(content); return;
  }
  if (page === 'auditlog' && content) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page==='auditlog'));
    renderAuditLog(content); return;
  }
  return _origNavPhase1(page);
};

// ════════════════════════════════════════════════════════════
// BULK APPROVALS — patch renderApprovals
// ════════════════════════════════════════════════════════════
const _origRenderApprovalsBulk = window.renderApprovals;
window.renderApprovals = async function(container) {
  await _origRenderApprovalsBulk(container);

  // Wait for list to render then inject bulk toolbar
  setTimeout(() => {
    const cards = container.querySelectorAll('[data-approve]');
    if (!cards.length) return;

    // Add checkboxes to each card
    cards.forEach(btn => {
      const id   = btn.dataset.approve;
      const card = btn.closest('.card, [class*="card"], div[style*="border"]');
      if (!card || card.querySelector('.bulk-check')) return;
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'bulk-check'; cb.dataset.id = id;
      cb.style.cssText = 'width:16px;height:16px;accent-color:#6366f1;cursor:pointer;flex-shrink:0;margin-right:4px';
      card.style.position = 'relative';
      const firstChild = card.firstElementChild;
      if (firstChild) card.insertBefore(cb, firstChild);
    });

    // Inject bulk toolbar
    if (container.querySelector('#bulk-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.id = 'bulk-toolbar';
    toolbar.style.cssText = `display:none;position:sticky;top:0;z-index:100;
      background:#fff;border:1.5px solid #6366f1;border-radius:10px;
      padding:10px 16px;margin-bottom:14px;
      display:flex;align-items:center;gap:10px;flex-wrap:wrap;
      box-shadow:0 4px 16px rgba(99,102,241,.15)`;
    toolbar.innerHTML = `
      <span id="bulk-count" style="font-weight:700;color:#6366f1;font-size:.85rem">0 selected</span>
      <input id="bulk-comment" class="form-control" placeholder="Comment (optional)"
             style="flex:1;min-width:160px;font-size:.82rem;padding:6px 10px" />
      <button id="bulk-approve" class="btn btn-primary"
              style="background:#16a34a;border:none;font-size:.82rem;padding:7px 18px;border-radius:7px">
        ✅ Approve All
      </button>
      <button id="bulk-reject"
              style="background:#fee2e2;color:#dc2626;border:1.5px solid #fca5a5;
                     font-size:.82rem;padding:7px 18px;border-radius:7px;cursor:pointer;font-weight:600">
        ❌ Reject All
      </button>
      <button id="bulk-clear"
              style="background:#f1f5f9;color:#64748b;border:none;font-size:.78rem;
                     padding:6px 12px;border-radius:6px;cursor:pointer">
        Clear
      </button>`;

    const firstCard = container.querySelector('[data-approve]')?.closest('div');
    if (firstCard?.parentElement) {
      firstCard.parentElement.insertBefore(toolbar, firstCard);
    }

    function updateToolbar() {
      const checked = [...container.querySelectorAll('.bulk-check:checked')];
      const count = checked.length;
      const tb = document.getElementById('bulk-toolbar');
      if (!tb) return;
      tb.style.display = count > 0 ? 'flex' : 'none';
      const countEl = document.getElementById('bulk-count');
      if (countEl) countEl.textContent = `${count} selected`;
    }

    container.querySelectorAll('.bulk-check').forEach(cb => cb.addEventListener('change', updateToolbar));

    async function doBulk(status) {
      const checked = [...container.querySelectorAll('.bulk-check:checked')];
      const ids = checked.map(c => parseInt(c.dataset.id));
      const comment = document.getElementById('bulk-comment')?.value?.trim();
      if (!ids.length) return;
      const btn = document.getElementById(status==='approved'?'bulk-approve':'bulk-reject');
      if (btn) { btn.disabled=true; btn.textContent='Processing...'; }
      try {
        const r = await api.bulkStatus(ids, status, comment);
        const toast = document.createElement('div');
        toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
          background:${status==='approved'?'#16a34a':'#dc2626'};color:#fff;
          padding:14px 22px;border-radius:12px;font-weight:700;font-size:.88rem`;
        toast.textContent = r.message;
        document.body.appendChild(toast);
        setTimeout(()=>toast.remove(), 3500);
        window.navigate('approvals');
      } catch(e) { alert('Error: '+e.message); }
    }

    document.getElementById('bulk-approve')?.addEventListener('click', () => doBulk('approved'));
    document.getElementById('bulk-reject')?.addEventListener('click',  () => doBulk('rejected'));
    document.getElementById('bulk-clear')?.addEventListener('click', () => {
      container.querySelectorAll('.bulk-check').forEach(c => c.checked=false);
      updateToolbar();
    });

  }, 400);
};

// ════════════════════════════════════════════════════════════
// LEAVE ENCASHMENT PAGE
// ════════════════════════════════════════════════════════════
async function renderEncashment(container) {
  const user  = getUser();
  const isHR  = user?.role === 'hr';

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <h2 class="page-title" style="margin:0">💰 Leave Encashment</h2>
      ${isHR ? `<button id="btn-yearend" class="btn btn-primary"
                  style="background:linear-gradient(135deg,#f59e0b,#d97706);border:none;font-weight:700">
                  📅 Run Year-End Carry Forward
                </button>` : ''}
    </div>
    <div id="encash-content"><div style="text-align:center;padding:40px;color:var(--text3)">Loading...</div></div>`;

  if (isHR) {
    document.getElementById('btn-yearend').addEventListener('click', showYearEndModal);
  }

  async function load() {
    try {
      const [typesRes, myRes] = await Promise.all([api.encashTypes(), api.encashMy()]);
      const allRes = isHR ? await api.encashAll() : null;

      const types    = typesRes?.types    || [];
      const myReqs   = myRes?.requests    || [];
      const allReqs  = allRes?.requests   || [];

      const encashable = types.filter(t => t.IsEncashable);
      const pendingHR  = allReqs.filter(r => r.Status === 'pending');

      let html = '';

      // ── HR: Pending requests ──────────────────────────────
      if (isHR && pendingHR.length) {
        html += `<div class="card" style="margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
            <div class="card-title" style="margin:0">⏳ Pending Encashment Requests</div>
            <span style="background:#f59e0b;color:#fff;border-radius:20px;
                         padding:2px 10px;font-size:.72rem;font-weight:700">${pendingHR.length}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${pendingHR.map(r => `
              <div style="background:var(--surface2);border-radius:10px;padding:14px 16px;
                          border-left:3px solid #f59e0b;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                <div style="flex:1">
                  <div style="font-weight:700;font-size:.9rem">${r.EmployeeName}
                    ${r.EmployeeCode?`<span style="color:#0052cc;font-family:monospace;font-size:.72rem">#${r.EmployeeCode}</span>`:''}
                    <span style="color:var(--text3);font-size:.75rem">${r.DepartmentName||''}</span>
                  </div>
                  <div style="font-size:.82rem;color:var(--text2);margin-top:3px">
                    <span style="background:${r.ColorHex}22;color:${r.ColorHex};border-radius:4px;
                                 padding:1px 8px;font-weight:700">${r.TypeCode}</span>
                    · <strong>${r.DaysRequested} days</strong>
                    ${r.RatePerDay>0?`· ₹${(r.DaysRequested*r.RatePerDay).toLocaleString('en-IN')}`:''}
                    · ${new Date(r.CreatedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;min-width:160px">
                  <textarea id="enc-cmt-${r.EncashID}" placeholder="Comment (optional)"
                            style="border:1px solid var(--border2);border-radius:6px;padding:5px 8px;
                                   font-size:.75rem;resize:none;height:40px;font-family:inherit"></textarea>
                  <div style="display:flex;gap:6px">
                    <button class="enc-act" data-id="${r.EncashID}" data-action="approve"
                            style="flex:1;background:#16a34a;color:#fff;border:none;border-radius:6px;
                                   padding:6px;font-size:.75rem;cursor:pointer;font-weight:600">✅ Approve</button>
                    <button class="enc-act" data-id="${r.EncashID}" data-action="reject"
                            style="flex:1;background:#fee2e2;color:#dc2626;border:1.5px solid #fca5a5;
                                   border-radius:6px;padding:6px;font-size:.75rem;cursor:pointer;font-weight:600">❌ Reject</button>
                  </div>
                </div>
              </div>`).join('')}
          </div>
        </div>`;
      }

      // ── Employee: Apply for encashment ────────────────────
      if (encashable.length && !isHR) {
        html += `<div class="card" style="margin-bottom:20px">
          <div class="card-title" style="margin-bottom:16px">💰 Apply for Leave Encashment</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">
            ${encashable.map(t => {
              const remaining = t.RemainingDays || 0;
              const canEncash = remaining > 0;
              return `
              <div style="background:${canEncash?'#fff':'#f8faff'};border:1.5px solid ${canEncash?t.ColorHex+'44':'#e2e8f0'};
                          border-radius:12px;padding:16px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                  <span style="background:${t.ColorHex}22;color:${t.ColorHex};border-radius:6px;
                               padding:3px 10px;font-weight:800;font-size:.82rem">${t.TypeCode}</span>
                  ${t.EncashRatePerDay>0?`<span style="font-size:.72rem;color:#16a34a;font-weight:700">₹${t.EncashRatePerDay}/day</span>`:''}
                </div>
                <div style="font-size:.82rem;color:var(--text2);margin-bottom:10px">
                  <span style="font-weight:700;font-size:1.1rem;color:#1e293b">${remaining}</span> days remaining
                  ${t.MaxCarryForward?`<div style="font-size:.7rem;color:var(--text3)">Max carry forward: ${t.MaxCarryForward} days</div>`:''}
                </div>
                ${canEncash ? `
                <div style="display:flex;gap:6px;align-items:center">
                  <input type="number" id="enc-days-${t.LeaveTypeID}" min="1" max="${remaining}"
                         value="1" style="width:60px;border:1.5px solid var(--border2);border-radius:6px;
                                          padding:5px 8px;font-size:.82rem;text-align:center" />
                  <button class="btn-encash-apply" data-lt="${t.LeaveTypeID}" data-max="${remaining}"
                          style="flex:1;background:${t.ColorHex};color:#fff;border:none;border-radius:7px;
                                 padding:7px;font-size:.78rem;cursor:pointer;font-weight:700">
                    💰 Encash
                  </button>
                </div>` : `<div style="font-size:.75rem;color:var(--text3)">No remaining balance</div>`}
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }

      // ── My requests history ───────────────────────────────
      const displayReqs = isHR ? allReqs : myReqs;
      if (displayReqs.length) {
        html += `<div class="card">
          <div class="card-title" style="margin-bottom:16px">${isHR?'All Encashment History':'My Encashment Requests'}</div>
          <table style="width:100%;border-collapse:collapse;font-size:.83rem">
            <thead>
              <tr style="background:#f8faff">
                ${isHR?'<th style="padding:8px 12px;text-align:left;color:var(--text3);font-size:.7rem;text-transform:uppercase">Employee</th>':''}
                <th style="padding:8px 12px;text-align:left;color:var(--text3);font-size:.7rem;text-transform:uppercase">Leave Type</th>
                <th style="padding:8px 12px;text-align:center;color:var(--text3);font-size:.7rem;text-transform:uppercase">Days</th>
                <th style="padding:8px 12px;text-align:right;color:var(--text3);font-size:.7rem;text-transform:uppercase">Amount</th>
                <th style="padding:8px 12px;text-align:center;color:var(--text3);font-size:.7rem;text-transform:uppercase">Status</th>
                <th style="padding:8px 12px;text-align:left;color:var(--text3);font-size:.7rem;text-transform:uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              ${displayReqs.map(r => {
                const sc = r.Status==='approved'?'#16a34a':r.Status==='rejected'?'#dc2626':'#d97706';
                const sb = r.Status==='approved'?'#dcfce7':r.Status==='rejected'?'#fee2e2':'#fef9c3';
                return `<tr style="border-top:1px solid var(--border2)">
                  ${isHR?`<td style="padding:10px 12px;font-weight:600">${r.EmployeeName||''}</td>`:''}
                  <td style="padding:10px 12px">
                    <span style="background:${r.ColorHex}22;color:${r.ColorHex};border-radius:4px;
                                 padding:1px 8px;font-weight:700">${r.TypeCode}</span>
                  </td>
                  <td style="padding:10px 12px;text-align:center;font-weight:700">${r.DaysRequested}</td>
                  <td style="padding:10px 12px;text-align:right;color:#16a34a;font-weight:700">
                    ${r.TotalAmount>0?`₹${parseFloat(r.TotalAmount).toLocaleString('en-IN')}`:'—'}
                  </td>
                  <td style="padding:10px 12px;text-align:center">
                    <span style="background:${sb};color:${sc};border-radius:4px;padding:2px 10px;font-size:.72rem;font-weight:700">
                      ${r.Status}
                    </span>
                  </td>
                  <td style="padding:10px 12px;color:var(--text3)">
                    ${new Date(r.CreatedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      }

      if (!html) html = `<div style="text-align:center;padding:60px;color:var(--text3)">
        <div style="font-size:2.5rem;margin-bottom:12px">💰</div>
        <div style="font-weight:600">No encashment data yet</div>
        <div style="font-size:.85rem;margin-top:6px">Leave balances must be configured first</div>
      </div>`;

      document.getElementById('encash-content').innerHTML = html;

      // Apply handlers
      document.querySelectorAll('.btn-encash-apply').forEach(btn => {
        btn.addEventListener('click', async () => {
          const lt   = parseInt(btn.dataset.lt);
          const max  = parseInt(btn.dataset.max);
          const days = parseInt(document.getElementById(`enc-days-${lt}`)?.value)||1;
          if (days < 1 || days > max) { alert(`Enter between 1 and ${max} days`); return; }
          if (!confirm(`Request encashment of ${days} day(s)?`)) return;
          btn.disabled=true; btn.textContent='Submitting...';
          try {
            const r = await api.encashRequest({ leaveTypeID: lt, daysRequested: days });
            if (r.success) {
              const t = document.createElement('div');
              t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
                background:#16a34a;color:#fff;padding:14px 22px;border-radius:12px;font-weight:700`;
              t.textContent = '💰 Encashment request submitted!';
              document.body.appendChild(t); setTimeout(()=>t.remove(), 3000);
              load();
            }
          } catch(e) { alert(e.message); btn.disabled=false; btn.textContent='💰 Encash'; }
        });
      });

      document.querySelectorAll('.enc-act').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id      = parseInt(btn.dataset.id);
          const action  = btn.dataset.action;
          const comment = document.getElementById(`enc-cmt-${id}`)?.value?.trim();
          btn.disabled=true; btn.textContent='...';
          try {
            await api.encashAction(id, { action, comment });
            const t = document.createElement('div');
            t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
              background:${action==='approve'?'#16a34a':'#dc2626'};color:#fff;
              padding:12px 20px;border-radius:10px;font-weight:700`;
            t.textContent = action==='approve'?'✅ Encashment Approved!':'❌ Encashment Rejected';
            document.body.appendChild(t); setTimeout(()=>t.remove(), 3000);
            load();
          } catch(e) { alert(e.message); btn.disabled=false; }
        });
      });

    } catch(e) {
      document.getElementById('encash-content').innerHTML =
        `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`;
    }
  }
  load();
}

function showYearEndModal() {
  const cy = new Date().getFullYear();
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;
                            display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:440px;width:100%;
                box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:6px">📅 Year-End Carry Forward</div>
      <div style="font-size:.82rem;color:var(--text3);margin-bottom:20px">
        Carry forward unused leave balances to next year based on MaxCarryForward settings per leave type.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="form-group" style="margin:0">
          <label class="form-label">From Year</label>
          <input class="form-control" type="number" id="ye-from" value="${cy}" />
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">To Year</label>
          <input class="form-control" type="number" id="ye-to" value="${cy+1}" />
        </div>
      </div>
      <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;
                  padding:10px 14px;margin-bottom:18px;font-size:.78rem;color:#854d0e">
        ⚠️ This will carry forward unused balances for all employees. Run only once per year.
      </div>
      <div id="ye-result" style="display:none;margin-bottom:12px"></div>
      <div style="display:flex;gap:10px">
        <button id="ye-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="ye-run" class="btn btn-primary"
                style="flex:2;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;font-weight:700">
          🚀 Run Carry Forward
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#ye-cancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
  overlay.querySelector('#ye-run').onclick = async () => {
    const from = parseInt(overlay.querySelector('#ye-from').value);
    const to   = parseInt(overlay.querySelector('#ye-to').value);
    const btn  = overlay.querySelector('#ye-run');
    btn.disabled=true; btn.textContent='Running...';
    try {
      const r = await api.encashYearEnd({ fromYear: from, toYear: to });
      const res = overlay.querySelector('#ye-result');
      res.style.display='';
      res.innerHTML=`<div style="background:#dcfce7;border-radius:8px;padding:10px 14px;
                                  color:#16a34a;font-weight:700;font-size:.85rem">
        ✅ ${r.message}</div>`;
      btn.textContent='Done ✅';
    } catch(e) { alert(e.message); btn.disabled=false; btn.textContent='🚀 Run Carry Forward'; }
  };
}

// ════════════════════════════════════════════════════════════
// AUDIT LOG PAGE (HR only)
// ════════════════════════════════════════════════════════════
async function renderAuditLog(container) {
  let page = 1;
  let filters = { search:'', entity:'', from:'', to:'' };

  const ACTION_ICONS = {
    leave_approved:'✅', leave_rejected:'❌', leave_bulk_approved:'✅✅',
    leave_bulk_rejected:'❌❌', encashment_requested:'💰', encashment_approved:'💰✅',
    encashment_rejected:'💰❌', year_end_carry_forward:'📅',
    leave_applied:'📝', employee_updated:'👤',
  };

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h2 class="page-title" style="margin:0">📋 Audit Log</h2>
      <span style="font-size:.78rem;color:var(--text3)">Track every action in the system</span>
    </div>

    <!-- Filters -->
    <div style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;
                padding:14px 16px;margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div style="flex:2;min-width:160px">
        <label style="font-size:.72rem;font-weight:700;color:var(--text3);display:block;margin-bottom:4px">SEARCH</label>
        <input class="form-control" id="audit-search" placeholder="Name or action..." style="font-size:.82rem" />
      </div>
      <div style="flex:1;min-width:120px">
        <label style="font-size:.72rem;font-weight:700;color:var(--text3);display:block;margin-bottom:4px">FROM</label>
        <input class="form-control" id="audit-from" type="date" style="font-size:.82rem" />
      </div>
      <div style="flex:1;min-width:120px">
        <label style="font-size:.72rem;font-weight:700;color:var(--text3);display:block;margin-bottom:4px">TO</label>
        <input class="form-control" id="audit-to" type="date" style="font-size:.82rem" />
      </div>
      <button id="audit-filter-btn" class="btn btn-primary" style="padding:8px 18px;font-size:.82rem">
        🔍 Filter
      </button>
      <button id="audit-clear-btn" class="btn btn-secondary" style="padding:8px 14px;font-size:.82rem">
        ✕ Clear
      </button>
    </div>

    <div id="audit-table-wrap">
      <div style="text-align:center;padding:40px;color:var(--text3)">Loading...</div>
    </div>`;

  async function loadLogs() {
    const el = document.getElementById('audit-table-wrap');
    if (!el) return;
    el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text3)">Loading...</div>`;
    try {
      const r = await api.auditLogs({ ...filters, page, limit: 50 });
      const logs = r?.logs || [];
      const total = r?.total || 0;

      if (!logs.length) {
        el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">
          <div style="font-size:2rem;margin-bottom:10px">📋</div>No audit logs found.</div>`;
        return;
      }

      el.innerHTML = `
        <div style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;overflow:hidden">
          <div style="padding:12px 16px;background:#f8faff;border-bottom:1px solid #e2e8f0;
                      display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:.78rem;color:var(--text3);font-weight:600">${total} total records</span>
            <div style="display:flex;gap:6px">
              <button id="audit-prev" ${page<=1?'disabled':''} class="btn btn-secondary"
                      style="padding:4px 12px;font-size:.75rem">‹ Prev</button>
              <span style="font-size:.78rem;color:var(--text3);padding:4px 8px">Page ${page}</span>
              <button id="audit-next" ${logs.length<50?'disabled':''} class="btn btn-secondary"
                      style="padding:4px 12px;font-size:.75rem">Next ›</button>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:.82rem">
            <thead>
              <tr style="background:#f8faff">
                <th style="padding:10px 14px;text-align:left;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">When</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">User</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Action</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Entity</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Change</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(l => {
                const icon = ACTION_ICONS[l.Action] || '📌';
                const dt   = new Date(l.CreatedAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                let change = '';
                if (l.NewValue) {
                  try {
                    const nv = JSON.parse(l.NewValue);
                    change = Object.entries(nv).map(([k,v])=>`<span style="color:#6366f1;font-size:.72rem">${k}:</span> <strong>${v}</strong>`).join(' · ');
                  } catch{ change = l.NewValue?.slice(0,60)||''; }
                }
                return `<tr style="border-bottom:1px solid #f1f5f9;transition:background .1s" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
                  <td style="padding:10px 14px;color:var(--text3);white-space:nowrap;font-size:.75rem">${dt}</td>
                  <td style="padding:10px 14px">
                    <div style="font-weight:700;font-size:.82rem">${l.UserName||'System'}</div>
                    <div style="font-size:.68rem;color:var(--text3)">${l.UserRole||''}</div>
                  </td>
                  <td style="padding:10px 14px">
                    <span style="font-size:1rem">${icon}</span>
                    <span style="font-size:.78rem;color:#334155;margin-left:5px">${l.Action.replace(/_/g,' ')}</span>
                  </td>
                  <td style="padding:10px 14px">
                    <span style="background:#eef2ff;color:#6366f1;border-radius:4px;padding:2px 8px;font-size:.72rem;font-weight:700">${l.Entity}</span>
                    ${l.EntityID?`<span style="color:var(--text3);font-size:.7rem"> #${l.EntityID}</span>`:''}
                  </td>
                  <td style="padding:10px 14px;font-size:.75rem;color:#374151;max-width:240px;overflow:hidden;text-overflow:ellipsis">${change||'—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;

      document.getElementById('audit-prev')?.addEventListener('click', () => { page--; loadLogs(); });
      document.getElementById('audit-next')?.addEventListener('click', () => { page++; loadLogs(); });
    } catch(e) {
      el.innerHTML = `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`;
    }
  }

  document.getElementById('audit-filter-btn').addEventListener('click', () => {
    filters.search = document.getElementById('audit-search').value.trim();
    filters.from   = document.getElementById('audit-from').value;
    filters.to     = document.getElementById('audit-to').value;
    page = 1; loadLogs();
  });
  document.getElementById('audit-clear-btn').addEventListener('click', () => {
    filters = { search:'', entity:'', from:'', to:'' };
    document.getElementById('audit-search').value='';
    document.getElementById('audit-from').value='';
    document.getElementById('audit-to').value='';
    page=1; loadLogs();
  });

  loadLogs();
}

console.log('✅ Phase 1 loaded: Bulk Approvals + Encashment + Audit Log');

