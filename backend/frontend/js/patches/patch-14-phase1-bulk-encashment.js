// ==============================================================
// HRnova — patch-14-phase1-bulk-encashment.js
// Phase 1 — Bulk Approvals + Leave Encashment
// Lines 3565–3916 of original patch.js
// ==============================================================

// ================================================================
// ENHANCED LEAVE CALENDAR — Department-wise team view
// ================================================================

const _MONTHS_CAL = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const _DAYS_CAL   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Dept avatar colors
const DEPT_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444',
                     '#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4'];
function deptColor(name) {
  let h = 0; for (const c of (name||'')) h = (h*31 + c.charCodeAt(0)) % DEPT_COLORS.length;
  return DEPT_COLORS[h];
}
function initials(name) {
  return (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
}
function avatarHtml(name, size=24, fs='.62rem', color) {
  const col = color || deptColor(name);
  return `<span style="display:inline-flex;align-items:center;justify-content:center;
    width:${size}px;height:${size}px;border-radius:50%;background:${col};
    color:#fff;font-size:${fs};font-weight:700;flex-shrink:0;border:2px solid #fff"
    title="${name}">${initials(name)}</span>`;
}

window.renderCalendar = async function(container) {
  const user = getUser();
  let month  = new Date().getMonth() + 1;
  let year   = new Date().getFullYear();
  let deptFilter = 'all'; // 'all' or DepartmentID string

  async function render() {
    try {
      const data = await api.calendar(month, year);
      const { leaves=[], oods=[], holidays=[], departments=[], myDeptID } = data;

      // Default: set to user's own dept if not yet set
      if (deptFilter === 'all' && myDeptID) {
        deptFilter = String(myDeptID);
      } else if (deptFilter === 'all' && departments.length) {
        deptFilter = String(departments[0].DepartmentID);
      }

      const holMap = {};
      holidays.forEach(h => {
        const d = (h.HolidayDate||'').split('T')[0];
        holMap[d] = h.HolidayName;
      });

      // Filter by DepartmentID directly (now returned from backend)
      const filteredLeaves = deptFilter === 'all'
        ? leaves
        : leaves.filter(l => String(l.DepartmentID) === deptFilter);

      const filteredOODs = deptFilter === 'all'
        ? oods
        : oods.filter(o => String(o.DepartmentID) === deptFilter);

      // Who is on leave today
      const todayStr2 = (() => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })();
      const onLeaveToday = filteredLeaves.filter(l => {
        const f=(l.FromDate||'').split('T')[0], t=(l.ToDate||'').split('T')[0];
        return f<=todayStr2 && t>=todayStr2;
      });

      // Unique leave types for legend
      const usedTypes = [...new Map(leaves.map(l=>[l.TypeCode,l])).values()];

      // Summary stats for this month
      const totalLeaves = filteredLeaves.length;
      const deptBreakdown = {};
      filteredLeaves.forEach(l => {
        const dept = l.DepartmentName||'Other';
        deptBreakdown[dept] = (deptBreakdown[dept]||0)+1;
      });

      // Build calendar grid cells
      const pad = n => String(n).padStart(2,'0');
      const first = new Date(year, month-1, 1).getDay();
      const dim   = new Date(year, month, 0).getDate();

      let cells = '';
      for (let i=0; i<first; i++) {
        cells += `<div style="min-height:110px;border-right:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;background:#fafafa"></div>`;
      }

      for (let d=1; d<=dim; d++) {
        const ds   = `${year}-${pad(month)}-${pad(d)}`;
        const wday = new Date(year,month-1,d).getDay();
        const isToday = ds === todayStr2;
        const hol  = holMap[ds];
        const isSun = wday === 0;

        const dayLeaves = filteredLeaves.filter(l => {
          const f=(l.FromDate||'').split('T')[0], t=(l.ToDate||'').split('T')[0];
          return f<=ds && t>=ds;
        });
        const dayOODs = filteredOODs.filter(o => {
          const f=(o.FromDate||'').split('T')[0], t=(o.ToDate||'').split('T')[0];
          return f<=ds && t>=ds;
        });

        const allDay = [...dayLeaves, ...dayOODs.map(o=>({...o,TypeCode:'OOD',ColorHex:'#0ea5e9',isOOD:true}))];
        const show   = allDay.slice(0,3);
        const more   = allDay.length - show.length;

        let bg = '#fff';
        if (isSun) bg = '#fafafa';
        if (hol)   bg = '#fffbeb';
        if (isToday) bg = '#eff6ff';

        const evHtml = show.map(e => {
          const col = e.ColorHex || '#6366f1';
          const firstName = (e.EmployeeName||'').split(' ')[0];
          const tag = e.isOOD ? 'OOD' : e.TypeCode;
          return `<div style="display:flex;align-items:center;gap:4px;margin-top:3px;
                              background:${col}18;border-left:2.5px solid ${col};
                              border-radius:0 4px 4px 0;padding:2px 5px;
                              font-size:.65rem;color:${col};font-weight:600;
                              white-space:nowrap;overflow:hidden;cursor:default"
                       title="${e.EmployeeName} — ${e.isOOD?'On Official Duty':e.TypeName}">
                    ${avatarHtml(e.EmployeeName, 14, '.45rem', col)}
                    <span style="overflow:hidden;text-overflow:ellipsis">${firstName}</span>
                    <span style="opacity:.7;font-size:.58rem">${tag}</span>
                  </div>`;
        }).join('');

        cells += `
          <div style="min-height:110px;border-right:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;
                      background:${bg};padding:6px 6px 4px;position:relative;
                      transition:background .15s">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
              <span style="font-size:.75rem;font-weight:${isToday?'800':'500'};
                           color:${isToday?'#fff':'#374151'};
                           ${isToday?`background:#2563eb;width:22px;height:22px;border-radius:50%;
                             display:inline-flex;align-items:center;justify-content:center;`:''}">
                ${d}
              </span>
              ${isSun ? `<span style="font-size:.58rem;color:#94a3b8;font-weight:600">OFF</span>` : ''}
            </div>
            ${hol ? `<div style="font-size:.62rem;color:#b45309;font-weight:700;
                                 background:#fef3c7;border-radius:3px;padding:1px 5px;
                                 margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
                         title="${hol}">🎉 ${hol}</div>` : ''}
            ${evHtml}
            ${more>0 ? `<div style="font-size:.6rem;color:#6366f1;font-weight:700;
                                    margin-top:3px;padding:1px 5px;background:#eef2ff;
                                    border-radius:3px;display:inline-block">+${more} more</div>` : ''}
          </div>`;
      }

      // Who's on leave today panel
      const todayPanel = onLeaveToday.length ? `
        <div style="background:#fff;border-radius:12px;border:1.5px solid #e0e7ff;
                    padding:16px 20px;margin-bottom:16px">
          <div style="font-size:.72rem;font-weight:700;color:#6366f1;text-transform:uppercase;
                      letter-spacing:.08em;margin-bottom:10px">
            👤 On Leave Today — ${onLeaveToday.length} employee${onLeaveToday.length>1?'s':''}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${onLeaveToday.map(l => `
              <div style="display:flex;align-items:center;gap:8px;background:#f8faff;
                          border:1px solid #e0e7ff;border-radius:8px;padding:6px 12px">
                ${avatarHtml(l.EmployeeName, 28, '.7rem')}
                <div>
                  <div style="font-weight:700;font-size:.8rem;color:#1e293b">${l.EmployeeName}</div>
                  <div style="font-size:.68rem;color:${l.ColorHex||'#6366f1'};font-weight:600">
                    ${l.TypeCode} · ${l.DepartmentName||''}
                  </div>
                </div>
              </div>`).join('')}
          </div>
        </div>` : '';

      // Dept breakdown sidebar
      const topDepts = Object.entries(deptBreakdown).sort((a,b)=>b[1]-a[1]).slice(0,6);

      // Count holidays only in this month (not full year)
      const monthHolidays = holidays.filter(h => {
        const hm = parseInt((h.HolidayDate||'').split('-')[1] || (h.HolidayDate||'').split('T')[0].split('-')[1]);
        return hm === month;
      });

      container.innerHTML = `
      <!-- Header row -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <h2 class="page-title" style="margin:0">📅 Leave Calendar</h2>
        <!-- Month nav -->
        <div style="display:flex;align-items:center;gap:0;border:1.5px solid var(--border2);border-radius:8px;overflow:hidden">
          <button id="cal-prev" style="background:#fff;border:none;padding:7px 14px;cursor:pointer;font-size:1rem;color:#374151">‹</button>
          <span style="padding:7px 16px;font-weight:700;font-size:.88rem;color:#1e293b;
                       background:#f8faff;border-left:1px solid var(--border2);border-right:1px solid var(--border2)">
            ${_MONTHS_CAL[month-1]} ${year}
          </span>
          <button id="cal-next" style="background:#fff;border:none;padding:7px 14px;cursor:pointer;font-size:1rem;color:#374151">›</button>
        </div>
      </div>

      ${todayPanel}

      <div style="display:grid;grid-template-columns:1fr 220px;gap:16px;align-items:start">

        <!-- MAIN CALENDAR + DEPT DROPDOWN BELOW -->
        <div>
          <div style="background:#fff;border-radius:14px;border:1.5px solid #e2e8f0;overflow:hidden">
            <!-- Day headers -->
            <div style="display:grid;grid-template-columns:repeat(7,1fr);background:#f8faff;
                        border-bottom:1.5px solid #e2e8f0">
              ${_DAYS_CAL.map(d=>`
                <div style="padding:10px 6px;text-align:center;font-size:.72rem;font-weight:700;
                             color:${d==='Sun'?'#ef4444':'#6b7280'};text-transform:uppercase;
                             letter-spacing:.06em">${d}</div>`).join('')}
            </div>
            <!-- Cells -->
            <div style="display:grid;grid-template-columns:repeat(7,1fr)">${cells}</div>
          </div>

          <!-- Dept filter dropdown BELOW calendar -->
          <div style="display:flex;align-items:center;gap:10px;margin-top:12px;
                      background:#fff;border-radius:10px;border:1.5px solid #e2e8f0;
                      padding:10px 16px;flex-wrap:wrap">
            <span style="font-size:.78rem;font-weight:700;color:var(--text3)">🏢 Filter by Department:</span>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${departments.map(d => {
                const col   = deptColor(d.DepartmentName);
                const active = String(d.DepartmentID) === deptFilter;
                return `<button class="cal-dept-btn" data-dept="${d.DepartmentID}"
                        style="padding:5px 16px;border-radius:20px;font-size:.76rem;font-weight:700;
                               cursor:pointer;border:1.5px solid;transition:all .15s;
                               ${active?`background:${col};color:#fff;border-color:${col}`:`background:#f8faff;color:#6b7280;border-color:#e2e8f0`}">
                  ${d.DepartmentName}
                </button>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- SIDEBAR -->
        <div style="display:flex;flex-direction:column;gap:12px">

          <!-- Stats card — holidays count fixed to this month only -->
          <div style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;padding:16px">
            <div style="font-size:.68rem;font-weight:700;color:var(--text3);text-transform:uppercase;
                        letter-spacing:.08em;margin-bottom:10px">This Month</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="background:#eef2ff;border-radius:8px;padding:10px;text-align:center">
                <div style="font-size:1.4rem;font-weight:800;color:#6366f1">${filteredLeaves.length}</div>
                <div style="font-size:.65rem;color:#6366f1;font-weight:600">Leaves</div>
              </div>
              <div style="background:#ecfdf5;border-radius:8px;padding:10px;text-align:center">
                <div style="font-size:1.4rem;font-weight:800;color:#10b981">${filteredOODs.length}</div>
                <div style="font-size:.65rem;color:#10b981;font-weight:600">OOD</div>
              </div>
              <div style="background:#fff7ed;border-radius:8px;padding:10px;text-align:center">
                <div style="font-size:1.4rem;font-weight:800;color:#f59e0b">${monthHolidays.length}</div>
                <div style="font-size:.65rem;color:#f59e0b;font-weight:600">Holidays</div>
              </div>
              <div style="background:#fdf4ff;border-radius:8px;padding:10px;text-align:center">
                <div style="font-size:1.4rem;font-weight:800;color:#a855f7">${onLeaveToday.length}</div>
                <div style="font-size:.65rem;color:#a855f7;font-weight:600">Out Today</div>
              </div>
            </div>
          </div>

          <!-- Upcoming leaves (next 7 days) -->
          ${(() => {
            const n=new Date(); const upcoming=[];
            for(let i=1;i<=7;i++){
              const nd=new Date(n); nd.setDate(nd.getDate()+i);
              const ds2=`${nd.getFullYear()}-${pad(nd.getMonth()+1)}-${pad(nd.getDate())}`;
              filteredLeaves.forEach(l=>{
                const f=(l.FromDate||'').split('T')[0],t=(l.ToDate||'').split('T')[0];
                if(f===ds2) upcoming.push({...l,startDate:ds2});
              });
            }
            if(!upcoming.length) return '';
            return `<div style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;padding:16px">
              <div style="font-size:.68rem;font-weight:700;color:var(--text3);text-transform:uppercase;
                          letter-spacing:.08em;margin-bottom:10px">Upcoming Leaves</div>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${upcoming.slice(0,5).map(l=>`
                  <div style="display:flex;align-items:center;gap:8px">
                    ${avatarHtml(l.EmployeeName, 28, '.7rem')}
                    <div style="flex:1;min-width:0">
                      <div style="font-size:.75rem;font-weight:700;color:#1e293b;
                                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        ${l.EmployeeName.split(' ')[0]}
                      </div>
                      <div style="font-size:.65rem;color:${l.ColorHex};font-weight:600">
                        ${new Date(l.startDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} · ${l.TypeCode}
                      </div>
                    </div>
                  </div>`).join('')}
              </div>
            </div>`;
          })()}

          <!-- Legend -->
          <div style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;padding:14px">
            <div style="font-size:.68rem;font-weight:700;color:var(--text3);text-transform:uppercase;
                        letter-spacing:.08em;margin-bottom:8px">Legend</div>
            <div style="display:flex;flex-direction:column;gap:5px">
              <div style="display:flex;align-items:center;gap:6px">
                <div style="width:12px;height:12px;border-radius:50%;background:#2563eb"></div>
                <span style="font-size:.73rem;color:#334155">Today</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <div style="width:12px;height:12px;border-radius:3px;background:#fef3c7;border:1.5px solid #f59e0b"></div>
                <span style="font-size:.73rem;color:#334155">Holiday</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <div style="width:12px;height:12px;border-radius:3px;background:#0ea5e918;border-left:3px solid #0ea5e9"></div>
                <span style="font-size:.73rem;color:#334155">OOD</span>
              </div>
              ${usedTypes.map(t=>`
              <div style="display:flex;align-items:center;gap:6px">
                <div style="width:12px;height:12px;border-radius:3px;background:${t.ColorHex}18;border-left:3px solid ${t.ColorHex}"></div>
                <span style="font-size:.73rem;color:#334155">${t.TypeName||t.TypeCode}</span>
              </div>`).join('')}
            </div>
          </div>

        </div><!-- end sidebar -->
      </div>`;

      // Event handlers
      document.getElementById('cal-prev').onclick = () => {
        if (month===1){month=12;year--;} else month--;
        render();
      };
      document.getElementById('cal-next').onclick = () => {
        if (month===12){month=1;year++;} else month++;
        render();
      };
      document.querySelectorAll('.cal-dept-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          deptFilter = btn.dataset.dept;
          render();
        });
      });

    } catch(e) {
      container.innerHTML = `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`;
    }
  }

  render();
};

console.log('📅 Enhanced Calendar loaded');

