// ==============================================================
// HRnova — patch-01-core-api-helpers.js
// Core API helper, req(), token, IST time utils
// Lines 1–114 of original patch.js
// ==============================================================

// ================================================================
// patch.js — ALL ADDITIONS (no existing files touched)
//
// 1. Holidays visible to ALL roles + HR can add/delete
// 2. Employee soft-delete with Active/Inactive filter tabs
// 3. Employee Code (e.g. 1252, EMP0042) — shown everywhere
// 4. Import (CSV paste / file upload) + Export (CSV download)
// ================================================================

// ── 1. Add 'holidays' to employee & manager page lists ──────────
PAGES.employee = [...PAGES.employee, 'holidays'];
PAGES.manager  = [...PAGES.manager,  'holidays'];
(function () {
  const h = NAV.find(n => n.id === 'holidays');
  if (h) h.group = 'main';
})();

// ================================================================
// 2. NEW renderHolidays
// ================================================================
async function renderHolidays(container) {
  const user = getUser();
  const isHR = user && user.role === 'hr';
  let showAddForm = false;

  async function render() {
    try {
      const hols     = await api.holidays();
      const upcoming = hols.filter(h => (h.HolidayDate || '').split('T')[0] >= todayStr());
      const past     = hols.filter(h => (h.HolidayDate || '').split('T')[0] <  todayStr());

      container.innerHTML = `
      <div class="page-anim">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px">
          <h2 class="page-title" style="margin:0">🎉 Holiday Calendar</h2>
          ${isHR ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button id="btn-hol-template"
              style="background:#fefce8;color:#ca8a04;border:1.5px solid #fde047;border-radius:8px;
                     padding:7px 14px;font-size:.78rem;font-weight:700;cursor:pointer">
              📋 Template
            </button>
            <label style="background:#eff6ff;color:#2563eb;border:1.5px solid #93c5fd;border-radius:8px;
                          padding:7px 14px;font-size:.78rem;font-weight:700;cursor:pointer;margin:0">
              📤 Import CSV
              <input type="file" id="hol-csv-file" accept=".csv" style="display:none"/>
            </label>
            <button class="btn btn-primary" id="btn-add-hol">＋ Add Holiday</button>
          </div>` : ''}
        </div>
        <div id="hol-import-result" style="display:none;margin-bottom:14px"></div>
        <div style="background:#fff7d6;border:1px solid #f6d860;border-left:3px solid #ff8b00;
                    border-radius:6px;padding:10px 14px;font-size:.84rem;color:#974f0c;
                    margin-bottom:18px;display:flex;gap:8px;align-items:flex-start">
          <span>📌</span><span>These are <strong>paid public holidays</strong>. Leave cannot be applied on these dates.</span>
        </div>

        ${isHR && showAddForm ? `
        <div style="background:#e9f0ff;border:1px dashed #0052cc;border-radius:8px;padding:16px 18px;margin-bottom:16px">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#0052cc;margin-bottom:12px">＋ Add New Holiday</div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
            <div class="form-group" style="flex:1;min-width:180px;margin:0">
              <label class="form-label">Holiday Name</label>
              <input class="form-control" id="hol-name" placeholder="e.g. Eid al-Fitr" />
            </div>
            <div class="form-group" style="min-width:160px;margin:0">
              <label class="form-label">Date</label>
              <input class="form-control" id="hol-date" type="date" />
            </div>
            <div style="display:flex;gap:8px;padding-bottom:1px">
              <button class="btn btn-primary" id="hol-save-btn">Save</button>
              <button class="btn btn-ghost"   id="hol-cancel-btn">Cancel</button>
            </div>
          </div>
          <div id="hol-err" style="display:none;margin-top:8px;font-size:.82rem;color:#bf2600"></div>
        </div>` : ''}

        ${upcoming.length > 0 ? `
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#8993a4;margin-bottom:10px">Upcoming — ${upcoming.length}</div>
          <div class="grid-3" style="margin-bottom:22px">${upcoming.map(h => _holidayCard(h, false, isHR)).join('')}</div>` : ''}
        ${past.length > 0 ? `
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#8993a4;margin-bottom:10px">Past This Year — ${past.length}</div>
          <div class="grid-3">${past.map(h => _holidayCard(h, true, isHR)).join('')}</div>` : ''}
        ${hols.length === 0 ? `<div class="empty"><div class="empty-icon">📅</div><p>No holidays added yet.</p></div>` : ''}
      </div>`;

      document.getElementById('btn-add-hol')?.addEventListener('click', () => { showAddForm = !showAddForm; render(); });
      document.getElementById('hol-cancel-btn')?.addEventListener('click', () => { showAddForm = false; render(); });
      document.getElementById('hol-save-btn')?.addEventListener('click', async () => {
        const name=document.getElementById('hol-name').value.trim(), date=document.getElementById('hol-date').value;
        const errEl=document.getElementById('hol-err');
        if (!name||!date){errEl.style.display='';errEl.textContent='Name and date required.';return;}
        try { await api.addHoliday({name,date}); toast.success('Holiday added!'); showAddForm=false; render(); }
        catch(e){errEl.style.display='';errEl.textContent=e.message;}
      });
      container.querySelectorAll('[data-del-hol]').forEach(btn =>
        btn.addEventListener('click', () => {
          confirmDialog('Remove Holiday', `Remove "${btn.dataset.holName}"?`, async () => {
            try { await api.deleteHoliday(btn.dataset.delHol); toast.success('Removed.'); render(); }
            catch(e){toast.error(e.message);}
          });
        })
      );
      // ── Template download (HR only) ──
      document.getElementById('btn-hol-template')?.addEventListener('click', () => {
        const year = new Date().getFullYear();
        const lines = [
          '# HRnova Holiday Import Template',
          '# Instructions:',
          '#   1. Fill HolidayName and Date (YYYY-MM-DD)',
          '#   2. Delete comment lines (starting with #) before importing',
          '#   3. One holiday per row',
          '#',
          'HolidayName,Date',
          'Ugadi,2026-03-30',
          'May Day,2026-05-01',
          'Independence Day,2026-08-15',
          'Gandhi Jayanthi,2026-10-02',
          'Diwali,2026-11-01',
          'Christmas,2026-12-25',
        ];
        const blob = new Blob([lines.join('\r\n')], { type:'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href=url; a.download=`holiday_template_${year}.csv`; a.click();
        setTimeout(()=>URL.revokeObjectURL(url), 3000);
      });

      // ── CSV Import (HR only) ──
      document.getElementById('hol-csv-file')?.addEventListener('change', async function() {
        const file = this.files[0];
        if (!file) return;
        const resultEl = document.getElementById('hol-import-result');
        resultEl.style.display='';
        resultEl.innerHTML = `<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:10px 14px;font-size:.82rem;color:#1d4ed8">⏳ Importing ${file.name}...</div>`;

        const text  = await file.text();
        const rows  = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
        if (rows.length < 2) {
          resultEl.innerHTML = `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;font-size:.82rem;color:#dc2626">❌ CSV has no data rows</div>`;
          this.value=''; return;
        }
        const headers = rows[0].split(',').map(h=>h.trim().toLowerCase().replace(/[^a-z]/g,''));
        const nameIdx = headers.findIndex(h=>h.includes('holiday')||h.includes('name'));
        const dateIdx = headers.findIndex(h=>h.includes('date'));
        if (nameIdx===-1||dateIdx===-1) {
          resultEl.innerHTML = `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;font-size:.82rem;color:#dc2626">❌ CSV must have HolidayName and Date columns</div>`;
          this.value=''; return;
        }
        let added=0, skipped=0, errs=[];
        const token = localStorage.getItem('hr_token')||'';
        for (let i=1; i<rows.length; i++) {
          const cols = rows[i].split(',').map(c=>c.replace(/^"|"$/g,'').trim());
          const name=cols[nameIdx], dateRaw=cols[dateIdx];
          if (!name||!dateRaw){skipped++;continue;}
          const dateObj=new Date(dateRaw);
          if (isNaN(dateObj.getTime())){errs.push(`Row ${i+1}: Invalid date "${dateRaw}"`);continue;}
          const dateStr=dateObj.toISOString().slice(0,10);
          try {
            const resp = await fetch('/api/leaves/holidays',{
              method:'POST',
              headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
              body:JSON.stringify({holidayName:name,holidayDate:dateStr,year:dateObj.getFullYear()})
            });
            const r=await resp.json();
            if(!resp.ok){r.error?.includes('already exists')?skipped++:errs.push(`Row ${i+1}: ${r.error}`);}
            else added++;
          } catch(e){errs.push(`Row ${i+1}: ${e.message}`);}
        }
        const ok=added>0;
        const msg=`${added} added${skipped?', '+skipped+' skipped':''}${errs.length?', '+errs.length+' errors':''}`;
        resultEl.innerHTML=`<div style="background:${ok?'#f0fdf4':'#fee2e2'};border:1px solid ${ok?'#86efac':'#fca5a5'};
          border-radius:8px;padding:10px 14px;font-size:.82rem;font-weight:600;color:${ok?'#16a34a':'#dc2626'}">
          ${ok?'✅':'❌'} ${msg}
          ${errs.slice(0,3).map(e=>`<div style="font-weight:400;font-size:.75rem;margin-top:2px">${e}</div>`).join('')}
        </div>`;
        this.value='';
        if (added>0) setTimeout(()=>render(), 1400);
      });

    } catch(e) { container.innerHTML=`<div style="color:#bf2600;padding:20px">${e.message}</div>`; }
  }
  render();
}

function _holidayCard(h, isPast, isHR) {
  const ds = (h.HolidayDate||'').split('T')[0];
  const wday = new Date(ds+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long'});
  return `
  <div class="holiday-card${isPast?' past':''}">
    <div class="holiday-icon">🎉</div>
    <div style="flex:1;min-width:0">
      <div class="holiday-name">${h.HolidayName}</div>
      <div class="holiday-date">${fmtDate(h.HolidayDate)}</div>
      <div class="holiday-wday">${wday}</div>
    </div>
    ${isPast?'<span class="holiday-past-tag">Past</span>':''}
    ${isHR?`<button data-del-hol="${h.HolidayID}" data-hol-name="${h.HolidayName}" title="Remove"
      style="background:none;border:none;cursor:pointer;color:#b3bac5;font-size:1rem;padding:4px 6px;
             border-radius:4px;flex-shrink:0;transition:background .12s,color .12s"
      onmouseover="this.style.background='#ffebe6';this.style.color='#bf2600'"
      onmouseout="this.style.background='none';this.style.color='#b3bac5'">✕</button>`:''}
  </div>`;
}

