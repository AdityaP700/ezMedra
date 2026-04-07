/**
 * seedDemoStudents.js
 *
 * Creates three specific students for presentation scenarios:
 * 1. Safe Student (100% attendance) -> Stays above 75%
 * 2. Borderline Student (85% attendance) -> Drops below 75%
 * 3. Critical Student (65% attendance) -> Needs override and special approval
 *
 * Usage:
 *   node scripts/seedDemoStudents.js
 */

require('dotenv').config();
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function seedDemoStudents() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Resolve IT department & IT1 Section
    const deptResult = await client.query(`SELECT id FROM departments WHERE code = 'IT' LIMIT 1`);
    if (!deptResult.rows.length) {
      throw new Error("IT department not found. Run 'node scripts/seed.js' first.");
    }
    const itDeptId = deptResult.rows[0].id;

    const sectionsResult = await client.query(`SELECT id FROM sections WHERE department_id = $1 AND name = 'IT1' LIMIT 1`, [itDeptId]);
    if (!sectionsResult.rows.length) {
      throw new Error("IT1 section not found.");
    }
    const sectionId = sectionsResult.rows[0].id;

    const passwordHash = await bcrypt.hash('student123', 12);

    const students = [
      {
        first_name: 'Safe',
        last_name: 'Student',
        email: 'safe.student@slms.com',
        attendance: 100,
        balance: 15
      },
      {
        first_name: 'Borderline',
        last_name: 'Student',
        email: 'borderline.student@slms.com',
        attendance: 82, // Decent but will drop below 75 on longer leave
        balance: 8
      },
      {
        first_name: 'Critical',
        last_name: 'Student',
        email: 'critical.student@slms.com',
        attendance: 65, // Already below 75%
        balance: 1 // Minimal leave balance
      }
    ];

    for (const st of students) {
      await client.query(
        `INSERT INTO users (first_name, last_name, email, password, role, department_id, section_id, semester, leave_balance, attendance_percentage)
         VALUES ($1, $2, $3, $4, 'student', $5, $6, 5, $7, $8)
         ON CONFLICT (email) DO UPDATE
         SET attendance_percentage = EXCLUDED.attendance_percentage,
             leave_balance = EXCLUDED.leave_balance,
             updated_at = CURRENT_TIMESTAMP`,
        [st.first_name, st.last_name, st.email, passwordHash, itDeptId, sectionId, st.balance, st.attendance]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Demo presentation students seeded successfully.');
    console.log('----------------------------------------------------');
    console.log('1. Safe Case       : safe.student@slms.com       (Pass: student123) | Initial Att: 100%');
    console.log('2. Borderline Case : borderline.student@slms.com (Pass: student123) | Initial Att: 82%');
    console.log('3. Critical Case   : critical.student@slms.com   (Pass: student123) | Initial Att: 65%');
    console.log('----------------------------------------------------');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ seedDemoStudents error:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

seedDemoStudents();