// ==============================================================
// HRnova — patch-22-splash-screen.js
// Animated Splash Screen
// Lines 7070–7267 of original patch.js
// ==============================================================

// ================================================================
// ANIMATED SPLASH SCREEN
// ================================================================
(function() {
  // Only show splash on first load (not on sign-out)
  let _splashShown = false;

  const _origRenderLogin = window.renderLogin;
  window.renderLogin = function() {
    if (_splashShown) { _origRenderLogin(); return; }
    _splashShown = true;
    showSplash(() => _origRenderLogin());
  };

  function showSplash(onDone) {
    const app = document.getElementById('app');
    app.innerHTML = `
    <style>
      @keyframes fadeInUp   { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
      @keyframes fadeInDown { from{opacity:0;transform:translateY(-30px)} to{opacity:1;transform:translateY(0)} }
      @keyframes scaleIn    { from{opacity:0;transform:scale(.5)} to{opacity:1;transform:scale(1)} }
      @keyframes pulse      { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
      @keyframes shimmer    { 0%{background-position:-200% center} 100%{background-position:200% center} }
      @keyframes floatUp    { 0%{opacity:0;transform:translateY(60px) scale(.8)} 60%{opacity:1;transform:translateY(-8px) scale(1.02)} 100%{opacity:1;transform:translateY(0) scale(1)} }
      @keyframes ripple     { 0%{transform:scale(0);opacity:.6} 100%{transform:scale(4);opacity:0} }
      @keyframes spin360    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes barFill    { from{width:0} to{width:100%} }
      @keyframes countUp    { from{opacity:0;transform:scale(.5) rotate(-10deg)} to{opacity:1;transform:scale(1) rotate(0deg)} }
      @keyframes particles  { 0%{transform:translateY(0) translateX(0);opacity:1} 100%{transform:translateY(-120px) translateX(var(--dx));opacity:0} }
      @keyframes glowPulse  { 0%,100%{box-shadow:0 0 40px rgba(99,102,241,.4)} 50%{box-shadow:0 0 80px rgba(99,102,241,.8),0 0 120px rgba(37,99,235,.4)} }

      #splash-wrap {
        position:fixed;inset:0;z-index:99999;
        background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 40%,#1a3c6e 100%);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        overflow:hidden;
      }
      .splash-bg-orb {
        position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none;
      }
      .splash-logo-ring {
        width:120px;height:120px;border-radius:28px;
        background:linear-gradient(135deg,#6366f1,#2563eb,#0ea5e9);
        display:flex;align-items:center;justify-content:center;
        animation:floatUp .8s cubic-bezier(.34,1.56,.64,1) both, glowPulse 2s 1s infinite;
        position:relative;z-index:2;margin-bottom:28px;flex-shrink:0;
      }
      .splash-logo-ring::before {
        content:'';position:absolute;inset:-3px;border-radius:31px;
        background:linear-gradient(135deg,#a5b4fc,#60a5fa,#38bdf8);
        z-index:-1;animation:spin360 3s linear infinite;
        background-size:200% 200%;
      }
      .splash-icon { font-size:3.2rem; filter:drop-shadow(0 4px 12px rgba(0,0,0,.4)); }
      .splash-brand {
        font-size:2.4rem;font-weight:900;color:#fff;letter-spacing:-1px;
        animation:fadeInUp .7s .4s both;
        background:linear-gradient(135deg,#fff 0%,#a5b4fc 50%,#60a5fa 100%);
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;
        background-clip:text;
      }
      .splash-sub {
        font-size:1rem;color:rgba(255,255,255,.6);margin-top:8px;
        animation:fadeInUp .7s .6s both;letter-spacing:.05em;
      }
      .splash-features {
        display:flex;gap:16px;margin-top:36px;flex-wrap:wrap;justify-content:center;
        animation:fadeInUp .7s .8s both;
      }
      .splash-feat {
        background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);
        border-radius:12px;padding:10px 16px;display:flex;align-items:center;gap:8px;
        font-size:.8rem;color:rgba(255,255,255,.8);font-weight:600;
        backdrop-filter:blur(10px);
      }
      .splash-loader {
        margin-top:40px;width:220px;animation:fadeInUp .7s 1s both;
      }
      .splash-loader-track {
        height:4px;background:rgba(255,255,255,.12);border-radius:20px;overflow:hidden;
      }
      .splash-loader-bar {
        height:100%;border-radius:20px;
        background:linear-gradient(90deg,#6366f1,#2563eb,#0ea5e9,#6366f1);
        background-size:200% 100%;
        animation:barFill 2s cubic-bezier(.4,0,.2,1) .8s both, shimmer 1.5s linear infinite;
      }
      .splash-loader-text {
        text-align:center;font-size:.72rem;color:rgba(255,255,255,.5);
        margin-top:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
      }
      .splash-version {
        position:absolute;bottom:24px;font-size:.7rem;color:rgba(255,255,255,.25);
        animation:fadeInUp .5s 1.2s both;
      }
    </style>

    <div id="splash-wrap">
      <!-- Ambient orbs -->
      <div class="splash-bg-orb" style="width:500px;height:500px;background:rgba(99,102,241,.15);top:-100px;left:-150px"></div>
      <div class="splash-bg-orb" style="width:400px;height:400px;background:rgba(37,99,235,.12);bottom:-80px;right:-100px"></div>
      <div class="splash-bg-orb" style="width:300px;height:300px;background:rgba(14,165,233,.1);top:40%;left:60%"></div>

      <!-- Floating particles -->
      <canvas id="splash-canvas" style="position:absolute;inset:0;pointer-events:none"></canvas>

       <!-- Logo -->
      <div class="splash-logo-ring">
        <span class="splash-icon">🏢</span>
      </div>

      <!-- Brand -->
      <div class="splash-brand" id="splash-brand">HRnova</div>
      <div class="splash-sub">Complete HR Management System</div>

      <!-- Feature pills -->
      <div class="splash-features">
        <div class="splash-feat" style="animation-delay:.85s;animation:fadeInUp .5s .85s both">📋 Leave Management</div>
        <div class="splash-feat" style="animation:fadeInUp .5s .95s both">💰 Payroll</div>
        <div class="splash-feat" style="animation:fadeInUp .5s 1.05s both">⭐ Performance</div>
        <div class="splash-feat" style="animation:fadeInUp .5s 1.15s both">📦 Assets</div>
      </div>

      <!-- Loader -->
      <div class="splash-loader">
        <div class="splash-loader-track">
          <div class="splash-loader-bar" id="splash-bar"></div>
        </div>
        <div class="splash-loader-text" id="splash-msg">Initializing...</div>
      </div>

      <div class="splash-version">v2.0 · Powered by HRnova</div>
    </div>`;

    // Animated loading messages
    const msgs = ['Initializing...','Loading modules...','Connecting to server...','Preparing dashboard...','Almost ready...'];
    let mi = 0;
    const msgEl = document.getElementById('splash-msg');
    const msgTimer = setInterval(() => {
      mi = (mi+1) % msgs.length;
      if (msgEl) msgEl.textContent = msgs[mi];
    }, 400);

    // Particle canvas
    initSplashParticles();

    // After 2.2s — fade out and show login
    setTimeout(() => {
      clearInterval(msgTimer);
      const wrap = document.getElementById('splash-wrap');
      if (wrap) {
        wrap.style.transition = 'opacity .5s ease, transform .5s ease';
        wrap.style.opacity = '0';
        wrap.style.transform = 'scale(1.05)';
        setTimeout(() => { if (onDone) onDone(); }, 500);
      } else { if (onDone) onDone(); }
    }, 2400);
  }

  function initSplashParticles() {
    const canvas = document.getElementById('splash-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = Array.from({length: 60}, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2.5 + .5,
      dx: (Math.random()-.5) * .6,
      dy: -(Math.random() * .8 + .3),
      opacity: Math.random() * .5 + .1,
      color: ['#6366f1','#2563eb','#0ea5e9','#a5b4fc','#60a5fa'][Math.floor(Math.random()*5)]
    }));

    let raf;
    function draw() {
      if (!document.getElementById('splash-wrap')) { cancelAnimationFrame(raf); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();
        p.x += p.dx; p.y += p.dy;
        if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random()*canvas.width; }
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }
    draw();
  }
})();

console.log('✨ Splash screen loaded');

