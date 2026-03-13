// frontend/js/pages/approvals.js
async function renderApprovals(container) {
  let tab = 'pending';

  async function render() {
    try {
      const pending = await api.pendingLeaves();
      const history = tab === 'history' ? await api.allLeaves({ status: null }) : [];
      const list    = tab === 'pending' ? pending : history;

      container.innerHTML = `
      <div class="page-anim">
        <h2 class="page-title">Leave Approvals</h2>
        <div class="tabs">
          <button class="tab${tab==='pending'?' active':''}" data-t="pending">Pending (${pending.length})</button>
          <button class="tab${tab==='history'?' active':''}" data-t="history">History</button>
        </div>
        <div id="appr-list">
          ${list.length === 0 ? empty('No leave requests here.','📋') :
            list.map(l => renderApprCard(l, tab === 'pending')).join('')}
        </div>
      </div>`;

      container.querySelectorAll('.tab').forEach(t =>
        t.addEventListener('click', () => { tab = t.dataset.t; render(); })
      );
      container.querySelectorAll('[data-approve]').forEach(btn =>
        btn.addEventListener('click', () => {
          const id  = btn.dataset.approve;
          const cmt = document.getElementById('cmt-'+id)?.value || '';
          doAction(id, 'approved', cmt);
        })
      );
      container.querySelectorAll('[data-reject]').forEach(btn =>
        btn.addEventListener('click', () => {
          const id  = btn.dataset.reject;
          const cmt = document.getElementById('cmt-'+id)?.value || '';
          if (!cmt.trim()) return toast.warning('Please add a rejection comment.');
          doAction(id, 'rejected', cmt);
        })
      );
    } catch (e) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px">${e.message}</div>`;
    }
  }

  async function doAction(id, status, comment) {
    try {
      await api.updateStatus(id, status, comment);
      toast.success(`Leave ${status}!`);
      render();
      startApp(); // refresh sidebar badge
    } catch (e) { toast.error(e.message); }
  }

  render();
}

function renderApprCard(l, showActions) {
  const mobile = isMobile();
  return `
  <div class="appr-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
      <div style="display:flex;gap:13px;align-items:center">
        ${avatarHtml(getInitials(l.EmployeeName||'?'), 44)}
        <div>
          <div style="font-weight:700;font-size:.95rem">${l.EmployeeName}</div>
          <div style="font-size:.78rem;color:var(--text3)">${l.DepartmentName||''} · Applied ${fmtDate(l.AppliedOn)}</div>
        </div>
      </div>
      ${statusBadge(l.Status)}
    </div>

    <div class="appr-meta">
      <div class="meta-box"><div class="meta-lbl">Type</div><div class="meta-val">${typeChip(l.TypeCode, l.ColorHex)}</div></div>
      <div class="meta-box"><div class="meta-lbl">From</div><div class="meta-val">${fmtDate(l.FromDate)}</div></div>
      <div class="meta-box"><div class="meta-lbl">To</div><div class="meta-val">${fmtDate(l.ToDate)}</div></div>
      <div class="meta-box"><div class="meta-lbl">Days</div><div class="meta-val"><b>${l.TotalDays}d</b></div></div>
      <div class="meta-box"><div class="meta-lbl">Balance</div><div class="meta-val">${l.RemainingDays??'—'}d</div></div>
    </div>

    <div style="font-size:.84rem;color:var(--text3);margin-bottom:${showActions?12:0}px">
      Reason: <span style="color:var(--text2)">${l.Reason}</span>
      ${l.ApproverComment?`<br>Note: <span style="color:var(--text2)">${l.ApproverComment}</span>`:''}
    </div>

    ${showActions ? `
      <div style="display:flex;flex-direction:${mobile?'column':'row'};gap:10px;align-items:${mobile?'stretch':'flex-end'}">
        <div style="flex:1">
          <label class="form-label">Comment</label>
          <input class="form-control" id="cmt-${l.ApplicationID}" placeholder="Optional note…" />
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-success" data-approve="${l.ApplicationID}" style="flex:1;white-space:nowrap">✓ Approve</button>
          <button class="btn btn-danger"  data-reject="${l.ApplicationID}"  style="flex:1;white-space:nowrap">✕ Reject</button>
        </div>
      </div>` : ''}
  </div>`;
}
