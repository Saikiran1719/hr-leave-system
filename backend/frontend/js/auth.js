// frontend/js/auth.js

function saveSession(token, user) {
  localStorage.setItem('hr_token', token);
  localStorage.setItem('hr_user',  JSON.stringify(user));
}
function clearSession() { localStorage.removeItem('hr_token'); localStorage.removeItem('hr_user'); }
function getUser()   { try { return JSON.parse(localStorage.getItem('hr_user')); } catch { return null; } }
function isLoggedIn(){ return !!(localStorage.getItem('hr_token') && getUser()); }

/* ── Login ────────────────────────────────────── */
function renderLogin() {
  document.getElementById('app').innerHTML = `
  <div class="auth-wrap">
    <div class="auth-box">
      <div class="auth-logo">
        <div class="icon">🏢</div>
        <h1>HRnova</h1>
        <p>HR Management System</p>
      </div>
      <div class="auth-card">
        <h2>Sign in to your account</h2>
        <div class="form-group">
          <label class="form-label">Employee ID</label>
          <input class="form-control" id="l-email" type="text" placeholder="e.g. 1200" />
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <div class="input-wrap">
            <input class="form-control" id="l-pw" type="password" value="" placeholder="Password" />
            <button class="input-eye" id="l-eye" type="button">👁</button>
          </div>
        </div>
        <div style="text-align:right;margin:-6px 0 14px">
          <button class="auth-link" id="l-forgot">Forgot password?</button>
        </div>
        <button class="btn btn-primary btn-full" id="l-btn">Sign In →</button>
        <div id="l-err" style="margin-top:9px;color:var(--danger);font-size:.82rem;display:none"></div>
        <div class="auth-demo">
            <b>Login Help</b>
            <p>• Use your Employee ID and password to sign in.</p>
            <p>• If you forgot your password, use the "Forgot Password" option.</p>
            <p>• For account access issues, contact the support team.</p>

            <p>📧 itsupport2@rajamane.com</p>
          </div>
      </div>
    </div>
  </div>`;

  document.getElementById('l-eye').onclick = function () {
    const f = document.getElementById('l-pw');
    f.type = f.type === 'password' ? 'text' : 'password';
    this.textContent = f.type === 'password' ? '👁' : '🙈';
  };
  document.getElementById('l-pw').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('l-btn').click();
  });
  document.getElementById('l-forgot').onclick = renderForgot;
  document.getElementById('l-btn').onclick = async () => {
    const email = document.getElementById('l-email').value.trim();
    const pw    = document.getElementById('l-pw').value;
    const errEl = document.getElementById('l-err');
    const btn   = document.getElementById('l-btn');
    if (!email || !pw) { errEl.style.display=''; errEl.textContent='Employee ID and password required'; return; }
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const r = await api.login(email, pw);
      saveSession(r.token, r.user);
      startApp();
    } catch (e) {
      errEl.style.display = ''; errEl.textContent = e.message;
      btn.disabled = false; btn.textContent = 'Sign In →';
    }
  };
}

