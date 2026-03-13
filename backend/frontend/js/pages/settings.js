// frontend/js/pages/holidays.js — defined in balances.js
// frontend/js/pages/settings.js
async function renderSettings(container) {
  try {
    const types = await api.leaveTypes();
    container.innerHTML = `
    <div class="page-anim">
      <h2 class="page-title">System Settings</h2>
      <div class="grid-2">
        <div class="card">
          <div class="card-title">Leave Policy — Max Days/Year</div>
          ${types.map(t=>`
            <div style="display:flex;justify-content:space-between;align-items:center;
                        padding:10px 0;border-bottom:1px solid var(--border);font-size:.88rem">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:10px;height:10px;border-radius:3px;background:${t.ColorHex}"></div>
                <span style="color:var(--text2)">${t.TypeName}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <input type="number" value="${t.MaxDaysPerYear}" min="0" max="365"
                  style="width:55px;background:var(--bg);border:1px solid var(--border2);
                         border-radius:6px;padding:4px 8px;color:var(--text);font-size:.86rem;text-align:center" />
                <span style="color:var(--text3);font-size:.76rem">d/yr</span>
              </div>
            </div>`).join('')}
          <button class="btn btn-primary" style="margin-top:16px" onclick="toast.success('Policy saved! (Connect to DB to persist)')">Save Policy</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="card">
            <div class="card-title">Approval Workflow</div>
            ${[['Advance notice (days)','2'],['Max days per request','30'],['Max consecutive days','14']].map(([l,v])=>`
              <div class="form-group">
                <label class="form-label">${l}</label>
                <input class="form-control" type="number" value="${v}" />
              </div>`).join('')}
            <button class="btn btn-primary btn-full" onclick="toast.success('Workflow settings saved!')">Save</button>
          </div>
          <div class="card">
            <div class="card-title">Notifications</div>
            ${[['Email on application','email_apply',true],['Email on approval','email_approval',true],
               ['Slack integration','slack',false],['SMS alerts','sms',false]].map(([l,k,on])=>`
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;font-size:.88rem">
                <span style="color:var(--text2)">${l}</span>
                <div onclick="this.dataset.on=this.dataset.on==='1'?'0':'1';
                              this.style.background=this.dataset.on==='1'?'var(--primary)':'var(--border2)';
                              this.children[0].style.left=this.dataset.on==='1'?'18px':'3px'"
                  data-on="${on?1:0}"
                  style="width:38px;height:22px;border-radius:11px;background:${on?'var(--primary)':'var(--border2)'};
                         position:relative;cursor:pointer;flex-shrink:0;transition:background .2s">
                  <div style="position:absolute;top:3px;left:${on?18:3}px;width:16px;height:16px;
                               border-radius:50%;background:#fff;transition:left .2s"></div>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
  } catch (e) {
    container.innerHTML = `<div style="color:var(--danger);padding:20px">${e.message}</div>`;
  }
}
