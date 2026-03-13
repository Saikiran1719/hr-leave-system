// frontend/js/pages/apply.js
async function renderApply(container) {
  try {
    const [types, bal] = await Promise.all([api.leaveTypes(), api.myBalance()]);
    const balMap = Object.fromEntries(bal.map(b => [b.TypeCode, b]));

    container.innerHTML = `
    <div class="page-anim" style="max-width:680px">
      <h2 class="page-title">Apply for Leave</h2>
      <div class="card">
        <div class="form-group">
          <label class="form-label">Select Leave Type</label>
          <div class="grid-4" style="margin-top:6px" id="type-grid">
            ${types.map(t => {
              const b = balMap[t.TypeCode];
              return `
              <button class="type-btn" data-code="${t.TypeCode}" data-id="${t.LeaveTypeID}"
                style="background:var(--bg);border:1px solid var(--border2);border-radius:var(--radius-sm);
                       padding:10px 6px;cursor:pointer;text-align:center;transition:all .15s">
                <div style="font-weight:700;font-size:.82rem;color:var(--text3)">${t.TypeCode}</div>
                <div style="font-size:.7rem;margin-top:2px;color:var(--text3)">${b ? b.RemainingDays : '?'}d left</div>
              </button>`;
            }).join('')}
          </div>
        </div>

        <div id="type-info" style="display:none;border-radius:var(--radius-sm);padding:10px 14px;margin:4px 0 14px;font-size:.86rem"></div>

        <div class="form-group grid-2">
          <div>
            <label class="form-label">From Date</label>
            <input class="form-control" id="a-from" type="date" min="${todayStr()}" value="${todayStr()}" />
          </div>
          <div>
            <label class="form-label">To Date</label>
            <input class="form-control" id="a-to" type="date" min="${todayStr()}" value="${todayStr()}" />
          </div>
        </div>

        <div style="background:var(--bg);border-radius:var(--radius-sm);padding:10px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin-bottom:14px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.88rem;color:var(--text2)">
            <input type="checkbox" id="a-half" style="accent-color:var(--primary)" />
            Half Day
          </label>
          <div id="session-wrap" style="display:none">
            <select class="form-control" id="a-session" style="width:auto;padding:6px 10px">
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
            </select>
          </div>
          <span id="a-days-label" style="margin-left:auto;color:var(--primary);font-weight:700;font-size:.95rem">1 day</span>
        </div>

        <div class="form-group">
          <label class="form-label">Reason *</label>
          <textarea class="form-control" id="a-reason" placeholder="Brief reason for leave…"></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Supporting Document (optional)</label>
          <div style="background:var(--bg);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:10px 14px;cursor:pointer">
            <input type="file" id="a-file" style="display:none" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
            <label for="a-file" style="cursor:pointer;font-size:.86rem;color:var(--text3)">📎 <span id="a-filename">Click to upload (PDF, Image, DOC)</span></label>
          </div>
        </div>

        <div id="a-err" style="display:none;padding:10px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:var(--radius-sm);color:var(--danger);font-size:.84rem;margin-bottom:12px"></div>

        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-primary" id="a-submit" style="padding:12px 32px" disabled>
            Submit Application →
          </button>
        </div>
      </div>
    </div>`;

    let selectedType = null;

    // Type selection
    document.getElementById('type-grid').addEventListener('click', e => {
      const btn = e.target.closest('.type-btn');
      if (!btn) return;
      document.querySelectorAll('.type-btn').forEach(b => {
        b.style.borderColor = 'var(--border2)'; b.style.background = 'var(--bg)';
        b.querySelector('div').style.color = 'var(--text3)';
      });
      selectedType = { code: btn.dataset.code, id: parseInt(btn.dataset.id) };
      const t = types.find(x => x.TypeCode === selectedType.code);
      const b = balMap[selectedType.code];
      btn.style.borderColor = t.ColorHex; btn.style.background = t.ColorHex + '22';
      btn.querySelector('div').style.color = t.ColorHex;
      const info = document.getElementById('type-info');
      info.style.display = '';
      info.style.background = t.ColorHex + '12';
      info.style.border = `1px solid ${t.ColorHex}30`;
      info.innerHTML = `<span style="color:${t.ColorHex};font-weight:600">${t.TypeName}</span>
        &nbsp;·&nbsp; Available: <strong style="color:var(--text)">${b ? b.RemainingDays : '?'} days</strong>
        &nbsp;·&nbsp; Max: ${t.MaxDaysPerYear}/year`;
      updateDays();
      checkSubmit();
    });

    function updateDays() {
      const from = document.getElementById('a-from').value;
      const to   = document.getElementById('a-to').value;
      const half = document.getElementById('a-half').checked;
      if (!from || !to) return;
      const days = half ? 0.5 : diffDays(from, to);
      document.getElementById('a-days-label').textContent = `${days} day${days !== 1 ? 's' : ''}`;
    }

    function checkSubmit() {
      const from = document.getElementById('a-from').value;
      const to   = document.getElementById('a-to').value;
      document.getElementById('a-submit').disabled = !selectedType || !from || !to;
    }

    document.getElementById('a-from').addEventListener('change', () => { updateDays(); checkSubmit(); });
    document.getElementById('a-to').addEventListener('change',   () => { updateDays(); checkSubmit(); });
    document.getElementById('a-half').addEventListener('change', function () {
      document.getElementById('session-wrap').style.display = this.checked ? '' : 'none';
      updateDays();
    });
    document.getElementById('a-file').addEventListener('change', function () {
      document.getElementById('a-filename').textContent = this.files[0]?.name || 'Click to upload';
    });

    document.getElementById('a-submit').addEventListener('click', async () => {
      const from   = document.getElementById('a-from').value;
      const to     = document.getElementById('a-to').value;
      const half   = document.getElementById('a-half').checked;
      const sess   = document.getElementById('a-session').value;
      const reason = document.getElementById('a-reason').value.trim();
      const file   = document.getElementById('a-file').files[0];
      const errEl  = document.getElementById('a-err');
      const btn    = document.getElementById('a-submit');

      if (!reason) { errEl.style.display=''; errEl.textContent='Please enter a reason.'; return; }
      if (from > to) { errEl.style.display=''; errEl.textContent='End date must be ≥ start date.'; return; }

      const days = half ? 0.5 : diffDays(from, to);
      const b    = balMap[selectedType.code];
      if (b && b.RemainingDays < days) {
        errEl.style.display=''; errEl.textContent=`Insufficient balance — ${b.RemainingDays}d available, ${days}d needed.`; return;
      }

      errEl.style.display = 'none';
      btn.disabled = true; btn.textContent = 'Submitting…';

      const fd = new FormData();
      fd.append('leaveTypeID',    selectedType.id);
      fd.append('fromDate',       from);
      fd.append('toDate',         to);
      fd.append('totalDays',      days);
      fd.append('isHalfDay',      half);
      fd.append('halfDaySession', sess);
      fd.append('reason',         reason);
      if (file) fd.append('attachment', file);

      try {
        await api.applyLeave(fd);
        toast.success('Leave application submitted!');
        navigate('myleaves');
      } catch (e) {
        errEl.style.display=''; errEl.textContent=e.message;
        btn.disabled=false; btn.textContent='Submit Application →';
      }
    });
  } catch (e) {
    container.innerHTML = `<div style="color:var(--danger);padding:20px">${e.message}</div>`;
  }
}
