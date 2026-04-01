/**
 * seedMasterFaculty.js
 *
 * FOR DEVELOPMENT / DEMO USE ONLY — do not run against production databases.
 *
 * Creates a "master" faculty account (master.faculty@slms.com / faculty123)
 * that is assigned to every subject in every IT section.  All existing
 * faculty_pending / pending leave applications in the IT department are also
 * re-assigned to this account so they appear immediately when you log in.
 *
 * Usage:
 *   node scripts/seedMasterFaculty.js
 *   -- or --
 *   npm run seed:master-faculty
 *
 * Credentials after running:
 *   Email   : master.faculty@slms.com
 *   Password: faculty123
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function seedMasterFaculty() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ------------------------------------------------------------------ //
    // 1. Resolve IT department
    // ------------------------------------------------------------------ //
    const deptResult = await client.query(
      `SELECT id FROM departments WHERE code = 'IT' LIMIT 1`
    );
    if (!deptResult.rows.length) {
      throw new Error(
        "IT department not found. Run 'node scripts/seed.js' first."
      );
    }
    const itDeptId = deptResult.rows[0].id;

    // ------------------------------------------------------------------ //
    // 2. Upsert master faculty user
    // ------------------------------------------------------------------ //
    const passwordHash = await bcrypt.hash('faculty123', 12);

    const userResult = await client.query(
      `INSERT INTO users
         (first_name, last_name, email, password, role, department_id,
          semester,   leave_balance,  attendance_percentage)
       VALUES ('Master', 'Faculty', 'master.faculty@slms.com', $1, 'faculty', $2,
               1 /*semester*/, 0 /*leave_balance*/, 100 /*attendance_pct*/)
       ON CONFLICT (email) DO UPDATE
         SET first_name    = EXCLUDED.first_name,
             last_name     = EXCLUDED.last_name,
             role          = EXCLUDED.role,
             department_id = EXCLUDED.department_id,
             updated_at    = CURRENT_TIMESTAMP
       RETURNING id`,
      [passwordHash, itDeptId]
    );
    const masterId = userResult.rows[0].id;

    // ------------------------------------------------------------------ //
    // 3. Upsert faculty_profile
    // ------------------------------------------------------------------ //
    await client.query(
      `INSERT INTO faculty_profiles (user_id, department_id, designation)
       VALUES ($1, $2, 'Master Reviewer')
       ON CONFLICT (user_id) DO UPDATE
         SET designation   = EXCLUDED.designation,
             department_id = EXCLUDED.department_id`,
      [masterId, itDeptId]
    );

    // ------------------------------------------------------------------ //
    // 4. Assign master faculty to every subject in every IT section
    // ------------------------------------------------------------------ //
    const sectionsResult = await client.query(
      `SELECT id FROM sections WHERE department_id = $1`,
      [itDeptId]
    );
    const sectionIds = sectionsResult.rows.map((r) => r.id);

    const subjectsResult = await client.query(
      `SELECT id FROM subjects WHERE department_id = $1`,
      [itDeptId]
    );

    for (const section of sectionIds) {
      for (const subject of subjectsResult.rows) {
        await client.query(
          `INSERT INTO subject_assignments (subject_id, faculty_id, section_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (subject_id, faculty_id, section_id) DO NOTHING`,
          [subject.id, masterId, section]
        );

        await client.query(
          `INSERT INTO teaching_roles (user_id, subject_id, role, permissions)
           VALUES ($1, $2, 'PRIMARY', '{"markAttendance": true, "approveLeave": true}'::jsonb)
           ON CONFLICT (user_id, subject_id) DO UPDATE
             SET role        = EXCLUDED.role,
                 permissions = EXCLUDED.permissions`,
          [masterId, subject.id]
        );
      }
    }

    // ------------------------------------------------------------------ //
    // 5. Re-assign all pending IT-department leaves to master faculty
    //    so they appear in the review queue immediately on login
    // ------------------------------------------------------------------ //
    const reassignResult = await client.query(
      `UPDATE leave_applications la
       SET assigned_faculty_id = $1,
           updated_at          = CURRENT_TIMESTAMP
       FROM users u
       WHERE la.student_id      = u.id
         AND u.department_id    = $2
         AND la.status          IN ('faculty_pending', 'pending')
         AND la.is_deleted      = false
       RETURNING la.id`,
      [masterId, itDeptId]
    );

    await client.query('COMMIT');

    console.log('');
    console.log('Master faculty seeded successfully.');
    console.log('');
    console.log('  Email   : master.faculty@slms.com');
    console.log('  Password: faculty123');
    console.log('');
    console.log(
      `  Sections covered : ${sectionIds.length}`
    );
    console.log(
      `  Subjects assigned: ${subjectsResult.rows.length * sectionIds.length}`
    );
    console.log(
      `  Pending leaves re-assigned: ${reassignResult.rows.length}`
    );
    console.log('');
    console.log(
      'Log in as master.faculty@slms.com to see ALL pending leave requests.'
    );

    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('seedMasterFaculty error:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

seedMasterFaculty();
