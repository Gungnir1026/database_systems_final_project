const { randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(scryptCallback);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function assert(condition, status, message) {
  if (!condition) throw new HttpError(status, message);
}
function text(body, key, max = 100, required = false) {
  const value = body[key] ?? '';
  assert(typeof value === 'string', 400, `${key} 格式錯誤`);
  const result = value.trim();
  assert(result.length <= max && (!required || result.length > 0), 400, `${key} 長度不符或未填寫`);
  return result;
}
function number(value, min, max, label, integer = false) {
  assert((typeof value === 'string' && value.trim() !== '') || typeof value === 'number', 400, `${label} 必須是數字`);
  const n = Number(value);
  assert(Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n)), 400, `${label} 超出範圍`);
  return n;
}
function id(value) { return number(value, 1, 2147483647, 'ID', true); }
function password(value) {
  assert(typeof value === 'string' && value.length >= 8 && value.length <= 128, 400, '密碼須為 8–128 個字元');
  return value;
}
async function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(value, salt, 64);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
async function verifyPassword(value, stored) {
  if (typeof value !== 'string' || value.length > 128 || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored)) return false;
  const [, salt, expected] = stored.split('$');
  const hash = await scrypt(value, salt, 64);
  return timingSafeEqual(hash, Buffer.from(expected, 'hex'));
}
function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
async function rows(db, sql, params = []) { return (await db.query(sql, params))[0]; }
async function one(db, sql, params = [], message = '查無資料') {
  const result = await rows(db, sql, params);
  assert(result.length > 0, 404, message);
  return result[0];
}
async function transaction(pool, callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
function allow(req, ...roles) { assert(roles.includes(req.user.role), 403, '您沒有此功能的權限'); }
function owner(req, userId, role) {
  assert(req.user.role === role && req.user.id === userId, 403, '僅可存取自己的資料');
}
function date(value, label) {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 400, `${label} 格式須為 YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`);
  assert(!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, 400, `${label} 日期錯誤`);
  return value;
}
function scholarship(body, admin = false) {
  const start = date(body[admin ? 'application_start_date' : 'start_date'], '開始日');
  const end = date(body[admin ? 'application_deadline' : 'end_date'], '截止日');
  assert(start <= end, 400, '開始日不可晚於截止日');
  return [text(body, 'title', 200, true), text(body, 'description', 20000),
    number(body[admin ? 'scholarship_amount' : 'amount'], 0.01, 99999999.99, '金額'), start, end];
}
module.exports = { HttpError, assert, text, number, id, password, hashPassword, verifyPassword,
  tokenHash, rows, one, transaction, allow, owner, scholarship };
