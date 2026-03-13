// ==============================================================
// HRnova — patch-24-face-attendance.js
// Face Attendance — kiosk, enroll, today log
// Lines 7367–7905 of original patch.js
// ==============================================================

// ================================================================
// FACE ATTENDANCE MODULE
// ================================================================

api.faceDescriptors = ()         => req('GET',  '/face/descriptors');
api.faceEnroll      = (d)        => req('POST', '/face/enroll', d);
api.faceDeleteEnroll= (uid)      => req('DELETE',`/face/enroll/${uid}`);
api.facePunch       = (d)        => req('POST', '/face/punch', d);
api.faceToday       = ()         => req('GET',  '/face/today');
api.faceEnrolled    = ()         => req('GET',  '/face/enrolled');

PAGES.hr = [...PAGES.hr, 'faceattendance'];
NAV.push({ id:'faceattendance', icon:'👤', label:'Face Attendance', group:'hr' });

const _origNavFace = window.navigate;
window.navigate = function(page) {
  const content = document.getElementById('main-content') || document.getElementById('page-content');
  if (page === 'faceattendance' && content) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page==='faceattendance'));
    renderFaceAttendance(content); return;
  }
  return _origNavFace(page);
};

// face-api.js models URL (CDN)
const FACE_API_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js';
const MODELS_URL   = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
let _faceApiLoaded = false;
let _modelsLoaded  = false;

async function loadFaceApi() {
  if (_faceApiLoaded) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = FACE_API_CDN; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  _faceApiLoaded = true;
}

async function loadModels() {
  if (_modelsLoaded) return;
  await loadFaceApi();
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
  ]);
  _modelsLoaded = true;
}

async function renderFaceAttendance(container) {
  const user = getUser();
  const isHR = user?.role === 'hr';
  let tab = 'kiosk';

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <h2 class="page-title" style="margin:0">👤 Face Attendance</h2>
      ${isHR ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="fa-tab btn btn-primary" data-tab="kiosk" style="font-size:.83rem">📷 Kiosk</button>
        <button class="fa-tab btn btn-secondary" data-tab="enroll" style="font-size:.83rem">➕ Enroll Faces</button>
        <button class="fa-tab btn btn-secondary" data-tab="today" style="font-size:.83rem">📊 Today's Log</button>
      </div>` : ''}
    </div>
    <div id="fa-content"></div>`;

  container.querySelectorAll('.fa-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      container.querySelectorAll('.fa-tab').forEach(b => {
        b.className = b.dataset.tab===tab ? 'fa-tab btn btn-primary' : 'fa-tab btn btn-secondary';
        b.style.fontSize = '.83rem';
      });
      loadFaceTab();
    });
  });

  async function loadFaceTab() {
    const el = document.getElementById('fa-content');
    if (!el) return;
    if (tab==='enroll') { await renderEnrollTab(el); return; }
    if (tab==='today')  { await renderTodayTab(el);  return; }
    await renderKioskTab(el);
  }
  loadFaceTab();
}

