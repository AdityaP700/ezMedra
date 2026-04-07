require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function seedAnotherCriticalStudent() {
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

    const email = 'critical2.student@slms.com';
    const password = 'student123';
    const passwordHash = await bcrypt.hash(password, 12);

    const upsertResult = await client.query(
      `INSERT INTO users (
         first_name, last_name, email, password, role,
         department_id, section_id, semester, leave_balance, attendance_percentage
       )
       VALUES ($1, $2, $3, $4, 'student', $5, $6, 5, $7, $8)
       ON CONFLICT (email) DO UPDATE
       SET first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           password = EXCLUDED.password,
           role = EXCLUDED.role,
           is_active = true,
           department_id = EXCLUDED.department_id,
           section_id = EXCLUDED.section_id,
           semester = EXCLUDED.semester,
           leave_balance = EXCLUDED.leave_balance,
           attendance_percentage = EXCLUDED.attendance_percentage,
           updated_at = CURRENT_TIMESTAMP
       RETURNING id, email, role, is_active, leave_balance, attendance_percentage`,
      ['Critical', 'Two', email, passwordHash, itDeptId, sectionId, 1, 65]
    );

    await client.query('COMMIT');
    console.log('✅ Another critical demo student is ready.');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('Attendance baseline: 65% | Leave balance: 1 day');
    console.log('Account snapshot:', upsertResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to seed another critical student:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

seedAnotherCriticalStudent();
