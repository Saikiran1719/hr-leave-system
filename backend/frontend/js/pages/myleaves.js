// frontend/js/pages/myleaves.js
async function renderMyLeaves(container) {
  let filter = 'all';

  async function render() {
    try {
      const all    = await api.myLeaves();
      const counts = s => s === 'all' ? all.length : all.filter(l => l.Status === s).length;
      const list   = filter === 'all' ? all : all.filter(l => l.Status === filter);

      container.innerHTML = `
      <div class="page-anim">
        <h2 class="page-title">My Leave History</h2>
        <div class="tabs">
          ${['all','pending','approved','rejected','cancelled'].map(f => `
            <button class="tab${filter===f?' active':''}" data-f="${f}">
              ${f} (${counts(f)})
            </button>`).join('')}
        </div>
        <div id="leave-list">
          ${list.length === 0 ? empty('No leave records found.') :
            list.map(l => `
            <div class="leave-card">
              <div class="leave-card-top">
                <div class="leave-info">
                  <div class="leave-type-sq" style="background:${l.ColorHex}20;color:${l.ColorHex}">${l.TypeCode}</div>
                  <div>
                    <div class="leave-name">${l.TypeName}</div>
                    <div class="leave-dates">${fmtDate(l.FromDate)} → ${fmtDate(l.ToDate)} · <b>${l.TotalDays}d</b>${l.IsHalfDay?' · Half Day':''}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  ${statusBadge(l.Status)}
                  ${l.Status==='pending'?`<button class="btn btn-danger btn-sm" data-cancel="${l.ApplicationID}">Cancel</button>`:''}
                </div>
              </div>
              <div class="leave-footer">
                <span><span style="color:var(--text3)">Reason:</span> ${l.Reason}</span>
                ${l.ApproverComment?`<span><span style="color:var(--text3)">Note:</span> ${l.ApproverComment}</span>`:''}
                ${l.ApproverName?`<span style="color:var(--text3)">by <b style="color:var(--text2)">${l.ApproverName}</b></span>`:''}
                <span style="color:var(--text3);margin-left:auto">Applied ${fmtDate(l.AppliedOn)}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>`;

      // Tab clicks
      container.querySelectorAll('.tab').forEach(t =>
        t.addEventListener('click', () => { filter = t.dataset.f; render(); })
      );
      // Cancel buttons
      container.querySelectorAll('[data-cancel]').forEach(btn =>
        btn.addEventListener('click', () => {
          confirmDialog('Cancel Leave', 'Are you sure you want to cancel this leave application?', async () => {
            try {
              await api.cancelLeave(btn.dataset.cancel);
              toast.success('Leave cancelled.');
              render();
            } catch (e) { toast.error(e.message); }
          });
        })
      );
    } catch (e) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px">${e.message}</div>`;
    }
  }
  render();
}

// ─────────────────────────────────────────────────────────────────
// frontend/js/pages/calendar.js  (bundled here for space)
async function renderCalendar(container) {
  const user = getUser();
  let month  = new Date().getMonth() + 1;
  let year   = new Date().getFullYear();
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  async function render() {
    try {
      const { leaves, holidays } = await api.calendar(month, year);
      const holMap = {};
      holidays.forEach(h => { holMap[h.HolidayDate?.split('T')[0] || h.HolidayDate] = h.HolidayName; });

      const first = new Date(year, month - 1, 1).getDay();
      const dim   = new Date(year, month, 0).getDate();

      let cells = '';
      // Empty cells
      for (let i = 0; i < first; i++) cells += `<div style="border-top:1px solid var(--border);border-left:1px solid var(--border);min-height:72px"></div>`;

      for (let d = 1; d <= dim; d++) {
        const ds    = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const wday  = new Date(year, month-1, d).getDay();
        const isT   = ds === todayStr();
        const hol   = holMap[ds];
        const isWk  = wday === 0 || wday === 6;
        const evs   = leaves.filter(l => {
          const f = l.FromDate?.split('T')[0]; const t = l.ToDate?.split('T')[0];
          return f <= ds && t >= ds;
        });

        const cls = [isT?'today':'', hol?'holiday':'', isWk?'weekend':''].filter(Boolean).join(' ');
        const evHtml = evs.slice(0,2).map(e =>
          `<div class="cal-ev" style="background:${e.ColorHex}22;color:${e.ColorHex}">${user.role==='employee'?e.TypeCode:e.EmployeeName?.split(' ')[0]}</div>`
        ).join('') + (evs.length > 2 ? `<div style="font-size:.64rem;color:var(--text3)">+${evs.length-2}</div>` : '');

        cells += `
          <div class="cal-cell ${cls}">
            <div class="cal-day">${d}</div>
            ${hol ? `<div class="cal-hol" title="${hol}">${hol}</div>` : ''}
            ${evHtml}
          </div>`;
      }

      // Collect unique types for legend
      const usedTypes = [...new Map(leaves.map(l => [l.TypeCode, l])).values()];

      container.innerHTML = `
      <div class="page-anim">
        <div class="cal-nav-wrap">
          <h2 class="page-title" style="margin:0">Leave Calendar</h2>
          <div class="cal-nav">
            <button class="cal-nav-btn" id="cal-prev">‹</button>
            <span class="cal-month-lbl">${MONTHS[month-1]} ${year}</span>
            <button class="cal-nav-btn" id="cal-next">›</button>
          </div>
        </div>
        <div class="card" style="padding:0;overflow:hidden">
          <div class="cal-grid" style="background:var(--bg2)">
            ${DAYS_SHORT.map(d=>`<div class="cal-head">${d}</div>`).join('')}
          </div>
          <div class="cal-grid">${cells}</div>
        </div>
        <div class="cal-legend">
          <div class="cal-legend-item"><div class="cal-legend-dot" style="background:rgba(99,102,241,.3)"></div>Today</div>
          <div class="cal-legend-item"><div class="cal-legend-dot" style="background:rgba(245,158,11,.3)"></div>Holiday</div>
          ${usedTypes.map(t=>`<div class="cal-legend-item"><div class="cal-legend-dot" style="background:${t.ColorHex}"></div>${t.TypeName||t.TypeCode}</div>`).join('')}
        </div>
      </div>`;

      document.getElementById('cal-prev').onclick = () => {
        if (month === 1) { month = 12; year--; } else month--;
        container.innerHTML = loader(); render();
      };
      document.getElementById('cal-next').onclick = () => {
        if (month === 12) { month = 1; year++; } else month++;
        container.innerHTML = loader(); render();
      };
    } catch (e) {
      container.innerHTML = `<div style="color:var(--danger);padding:20px">${e.message}</div>`;
    }
  }
  render();
}
