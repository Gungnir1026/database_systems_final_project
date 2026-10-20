// Creates a randomly named, isolated database. Existing application data is never reset.
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../.env'), quiet: true });
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { createPool } = require('../src/database');
const { createApp } = require('../src/app');

test('four-role workflow against a real MySQL database', { timeout: 60_000 }, async t => {
  const connection = {
    host: process.env.TEST_DB_HOST || process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.TEST_DB_PORT || process.env.DB_PORT || 3307),
    user: process.env.TEST_DB_USER || 'root',
    password: process.env.TEST_DB_PASSWORD || process.env.MYSQL_ROOT_PASSWORD,
    charset: 'utf8mb4', dateStrings: true,
  };
  const adminDB = await mysql.createConnection(connection);
  const dbName = `Scholarship_Test_${randomBytes(8).toString('hex')}`;
  await adminDB.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  let pool, server, app;
  try {
    const initializer = await mysql.createConnection({ ...connection, database: dbName, multipleStatements: true });
    try {
      for (const file of ['schema.sql', 'seed.sql']) await initializer.query(await fs.readFile(path.resolve(__dirname, '../../database', file), 'utf8'));
    } finally { await initializer.end(); }
    pool = createPool({ ...connection, database: dbName });
    app = createApp(pool);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(cookie, route, method = 'GET', body, expected = 200, extraHeaders = {}) {
      const response = await fetch(base + route, { method, headers: { ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders }, body: body !== undefined ? JSON.stringify(body) : undefined });
      const data = await response.json();
      assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`);
      return { data, response };
    }
    async function login(username, pass = 'DemoPass123!') {
      const { data, response } = await request(null, '/api/login', 'POST', { username, password: pass });
      assert.equal(data.user.id, username);
      const setCookie = response.headers.get('set-cookie');
      assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=Strict/i);
      assert(!setCookie.includes(pass));
      return setCookie.split(';')[0];
    }
    let student, teacher, provider, admin, otherStudent, otherTeacher, otherProvider;
    let applicationId, scholarshipId, letterId;
    await t.test('health is public and private APIs reject anonymous users', async () => {
      await request(null, '/api/health');
      await request(null, '/api/admin/students', 'GET', undefined, 401);
      await request(null, '/api/login', 'POST', { username: '01', password: 'wrong' }, 401);
      await request(null, '/api/login', 'POST', { username: '01', password: {} }, 401);
    });
    await t.test('all four seeded roles can log in with HttpOnly sessions', async () => {
      student = await login('01'); teacher = await login('02'); provider = await login('03'); admin = await login('admin');
      otherStudent = await login('04'); otherTeacher = await login('06'); otherProvider = await login('07');
      assert.equal((await request(student, '/api/me')).data.user.role, '學生');
    });
    await t.test('every dashboard list and profile uses valid SQL and correct field names', async () => {
      for (const route of ['students', 'teachers', 'providers', 'applications', 'recommendations', 'closed-scholarships', 'scholarship-results/3']) {
        assert((await request(admin, `/api/admin/${route}`)).data.length > 0);
      }
      assert.equal((await request(student, '/api/student/profile/01')).data.student_number, 'DEMO-ST001');
      await request(teacher, '/api/teacher/profile/02'); await request(provider, '/api/provider/profile/03');
      await request(provider, '/api/provider-info/03'); await request(provider, '/api/provider/scholarships/03');
      await request(provider, '/api/provider/applications/03'); await request(student, '/api/student/applications/01');
      await request(student, '/api/scholarships'); await request(student, '/api/teachers'); await request(admin, '/api/providers');
      assert.equal((await request(teacher, '/api/teacher/applications/1')).data[0].student_number, 'DEMO-ST001');
    });
    await t.test('role checks and ownership prevent reading or changing other users data', async () => {
      await request(student, '/api/admin/students', 'GET', undefined, 403);
      await request(student, '/api/student/profile/04', 'GET', undefined, 403);
      await request(otherStudent, '/api/application-full-detail/1', 'GET', undefined, 403);
      await request(otherTeacher, '/api/recommendation/1', 'GET', undefined, 403);
      await request(otherProvider, '/api/applications/1/status', 'PUT', { status: '通過' }, 403);
      await request(student, '/api/announcements', 'POST', { title: 'forged', content: 'forged' }, 403);
      await request(student, '/api/student/apply', 'POST', { user_id: '04' }, 403);
      await request(student, '/api/teacher/profile/02', 'GET', undefined, 403);
    });
    const newStudent = { account: 'integration-student', name: 'Integration Student', password: 'NewStudent123!', role: 'student',
      dept: '資訊工程學系', grade: 2, stuID: 'TEST-ST-001', bankCode: '', bankAcc: '' };
    await t.test('registration creates each role atomically and rejects administrator self-registration', async () => {
      await request(null, '/api/register', 'POST', newStudent, 201);
      await request(null, '/api/register', 'POST', { account: 'integration-teacher', name: 'Integration Teacher', password: 'NewTeacher123!', role: 'teacher', dept: '資訊工程學系' }, 201);
      await request(null, '/api/register', 'POST', { account: 'integration-provider', name: 'Integration Provider', password: 'NewProvider123!', role: 'unit', dept_unit: '測試基金會', unitContact: '測試聯絡人' }, 201);
      await request(null, '/api/register', 'POST', { ...newStudent, account: 'forged-admin', role: 'admin' }, 400);
      await request(null, '/api/register', 'POST', { ...newStudent, account: 'rollback-student' }, 409);
      const [orphan] = await pool.query('SELECT id FROM Users WHERE id = ?', ['rollback-student']);
      assert.equal(orphan.length, 0);
      const [user] = await pool.query('SELECT password_hash FROM Users WHERE id = ?', [newStudent.account]);
      assert.match(user[0].password_hash, /^scrypt\$/);
      assert(!user[0].password_hash.includes(newStudent.password));
      assert.equal((await request(await login(newStudent.account, newStudent.password), `/api/student/profile/${newStudent.account}`)).data.student_number, 'TEST-ST-001');
    });
    await t.test('providers publish using their session identity and invalid dates are rejected', async () => {
      const data = { title: `Integration O'Neil <study>`, description: 'Test description', amount: 5000,
        start_date: '2020-01-01', end_date: '2099-12-31', provider_id: '07' };
      scholarshipId = (await request(provider, '/api/scholarships', 'POST', data, 201)).data.id;
      const [result] = await pool.query('SELECT provider_id FROM Scholarship WHERE Scholarship_NUMBER = ?', [scholarshipId]);
      assert.equal(result[0].provider_id, '03');
      await request(provider, '/api/scholarships', 'POST', { ...data, end_date: '2019-01-01' }, 400);
      await request(student, '/api/scholarships', 'POST', data, 403);
    });
    await t.test('students apply once per scholarship and cannot apply outside the date window', async () => {
      const body = { user_id: '04', scholarship_id: scholarshipId, teacher_id: 1, ranking: 7, grade: 88 };
      applicationId = (await request(otherStudent, '/api/student/apply', 'POST', body, 201)).data.id;
      await request(otherStudent, '/api/student/apply', 'POST', body, 409);
      await request(otherStudent, '/api/student/apply', 'POST', { ...body, scholarship_id: 3 }, 400);
      await request(otherStudent, '/api/student/apply', 'POST', { ...body, ranking: -1 }, 400);
      assert.equal((await request(otherStudent, `/api/application-full-detail/${applicationId}`)).data.student_number, 'DEMO-ST002');
    });
    await t.test('only the assigned teacher can create or edit the recommendation', async () => {
      await request(otherTeacher, '/api/teacher/recommendation', 'POST', { teacher_id: 2, application_id: applicationId, content: 'forged' }, 403);
      await request(teacher, '/api/teacher/recommendation', 'POST', { teacher_id: 1, application_id: applicationId, content: `推薦 O'Neil <student>` }, 201);
      const recommendation = (await request(teacher, `/api/teacher/recommendation/${applicationId}/1`)).data;
      assert(recommendation.exists); letterId = recommendation.letter.letter_id;
      await request(teacher, `/api/teacher/recommendation/${letterId}`, 'PUT', { content: 'Updated recommendation' });
      await request(otherTeacher, `/api/teacher/recommendation/${letterId}`, 'PUT', { content: 'forged' }, 403);
      await request(teacher, '/api/teacher/recommendation', 'POST', { teacher_id: 1, application_id: applicationId, content: 'duplicate' }, 409);
      assert.equal((await request(provider, `/api/recommendation/${applicationId}`)).data.content, 'Updated recommendation');
    });
    await t.test('provider review updates the student status and invalid states are rejected', async () => {
      await request(provider, `/api/applications/${applicationId}/status`, 'PUT', { status: '通過' });
      await request(student, `/api/applications/${applicationId}/status`, 'PUT', { status: '通過' }, 403);
      await request(provider, `/api/applications/${applicationId}/status`, 'PUT', { status: 'approved' }, 400);
      const data = (await request(otherStudent, '/api/student/applications/04')).data;
      assert.equal(data.find(a => a.application_id === applicationId).status, '通過');
    });
    await t.test('announcements derive the author from the administrator session', async () => {
      await request(admin, '/api/announcements', 'POST', { title: 'Integration results', content: 'Result content', admin_id: '01' }, 201);
      const item = (await request(student, '/api/announcements')).data[0];
      assert.equal(item.user_id, 'admin');
      await request(admin, `/api/admin/announcement/${item.Announcement_NUMBER}`, 'PUT', { title: 'Updated results', content: 'Updated content' });
      await request(admin, `/api/admin/announcement/${item.Announcement_NUMBER}`, 'DELETE');
    });
    await t.test('admin edits derive the account from the row, and conflicting changes roll back', async () => {
      const body = { username: 'Changed Student', email: 'changed@example.com', department: '測試系', student_number: 'TEST-CHANGED' };
      await request(admin, '/api/admin/student/1?userId=04', 'PUT', body);
      assert.equal((await request(student, '/api/student/profile/01')).data.username, 'Changed Student');
      await request(admin, '/api/admin/student/1', 'PUT', { ...body, username: 'Must Roll Back', student_number: 'DEMO-ST002' }, 409);
      assert.equal((await request(student, '/api/student/profile/01')).data.username, 'Changed Student');
      await request(admin, '/api/admin/teacher/1', 'PUT', { username: 'Updated Teacher', email: '', department: '測試系', job_title: '教授' });
      await request(admin, '/api/admin/provider/1', 'PUT', { email: '', phone: '', organization_name: 'Updated Foundation', contact_person: 'Test' });
      await request(admin, `/api/admin/scholarship/${scholarshipId}`, 'PUT', { title: 'Updated Scholarship', description: 'Test', scholarship_amount: 6000, application_start_date: '2020-01-01', application_deadline: '2099-12-31' });
    });
    await t.test('profile updates commit together and password changes revoke existing sessions', async () => {
      const account = newStudent.account;
      const cookie = await login(account, newStudent.password);
      const body = { username: 'Profile Changed', phone: '', email: '', department: '資訊工程學系', academic_year: 3, bank_account: '', bank_serial_number: '', password: 'ChangedPassword123!' };
      await request(cookie, `/api/student/profile/${account}`, 'PUT', body);
      await request(cookie, '/api/me', 'GET', undefined, 401);
      await request(null, '/api/login', 'POST', { username: account, password: newStudent.password }, 401);
      await login(account, body.password);
      await request(teacher, '/api/teacher/profile/02', 'PUT', { username: '林教授', phone: '', email: '', department: '資訊工程學系' });
      await request(provider, '/api/provider/profile/03', 'PUT', { phone: '', email: '', organization_name: '晨光基金會', contact_person: '展示聯絡人' });
    });
    await t.test('cross-origin writes and non-JSON requests are rejected', async () => {
      await request(admin, '/api/announcements', 'POST', { title: 'bad', content: 'bad' }, 403, { Origin: 'https://untrusted.example' });
      await request(admin, '/api/announcements', 'POST', { title: 'bad', content: 'bad' }, 415, { 'Content-Type': 'text/plain' });
    });
    await t.test('deleting scholarships cascades to applications and recommendations', async () => {
      await request(admin, `/api/admin/scholarship/${scholarshipId}`, 'DELETE');
      const [applications] = await pool.query('SELECT application_id FROM Application WHERE application_id = ?', [applicationId]);
      const [letters] = await pool.query('SELECT letter_id FROM Recommendation_Letter WHERE letter_id = ?', [letterId]);
      assert.equal(applications.length, 0); assert.equal(letters.length, 0);
      await request(admin, `/api/admin/scholarship/${scholarshipId}`, 'DELETE', undefined, 404);
    });
    await t.test('deleting an entity removes its own account despite forged query parameters', async () => {
      const [students] = await pool.query('SELECT student_id FROM Student WHERE user_id = ?', [newStudent.account]);
      await request(admin, `/api/admin/student/${students[0].student_id}?userId=admin`, 'DELETE');
      await request(admin, '/api/me');
      const [users] = await pool.query('SELECT id FROM Users WHERE id = ?', [newStudent.account]); assert.equal(users.length, 0);
      const [teachers] = await pool.query('SELECT teacher_id FROM Teacher WHERE user_id = ?', ['integration-teacher']);
      await request(admin, `/api/admin/teacher/${teachers[0].teacher_id}`, 'DELETE');
      const [providers] = await pool.query('SELECT provider_id FROM Scholarship_Provider WHERE user_id = ?', ['integration-provider']);
      await request(admin, `/api/admin/provider/${providers[0].provider_id}`, 'DELETE');
      await request(admin, '/api/admin/recommendation/1', 'DELETE');
      await request(admin, '/api/admin/application/1', 'DELETE');
    });
    await t.test('expired sessions and logged-out cookies no longer authorize requests', async () => {
      await pool.query('UPDATE Sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE user_id = ?', ['04']);
      await request(otherStudent, '/api/me', 'GET', undefined, 401);
      await request(student, '/api/logout', 'POST');
      await request(student, '/api/me', 'GET', undefined, 401);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (app) app.locals.disposeAuth();
    if (pool) await pool.end();
    await adminDB.query(`DROP DATABASE \`${dbName}\``);
    await adminDB.end();
  }
});