// ── KIOSK TAB ────────────────────────────────────────────────
async function renderKioskTab(el) {
  el.innerHTML = `
    <div style="max-width:560px;margin:0 auto">
      <!-- Status bar -->
      <div id="kiosk-status" style="background:#1a3c6e;color:#fff;border-radius:12px;
           padding:12px 20px;margin-bottom:16px;text-align:center;font-weight:700;font-size:.88rem">
        🔄 Loading face recognition models...
      </div>

      <!-- Camera -->
      <div style="position:relative;border-radius:16px;overflow:hidden;
                  background:#0f1117;border:2px solid #30363d;margin-bottom:16px">
        <video id="kiosk-video" autoplay muted playsinline
               style="width:100%;display:block;transform:scaleX(-1);max-height:420px;object-fit:cover"></video>
        <canvas id="kiosk-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;transform:scaleX(-1)"></canvas>

        <!-- Face frame guide -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                    width:200px;height:240px;border:3px dashed rgba(99,102,241,.5);
                    border-radius:50%;pointer-events:none"></div>

        <!-- Match result overlay -->
        <div id="kiosk-result" style="display:none;position:absolute;bottom:0;left:0;right:0;
             background:linear-gradient(to top,rgba(0,0,0,.9),transparent);
             padding:20px;text-align:center;color:#fff"></div>
      </div>

      <!-- Controls -->
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <button id="btn-punch-in" class="btn btn-primary"
                style="flex:1;background:linear-gradient(135deg,#16a34a,#15803d);border:none;
                       font-size:1rem;font-weight:800;padding:14px;border-radius:10px">
          👆 PUNCH IN
        </button>
        <button id="btn-punch-out" class="btn"
                style="flex:1;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;
                       border:none;font-size:1rem;font-weight:800;padding:14px;border-radius:10px">
          👇 PUNCH OUT
        </button>
      </div>

      <!-- Instructions -->
      <div style="background:#f8faff;border-radius:10px;padding:12px 16px;font-size:.78rem;color:#64748b;text-align:center">
        💡 Look directly at camera · Good lighting · Remove mask/glasses if not recognized
      </div>
    </div>`;

  const video    = document.getElementById('kiosk-video');
  const overlay  = document.getElementById('kiosk-overlay');
  const statusEl = document.getElementById('kiosk-status');
  const resultEl = document.getElementById('kiosk-result');
  let stream, faceMatcher, scanning = false;

  // Start camera
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'user', width:640, height:480 } });
    video.srcObject = stream;
  } catch(e) {
    statusEl.style.background='#dc2626';
    statusEl.textContent = '❌ Camera access denied. Please allow camera permissions.'; return;
  }

  // Load models + descriptors
  try {
    statusEl.textContent = '⏳ Loading AI models (first time may take 30s)...';
    await loadModels();

    statusEl.textContent = '⏳ Loading enrolled faces...';
    const r = await api.faceDescriptors();
    const faces = r?.faces || [];

    if (!faces.length) {
      statusEl.style.background = '#d97706';
      statusEl.textContent = '⚠️ No faces enrolled yet. Ask HR to enroll employees first.'; return;
    }

    // Build face matcher
    const labeledDescriptors = faces.map(f => {
      const desc = JSON.parse(f.Descriptor);
      return new faceapi.LabeledFaceDescriptors(
        String(f.UserID),
        [new Float32Array(desc)]
      );
    });
    faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5);
    // Store mapping uid → name
    window._faceMap = Object.fromEntries(faces.map(f => [String(f.UserID), { name: f.FullName, code: f.EmployeeCode }]));

    statusEl.style.background = '#16a34a';
    statusEl.textContent = `✅ Ready — ${faces.length} employees enrolled. Look at camera & punch.`;

    // Start live detection loop
    startLiveDetection(video, overlay, faceMatcher, resultEl);
  } catch(e) {
    statusEl.style.background='#dc2626';
    statusEl.textContent = '❌ Error: ' + e.message;
  }

  async function doPunch(punchType) {
    if (!faceMatcher || scanning) return;
    scanning = true;
    statusEl.style.background = '#6366f1';
    statusEl.textContent = `🔍 Scanning for ${punchType}...`;

    try {
      await video.play();
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        showResult('❌ No face detected. Please look at the camera.', '#dc2626');
        statusEl.style.background = '#16a34a';
        statusEl.textContent = '✅ Ready — Look at camera & punch.';
        scanning = false; return;
      }

      const match = faceMatcher.findBestMatch(detection.descriptor);
      if (match.label === 'unknown') {
        showResult('❌ Face not recognized. Please contact HR to enroll your face.', '#dc2626');
        statusEl.style.background = '#16a34a';
        statusEl.textContent = '✅ Ready — Look at camera & punch.';
        scanning = false; return;
      }

      const confidence = (1 - match.distance).toFixed(3);
      const emp = window._faceMap?.[match.label];

      // Capture snapshot
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width=160; snapCanvas.height=120;
      snapCanvas.getContext('2d').drawImage(video, 0,0,160,120);
      const photoBase64 = snapCanvas.toDataURL('image/jpeg',.6);

      // Send punch
      const punchR = await api.facePunch({
        userID: parseInt(match.label),
        punchType, confidence: parseFloat(confidence),
        photoBase64, deviceInfo: navigator.userAgent.slice(0,100)
      });

      const color = punchType==='IN' ? '#16a34a' : '#dc2626';
      const icon  = punchType==='IN' ? '✅' : '👋';
      showResult(
        `${icon} ${punchType==='IN'?'Good Morning':'Goodbye'}, <strong>${emp?.name||'Employee'}</strong>!<br/>
         <span style="font-size:.8rem;opacity:.8">${punchType} at ${new Date().toLocaleTimeString('en-IN')} · Match: ${Math.round(confidence*100)}%</span>`,
        color, photoBase64
      );
      statusEl.style.background = color;
      statusEl.textContent = `${icon} ${emp?.name} — Punch ${punchType} recorded!`;
      setTimeout(() => {
        statusEl.style.background='#16a34a';
        statusEl.textContent='✅ Ready — Look at camera & punch.';
        resultEl.style.display='none';
        scanning=false;
      }, 3500);

    } catch(e) {
      showResult('❌ Error: '+e.message,'#dc2626');
      statusEl.style.background='#16a34a';
      statusEl.textContent='✅ Ready.';
      scanning=false;
    }
  }

  function showResult(html, color, photo) {
    resultEl.style.display='';
    resultEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;justify-content:center">
        ${photo?`<img src="${photo}" style="width:48px;height:48px;border-radius:50%;border:2px solid ${color};object-fit:cover">`:''}
        <div style="font-size:.95rem;font-weight:700">${html}</div>
      </div>`;
  }

  document.getElementById('btn-punch-in').onclick  = () => doPunch('IN');
  document.getElementById('btn-punch-out').onclick = () => doPunch('OUT');

  // Cleanup on navigate away
  el._cleanup = () => {
    if (stream) stream.getTracks().forEach(t=>t.stop());
  };
}

function startLiveDetection(video, canvas, matcher, resultEl) {
  const ctx = canvas.getContext('2d');
  let running = true;

  async function detect() {
    if (!running || !document.getElementById('kiosk-video')) { running=false; return; }
    try {
      if (video.readyState===4) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.clearRect(0,0,canvas.width,canvas.height);

        const det = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
          .withFaceLandmarks();

        if (det) {
          const box = det.detection.box;
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth   = 3;
          ctx.strokeRect(box.x, box.y, box.width, box.height);
          // Draw landmarks
          faceapi.draw.drawFaceLandmarks(canvas, det);
        }
      }
    } catch(e) {}
    if (running) setTimeout(detect, 300);
  }
  detect();
}

// ── ENROLL TAB (HR) ────────────────────────────────────────────
async function renderEnrollTab(el) {
  el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3)">Loading...</div>`;
  try {
    const [enrolledR, usersR] = await Promise.all([
      api.faceEnrolled(),
      req('GET','/users')
    ]);
    const enrolled = enrolledR?.enrolled || [];
    const users    = Array.isArray(usersR) ? usersR : [];
    const enrolledIDs = new Set(enrolled.map(e=>e.UserID));

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:900px">

        <!-- Left: Camera enrollment -->
        <div>
          <div class="card">
            <div class="card-title" style="margin-bottom:14px">📷 Enroll New Face</div>
            <div class="form-group" style="margin-bottom:12px">
              <label class="form-label">Select Employee *</label>
              <select class="form-control" id="enroll-uid">
                <option value="">— Select Employee —</option>
                ${users.map(u=>`<option value="${u.UserID}">${u.FullName}${u.EmployeeCode?' (#'+u.EmployeeCode+')':''}${enrolledIDs.has(u.UserID)?' ✅':''}</option>`).join('')}
              </select>
            </div>
            <div style="position:relative;border-radius:10px;overflow:hidden;background:#0f1117;margin-bottom:10px">
              <video id="enroll-video" autoplay muted playsinline
                     style="width:100%;display:block;transform:scaleX(-1);max-height:280px;object-fit:cover"></video>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                          width:140px;height:170px;border:2px dashed rgba(99,102,241,.6);
                          border-radius:50%;pointer-events:none"></div>
            </div>
            <div id="enroll-status" style="text-align:center;font-size:.8rem;color:#6366f1;
                 margin-bottom:10px;font-weight:600">Loading camera...</div>
            <div style="display:flex;gap:8px">
              <button id="btn-capture" class="btn btn-primary"
                      style="flex:1;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;font-weight:700">
                📸 Capture & Enroll
              </button>
            </div>
            <div id="enroll-preview" style="margin-top:10px;display:none;text-align:center"></div>
          </div>
        </div>

        <!-- Right: Enrolled list -->
        <div>
          <div class="card">
            <div class="card-title" style="margin-bottom:14px">✅ Enrolled Employees (${enrolled.length})</div>
            <div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto">
              ${!enrolled.length ? `<div style="text-align:center;padding:30px;color:var(--text3)">No faces enrolled yet</div>` :
              enrolled.map(e=>`
                <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
                             background:var(--surface2);border-radius:8px">
                  ${e.PhotoBase64
                    ? `<img src="${e.PhotoBase64}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #6366f1">`
                    : `<div style="width:40px;height:40px;border-radius:50%;background:#6366f1;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.8rem">${e.FullName.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>`}
                  <div style="flex:1">
                    <div style="font-weight:700;font-size:.85rem">${e.FullName}</div>
                    <div style="font-size:.7rem;color:var(--text3)">Enrolled ${new Date(e.EnrolledAt).toLocaleDateString('en-IN')}</div>
                  </div>
                  <button class="btn-remove-face" data-uid="${e.UserID}"
                          style="background:#fee2e2;color:#dc2626;border:none;border-radius:6px;
                                 padding:4px 10px;font-size:.72rem;cursor:pointer;font-weight:600">
                    🗑 Remove
                  </button>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;

    // Start camera
    let enrollStream;
    try {
      enrollStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'user' } });
      document.getElementById('enroll-video').srcObject = enrollStream;
      document.getElementById('enroll-status').textContent = '✅ Camera ready — select employee and capture';
    } catch(e) {
      document.getElementById('enroll-status').textContent = '❌ Camera error: '+e.message;
    }

    document.getElementById('btn-capture').addEventListener('click', async () => {
      const uid = document.getElementById('enroll-uid').value;
      const statusEl = document.getElementById('enroll-status');
      if (!uid) { statusEl.textContent='⚠️ Please select an employee first'; return; }

      const btn = document.getElementById('btn-capture');
      btn.disabled=true; btn.textContent='⏳ Processing...';
      statusEl.textContent='Loading AI models...';

      try {
        await loadModels();
        statusEl.textContent='Detecting face...';
        const video = document.getElementById('enroll-video');
        const det = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({minConfidence:.5}))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!det) throw new Error('No face detected. Look directly at camera with good lighting.');

        // Capture snapshot
        const snap=document.createElement('canvas');
        snap.width=120;snap.height=120;
        snap.getContext('2d').drawImage(video,det.detection.box.x,det.detection.box.y,det.detection.box.width,det.detection.box.height,0,0,120,120);
        const photoBase64=snap.toDataURL('image/jpeg',.8);

        statusEl.textContent='Enrolling...';
        await api.faceEnroll({ userID:parseInt(uid), descriptor:Array.from(det.descriptor), photoBase64 });

        // Show preview
        const prev=document.getElementById('enroll-preview');
        prev.style.display='';
        prev.innerHTML=`<img src="${photoBase64}" style="width:60px;height:60px;border-radius:50%;border:3px solid #16a34a;object-fit:cover">
          <div style="color:#16a34a;font-weight:700;font-size:.82rem;margin-top:6px">✅ Face enrolled successfully!</div>`;

        statusEl.textContent='✅ Enrolled! Refreshing...';
        setTimeout(()=>renderEnrollTab(el),1500);
      } catch(e) {
        statusEl.textContent='❌ '+e.message;
        btn.disabled=false; btn.textContent='📸 Capture & Enroll';
      }
    });

    el.querySelectorAll('.btn-remove-face').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if(!confirm('Remove face enrollment for this employee?')) return;
        await api.faceDeleteEnroll(parseInt(btn.dataset.uid));
        renderEnrollTab(el);
      });
    });

    // Cleanup
    el._cleanup = ()=>{ if(enrollStream) enrollStream.getTracks().forEach(t=>t.stop()); };
  } catch(e) { el.innerHTML=`<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
}

// ── TODAY LOG TAB (HR) ────────────────────────────────────────
async function renderTodayTab(el) {
  el.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text3)">Loading...</div>`;
  try {
    const r = await api.faceToday();
    const summary = r?.summary || [];
    const punches  = r?.punches  || [];
    const inCount  = summary.filter(s=>s.lastPunch==='IN').length;
    const outCount = summary.filter(s=>s.lastPunch==='OUT').length;

    el.innerHTML=`
      <!-- Summary stats -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
        <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:2rem;font-weight:800;color:#16a34a">${inCount}</div>
          <div style="font-size:.72rem;color:#16a34a;font-weight:700;text-transform:uppercase">Currently In</div>
        </div>
        <div style="background:#fee2e2;border:1.5px solid #fca5a5;border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:2rem;font-weight:800;color:#dc2626">${outCount}</div>
          <div style="font-size:.72rem;color:#dc2626;font-weight:700;text-transform:uppercase">Checked Out</div>
        </div>
        <div style="background:#eef2ff;border:1.5px solid #a5b4fc;border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:2rem;font-weight:800;color:#6366f1">${punches.length}</div>
          <div style="font-size:.72rem;color:#6366f1;font-weight:700;text-transform:uppercase">Total Punches</div>
        </div>
      </div>

      <!-- Who's In grid -->
      ${inCount ? `
      <div style="margin-bottom:20px">
        <div style="font-weight:700;font-size:.88rem;color:var(--text2);margin-bottom:10px">🟢 Currently In Office</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${summary.filter(s=>s.lastPunch==='IN').map(s=>`
            <div style="display:flex;align-items:center;gap:8px;background:#dcfce7;border:1.5px solid #86efac;
                        border-radius:10px;padding:8px 14px">
              <div style="width:32px;height:32px;border-radius:50%;background:#16a34a;
                          display:flex;align-items:center;justify-content:center;
                          color:#fff;font-weight:700;font-size:.72rem">
                ${s.FullName.split(' ').map(w=>w[0]).join('').slice(0,2)}
              </div>
              <div>
                <div style="font-weight:700;font-size:.82rem;color:#15803d">${s.FullName}</div>
                <div style="font-size:.68rem;color:#16a34a">
                  In: ${new Date(s.lastTime).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Punch log -->
      <div style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;overflow:hidden">
        <div style="background:#f8faff;padding:12px 16px;font-weight:700;font-size:.83rem;border-bottom:1px solid #e2e8f0">
          📋 Today's Punch Log — ${new Date().toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'long'})}
          <button id="fa-refresh" style="float:right;background:#eef2ff;color:#6366f1;border:none;border-radius:5px;
            padding:3px 10px;font-size:.72rem;cursor:pointer;font-weight:700">🔄 Refresh</button>
        </div>
        ${!punches.length ? `<div style="text-align:center;padding:30px;color:var(--text3)">No punches recorded today</div>` : `
        <table style="width:100%;border-collapse:collapse;font-size:.82rem">
          <thead>
            <tr style="background:#f8faff">
              <th style="padding:10px 14px;text-align:left;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Employee</th>
              <th style="padding:10px 14px;text-align:center;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Type</th>
              <th style="padding:10px 14px;text-align:left;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Time</th>
              <th style="padding:10px 14px;text-align:center;color:var(--text3);font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Match %</th>
            </tr>
          </thead>
          <tbody>
            ${punches.map(p=>{
              const sc=p.PunchType==='IN'?'#16a34a':'#dc2626';
              const sb=p.PunchType==='IN'?'#dcfce7':'#fee2e2';
              return `<tr style="border-bottom:1px solid #f1f5f9">
                <td style="padding:10px 14px;font-weight:600">${p.FullName}
                  <span style="font-size:.7rem;color:var(--text3)">${p.DepartmentName||''}</span>
                </td>
                <td style="padding:10px 14px;text-align:center">
                  <span style="background:${sb};color:${sc};border-radius:20px;padding:3px 12px;
                               font-size:.72rem;font-weight:700">${p.PunchType}</span>
                </td>
                <td style="padding:10px 14px;font-family:monospace;font-size:.82rem">
                  ${new Date(p.PunchTime).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                </td>
                <td style="padding:10px 14px;text-align:center;font-weight:700;color:${sc}">
                  ${p.Confidence?Math.round(p.Confidence*100)+'%':'—'}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>`;

    document.getElementById('fa-refresh')?.addEventListener('click', ()=>renderTodayTab(el));
  } catch(e) { el.innerHTML=`<div style="color:#dc2626;padding:20px">Error: ${e.message}</div>`; }
}

console.log('👤 Face Attendance module loaded');