/* ── Forgot Password ──────────────────────────── */
function renderForgot() {
  document.getElementById('app').innerHTML = `
  <div class="auth-wrap">
    <div class="auth-box">
      <div class="auth-logo"><div class="icon">🏢</div><h1>HRnova</h1></div>
      <div class="auth-card">
        <h2>Reset Password</h2>
        <p style="color:var(--text3);font-size:.84rem;margin-bottom:18px">Enter your work email to receive a reset token.</p>
        <div class="form-group">
          <label class="form-label">Work Email</label>
          <input class="form-control" id="f-email" type="email" placeholder="you@company.com" />
        </div>
        <button class="btn btn-primary btn-full" id="f-btn">Send Reset Token</button>
        <div id="f-msg" style="margin-top:9px;font-size:.82rem;display:none"></div>
        <button class="btn btn-ghost btn-full" style="margin-top:8px" id="f-back">← Back to Login</button>
      </div>
    </div>
  </div>`;
  document.getElementById('f-back').onclick = renderLogin;
  document.getElementById('f-btn').onclick = async () => {
    const email = document.getElementById('f-email').value.trim();
    const msgEl = document.getElementById('f-msg');
    const btn   = document.getElementById('f-btn');
    if (!email) { msgEl.style.display=''; msgEl.style.color='var(--danger)'; msgEl.textContent='Email required'; return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await api.forgotPw(email);
      // Show email sent confirmation — direct to reset form
      document.getElementById('app').innerHTML = `
      <div class="auth-wrap">
        <div class="auth-box">
          <div class="auth-logo" style="text-align:center;padding:8px 0 16px">
            <div style="font-size:3rem;margin-bottom:8px">📧</div>
            <h1 style="font-size:1.4rem;font-weight:800;color:var(--text)">HRnova</h1>
          </div>
          <div class="auth-card">
            <div style="text-align:center;margin-bottom:20px">
              <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;
                           display:flex;align-items:center;justify-content:center;
                           font-size:1.6rem;margin:0 auto 12px">✅</div>
              <h2 style="font-size:1.1rem;margin-bottom:6px">Check Your Email!</h2>
              <p style="font-size:.82rem;color:var(--text3);line-height:1.6">
                We sent a password reset token to<br/>
                <strong style="color:var(--text)">${email}</strong>
              </p>
            </div>
            <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;
                         padding:14px 16px;margin-bottom:16px">
              <div style="font-size:.72rem;font-weight:700;color:#1d4ed8;margin-bottom:6px;
                           text-transform:uppercase;letter-spacing:.04em">📋 Instructions</div>
              <ol style="font-size:.8rem;color:#1e40af;line-height:1.8;padding-left:18px;margin:0">
                <li>Open the email from HRnova</li>
                <li>Copy the <strong>Reset Token</strong></li>
                <li>Paste it below and set new password</li>
              </ol>
            </div>
            <div class="form-group">
              <label class="form-label" style="display:flex;justify-content:space-between">
                Reset Token
                <span style="font-size:.68rem;color:var(--text3)">From your email</span>
              </label>
              <div style="position:relative">
                <input class="form-control" id="r-token-inline"
                       placeholder="Paste token here e.g. 0733004e-3a05-49ea..."
                       style="padding-right:80px;font-family:monospace;font-size:.8rem"/>
                <button id="btn-paste-token"
                        style="position:absolute;right:6px;top:50%;transform:translateY(-50%);
                               background:#1a56db;color:#fff;border:none;border-radius:6px;
                               padding:4px 10px;font-size:.7rem;cursor:pointer;font-weight:700">
                  📋 Paste
                </button>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">New Password</label>
              <input class="form-control" id="r-pw-inline" type="password" placeholder="Min 6 characters"/>
            </div>
            <div class="form-group">
              <label class="form-label">Confirm Password</label>
              <input class="form-control" id="r-pw2-inline" type="password" placeholder="Repeat new password"/>
            </div>
            <button class="btn btn-primary btn-full" id="r-btn-inline">🔐 Reset Password</button>
            <div id="r-msg-inline" style="margin-top:9px;font-size:.82rem;display:none"></div>
            <div style="text-align:center;margin-top:12px">
              <button onclick="renderForgot()" style="background:none;border:none;color:var(--text3);
                font-size:.78rem;cursor:pointer">↩ Resend token</button>
              &nbsp;·&nbsp;
              <button onclick="renderLogin()" style="background:none;border:none;color:var(--text3);
                font-size:.78rem;cursor:pointer">← Back to Login</button>
            </div>
          </div>
        </div>
      </div>`;

      // Paste button
      document.getElementById('btn-paste-token').onclick = async () => {
        try {
          const text = await navigator.clipboard.readText();
          document.getElementById('r-token-inline').value = text.trim();
          document.getElementById('r-token-inline').focus();
        } catch(e) {
          document.getElementById('r-token-inline').focus();
          document.getElementById('r-token-inline').select();
        }
      };

      // Reset submit
      document.getElementById('r-btn-inline').onclick = async () => {
        const token = document.getElementById('r-token-inline').value.trim();
        const pw    = document.getElementById('r-pw-inline').value;
        const pw2   = document.getElementById('r-pw2-inline').value;
        const msgEl = document.getElementById('r-msg-inline');
        const btn   = document.getElementById('r-btn-inline');
        const show  = (msg, color='var(--danger)') => { msgEl.style.display=''; msgEl.style.color=color; msgEl.textContent=msg; };
        if (!token) return show('Please paste the token from your email');
        if (!pw)    return show('New password is required');
        if (pw !== pw2) return show('Passwords do not match');
        if (pw.length < 6) return show('Password must be at least 6 characters');
        btn.disabled=true; btn.textContent='Resetting…';
        try {
          await api.resetPw(token, pw);
          show('✅ Password reset successfully! Redirecting to login…','var(--success)');
          setTimeout(renderLogin, 1800);
        } catch(e) {
          show(e.message);
          btn.disabled=false; btn.textContent='🔐 Reset Password';
        }
      };

    } catch(e) {
      msgEl.style.display=''; msgEl.style.color='var(--danger)'; msgEl.textContent=e.message;
      btn.disabled=false; btn.textContent='Send Reset Token';
    }
  };
}

