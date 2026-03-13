// ==============================================================
// HRnova — patch-20-phase4b-exit.js
// Phase 4B — Exit Management
// Lines 6590–6856 of original patch.js
// ==============================================================

// ================================================================
// PHASE 4B: EXIT MANAGEMENT
// ================================================================

api.exitList     = ()        => req('GET',  '/exit');
api.exitSubmit   = (d)       => req('POST', '/exit', d);
api.exitStatus   = (id,d)    => req('PATCH',`/exit/${id}/status`, d);
api.exitChecklist= (id,d)    => req('PATCH',`/exit/${id}/checklist`, d);
api.exitWithdraw = (id)      => req('PATCH',`/exit/${id}/withdraw`, {});

PAGES.employee = [...PAGES.employee, 'exit'];
PAGES.manager  = [...PAGES.manager,  'exit'];
PAGES.hr       = [...PAGES.hr,       'exit'];
NAV.push({ id:'exit', icon:'🚪', label:'Exit Management', group:'main' });

const _origNavExit = window.navigate;
window.navigate = function(page) {
  const content = document.getElementById('main-content') || document.getElementById('page-content');
  if (page === 'exit' && content) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page==='exit'));
    renderExit(content); return;
  }
  return _origNavExit(page);
};

const EXIT_STATUS_COLOR = { submitted:'#d97706', accepted:'#0ea5e9', notice_period:'#6366f1', completed:'#16a34a', withdrawn:'#94a3b8', rejected:'#dc2626' };
const EXIT_STATUS_BG    = { submitted:'#fef9c3', accepted:'#e0f2fe', notice_period:'#eef2ff', completed:'#dcfce7', withdrawn:'#f1f5f9', rejected:'#fee2e2' };

