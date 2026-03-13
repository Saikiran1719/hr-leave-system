// ================================================================
// HRnova — patch-29-24hour-time.js
// Force 24-hour (HH:MM) time format across entire application
// ================================================================

// ── Global time formatter (replaces all 12h displays) ──────────
window.fmt24 = function(t) {
  if (!t || t === 'NULL' || t === 'null') return '—';
  const s = String(t).trim();
  // Already HH:MM from backend CONVERT(NVARCHAR(5),time,108)
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    return `${String(parseInt(match[1])).padStart(2,'0')}:${match[2]}`;
  }
  // Full ISO datetime string — parse as local time
  if (s.includes('T') || s.includes(' ')) {
    const clean = s.replace('T',' ').replace(/\.\d+$/, '');
    const parts = clean.split(' ');
    if (parts[1]) {
      const tp = parts[1].split(':');
      return `${String(parseInt(tp[0])).padStart(2,'0')}:${tp[1]||'00'}`;
    }
  }
  return s;
};

// ── Override fmtTime everywhere ─────────────────────────────────
window.fmtTime = window.fmt24;

// ── Notification panel — time display ──────────────────────────
window.fmtISTTime = function(dtStr) {
  const d = parseIST(dtStr);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

// ── Audit log time function (patch-15) ─────────────────────────
// Original: d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})
window.fmtAuditTime = function(d) {
  if (!(d instanceof Date)) d = new Date(d);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

// ── Face attendance punch time ──────────────────────────────────
// Patch the face attendance time displays using MutationObserver
// since they're rendered dynamically

// ── Global toLocaleTimeString override for en-IN ───────────────
// This catches any remaining toLocaleTimeString calls
const _origToLocaleTime = Date.prototype.toLocaleTimeString;
Date.prototype.toLocaleTimeString = function(locale, opts) {
  // Force 24-hour for all calls in this app
  const h = this.getHours();
  const m = this.getMinutes();
  const s = this.getSeconds();
  // If seconds requested (face attendance)
  if (opts && opts.second) {
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
};

// ── Fix the office hours text in attendance ─────────────────────
// patch-09 has hardcoded "8:30 AM – 5:00 PM" text — override via CSS content trick
// and also fix it in patch-10 calendar cell display

// ── Fix patch-09 fmtTime (already set above) ───────────────────
// Also fix the hardcoded office hours display string
const _origRenderAttendance = window.renderAttendance;
if (_origRenderAttendance) {
  window.renderAttendance = function(container) {
    const r = _origRenderAttendance(container);
    // After render, fix any remaining 12h text
    setTimeout(() => fix12hText(container), 300);
    return r;
  };
}

function fix12hText(root) {
  if (!root) root = document;
  // Find text nodes with AM/PM and convert
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while (node = walker.nextNode()) nodes.push(node);
  nodes.forEach(n => {
    if (/\d{1,2}:\d{2}\s*(AM|PM|am|pm)/i.test(n.textContent)) {
      n.textContent = n.textContent.replace(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)/gi, (_, h, m, ap) => {
        let hour = parseInt(h);
        const ispm = /pm/i.test(ap);
        if (ispm && hour !== 12) hour += 12;
        if (!ispm && hour === 12) hour = 0;
        return `${String(hour).padStart(2,'0')}:${m}`;
      });
    }
  });
}

// Run on every navigation
const _origNav29 = window.navigate;
window.navigate = function(page) {
  const r = _origNav29(page);
  setTimeout(() => fix12hText(document.getElementById('main-content')), 500);
  return r;
};

// Run once on load
setTimeout(() => fix12hText(document.body), 1000);

console.log('🕐 24-hour time format applied globally');
