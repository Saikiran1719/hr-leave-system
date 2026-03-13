// ==============================================================
// HRnova — patch-19-phase4a-performance.js
// Phase 4A — Performance Review
// Lines 6003–6589 of original patch.js
// ==============================================================

// ================================================================
// PHASE 4A: PERFORMANCE REVIEW
// ================================================================

api.reviewCycles    = ()         => req('GET',  '/reviews/cycles');
api.reviewCreate    = (d)        => req('POST', '/reviews/cycles', d);
api.reviewStatus    = (id,d)     => req('PATCH',`/reviews/cycles/${id}`, d);
api.reviewInitiate  = (id)       => req('POST', `/reviews/cycles/${id}/initiate`, {});
api.reviewMy        = ()         => req('GET',  '/reviews/my');
api.reviewTeam      = ()         => req('GET',  '/reviews/team');
api.reviewForm      = (id)       => req('GET',  `/reviews/forms/${id}`);
api.reviewSelf      = (id,d)     => req('PATCH',`/reviews/forms/${id}/self`, d);
api.reviewManager   = (id,d)     => req('PATCH',`/reviews/forms/${id}/manager`, d);
api.reviewHR        = (id,d)     => req('PATCH',`/reviews/forms/${id}/hr`, d);
api.reviewAck       = (id,d)     => req('PATCH',`/reviews/forms/${id}/acknowledge`, d);

PAGES.employee = [...PAGES.employee, 'reviews'];
PAGES.manager  = [...PAGES.manager,  'reviews'];
PAGES.hr       = [...PAGES.hr,       'reviews'];
NAV.push({ id:'reviews', icon:'⭐', label:'Performance Review', group:'main' });

const _origNavReviews = window.navigate;
window.navigate = function(page) {
  const content = document.getElementById('main-content') || document.getElementById('page-content');
  if (page === 'reviews' && content) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page==='reviews'));
    renderReviews(content); return;
  }
  return _origNavReviews(page);
};

const RATINGS = ['','⭐ Poor','⭐⭐ Below Expectations','⭐⭐⭐ Meets Expectations','⭐⭐⭐⭐ Exceeds Expectations','⭐⭐⭐⭐⭐ Outstanding'];
const FINAL_RATINGS = ['Outstanding','Exceeds Expectations','Meets Expectations','Below Expectations','Poor'];
const RATING_COLORS = { Outstanding:'#16a34a', 'Exceeds Expectations':'#0ea5e9', 'Meets Expectations':'#6366f1', 'Below Expectations':'#f59e0b', Poor:'#dc2626' };
const STATUS_COLORS = { pending:'#d97706', self_submitted:'#0ea5e9', reviewed:'#6366f1', acknowledged:'#16a34a' };
const STATUS_BG     = { pending:'#fef9c3', self_submitted:'#e0f2fe', reviewed:'#eef2ff', acknowledged:'#dcfce7' };

