// ==============================================================
// HRnova — patch-08-myattendance-page.js
// My Attendance page — monthly calendar view (Part 1)
// Lines 1562–1841 of original patch.js
// ==============================================================

// ================================================================
// 8. NEW renderSettings — real SMTP config + email toggles
// ================================================================
async function renderSettings(container) {
  let testLoading = false;
  let saveLoading = false;

  async function render() {
    try {
      const [types, settings] = await Promise.all([
        api.leaveTypes(),
        _loadSettings(),
      ]);

      const emailApp      = settings.email_on_application === 'true';
      const emailApproval = settings.email_on_approval    === 'true';

      container.innerHTML = `
      <div class="page-anim">
        <h2 class="page-title">System Settings</h2>
        <div class="grid-2">

          <!-- Leave policy card (preserved) -->
          <div class="card">
            <div class="card-title">Leave Policy — Max Days / Year</div>
            ${types.map(t => `
              <div style="display:flex;justify-content:space-between;align-items:center;
                          padding:10px 0;border-bottom:1px solid var(--border);font-size:.88rem">
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:10px;height:10px;border-radius:3px;background:${t.ColorHex}"></div>
                  <span>${t.TypeName}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  <input type="number" value="${t.MaxDaysPerYear}" min="0" max="365"
                    style="width:55px;background:var(--surface2);border:1px solid var(--border);
                           border-radius:6px;padding:4px 8px;font-size:.86rem;text-align:center" />
                  <span style="font-size:.76rem;color:var(--text3)">d/yr</span>
                </div>
              </div>`).join('')}
            <button class="btn btn-primary" style="margin-top:16px"
              onclick="toast.info('Leave policy — connect to DB to persist.')">Save Policy</button>
          </div>

          <div style="display:flex;flex-direction:column;gap:14px">

            <!-- Company Details card -->
            <div class="card" style="border:2px solid #1a3c6e22">
              <div class="card-title" style="display:flex;align-items:center;gap:8px">
                🏢 Company Details
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="form-group" style="margin:0;grid-column:1/-1">
                  <label class="form-label">Company Name</label>
                  <input class="form-control" id="s-co-name"
                    value="${settings.company_name||''}"
                    placeholder="Your Company Pvt Ltd" />
                </div>
                <div class="form-group" style="margin:0;grid-column:1/-1">
                  <label class="form-label">Company Address</label>
                  <input class="form-control" id="s-co-addr"
                    value="${settings.company_address||''}"
                    placeholder="123 Business Park, City - 560001" />
                </div>
                <div class="form-group" style="margin:0">
                  <label class="form-label">Company PAN</label>
                  <input class="form-control" id="s-co-pan"
                    value="${settings.company_pan||''}"
                    placeholder="ABCDE1234F" style="text-transform:uppercase" />
                </div>
                <div class="form-group" style="margin:0">
                  <label class="form-label">PF Registration No.</label>
                  <input class="form-control" id="s-co-pf"
                    value="${settings.company_pf_number||''}"
                    placeholder="PF/KA/12345" />
                </div>
              </div>
              <button class="btn btn-primary" id="btn-save-company" style="margin-top:14px">
                💾 Save Company Details
              </button>
              <div id="company-msg" style="margin-top:8px;font-size:.82rem"></div>
            </div>

            <!-- Email Notifications card -->
            <div class="card" style="border:2px solid #0052cc22">
              <div class="card-title" style="display:flex;align-items:center;gap:8px">
                📧 Email Notifications
              </div>

              <!-- Toggles -->
              <div style="margin-bottom:18px">
                ${_toggle('email_on_application', 'Email on Application',
                  'Notify manager & HR when an employee submits a leave request', emailApp)}
                ${_toggle('email_on_approval', 'Email on Approval / Rejection',
                  'Notify employee & HR when a leave is approved or rejected', emailApproval)}
              </div>

              <!-- SMTP Config -->
              <div style="background:var(--surface2);border-radius:8px;padding:16px;margin-bottom:16px">
                <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
                            color:#0052cc;margin-bottom:14px">SMTP Configuration</div>

                <div class="grid-2" style="gap:10px;margin-bottom:10px">
                  <div class="form-group" style="margin:0">
                    <label class="form-label">SMTP Host</label>
                    <input class="form-control" id="s-smtp-host"
                      value="${settings.smtp_host||'smtp.gmail.com'}"
                      placeholder="smtp.gmail.com" />
                  </div>
                  <div class="form-group" style="margin:0">
                    <label class="form-label">SMTP Port</label>
                    <input class="form-control" id="s-smtp-port" type="number"
                      value="${settings.smtp_port||'587'}" placeholder="587" />
                  </div>
                  <div class="form-group" style="margin:0">
                    <label class="form-label">Email Address (sender)</label>
                    <input class="form-control" id="s-smtp-user" type="email"
                      value="${settings.smtp_user||''}"
                      placeholder="yourapp@gmail.com" />
                  </div>
                  <div class="form-group" style="margin:0">
                    <label class="form-label">App Password</label>
                    <input class="form-control" id="s-smtp-pass" type="password"
                      value="${settings.smtp_pass||''}"
                      placeholder="Gmail App Password" />
                  </div>
                  <div class="form-group" style="margin:0;grid-column:1/-1">
                    <label class="form-label">Display Name (From)</label>
                    <input class="form-control" id="s-smtp-name"
                      value="${settings.smtp_from_name||'LeaveFlow HR'}"
                      placeholder="LeaveFlow HR" />
                  </div>
                  <div class="form-group" style="margin:0;grid-column:1/-1">
                    <label class="form-label">🔗 Portal URL <span style="font-size:.72rem;color:var(--text3);font-weight:400">(used in email links)</span></label>
                    <input class="form-control" id="s-portal-url"
                      value="${settings.portal_url||'http://localhost:3000'}"
                      placeholder="http://localhost:3000 or https://hr.yourcompany.com" />
                  </div>
                </div>

                <!-- Gmail hint -->
                <div style="background:#e9f0ff;border-radius:6px;padding:10px 14px;
                            font-size:.78rem;color:#0052cc;line-height:1.7">
                  💡 <b>Gmail users:</b> Enable 2-Step Verification → go to
                  <b>Google Account → Security → App Passwords</b> → create one for "Mail" →
                  paste it above. Do <b>not</b> use your regular Gmail password.
                </div>
              </div>

              <!-- Action buttons -->
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-primary" id="btn-save-settings" ${saveLoading?'disabled':''}>
                  ${saveLoading ? '…Saving' : '💾 Save Settings'}
                </button>
                <button class="btn btn-ghost" id="btn-test-email" ${testLoading?'disabled':''}>
                  ${testLoading ? '…Sending' : '📨 Send Test Email'}
                </button>
              </div>
              <div id="settings-msg" style="margin-top:10px;font-size:.82rem"></div>
            </div>

          </div>
        </div>
      </div>`;

      // Company details save
      document.getElementById('btn-save-company').addEventListener('click', async () => {
        const btn = document.getElementById('btn-save-company');
        const msg = document.getElementById('company-msg');
        btn.disabled = true; btn.textContent = '…Saving';
        try {
          const token = localStorage.getItem('hr_token') || '';
          const payload = {
            company_name:       document.getElementById('s-co-name')?.value.trim(),
            company_address:    document.getElementById('s-co-addr')?.value.trim(),
            company_pan:        document.getElementById('s-co-pan')?.value.trim().toUpperCase(),
            company_pf_number:  document.getElementById('s-co-pf')?.value.trim(),
          };
          const res = await fetch('/api/users/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify(payload)
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error);
          msg.style.color = '#16a34a'; msg.textContent = '✅ Company details saved!';
        } catch(e) { msg.style.color = '#dc2626'; msg.textContent = '❌ ' + e.message; }
        btn.disabled = false; btn.textContent = '💾 Save Company Details';
        setTimeout(() => { if(msg) msg.textContent = ''; }, 3000);
      });

      // Toggle clicks
      container.querySelectorAll('[data-toggle-key]').forEach(el =>
        el.addEventListener('click', function () {
          const isOn = this.dataset.on === '1';
          this.dataset.on = isOn ? '0' : '1';
          this.style.background = isOn ? 'var(--border2)' : 'var(--primary)';
          this.children[0].style.left = isOn ? '3px' : '18px';
        })
      );

      // Save settings
      document.getElementById('btn-save-settings').addEventListener('click', async () => {
        saveLoading = true; render();
        const payload = {
          email_on_application: container.querySelector('[data-toggle-key="email_on_application"]')?.dataset.on === '1' ? 'true' : 'false',
          email_on_approval:    container.querySelector('[data-toggle-key="email_on_approval"]')?.dataset.on    === '1' ? 'true' : 'false',
          smtp_host:      document.getElementById('s-smtp-host')?.value.trim(),
          smtp_port:      document.getElementById('s-smtp-port')?.value.trim(),
          smtp_user:      document.getElementById('s-smtp-user')?.value.trim(),
          smtp_pass:      document.getElementById('s-smtp-pass')?.value,
          smtp_from_name: document.getElementById('s-smtp-name')?.value.trim(),
          portal_url:     document.getElementById('s-portal-url')?.value.trim(),
        };
        try {
          const token = localStorage.getItem('hr_token') || '';
          const res = await fetch('/api/users/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify(payload)
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error);
          toast.success('Settings saved!');
        } catch (e) { toast.error(e.message); }
        saveLoading = false; render();
      });

      // Test email
      document.getElementById('btn-test-email').addEventListener('click', async () => {
        testLoading = true; render();
        try {
          const token = localStorage.getItem('hr_token') || '';
          const res = await fetch('/api/users/settings/test-email', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error);
          toast.success(d.message);
        } catch (e) { toast.error(e.message); }
        testLoading = false; render();
      });

    } catch (e) {
      container.innerHTML = `<div style="color:#bf2600;padding:20px">${e.message}</div>`;
    }
  }

  function _toggle(key, label, desc, isOn) {
    return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;
                margin-bottom:16px;gap:14px">
      <div>
        <div style="font-size:.88rem;font-weight:600;color:var(--text)">${label}</div>
        <div style="font-size:.76rem;color:var(--text3);margin-top:2px">${desc}</div>
      </div>
      <div data-toggle-key="${key}" data-on="${isOn?'1':'0'}"
        style="width:38px;height:22px;border-radius:11px;flex-shrink:0;cursor:pointer;
               position:relative;transition:background .2s;margin-top:2px;
               background:${isOn?'var(--primary)':'var(--border2)'}">
        <div style="position:absolute;top:3px;left:${isOn?'18':'3'}px;width:16px;height:16px;
                    border-radius:50%;background:#fff;transition:left .2s;pointer-events:none"></div>
      </div>
    </div>`;
  }

  async function _loadSettings() {
    try {
      const token = localStorage.getItem('hr_token') || '';
      const res = await fetch('/api/users/settings', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) return {};
      return res.json();
    } catch { return {}; }
  }

  render();
}

