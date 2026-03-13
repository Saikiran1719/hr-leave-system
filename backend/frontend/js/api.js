// frontend/js/api.js — centralised HTTP client
const BASE = '/api';

function token() { return localStorage.getItem('hr_token') || ''; }

async function req(method, path, body, isForm) {
  const headers = { Authorization: `Bearer ${token()}` };
  if (!isForm) headers['Content-Type'] = 'application/json';
  const opts = { method, headers };
  if (body) opts.body = isForm ? body : JSON.stringify(body);
  const res  = await fetch(BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/';
    return;
  }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

const api = {
  // Auth
  login:         (email, password)     => req('POST', '/auth/login',           { email, password }),
  forgotPw:      (email)               => req('POST', '/auth/forgot-password', { email }),
  resetPw:       (token, newPassword)  => req('POST', '/auth/reset-password',  { token, newPassword }),
  changePw:      (currentPassword, newPassword) => req('POST', '/auth/change-password', { currentPassword, newPassword }),

  // Leaves
  leaveTypes:    ()              => req('GET',  '/leaves/types'),
  myBalance:     (year)          => req('GET',  `/leaves/balance${year?'?year='+year:''}`),
  userBalance:   (uid, year)     => req('GET',  `/leaves/balance?userID=${uid}${year?'&year='+year:''}`),
  myLeaves:      (status, year)  => req('GET',  '/leaves/my'  + qs({ status, year })),
  applyLeave:    (fd)            => req('POST', '/leaves/apply', fd, true),
  cancelLeave:   (id)            => req('PATCH',`/leaves/${id}/cancel`),
  pendingLeaves: ()              => req('GET',  '/leaves/pending'),
  allLeaves:     (p)             => req('GET',  '/leaves/all'  + qs(p)),
  updateStatus:  (id, status, comment) => req('PATCH', `/leaves/${id}/status`, { status, comment }),
  calendar:      (month, year)   => req('GET',  `/leaves/calendar?month=${month}&year=${year}`),
  holidays:      (year)          => req('GET',  `/leaves/holidays?year=${year||new Date().getFullYear()}`),

  // Users
  me:            ()              => req('GET',  '/users/me'),
  updateMe:      (d)             => req('PATCH','/users/me', d),
  users:         (p)             => req('GET',  '/users'    + qs(p)),
  addUser:       (d)             => req('POST', '/users',    d),
  updateUser:    (id, d)         => req('PATCH',`/users/${id}`, d),
  departments:   ()              => req('GET',  '/users/departments'),
  userBalance2:  (id, year)      => req('GET',  `/users/${id}/balance${year?'?year='+year:''}`),
  updateBalance: (id, d)         => req('PATCH',`/users/${id}/balance`, d),
  notifications: ()              => req('GET',  '/users/notifications'),
  markRead:      ()              => req('PATCH','/users/notifications/read'),
  reports:       (year)          => req('GET',  `/users/reports${year?'?year='+year:''}`),
};

function qs(p) {
  if (!p) return '';
  const s = Object.entries(p).filter(([,v])=>v!=null&&v!=='').map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&');
  return s ? '?' + s : '';
}

window.api = api;
