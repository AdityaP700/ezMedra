require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function seedCriticalFresh() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deptResult = await client.query("SELECT id FROM departments WHERE code = 'IT' LIMIT 1");
    if (!deptResult.rows.length) {
      throw new Error("IT department not found. Run node scripts/seed.js first.");
    }
    const itDeptId = deptResult.rows[0].id;

    const sectionResult = await client.query(
      "SELECT id FROM sections WHERE department_id = $1 AND name = 'IT1' LIMIT 1",
      [itDeptId]
    );
    if (!sectionResult.rows.length) {
      throw new Error('IT1 section not found.');
    }
    const sectionId = sectionResult.rows[0].id;

    const email = 'critical.fresh@slms.com';
    const password = 'student123';
    const passwordHash = await bcrypt.hash(password, 12);

    await client.query('DELETE FROM users WHERE LOWER(email) = LOWER($1)', [email]);

    const insert = await client.query(
      `INSERT INTO users (
        first_name, last_name, email, password, role, is_active,
        department_id, section_id, semester, leave_balance, attendance_percentage
      ) VALUES ($1, $2, $3, $4, 'student', true, $5, $6, 5, $7, $8)
      RETURNING id, email, role, is_active, leave_balance, attendance_percentage`,
      ['Critical', 'Fresh', email, passwordHash, itDeptId, sectionId, 1, 65]
    );

    await client.query('COMMIT');
    console.log('✅ Fresh critical account created');
    console.log('Email: critical.fresh@slms.com');
    console.log('Password: student123');
    console.log('DB row:', insert.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to create fresh critical account:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

seedCriticalFresh();