/* ── Reset Password ───────────────────────────── */
function renderReset(prefill='') {
  document.getElementById('app').innerHTML = `
   <div class="auth-wrap">
    <div class="auth-box">
      <div class="auth-logo"><div class="icon">🏢</div><h1>HRnova</h1></div>
      <div class="auth-card">
        <h2>Set New Password</h2>
        <div class="form-group">
          <label class="form-label">Reset Token</label>
          <input class="form-control" id="r-token" value="${prefill}" placeholder="Paste token from email" />
        </div>
        <div class="form-group">
          <label class="form-label">New Password</label>
          <input class="form-control" id="r-pw" type="password" placeholder="Min 6 characters" />
        </div>
        <div class="form-group">
          <label class="form-label">Confirm Password</label>
          <input class="form-control" id="r-pw2" type="password" placeholder="Confirm new password" />
        </div>
        <button class="btn btn-primary btn-full" id="r-btn">Reset Password</button>
        <div id="r-msg" style="margin-top:9px;font-size:.82rem;display:none"></div>
        <button class="btn btn-ghost btn-full" style="margin-top:8px" onclick="renderLogin()">← Back to Login</button>
      </div>
    </div>
  </div>`;
  document.getElementById('r-btn').onclick = async () => {
    const token = document.getElementById('r-token').value.trim();
    const pw    = document.getElementById('r-pw').value;
    const pw2   = document.getElementById('r-pw2').value;
    const msgEl = document.getElementById('r-msg');
    const btn   = document.getElementById('r-btn');
    if (!token || !pw) { msgEl.style.display=''; msgEl.style.color='var(--danger)'; msgEl.textContent='Token and password required'; return; }
    if (pw !== pw2)    { msgEl.style.display=''; msgEl.style.color='var(--danger)'; msgEl.textContent='Passwords do not match'; return; }
    if (pw.length < 6) { msgEl.style.display=''; msgEl.style.color='var(--danger)'; msgEl.textContent='Password min 6 characters'; return; }
    btn.disabled=true; btn.textContent='Resetting…';
    try {
      await api.resetPw(token, pw);
      msgEl.style.display=''; msgEl.style.color='var(--success)';
      msgEl.textContent='Password reset! Redirecting…';
      setTimeout(renderLogin, 1400);
    } catch (e) {
      msgEl.style.display=''; msgEl.style.color='var(--danger)'; msgEl.textContent=e.message;
      btn.disabled=false; btn.textContent='Reset Password';
    }
  };
}

window.isLoggedIn    = isLoggedIn;
window.getUser       = getUser;
window.clearSession  = clearSession;
window.renderLogin   = renderLogin;
window.renderForgot  = renderForgot;
window.renderReset   = renderReset;
