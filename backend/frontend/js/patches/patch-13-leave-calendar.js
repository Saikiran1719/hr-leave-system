// ==============================================================
// HRnova — patch-13-leave-calendar.js
// Enhanced Leave Calendar — department team view
// Lines 3181–3564 of original patch.js
// ==============================================================

// ================================================================
// NOTICES / NOTICEBOARD FEATURE
// ================================================================

// API
api.noticesList   = ()        => req('GET',  '/notices');
api.noticeRead    = (id)      => req('POST', `/notices/${id}/read`);
api.noticeDelete  = (id)      => req('DELETE', `/notices/${id}`);

// Nav — all roles
PAGES.employee = [...PAGES.employee, 'notices'];
PAGES.manager  = [...PAGES.manager,  'notices'];
PAGES.hr       = [...PAGES.hr,       'notices'];
NAV.push({ id:'notices', icon:'📢', label:'Notices', group:'main' });

// Navigate patch
const _origNavNotices = window.navigate;
window.navigate = function(page) {
  if (page === 'notices') {
    const content = document.getElementById('main-content') || document.getElementById('page-content');
    if (content) {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page==='notices'));
      renderNotices(content);
    }
    return;
  }
  return _origNavNotices(page);
};

const NOTICE_CATS = ['General','Policy','Event','Urgent','Holiday','Reminder'];
const CAT_COLORS  = { General:'#6366f1', Policy:'#0369a1', Event:'#0d9488', Urgent:'#dc2626', Holiday:'#d97706', Reminder:'#7c3aed' };
const CAT_BG      = { General:'#eef2ff', Policy:'#e0f2fe', Event:'#ccfbf1', Urgent:'#fee2e2', Holiday:'#fef9c3', Reminder:'#ede9fe' };

async function renderNotices(container) {
  const user  = getUser();
  const isHR  = user?.role === 'hr';

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <h2 class="page-title" style="margin:0">📢 Notice Board</h2>
      ${isHR ? `<button id="btn-post-notice" class="btn btn-primary"
                        style="background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;
                               padding:10px 22px;border-radius:10px;font-weight:700;font-size:.88rem">
                  ✏️ Post Notice
                </button>` : ''}
    </div>
    <div id="notices-list"><div style="text-align:center;padding:40px;color:var(--text3)">Loading notices...</div></div>`;

  if (isHR) {
    document.getElementById('btn-post-notice').addEventListener('click', () => showNoticeModal(null, loadNotices));
  }

  async function loadNotices() {
    try {
      const r = await api.noticesList();
      const notices = r?.notices || [];
      const el = document.getElementById('notices-list');
      if (!el) return;

      if (!notices.length) {
        el.innerHTML = `
          <div style="text-align:center;padding:60px 20px;background:#fff;border-radius:14px;
                      border:2px dashed var(--border2)">
            <div style="font-size:3rem;margin-bottom:12px">📢</div>
            <div style="font-size:1rem;font-weight:600;color:var(--text2)">No notices yet</div>
            <div style="color:var(--text3);font-size:.85rem;margin-top:4px">
              ${isHR ? 'Click "Post Notice" to create the first one.' : 'Check back later for company announcements.'}
            </div>
          </div>`;
        return;
      }

      const pinned = notices.filter(n => n.IsPinned);
      const regular = notices.filter(n => !n.IsPinned);

      let html = '';

      if (pinned.length) {
        html += `<div style="margin-bottom:6px;font-size:.72rem;font-weight:700;color:var(--text3);
                             text-transform:uppercase;letter-spacing:.08em">📌 Pinned</div>`;
        pinned.forEach(n => { html += noticeCard(n, isHR); });
        html += `<div style="margin:20px 0 8px;font-size:.72rem;font-weight:700;color:var(--text3);
                             text-transform:uppercase;letter-spacing:.08em">📋 All Notices</div>`;
      }
      regular.forEach(n => { html += noticeCard(n, isHR); });

      el.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px">${html}</div>`;

      // Expand / read handlers
      el.querySelectorAll('.notice-card').forEach(card => {
        card.addEventListener('click', async (e) => {
          if (e.target.closest('.notice-actions')) return;
          const id  = parseInt(card.dataset.id);
          const body = card.querySelector('.notice-body');
          const isExpanded = body.style.display !== 'none';
          body.style.display = isExpanded ? 'none' : 'block';
          card.querySelector('.notice-chevron').textContent = isExpanded ? '▼' : '▲';
          // Mark as read
          if (!isExpanded && card.dataset.read === '0') {
            await api.noticeRead(id).catch(()=>{});
            card.dataset.read = '1';
            const dot = card.querySelector('.unread-dot');
            if (dot) dot.remove();
          }
        });
      });

      // HR actions
      el.querySelectorAll('.btn-delete-notice').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Delete this notice?')) return;
          await api.noticeDelete(parseInt(btn.dataset.id));
          loadNotices();
        });
      });

      el.querySelectorAll('.btn-edit-notice').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseInt(btn.dataset.id);
          const notice = notices.find(n => n.NoticeID === id);
          showNoticeModal(notice, loadNotices);
        });
      });

    } catch(e) {
      document.getElementById('notices-list').innerHTML =
        `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`;
    }
  }

  loadNotices();
}