async function renderExit(container) {
  const user = getUser();
  const isHR = user?.role === 'hr';

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <h2 class="page-title" style="margin:0">🚪 Exit Management</h2>
      ${!isHR ? `<button id="btn-resign" class="btn"
        style="background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;border:none;
               font-weight:700;padding:10px 20px;border-radius:10px">
        🚪 Submit Resignation
      </button>` : ''}
    </div>
    <div id="exit-content"><div style="text-align:center;padding:30px;color:var(--text3)">Loading...</div></div>`;

  if (!isHR) {
    document.getElementById('btn-resign').addEventListener('click', showResignModal);
  }

  async function load() {
    const el = document.getElementById('exit-content');
    if (!el) return;
    try {
      const r = await api.exitList();
      const exits = r?.exits || [];

      if (!exits.length) {
        el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text3)">
          <div style="font-size:3rem;margin-bottom:12px">🚪</div>
          <div style="font-weight:600">${isHR?'No exit requests yet':'You have no resignation requests'}</div>
        </div>`; return;
      }

      el.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px">
        ${exits.map(e => {
          const sc = EXIT_STATUS_COLOR[e.Status]||'#94a3b8';
          const sb = EXIT_STATUS_BG[e.Status]||'#f1f5f9';
          const lwd = e.LastWorkingDay ? new Date(e.LastWorkingDay).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
          const rd  = new Date(e.ResignDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
          const checklist = [
            {key:'AssetsReturned',label:'Assets Returned',icon:'📦',done:e.AssetsReturned},
            {key:'AccessRevoked', label:'Access Revoked', icon:'🔐',done:e.AccessRevoked},
            {key:'ExitInterview', label:'Exit Interview',icon:'💬',done:e.ExitInterview},
            {key:'FnFProcessed',  label:'F&F Processed', icon:'💰',done:e.FnFProcessed},
          ];
          return `
          <div style="background:#fff;border-radius:14px;border:1.5px solid ${sc}44;overflow:hidden">
            <div style="background:${sc}12;border-bottom:1.5px solid ${sc}22;padding:14px 20px;
                        display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px">
              <div>
                ${isHR?`<div style="font-weight:800;font-size:.98rem;color:#1e293b">${e.FullName}
                  ${e.EmployeeCode?`<span style="color:#0052cc;font-family:monospace;font-size:.75rem">#${e.EmployeeCode}</span>`:''}
                  <span style="color:var(--text3);font-size:.75rem">${e.DepartmentName||''}</span>
                </div>`:''}
                <div style="font-size:.82rem;color:var(--text2);margin-top:${isHR?'4px':'0'}">
                  <span style="font-weight:600">Reason:</span> ${e.Reason}
                  · <span style="font-weight:600">Resigned:</span> ${rd}
                  · <span style="font-weight:600">Last Day:</span> ${lwd}
                  · <span style="font-weight:600">Notice:</span> ${e.NoticePeriodDays} days
                </div>
                ${e.Remarks?`<div style="font-size:.78rem;color:var(--text3);margin-top:3px">"${e.Remarks}"</div>`:''}
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="background:${sb};color:${sc};border-radius:20px;
                             padding:3px 14px;font-size:.72rem;font-weight:700;text-transform:uppercase">
                  ${e.Status.replace(/_/g,' ')}
                </span>
                ${isHR && ['submitted','accepted'].includes(e.Status) ? `
                  <select class="exit-status-sel" data-id="${e.ExitID}"
                          style="border:1.5px solid #e2e8f0;border-radius:7px;padding:5px 10px;font-size:.78rem;font-weight:600;cursor:pointer">
                    <option value="">Update Status...</option>
                    <option value="accepted">✅ Accept</option>
                    <option value="notice_period">⏳ Notice Period</option>
                    <option value="rejected">❌ Reject</option>
                  </select>` : ''}
                ${isHR && e.Status==='notice_period' ? `
                  <button class="btn-complete-exit" data-id="${e.ExitID}"
                          style="background:#16a34a;color:#fff;border:none;border-radius:7px;
                                 padding:6px 14px;font-size:.78rem;cursor:pointer;font-weight:700">
                    ✅ Mark Complete
                  </button>` : ''}
                ${!isHR && e.Status==='submitted' ? `
                  <button class="btn-withdraw" data-id="${e.ExitID}"
                          style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;
                                 border-radius:7px;padding:6px 12px;font-size:.78rem;cursor:pointer;font-weight:600">
                    ↩️ Withdraw
                  </button>` : ''}
              </div>
            </div>
            ${isHR && !['withdrawn','rejected'].includes(e.Status) ? `
            <div style="padding:14px 20px">
              <div style="font-size:.72rem;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px">Exit Checklist</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${checklist.map(item=>`
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;
                                background:${item.done?'#dcfce7':'#f8faff'};border:1.5px solid ${item.done?'#86efac':'#e2e8f0'};
                                border-radius:8px;padding:6px 12px;font-size:.78rem;font-weight:600;
                                color:${item.done?'#16a34a':'#64748b'};transition:all .15s">
                    <input type="checkbox" class="exit-check" data-id="${e.ExitID}" data-key="${item.key}"
                           ${item.done?'checked':''} style="accent-color:#16a34a;width:14px;height:14px" />
                    ${item.icon} ${item.label}
                  </label>`).join('')}
              </div>
              ${e.FnFProcessed ? `
              <div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <span style="font-size:.78rem;font-weight:600;color:#16a34a">💰 F&F Amount:</span>
                <input id="fnf-amount-${e.ExitID}" type="number" placeholder="₹ Amount"
                       value="${e.FnFAmount||''}"
                       style="border:1.5px solid #e2e8f0;border-radius:6px;padding:4px 8px;width:120px;font-size:.8rem" />
                <button class="btn-save-fnf" data-id="${e.ExitID}"
                        style="background:#16a34a;color:#fff;border:none;border-radius:6px;
                               padding:5px 12px;font-size:.75rem;cursor:pointer;font-weight:600">Save</button>
              </div>` : ''}
            </div>` : ''}
          </div>`;
        }).join('')}
      </div>`;

      // Status change
      el.querySelectorAll('.exit-status-sel').forEach(sel => {
        sel.addEventListener('change', async () => {
          if (!sel.value) return;
          const comment = prompt('Add a comment (optional):') || '';
          try {
            await api.exitStatus(parseInt(sel.dataset.id), { status: sel.value, hrComment: comment });
            load();
          } catch(e) { alert(e.message); }
        });
      });

      // Complete exit
      el.querySelectorAll('.btn-complete-exit').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Mark this exit as complete?')) return;
          await api.exitStatus(parseInt(btn.dataset.id), { status:'completed' });
          load();
        });
      });

      // Withdraw
      el.querySelectorAll('.btn-withdraw').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Withdraw your resignation?')) return;
          await api.exitWithdraw(parseInt(btn.dataset.id));
          load();
        });
      });

      // Checklist checkboxes
      el.querySelectorAll('.exit-check').forEach(cb => {
        cb.addEventListener('change', async () => {
          const upd = {};
          const keyMap = { AssetsReturned:'assetsReturned', AccessRevoked:'accessRevoked', ExitInterview:'exitInterview', FnFProcessed:'fnfProcessed' };
          upd[keyMap[cb.dataset.key]] = cb.checked;
          await api.exitChecklist(parseInt(cb.dataset.id), upd).catch(e=>alert(e.message));
          load();
        });
      });

      // F&F amount save
      el.querySelectorAll('.btn-save-fnf').forEach(btn => {
        btn.addEventListener('click', async () => {
          const amount = document.getElementById(`fnf-amount-${btn.dataset.id}`)?.value;
          await api.exitChecklist(parseInt(btn.dataset.id), { fnfAmount: parseFloat(amount)||null });
          load();
        });
      });

    } catch(e) { el.innerHTML=`<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
  }

  load();
}

