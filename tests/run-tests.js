// Minimal integration tests without external frameworks
// Runs the app on a test port with a temp SQLite file and asserts endpoints

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const TEST_DB = path.join(ROOT, 'data', 'test.sqlite');
const PORT = process.env.TEST_PORT || '6180';
const BASE = `http://localhost:${PORT}`;

function log(msg) { console.log(`[tests] ${msg}`); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const body = isJson ? await res.json() : await res.text();
  return { res, body };
}

async function waitForHealthy(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { res, body } = await fetchJson(`${BASE}/api/health`);
      if (res.ok && body && body.ok) return true;
    } catch { }
    await sleep(200);
  }
  return false;
}

async function run() {
  let failures = 0;

  // Clean test dbs
  const TEST_SUBMISSIONS_DB = path.join(ROOT, 'data', 'test-submissions.sqlite');
  try { fs.rmSync(TEST_DB, { force: true }); } catch { }
  try { fs.rmSync(TEST_SUBMISSIONS_DB, { force: true }); } catch { }
  fs.mkdirSync(path.dirname(TEST_DB), { recursive: true });

  log('Starting server...');
  const child = spawn(process.execPath, ['src/server/app.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT, DB_FILE: TEST_DB, SUBMISSIONS_DB_FILE: TEST_SUBMISSIONS_DB }
  });

  child.stdout.on('data', d => process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[app-err] ${d}`));

  // Ensure cleanup
  const stop = () => { try { child.kill(); } catch { } };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(1); });

  if (!(await waitForHealthy())) {
    console.error('Server did not become healthy in time');
    stop();
    process.exit(1);
  }
  log('Server healthy');

  // 1) Health endpoint
  try {
    const { res, body } = await fetchJson(`${BASE}/api/health`);
    if (!(res.ok && body?.ok === true)) throw new Error('health not ok');
    log('✓ health');
  } catch (e) { failures++; console.error('✗ health', e); }

  // 2) Create form (valid)
  let formId = null;
  const goodPayload = {
    title: 'Test Form',
    fields: [
      { id: 'f1', type: 'singleLine', label: 'Your Name', name: 'yourName', placeholder: 'Name', required: true },
      { id: 'f2', type: 'dropdown', label: 'Color', name: 'color', options: 'Red, Green, Blue' }
    ]
  };
  try {
    const { res, body } = await fetchJson(`${BASE}/api/forms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goodPayload)
    });
    if (!res.ok || !body?.ok) throw new Error(`create failed: ${res.status}`);
    formId = body?.form?.id;
    if (!formId) throw new Error('missing form id');
    log('✓ create form');
  } catch (e) { failures++; console.error('✗ create form', e); }

  // 3) Title uniqueness (prefer endpoint, fallback to 409 on duplicate create)
  try {
    const u = new URL(`${BASE}/api/forms/check-title`);
    u.searchParams.set('title', 'Test Form');
    const { res, body } = await fetchJson(u.toString());
    if (res.ok && body && body.unique === false) {
      log('✓ title uniqueness false after create');
    } else {
      // Fallback: server must reject duplicate create with 409
      const { res: res2 } = await fetchJson(`${BASE}/api/forms`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(goodPayload)
      });
      if (res2.status !== 409) throw new Error(`expected 409 on duplicate create, got ${res2.status}`);
      log('✓ duplicate title rejected (fallback check)');
    }
  } catch (e) { failures++; console.error('✗ title uniqueness check', e); }

  // 3b) Check-title endpoint exists for a new title
  try {
    const u2 = new URL(`${BASE}/api/forms/check-title`);
    u2.searchParams.set('title', 'Completely Unique Title 12345');
    const { res, body } = await fetchJson(u2.toString());
    if (!res.ok) throw new Error(`status ${res.status}`);
    if (typeof body.unique !== 'boolean') throw new Error('missing unique boolean');
    log('✓ check-title endpoint reachable');
  } catch (e) { failures++; console.error('✗ check-title endpoint', e); }

  // 4) Fetch form
  try {
    const { res, body } = await fetchJson(`${BASE}/api/forms/${formId}`);
    if (!res.ok || !body?.ok) throw new Error('get form failed');
    if ((body.form?.fields?.length || 0) !== 2) throw new Error('wrong field count');
    log('✓ read form');
  } catch (e) { failures++; console.error('✗ read form', e); }

  // 5) Validation: dropdown without options should fail
  try {
    const badPayload = {
      title: 'Bad Form',
      fields: [{ id: 'd1', type: 'dropdown', label: 'Pick', name: 'pick', options: '' }]
    };
    const { res } = await fetchJson(`${BASE}/api/forms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(badPayload)
    });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    log('✓ validation for option fields');
  } catch (e) { failures++; console.error('✗ validation test', e); }

  // 6) Update form title and fields
  try {
    const upd = {
      title: 'Test Form Updated',
      fields: [{ id: 'f1', type: 'singleLine', label: 'Your Name', name: 'yourName' }]
    };
    const { res, body } = await fetchJson(`${BASE}/api/forms/${formId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(upd)
    });
    if (!res.ok || !body?.ok) throw new Error('update failed');
    if (body.form?.title !== 'Test Form Updated') throw new Error('title not updated');
    if ((body.form?.fields?.length || 0) !== 1) throw new Error('fields not updated');
    log('✓ update form');
  } catch (e) { failures++; console.error('✗ update form', e); }

  // 7) Builder page render (smoke)
  try {
    const res = await fetch(`${BASE}/builder/${formId}`);
    const text = await res.text();
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    const mustHave = ['id="preview"', 'id="quickAddButtons"', 'id="formTitle"', 'id="saveBtn"'];
    if (!mustHave.every(t => text.includes(t))) throw new Error('missing expected elements');
    log('✓ builder page render');
  } catch (e) { failures++; console.error('✗ builder page render', e); }

  // 8) Hosted form render
  try {
    const res = await fetch(`${BASE}/f/${formId}`);
    const text = await res.text();
    if (res.status !== 200 || !(text.includes('Your Name') || text.includes('name="yourName"'))) {
      throw new Error('hosted form not rendered');
    }
    log('✓ hosted form render');
  } catch (e) { failures++; console.error('✗ hosted form render', e); }

  // 9) check-title with excludeId should be true when unchanged
  try {
    const u = new URL(`${BASE}/api/forms/check-title`);
    u.searchParams.set('title', 'Test Form Updated');
    u.searchParams.set('excludeId', formId);
    const { res, body } = await fetchJson(u.toString());
    if (!res.ok || body?.unique !== true) throw new Error('expected unique=true with excludeId');
    log('✓ title uniqueness respects excludeId');
  } catch (e) { failures++; console.error('✗ title excludeId check', e); }

  // 10) List forms contains our form
  try {
    const { res, body } = await fetchJson(`${BASE}/api/forms`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const hit = (body.forms || []).find(f => f.id === formId);
    if (!hit) throw new Error('form not in list');
    log('✓ list includes form');
  } catch (e) { failures++; console.error('✗ list forms', e); }

  // 11) Public submission stores consented copy
  try {
    const payload = {
      data: { yourName: 'Alex', color: 'Red' },
      storeConsent: true
    };
    const { res } = await fetchJson(`${BASE}/public/forms/${formId}/submissions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    // verify via models against the submissions DB file
    try {
      process.env.SUBMISSIONS_DB_FILE = TEST_SUBMISSIONS_DB; // ensure models use test submissions DB
      const { FormSubmission } = await import('../src/server/models/FormSubmission.js');
      const rows = await FormSubmission.findAll({ where: { formId } });
      if (!(rows && rows.length > 0)) throw new Error('no submission rows');
      log('✓ public submission stored in separate database');
    } catch (e) {
      throw e;
    }
  } catch (e) { failures++; console.error('✗ public submission', e); }

  // 12) Delete form; list no longer contains it
  try {
    const { res } = await fetchJson(`${BASE}/api/forms/${formId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`delete status ${res.status}`);
    const { res: resList, body: bodyList } = await fetchJson(`${BASE}/api/forms`);
    const hit = (bodyList.forms || []).find(f => f.id === formId);
    if (hit) throw new Error('form still present after delete');
    log('✓ delete form');
  } catch (e) { failures++; console.error('✗ delete form', e); }

  // Cleanup
  await sleep(100);
  child.kill();

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
