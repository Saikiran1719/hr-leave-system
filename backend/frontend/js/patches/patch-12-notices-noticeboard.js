// ==============================================================
// HRnova — patch-12-notices-noticeboard.js
// Notices / Noticeboard feature
// Lines 2921–3180 of original patch.js
// ==============================================================

// ================================================================
// OOD (ON OFFICIAL DUTY) FEATURE
// ================================================================

api.oodApply   = (data)      => req('POST',  '/leaves/ood', data);
api.oodList    = ()          => req('GET',   '/leaves/ood');
api.oodApprove = (id, data)  => req('PATCH', `/leaves/ood/${id}/approve`, data);

// ── Patch renderApply to add OOD button ──────────────────────
const _origRenderApplyOOD = window.renderApply;
window.renderApply = async function(container) {
  await _origRenderApplyOOD(container);
  // Inject OOD button after type grid
  setTimeout(() => {
    if (document.getElementById('ood-inject')) return;
    const card = container.querySelector('.card');
    if (!card) return;
    const wrap = document.createElement('div');
    wrap.id = 'ood-inject';
    wrap.style.cssText = 'margin-top:16px;padding-top:16px;border-top:1px solid var(--border2)';
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;font-size:.9rem;color:#0369a1">🚗 On Official Duty (OOD)</div>
          <div style="font-size:.78rem;color:var(--text3);margin-top:2px">
            Visiting a client/site on company work? Counts as Present after Manager + HR approval.
          </div>
        </div>
        <button id="open-ood-btn" class="btn btn-primary"
                style="background:#0ea5e9;border:none;padding:10px 22px;font-size:.85rem;border-radius:8px">
          🚗 Apply OOD
        </button>
      </div>`;
    card.appendChild(wrap);
    document.getElementById('open-ood-btn').addEventListener('click', showOODModal);
  }, 200);
};

function showOODModal() {
  const existing = document.getElementById('ood-modal-overlay');
  if (existing) existing.remove();
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const todayVal = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

  const overlay = document.createElement('div');
  overlay.id = 'ood-modal-overlay';
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;
                            display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:500px;width:100%;
                box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <div style="width:44px;height:44px;border-radius:10px;background:#e0f2fe;
                    display:flex;align-items:center;justify-content:center;font-size:1.4rem">🚗</div>
        <div>
          <div style="font-size:1.1rem;font-weight:800;color:#0c4a6e">Apply for OOD</div>
          <div style="font-size:.78rem;color:var(--text3)">On Official Duty — requires Manager + HR approval</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div class="form-group" style="margin:0">
          <label class="form-label">From Date <span style="color:red">*</span></label>
          <input class="form-control" type="date" id="ood-from" value="${todayVal}" />
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">To Date <span style="color:red">*</span></label>
          <input class="form-control" type="date" id="ood-to" value="${todayVal}" />
        </div>
      </div>
      <div style="background:#f0f9ff;border-radius:8px;padding:10px 14px;text-align:center;
                  font-size:.85rem;color:#0369a1;font-weight:600;margin-bottom:14px" id="ood-days-info">
        📅 1 day
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">Visit Location / Client Name</label>
        <input class="form-control" type="text" id="ood-location" placeholder="e.g. ABC Client Office, Mumbai" />
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">Purpose / Reason <span style="color:red">*</span></label>
        <textarea class="form-control" id="ood-reason" rows="3"
                  placeholder="Describe the official work purpose..." style="resize:vertical"></textarea>
      </div>
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;
                  padding:12px 14px;margin-bottom:18px;font-size:.8rem;color:#854d0e">
        ⚠️ <strong>Dual Approval Required:</strong> Both Manager and HR must approve.
        Once fully approved, days are auto-marked as <strong>Present</strong> — no punch required.
      </div>
      <div id="ood-err" style="color:#dc2626;font-size:.8rem;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button id="ood-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="ood-submit" class="btn btn-primary" style="flex:2;background:#0ea5e9;border:none">
          🚗 Submit OOD Request
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  function updateDays() {
    const f = document.getElementById('ood-from').value;
    const t = document.getElementById('ood-to').value;
    if (f && t && t >= f) {
      const diff = Math.round((new Date(t)-new Date(f))/86400000)+1;
      document.getElementById('ood-days-info').textContent = `📅 ${diff} day${diff>1?'s':''}`;
    }
  }
  document.getElementById('ood-from').addEventListener('change', function() {
    const toEl = document.getElementById('ood-to');
    if (toEl.value < this.value) toEl.value = this.value;
    updateDays();
  });
  document.getElementById('ood-to').addEventListener('change', updateDays);
  document.getElementById('ood-cancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target===overlay) overlay.remove(); });

  document.getElementById('ood-submit').onclick = async () => {
    const from     = document.getElementById('ood-from').value;
    const to       = document.getElementById('ood-to').value;
    const oodLocation = document.getElementById('ood-location').value.trim();
    const reason   = document.getElementById('ood-reason').value.trim();
    const errEl    = document.getElementById('ood-err');
    if (!reason) { errEl.style.display=''; errEl.textContent='Please enter a reason/purpose.'; return; }
    if (!from || !to || to < from) { errEl.style.display=''; errEl.textContent='Invalid dates.'; return; }
    const totalDays = Math.round((new Date(to)-new Date(from))/86400000)+1;
    const btn = document.getElementById('ood-submit');
    btn.disabled = true; btn.textContent = 'Submitting...';
    errEl.style.display = 'none';
    try {
      const r = await api.oodApply({ fromDate: from, toDate: to, totalDays, reason, oodLocation });
      if (r.success) {
        overlay.remove();
        const toast = document.createElement('div');
        toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
          background:linear-gradient(135deg,#0369a1,#0ea5e9);color:#fff;
          padding:14px 22px;border-radius:12px;font-weight:600;font-size:.88rem;
          box-shadow:0 8px 24px rgba(14,165,233,.4)`;
        toast.innerHTML = `🚗 OOD request submitted!<br><small style="opacity:.85;font-weight:400">Awaiting Manager & HR approval</small>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
      } else {
        errEl.style.display=''; errEl.textContent = r.error||'Failed to submit';
        btn.disabled=false; btn.textContent='🚗 Submit OOD Request';
      }
    } catch(e) {
      errEl.style.display=''; errEl.textContent = e.message||'Network error';
      btn.disabled=false; btn.textContent='🚗 Submit OOD Request';
    }
  };
}

// ── OOD Approvals injected into Approvals page ────────────────
const _origRenderApprovalsOOD = window.renderApprovals;
window.renderApprovals = async function(container) {
  if (_origRenderApprovalsOOD) await _origRenderApprovalsOOD(container);
  const user = getUser();
  if (!user || user.role === 'employee') return;
  try {
    const r    = await api.oodList();
    const apps = (r?.applications||[]).filter(a => a.Status==='pending');
    renderOODApprovals(container, apps, user);
  } catch(e) { console.error('[OOD approvals]', e); }
};

function renderOODApprovals(container, apps, user) {
  const existing = document.getElementById('ood-approvals-section');
  if (existing) existing.remove();
  const isHR = user.role === 'hr';

  const statusPill = (s) => {
    const col = s==='approved'?'#16a34a':s==='rejected'?'#dc2626':'#d97706';
    const bg  = s==='approved'?'#dcfce7':s==='rejected'?'#fee2e2':'#fef9c3';
    return `<span style="background:${bg};color:${col};border-radius:4px;padding:2px 8px;font-size:.7rem;font-weight:700">${s||'pending'}</span>`;
  };

  const sec = document.createElement('div');
  sec.id = 'ood-approvals-section';
  sec.innerHTML = `
    <div class="card" style="margin-top:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div class="card-title" style="margin:0">🚗 OOD Approvals</div>
        ${apps.length ? `<span style="background:#0ea5e9;color:#fff;border-radius:20px;padding:2px 10px;font-size:.72rem">${apps.length} pending</span>` : ''}
      </div>
      ${!apps.length
        ? `<div style="color:var(--text3);font-size:.85rem">No pending OOD requests.</div>`
        : `<div style="display:flex;flex-direction:column;gap:12px">
          ${apps.map(a => {
            const canAct = isHR ? a.OODHRStatus==='pending' : a.OODManagerStatus==='pending';
            return `
            <div style="background:var(--surface2);border-radius:10px;padding:16px;border-left:3px solid #0ea5e9">
              <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
                <div style="flex:1">
                  <div style="font-weight:700;color:#0c4a6e">🚗 ${a.EmployeeName}
                    ${a.EmployeeCode?`<span style="color:#0052cc;font-family:monospace;font-size:.75rem">#${a.EmployeeCode}</span>`:''}
                  </div>
                  <div style="color:var(--text2);font-size:.82rem;margin-top:3px">
                    📅 ${new Date(a.FromDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                    → ${new Date(a.ToDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                    · <strong>${a.TotalDays} day${a.TotalDays>1?'s':''}</strong>
                  </div>
                  ${a.OODLocation?`<div style="color:#0369a1;font-size:.8rem;margin-top:2px">📍 ${a.OODLocation}</div>`:''}
                  <div style="color:var(--text3);font-size:.8rem;margin-top:3px">💬 ${a.Reason}</div>
                  <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
                    <span style="font-size:.72rem;color:var(--text3)">Manager:</span> ${statusPill(a.OODManagerStatus)}
                    <span style="font-size:.72rem;color:var(--text3);margin-left:4px">HR:</span> ${statusPill(a.OODHRStatus)}
                  </div>
                </div>
                ${canAct ? `
                <div style="display:flex;flex-direction:column;gap:6px;min-width:150px">
                  <textarea placeholder="Comment (optional)" id="ood-cmt-${a.ApplicationID}"
                            style="width:100%;border:1px solid var(--border2);border-radius:6px;
                                   padding:6px 8px;font-size:.75rem;resize:none;height:44px;font-family:inherit"></textarea>
                  <button class="ood-act-btn" data-id="${a.ApplicationID}" data-action="approve"
                          style="background:#16a34a;color:#fff;border:none;border-radius:6px;
                                 padding:7px;font-size:.78rem;cursor:pointer;font-weight:600">
                    ✅ Approve OOD
                  </button>
                  <button class="ood-act-btn" data-id="${a.ApplicationID}" data-action="reject"
                          style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;
                                 border-radius:6px;padding:7px;font-size:.78rem;cursor:pointer;font-weight:600">
                    ❌ Reject
                  </button>
                </div>` : `<div style="font-size:.75rem;color:var(--text3);padding:8px;text-align:center">Already actioned</div>`}
              </div>
            </div>`;
          }).join('')}
        </div>`}
    </div>`;
  container.appendChild(sec);

  sec.querySelectorAll('.ood-act-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id     = parseInt(btn.dataset.id);
      const action = btn.dataset.action;
      const comment= document.getElementById(`ood-cmt-${id}`)?.value?.trim();
      btn.disabled = true; btn.textContent = 'Processing...';
      try {
        const r = await api.oodApprove(id, { action, comment });
        if (r.success) {
          const toast = document.createElement('div');
          toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
            background:${action==='approve'?'#16a34a':'#dc2626'};color:#fff;
            padding:12px 20px;border-radius:10px;font-weight:600;font-size:.85rem`;
          toast.textContent = action==='approve'
            ? `✅ OOD Approved! ${r.finalStatus==='approved'?'Marked as Present.':'Awaiting other approval.'}`
            : '❌ OOD Rejected.';
          document.body.appendChild(toast);
          setTimeout(()=>toast.remove(), 3500);
          window.navigate('approvals');
        }
      } catch(e) {
        btn.disabled=false;
        btn.textContent = action==='approve'?'✅ Approve OOD':'❌ Reject';
        alert('Error: '+e.message);
      }
    });
  });
}

console.log('🚗 OOD module loaded');