function showResignModal() {
  const today = new Date().toISOString().slice(0,10);
  const overlay=document.createElement('div');
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:6px">🚪 Submit Resignation</div>
      <div style="color:var(--text3);font-size:.82rem;margin-bottom:20px">This will notify your manager and HR</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div class="form-group" style="margin:0"><label class="form-label">Resignation Date *</label>
          <input class="form-control" type="date" id="res-date" value="${today}" /></div>
        <div class="form-group" style="margin:0"><label class="form-label">Notice Period (days)</label>
          <input class="form-control" type="number" id="res-notice" value="30" min="0" /></div>
      </div>
      <div class="form-group" style="margin-bottom:14px"><label class="form-label">Reason *</label>
        <select class="form-control" id="res-reason">
          <option value="">— Select Reason —</option>
          ${['Personal','Better Opportunity','Higher Studies','Health','Relocation','Family Reasons','Other'].map(r=>`<option value="${r}">${r}</option>`).join('')}
        </select></div>
      <div class="form-group" style="margin-bottom:18px"><label class="form-label">Additional Remarks</label>
        <textarea class="form-control" id="res-remarks" rows="3" style="resize:none"
                  placeholder="Any additional information..."></textarea></div>
      <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:10px 14px;
                  margin-bottom:18px;font-size:.78rem;color:#854d0e">
        ⚠️ Your last working day will be calculated based on the notice period. HR can adjust this.
      </div>
      <div id="res-err" style="color:#dc2626;font-size:.8rem;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button id="res-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="res-save" class="btn"
                style="flex:2;background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;
                       border:none;font-weight:700;border-radius:8px;padding:10px">
          🚪 Submit Resignation
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#res-cancel').onclick=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  overlay.querySelector('#res-save').onclick=async()=>{
    const date=overlay.querySelector('#res-date').value;
    const reason=overlay.querySelector('#res-reason').value;
    const errEl=overlay.querySelector('#res-err');
    if(!date||!reason){errEl.style.display='';errEl.textContent='Date and reason are required';return;}
    if(!confirm('Are you sure you want to submit your resignation? This action will notify your manager and HR.')) return;
    const btn=overlay.querySelector('#res-save');btn.disabled=true;btn.textContent='Submitting...';
    try{
      await api.exitSubmit({
        resignDate:date,
        noticePeriodDays:parseInt(overlay.querySelector('#res-notice').value||30),
        reason,
        remarks:overlay.querySelector('#res-remarks').value||null,
      });
      overlay.remove();
      const t=document.createElement('div');
      t.style.cssText=`position:fixed;bottom:24px;right:24px;z-index:9999;background:#ef4444;color:#fff;padding:14px 22px;border-radius:12px;font-weight:700`;
      t.innerHTML='🚪 Resignation submitted. HR has been notified.';
      document.body.appendChild(t);setTimeout(()=>t.remove(),4000);
      window.navigate('exit');
    }catch(e){errEl.style.display='';errEl.textContent=e.message;btn.disabled=false;btn.textContent='🚪 Submit Resignation';}
  };
}

console.log('✅ Phase 4: Performance Review + Exit Management loaded');

