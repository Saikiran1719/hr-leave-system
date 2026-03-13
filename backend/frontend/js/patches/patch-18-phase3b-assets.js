// ==============================================================
// HRnova — patch-18-phase3b-assets.js
// Phase 3B — Asset Management
// Lines 5489–6002 of original patch.js
// ==============================================================

// ================================================================
// PHASE 3B: ASSET MANAGEMENT
// ================================================================

api.assetsList    = (p)      => req('GET',  `/assets?${new URLSearchParams(p||{}).toString()}`);
api.assetsMy      = ()       => req('GET',  '/assets/my');
api.assetsStats   = ()       => req('GET',  '/assets/stats');
api.assetsCreate  = (d)      => req('POST', '/assets', d);
api.assetsUpdate  = (id,d)   => req('PATCH',`/assets/${id}`, d);
api.assetsAssign  = (id,d)   => req('POST', `/assets/${id}/assign`, d);
api.assetsReturn  = (id,d)   => req('POST', `/assets/${id}/return`, d);
api.assetsHistory = (id)     => req('GET',  `/assets/${id}/history`);
api.assetsCategories    = ()    => req('GET',  '/assets/categories');
api.assetsCategoryAdd   = (d)   => req('POST', '/assets/categories', d);

// Map category name to a clean icon label (no emoji dependency)
function catIcon(name) {
  const map = {
    'Laptop':'💻','Desktop':'🖥️','Mobile Phone':'📱','Headset':'🎧',
    'Mouse & Keyboard':'⌨️','Vehicle':'🚗','Access Card':'🪪','Other':'📦'
  };
  return map[name] || '📦';
}

PAGES.employee = [...PAGES.employee, 'assets'];
PAGES.manager  = [...PAGES.manager,  'assets'];
PAGES.hr       = [...PAGES.hr,       'assets'];
NAV.push({ id:'assets', icon:'📦', label:'Asset Management', group:'main' });

const _origNavAssets = window.navigate;
window.navigate = function(page) {
  const content = document.getElementById('main-content') || document.getElementById('page-content');
  if (page === 'assets' && content) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page==='assets'));
    renderAssets(content); return;
  }
  return _origNavAssets(page);
};

async function renderAssets(container) {
  const user = getUser();
  const isHR = user?.role === 'hr';
  let assetTab = isHR ? 'inventory' : 'my';

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <h2 class="page-title" style="margin:0">📦 Asset Management</h2>
      ${isHR ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="ast-tab btn btn-primary" data-tab="inventory" style="font-size:.83rem">📦 Inventory</button>
        <button class="ast-tab btn btn-secondary" data-tab="assigned" style="font-size:.83rem">👥 Assigned</button>
      </div>` : ''}
    </div>
    <div id="ast-content"></div>`;

  if (isHR) {
    container.querySelectorAll('.ast-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        assetTab = btn.dataset.tab;
        container.querySelectorAll('.ast-tab').forEach(b => {
          b.className = b.dataset.tab===assetTab ? 'ast-tab btn btn-primary' : 'ast-tab btn btn-secondary';
          b.style.fontSize = '.83rem';
        });
        loadAssetTab();
      });
    });
  }

  async function loadAssetTab() {
    const el = document.getElementById('ast-content');
    if (!el) return;
    if (!isHR || assetTab === 'my') { await renderMyAssets(el); return; }
    if (assetTab === 'assigned')    { await renderAssignedAssets(el); return; }
    await renderAssetInventory(el);
  }

  loadAssetTab();
}

