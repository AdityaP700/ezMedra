const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function upsertUser({ firstName, lastName, email, passwordHash, role, departmentId, sectionId = null, semester = 5, adminType = null, attendance = 100, leaveBalance = 15 }) {
  const result = await pool.query(
    `INSERT INTO users (
      first_name, last_name, email, password, role, admin_type,
      department_id, section_id, semester, attendance_percentage, leave_balance
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (email)
    DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      password = EXCLUDED.password,
      role = EXCLUDED.role,
      admin_type = EXCLUDED.admin_type,
      department_id = EXCLUDED.department_id,
      section_id = EXCLUDED.section_id,
      semester = EXCLUDED.semester,
      attendance_percentage = EXCLUDED.attendance_percentage,
      leave_balance = EXCLUDED.leave_balance,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id`,
    [firstName, lastName, email, passwordHash, role, adminType, departmentId, sectionId, semester, attendance, leaveBalance]
  );
  return result.rows[0].id;
}

async function seedWorkflowScenarios() {
  try {
    console.log('Seeding workflow test scenarios...');

    const salt = await bcrypt.genSalt(12);
    const facultyPass = await bcrypt.hash('faculty123', salt);
    const studentPass = await bcrypt.hash('student123', salt);
    const adminPass = await bcrypt.hash('admin123', salt);

    const deptRes = await pool.query(`SELECT id FROM departments WHERE code = 'IT' LIMIT 1`);
    const itDept = deptRes.rows[0]?.id;
    if (!itDept) throw new Error('IT department missing.');

    await pool.query(
      `INSERT INTO sections (name, branch, semester, department_id)
       SELECT 'IT2', 'IT', 5, $1
       WHERE NOT EXISTS (
         SELECT 1 FROM sections WHERE name = 'IT2' AND semester = 5 AND department_id = $1
       )`,
      [itDept]
    );

    const sectionRes = await pool.query(
      `SELECT id, name FROM sections WHERE department_id = $1 AND semester = 5 AND name IN ('IT1', 'IT2') ORDER BY id ASC`,
      [itDept]
    );
    const it1 = sectionRes.rows.find((s) => s.name === 'IT1')?.id || null;
    const it2 = sectionRes.rows.find((s) => s.name === 'IT2')?.id || it1;

    const hodId = await upsertUser({
      firstName: 'Scenario',
      lastName: 'HOD',
      email: 'scenario.hod@slms.com',
      passwordHash: adminPass,
      role: 'admin',
      adminType: 'DEPARTMENT_ADMIN',
      departmentId: itDept,
      sectionId: null,
      semester: 5,
      attendance: 100,
      leaveBalance: 0,
    });

    const facultyAId = await upsertUser({
      firstName: 'Scenario',
      lastName: 'FacultyA',
      email: 'scenario.facultyA@slms.com',
      passwordHash: facultyPass,
      role: 'faculty',
      departmentId: itDept,
      sectionId: null,
      semester: 5,
      attendance: 100,
      leaveBalance: 0,
    });

    const facultyBId = await upsertUser({
      firstName: 'Scenario',
      lastName: 'FacultyB',
      email: 'scenario.facultyB@slms.com',
      passwordHash: facultyPass,
      role: 'faculty',
      departmentId: itDept,
      sectionId: null,
      semester: 5,
      attendance: 100,
      leaveBalance: 0,
    });

    await pool.query(
      `INSERT INTO faculty_profiles (user_id, department_id, designation)
       VALUES ($1, $2, 'Assistant Professor')
       ON CONFLICT (user_id) DO UPDATE SET department_id = EXCLUDED.department_id`,
      [facultyAId, itDept]
    );
    await pool.query(
      `INSERT INTO faculty_profiles (user_id, department_id, designation)
       VALUES ($1, $2, 'Assistant Professor')
       ON CONFLICT (user_id) DO UPDATE SET department_id = EXCLUDED.department_id`,
      [facultyBId, itDept]
    );

    const safeStudentId = await upsertUser({
      firstName: 'Case',
      lastName: 'Safe',
      email: 'case.safe@slms.com',
      passwordHash: studentPass,
      role: 'student',
      departmentId: itDept,
      sectionId: it1,
      semester: 5,
      attendance: 88,
      leaveBalance: 15,
    });

    const yellowStudentId = await upsertUser({
      firstName: 'Case',
      lastName: 'Yellow',
      email: 'case.yellow@slms.com',
      passwordHash: studentPass,
      role: 'student',
      departmentId: itDept,
      sectionId: it1,
      semester: 5,
      attendance: 72,
      leaveBalance: 15,
    });

    const redStudentId = await upsertUser({
      firstName: 'Case',
      lastName: 'Red',
      email: 'case.red@slms.com',
      passwordHash: studentPass,
      role: 'student',
      departmentId: itDept,
      sectionId: it2,
      semester: 5,
      attendance: 90,
      leaveBalance: 15,
    });

    const leaveTypeRes = await pool.query(`SELECT id FROM leave_types WHERE is_active = true ORDER BY id ASC LIMIT 1`);
    const leaveTypeId = leaveTypeRes.rows[0]?.id;
    if (!leaveTypeId) throw new Error('No active leave type found.');

    await pool.query(`DELETE FROM leave_applications WHERE reason LIKE '[SCENARIO]%'`);

    const subjectRes = await pool.query(
      `SELECT id FROM subjects WHERE department_id = $1 AND semester = 5 ORDER BY id ASC LIMIT 1`,
      [itDept]
    );
    const conflictSubjectId = subjectRes.rows[0]?.id || null;
    if (conflictSubjectId) {
      await pool.query(
        `INSERT INTO subject_assignments (subject_id, faculty_id, section_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (subject_id, faculty_id, section_id) DO NOTHING`,
        [conflictSubjectId, facultyAId, it1]
      );
      await pool.query(
        `INSERT INTO subject_assignments (subject_id, faculty_id, section_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (subject_id, faculty_id, section_id) DO NOTHING`,
        [conflictSubjectId, facultyBId, it1]
      );
    }

    const start = new Date();
    start.setDate(start.getDate() + 1);
    const toDate = (offset) => {
      const d = new Date(start);
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    };

    await pool.query(
      `INSERT INTO leave_applications (
        student_id, assigned_faculty_id, leave_type_id, start_date, end_date, total_days,
        leave_mode, reason, status, current_attendance, projected_attendance,
        risk_flag, risk_indicator, risk_tier, recommendation,
        submit_anyway, override_reason, faculty_deadline_at, hod_deadline_at
      ) VALUES
      ($1, $2, $3, $4::date, $5::date, $6, 'DATE_BASED', $7, 'faculty_pending', $8, $9, 'NORMAL', 'GREEN', 'GREEN', 'APPROVE', false, NULL, CURRENT_TIMESTAMP + INTERVAL '24 hours', NULL),
      ($10, $11, $12, $13::date, $14::date, $15, 'DATE_BASED', $16, 'faculty_pending', $17, $18, 'HIGH_RISK', 'YELLOW', 'YELLOW', 'REJECT', true, $19, CURRENT_TIMESTAMP + INTERVAL '24 hours', NULL),
      ($20, $21, $22, $23::date, $24::date, $25, 'DATE_BASED', $26, 'faculty_pending', $27, $28, 'HIGH_RISK', 'RED', 'RED', 'REJECT', true, $29, CURRENT_TIMESTAMP + INTERVAL '24 hours', NULL),
      ($30, $31, $32, $33::date, $34::date, $35, 'DATE_BASED', $36, 'conflict', $37, $38, 'HIGH_RISK', 'YELLOW', 'YELLOW', 'REJECT', true, $39, NULL, CURRENT_TIMESTAMP + INTERVAL '24 hours'),
      ($40, $41, $42, $43::date, $44::date, $45, 'DATE_BASED', $46, 'faculty_pending', $47, $48, 'NORMAL', 'GREEN', 'GREEN', 'APPROVE', false, NULL, CURRENT_TIMESTAMP - INTERVAL '2 hours', NULL)
      `,
      [
        safeStudentId, facultyAId, leaveTypeId, toDate(0), toDate(1), 2, '[SCENARIO] CASE1 SAFE 88% -> 84%', 88, 84,
        yellowStudentId, facultyAId, leaveTypeId, toDate(2), toDate(4), 3, '[SCENARIO] CASE2 YELLOW 72% -> 68%', 72, 68, 'Medical follow-up with documentation.',
        redStudentId, facultyAId, leaveTypeId, toDate(5), toDate(10), 6, '[SCENARIO] CASE3 RED 90% -> 59%', 90, 59, 'Emergency family medical situation requiring travel.',
        yellowStudentId, facultyAId, leaveTypeId, toDate(6), toDate(8), 3, '[SCENARIO] CASE4 CONFLICT multi-faculty decision.', 72, 66, 'Faculty A approved, Faculty B rejected.',
        safeStudentId, facultyBId, leaveTypeId, toDate(3), toDate(3), 1, '[SCENARIO] CASE5 NO ACTION -> should auto-escalate.', 88, 85,
      ]
    );

    await pool.query(
      `UPDATE leave_applications
       SET faculty_decisions = $2::jsonb,
           hod_deadline_at = CURRENT_TIMESTAMP + INTERVAL '24 hours'
       WHERE reason = $1`,
      [
        '[SCENARIO] CASE4 CONFLICT multi-faculty decision.',
        JSON.stringify([
          { facultyId: facultyAId, decision: 'APPROVE', reason: 'Theory classes manageable.' },
          { facultyId: facultyBId, decision: 'REJECT', reason: 'Lab continuity impacted.' },
        ]),
      ]
    );

    console.log('Scenario seed completed.');
    console.log('HOD: scenario.hod@slms.com / admin123');
    console.log('Faculty A: scenario.facultyA@slms.com / faculty123');
    console.log('Faculty B: scenario.facultyB@slms.com / faculty123');
    console.log('Students:');
    console.log('- case.safe@slms.com / student123 (Case 1 + Case 5)');
    console.log('- case.yellow@slms.com / student123 (Case 2 + Case 4)');
    console.log('- case.red@slms.com / student123 (Case 3)');
    process.exit(0);
  } catch (error) {
    console.error('Scenario seed error:', error.message);
    process.exit(1);
  }
}

seedWorkflowScenarios();
