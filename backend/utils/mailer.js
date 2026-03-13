// backend/utils/mailer.js
const nodemailer = require('nodemailer');
const { query }  = require('../config/db');

async function getSettings() {
  try {
    const r = await query('SELECT SettingKey, SettingValue FROM dbo.Settings');
    const m = {};
    r.recordset.forEach(row => { m[row.SettingKey] = row.SettingValue; });
    return m;
  } catch (e) {
    console.error('[mailer] Could not load settings:', e.message);
    return {};
  }
}

async function getTransporter() {
  const s = await getSettings();
  if (!s.smtp_user || !s.smtp_pass) return null;
  return nodemailer.createTransport({
    host:   s.smtp_host || 'smtp.gmail.com',
    port:   parseInt(s.smtp_port) || 587,
    secure: parseInt(s.smtp_port) === 465,
    auth:   { user: s.smtp_user, pass: s.smtp_pass },
    tls:    { rejectUnauthorized: false }
  });
}

async function sendMail({ to, subject, html }) {
  try {
    const transporter = await getTransporter();
    if (!transporter) { console.log('[mailer] SMTP not configured — skipping email to', to); return; }
    const s = await getSettings();
    await transporter.sendMail({
      from: `"${s.smtp_from_name || 'HRnova'}" <${s.smtp_user}>`,
      to, subject, html
    });
    console.log(`[mailer] Sent "${subject}" to ${to}`);
  } catch (e) {
    console.error(`[mailer] Failed to send to ${to}:`, e.message);
  }
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function badge(text, bg, color) {
  return `<span style="display:inline-block;background:${bg};color:${color};border-radius:4px;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase">${text}</span>`;
}

function baseTemplate({ headerColor='#1a3c6e', icon='🏢', title, subtitle, greeting, intro, fields=[], note, noteColor='#2563eb', noteBg='#eff6ff', footer, ctaUrl, ctaLabel }) {
  const year = new Date().getFullYear();

  let fieldRows = '';
  for (let i = 0; i < fields.length; i += 2) {
    const a = fields[i], b = fields[i + 1];
    const cell = (f) => f ? `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8faff;border-radius:8px;border:1px solid #e2e8f0">
        <tr><td style="padding:14px 16px">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">${f.label}</div>
          <div style="font-size:14px;font-weight:600;color:#1e293b;line-height:1.4">${f.value}</div>
        </td></tr>
      </table>` : '';

    fieldRows += `
      <tr>
        <td width="50%" style="padding:5px 6px 5px 0;vertical-align:top">${cell(a)}</td>
        <td width="50%" style="padding:5px 0 5px 6px;vertical-align:top">${cell(b)}</td>
      </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:40px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">

  <!-- HEADER -->
  <tr><td style="background:${headerColor};border-radius:12px 12px 0 0;padding:32px 36px 28px">
    <table cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:rgba(255,255,255,0.15);border-radius:10px;padding:10px 14px;font-size:26px;line-height:1">${icon}</td>
        <td style="padding-left:14px">
          <div style="font-size:18px;font-weight:800;color:#ffffff">HRnova</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px">Automated Notification &middot; Do not reply</div>
        </td>
      </tr>
    </table>
    <div style="margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.15)">
      <div style="font-size:21px;font-weight:700;color:#ffffff">${title}</div>
      ${subtitle ? `<div style="font-size:12px;color:rgba(255,255,255,0.65);margin-top:5px">${subtitle}</div>` : ''}
    </div>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:#ffffff;padding:32px 36px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
    <div style="font-size:15px;color:#1e293b;font-weight:600;margin-bottom:6px">${greeting}</div>
    <div style="font-size:13px;color:#64748b;line-height:1.7;margin-bottom:26px">${intro}</div>
    <div style="height:1px;background:#f1f5f9;margin-bottom:22px"></div>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">${fieldRows}</table>

    ${note ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px">
      <tr><td style="background:${noteBg};border-left:4px solid ${noteColor};border-radius:0 8px 8px 0;padding:14px 18px">
        <div style="font-size:10px;font-weight:700;color:${noteColor};text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Reason / Note</div>
        <div style="font-size:13px;color:#334155;line-height:1.6">${note}</div>
      </td></tr>
    </table>` : ''}

    ${ctaUrl ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">
      <tr><td align="center">
        <a href="${ctaUrl}" target="_blank"
           style="display:inline-block;background:${headerColor};color:#ffffff;text-decoration:none;
                  font-size:14px;font-weight:700;padding:14px 36px;border-radius:8px;
                  letter-spacing:0.3px">
          ${ctaLabel || '🔗 Open HR Portal'}
        </a>
        <div style="margin-top:8px;font-size:11px;color:#94a3b8">
          Or copy this link: <a href="${ctaUrl}" style="color:#6366f1">${ctaUrl}</a>
        </div>
      </td></tr>
    </table>` : ''}

    ${footer ? `<div style="margin-top:22px;padding-top:18px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;line-height:1.6">${footer}</div>` : ''}
  </td></tr>

  <!-- FOOTER BAR -->
  <tr><td style="background:#1e293b;border-radius:0 0 12px 12px;padding:16px 36px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-size:11px;color:#475569">&copy; ${year} HRnova System</td>
        <td align="right" style="font-size:11px;color:#475569">Automated message</td>
      </tr>
    </table>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// 1. Manager: new application
async function notifyManagerNewApplication({ managerEmail, managerName, employeeName, employeeCode,
  leaveType, fromDate, toDate, totalDays, reason, isHalfDay }) {
  const s = await getSettings();
  if (s.email_on_application !== 'true') return;
  const portalUrl = s.portal_url || 'http://localhost:3000';
  const html = baseTemplate({
    headerColor: '#1a3c6e', icon: '📋',
    title: 'New Leave Request', subtitle: 'Requires your approval',
    greeting: `Hello ${managerName},`,
    intro: `A new leave application has been submitted by <strong>${employeeName}</strong> and is awaiting your review.`,
    fields: [
      { label: 'Employee',   value: `${employeeName}${employeeCode ? ` &nbsp;<span style="color:#2563eb;font-family:monospace;font-size:12px">#${employeeCode}</span>` : ''}` },
      { label: 'Leave Type', value: leaveType },
      { label: 'From Date',  value: fmtDate(fromDate) },
      { label: 'To Date',    value: fmtDate(toDate) },
      { label: 'Duration',   value: `${totalDays} day${totalDays!==1?'s':''}${isHalfDay?' (Half Day)':''}` },
      { label: 'Status',     value: badge('Pending Approval','#fef3c7','#92400e') },
    ],
    note: reason || null,
    ctaUrl: `${portalUrl}`,
    ctaLabel: '✅ Review & Approve on Portal',
    footer: '🔔 Click the button above to log in and approve or reject this request.',
  });
  await sendMail({ to: managerEmail, subject: `📋 Leave Request — ${employeeName} · ${leaveType} · ${totalDays}d`, html });
}

// 2. HR: new application
async function notifyHRNewApplication({ hrEmails, employeeName, employeeCode,
  leaveType, fromDate, toDate, totalDays, reason, managerName }) {
  const s = await getSettings();
  if (s.email_on_application !== 'true') return;
  const portalUrl = s.portal_url || 'http://localhost:3000';
  const html = baseTemplate({
    headerColor: '#1a3c6e', icon: '📋',
    title: 'Leave Application Submitted', subtitle: 'For your attendance records',
    greeting: 'Hello HR Team,',
    intro: `A new leave application has been submitted. This is an informational notification for your records.`,
    fields: [
      { label: 'Employee',   value: `${employeeName}${employeeCode ? ` <span style="color:#2563eb;font-family:monospace;font-size:12px">#${employeeCode}</span>` : ''}` },
      { label: 'Leave Type', value: leaveType },
      { label: 'From Date',  value: fmtDate(fromDate) },
      { label: 'To Date',    value: fmtDate(toDate) },
      { label: 'Duration',   value: `${totalDays} day${totalDays!==1?'s':''}` },
      { label: 'Manager',    value: managerName || 'Not assigned' },
    ],
    note: reason || null,
    ctaUrl: `${portalUrl}`,
    ctaLabel: '📊 Open HR Portal',
  });
  for (const to of hrEmails) await sendMail({ to, subject: `[HR] New Leave — ${employeeName} · ${leaveType}`, html });
}

// 3. Employee: approved/rejected
async function notifyEmployeeStatusUpdate({ employeeEmail, employeeName,
  leaveType, fromDate, toDate, totalDays, status, approverName, comment, isHalfDay }) {
  const s = await getSettings();
  if (s.email_on_approval !== 'true') return;
  const isApproved = status === 'approved';
  const portalUrl  = s.portal_url || 'http://localhost:3000';
  const html = baseTemplate({
    headerColor: isApproved ? '#14532d' : '#7f1d1d',
    icon: isApproved ? '✅' : '❌',
    title: `Leave ${isApproved ? 'Approved' : 'Rejected'}`,
    subtitle: `Decision by ${approverName}`,
    greeting: `Hello ${employeeName},`,
    intro: isApproved
      ? `Great news! Your leave application has been <strong>approved</strong>. Please plan accordingly.`
      : `Your leave application has been <strong>rejected</strong> by ${approverName}. Please contact your manager if you have questions.`,
    fields: [
      { label: 'Leave Type',  value: leaveType },
      { label: 'Status',      value: isApproved ? badge('Approved','#dcfce7','#166534') : badge('Rejected','#fee2e2','#991b1b') },
      { label: 'From Date',   value: fmtDate(fromDate) },
      { label: 'To Date',     value: fmtDate(toDate) },
      { label: 'Duration',    value: `${totalDays} day${totalDays!==1?'s':''}${isHalfDay?' (Half Day)':''}` },
      { label: 'Reviewed By', value: approverName },
    ],
    note: comment || null,
    noteColor: isApproved ? '#15803d' : '#dc2626',
    noteBg:    isApproved ? '#f0fdf4' : '#fef2f2',
    ctaUrl:    `${portalUrl}`,
    ctaLabel:  '📋 View My Leaves on Portal',
    footer: '📊 Click above to log in and view your updated leave balance.',
  });
  await sendMail({
    to: employeeEmail,
    subject: `${isApproved?'✅':'❌'} Leave ${isApproved?'Approved':'Rejected'} — ${leaveType} · ${fmtDate(fromDate)}`,
    html,
  });
}

// 4. HR: approved/rejected notification
async function notifyHRStatusUpdate({ hrEmails, employeeName, employeeCode,
  leaveType, fromDate, toDate, totalDays, status, approverName, comment }) {
  const s = await getSettings();
  if (s.email_on_approval !== 'true') return;
  const isApproved = status === 'approved';
  const portalUrl  = s.portal_url || 'http://localhost:3000';
  const html = baseTemplate({
    headerColor: '#1a3c6e', icon: isApproved ? '✅' : '❌',
    title: `Leave ${isApproved ? 'Approved' : 'Rejected'}`, subtitle: 'For your attendance records',
    greeting: 'Hello HR Team,',
    intro: `A leave application has been <strong>${status}</strong> by ${approverName}. Please update attendance records accordingly.`,
    fields: [
      { label: 'Employee',    value: `${employeeName}${employeeCode ? ` <span style="color:#2563eb;font-family:monospace;font-size:12px">#${employeeCode}</span>` : ''}` },
      { label: 'Leave Type',  value: leaveType },
      { label: 'From Date',   value: fmtDate(fromDate) },
      { label: 'To Date',     value: fmtDate(toDate) },
      { label: 'Duration',    value: `${totalDays} day${totalDays!==1?'s':''}` },
      { label: 'Decision By', value: approverName },
      { label: 'Status',      value: isApproved ? badge('Approved','#dcfce7','#166534') : badge('Rejected','#fee2e2','#991b1b') },
    ],
    note: comment || null,
    noteColor: isApproved ? '#15803d' : '#dc2626',
    noteBg:    isApproved ? '#f0fdf4' : '#fef2f2',
    ctaUrl:    `${portalUrl}`,
    ctaLabel:  '📊 Open HR Portal',
  });
  for (const to of hrEmails) await sendMail({ to, subject: `[HR] Leave ${status} — ${employeeName} · ${leaveType}`, html });
}

module.exports = {
  notifyManagerNewApplication,
  notifyHRNewApplication,
  notifyEmployeeStatusUpdate,
  notifyHRStatusUpdate,
  getSettings,

  // ── Password reset email ─────────────────────────────────────
  sendResetEmail: async ({ to, name, token, portalUrl }) => {
    const s = await getSettings();
    const companyName = s.company_name || 'HRnova';
    const resetUrl = `${portalUrl}#reset-${token}`;
    return sendMail({
      to,
      subject: `🔑 Password Reset Request — ${companyName}`,
      html: baseTemplate({
        headerColor: '#1a3c6e',
        icon: '🔑',
        title: 'Reset Your Password',
        subtitle: 'You requested a password reset',
        greeting: `Hello ${name},`,
        intro: `We received a request to reset your password for your HRnova account. Use the token below on the Reset Password screen, or click the button.`,
        fields: [
          { label: '👤 Name',         value: name },
          { label: '📧 Email',        value: to },
          { label: '🔑 Reset Token',  value: `<span style="font-family:monospace;background:#f1f5f9;padding:4px 12px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:1px;color:#1a3c6e;word-break:break-all">${token}</span>` },
          { label: '⏰ Expires In',   value: '1 hour from now' },
        ],
        note: '⚠️ If you did not request a password reset, ignore this email. Your password will remain unchanged.',
        noteColor: '#92400e',
        noteBg:    '#fef9c3',
        ctaUrl:    `${portalUrl}`,
        ctaLabel:  '🔐 Go to Login Page',
        footer:    `This reset link expires in 1 hour. If you need help, contact your HR administrator.`,
      }),
    });
  },

  // ── Welcome email sent when HR creates a new employee ────────
  sendWelcomeEmail: async ({ employeeEmail, employeeName, employeeCode, password, role, portalUrl }) => {
    const s = await getSettings();
    const portal = portalUrl || s.portal_url || 'http://localhost:3000';
    const companyName = s.company_name || 'HRnova';

    return sendMail({
      to: employeeEmail,
      subject: `🎉 Welcome to ${companyName} — Your Login Credentials`,
      html: baseTemplate({
        headerColor: '#1a3c6e',
        icon: '🎉',
        title: `Welcome to ${companyName}!`,
        subtitle: 'Your HR portal account has been created',
        greeting: `Hello ${employeeName},`,
        intro: `We're excited to have you on board! Your employee account has been set up on the HRnova portal. Use the credentials below to sign in and get started.`,
        fields: [
          { label: '👤 Full Name',      value: employeeName },
          { label: '🪪 Employee ID',    value: employeeCode || '—' },
          { label: '📧 Login Email / ID', value: employeeCode || employeeEmail },
          { label: '🔑 Temporary Password', value: `<span style="font-family:monospace;background:#f1f5f9;padding:3px 10px;border-radius:5px;font-size:15px;font-weight:800;letter-spacing:2px;color:#1a3c6e">${password}</span>` },
          { label: '👔 Role',           value: role?.charAt(0).toUpperCase() + role?.slice(1) || '—' },
          { label: '🌐 Portal URL',     value: `<a href="${portal}" style="color:#2563eb">${portal}</a>` },
        ],
        note: '⚠️ Please change your password immediately after first login for security. Go to My Profile → Change Password.',
        noteColor: '#92400e',
        noteBg: '#fef9c3',
        ctaUrl: portal,
        ctaLabel: '🚀 Login to HR Portal',
        footer: `This email was sent by ${companyName} HR team. Please do not share your credentials with anyone.`,
      }),
    });
  },

  sendTestEmail: async (to) => sendMail({
    to,
    subject: '✅ LeaveFlow Email Test — SMTP Working!',
    html: baseTemplate({
      headerColor: '#1a3c6e', icon: '✅',
      title: 'Email Test Successful', subtitle: 'Your SMTP configuration is working',
      greeting: 'Hello,',
      intro: 'This is a test email from HRnova System. Your SMTP settings are configured correctly.',
      fields: [
        { label: 'Sent To', value: to },
        { label: 'Sent At', value: new Date().toLocaleString('en-IN') },
        { label: 'Status',  value: badge('Connected','#dcfce7','#166534') },
        { label: 'System',  value: 'HRnova' },
      ],
      footer: 'You can now enable email notifications from the HR Settings page.',
    }),
  }),
};