// ── My Assets (employee) ──────────────────────────────────────
async function renderMyAssets(el) {
  el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text3)">Loading...</div>`;
  try {
    const r = await api.assetsMy();
    const assets = r?.assets || [];
    if (!assets.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text3)">
        <div style="font-size:3rem;margin-bottom:12px">📦</div>
        <div style="font-weight:600">No assets assigned to you</div>
      </div>`; return;
    }
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
        ${assets.map(a => `
          <div style="background:#fff;border-radius:14px;border:1.5px solid #e2e8f0;padding:18px;
                      transition:box-shadow .2s"
               onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,.08)'"
               onmouseout="this.style.boxShadow=''">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
              <div style="font-size:2rem">${catIcon(a.CategoryName||'')}</div>
              <div>
                <div style="font-weight:700;font-size:.92rem;color:#1e293b">${a.AssetName}</div>
                <div style="font-family:monospace;font-size:.72rem;color:#6366f1;font-weight:700">${a.AssetCode}</div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;font-size:.78rem;color:var(--text3)">
              ${a.Brand||a.Model ? `<div>🏷️ ${[a.Brand,a.Model].filter(Boolean).join(' ')}</div>` : ''}
              ${a.SerialNumber ? `<div>🔢 S/N: ${a.SerialNumber}</div>` : ''}
              <div>📅 Assigned: ${new Date(a.AssignedDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
              <div>📦 Condition: <strong style="color:${a.Condition==='good'?'#16a34a':a.Condition==='fair'?'#d97706':'#dc2626'}">${a.Condition}</strong></div>
            </div>
          </div>`).join('')}
      </div>`;
  } catch(e) { el.innerHTML = `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
}

// ── Asset Inventory (HR) ──────────────────────────────────────
async function renderAssetInventory(el) {
  el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text3)">Loading...</div>`;
  try {
    const [assetsR, statsR, catsR, usersR] = await Promise.all([
      api.assetsList(), api.assetsStats(), api.assetsCategories(), req('GET','/users')
    ]);
    const assets = assetsR?.assets || [];
    const stats  = statsR?.stats   || {};
    const cats   = catsR?.categories || [];
    const users  = Array.isArray(usersR) ? usersR : [];

    const statusColors = { available:'#16a34a', assigned:'#2563eb', maintenance:'#d97706', retired:'#94a3b8' };
    const statusBg     = { available:'#dcfce7', assigned:'#dbeafe', maintenance:'#fef9c3', retired:'#f1f5f9' };

    el.innerHTML = `
      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px">
        ${[
          ['Total Assets',  stats.Total||0,       '#6366f1','#eef2ff'],
          ['Available',     stats.Available||0,    '#16a34a','#f0fdf4'],
          ['Assigned',      stats.Assigned||0,     '#2563eb','#eff6ff'],
          ['Maintenance',   stats.Maintenance||0,  '#d97706','#fefce8'],
          ['Total Value',   stats.TotalValue>0?'₹'+parseFloat(stats.TotalValue).toLocaleString('en-IN'):'—', '#0ea5e9','#e0f2fe'],
        ].map(([l,v,c,bg]) => `
          <div style="background:${bg};border-radius:10px;padding:12px 14px;border:1.5px solid ${c}22">
            <div style="font-size:1.3rem;font-weight:800;color:${c}">${v}</div>
            <div style="font-size:.68rem;color:${c};font-weight:700;text-transform:uppercase">${l}</div>
          </div>`).join('')}
      </div>

      <!-- Toolbar -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <input id="ast-search" class="form-control" placeholder="🔍 Search assets..."
               style="flex:1;min-width:180px;font-size:.83rem" />
        <select id="ast-status-filter" class="form-control" style="width:auto;font-size:.83rem">
          <option value="">All Status</option>
          <option value="available">Available</option>
          <option value="assigned">Assigned</option>
          <option value="maintenance">Maintenance</option>
          <option value="retired">Retired</option>
        </select>
        <button id="btn-add-asset" class="btn btn-primary"
                style="background:linear-gradient(135deg,#1a3c6e,#2563eb);border:none;font-weight:700;font-size:.83rem">
          ➕ Add Asset
        </button>
      </div>

      <!-- Assets table -->
      <div style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:.82rem" id="ast-table">
          <thead>
            <tr style="background:#f8faff">
              ${['Code','Asset','Category','Brand/Model','S/N','Status','Assigned To','Actions'].map(h=>
                `<th style="padding:10px 12px;text-align:left;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${assets.map(a => `
              <tr class="ast-row" style="border-bottom:1px solid #f1f5f9"
                  data-name="${(a.AssetName||'').toLowerCase()}" data-code="${(a.AssetCode||'').toLowerCase()}"
                  data-status="${a.Status}">
                <td style="padding:10px 12px;font-family:monospace;font-weight:700;color:#6366f1;font-size:.78rem">${a.AssetCode}</td>
                <td style="padding:10px 12px">
                  <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:1.2rem">${catIcon(a.CategoryName||'')}</span>
                    <div>
                      <div style="font-weight:700">${a.AssetName}</div>
                      <div style="font-size:.7rem;color:var(--text3)">${a.CategoryName||''}</div>
                    </div>
                  </div>
                </td>
                <td style="padding:10px 12px;color:var(--text3)">${a.CategoryName||'—'}</td>
                <td style="padding:10px 12px;font-size:.78rem">${[a.Brand,a.Model].filter(Boolean).join(' ')||'—'}</td>
                <td style="padding:10px 12px;font-family:monospace;font-size:.75rem;color:var(--text3)">${a.SerialNumber||'—'}</td>
                <td style="padding:10px 12px">
                  <span style="background:${statusBg[a.Status]||'#f1f5f9'};color:${statusColors[a.Status]||'#94a3b8'};
                               border-radius:20px;padding:2px 10px;font-size:.7rem;font-weight:700">
                    ${a.Status}
                  </span>
                </td>
                <td style="padding:10px 12px;font-size:.8rem">
                  ${a.AssignedTo ? `<div style="font-weight:600">${a.AssignedTo}</div>
                    <div style="font-size:.7rem;color:var(--text3)">${new Date(a.AssignedDate||Date.now()).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</div>` : '—'}
                </td>
                <td style="padding:10px 12px">
                  <div style="display:flex;gap:4px;flex-wrap:wrap">
                    ${a.Status==='available' ? `
                      <button class="btn-assign-asset" data-id="${a.AssetID}" data-name="${a.AssetName}"
                              style="background:#dbeafe;color:#2563eb;border:none;border-radius:5px;
                                     padding:4px 8px;font-size:.7rem;cursor:pointer;font-weight:600">
                        👤 Assign
                      </button>` : ''}
                    ${a.Status==='assigned' ? `
                      <button class="btn-return-asset" data-id="${a.AssetID}" data-name="${a.AssetName}"
                              style="background:#dcfce7;color:#16a34a;border:none;border-radius:5px;
                                     padding:4px 8px;font-size:.7rem;cursor:pointer;font-weight:600">
                        ↩️ Return
                      </button>` : ''}
                    <button class="btn-edit-asset" data-id="${a.AssetID}"
                            style="background:#f1f5f9;color:#64748b;border:none;border-radius:5px;
                                   padding:4px 8px;font-size:.7rem;cursor:pointer">
                      ✏️
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${!assets.length ? '<div style="text-align:center;padding:40px;color:var(--text3)">No assets yet. Click Add Asset to start.</div>' : ''}
      </div>`;

    // Search + filter
    function filterAssets() {
      const q  = document.getElementById('ast-search')?.value?.toLowerCase()||'';
      const st = document.getElementById('ast-status-filter')?.value||'';
      document.querySelectorAll('.ast-row').forEach(row => {
        const matchQ  = !q  || row.dataset.name.includes(q) || row.dataset.code.includes(q);
        const matchSt = !st || row.dataset.status === st;
        row.style.display = matchQ && matchSt ? '' : 'none';
      });
    }
    document.getElementById('ast-search')?.addEventListener('input', filterAssets);
    document.getElementById('ast-status-filter')?.addEventListener('change', filterAssets);

    document.getElementById('btn-add-asset').addEventListener('click', () =>
      showAddAssetModal(cats, () => renderAssetInventory(el)));

    el.querySelectorAll('.btn-edit-asset').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = assets.find(x=>x.AssetID===parseInt(btn.dataset.id));
        showEditAssetModal(a, () => renderAssetInventory(el));
      });
    });

    el.querySelectorAll('.btn-assign-asset').forEach(btn => {
      btn.addEventListener('click', () =>
        showAssignAssetModal(parseInt(btn.dataset.id), btn.dataset.name, users, () => renderAssetInventory(el)));
    });

    el.querySelectorAll('.btn-return-asset').forEach(btn => {
      btn.addEventListener('click', () =>
        showReturnAssetModal(parseInt(btn.dataset.id), btn.dataset.name, () => renderAssetInventory(el)));
    });

  } catch(e) { el.innerHTML = `<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
}

// ── Assigned Assets view (HR) ─────────────────────────────────
async function renderAssignedAssets(el) {
  el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text3)">Loading...</div>`;
  try {
    const r = await api.assetsList({ status:'assigned' });
    const assets = r?.assets || [];
    if (!assets.length) { el.innerHTML=`<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:2rem">📦</div>No assets currently assigned.</div>`; return; }
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${assets.map(a=>`
          <div style="background:#fff;border-radius:10px;border:1.5px solid #e2e8f0;
                      padding:14px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
            <div style="font-size:1.8rem">${catIcon(a.CategoryName||'')}</div>
            <div style="flex:2;min-width:160px">
              <div style="font-weight:700">${a.AssetName}
                <span style="font-family:monospace;font-size:.72rem;color:#6366f1">${a.AssetCode}</span>
              </div>
              <div style="font-size:.75rem;color:var(--text3)">${[a.Brand,a.Model].filter(Boolean).join(' ')||''}${a.SerialNumber?` · S/N: ${a.SerialNumber}`:''}</div>
            </div>
            <div style="flex:1;min-width:140px">
              <div style="font-weight:700;font-size:.85rem">👤 ${a.AssignedTo||'—'}</div>
              <div style="font-size:.72rem;color:var(--text3)">Since ${a.AssignedDate?new Date(a.AssignedDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):''}</div>
            </div>
            <button class="btn-return-asset2" data-id="${a.AssetID}" data-name="${a.AssetName}"
                    style="background:#dcfce7;color:#16a34a;border:none;border-radius:7px;
                           padding:7px 14px;font-size:.78rem;cursor:pointer;font-weight:700">
              ↩️ Return Asset
            </button>
          </div>`).join('')}
      </div>`;
    el.querySelectorAll('.btn-return-asset2').forEach(btn => {
      btn.addEventListener('click', () => showReturnAssetModal(parseInt(btn.dataset.id), btn.dataset.name, () => renderAssignedAssets(el)));
    });
  } catch(e) { el.innerHTML=`<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
}

function showAddAssetModal(cats, onSave) {
  const overlay = document.createElement('div');
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:520px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);max-height:90vh;overflow-y:auto">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:20px">➕ Add New Asset</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div class="form-group" style="margin:0"><label class="form-label">Asset Code *</label>
          <input class="form-control" id="ast-code" placeholder="e.g. LT-001" /></div>
        <div class="form-group" style="margin:0"><label class="form-label">Asset Name *</label>
          <input class="form-control" id="ast-name" placeholder="e.g. Dell Laptop" /></div>
        <div class="form-group" style="margin:0"><label class="form-label">Category
          <button type="button" id="btn-add-cat"
                  style="margin-left:8px;background:none;border:none;color:#6366f1;
                         font-size:.75rem;cursor:pointer;font-weight:700;text-decoration:underline">
            + Add New
          </button></label>
          <select class="form-control" id="ast-cat">
            <option value="">— Select —</option>
            ${cats.map(c=>`<option value="${c.CategoryID}">${catIcon(c.CategoryName)} ${c.CategoryName}</option>`).join('')}
          </select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Condition</label>
          <select class="form-control" id="ast-cond">
            <option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option>
          </select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Brand</label>
          <input class="form-control" id="ast-brand" placeholder="e.g. Dell" /></div>
        <div class="form-group" style="margin:0"><label class="form-label">Model</label>
          <input class="form-control" id="ast-model" placeholder="e.g. Inspiron 15" /></div>
        <div class="form-group" style="margin:0"><label class="form-label">Serial Number</label>
          <input class="form-control" id="ast-serial" /></div>
        <div class="form-group" style="margin:0"><label class="form-label">Purchase Price (₹)</label>
          <input class="form-control" type="number" id="ast-price" /></div>
        <div class="form-group" style="margin:0"><label class="form-label">Purchase Date</label>
          <input class="form-control" type="date" id="ast-pdate" /></div>
        <div class="form-group" style="margin:0"><label class="form-label">Warranty Until</label>
          <input class="form-control" type="date" id="ast-warranty" /></div>
      </div>
      <div class="form-group" style="margin-bottom:18px"><label class="form-label">Notes</label>
        <textarea class="form-control" id="ast-notes" rows="2" style="resize:none"></textarea></div>
      <div id="ast-add-err" style="color:#dc2626;font-size:.8rem;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button id="ast-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="ast-save" class="btn btn-primary" style="flex:2;background:linear-gradient(135deg,#1a3c6e,#2563eb);border:none;font-weight:700">
          💾 Add Asset
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#ast-cancel').onclick=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});

  // Add new category inline
  overlay.querySelector('#btn-add-cat')?.addEventListener('click', async () => {
    const catName = prompt('New category name:');
    if (!catName?.trim()) return;
    try {
      await api.assetsCategoryAdd({ categoryName: catName.trim() });
      // Refresh categories and rebuild dropdown
      const newCats = await api.assetsCategories();
      const sel = overlay.querySelector('#ast-cat');
      const curVal = sel.value;
      sel.innerHTML = '<option value="">— Select —</option>' +
        (newCats.categories||[]).map(c=>`<option value="${c.CategoryID}">${catIcon(c.CategoryName)} ${c.CategoryName}</option>`).join('');
      sel.value = curVal;
      // Auto-select the new one
      const added = (newCats.categories||[]).find(c=>c.CategoryName===catName.trim());
      if (added) sel.value = added.CategoryID;
    } catch(e) { alert('Error: '+e.message); }
  });

  overlay.querySelector('#ast-save').onclick=async()=>{
    const code=overlay.querySelector('#ast-code').value.trim();
    const name=overlay.querySelector('#ast-name').value.trim();
    const errEl=overlay.querySelector('#ast-add-err');
    if(!code||!name){errEl.style.display='';errEl.textContent='Code and name required';return;}
    const btn=overlay.querySelector('#ast-save');btn.disabled=true;btn.textContent='Saving...';
    try{
      await api.assetsCreate({
        assetCode:code,assetName:name,
        categoryID:overlay.querySelector('#ast-cat').value||null,
        brand:overlay.querySelector('#ast-brand').value||null,
        model:overlay.querySelector('#ast-model').value||null,
        serialNumber:overlay.querySelector('#ast-serial').value||null,
        purchasePrice:overlay.querySelector('#ast-price').value||null,
        purchaseDate:overlay.querySelector('#ast-pdate').value||null,
        warrantyUntil:overlay.querySelector('#ast-warranty').value||null,
        condition:overlay.querySelector('#ast-cond').value,
        notes:overlay.querySelector('#ast-notes').value||null,
      });
      overlay.remove();if(onSave)onSave();
    }catch(e){errEl.style.display='';errEl.textContent=e.message;btn.disabled=false;btn.textContent='💾 Add Asset';}
  };
}

function showEditAssetModal(asset, onSave) {
  const overlay = document.createElement('div');
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:20px">✏️ Edit Asset: ${asset.AssetCode}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="form-group" style="margin:0"><label class="form-label">Status</label>
          <select class="form-control" id="edit-ast-status">
            ${['available','assigned','maintenance','retired'].map(s=>`<option value="${s}" ${asset.Status===s?'selected':''}>${s}</option>`).join('')}
          </select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Condition</label>
          <select class="form-control" id="edit-ast-cond">
            ${['good','fair','poor'].map(s=>`<option value="${s}" ${asset.Condition===s?'selected':''}>${s}</option>`).join('')}
          </select></div>
        <div class="form-group" style="margin:0;grid-column:1/-1"><label class="form-label">Warranty Until</label>
          <input class="form-control" type="date" id="edit-ast-warranty" value="${asset.WarrantyUntil?String(asset.WarrantyUntil).slice(0,10):''}" /></div>
        <div class="form-group" style="margin:0;grid-column:1/-1"><label class="form-label">Notes</label>
          <textarea class="form-control" id="edit-ast-notes" rows="2" style="resize:none">${asset.Notes||''}</textarea></div>
      </div>
      <div style="display:flex;gap:10px">
        <button id="edit-ast-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="edit-ast-save" class="btn btn-primary" style="flex:2;background:linear-gradient(135deg,#1a3c6e,#2563eb);border:none;font-weight:700">
          💾 Save
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#edit-ast-cancel').onclick=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  overlay.querySelector('#edit-ast-save').onclick=async()=>{
    try{
      await api.assetsUpdate(asset.AssetID,{
        status:overlay.querySelector('#edit-ast-status').value,
        condition:overlay.querySelector('#edit-ast-cond').value,
        warrantyUntil:overlay.querySelector('#edit-ast-warranty').value||null,
        notes:overlay.querySelector('#edit-ast-notes').value||null,
      });
      overlay.remove();if(onSave)onSave();
    }catch(e){alert(e.message);}
  };
}

function showAssignAssetModal(assetID, assetName, users, onSave) {
  const overlay=document.createElement('div');
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px`;
  const today=new Date().toISOString().slice(0,10);
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:6px">👤 Assign Asset</div>
      <div style="color:var(--text3);font-size:.83rem;margin-bottom:20px">${assetName}</div>
      <div class="form-group" style="margin-bottom:14px"><label class="form-label">Assign To *</label>
        <select class="form-control" id="assign-uid">
          <option value="">— Select Employee —</option>
          ${users.map(u=>`<option value="${u.UserID}">${u.FullName}${u.EmployeeCode?' (#'+u.EmployeeCode+')':''}</option>`).join('')}
        </select></div>
      <div class="form-group" style="margin-bottom:14px"><label class="form-label">Assigned Date</label>
        <input class="form-control" type="date" id="assign-date" value="${today}" /></div>
      <div class="form-group" style="margin-bottom:18px"><label class="form-label">Notes</label>
        <input class="form-control" id="assign-notes" placeholder="Optional handover notes" /></div>
      <div id="assign-err" style="color:#dc2626;font-size:.8rem;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button id="assign-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="assign-save" class="btn btn-primary" style="flex:2;background:linear-gradient(135deg,#1a3c6e,#2563eb);border:none;font-weight:700">
          ✅ Assign
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#assign-cancel').onclick=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  overlay.querySelector('#assign-save').onclick=async()=>{
    const uid=overlay.querySelector('#assign-uid').value;
    const errEl=overlay.querySelector('#assign-err');
    if(!uid){errEl.style.display='';errEl.textContent='Select an employee';return;}
    const btn=overlay.querySelector('#assign-save');btn.disabled=true;btn.textContent='Assigning...';
    try{
      await api.assetsAssign(assetID,{userID:parseInt(uid),assignedDate:overlay.querySelector('#assign-date').value,notes:overlay.querySelector('#assign-notes').value||null});
      overlay.remove();if(onSave)onSave();
    }catch(e){errEl.style.display='';errEl.textContent=e.message;btn.disabled=false;btn.textContent='✅ Assign';}
  };
}

function showReturnAssetModal(assetID, assetName, onSave) {
  const overlay=document.createElement('div');
  overlay.style.cssText=`position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px`;
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:6px">↩️ Return Asset</div>
      <div style="color:var(--text3);font-size:.83rem;margin-bottom:20px">${assetName}</div>
      <div class="form-group" style="margin-bottom:14px"><label class="form-label">Return Condition</label>
        <select class="form-control" id="ret-cond">
          <option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option>
        </select></div>
      <div class="form-group" style="margin-bottom:18px"><label class="form-label">Notes</label>
        <input class="form-control" id="ret-notes" placeholder="Any damage or remarks" /></div>
      <div style="display:flex;gap:10px">
        <button id="ret-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="ret-save" class="btn btn-primary"
                style="flex:2;background:linear-gradient(135deg,#16a34a,#15803d);border:none;font-weight:700">
          ↩️ Confirm Return
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#ret-cancel').onclick=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  overlay.querySelector('#ret-save').onclick=async()=>{
    const btn=overlay.querySelector('#ret-save');btn.disabled=true;btn.textContent='Processing...';
    try{
      await api.assetsReturn(assetID,{condition:overlay.querySelector('#ret-cond').value,notes:overlay.querySelector('#ret-notes').value||null});
      overlay.remove();if(onSave)onSave();
    }catch(e){alert(e.message);btn.disabled=false;btn.textContent='↩️ Confirm Return';}
  };
}

console.log('✅ Phase 3: Shifts + Assets loaded');

