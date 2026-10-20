const express = require('express');
const path = require('node:path');
const { authRoutes } = require('./auth');
const { assert, text, number, id, password, hashPassword, rows, one, transaction, allow, owner, scholarship } = require('./helpers');

function createApp(pool, config = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' });
    if (req.path.startsWith('/api/')) {
      res.set('Cache-Control', 'no-store');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        if (req.headers.origin) {
          let origin;
          try { origin = new URL(req.headers.origin); } catch { assert(false, 403, '請求來源錯誤'); }
          assert(origin.host === req.headers.host, 403, '請從本站提交表單');
        }
        assert(!req.headers['content-length'] || req.headers['content-length'] === '0' || req.is('application/json'), 415, '請使用 JSON 格式');
      }
    }
    next();
  });
  app.use(express.json({ limit: '128kb' }));
  app.use((req, res, next) => { req.body ??= {}; next(); });
  app.get('/api/health', async (req, res) => {
    await rows(pool, 'SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  });
  authRoutes(app, pool, { cookieSecure: false, ...config });

  const scholarshipsSQL = `SELECT s.*, p.organization_name FROM Scholarship s
    LEFT JOIN Scholarship_Provider p ON s.provider_id = p.user_id`;
  app.get('/api/scholarships', async (req, res) => res.json(await rows(pool, scholarshipsSQL + ' ORDER BY s.application_deadline DESC')));
  app.get('/api/teachers', async (req, res) => res.json(await rows(pool, `SELECT t.teacher_id, t.user_id, t.department, t.job_title, u.username
    FROM Teacher t JOIN Users u ON t.user_id = u.id`)));
  app.get('/api/providers', async (req, res) => {
    allow(req, '管理員');
    res.json(await rows(pool, `SELECT p.*, u.email, u.phone_number FROM Scholarship_Provider p JOIN Users u ON p.user_id = u.id`));
  });
  app.get('/api/announcements', async (req, res) => res.json(await rows(pool, `SELECT a.*, u.username AS admin_name FROM Announcement a
    LEFT JOIN Users u ON a.user_id = u.id ORDER BY a.announcement_date DESC, a.Announcement_NUMBER DESC`)));
  app.post('/api/announcements', async (req, res) => {
    allow(req, '管理員');
    await rows(pool, 'INSERT INTO Announcement (announcement_date, TITLE, CONTENT, user_id) VALUES (CURDATE(), ?, ?, ?)',
      [text(req.body, 'title', 200, true), text(req.body, 'content', 20000, true), req.user.id]);
    res.status(201).json({ success: true, message: '發布成功' });
  });

  async function applicationAccess(req, applicationId, reviewerOnly = false) {
    const application = await one(pool, `SELECT a.*, s.provider_id FROM Application a JOIN Scholarship s
      ON a.scholarship_id = s.Scholarship_NUMBER WHERE a.application_id = ?`, [id(applicationId)]);
    const isAdmin = req.user.role === '管理員';
    const isProvider = req.user.role === '獎助單位' && application.provider_id === req.user.id;
    const isStudent = req.user.role === '學生' && application.user_id === req.user.id;
    const isTeacher = req.user.role === '老師' && application.teacher_id === req.user.teacher_id;
    assert(isAdmin || isProvider || (!reviewerOnly && (isStudent || isTeacher)), 403, '您無法存取此申請');
    return application;
  }
  app.get('/api/application-full-detail/:app_id', async (req, res) => {
    await applicationAccess(req, req.params.app_id);
    res.json(await one(pool, `SELECT a.application_id, a.ranking, a.grade, a.status, a.application_date,
      u.username, u.email, u.phone_number, s.department, s.academic_year, s.student_number,
      s.bank_serial_number, s.bank_account, sch.title AS scholarship_title
      FROM Application a JOIN Users u ON a.user_id = u.id JOIN Student s ON u.id = s.user_id
      JOIN Scholarship sch ON a.scholarship_id = sch.Scholarship_NUMBER WHERE a.application_id = ?`, [id(req.params.app_id)]));
  });
  app.get('/api/recommendation/:app_id', async (req, res) => {
    await applicationAccess(req, req.params.app_id);
    res.json(await one(pool, `SELECT r.*, u.username AS teacher_name FROM Recommendation_Letter r
      JOIN Teacher t ON r.teacher_id = t.teacher_id JOIN Users u ON t.user_id = u.id WHERE r.application_id = ?`,
    [id(req.params.app_id)], '此申請尚無推薦信資料'));
  });
  app.put('/api/applications/:id/status', async (req, res) => {
    await applicationAccess(req, req.params.id, true);
    assert(['待審核', '通過', '不通過'].includes(req.body.status), 400, '審核狀態錯誤');
    await rows(pool, 'UPDATE Application SET status = ? WHERE application_id = ?', [req.body.status, id(req.params.id)]);
    res.json({ success: true });
  });

  app.get('/api/provider-info/:id', async (req, res) => {
    owner(req, req.params.id, '獎助單位');
    res.json(await one(pool, 'SELECT organization_name FROM Scholarship_Provider WHERE user_id = ?', [req.user.id]));
  });
  app.get('/api/provider/applications/:provider_id', async (req, res) => {
    owner(req, req.params.provider_id, '獎助單位');
    res.json(await rows(pool, `SELECT a.*, s.title AS scholarship_title FROM Application a
      JOIN Scholarship s ON a.scholarship_id = s.Scholarship_NUMBER WHERE s.provider_id = ? ORDER BY a.application_id DESC`, [req.user.id]));
  });
  app.get('/api/provider/scholarships/:provider_id', async (req, res) => {
    owner(req, req.params.provider_id, '獎助單位');
    res.json(await rows(pool, `SELECT s.*, (SELECT COUNT(*) FROM Application a WHERE a.scholarship_id = s.Scholarship_NUMBER) AS application_count
      FROM Scholarship s WHERE s.provider_id = ? ORDER BY s.application_deadline DESC`, [req.user.id]));
  });
  app.post('/api/scholarships', async (req, res) => {
    allow(req, '獎助單位');
    const result = await rows(pool, `INSERT INTO Scholarship
      (title, description, scholarship_amount, application_start_date, application_deadline, provider_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [...scholarship(req.body), req.user.id]);
    res.status(201).json({ success: true, id: result.insertId });
  });

  const profiles = {
    student: { role: '學生', table: 'Student', columns: 's.department, s.academic_year, s.student_number, s.bank_account, s.bank_serial_number' },
    teacher: { role: '老師', table: 'Teacher', columns: 's.teacher_id, s.department, s.job_title' },
    provider: { role: '獎助單位', table: 'Scholarship_Provider', columns: 's.organization_name, s.contact_person' },
  };
  for (const [type, profile] of Object.entries(profiles)) {
    app.get(`/api/${type}/profile/:id`, async (req, res) => {
      owner(req, req.params.id, profile.role);
      res.json(await one(pool, `SELECT u.id, u.username, u.phone_number, u.email, ${profile.columns}
        FROM Users u JOIN ${profile.table} s ON s.user_id = u.id WHERE u.id = ?`, [req.user.id]));
    });
    app.put(`/api/${type}/profile/:id`, async (req, res) => {
      owner(req, req.params.id, profile.role);
      const body = req.body;
      const newPassword = body.password ? await hashPassword(password(body.password)) : null;
      await transaction(pool, async db => {
        const values = [text(body, 'phone', 20), text(body, 'email', 100)];
        let sql = 'UPDATE Users SET phone_number = ?, email = ?';
        if (type !== 'provider') { sql += ', username = ?'; values.push(text(body, 'username', 50, true)); }
        if (newPassword) { sql += ', password_hash = ?'; values.push(newPassword); }
        await rows(db, sql + ' WHERE id = ?', [...values, req.user.id]);
        if (type === 'student') {
          await rows(db, 'UPDATE Student SET department = ?, academic_year = ?, bank_account = ?, bank_serial_number = ? WHERE user_id = ?',
            [text(body, 'department', 50, true), number(body.academic_year, 1, 8, '年級', true), text(body, 'bank_account', 100), text(body, 'bank_serial_number', 100), req.user.id]);
        } else if (type === 'teacher') {
          await rows(db, 'UPDATE Teacher SET department = ? WHERE user_id = ?', [text(body, 'department', 50, true), req.user.id]);
        } else {
          await rows(db, 'UPDATE Scholarship_Provider SET organization_name = ?, contact_person = ? WHERE user_id = ?',
            [text(body, 'organization_name', 100, true), text(body, 'contact_person', 50, true), req.user.id]);
        }
        if (newPassword) await rows(db, 'DELETE FROM Sessions WHERE user_id = ?', [req.user.id]);
      });
      res.json({ success: true, message: newPassword ? '資料更新成功，請以新密碼重新登入' : '資料更新成功', loginRequired: !!newPassword });
    });
  }
  app.post('/api/student/apply', async (req, res) => {
    allow(req, '學生');
    const body = req.body;
    assert(body.user_id === undefined || body.user_id === req.user.id, 403, '僅可為自己提出申請');
    const applicationId = await transaction(pool, async db => {
      const sch = await one(db, `SELECT Scholarship_NUMBER, (CURDATE() BETWEEN application_start_date AND application_deadline) AS is_open
        FROM Scholarship WHERE Scholarship_NUMBER = ? FOR UPDATE`, [id(body.scholarship_id)], '查無獎學金');
      assert(sch.is_open, 400, '目前不在申請期間');
      await one(db, 'SELECT teacher_id FROM Teacher WHERE teacher_id = ?', [id(body.teacher_id)], '查無推薦教師');
      const result = await rows(db, `INSERT INTO Application (ranking, grade, status, application_date, user_id, scholarship_id, teacher_id)
        VALUES (?, ?, '待審核', CURDATE(), ?, ?, ?)`, [number(body.ranking, 1, 100000, '排名', true), number(body.grade, 0, 100, '成績', true), req.user.id, sch.Scholarship_NUMBER, id(body.teacher_id)]);
      return result.insertId;
    });
    res.status(201).json({ success: true, message: '申請成功', id: applicationId });
  });
  app.get('/api/student/applications/:user_id', async (req, res) => {
    owner(req, req.params.user_id, '學生');
    res.json(await rows(pool, `SELECT a.*, s.title AS scholarship_title FROM Application a
      JOIN Scholarship s ON a.scholarship_id = s.Scholarship_NUMBER WHERE a.user_id = ? ORDER BY a.application_id DESC`, [req.user.id]));
  });

  function teacherOwner(req, teacherId) {
    allow(req, '老師');
    assert(req.user.teacher_id === id(teacherId), 403, '僅可存取自己的推薦資料');
  }
  app.get('/api/teacher/applications/:teacher_id', async (req, res) => {
    teacherOwner(req, req.params.teacher_id);
    res.json(await rows(pool, `SELECT a.application_id, a.ranking, a.grade, a.status, a.application_date,
      u.username AS student_name, s.department AS student_dept, s.student_number, sch.title AS scholarship_title,
      (SELECT COUNT(*) FROM Recommendation_Letter r WHERE r.application_id = a.application_id AND r.teacher_id = a.teacher_id) AS has_letter
      FROM Application a JOIN Users u ON a.user_id = u.id JOIN Student s ON a.user_id = s.user_id
      JOIN Scholarship sch ON a.scholarship_id = sch.Scholarship_NUMBER WHERE a.teacher_id = ? ORDER BY a.application_id DESC`, [req.user.teacher_id]));
  });
  app.get('/api/teacher/recommendation/:app_id/:teacher_id', async (req, res) => {
    teacherOwner(req, req.params.teacher_id);
    await applicationAccess(req, req.params.app_id);
    const letters = await rows(pool, 'SELECT * FROM Recommendation_Letter WHERE application_id = ? AND teacher_id = ?', [id(req.params.app_id), req.user.teacher_id]);
    res.json(letters.length ? { exists: true, letter: letters[0] } : { exists: false });
  });
  app.post('/api/teacher/recommendation', async (req, res) => {
    teacherOwner(req, req.body.teacher_id);
    const application = await applicationAccess(req, req.body.application_id);
    await rows(pool, 'INSERT INTO Recommendation_Letter (teacher_id, content, submission_date, application_id) VALUES (?, ?, CURDATE(), ?)',
      [req.user.teacher_id, text(req.body, 'content', 20000, true), application.application_id]);
    res.status(201).json({ success: true, message: '推薦信已送出' });
  });
  app.put('/api/teacher/recommendation/:letter_id', async (req, res) => {
    allow(req, '老師');
    const letter = await one(pool, 'SELECT * FROM Recommendation_Letter WHERE letter_id = ?', [id(req.params.letter_id)]);
    assert(letter.teacher_id === req.user.teacher_id, 403, '僅可編輯自己的推薦信');
    const application = await applicationAccess(req, letter.application_id);
    assert(application.teacher_id === req.user.teacher_id, 403, '此申請已不屬於您');
    await rows(pool, 'UPDATE Recommendation_Letter SET content = ?, submission_date = CURDATE() WHERE letter_id = ?',
      [text(req.body, 'content', 20000, true), letter.letter_id]);
    res.json({ success: true, message: '推薦信已更新' });
  });

  app.use('/api/admin', (req, res, next) => { allow(req, '管理員'); next(); });
  const lists = {
    students: `SELECT s.student_id, s.user_id, u.username AS name, s.student_number, s.department, u.email FROM Student s JOIN Users u ON s.user_id = u.id`,
    teachers: `SELECT t.teacher_id, t.user_id, u.username AS name, t.department, t.job_title, u.email FROM Teacher t JOIN Users u ON t.user_id = u.id`,
    providers: `SELECT p.provider_id, p.user_id, p.organization_name, p.contact_person, u.phone_number AS phone, u.email FROM Scholarship_Provider p JOIN Users u ON p.user_id = u.id`,
    applications: `SELECT a.application_id, a.user_id, a.scholarship_id, a.teacher_id, a.application_date AS apply_time, a.status,
      u.username AS student_name, s.title AS scholarship_name, tu.username AS teacher_name FROM Application a JOIN Users u ON a.user_id = u.id
      LEFT JOIN Scholarship s ON a.scholarship_id = s.Scholarship_NUMBER LEFT JOIN Teacher t ON a.teacher_id = t.teacher_id
      LEFT JOIN Users tu ON t.user_id = tu.id ORDER BY a.application_id DESC`,
    recommendations: `SELECT r.letter_id, r.application_id, r.content, r.submission_date AS created_at, su.username AS student_name,
      tu.username AS teacher_name FROM Recommendation_Letter r JOIN Application a ON r.application_id = a.application_id
      JOIN Users su ON a.user_id = su.id LEFT JOIN Teacher t ON r.teacher_id = t.teacher_id LEFT JOIN Users tu ON t.user_id = tu.id ORDER BY r.letter_id DESC`,
  };
  for (const [name, sql] of Object.entries(lists)) app.get(`/api/admin/${name}`, async (req, res) => res.json(await rows(pool, sql)));
  app.get('/api/admin/closed-scholarships', async (req, res) => res.json(await rows(pool, `SELECT s.*, p.organization_name,
    (SELECT COUNT(*) FROM Application a WHERE a.scholarship_id = s.Scholarship_NUMBER) AS application_count
    FROM Scholarship s LEFT JOIN Scholarship_Provider p ON s.provider_id = p.user_id WHERE s.application_deadline < CURDATE() ORDER BY s.application_deadline DESC`)));
  app.get('/api/admin/scholarship-results/:id', async (req, res) => res.json(await rows(pool, `SELECT a.application_id, a.status, a.grade, a.ranking,
    s.student_number, s.department, s.academic_year, u.username AS student_name FROM Application a JOIN Student s ON a.user_id = s.user_id
    JOIN Users u ON a.user_id = u.id WHERE a.scholarship_id = ? ORDER BY FIELD(a.status, '通過', '待審核', '不通過'), a.grade DESC`, [id(req.params.id)])));
  app.put('/api/admin/announcement/:id', async (req, res) => {
    await one(pool, 'SELECT Announcement_NUMBER FROM Announcement WHERE Announcement_NUMBER = ?', [id(req.params.id)]);
    await rows(pool, 'UPDATE Announcement SET TITLE = ?, CONTENT = ? WHERE Announcement_NUMBER = ?',
      [text(req.body, 'title', 200, true), text(req.body, 'content', 20000, true), id(req.params.id)]);
    res.json({ success: true, message: '公告已更新' });
  });
  app.put('/api/admin/scholarship/:id', async (req, res) => {
    await one(pool, 'SELECT Scholarship_NUMBER FROM Scholarship WHERE Scholarship_NUMBER = ?', [id(req.params.id)]);
    await rows(pool, 'UPDATE Scholarship SET title = ?, description = ?, scholarship_amount = ?, application_start_date = ?, application_deadline = ? WHERE Scholarship_NUMBER = ?',
      [...scholarship(req.body, true), id(req.params.id)]);
    res.json({ success: true, message: '獎學金資料已更新' });
  });
  const entities = { student: ['Student', 'student_id'], teacher: ['Teacher', 'teacher_id'], provider: ['Scholarship_Provider', 'provider_id'] };
  for (const [type, [table, column]] of Object.entries(entities)) {
    app.put(`/api/admin/${type}/:id`, async (req, res) => {
      await transaction(pool, async db => {
        // Derive the account from the primary key; never trust a query-string userId.
        const entity = await one(db, `SELECT user_id FROM ${table} WHERE ${column} = ? FOR UPDATE`, [id(req.params.id)]);
        const body = req.body;
        if (type === 'provider') {
          await rows(db, 'UPDATE Users SET email = ?, phone_number = ? WHERE id = ?', [text(body, 'email', 100), text(body, 'phone', 20), entity.user_id]);
          await rows(db, 'UPDATE Scholarship_Provider SET organization_name = ?, contact_person = ? WHERE user_id = ?',
            [text(body, 'organization_name', 100, true), text(body, 'contact_person', 50, true), entity.user_id]);
        } else {
          await rows(db, 'UPDATE Users SET username = ?, email = ? WHERE id = ?', [text(body, 'username', 50, true), text(body, 'email', 100), entity.user_id]);
          if (type === 'student') await rows(db, 'UPDATE Student SET department = ?, student_number = ? WHERE user_id = ?',
            [text(body, 'department', 50, true), text(body, 'student_number', 50, true), entity.user_id]);
          else await rows(db, 'UPDATE Teacher SET department = ?, job_title = ? WHERE user_id = ?',
            [text(body, 'department', 50, true), text(body, 'job_title', 50), entity.user_id]);
        }
      });
      res.json({ success: true, message: '資料已更新' });
    });
    app.delete(`/api/admin/${type}/:id`, async (req, res) => {
      await transaction(pool, async db => {
        const entity = await one(db, `SELECT user_id FROM ${table} WHERE ${column} = ? FOR UPDATE`, [id(req.params.id)]);
        if (type === 'provider') await rows(db, 'DELETE FROM Scholarship WHERE provider_id = ?', [entity.user_id]);
        await rows(db, 'DELETE FROM Users WHERE id = ?', [entity.user_id]);
      });
      res.json({ success: true, message: '資料已刪除' });
    });
  }
  const deletions = { announcement: ['Announcement', 'Announcement_NUMBER'], scholarship: ['Scholarship', 'Scholarship_NUMBER'],
    application: ['Application', 'application_id'], recommendation: ['Recommendation_Letter', 'letter_id'] };
  for (const [type, [table, column]] of Object.entries(deletions)) {
    app.delete(`/api/admin/${type}/:id`, async (req, res) => {
      const result = await rows(pool, `DELETE FROM ${table} WHERE ${column} = ?`, [id(req.params.id)]);
      assert(result.affectedRows, 404, '查無資料');
      res.json({ success: true, message: '資料已刪除' });
    });
  }

  app.use('/api', (req, res) => res.status(404).json({ success: false, message: '查無此 API' }));
  const frontend = path.resolve(__dirname, '../../frontend');
  app.get('/', (req, res) => res.sendFile(path.join(frontend, 'login.html')));
  app.use(express.static(frontend));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error.status || 500;
    let message = error.status ? error.message : '系統暫時無法處理請求';
    if (error.code === 'ER_DUP_ENTRY') { status = 409; message = '帳號、學號、申請或推薦信已存在'; }
    if (['ER_NO_REFERENCED_ROW_2', 'ER_ROW_IS_REFERENCED_2'].includes(error.code)) { status = 400; message = '關聯資料不存在或仍在使用中'; }
    if (error.type === 'entity.parse.failed') { status = 400; message = 'JSON 格式錯誤'; }
    if (status >= 500) console.error('Request failed:', error.code || error.message);
    res.status(status).json({ success: false, message, error: message });
  });
  return app;
}
module.exports = { createApp };
