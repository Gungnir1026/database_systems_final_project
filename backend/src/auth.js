const { randomBytes } = require('node:crypto');
const { assert, text, number, password, hashPassword, verifyPassword, tokenHash, rows, transaction } = require('./helpers');
const COOKIE = 'scholarship_session';
const dummyHash = 'scrypt$00000000000000000000000000000000$' + '00'.repeat(64);
function sessionToken(req) {
  const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
function authRoutes(app, pool, config) {
  const attempts = new Map();
  const cleanup = setInterval(() => {
    for (const [key, value] of attempts) if (value.until < Date.now()) attempts.delete(key);
  }, 60_000);
  cleanup.unref();
  app.locals.disposeAuth = () => clearInterval(cleanup);
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/' };

  app.post('/api/register', async (req, res) => {
    const body = req.body;
    const account = text(body, 'account', 50, true);
    assert(/^[A-Za-z0-9_.-]+$/.test(account), 400, '帳號僅可使用英數字、底線、句點或連字號');
    const roleMap = { student: '學生', teacher: '老師', unit: '獎助單位' };
    assert(Object.hasOwn(roleMap, body.role), 400, '請選擇學生、老師或獎助單位');
    const name = text(body, 'name', 50, true);
    const phone = text(body, 'phone', 20);
    const email = text(body, 'email', 100);
    assert(!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'Email 格式錯誤');
    const hash = await hashPassword(password(body.password));
    // A role record and its login account always commit or roll back together.
    await transaction(pool, async db => {
      await rows(db, 'INSERT INTO Users (id, username, password_hash, phone_number, email, role) VALUES (?, ?, ?, ?, ?, ?)',
        [account, name, hash, phone, email, roleMap[body.role]]);
      if (body.role === 'student') {
        await rows(db, 'INSERT INTO Student (user_id, department, academic_year, student_number, bank_serial_number, bank_account) VALUES (?, ?, ?, ?, ?, ?)',
          [account, text(body, 'dept', 50, true), number(body.grade, 1, 8, '年級', true), text(body, 'stuID', 50, true), text(body, 'bankCode', 100), text(body, 'bankAcc', 100)]);
      } else if (body.role === 'teacher') {
        await rows(db, 'INSERT INTO Teacher (user_id, department) VALUES (?, ?)', [account, text(body, 'dept', 50, true)]);
      } else {
        await rows(db, 'INSERT INTO Scholarship_Provider (user_id, organization_name, contact_person) VALUES (?, ?, ?)',
          [account, text(body, 'dept_unit', 100, true), text(body, 'unitContact', 50, true)]);
      }
    });
    res.status(201).json({ success: true, message: '註冊成功！' });
  });
  app.post('/api/login', async (req, res) => {
    const key = req.ip;
    let limit = attempts.get(key);
    if (!limit || limit.until < Date.now()) limit = { count: 0, until: Date.now() + 15 * 60_000 };
    attempts.set(key, limit);
    assert(++limit.count <= 30, 429, '登入嘗試過多，請於 15 分鐘後再試');
    const username = text(req.body, 'username', 50, true);
    const users = await rows(pool, 'SELECT id, username, role, password_hash FROM Users WHERE id = ?', [username]);
    const user = users[0];
    const valid = await verifyPassword(req.body.password, user?.password_hash || dummyHash);
    assert(user && valid, 401, '帳號或密碼錯誤');
    const token = randomBytes(32).toString('hex');
    await transaction(pool, async db => {
      const oldToken = sessionToken(req);
      if (oldToken) await rows(db, 'DELETE FROM Sessions WHERE token_hash = ?', [tokenHash(oldToken)]);
      await rows(db, 'DELETE FROM Sessions WHERE expires_at <= NOW()');
      await rows(db, 'INSERT INTO Sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))', [tokenHash(token), user.id]);
    });
    res.cookie(COOKIE, token, { ...cookieOptions, maxAge: 8 * 60 * 60_000 });
    res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
  });
  app.post('/api/logout', async (req, res) => {
    const token = sessionToken(req);
    if (token) await rows(pool, 'DELETE FROM Sessions WHERE token_hash = ?', [tokenHash(token)]);
    res.clearCookie(COOKIE, cookieOptions).json({ success: true });
  });
  app.use('/api', async (req, res, next) => {
    const token = sessionToken(req);
    assert(token, 401, '請先登入');
    const users = await rows(pool, `SELECT u.id, u.username, u.role, t.teacher_id
      FROM Sessions s JOIN Users u ON s.user_id = u.id
      LEFT JOIN Teacher t ON t.user_id = u.id
      WHERE s.token_hash = ? AND s.expires_at > NOW()`, [tokenHash(token)]);
    assert(users.length, 401, '登入已過期，請重新登入');
    req.user = users[0];
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/me', (req, res) => res.json({ user: req.user }));
}
module.exports = { authRoutes };
