// ==============================================================
// HRnova — patch-03-csv-import-helpers.js
// CSV import helpers and bulk import utilities
// Lines 552–594 of original patch.js
// ==============================================================

// ================================================================
// Helpers
// ================================================================

// Parse CSV text → array of objects (handles quoted fields)
function _parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g,'').trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur='', inQ=false;
    for (const c of line) {
      if (c==='"') { inQ=!inQ; }
      else if (c===',' && !inQ) { vals.push(cur.trim()); cur=''; }
      else cur+=c;
    }
    vals.push(cur.trim());
    const obj={};
    headers.forEach((h,i) => { obj[h] = (vals[i]||'').replace(/^"|"$/g,''); });
    return obj;
  }).filter(r => Object.values(r).some(v=>v));
}

// Show import result summary in the panel
function _showImportResult(d) {
  const el = document.getElementById('import-result');
  if (!el) return;
  const hasErrors = d.errors && d.errors.length > 0;
  el.innerHTML = `
  <div style="background:${d.added>0?'#e3fcef':'#fff7d6'};border:1px solid ${d.added>0?'#abf5d1':'#f6d860'};
              border-radius:6px;padding:12px 14px;margin-bottom:12px;font-size:.84rem">
    <div style="font-weight:700;color:${d.added>0?'#006644':'#974f0c'};margin-bottom:6px">
      ${d.added>0?'✓':''} ${d.message}
    </div>
    ${hasErrors?`
    <div style="margin-top:8px;font-size:.78rem;color:#974f0c">
      <strong>Issues:</strong><br>
      ${d.errors.map(e=>`Row ${e.row}: ${e.reason}`).join('<br>')}
    </div>`:''}
  </div>`;
}

