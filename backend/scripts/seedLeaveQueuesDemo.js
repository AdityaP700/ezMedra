const pool = require('../config/db');

async function ensureSectionIT2(itDeptId) {
  await pool.query(
    `INSERT INTO sections (name, branch, semester, department_id)
     SELECT 'IT2', 'IT', 5, $1
     WHERE NOT EXISTS (
       SELECT 1 FROM sections WHERE name = 'IT2' AND semester = 5 AND department_id = $1
     )`,
    [itDeptId]
  );

  const sectionResult = await pool.query(
    `SELECT id, name
     FROM sections
     WHERE department_id = $1 AND semester = 5 AND name IN ('IT1', 'IT2')
     ORDER BY name`,
    [itDeptId]
  );

  return {
    it1: sectionResult.rows.find((r) => r.name === 'IT1')?.id || null,
    it2: sectionResult.rows.find((r) => r.name === 'IT2')?.id || null,
  };
}

async function seedQueueDemo() {
  try {
    console.log('Seeding leave queue demo data (faculty + HOD)...');

    const deptRes = await pool.query(`SELECT id FROM departments WHERE code = 'IT' LIMIT 1`);
    const itDeptId = deptRes.rows[0]?.id;
    if (!itDeptId) {
      throw new Error('IT department not found.');
    }

    const { it1, it2 } = await ensureSectionIT2(itDeptId);

    const facultyRes = await pool.query(
      `SELECT id, email
       FROM users
       WHERE role = 'faculty'
         AND department_id = $1
         AND is_active = true
       ORDER BY id ASC`,
      [itDeptId]
    );

    if (!facultyRes.rows.length) {
      throw new Error('No active IT faculty found.');
    }

    const hodRes = await pool.query(
      `SELECT id, email
       FROM users
       WHERE role = 'admin'
         AND admin_type = 'DEPARTMENT_ADMIN'
         AND department_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [itDeptId]
    );
    const hod = hodRes.rows[0] || null;

    const demoUsersRes = await pool.query(
      `SELECT id, email, section_id
       FROM users
       WHERE role = 'student'
         AND department_id = $1
         AND semester = 5
         AND (
           email LIKE 'demo.%@slms.com'
           OR email IN ('student1@slms.com', 'student2@slms.com', 'student3@slms.com', 'student4@slms.com')
         )
       ORDER BY email ASC`,
      [itDeptId]
    );

    if (!demoUsersRes.rows.length) {
      throw new Error('No demo students found in IT semester 5. Run seed.js first.');
    }

    await pool.query(
      `DELETE FROM leave_applications
       WHERE reason LIKE '[DEMO-QUEUE]%'`,
      []
    );

    if (it2) {
      await pool.query(
        `UPDATE users
         SET section_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE email IN ('demo.borderline@slms.com', 'demo.recovery@slms.com')
           AND section_id IS DISTINCT FROM $1`,
        [it2]
      );
    }

    const refreshedDemoUsersRes = await pool.query(
      `SELECT id, email, section_id
       FROM users
       WHERE role = 'student'
         AND department_id = $1
         AND semester = 5
         AND (
           email LIKE 'demo.%@slms.com'
           OR email IN ('student1@slms.com', 'student2@slms.com', 'student3@slms.com', 'student4@slms.com')
         )
       ORDER BY email ASC`,
      [itDeptId]
    );

    const demoUsers = refreshedDemoUsersRes.rows;

    const now = new Date();
    const isoDate = (offset) => {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    };

    const leaveTypeRes = await pool.query(
      `SELECT id FROM leave_types WHERE is_active = true ORDER BY id ASC LIMIT 1`
    );
    const leaveTypeId = leaveTypeRes.rows[0]?.id;
    if (!leaveTypeId) {
      throw new Error('No active leave type found.');
    }

    let pendingCount = 0;
    let forwardedCount = 0;

    for (let i = 0; i < demoUsers.length; i += 1) {
      const student = demoUsers[i];
      const faculty = facultyRes.rows[i % facultyRes.rows.length];
      const isForwarded = i % 2 === 1;
      const startDate = isoDate(2 + i);
      const endDate = isoDate(2 + i);

      await pool.query(
        `INSERT INTO leave_applications (
          student_id, assigned_faculty_id, leave_type_id, start_date, end_date, start_time, end_time,
          total_days, reason, is_late, late_reason, current_attendance, risk_flag, risk_indicator,
          recommendation, calculated_at, projected_attendance, document_required, status,
          reviewed_by_faculty, faculty_remarks, faculty_recommendation, faculty_reviewed_at, version_no
        )
        VALUES (
          $1, $2, $3, $4::date, $5::date, NULL, NULL,
          $6, $7, false, NULL, $8, $9, $10,
          $11, CURRENT_TIMESTAMP, $12, false, $13,
          $14, $15, $16, $17, 1
        )`,
        [
          student.id,
          faculty.id,
          leaveTypeId,
          startDate,
          endDate,
          1,
          `[DEMO-QUEUE] ${student.email} quick flow`,
          isForwarded ? 82 : 86,
          'NORMAL',
          isForwarded ? 'YELLOW' : 'GREEN',
          'APPROVE',
          isForwarded ? 78 : 83,
          isForwarded ? 'forwarded' : 'pending',
          isForwarded ? faculty.id : null,
          isForwarded ? 'Forwarded for admin demo queue.' : null,
          isForwarded ? 'forward' : null,
          isForwarded ? new Date() : null,
        ]
      );

      if (isForwarded) {
        forwardedCount += 1;
      } else {
        pendingCount += 1;
      }
    }

    console.log('Demo queue seed completed.');
    console.log(`Pending for faculty queue: ${pendingCount}`);
    console.log(`Forwarded for HOD queue: ${forwardedCount}`);
    console.log(`Faculty logins: ${facultyRes.rows.map((f) => `${f.email} / faculty123`).join(' | ')}`);
    if (hod) {
      console.log(`HOD login: ${hod.email} / admin123`);
    }
    console.log(`Sections ready: IT1=${it1 || 'missing'}, IT2=${it2 || 'missing'}`);
    process.exit(0);
  } catch (error) {
    console.error('Queue demo seed error:', error.message);
    process.exit(1);
  }
}

seedQueueDemo();
