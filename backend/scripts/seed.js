const bcrypt = require('bcrypt');
const pool = require('../config/db');

function generateStudentId({ program, admissionYear, branch, sequence }) {
  const yy = String(admissionYear).slice(-2);
  const seq = String(sequence).padStart(3, '0');
  const branchCode = (branch || 'IT').slice(0, 2).toUpperCase();

  if (program === 'MTECH') return `P${yy}${branchCode}${seq}`;
  if (program === 'PHD') return `D${yy}${branchCode}${seq}`;
  return `B${yy}${branchCode}${seq}`;
}

async function upsertUser({ firstName, lastName, email, passwordHash, role, departmentId, sectionId, studentCode, program, semester, adminType = null, leaveBalance = 15, attendance = 100 }) {
  const result = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password, role, admin_type, department_id, section_id, student_code, program, leave_balance, attendance_percentage, semester)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (email) DO UPDATE
     SET role = EXCLUDED.role,
         admin_type = EXCLUDED.admin_type,
         department_id = EXCLUDED.department_id,
         section_id = EXCLUDED.section_id,
         student_code = EXCLUDED.student_code,
         program = EXCLUDED.program,
         semester = EXCLUDED.semester,
         updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [firstName, lastName, email, passwordHash, role, adminType, departmentId, sectionId || null, studentCode || null, program || null, leaveBalance, attendance, semester]
  );
  return result.rows[0].id;
}

