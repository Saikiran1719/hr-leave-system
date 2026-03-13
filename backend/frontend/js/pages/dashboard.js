// frontend/js/pages/dashboard.js
async function renderDashboard(container) {
  const user = getUser();
  try {
    const [bal, leaves] = await Promise.all([api.myBalance(), api.myLeaves()]);
    const approved  = leaves.filter(l => l.Status === 'approved');
    const pending   = leaves.filter(l => l.Status === 'pending');
    const usedDays  = approved.reduce((s, l) => s + l.TotalDays, 0);
    const totalBal  = bal.reduce((s, b) => s + b.RemainingDays, 0);
    const upcoming  = await api.holidays();
    const upcomingFiltered = upcoming.filter(h => h.HolidayDate >= todayStr()).slice(0, 5);

    let pendingApprCnt = 0;
    if (user.role !== 'employee') {
      try { pendingApprCnt = (await api.pendingLeaves()).length; } catch {}
    }

    const stats = [
      { label:'Leave Balance',   val: totalBal,          color:'var(--primary)', icon:'🗓' },
      { label:'Days Used',        val: usedDays,          color:'var(--success)', icon:'✅' },
      { label:'My Pending',       val: pending.length,    color:'var(--warning)', icon:'⏳' },
      { label:'Need Approval',    val: pendingApprCnt,    color:'var(--danger)',  icon:'📨',
        link: pendingApprCnt > 0 && user.role !== 'employee' },
    ];

    container.innerHTML = `
    <div class="page-anim">
      <div class="greeting">
        <h1>Hello, ${user.fullName.split(' ')[0]} 👋</h1>
        <p>${new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
      </div>

      <div class="stats-row">
        ${stats.map(s => `
          <div class="stat-card${s.link?' link':''}" ${s.link?'onclick="navigate(\'approvals\')"':''}>
            <div class="stat-icon">${s.icon}</div>
            <div class="stat-val" style="color:${s.color}">${s.val}</div>
            <div class="stat-label">${s.label}</div>
          </div>`).join('')}
      </div>

      <div class="grid-dash">
        <div class="card">
          <div class="card-title">Leave Balance Overview</div>
          ${bal.map(b => {
            const pct = Math.min(100, ((b.MaxDaysPerYear - b.RemainingDays) / b.MaxDaysPerYear) * 100);
            return `
            <div class="bal-row">
              <div class="bal-top">
                <span class="bal-name">${b.TypeName}</span>
                <span class="bal-num" style="color:${b.ColorHex}">${b.RemainingDays}/${b.MaxDaysPerYear}</span>
              </div>
              <div class="progress">
                <div class="bar" style="width:${pct}%;background:${b.ColorHex}"></div>
              </div>
            </div>`;
          }).join('')}
        </div>

        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="card">
            <div class="card-title">🎉 Upcoming Holidays</div>
            ${upcomingFiltered.length === 0
              ? `<div style="color:var(--text3);font-size:.84rem">No upcoming holidays.</div>`
              : upcomingFiltered.map(h => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:.86rem">
                  <span style="color:var(--text2)">${h.HolidayName}</span>
                  <span style="color:var(--warning);font-size:.76rem;white-space:nowrap;margin-left:8px">${fmtDate(h.HolidayDate)}</span>
                </div>`).join('')}
          </div>
          <button class="btn btn-primary btn-full" onclick="navigate('apply')">＋ Apply for Leave</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Recent Leave Requests</div>
        ${leaves.length === 0 ? empty('No leaves applied yet.') : `
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Applied</th>
              </tr></thead>
              <tbody>
                ${leaves.slice(0, 7).map(l => `
                  <tr>
                    <td>${typeChip(l.TypeCode, l.ColorHex)}</td>
                    <td style="color:var(--text2)">${fmtDate(l.FromDate)}</td>
                    <td style="color:var(--text2)">${fmtDate(l.ToDate)}</td>
                    <td><b>${l.TotalDays}d</b></td>
                    <td>${statusBadge(l.Status)}</td>
                    <td style="color:var(--text3);font-size:.8rem">${fmtDate(l.AppliedOn)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
      </div>
    </div>`;
  } catch (e) {
    container.innerHTML = `<div style="color:var(--danger);padding:20px">Failed to load dashboard: ${e.message}</div>`;
  }
}
