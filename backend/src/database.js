const mysql = require('mysql2/promise');
function createPool(overrides = {}) {
  return mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'scholarship', password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'Scholarship_System', waitForConnections: true, connectionLimit: 10,
    charset: 'utf8mb4', dateStrings: true, timezone: '+08:00', ...overrides });
}
module.exports = { createPool };
