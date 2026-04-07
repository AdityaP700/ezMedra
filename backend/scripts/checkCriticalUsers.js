require('dotenv').config();
const fs = require('fs');
const pool = require('../config/db');

async function checkCriticalUsers() {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, leave_balance, attendance_percentage
       FROM users
       WHERE role = 'student' AND email ILIKE '%critical%'
       ORDER BY id ASC`
    );

    fs.writeFileSync(
      'critical-users-check.json',
      JSON.stringify({ count: result.rows.length, users: result.rows }, null, 2)
    );
    console.log('Wrote critical-users-check.json');
  } catch (error) {
    fs.writeFileSync('critical-users-check.json', JSON.stringify({ error: error.message }, null, 2));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkCriticalUsers();
