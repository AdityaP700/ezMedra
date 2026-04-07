require('dotenv').config();
const pool = require('../config/db');
const fs = require('fs');

async function verify() {
  const result = await pool.query(
    `SELECT id, email, role, is_active, leave_balance, attendance_percentage
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    ['critical2.student@slms.com']
  );
  const payload = result.rows[0] || null;
  fs.writeFileSync('critical2-verify.json', JSON.stringify(payload, null, 2));
  console.log(payload);
  await pool.end();
}

verify().catch(async (e) => {
  console.error(e.message);
  await pool.end();
  process.exit(1);
});
