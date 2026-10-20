require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env'), quiet: true });
const { createApp } = require('./src/app');
const { createPool } = require('./src/database');
const pool = createPool();
const app = createApp(pool, { cookieSecure: process.env.COOKIE_SECURE === 'true' });
const port = Number(process.env.PORT || process.env.BACKEND_PORT || 3000);
async function start() {
  await pool.query('SELECT 1');
  const server = app.listen(port, () => console.log(`獎學金管理系統：http://localhost:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(async () => { app.locals.disposeAuth(); await pool.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
start().catch(async error => {
  console.error('無法連接資料庫，請檢查 .env 並先啟動 MySQL：', error.code || error.message);
  app.locals.disposeAuth();
  await pool.end();
  process.exitCode = 1;
});