async function seed() {
  try {
    console.log('Seeding structured SLMS demo data...');

    const salt = await bcrypt.genSalt(12);
    const adminPass = await bcrypt.hash('admin123', salt);
    const facultyPass = await bcrypt.hash('faculty123', salt);
    const studentPass = await bcrypt.hash('student123', salt);

    const deptResult = await pool.query(`SELECT id, code FROM departments WHERE code IN ('IT', 'CSE') ORDER BY id ASC`);
    const itDept = deptResult.rows.find((d) => d.code === 'IT')?.id || 1;
    const cseDept = deptResult.rows.find((d) => d.code === 'CSE')?.id || 2;

    const sectionResult = await pool.query(`SELECT id, name, department_id FROM sections WHERE name IN ('IT1', 'CSEA') ORDER BY id ASC`);
    const it1 = sectionResult.rows.find((s) => s.name === 'IT1' && Number(s.department_id) === Number(itDept))?.id;
    const csea = sectionResult.rows.find((s) => s.name === 'CSEA' && Number(s.department_id) === Number(cseDept))?.id;

    const adminId = await upsertUser({
      firstName: 'Admin',
      lastName: 'HOD',
      email: 'admin@slms.com',
      passwordHash: adminPass,
      role: 'admin',
      adminType: 'DEPARTMENT_ADMIN',
      departmentId: itDept,
      semester: 1,
      leaveBalance: 0,
    });

    const facultyRoster = [
      { firstName: 'Arun', lastName: 'Sharma', email: 'faculty1@slms.com', designation: 'Professor' },
      { firstName: 'Neha', lastName: 'Mishra', email: 'faculty2@slms.com', designation: 'Associate Professor' },
      { firstName: 'Kunal', lastName: 'Nayak', email: 'faculty3@slms.com', designation: 'Assistant Professor' },
      { firstName: 'Riya', lastName: 'Patra', email: 'faculty4@slms.com', designation: 'Assistant Professor' },
    ];

    const facultyIds = [];
    for (const f of facultyRoster) {
      const id = await upsertUser({
        firstName: f.firstName,
        lastName: f.lastName,
        email: f.email,
        passwordHash: facultyPass,
        role: 'faculty',
        departmentId: itDept,
        semester: 1,
        leaveBalance: 0,
      });
      facultyIds.push(id);
      await pool.query(
        `INSERT INTO faculty_profiles (user_id, department_id, designation)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET designation = EXCLUDED.designation`,
        [id, itDept, f.designation]
      );
    }

    const phdId = await upsertUser({
      firstName: 'Suman',
      lastName: 'Rout',
      email: 'phd@slms.com',
      passwordHash: facultyPass,
      role: 'phd_scholar',
      departmentId: itDept,
      semester: 1,
      leaveBalance: 0,
    });

    const taId = await upsertUser({
      firstName: 'Rakesh',
      lastName: 'Das',
      email: 'ta@slms.com',
      passwordHash: facultyPass,
      role: 'ta',
      departmentId: itDept,
      semester: 1,
      leaveBalance: 0,
    });

    for (let i = 1; i <= 40; i += 1) {
      const sid = generateStudentId({
        program: 'BTECH',
        admissionYear: 2023,
        branch: 'IT',
        sequence: i,
      });
      await upsertUser({
        firstName: `Student${i}`,
        lastName: 'IT',
        email: `student${i}@slms.com`,
        passwordHash: studentPass,
        role: 'student',
        departmentId: itDept,
        sectionId: it1,
        studentCode: sid,
        program: 'BTECH',
        semester: 5,
        leaveBalance: 15,
        attendance: 78 + (i % 6),
      });
    }

    const demoStudentProfiles = [
      {
        firstName: 'Demo',
        lastName: 'Safe',
        email: 'demo.safe@slms.com',
        studentCode: generateStudentId({ program: 'BTECH', admissionYear: 2023, branch: 'IT', sequence: 901 }),
        baselineAttendance: 90,
      },
      {
        firstName: 'Demo',
        lastName: 'Borderline',
        email: 'demo.borderline@slms.com',
        studentCode: generateStudentId({ program: 'BTECH', admissionYear: 2023, branch: 'IT', sequence: 902 }),
        baselineAttendance: 78,
      },
      {
        firstName: 'Demo',
        lastName: 'Blocked',
        email: 'demo.blocked@slms.com',
        studentCode: generateStudentId({ program: 'BTECH', admissionYear: 2023, branch: 'IT', sequence: 903 }),
        baselineAttendance: 100,
      },
      {
        firstName: 'Demo',
        lastName: 'Recovery',
        email: 'demo.recovery@slms.com',
        studentCode: generateStudentId({ program: 'BTECH', admissionYear: 2023, branch: 'IT', sequence: 904 }),
        baselineAttendance: 72,
      },
    ];

    const demoStudents = [];
    for (const demo of demoStudentProfiles) {
      const demoId = await upsertUser({
        firstName: demo.firstName,
        lastName: demo.lastName,
        email: demo.email,
        passwordHash: studentPass,
        role: 'student',
        departmentId: itDept,
        sectionId: it1,
        studentCode: demo.studentCode,
        program: 'BTECH',
        semester: 5,
        leaveBalance: 15,
        attendance: demo.baselineAttendance,
      });

      demoStudents.push({ ...demo, id: demoId });
    }

    const subjectRows = await pool.query(
      `SELECT id, code FROM subjects WHERE code IN ('IT501', 'IT502', 'IT503L', 'IT504', 'IT505') ORDER BY code`
    );

    for (let i = 0; i < subjectRows.rows.length; i += 1) {
      const subject = subjectRows.rows[i];
      const facultyId = facultyIds[i % facultyIds.length];
      await pool.query(
        `INSERT INTO subject_assignments (subject_id, faculty_id, section_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (subject_id, faculty_id, section_id) DO NOTHING`,
        [subject.id, facultyId, it1]
      );

      await pool.query(
        `INSERT INTO teaching_roles (user_id, subject_id, role, permissions)
         VALUES ($1, $2, 'PRIMARY', '{"markAttendance": true, "approveLeave": true}'::jsonb)
         ON CONFLICT (user_id, subject_id)
         DO UPDATE SET role = EXCLUDED.role, permissions = EXCLUDED.permissions`,
        [facultyId, subject.id]
      );

      await pool.query(
        `INSERT INTO teaching_roles (user_id, subject_id, role, permissions)
         VALUES ($1, $2, 'ASSISTANT', '{"markAttendance": true, "approveLeave": false}'::jsonb)
         ON CONFLICT (user_id, subject_id)
         DO UPDATE SET role = EXCLUDED.role, permissions = EXCLUDED.permissions`,
        [phdId, subject.id]
      );

      await pool.query(
        `INSERT INTO teaching_roles (user_id, subject_id, role, permissions)
         VALUES ($1, $2, 'ASSISTANT', '{"markAttendance": true, "approveLeave": false}'::jsonb)
         ON CONFLICT (user_id, subject_id)
         DO UPDATE SET role = EXCLUDED.role, permissions = EXCLUDED.permissions`,
        [taId, subject.id]
      );
    }

    // Rebuild IT1 timetable/sessions deterministically so repeated seed runs stay stable.
    await pool.query(
      `DELETE FROM class_slots
       WHERE section_id = $1
         AND faculty_id = ANY($2::int[])`,
      [it1, facultyIds]
    );

    await pool.query(
      `INSERT INTO sections (name, branch, semester, department_id)
       SELECT 'IT2', 'IT', 5, $1
       WHERE NOT EXISTS (
         SELECT 1
         FROM sections
         WHERE name = 'IT2' AND semester = 5 AND department_id = $1
       )`,
      [itDept]
    );

    const weeklyGrid = [
      { day: 1, start: '09:00', end: '10:00' },
      { day: 1, start: '10:00', end: '11:00' },
      { day: 1, start: '11:00', end: '12:00' },
      { day: 1, start: '14:00', end: '15:00' },
      { day: 2, start: '09:00', end: '10:00' },
      { day: 2, start: '10:00', end: '11:00' },
      { day: 2, start: '11:00', end: '12:00' },
      { day: 2, start: '14:00', end: '15:00' },
      { day: 3, start: '09:00', end: '10:00' },
      { day: 3, start: '10:00', end: '11:00' },
      { day: 3, start: '11:00', end: '12:00' },
      { day: 3, start: '14:00', end: '15:00' },
      { day: 4, start: '09:00', end: '10:00' },
      { day: 4, start: '10:00', end: '11:00' },
      { day: 4, start: '11:00', end: '12:00' },
      { day: 4, start: '14:00', end: '15:00' },
      { day: 5, start: '09:00', end: '10:00' },
      { day: 5, start: '10:00', end: '11:00' },
      { day: 5, start: '11:00', end: '12:00' },
      { day: 5, start: '14:00', end: '15:00' },
      { day: 6, start: '09:00', end: '10:00' },
      { day: 6, start: '10:00', end: '11:00' },
      { day: 6, start: '11:00', end: '12:00' },
      { day: 6, start: '14:00', end: '15:00' },
    ];

    const assignmentRows = await pool.query(
      `SELECT sa.faculty_id, sa.subject_id, s.code as subject_code, s.type as subject_type
       FROM subject_assignments sa
       JOIN subjects s ON s.id = sa.subject_id
       WHERE sa.section_id = $1
         AND sa.faculty_id = ANY($2::int[])
       ORDER BY sa.faculty_id ASC, s.code ASC`,
      [it1, facultyIds]
    );

    const subjectsByFaculty = new Map();
    for (const row of assignmentRows.rows) {
      if (!subjectsByFaculty.has(row.faculty_id)) {
        subjectsByFaculty.set(row.faculty_id, []);
      }
      subjectsByFaculty.get(row.faculty_id).push(row);
    }

    const slotsPerFacultyPerWeek = 5;
    const requiredGrid = facultyIds.length * slotsPerFacultyPerWeek;
    if (requiredGrid > weeklyGrid.length) {
      throw new Error(`Weekly grid too small for collision-free schedule: need ${requiredGrid}, have ${weeklyGrid.length}`);
    }

    const createdSlotsByFaculty = new Map();
    let gridCursor = 0;

    for (const facultyId of facultyIds) {
      const assigned = subjectsByFaculty.get(facultyId) || [];
      if (!assigned.length) {
        continue;
      }

      const createdSlots = [];
      for (let i = 0; i < slotsPerFacultyPerWeek; i += 1) {
        const slotTemplate = weeklyGrid[gridCursor];
        gridCursor += 1;
        const subject = assigned[i % assigned.length];

        const slotInsert = await pool.query(
          `INSERT INTO class_slots (subject_id, faculty_id, section_id, day_of_week, start_time, end_time, is_lab)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, day_of_week, start_time, end_time, is_lab`,
          [
            subject.subject_id,
            facultyId,
            it1,
            slotTemplate.day,
            slotTemplate.start,
            slotTemplate.end,
            subject.subject_type === 'LAB' || String(subject.subject_code).endsWith('L'),
          ]
        );

        createdSlots.push(slotInsert.rows[0]);
      }

      createdSlotsByFaculty.set(facultyId, createdSlots);
    }

    const today = new Date();
    const semesterWeeks = 12;
    const msPerDay = 24 * 60 * 60 * 1000;
    const todayDow = today.getUTCDay();
    const mondayOffset = (todayDow + 6) % 7;
    const currentWeekMonday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - mondayOffset));
    const semesterStartMonday = new Date(currentWeekMonday.getTime() - ((semesterWeeks - 1) * 7 * msPerDay));

    const generatedPerFaculty = new Map();
    for (const facultyId of facultyIds) {
      generatedPerFaculty.set(facultyId, 0);
      const slots = createdSlotsByFaculty.get(facultyId) || [];
      for (const slot of slots) {
        for (let week = 0; week < semesterWeeks; week += 1) {
          const classDate = new Date(semesterStartMonday.getTime() + (week * 7 + (Number(slot.day_of_week) - 1)) * msPerDay);
          const dateKey = classDate.toISOString().slice(0, 10);

          await pool.query(
            `INSERT INTO class_sessions (class_slot_id, date, start_time, end_time, status, type, weight)
             VALUES ($1, $2, $3, $4, 'CONDUCTED', 'REGULAR', $5)`,
            [slot.id, dateKey, slot.start_time, slot.end_time, slot.is_lab ? 2 : 1]
          );

          generatedPerFaculty.set(facultyId, generatedPerFaculty.get(facultyId) + 1);
        }
      }
    }

    // Backfill attendance for IT1 students across generated regular sessions.
    const studentRows = await pool.query(
      `SELECT id
       FROM users
       WHERE role = 'student' AND section_id = $1
       ORDER BY id ASC`,
      [it1]
    );

    const sessionRows = await pool.query(
      `SELECT cs.id
       FROM class_sessions cs
       JOIN class_slots slot ON slot.id = cs.class_slot_id
       WHERE cs.status = 'CONDUCTED'
         AND cs.type = 'REGULAR'
         AND slot.section_id = $1
       ORDER BY cs.date ASC, cs.id ASC`,
      [it1]
    );

    for (const student of studentRows.rows) {
      for (const session of sessionRows.rows) {
        await pool.query(
          `INSERT INTO attendance (student_id, class_session_id, status)
           VALUES ($1, $2, $3)
           ON CONFLICT (student_id, class_session_id)
           DO UPDATE SET status = EXCLUDED.status, marked_at = CURRENT_TIMESTAMP`,
          [student.id, session.id, 'PRESENT']
        );
      }
    }

    const demoStudentIds = demoStudents.map((s) => s.id);

    // Demo profiles use controlled baseline percentages; keep logs empty so fallback mode stays deterministic.
    if (demoStudentIds.length) {
      await pool.query(
        `DELETE FROM attendance
         WHERE student_id = ANY($1::int[])`,
        [demoStudentIds]
      );
    }

    // Keep users.attendance_percentage in sync for regular students.
    await pool.query(
      `WITH per_student AS (
         SELECT
           u.id as student_id,
           COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END), 0)::numeric as attended,
           COALESCE(COUNT(a.class_session_id), 0)::numeric as conducted
         FROM users u
         LEFT JOIN attendance a ON a.student_id = u.id
         WHERE u.role = 'student'
           AND u.section_id = $1
           AND (cardinality($2::int[]) = 0 OR u.id <> ALL($2::int[]))
         GROUP BY u.id
       )
       UPDATE users u
       SET attendance_percentage = CASE
         WHEN ps.conducted = 0 THEN 100
         ELSE ROUND((ps.attended / ps.conducted) * 100, 2)
       END,
       updated_at = CURRENT_TIMESTAMP
       FROM per_student ps
       WHERE u.id = ps.student_id`,
      [it1, demoStudentIds]
    );

    for (const demo of demoStudents) {
      await pool.query(
        `UPDATE users
         SET attendance_percentage = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [demo.id, demo.baselineAttendance]
      );
    }

    for (const facultyId of facultyIds) {
      const generated = generatedPerFaculty.get(facultyId) || 0;
      console.log(`Faculty ${facultyId}: generated ${generated} regular classes.`);
    }

    console.log('Seed completed.');
    console.log('Admin:   admin@slms.com / admin123');
    console.log('Faculty: faculty1@slms.com / faculty123');
    console.log('PhD:     phd@slms.com / faculty123');
    console.log('TA:      ta@slms.com / faculty123');
    console.log('Student: student1@slms.com / student123');
    console.log('Student: student25@slms.com / student123');
    console.log('Student: student40@slms.com / student123');
    console.log('Demo Safe: demo.safe@slms.com / student123 (90% baseline)');
    console.log('Demo Borderline: demo.borderline@slms.com / student123 (78% baseline)');
    console.log('Demo Blocked: demo.blocked@slms.com / student123 (100% baseline)');
    console.log('Demo Recovery: demo.recovery@slms.com / student123 (72% baseline)');
    console.log(`Reference IDs: admin=${adminId}, sectionIT1=${it1}, sectionCSEA=${csea}`);
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }
}

seed();