function noticeCard(n, isHR) {
  const cat     = n.Category || 'General';
  const catCol  = CAT_COLORS[cat]  || '#6366f1';
  const catBg   = CAT_BG[cat]      || '#eef2ff';
  const isUnread = !n.IsRead;
  const timeAgoStr = noticeTimeAgo(n.CreatedAt);
  const hasAttach  = !!n.AttachmentPath;

  const attachPreview = hasAttach ? (() => {
    const url = `/uploads/${n.AttachmentPath}`;
    if (n.AttachmentType === 'image') {
      return `<div style="margin-top:16px;border-radius:10px;overflow:hidden;max-width:100%">
                <img src="${url}" alt="${n.AttachmentName}"
                     style="max-width:100%;max-height:400px;object-fit:contain;border-radius:10px;
                            border:1px solid var(--border2);display:block" />
              </div>`;
    }
    const icon = n.AttachmentType==='pdf' ? '📄' : '📎';
    return `<a href="${url}" target="_blank"="${n.AttachmentName}"
               style="display:inline-flex;align-items:center;gap:8px;margin-top:14px;
                      background:#f8faff;border:1.5px solid #c7d2fe;border-radius:8px;
                      padding:10px 16px;text-decoration:none;color:#4f46e5;font-weight:600;font-size:.85rem">
              ${icon} ${n.AttachmentName}
              <span style="color:var(--text3);font-size:.72rem;font-weight:400">Download</span>
            </a>`;
  })() : '';

  const readBadge = isHR
    ? `<span style="font-size:.7rem;color:var(--text3)">👁 ${n.ReadCount}/${n.TotalUsers} read</span>`
    : '';

  return `
  <div class="notice-card" data-id="${n.NoticeID}" data-read="${n.IsRead?1:0}"
       style="background:#fff;border-radius:14px;border:1.5px solid ${isUnread?catCol:'var(--border2)'};
              cursor:pointer;overflow:hidden;transition:box-shadow .2s;
              ${n.IsPinned?'box-shadow:0 4px 16px rgba(99,102,241,.12)':''}
              ${isUnread?'box-shadow:0 2px 12px '+catCol+'22':''}">
    <div style="padding:16px 20px">
      <div style="display:flex;align-items:flex-start;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            ${isUnread ? `<span class="unread-dot" style="width:8px;height:8px;border-radius:50%;
                                background:${catCol};flex-shrink:0;display:inline-block"></span>` : ''}
            <span style="background:${catBg};color:${catCol};border-radius:20px;padding:2px 10px;
                         font-size:.7rem;font-weight:700;text-transform:uppercase">${cat}</span>
            ${n.IsPinned ? `<span style="background:#fef3c7;color:#92400e;border-radius:20px;
                                        padding:2px 8px;font-size:.7rem;font-weight:700">📌 Pinned</span>` : ''}
            ${readBadge}
          </div>
          <div style="font-weight:700;font-size:.98rem;color:#1e293b;line-height:1.3">${n.Title}</div>
          <div style="color:var(--text3);font-size:.75rem;margin-top:4px">
            By ${n.CreatedByName}${n.CreatedByCode?` #${n.CreatedByCode}`:''} · ${timeAgoStr}
            ${hasAttach ? ` · <span style="color:${catCol}">📎 Attachment</span>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          ${isHR ? `<div class="notice-actions" style="display:flex;gap:4px">
            <button class="btn-edit-notice" data-id="${n.NoticeID}"
                    style="background:#f1f5f9;border:none;border-radius:6px;padding:5px 10px;
                           font-size:.75rem;cursor:pointer;color:#334155;font-weight:600">✏️ Edit</button>
            <button class="btn-delete-notice" data-id="${n.NoticeID}"
                    style="background:#fee2e2;border:none;border-radius:6px;padding:5px 10px;
                           font-size:.75rem;cursor:pointer;color:#dc2626;font-weight:600">🗑</button>
          </div>` : ''}
          <span class="notice-chevron" style="color:var(--text3);font-size:.75rem">▼</span>
        </div>
      </div>
    </div>
    <div class="notice-body" style="display:none;padding:0 20px 18px">
      <div style="height:1px;background:var(--border2);margin-bottom:14px"></div>
      <div style="font-size:.88rem;color:#374151;line-height:1.8;white-space:pre-wrap">${n.Body}</div>
      ${attachPreview}
    </div>
  </div>`;
}

function noticeTimeAgo(dt) {
  const diff = Math.floor((Date.now() - new Date(dt)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  if (diff < 604800)return Math.floor(diff/86400) + 'd ago';
  return new Date(dt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}

// ── Post / Edit Notice Modal ─────────────────────────────────
function showNoticeModal(existing, onSave) {
  const isEdit = !!existing;
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;
                            display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:18px;padding:30px;max-width:560px;width:100%;
                box-shadow:0 24px 64px rgba(0,0,0,.25);max-height:90vh;overflow-y:auto">

      <!-- Header -->
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px">
        <div style="width:48px;height:48px;border-radius:12px;
                    background:linear-gradient(135deg,#6366f1,#4f46e5);
                    display:flex;align-items:center;justify-content:center;font-size:1.5rem">📢</div>
        <div>
          <div style="font-size:1.15rem;font-weight:800;color:#1e293b">
            ${isEdit ? 'Edit Notice' : 'Post New Notice'}
          </div>
          <div style="font-size:.78rem;color:var(--text3)">
            ${isEdit ? 'Update the notice details below' : 'Notify all employees instantly'}
          </div>
        </div>
      </div>

      <!-- Category + Pin row -->
      <div style="display:grid;grid-template-columns:1fr auto;gap:12px;margin-bottom:14px;align-items:end">
        <div class="form-group" style="margin:0">
          <label class="form-label">Category</label>
          <select class="form-control" id="n-cat">
            ${NOTICE_CATS.map(c => `<option value="${c}" ${existing?.Category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
                      padding:10px 14px;border:1.5px solid var(--border2);border-radius:8px;
                      font-size:.82rem;font-weight:600;color:#334155;white-space:nowrap">
          <input type="checkbox" id="n-pin" ${existing?.IsPinned?'checked':''}
                 style="accent-color:#6366f1;width:14px;height:14px" />
          📌 Pin Notice
        </label>
      </div>

      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">Title <span style="color:red">*</span></label>
        <input class="form-control" id="n-title" placeholder="e.g. Office closed on 26th January"
               value="${existing?.Title||''}" />
      </div>

      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">Message <span style="color:red">*</span></label>
        <textarea class="form-control" id="n-body" rows="5"
                  placeholder="Write the full notice details here..."
                  style="resize:vertical;line-height:1.6">${existing?.Body||''}</textarea>
      </div>

      <!-- Attachment -->
      <div class="form-group" style="margin-bottom:20px">
        <label class="form-label">📎 Attachment <span style="color:var(--text3);font-weight:400">(optional — image, PDF, DOC, max 10MB)</span></label>
        <div id="attach-drop" style="border:2px dashed #c7d2fe;border-radius:10px;padding:20px;
                                     text-align:center;cursor:pointer;transition:background .15s;
                                     background:#fafafe">
          <input type="file" id="n-file" style="display:none"
                 accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" />
          <div id="attach-label">
            <div style="font-size:1.5rem;margin-bottom:6px">📎</div>
            <div style="font-size:.82rem;color:#6366f1;font-weight:600">Click to attach a file</div>
            <div style="font-size:.72rem;color:var(--text3);margin-top:2px">Images, PDF, Word, Excel, PPT</div>
          </div>
        </div>
        ${existing?.AttachmentName ? `<div style="margin-top:8px;font-size:.78rem;color:#0369a1">
          📎 Current: ${existing.AttachmentName} (upload new to replace)
        </div>` : ''}
      </div>

      <div id="n-err" style="color:#dc2626;font-size:.8rem;margin-bottom:10px;display:none"></div>

      <div style="display:flex;gap:10px">
        <button id="n-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="n-submit" class="btn btn-primary"
                style="flex:2;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;font-weight:700">
          ${isEdit ? '💾 Save Changes' : '📢 Post Notice'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // File picker
  const dropZone = overlay.querySelector('#attach-drop');
  const fileInput = overlay.querySelector('#n-file');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.background='#eef2ff'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.background='#fafafe'; });
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.style.background='#fafafe';
    if (e.dataTransfer.files[0]) {
      fileInput.files = e.dataTransfer.files;
      updateAttachLabel(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) updateAttachLabel(fileInput.files[0]);
  });
  function updateAttachLabel(file) {
    overlay.querySelector('#attach-label').innerHTML = `
      <div style="font-size:1.2rem">${file.type.startsWith('image/')?'🖼️':file.name.endsWith('.pdf')?'📄':'📎'}</div>
      <div style="font-size:.82rem;font-weight:600;color:#16a34a">${file.name}</div>
      <div style="font-size:.72rem;color:var(--text3)">${(file.size/1024/1024).toFixed(2)} MB</div>`;
    dropZone.style.borderColor = '#86efac';
    dropZone.style.background  = '#f0fdf4';
  }

  overlay.querySelector('#n-cancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target===overlay) overlay.remove(); });

  overlay.querySelector('#n-submit').onclick = async () => {
    const title = overlay.querySelector('#n-title').value.trim();
    const body  = overlay.querySelector('#n-body').value.trim();
    const cat   = overlay.querySelector('#n-cat').value;
    const pin   = overlay.querySelector('#n-pin').checked;
    const file  = overlay.querySelector('#n-file').files[0];
    const errEl = overlay.querySelector('#n-err');

    if (!title) { errEl.style.display=''; errEl.textContent='Title is required.'; return; }
    if (!body)  { errEl.style.display=''; errEl.textContent='Message is required.'; return; }

    const btn = overlay.querySelector('#n-submit');
    btn.disabled = true; btn.textContent = 'Posting...';

    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('body', body);
      fd.append('category', cat);
      fd.append('isPinned', pin);
      if (file) fd.append('attachment', file);

      const token = localStorage.getItem('hr_token')||'';
      const url   = isEdit ? `/api/notices/${existing.NoticeID}` : '/api/notices';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, { method, headers:{ Authorization:'Bearer '+token }, body: fd });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error||'Failed');

      overlay.remove();
      const toast = document.createElement('div');
      toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
        background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;
        padding:14px 22px;border-radius:12px;font-weight:700;font-size:.88rem;
        box-shadow:0 8px 24px rgba(99,102,241,.4)`;
      toast.innerHTML = isEdit ? '✅ Notice updated!' : `📢 Notice posted! All employees notified.`;
      document.body.appendChild(toast);
      setTimeout(()=>toast.remove(), 3500);
      if (onSave) onSave();
    } catch(e) {
      errEl.style.display=''; errEl.textContent = e.message;
      btn.disabled=false; btn.textContent = isEdit?'💾 Save Changes':'📢 Post Notice';
    }
  };
}

console.log('📢 Notices module loaded');

