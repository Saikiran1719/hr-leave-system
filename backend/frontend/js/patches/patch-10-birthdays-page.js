// ==============================================================
// HRnova — patch-10-birthdays-page.js
// Birthdays page — upcoming & today notifications
// Lines 2351–2631 of original patch.js
// ==============================================================

// ================================================================
// 10. MY ATTENDANCE — visible to ALL roles (employee, manager, hr)
//     Shows own attendance: monthly calendar + list + stats
// ================================================================

// Add 'myattendance' page to all roles
PAGES.employee = [...PAGES.employee, 'myattendance'];
PAGES.manager  = [...PAGES.manager,  'myattendance'];
PAGES.hr       = [...PAGES.hr,       'myattendance'];
NAV.push({ id:'myattendance', icon:'📆', label:'My Attendance', group:'main' });

// Add backend API for own attendance (uses /summary with own userID)
api.myAttSummary = (p) => {
  const t = localStorage.getItem('hr_token') || '';
  return fetch(`/api/attendance/my?${new URLSearchParams(p)}`,
    { headers: { 'Authorization': 'Bearer ' + t } }).then(r => r.json());
};

// Patch navigate to handle myattendance
const _origNavigate2 = window.navigate;
window.navigate = function(page) {
  if (page === 'myattendance') {
    const content = document.getElementById('main-content');
    if (content) {
      document.querySelectorAll('.nav-item').forEach(b =>
        b.classList.toggle('active', b.dataset.page === 'myattendance')
      );
      content.innerHTML = '<div class="loader"><div class="spinner"></div>Loading…</div>';
      renderMyAttendance(content);
    }
    return;
  }
  if (page === 'birthdays') {
    const content = document.getElementById('main-content') || document.getElementById('page-content');
    if (content) {
      document.querySelectorAll('.nav-item').forEach(b =>
        b.classList.toggle('active', b.dataset.page === 'birthdays')
      );
      renderBirthdays(content);
    }
    return;
  }
  _origNavigate2(page);
};

