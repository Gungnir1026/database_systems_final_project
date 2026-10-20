const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:3000';
const screenshots = path.resolve(__dirname, '../../docs/screenshots');

test('four-role browser navigation and safe editing', { timeout: 120_000 }, async t => {
  await fs.mkdir(screenshots, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const role of [
      { name: '學生', account: '01', home: 'stu_index.html', shot: 'student', target: 'stu_scholarships.html' },
      { name: '教師', account: '02', home: 'teacher_index.html', shot: 'teacher', target: 'teacher_applications.html' },
      { name: '獎助單位', account: '03', home: 'provider_index.html', shot: 'provider', target: 'provider_applications.html' },
      { name: '管理員', account: 'admin', home: 'admin_index.html', shot: 'admin', target: 'admin_welcome.html' },
    ]) {
      await t.test(`${role.name}: login, all menu pages, screenshot, logout`, async () => {
        const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
          if (response.url().includes('/api/') && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
        });
        try {
          await page.goto(base);
          if (role.account === '01') await page.screenshot({ path: path.join(screenshots, 'login.png'), fullPage: true });
          await page.getByRole('button', { name: role.name, exact: true }).click();
          assert.equal(await page.getByLabel('帳號', { exact: true }).inputValue(), role.account);
          await page.getByRole('button', { name: '登入', exact: true }).click();
          await page.waitForURL(`**/${role.home}`);
          await page.waitForLoadState('networkidle');
          const menu = await page.locator('aside a').evaluateAll(links => links.map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })));
          assert(menu.length >= 4);
          for (const link of menu) {
            await page.getByRole('link', { name: link.text, exact: true }).click();
            const frame = page.frame({ name: 'content-frame' });
            await frame.waitForURL(`**/${link.href}`);
            await frame.waitForLoadState('networkidle');
            await frame.locator('h1, h2').first().waitFor({ state: 'visible', timeout: 10_000 });
            assert.equal(await frame.getByText('載入失敗', { exact: true }).count(), 0, link.href);
            if (link.href === 'stu_profile.html') assert.equal(await frame.getByLabel('學號 (不可修改)').inputValue(), 'DEMO-ST001');
            if (link.href === 'teacher_applications.html') {
              const cells = frame.getByText('DEMO-ST001', { exact: true });
              assert(await cells.count() >= 1);
              assert(await cells.first().isVisible());
            }
            if (link.href === 'admin_results.html') {
              await frame.locator('#scholarshipSelect').selectOption('3');
              await frame.getByRole('button', { name: '📢 產生公告內容', exact: true }).click();
              assert.match(await frame.locator('#previewContent').innerText(), /通過名單/);
              await page.screenshot({ path: path.join(screenshots, 'results.png'), fullPage: true });
            }
          }
          if (role.account === 'admin') {
            await page.getByRole('link', { name: menu.find(x => x.href === 'admin_announcements.html').text, exact: true }).click();
            const frame = page.frame({ name: 'content-frame' });
            await frame.waitForLoadState('networkidle');
            const content = `O'Neil <img src=x onerror="window.injected=true"> & "demo"`;
            const created = await context.request.post(`${base}/api/announcements`, { data: { title: content, content } });
            assert.equal(created.status(), 201);
            const items = await (await context.request.get(`${base}/api/announcements`)).json();
            const item = items.find(a => a.TITLE === content);
            try {
              await frame.goto(`${base}/admin_announcements.html`);
              await frame.waitForLoadState('networkidle');
              const row = frame.locator('tr').filter({ has: frame.getByText(content, { exact: true }) });
              assert.equal(await row.count(), 1);
              assert.equal(await frame.locator('img').count(), 0);
              await row.getByRole('button', { name: '編輯', exact: true }).click();
              assert.equal(await frame.locator('#editTitle').inputValue(), content);
              await frame.locator('#editModal .close').click();
            } finally { await context.request.delete(`${base}/api/admin/announcement/${item.Announcement_NUMBER}`); }
          }
          const target = menu.find(x => x.href === role.target);
          await page.getByRole('link', { name: target.text, exact: true }).click();
          const frame = page.frame({ name: 'content-frame' });
          await frame.waitForURL(`**/${role.target}`);
          await frame.waitForLoadState('networkidle');
          if (role.account === '03') {
            await frame.getByRole('link', { name: '查看詳情', exact: true }).click();
            await frame.waitForURL('**/application_data.html?app_id=1');
            await frame.getByText('DEMO-ST001', { exact: true }).waitFor({ state: 'visible' });
            await frame.getByRole('link', { name: '✉️ 查看指導老師推薦信', exact: true }).click();
            await frame.waitForURL('**/recommendation_letter.html?app_id=1');
            await frame.locator('.letter-content').waitFor({ state: 'visible' });
            assert.match(await frame.locator('.letter-content').innerText(), /此為展示推薦信/);
            await page.getByRole('link', { name: target.text, exact: true }).click();
            await frame.waitForURL(`**/${role.target}`);
            await frame.waitForLoadState('networkidle');
          }
          await page.mouse.move(1400, 20);
          await page.screenshot({ path: path.join(screenshots, `${role.shot}.png`), fullPage: true });
          assert.deepEqual(errors, []);
          await page.getByRole('button', { name: '登出', exact: true }).click();
          await page.waitForURL('**/login.html');
          assert.equal((await context.request.get(`${base}/api/me`)).status(), 401);
        } catch (error) {
          await page.screenshot({ path: path.join(require('node:os').tmpdir(), `scholarship-${role.shot}-failure.png`), fullPage: true }).catch(() => {});
          throw error;
        } finally { await context.close(); }
      });
    }
    await t.test('login remains usable at a mobile viewport', async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(base);
      assert(await page.getByRole('button', { name: '登入', exact: true }).isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.close();
    });
  } finally { await browser.close(); }
});