async function renderReviews(container) {
  const user = getUser();
  const isHR  = user?.role === 'hr';
  const isMgr = user?.role === 'manager' || isHR;
  let tab = isHR ? 'cycles' : (isMgr ? 'team' : 'my');

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <h2 class="page-title" style="margin:0">⭐ Performance Review</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${isHR  ? `<button class="rv-tab btn btn-primary" data-tab="cycles" style="font-size:.83rem">📋 Cycles</button>` : ''}
        ${isMgr ? `<button class="rv-tab btn ${isHR?'btn-secondary':'btn-primary'}" data-tab="team" style="font-size:.83rem">👥 Team Reviews</button>` : ''}
        <button class="rv-tab btn btn-secondary" data-tab="my" style="font-size:.83rem">⭐ My Reviews</button>
      </div>
    </div>
    <div id="rv-content"></div>`;

  container.querySelectorAll('.rv-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      container.querySelectorAll('.rv-tab').forEach(b => {
        b.className = b.dataset.tab===tab ? 'rv-tab btn btn-primary' : 'rv-tab btn btn-secondary';
        b.style.fontSize = '.83rem';
      });
      loadRvTab();
    });
  });

  async function loadRvTab() {
    const el = document.getElementById('rv-content');
    if (!el) return;
    if (tab==='cycles') { await renderReviewCycles(el); return; }
    if (tab==='team')   { await renderTeamReviews(el);  return; }
    await renderMyReviews(el);
  }
  loadRvTab();
}

// ── Review Cycles (HR) ────────────────────────────────────────
async function renderReviewCycles(el) {
  el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3)">Loading...</div>`;
  try {
    const r = await api.reviewCycles();
    const cycles = r?.cycles || [];
    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
        <button id="btn-new-cycle" class="btn btn-primary"
                style="background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;font-weight:700">
          ➕ New Review Cycle
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${!cycles.length ? `<div style="text-align:center;padding:40px;color:var(--text3)">
          <div style="font-size:2rem;margin-bottom:10px">⭐</div>No review cycles yet.</div>` :
        cycles.map(c => {
          const sc = c.Status==='active'?'#16a34a':c.Status==='closed'?'#94a3b8':'#d97706';
          const pct = c.TotalForms>0 ? Math.round(c.Completed/c.TotalForms*100) : 0;
          return `
          <div style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;padding:18px 20px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                  <span style="font-weight:800;font-size:.98rem;color:#1e293b">${c.CycleName}</span>
                  <span style="background:${sc}22;color:${sc};border-radius:20px;
                               padding:2px 10px;font-size:.7rem;font-weight:700;text-transform:uppercase">
                    ${c.Status}
                  </span>
                  <span style="background:#eef2ff;color:#6366f1;border-radius:20px;
                               padding:2px 10px;font-size:.7rem;font-weight:600">${c.ReviewType}</span>
                </div>
                <div style="font-size:.78rem;color:var(--text3)">
                  📅 ${new Date(c.StartDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                  → ${new Date(c.EndDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                </div>
                ${c.TotalForms>0 ? `
                <div style="margin-top:10px">
                  <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--text3);margin-bottom:3px">
                    <span>Progress</span><span>${c.Completed}/${c.TotalForms} completed</span>
                  </div>
                  <div style="background:#f1f5f9;border-radius:20px;height:6px">
                    <div style="background:#6366f1;height:100%;border-radius:20px;width:${pct}%;transition:width .4s"></div>
                  </div>
                </div>` : ''}
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                ${c.Status==='draft' ? `
                  <button class="rv-initiate btn btn-primary" data-id="${c.CycleID}"
                          style="font-size:.78rem;padding:6px 14px;background:#16a34a;border:none">
                    🚀 Initiate
                  </button>` : ''}
                ${c.Status==='active' ? `
                  <button class="rv-close btn" data-id="${c.CycleID}"
                          style="font-size:.78rem;padding:6px 14px;background:#fee2e2;color:#dc2626;
                                 border:1px solid #fca5a5;border-radius:6px;cursor:pointer;font-weight:600">
                    🔒 Close Cycle
                  </button>` : ''}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`;

    document.getElementById('btn-new-cycle').addEventListener('click', () => showCycleModal(() => renderReviewCycles(el)));
    el.querySelectorAll('.rv-initiate').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Initiate this review cycle? Self-assessment forms will be sent to all active employees.')) return;
        btn.disabled=true; btn.textContent='Initiating...';
        try {
          const r = await api.reviewInitiate(parseInt(btn.dataset.id));
          const t = document.createElement('div');
          t.style.cssText=`position:fixed;bottom:24px;right:24px;z-index:9999;background:#16a34a;color:#fff;padding:14px 22px;border-radius:12px;font-weight:700`;
          t.textContent=`✅ ${r.formsCreated} review forms created!`;
          document.body.appendChild(t); setTimeout(()=>t.remove(),3500);
          renderReviewCycles(el);
        } catch(e) { alert(e.message); btn.disabled=false; btn.textContent='🚀 Initiate'; }
      });
    });
    el.querySelectorAll('.rv-close').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Close this review cycle?')) return;
        await api.reviewStatus(parseInt(btn.dataset.id), { status:'closed' });
        renderReviewCycles(el);
      });
    });
  } catch(e) { el.innerHTML=`<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
}

// ── My Reviews (Employee) ─────────────────────────────────────
async function renderMyReviews(el) {
  el.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text3)">Loading...</div>`;
  try {
    const r = await api.reviewMy();
    const forms = r?.forms || [];
    if (!forms.length) {
      el.innerHTML=`<div style="text-align:center;padding:60px;color:var(--text3)">
        <div style="font-size:2.5rem;margin-bottom:12px">⭐</div>
        <div style="font-weight:600">No performance reviews yet</div>
      </div>`; return;
    }
    el.innerHTML=`<div style="display:flex;flex-direction:column;gap:12px">
      ${forms.map(f => {
        const sc = STATUS_COLORS[f.Status]||'#94a3b8';
        const sb = STATUS_BG[f.Status]||'#f1f5f9';
        const canSelf = f.Status==='pending' && f.CycleStatus==='active';
        const canAck  = f.Status==='reviewed' && f.HRRating && !f.EmpAckAt;
        return `
        <div style="background:#fff;border-radius:12px;border:1.5px solid ${sc}44;padding:18px 20px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div>
              <div style="font-weight:700;font-size:.95rem">${f.CycleName}</div>
              <div style="font-size:.75rem;color:var(--text3);margin-top:2px">
                Reviewer: ${f.ReviewerName} · ${f.ReviewType}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="background:${sb};color:${sc};border-radius:20px;padding:3px 12px;font-size:.72rem;font-weight:700">
                ${f.Status.replace(/_/g,' ').toUpperCase()}
              </span>
              ${f.FinalRating ? `<span style="background:${RATING_COLORS[f.FinalRating]||'#6366f1'}22;
                color:${RATING_COLORS[f.FinalRating]||'#6366f1'};border-radius:20px;
                padding:3px 12px;font-size:.72rem;font-weight:700">${f.FinalRating}</span>` : ''}
              ${canSelf ? `<button class="btn-self-assess" data-id="${f.FormID}"
                class="btn btn-primary" style="background:#6366f1;color:#fff;border:none;
                border-radius:7px;padding:7px 14px;font-size:.78rem;cursor:pointer;font-weight:700">
                ✏️ Submit Self Assessment
              </button>` : ''}
              ${canAck ? `<button class="btn-ack" data-id="${f.FormID}"
                style="background:#16a34a;color:#fff;border:none;border-radius:7px;
                padding:7px 14px;font-size:.78rem;cursor:pointer;font-weight:700">
                ✅ Acknowledge
              </button>` : ''}
              <button class="btn-view-form" data-id="${f.FormID}"
                      style="background:#f1f5f9;color:#64748b;border:none;border-radius:7px;
                             padding:7px 14px;font-size:.78rem;cursor:pointer;font-weight:600">
                👁 View
              </button>
            </div>
          </div>
          <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap">
            ${f.SelfRating?`<div style="font-size:.75rem;color:var(--text3)">Self: <strong>${RATINGS[f.SelfRating]||''}</strong></div>`:''}
            ${f.MgrRating?`<div style="font-size:.75rem;color:var(--text3)">Manager: <strong>${RATINGS[f.MgrRating]||''}</strong></div>`:''}
            ${f.HRRating?`<div style="font-size:.75rem;color:var(--text3)">HR: <strong>${RATINGS[f.HRRating]||''}</strong></div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`;

    el.querySelectorAll('.btn-self-assess').forEach(btn => {
      btn.addEventListener('click', () => showSelfAssessModal(parseInt(btn.dataset.id), () => renderMyReviews(el)));
    });
    el.querySelectorAll('.btn-ack').forEach(btn => {
      btn.addEventListener('click', () => showAckModal(parseInt(btn.dataset.id), () => renderMyReviews(el)));
    });
    el.querySelectorAll('.btn-view-form').forEach(btn => {
      btn.addEventListener('click', () => showReviewFormModal(parseInt(btn.dataset.id)));
    });
  } catch(e) { el.innerHTML=`<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
}

// ── Team Reviews (Manager/HR) ─────────────────────────────────
async function renderTeamReviews(el) {
  el.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text3)">Loading...</div>`;
  try {
    const r = await api.reviewTeam();
    const forms = r?.forms || [];
    if (!forms.length) {
      el.innerHTML=`<div style="text-align:center;padding:60px;color:var(--text3)">
        <div style="font-size:2rem;margin-bottom:10px">⭐</div>No team review forms yet.</div>`; return;
    }
    const isHR = getUser()?.role === 'hr';
    el.innerHTML=`
      <div style="display:flex;flex-direction:column;gap:10px">
        ${forms.map(f => {
          const sc = STATUS_COLORS[f.Status]||'#94a3b8';
          const sb = STATUS_BG[f.Status]||'#f1f5f9';
          const canReview = f.Status==='self_submitted';
          const canHR     = isHR && f.Status==='reviewed' && !f.HRRating;
          return `
          <div style="background:#fff;border-radius:10px;border:1.5px solid #e2e8f0;padding:14px 18px">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
              <div style="flex:1">
                <div style="font-weight:700">${f.EmployeeName}
                  ${f.EmployeeCode?`<span style="color:#0052cc;font-family:monospace;font-size:.72rem">#${f.EmployeeCode}</span>`:''}
                  <span style="color:var(--text3);font-size:.75rem">${f.DepartmentName||''}</span>
                </div>
                <div style="font-size:.75rem;color:var(--text3);margin-top:2px">${f.CycleName}</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span style="background:${sb};color:${sc};border-radius:20px;padding:2px 10px;font-size:.7rem;font-weight:700">
                  ${f.Status.replace(/_/g,' ').toUpperCase()}
                </span>
                ${f.FinalRating?`<span style="background:${RATING_COLORS[f.FinalRating]||'#6366f1'}22;
                  color:${RATING_COLORS[f.FinalRating]||'#6366f1'};border-radius:20px;
                  padding:2px 10px;font-size:.7rem;font-weight:700">${f.FinalRating}</span>`:''}
                ${canReview?`<button class="btn-mgr-review" data-id="${f.FormID}"
                  style="background:#6366f1;color:#fff;border:none;border-radius:6px;
                  padding:6px 12px;font-size:.75rem;cursor:pointer;font-weight:700">
                  ✏️ Review
                </button>`:''}
                ${canHR?`<button class="btn-hr-rate" data-id="${f.FormID}"
                  style="background:#0ea5e9;color:#fff;border:none;border-radius:6px;
                  padding:6px 12px;font-size:.75rem;cursor:pointer;font-weight:700">
                  🏅 Final Rating
                </button>`:''}
                <button class="btn-view-form2" data-id="${f.FormID}"
                        style="background:#f1f5f9;color:#64748b;border:none;border-radius:6px;
                               padding:6px 12px;font-size:.75rem;cursor:pointer">👁 View</button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`;

    el.querySelectorAll('.btn-mgr-review').forEach(btn => {
      btn.addEventListener('click', () => showMgrReviewModal(parseInt(btn.dataset.id), () => renderTeamReviews(el)));
    });
    el.querySelectorAll('.btn-hr-rate').forEach(btn => {
      btn.addEventListener('click', () => showHRRatingModal(parseInt(btn.dataset.id), () => renderTeamReviews(el)));
    });
    el.querySelectorAll('.btn-view-form2').forEach(btn => {
      btn.addEventListener('click', () => showReviewFormModal(parseInt(btn.dataset.id)));
    });
  } catch(e) { el.innerHTML=`<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
}

function showCycleModal(onSave) {
  const now = new Date(), y = now.getFullYear();
  const overlay = document.createElement('div');
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:20px">➕ New Review Cycle</div>
      <div class="form-group" style="margin-bottom:14px"><label class="form-label">Cycle Name *</label>
        <input class="form-control" id="cy-name" placeholder="e.g. Annual Appraisal 2026" /></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div class="form-group" style="margin:0"><label class="form-label">Type</label>
          <select class="form-control" id="cy-type">
            <option value="annual">Annual</option><option value="quarterly">Quarterly</option>
            <option value="probation">Probation</option>
          </select></div>
        <div></div>
        <div class="form-group" style="margin:0"><label class="form-label">Start Date *</label>
          <input class="form-control" type="date" id="cy-start" value="${y}-01-01" /></div>
        <div class="form-group" style="margin:0"><label class="form-label">End Date *</label>
          <input class="form-control" type="date" id="cy-end" value="${y}-03-31" /></div>
      </div>
      <div id="cy-err" style="color:#dc2626;font-size:.8rem;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button id="cy-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="cy-save" class="btn btn-primary" style="flex:2;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;font-weight:700">
          💾 Create Cycle
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cy-cancel').onclick=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  overlay.querySelector('#cy-save').onclick=async()=>{
    const name=overlay.querySelector('#cy-name').value.trim();
    const start=overlay.querySelector('#cy-start').value;
    const end=overlay.querySelector('#cy-end').value;
    const errEl=overlay.querySelector('#cy-err');
    if(!name||!start||!end){errEl.style.display='';errEl.textContent='All fields required';return;}
    const btn=overlay.querySelector('#cy-save');btn.disabled=true;btn.textContent='Creating...';
    try{
      await api.reviewCreate({cycleName:name,reviewType:overlay.querySelector('#cy-type').value,startDate:start,endDate:end});
      overlay.remove();if(onSave)onSave();
    }catch(e){errEl.style.display='';errEl.textContent=e.message;btn.disabled=false;btn.textContent='💾 Create Cycle';}
  };
}

function ratingStars(val, name) {
  return `<div style="display:flex;gap:6px;margin-top:6px">
    ${[1,2,3,4,5].map(i=>`
      <label style="cursor:pointer;font-size:1.4rem;color:${i<=(val||0)?'#f59e0b':'#e2e8f0'}">
        <input type="radio" name="${name}" value="${i}" ${i==val?'checked':''} style="display:none" />
        ★
      </label>`).join('')}
  </div>`;
}

function showSelfAssessModal(formID, onSave) {
  const overlay=document.createElement('div');
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:560px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);max-height:90vh;overflow-y:auto">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:6px">✏️ Self Assessment</div>
      <div style="color:var(--text3);font-size:.82rem;margin-bottom:20px">Rate yourself honestly and objectively</div>
      ${[['sa-goals','Goals & Targets for the Period'],['sa-achieve','Key Achievements'],['sa-strengths','Strengths'],['sa-improve','Areas for Improvement']].map(([id,label])=>`
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">${label}</label>
          <textarea class="form-control" id="${id}" rows="2" style="resize:vertical"></textarea>
        </div>`).join('')}
      <div class="form-group" style="margin-bottom:20px">
        <label class="form-label">Self Rating (1-5)</label>
        ${ratingStars(0,'sa-rating')}
      </div>
      <div id="sa-err" style="color:#dc2626;font-size:.8rem;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button id="sa-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="sa-save" class="btn btn-primary" style="flex:2;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;font-weight:700">
          📤 Submit Self Assessment
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  // Star rating interaction
  overlay.querySelectorAll('input[name="sa-rating"]').forEach(inp => {
    inp.addEventListener('change', () => {
      const val = parseInt(inp.value);
      overlay.querySelectorAll('label').forEach((l,i) => {
        if(l.querySelector('input[name="sa-rating"]')) l.style.color = i<val?'#f59e0b':'#e2e8f0';
      });
    });
  });
  overlay.querySelector('#sa-cancel').onclick=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  overlay.querySelector('#sa-save').onclick=async()=>{
    const rating=overlay.querySelector('input[name="sa-rating"]:checked')?.value;
    const errEl=overlay.querySelector('#sa-err');
    if(!rating){errEl.style.display='';errEl.textContent='Please select a rating';return;}
    const btn=overlay.querySelector('#sa-save');btn.disabled=true;btn.textContent='Submitting...';
    try{
      await api.reviewSelf(formID,{
        selfGoals:overlay.querySelector('#sa-goals').value,
        selfAchieve:overlay.querySelector('#sa-achieve').value,
        selfStrengths:overlay.querySelector('#sa-strengths').value,
        selfImprove:overlay.querySelector('#sa-improve').value,
        selfRating:parseInt(rating),
      });
      overlay.remove();if(onSave)onSave();
    }catch(e){errEl.style.display='';errEl.textContent=e.message;btn.disabled=false;btn.textContent='📤 Submit Self Assessment';}
  };
}

function showMgrReviewModal(formID, onSave) {
  const overlay=document.createElement('div');
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:560px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);max-height:90vh;overflow-y:auto">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:20px">✏️ Manager Review</div>
      ${[['mr-goals','Performance vs Goals'],['mr-achieve','Achievements Assessment'],['mr-strengths','Key Strengths'],['mr-improve','Development Areas'],['mr-comment','Overall Comment']].map(([id,label])=>`
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">${label}</label>
          <textarea class="form-control" id="${id}" rows="2" style="resize:vertical"></textarea>
        </div>`).join('')}
      <div class="form-group" style="margin-bottom:20px">
        <label class="form-label">Manager Rating (1-5)</label>
        ${ratingStars(0,'mr-rating')}
      </div>
      <div id="mr-err" style="color:#dc2626;font-size:.8rem;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button id="mr-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="mr-save" class="btn btn-primary" style="flex:2;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;font-weight:700">
          📤 Submit Review
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('input[name="mr-rating"]').forEach(inp => {
    inp.addEventListener('change', () => {
      const val=parseInt(inp.value);
      overlay.querySelectorAll('label').forEach((l,i)=>{if(l.querySelector('input[name="mr-rating"]'))l.style.color=i<val?'#f59e0b':'#e2e8f0';});
    });
  });
  overlay.querySelector('#mr-cancel').onclick=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  overlay.querySelector('#mr-save').onclick=async()=>{
    const rating=overlay.querySelector('input[name="mr-rating"]:checked')?.value;
    const errEl=overlay.querySelector('#mr-err');
    if(!rating){errEl.style.display='';errEl.textContent='Please select a rating';return;}
    const btn=overlay.querySelector('#mr-save');btn.disabled=true;btn.textContent='Submitting...';
    try{
      await api.reviewManager(formID,{
        mgrGoals:overlay.querySelector('#mr-goals').value,
        mgrAchieve:overlay.querySelector('#mr-achieve').value,
        mgrStrengths:overlay.querySelector('#mr-strengths').value,
        mgrImprove:overlay.querySelector('#mr-improve').value,
        mgrComment:overlay.querySelector('#mr-comment').value,
        mgrRating:parseInt(rating),
      });
      overlay.remove();if(onSave)onSave();
    }catch(e){errEl.style.display='';errEl.textContent=e.message;btn.disabled=false;btn.textContent='📤 Submit Review';}
  };
}

function showHRRatingModal(formID, onSave) {
  const overlay=document.createElement('div');
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:20px">🏅 HR Final Rating</div>
      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">Final Rating</label>
        <select class="form-control" id="hr-final">
          <option value="">— Select —</option>
          ${FINAL_RATINGS.map(r=>`<option value="${r}">${r}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">HR Rating (1-5)</label>
        ${ratingStars(0,'hr-rating')}
      </div>
      <div class="form-group" style="margin-bottom:18px">
        <label class="form-label">HR Comment</label>
        <textarea class="form-control" id="hr-comment" rows="3" style="resize:none"></textarea>
      </div>
      <div id="hr-err" style="color:#dc2626;font-size:.8rem;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button id="hr-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="hr-save" class="btn btn-primary" style="flex:2;background:linear-gradient(135deg,#0ea5e9,#0369a1);border:none;font-weight:700">
          🏅 Finalize Rating
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('input[name="hr-rating"]').forEach(inp=>{
    inp.addEventListener('change',()=>{const val=parseInt(inp.value);overlay.querySelectorAll('label').forEach((l,i)=>{if(l.querySelector('input[name="hr-rating"]'))l.style.color=i<val?'#f59e0b':'#e2e8f0';});});
  });
  overlay.querySelector('#hr-cancel').onclick=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  overlay.querySelector('#hr-save').onclick=async()=>{
    const rating=overlay.querySelector('input[name="hr-rating"]:checked')?.value;
    const final=overlay.querySelector('#hr-final').value;
    const errEl=overlay.querySelector('#hr-err');
    if(!final){errEl.style.display='';errEl.textContent='Select a final rating';return;}
    const btn=overlay.querySelector('#hr-save');btn.disabled=true;btn.textContent='Saving...';
    try{
      await api.reviewHR(formID,{hrRating:parseInt(rating)||null,hrComment:overlay.querySelector('#hr-comment').value,finalRating:final});
      overlay.remove();if(onSave)onSave();
    }catch(e){errEl.style.display='';errEl.textContent=e.message;btn.disabled=false;btn.textContent='🏅 Finalize Rating';}
  };
}

function showAckModal(formID, onSave) {
  const overlay=document.createElement('div');
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:6px">✅ Acknowledge Review</div>
      <div style="color:var(--text3);font-size:.82rem;margin-bottom:16px">Confirm you have read and understood your performance review.</div>
      <div class="form-group" style="margin-bottom:18px">
        <label class="form-label">Comments (optional)</label>
        <textarea class="form-control" id="ack-comment" rows="3" style="resize:none" placeholder="Any feedback or comments..."></textarea>
      </div>
      <div style="display:flex;gap:10px">
        <button id="ack-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="ack-save" class="btn btn-primary" style="flex:2;background:#16a34a;border:none;font-weight:700">
          ✅ Acknowledge
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#ack-cancel').onclick=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  overlay.querySelector('#ack-save').onclick=async()=>{
    const btn=overlay.querySelector('#ack-save');btn.disabled=true;btn.textContent='...';
    try{ await api.reviewAck(formID,{comment:overlay.querySelector('#ack-comment').value||null});
      overlay.remove();if(onSave)onSave(); }catch(e){alert(e.message);btn.disabled=false;btn.textContent='✅ Acknowledge';}
  };
}

async function showReviewFormModal(formID) {
  const r = await api.reviewForm(formID).catch(e=>{alert(e.message);return null;});
  if(!r?.form) return;
  const f = r.form;
  const overlay=document.createElement('div');
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px`;
  const section=(title,items,color='#6366f1')=>`
    <div style="background:${color}08;border:1.5px solid ${color}22;border-radius:10px;padding:14px 16px;margin-bottom:12px">
      <div style="font-weight:700;color:${color};margin-bottom:10px;font-size:.88rem">${title}</div>
      ${items.filter(([,v])=>v).map(([k,v])=>`
        <div style="margin-bottom:8px">
          <div style="font-size:.7rem;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:2px">${k}</div>
          <div style="font-size:.83rem;color:#1e293b;line-height:1.5">${v}</div>
        </div>`).join('')}
    </div>`;
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:600px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div><div style="font-size:1.1rem;font-weight:800">${f.EmployeeName}</div>
          <div style="font-size:.78rem;color:var(--text3)">${f.CycleName}</div></div>
        <button id="rv-close-btn" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text3)">✕</button>
      </div>
      ${f.FinalRating?`<div style="background:${RATING_COLORS[f.FinalRating]||'#6366f1'};color:#fff;border-radius:8px;
        padding:10px 16px;margin-bottom:14px;font-weight:700;text-align:center;font-size:.95rem">
        🏅 Final Rating: ${f.FinalRating}</div>`:''}
      ${f.SelfGoals||f.SelfAchieve?section('⭐ Self Assessment',[
        ['Goals',f.SelfGoals],['Achievements',f.SelfAchieve],
        ['Strengths',f.SelfStrengths],['Areas to Improve',f.SelfImprove],
        ['Self Rating',f.SelfRating?RATINGS[f.SelfRating]:'']
      ],'#6366f1'):''}
      ${f.MgrGoals||f.MgrAchieve?section('👔 Manager Review',[
        ['Performance vs Goals',f.MgrGoals],['Achievements',f.MgrAchieve],
        ['Strengths',f.MgrStrengths],['Development Areas',f.MgrImprove],
        ['Manager Rating',f.MgrRating?RATINGS[f.MgrRating]:''],['Comment',f.MgrComment]
      ],'#0ea5e9'):''}
      ${f.HRRating||f.HRComment?section('🏅 HR Final Review',[
        ['HR Rating',f.HRRating?RATINGS[f.HRRating]:''],['Comment',f.HRComment]
      ],'#16a34a'):''}
      ${f.EmpAckAt?`<div style="background:#dcfce7;border-radius:8px;padding:10px 14px;font-size:.8rem;color:#16a34a;font-weight:600">
        ✅ Acknowledged on ${new Date(f.EmpAckAt).toLocaleDateString('en-IN')}
        ${f.EmpAckComment?` · "${f.EmpAckComment}"`:''}
      </div>`:''}
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#rv-close-btn').onclick=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
}

