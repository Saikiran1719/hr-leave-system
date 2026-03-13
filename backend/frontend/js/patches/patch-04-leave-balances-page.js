// ==============================================================
// HRnova — patch-04-leave-balances-page.js
// Leave Balances management page (HR)
// Lines 595–612 of original patch.js
// ==============================================================

// ================================================================
// 4. Extended api helpers
// ================================================================
api.addHoliday = function({ name, date }) {
  return fetch('/api/leaves/holidays', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+(localStorage.getItem('hr_token')||'')},
    body: JSON.stringify({ holidayName:name, holidayDate:date, year:new Date(date).getFullYear() })
  }).then(async r=>{ const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'Failed'); return d; });
};

api.deleteHoliday = function(id) {
  return fetch(`/api/leaves/holidays/${id}`, {
    method:'DELETE',
    headers:{'Authorization':'Bearer '+(localStorage.getItem('hr_token')||'')}
  }).then(async r=>{ const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'Failed'); return d; });
};