async function renderMyAttendance(container) {
  const user = getUser();
  const now  = new Date();
  let viewYear  = now.getFullYear();
  let viewMonth = now.getMonth(); // 0-based

  async function render() {
    // Build YYYY-MM-DD purely from numbers — never use toISOString() which shifts in IST
    const pad  = n => String(n).padStart(2,'0');
    const lastD = new Date(viewYear, viewMonth + 1, 0).getDate(); // last day of month
    const from  = `${viewYear}-${pad(viewMonth + 1)}-01`;
    const to    = `${viewYear}-${pad(viewMonth + 1)}-${pad(lastD)}`;
    const monthName = new Date(viewYear, viewMonth, 1)
      .toLocaleDateString('en-IN', { month:'long', year:'numeric' });

    container.innerHTML = `
    <div class="page-anim">
      <div style="display:flex;justify-content:space-between;align-items:center;
                  flex-wrap:wrap;gap:10px;margin-bottom:20px">
        <h2 class="page-title" style="margin:0">📆 My Attendance</h2>
        <div style="font-size:.78rem;color:var(--text3);background:var(--surface2);
                    border-radius:6px;padding:6px 12px">
          8:30 AM – 5:00 PM &nbsp;·&nbsp; Grace ±15 min &nbsp;·&nbsp; Full day = 8 hrs
        </div>
      </div>

      <!-- Month navigator -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="ma-prev">‹ Prev</button>
        <span style="font-size:1rem;font-weight:700;color:var(--text);min-width:160px;text-align:center">
          ${monthName}
        </span>
        <button class="btn btn-ghost btn-sm" id="ma-next"
          ${(viewYear===now.getFullYear()&&viewMonth===now.getMonth())?'disabled style="opacity:.4"':''}>
          Next ›
        </button>
        <button class="btn btn-ghost btn-sm" id="ma-curr">This Month</button>
      </div>

      <div id="ma-body">
        <div class="loader"><div class="spinner"></div>Loading…</div>
      </div>
    </div>`;

    // Nav wiring
    document.getElementById('ma-prev').addEventListener('click', () => {
      viewMonth--; if (viewMonth < 0) { viewMonth=11; viewYear--; } render();
    });
    document.getElementById('ma-next').addEventListener('click', () => {
      viewMonth++; if (viewMonth > 11) { viewMonth=0; viewYear++; } render();
    });
    document.getElementById('ma-curr').addEventListener('click', () => {
      viewYear=now.getFullYear(); viewMonth=now.getMonth(); render();
    });

    // Load data
    try {
      const rows = await api.myAttSummary({ from, to });
      renderBody(rows, from, to);
    } catch(e) {
      document.getElementById('ma-body').innerHTML =
        `<div style="color:#bf2600;padding:20px">${e.message}</div>`;
    }
  }

  function renderBody(rows, from, to) {
    const body = document.getElementById('ma-body');
    if (!body) return;

    // ── Safe date key extraction ─────────────────────────────────────
    // mssql driver can return AttDate as: string "2026-03-19T00:00:00.000Z",
    // or plain "2026-03-19", or a JS Date object — handle all cases
    function toDateKey(raw) {
      if (!raw) return '';
      if (raw instanceof Date) {
        // Use UTC to avoid IST shifting midnight to previous day
        return `${raw.getUTCFullYear()}-${String(raw.getUTCMonth()+1).padStart(2,'0')}-${String(raw.getUTCDate()).padStart(2,'0')}`;
      }
      const s = String(raw);
      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      // ISO string — slice first 10 chars
      if (s.length >= 10) return s.slice(0, 10);
      return s;
    }

    const byDate = {};
    rows.forEach(r => {
      if (!r.AttDate) return;
      const key = toDateKey(r.AttDate);
      byDate[key] = r;
    });
    // Debug: log all keys so we can verify holiday date is present
    console.log('[Attendance] byDate keys:', Object.keys(byDate).sort());

    // ── Parse from/to for month filtering ───────────────────────────
    const yr = parseInt(from.slice(0, 4));
    const mo = parseInt(from.slice(5, 7)) - 1;
    const todayKey = new Date().toLocaleDateString('en-CA');
    const monthRows = rows.filter(r => {
      const k = toDateKey(r.AttDate);
      return k >= from && k <= to;
    });
    const workdays  = monthRows.filter(r => r.Status !== 'WEEKEND');
    const present   = workdays.filter(r => ['PRESENT','LATE','EARLY_EXIT','LATE_EARLY'].includes(r.Status)).length;
    const absent    = workdays.filter(r => r.Status === 'ABSENT').length;
    const onLeave   = workdays.filter(r => r.Status === 'ON_LEAVE').length;
    const late      = workdays.filter(r => ['LATE','LATE_EARLY'].includes(r.Status)).length;
    const totalMins = workdays.reduce((s, r) => s + (r.WorkMinutes || 0), 0);
    const holidays  = monthRows.filter(r => r.Status === 'HOLIDAY').length;

    // ── Build daily detail ───────────────────────────────────────────
    const detailRows = monthRows
      .filter(r => {
        const k = toDateKey(r.AttDate);
        return k <= todayKey && (r.FirstIn || r.Status === 'WEEKEND' || r.Status === 'HOLIDAY' || r.Status === 'ABSENT' || r.Status === 'ON_LEAVE');
      })
      .sort((a, b) => toDateKey(b.AttDate).localeCompare(toDateKey(a.AttDate)));

    // ── Build calendar cells ─────────────────────────────────────────
    const firstDow  = new Date(yr, mo, 1).getDay();
    const totalDays = new Date(yr, mo + 1, 0).getDate();
    let calCells = '';
    for (let i = 0; i < firstDow; i++) calCells += `<div style="min-height:72px"></div>`;

    for (let d = 1; d <= totalDays; d++) {
      const dateKey = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const rec     = byDate[dateKey];
      const isToday = dateKey === todayKey;
      const isFut   = dateKey > todayKey;
      const isSun   = new Date(yr, mo, d).getDay() === 0;

      let bg = 'var(--surface2)', borderColor = 'transparent', txtColor = 'var(--text3)', statusLine = '';

      if (isSun) {
        bg = ATT_STATUS.WEEKEND.bg; txtColor = ATT_STATUS.WEEKEND.color; borderColor = ATT_STATUS.WEEKEND.color;
        statusLine = `<div style="font-size:.6rem;font-weight:700;color:${ATT_STATUS.WEEKEND.color};margin-top:2px">Week Off</div>`;
      } else if (rec) {
        // Always show DB record — present, absent, on_leave, holiday, even if future
        const s = ATT_STATUS[rec.Status] || { bg:'#f4f5f7', color:'#8993a4', label: rec.Status };
        bg = s.bg; txtColor = s.color; borderColor = s.color;
        statusLine = `<div style="font-size:.62rem;font-weight:700;color:${s.color};margin-top:2px">${s.label}</div>`;
        if (rec.FirstIn) statusLine += `<div style="font-size:.59rem;color:${s.color};opacity:.8">${fmtTime(rec.FirstIn)}</div>`;
      } else if (isFut) {
        // Future with no DB record — blank
        statusLine = `<div style="font-size:.6rem;color:var(--text3);margin-top:2px">—</div>`;
      } else {
        // Past with no record — absent
        bg = ATT_STATUS.ABSENT.bg; txtColor = ATT_STATUS.ABSENT.color; borderColor = ATT_STATUS.ABSENT.color;
        statusLine = `<div style="font-size:.62rem;font-weight:700;color:${ATT_STATUS.ABSENT.color};margin-top:2px">Absent</div>`;
      }

      calCells += `<div style="min-height:72px;background:${bg};border:1.5px solid ${borderColor}55;
                               border-radius:8px;padding:8px;${isToday?'box-shadow:0 0 0 2px #0052cc;':''}
                               ${isFut?'opacity:.4;':''}">
        <div style="font-size:.8rem;font-weight:${isToday?'800':'600'};color:${isToday?'#0052cc':txtColor}">${d}</div>
        ${statusLine}</div>`;
    }

    body.innerHTML = `
    <!-- Stats strip -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:20px">
      ${[
        ['Present',  present,  '#006644','#e3fcef','✅'],
        ['Absent',   absent,   '#bf2600','#ffebe6','❌'],
        ['On Leave', onLeave,  '#0052cc','#e9f0ff','📋'],
        ['Late',     late,     '#974f0c','#fff7d6','⏰'],
        ['Holidays', holidays, '#403294','#f3e6ff','🎉'],
        ['Work Hrs', (totalMins/60).toFixed(1)+'h','#5243aa','#eae6ff','🕐'],
      ].map(([l,v,c,bg,ic]) => `
        <div style="background:${bg};border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:1rem;margin-bottom:2px">${ic}</div>
          <div style="font-size:1.15rem;font-weight:700;color:${c}">${v}</div>
          <div style="font-size:.68rem;color:${c};opacity:.8;margin-top:1px">${l}</div>
        </div>`).join('')}
    </div>

    <!-- Calendar -->
    <div class="card" style="margin-bottom:18px">
      <div class="card-title" style="margin-bottom:14px">Monthly Calendar</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:6px">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d =>
          `<div style="text-align:center;font-size:.68rem;font-weight:700;
                       color:${d==='Sun'?'#bf2600':'var(--text3)'};text-transform:uppercase;padding:4px">${d}</div>`
        ).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${calCells}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
        ${Object.entries(ATT_STATUS).filter(([k])=>k!=='HALF_DAY')
          .map(([,s])=>`<span style="background:${s.bg};color:${s.color};border-radius:3px;padding:2px 8px;font-size:.68rem;font-weight:700">${s.label}</span>`).join('')}
      </div>
    </div>

    <!-- Daily Detail — this month only, working days with punch data -->
    ${detailRows.length > 0 ? `
    <div class="card">
      <div class="card-title">Daily Detail</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Date</th><th>Day</th><th>First In</th><th>Last Out</th>
            <th>Work Hours</th><th>Status</th><th>Late By</th><th>Early By</th>
          </tr></thead>
          <tbody>
            ${detailRows.map(r => {
              const s = ATT_STATUS[r.Status] || { bg:'#f4f5f7', color:'#8993a4', label: r.Status };
              const [ry, rm, rd] = toDateKey(r.AttDate).split('-').map(Number);
              const dt = new Date(ry, rm - 1, rd);
              const isWeekend = r.Status === 'WEEKEND';
              return `<tr style="${isWeekend ? 'opacity:.6;' : ''}">
                <td style="font-weight:600">${dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</td>
                <td style="color:var(--text3)">${dt.toLocaleDateString('en-IN',{weekday:'short'})}</td>
                <td style="font-family:monospace;font-size:.85rem;color:${r.IsLate?'#bf2600':'var(--text)'}">
                  ${isWeekend ? '—' : fmtTime(r.FirstIn)}</td>
                <td style="font-family:monospace;font-size:.85rem;color:${r.IsEarlyExit?'#bf2600':'var(--text)'}">
                  ${isWeekend ? '—' : (fmtTime(r.LastOut)||'—')}</td>
                <td style="font-weight:600;color:${isWeekend?'var(--text3)':(r.WorkMinutes||0)<480?'#974f0c':'#006644'}">
                  ${isWeekend ? '—' : fmtMins(r.WorkMinutes)}</td>
                <td>
                  <span style="background:${s.bg};color:${s.color};border-radius:3px;
                               padding:2px 8px;font-size:.7rem;font-weight:700">${s.label}</span>
                  ${r.LeaveType?`<span style="font-size:.7rem;color:#0052cc;margin-left:4px">${r.LeaveType}</span>`:''}
                </td>
                <td style="color:var(--text3)">${(!isWeekend && (r.LateMinutes||0)>0) ? fmtMins(r.LateMinutes) : '—'}</td>
                <td style="color:var(--text3)">${(!isWeekend && (r.EarlyExitMins||0)>0) ? fmtMins(r.EarlyExitMins) : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}`;
  }

  render();
}

