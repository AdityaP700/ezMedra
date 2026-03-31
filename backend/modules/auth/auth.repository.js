const pool = require('../../config/db');

class AuthRepository {
  yearToSemesterRange(academicYear) {
    const year = Number(academicYear);
    if (year === 1) return { min: 1, max: 2 };
    if (year === 2) return { min: 3, max: 4 };
    if (year === 3) return { min: 5, max: 6 };
    if (year === 4) return { min: 7, max: 8 };
    return null;
  }

  async findByEmail(email) {
    const result = await pool.query(
      `SELECT u.*, d.name as department_name, s.name as section_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN sections s ON u.section_id = s.id
       WHERE LOWER(u.email) = LOWER($1)`,
      [String(email || '').trim()]
    );
    return result.rows[0] || null;
  }

  async findById(id) {
    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.admin_type,
              u.department_id, u.section_id, u.leave_balance, u.attendance_percentage,
              u.semester, u.is_active, d.name as department_name, s.name as section_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN sections s ON u.section_id = s.id
       WHERE u.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async createUser({ firstName, lastName, email, password, role, departmentId, sectionId, studentCode, program, semester }) {
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password, role, admin_type, department_id, section_id, student_code, program, semester)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, first_name, last_name, email, role, admin_type, department_id, section_id, student_code, program, leave_balance, attendance_percentage, semester, created_at`,
      [firstName, lastName, email, password, role, role === 'admin' ? 'DEPARTMENT_ADMIN' : null, departmentId, sectionId || null, studentCode || null, program || null, semester || 1]
    );
    const created = result.rows[0];
    const enriched = await this.findById(created.id);
    return enriched || created;
  }

  async createFacultyProfile(userId, departmentId, designation) {
    const result = await pool.query(
      `INSERT INTO faculty_profiles (user_id, department_id, designation)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, departmentId, designation || 'Faculty']
    );
    return result.rows[0];
  }

  async getDepartments() {
    const result = await pool.query('SELECT * FROM departments ORDER BY name');
    return result.rows;
  }

  async getSectionById(sectionId) {
    const result = await pool.query(
      `SELECT s.id, s.name, s.semester, s.department_id,
              COUNT(u.id) FILTER (WHERE u.role = 'student' AND u.is_active = true)::int as student_count
       FROM sections s
       LEFT JOIN users u ON u.section_id = s.id
       WHERE s.id = $1
       GROUP BY s.id`,
      [sectionId]
    );
    return result.rows[0] || null;
  }

  async getSectionsForOnboarding(departmentId, academicYear = null) {
    const params = [departmentId];
    let yearWhere = '';
    const range = this.yearToSemesterRange(academicYear);

    if (range) {
      params.push(range.min, range.max);
      yearWhere = ` AND s.semester BETWEEN $2 AND $3`;
    }

    const result = await pool.query(
      `SELECT s.id, s.name, s.semester, s.department_id,
              COUNT(u.id) FILTER (WHERE u.role = 'student' AND u.is_active = true)::int as student_count
       FROM sections s
       LEFT JOIN users u ON u.section_id = s.id
       WHERE s.department_id = $1
       ${yearWhere}
       GROUP BY s.id
       ORDER BY s.semester ASC, student_count ASC, s.name ASC`,
      params
    );
    return result.rows;
  }

  async pickLeastFilledSection(departmentId, academicYear = null) {
    const sections = await this.getSectionsForOnboarding(departmentId, academicYear);
    return sections[0] || null;
  }

  async updateUserSectionAndSemester(userId, sectionId, semester) {
    const result = await pool.query(
      `UPDATE users
       SET section_id = $2,
           semester = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, section_id, semester`,
      [userId, sectionId, semester]
    );
    return result.rows[0] || null;
  }

  async getFacultyClassSlotCount(facultyId) {
    const result = await pool.query(
      `SELECT COUNT(*)::int as slot_count
       FROM class_slots
       WHERE faculty_id = $1`,
      [facultyId]
    );
    return Number(result.rows[0]?.slot_count || 0);
  }

  async getDefaultTeachingCandidates(departmentId) {
    const result = await pool.query(
      `SELECT s.id as subject_id,
              s.code as subject_code,
              s.type as subject_type,
              s.semester,
              sec.id as section_id,
              sec.name as section_name
       FROM subjects s
       JOIN sections sec
         ON sec.department_id = s.department_id
        AND sec.semester = s.semester
       WHERE s.department_id = $1
       ORDER BY s.semester ASC, s.code ASC, sec.name ASC`,
      [departmentId]
    );
    return result.rows;
  }

  async ensureDefaultFacultyTeachingSetup(facultyId, departmentId) {
    if (!facultyId || !departmentId) {
      return { createdAssignments: 0, createdSlots: 0 };
    }

    const existingSlots = await this.getFacultyClassSlotCount(facultyId);
    if (existingSlots > 0) {
      return { createdAssignments: 0, createdSlots: 0 };
    }

    const candidates = await this.getDefaultTeachingCandidates(departmentId);
    if (!candidates.length) {
      return { createdAssignments: 0, createdSlots: 0 };
    }

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

    const slotsPerWeek = 5;
    const semesterWeeks = 12;
    const startIndex = Number(facultyId) % candidates.length;
    const candidatePool = [];
    for (let i = 0; i < candidates.length; i += 1) {
      candidatePool.push(candidates[(startIndex + i) % candidates.length]);
    }

    let createdAssignments = 0;
    let createdSlots = 0;
    let createdSessions = 0;
    const createdSlotRows = [];
    let subjectCursor = 0;
    const gridOffset = Number(facultyId) % weeklyGrid.length;

    for (let i = 0; i < weeklyGrid.length && createdSlots < slotsPerWeek; i += 1) {
      const candidate = candidatePool[subjectCursor % candidatePool.length];
      subjectCursor += 1;
      const slotTemplate = weeklyGrid[(gridOffset + i) % weeklyGrid.length];

      const occupied = await pool.query(
        `SELECT 1
         FROM class_slots
         WHERE section_id = $1
           AND day_of_week = $2
           AND start_time = $3::time
           AND end_time = $4::time
         LIMIT 1`,
        [candidate.section_id, slotTemplate.day, slotTemplate.start, slotTemplate.end]
      );

      if (occupied.rows.length) {
        continue;
      }

      const assignmentInsert = await pool.query(
        `INSERT INTO subject_assignments (subject_id, faculty_id, section_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (subject_id, faculty_id, section_id) DO NOTHING
         RETURNING id`,
        [candidate.subject_id, facultyId, candidate.section_id]
      );
      if (assignmentInsert.rows[0]) {
        createdAssignments += 1;
      }

      await pool.query(
        `INSERT INTO teaching_roles (user_id, subject_id, role, permissions)
         VALUES ($1, $2, 'PRIMARY', '{"markAttendance": true, "approveLeave": true}'::jsonb)
         ON CONFLICT (user_id, subject_id)
         DO UPDATE SET role = EXCLUDED.role, permissions = EXCLUDED.permissions`,
        [facultyId, candidate.subject_id]
      );

      const slotInsert = await pool.query(
        `INSERT INTO class_slots (subject_id, faculty_id, section_id, day_of_week, start_time, end_time, is_lab)
         VALUES ($1, $2, $3, $4, $5::time, $6::time, $7)
         RETURNING id, day_of_week, start_time, end_time, is_lab`,
        [
          candidate.subject_id,
          facultyId,
          candidate.section_id,
          slotTemplate.day,
          slotTemplate.start,
          slotTemplate.end,
          candidate.subject_type === 'LAB' || String(candidate.subject_code || '').endsWith('L'),
        ]
      );

      if (slotInsert.rows[0]) {
        createdSlots += 1;
        createdSlotRows.push(slotInsert.rows[0]);
      }
    }

    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const todayDow = now.getUTCDay();
    const mondayOffset = (todayDow + 6) % 7;
    const currentWeekMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset));
    const semesterStartMonday = new Date(currentWeekMonday.getTime() - ((semesterWeeks - 1) * 7 * msPerDay));

    for (const slot of createdSlotRows) {
      for (let week = 0; week < semesterWeeks; week += 1) {
        const classDate = new Date(semesterStartMonday.getTime() + (week * 7 + (Number(slot.day_of_week) - 1)) * msPerDay);
        const dateKey = classDate.toISOString().slice(0, 10);

        await pool.query(
          `INSERT INTO class_sessions (class_slot_id, date, start_time, end_time, status, type, weight)
           VALUES ($1, $2, $3, $4, 'CONDUCTED', 'REGULAR', $5)
           ON CONFLICT (class_slot_id, date, type)
           DO UPDATE SET
             status = EXCLUDED.status,
             start_time = EXCLUDED.start_time,
             end_time = EXCLUDED.end_time,
             weight = EXCLUDED.weight,
             updated_at = CURRENT_TIMESTAMP`,
          [slot.id, dateKey, slot.start_time, slot.end_time, slot.is_lab ? 2 : 1]
        );
        createdSessions += 1;
      }
    }

    return { createdAssignments, createdSlots, createdSessions };
  }
}

module.exports = new AuthRepository();
