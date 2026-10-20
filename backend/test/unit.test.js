const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword, verifyPassword, password, scholarship, number } = require('../src/helpers');

test('password hashes use random salts and reject incorrect or malformed passwords', async () => {
  const first = await hashPassword('CorrectHorse42!');
  const second = await hashPassword('CorrectHorse42!');
  assert.notEqual(first, second);
  assert(!first.includes('CorrectHorse42!'));
  assert(await verifyPassword('CorrectHorse42!', first));
  assert.equal(await verifyPassword('incorrect', first), false);
  assert.equal(await verifyPassword('password', 'password'), false);
  assert.equal(await verifyPassword({}, first), false);
  assert.throws(() => password('short'), { status: 400 });
});
test('scholarship dates and numeric fields reject invalid inputs', () => {
  const input = { title: '獎學金', description: '', amount: '5000', start_date: '2028-02-28', end_date: '2028-02-29' };
  assert.equal(scholarship(input)[2], 5000);
  assert.throws(() => scholarship({ ...input, end_date: '2027-02-29' }), { status: 400 });
  assert.throws(() => scholarship({ ...input, end_date: '2028-01-01' }), { status: 400 });
  for (const value of ['', null, [], true, Infinity, -1, 101, 1.5]) assert.throws(() => number(value, 0, 100, '成績', true), { status: 400 });
});
test('HTML templates escape untrusted text and attribute values while composing safe markup', () => {
  const window = { fetch: async () => ({}) };
  const context = vm.createContext({ window, location: { pathname: '/login.html' }, document: { addEventListener() {} } });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../frontend/shared.js'), 'utf8'), context);
  const payload = `"'><img src=x onerror=alert(1)>`;
  assert.equal(String(window.html`<div data-x="${payload}">${payload}</div>`),
    '<div data-x="&quot;&#39;&gt;&lt;img src=x onerror=alert(1)&gt;">&quot;&#39;&gt;&lt;img src=x onerror=alert(1)&gt;</div>');
  const safe = window.html`<strong>${'<script>'}</strong>`;
  assert.equal(String(window.html`<div>${safe}</div>`), '<div><strong>&lt;script&gt;</strong></div>');
});
