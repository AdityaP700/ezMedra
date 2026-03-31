const fs = require('fs');
const path = require('path');

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:5000/api';

async function call(method, url, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch (_e) {
    payload = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    url,
    method,
    success: !!payload?.success,
    message: payload?.message || null,
    dataType: payload?.data ? typeof payload.data : null,
  };
}

async function login(email, password) {
  return call('POST', '/auth/login', null, { email, password });
}

(async () => {
  const report = {
    baseUrl: BASE,
    timestamp: new Date().toISOString(),
    checks: [],
    tokens: {},
  };

  function push(name, result) {
    report.checks.push({ name, ...result });
  }

  push('health', await call('GET', '/health'));

  const studentCandidates = [
    { email: 'student1@slms.com', password: 'student123' },
    { email: 'student@slms.com', password: 'student123' },
  ];
  const facultyCandidates = [
    { email: 'faculty1@slms.com', password: 'faculty123' },
    { email: 'faculty@slms.com', password: 'faculty123' },
  ];
  const adminCandidates = [
    { email: 'admin@slms.com', password: 'admin123' },
  ];

  async function tryLogins(role, candidates) {
    for (const c of candidates) {
      const r = await login(c.email, c.password);
      push(`${role}:login:${c.email}`, r);
      if (r.ok && r.success) {
        const raw = await fetch(`${BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(c),
        });
        const payload = await raw.json();
        return payload?.data?.token || null;
      }
    }
    return null;
  }

  report.tokens.student = await tryLogins('student', studentCandidates);
  report.tokens.faculty = await tryLogins('faculty', facultyCandidates);
  report.tokens.admin = await tryLogins('admin', adminCandidates);

  if (report.tokens.student) {
    push('student:profile', await call('GET', '/auth/profile', report.tokens.student));
    push('student:balance', await call('GET', '/leaves/balance', report.tokens.student));
    push('student:insights', await call('GET', '/leaves/insights', report.tokens.student));
    push('student:attendance-predict', await call('GET', '/academic/attendance/predict', report.tokens.student));
  }

  if (report.tokens.faculty) {
    push('faculty:profile', await call('GET', '/auth/profile', report.tokens.faculty));
    push('faculty:queue', await call('GET', '/faculty/leaves', report.tokens.faculty));
    push('faculty:slots', await call('GET', '/academic/slots', report.tokens.faculty));
    push('faculty:insights', await call('GET', '/academic/faculty/insights/me', report.tokens.faculty));
  }

  if (report.tokens.admin) {
    push('admin:profile', await call('GET', '/auth/profile', report.tokens.admin));
    push('admin:stats', await call('GET', '/admin/stats', report.tokens.admin));
    push('admin:queue', await call('GET', '/admin/leaves', report.tokens.admin));
    push('admin:holidays', await call('GET', '/admin/holidays', report.tokens.admin));
    push('admin:audit', await call('GET', '/admin/audit-logs?limit=5', report.tokens.admin));
  }

  const total = report.checks.length;
  const passed = report.checks.filter((c) => c.ok && c.success).length;
  report.summary = { total, passed, failed: total - passed };

  const outDir = path.join(__dirname, '..', 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'e2e-report.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`E2E smoke report written: ${outFile}`);
})();
