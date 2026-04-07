/**
 * seedMasterStudent.js
 *
 * FOR DEVELOPMENT / DEMO USE ONLY
 *
 * Creates a "master" student account (student.master@slms.com / student123)
 * with 100% attendance and a clean leave slate.
 *
 * Usage:
 *   node scripts/seedMasterStudent.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function seedMasterStudent() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const itDeptRes = await client.query(`SELECT id FROM departments WHERE code = 'IT' LIMIT 1`);
    if (!itDeptRes.rows.length) throw new Error("IT department not found");
    const itDeptId = itDeptRes.rows[0].id;

    const sectionRes = await client.query(`SELECT id FROM sections WHERE department_id = $1 LIMIT 1`, [itDeptId]);
    if (!sectionRes.rows.length) throw new Error("IT section not found");
    const sectionId = sectionRes.rows[0].id;

    const passwordHash = await bcrypt.hash('student123', 12);

    const userRes = await client.query(
      `INSERT INTO users (first_name, last_name, email, password, role, department_id, section_id, semester, leave_balance, attendance_percentage)
       VALUES ('Master', 'Student', 'student.master@slms.com', $1, 'student', $2, $3, 5, 100, 100)
       ON CONFLICT (email) DO UPDATE
       SET attendance_percentage = 100, leave_balance = 100, updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [passwordHash, itDeptId, sectionId]
    );

    await client.query('COMMIT');
    console.log('Master Student seeded successfully.');
    console.log('Email: student.master@slms.com');
    console.log('Password: student123');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('seedMasterStudent error:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

seedMasterStudent();