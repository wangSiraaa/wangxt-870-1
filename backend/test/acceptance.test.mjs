import http from 'http';
import fs from 'fs';

const BASE_URL = 'http://localhost:3002';
let passed = 0, failed = 0;
let token = '';
let userId = '';
let newAppID = '';
const key1 = 'test-idem001-' + Date.now();

function httpReq(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE_URL);
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      host: u.hostname,
      port: u.port,
      path: u.pathname,
    };
    const req = http.request(opts, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve({ status: r.statusCode, body: d.slice(0, 50000) }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(name, cond, extra = '') {
  if (cond) {
    console.log('✅  PASS ', name);
    passed++;
  } else {
    console.log('❌  FAIL ', name, '|', extra);
    failed++;
  }
}

(async () => {
  try {
    // 1. Login EMP001 (APPLICANT)
    const l1 = await httpReq('POST', '/api/auth/login', {}, { employeeCode: 'EMP001' });
    const l1j = JSON.parse(l1.body);
    assert('Case 1: Login EMP001 (APPLICANT)', l1.status === 200 && l1j.success && l1j.data.user.role === 'APPLICANT',
      `status=${l1.status} role=${l1j.data?.user?.role}`);
    token = l1j.data.token;
    userId = l1j.data.user.id;
    console.log('   Token prefix:', token.slice(0, 20) + '...');

    // 2. GET /api/transfers with Bearer
    const t2 = await httpReq('GET', '/api/transfers', { Authorization: `Bearer ${token}` });
    const t2j = JSON.parse(t2.body);
    assert('Case 2: GET transfers with Bearer -> 200', t2.status === 200 && t2j.success,
      `status=${t2.status} count=${t2j.data?.length} msg=${t2j.message || ''}`);

    // 3. Bearer + x-test-user-id(fake) -> MUST use JWT user, not the fake id
    const t3 = await httpReq('GET', '/api/users/me', {
      Authorization: `Bearer ${token}`,
      'x-test-user-id': 'fake-invalid-123456',
    });
    const t3j = JSON.parse(t3.body);
    assert('Case 3: Bearer priority over x-test-user-id (JWT user, not fake)',
      t3.status === 200 && t3j.success && t3j.data.id === userId,
      `returnedId=${t3j.data?.id} expectedId=${userId}`);

    // 4. POST /api/transfers (useTemplate:true) -> creates application + auto-generates checklist
    const seed = JSON.parse(fs.readFileSync('./prisma/seed-result.json', 'utf8'));
    const fromId = seed.users.APPLICANT.id;
    const toId = seed.users.RECEIVER.id;
    const t4Body = {
      title: 'REGRESSION TEST Application',
      fromEmployeeId: fromId,
      toEmployeeId: toId,
      effectiveDate: '2026-07-01',
      fromDepartment: 'Engineering',
      toDepartment: 'R&D',
      fromPosition: 'Junior Engineer',
      toPosition: 'Senior Engineer',
      useTemplate: true,
    };
    const t4 = await httpReq('POST', '/api/transfers',
      { Authorization: `Bearer ${token}`, 'x-idempotency-key': key1 }, t4Body);
    const t4j = JSON.parse(t4.body);
    assert('Case 4: Create transfer with template (checklistCount>0)',
      t4.status === 201 && t4j.success && t4j.data?.id && t4j.data?.checklistItems?.length > 0,
      `status=${t4.status} id=${t4j.data?.id} checklistItems=${t4j.data?.checklistItems?.length} msg=${t4j.message || t4j.error || ''}`);
    newAppID = t4j.data?.id || '';

    // 5. Optimistic lock: expectedVersion=999 -> 409 VERSION_MISMATCH
    const t5 = await httpReq('PUT', `/api/transfers/${newAppID}`,
      { Authorization: `Bearer ${token}` },
      { title: 'V2-edited', expectedVersion: 999 });
    assert('Case 5: Version mismatch (expectedVersion=999) -> 409',
      t5.status === 409, `status=${t5.status} body=${t5.body.slice(0, 80)}`);

    // 6. Idempotency: same idempotency key again -> returns same application ID
    const t6 = await httpReq('POST', '/api/transfers',
      { Authorization: `Bearer ${token}`, 'x-idempotency-key': key1 }, t4Body);
    const t6j = JSON.parse(t6.body);
    assert('Case 6: Idempotency (same ik) -> same ID',
      t6j.success && t6j.data?.id === newAppID,
      `status=${t6.status} success=${t6j.success} returnedId=${t6j.data?.id} expectedId=${newAppID}`);

    // 7. No auth at all -> 401 UNAUTHORIZED
    const t7 = await httpReq('GET', '/api/transfers');
    assert('Case 7: No auth at all -> 401', t7.status === 401, `status=${t7.status}`);

    // 8. x-test-user-id only (no Authorization) -> fallback DB direct lookup
    const t8 = await httpReq('GET', '/api/users/me', { 'x-test-user-id': userId });
    const t8j = JSON.parse(t8.body);
    assert('Case 8: x-test-user-id fallback (no Authorization) -> correct user',
      t8.status === 200 && t8j.success && t8j.data.id === userId,
      `returnedId=${t8j.data?.id} expectedId=${userId}`);

  } catch (e) {
    console.error('FATAL ERROR in test runner:', e);
    failed++;
  } finally {
    console.log('\n====== REGRESSION TEST RESULTS ======');
    console.log(`PASSED: ${passed}  |  FAILED: ${failed}`);
    if (failed > 0) process.exit(1);
  }
})();
