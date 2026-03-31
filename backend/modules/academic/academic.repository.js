const pool = require('../../config/db');

class AcademicRepository {
  async getSections(departmentId = null, semester = null) {
    const params = [];
    const filters = [];
    if (departmentId) {
      params.push(departmentId);
      filters.push(`department_id = $${params.length}`);
    }
    if (semester) {
      params.push(semester);
      filters.push(`semester = $${params.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await pool.query(`SELECT * FROM sections ${where} ORDER BY name`, params);
    return result.rows;
  }

  async createSection({ name, branch, semester, departmentId }) {
    const result = await pool.query(
      `INSERT INTO sections (name, branch, semester, department_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, branch, semester, departmentId]
    );
    return result.rows[0];
  }

  async createSubjectAssignment({ subjectId, facultyId, sectionId }) {
    const result = await pool.query(
      `INSERT INTO subject_assignments (subject_id, faculty_id, section_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (subject_id, faculty_id, section_id) DO NOTHING
       RETURNING *`,
      [subjectId, facultyId, sectionId]
    );
    return result.rows[0] || null;
  }

  async upsertTeachingRole({ userId, subjectId, role, permissions }) {
    const result = await pool.query(
      `INSERT INTO teaching_roles (user_id, subject_id, role, permissions)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, subject_id)
       DO UPDATE SET role = EXCLUDED.role, permissions = EXCLUDED.permissions
       RETURNING *`,
      [userId, subjectId, role, permissions]
    );
    return result.rows[0];
  }

  async validateFacultySectionMapping({ facultyId, subjectId, sectionId }) {
    const result = await pool.query(
      `SELECT
         u.department_id as faculty_department,
         s.department_id as subject_department,
         sec.department_id as section_department
       FROM users u
       JOIN subjects s ON s.id = $2
       LEFT JOIN sections sec ON sec.id = $3
       WHERE u.id = $1`,
      [facultyId, subjectId, sectionId || null]
    );
    return result.rows[0] || null;
  }

  async getSubjects(departmentId = null, semester = null) {
    const params = [];
    const filters = [];

    if (departmentId) {
      params.push(departmentId);
      filters.push(`s.department_id = $${params.length}`);
    }

    if (semester) {
      params.push(semester);
      filters.push(`s.semester = $${params.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT s.*, d.name as department_name
       FROM subjects s
       JOIN departments d ON s.department_id = d.id
       ${whereClause}
       ORDER BY s.code ASC`,
      params
    );
    return result.rows;
  }

  async createSubject({ code, name, type = 'THEORY', credits = 3, departmentId, semester }) {
    const result = await pool.query(
      `INSERT INTO subjects (code, name, type, credits, department_id, semester)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [code, name, type, credits, departmentId, semester]
    );
    return result.rows[0];
  }

  async createClassSlot({ subjectId, facultyId, sectionId, dayOfWeek, startTime, endTime, isLab }) {
    const result = await pool.query(
      `INSERT INTO class_slots (subject_id, faculty_id, section_id, day_of_week, start_time, end_time, is_lab)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [subjectId, facultyId, sectionId || null, dayOfWeek, startTime, endTime, !!isLab]
    );
    return result.rows[0];
  }

  async getClassSlots({ departmentId = null, semester = null, facultyId = null, sectionId = null } = {}) {
    const params = [];
    const filters = [];

    if (departmentId) {
      params.push(departmentId);
      filters.push(`s.department_id = $${params.length}`);
    }
    if (semester) {
      params.push(semester);
      filters.push(`s.semester = $${params.length}`);
    }
    if (facultyId) {
      params.push(facultyId);
      filters.push(`cs.faculty_id = $${params.length}`);
    }
    if (sectionId) {
      params.push(sectionId);
      filters.push(`cs.section_id = $${params.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const result = await pool.query(
            `SELECT cs.*, s.code as subject_code, s.name as subject_name, s.department_id, s.semester,
              sec.name as section_name,
              u.first_name || ' ' || u.last_name as faculty_name
       FROM class_slots cs
       JOIN subjects s ON cs.subject_id = s.id
             LEFT JOIN sections sec ON sec.id = cs.section_id
       JOIN users u ON cs.faculty_id = u.id
       ${whereClause}
       ORDER BY cs.day_of_week, cs.start_time`,
      params
    );
    return result.rows;
  }

  async getFacultyTeachingAssignments(facultyId) {
    const result = await pool.query(
      `SELECT
         sa.id as assignment_id,
         sa.subject_id,
         s.code as subject_code,
         s.name as subject_name,
         sa.section_id,
         sec.name as section_name,
         sec.semester as section_semester,
         sa.faculty_id,
         MIN(cs.id) as default_class_slot_id,
         COALESCE(
           ARRAY_AGG(DISTINCT CONCAT(cs.day_of_week, '|', TO_CHAR(cs.start_time, 'HH24:MI'), '-', TO_CHAR(cs.end_time, 'HH24:MI')))
             FILTER (WHERE cs.id IS NOT NULL),
           ARRAY[]::text[]
         ) as schedule_preview
       FROM subject_assignments sa
       JOIN subjects s ON s.id = sa.subject_id
       JOIN sections sec ON sec.id = sa.section_id
       LEFT JOIN class_slots cs
         ON cs.subject_id = sa.subject_id
        AND cs.section_id = sa.section_id
        AND cs.faculty_id = sa.faculty_id
       WHERE sa.faculty_id = $1
       GROUP BY sa.id, sa.subject_id, s.code, s.name, sa.section_id, sec.name, sec.semester, sa.faculty_id
       ORDER BY sec.semester ASC, sec.name ASC, s.code ASC`,
      [facultyId]
    );
    return result.rows;
  }

  async updateClassSlot(id, payload) {
    const result = await pool.query(
      `UPDATE class_slots
       SET subject_id = $2,
           faculty_id = $3,
           section_id = $4,
           day_of_week = $5,
           start_time = $6,
           end_time = $7,
           is_lab = $8
       WHERE id = $1
       RETURNING *`,
      [id, payload.subjectId, payload.facultyId, payload.sectionId || null, payload.dayOfWeek, payload.startTime, payload.endTime, !!payload.isLab]
    );
    return result.rows[0] || null;
  }

  async deleteClassSlot(id) {
    const result = await pool.query('DELETE FROM class_slots WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }

  async getClassSlotById(id) {
    const result = await pool.query(
      `SELECT cs.*, s.id as subject_id
       FROM class_slots cs
       JOIN subjects s ON s.id = cs.subject_id
       WHERE cs.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async canUserMarkAttendance(userId, classSlotId) {
    const result = await pool.query(
      `SELECT
         u.role,
         cs.faculty_id,
         EXISTS (
           SELECT 1
           FROM teaching_roles tr
           WHERE tr.user_id = $1
             AND tr.subject_id = cs.subject_id
             AND COALESCE((tr.permissions->>'markAttendance')::boolean, false) = true
         ) as teaching_permission
       FROM users u
       JOIN class_slots cs ON cs.id = $2
       WHERE u.id = $1`,
      [userId, classSlotId]
    );

    const row = result.rows[0];
    if (!row) {
      return false;
    }
    if (Number(row.faculty_id) === Number(userId)) {
      return true;
    }
    return !!row.teaching_permission;
  }

  async upsertClassSession({
    classSlotId = null,
    subjectId = null,
    facultyId = null,
    sectionId = null,
    date,
    startTime = null,
    endTime = null,
    status,
    type = 'REGULAR',
    weight = 1,
    cancellationSource = null,
    cancellationReason = null,
  }) {
    if (type === 'EXTRA') {
      const existing = await pool.query(
        `SELECT id
         FROM class_sessions
         WHERE type = 'EXTRA'
           AND subject_id = $1
           AND faculty_id = $2
           AND section_id = $3
           AND date = $4
           AND start_time = $5
           AND end_time = $6
         LIMIT 1`,
        [subjectId, facultyId, sectionId, date, startTime, endTime]
      );

      if (existing.rows[0]) {
        const updated = await pool.query(
          `UPDATE class_sessions
           SET status = $2,
               weight = $3,
               cancellation_source = $4,
               cancellation_reason = $5,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [existing.rows[0].id, status, weight, cancellationSource, cancellationReason]
        );
        return updated.rows[0];
      }

      const inserted = await pool.query(
        `INSERT INTO class_sessions (class_slot_id, subject_id, faculty_id, section_id, date, start_time, end_time, status, type, weight, cancellation_source, cancellation_reason)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, 'EXTRA', $8, $9, $10)
         RETURNING *`,
        [subjectId, facultyId, sectionId, date, startTime, endTime, status, weight, cancellationSource, cancellationReason]
      );
      return inserted.rows[0];
    }

    const existing = await pool.query(
      `SELECT id
       FROM class_sessions
       WHERE type = 'REGULAR'
         AND class_slot_id = $1
         AND date = $2
       LIMIT 1`,
      [classSlotId, date]
    );

    if (existing.rows[0]) {
      const updated = await pool.query(
        `UPDATE class_sessions
         SET status = $2,
             weight = $3,
             cancellation_source = $4,
             cancellation_reason = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [existing.rows[0].id, status, weight, cancellationSource, cancellationReason]
      );
      return updated.rows[0];
    }

    const inserted = await pool.query(
      `INSERT INTO class_sessions (class_slot_id, date, status, type, weight, cancellation_source, cancellation_reason)
       VALUES ($1, $2, $3, 'REGULAR', $4, $5, $6)
       RETURNING *`,
      [classSlotId, date, status, weight, cancellationSource, cancellationReason]
    );
    return inserted.rows[0];
  }

  async getClassSessionById(id) {
    const result = await pool.query(
      `SELECT cs.*, COALESCE(cs.faculty_id, cl.faculty_id) as faculty_id, COALESCE(cs.subject_id, cl.subject_id) as subject_id,
              COALESCE(cs.section_id, cl.section_id) as section_id
       FROM class_sessions cs
       LEFT JOIN class_slots cl ON cs.class_slot_id = cl.id
       WHERE cs.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async getFacultyRecentSessions(facultyId, limit = 25) {
    const result = await pool.query(
      `SELECT cs.id,
              cs.date,
              cs.status,
              cs.lifecycle_status,
              COALESCE(cs.type, 'REGULAR') as type,
              COALESCE(cs.weight, CASE WHEN cl.is_lab THEN 2 ELSE 1 END, 1)::numeric as weight,
              COALESCE(cs.start_time, cl.start_time) as start_time,
              COALESCE(cs.end_time, cl.end_time) as end_time,
              s.id as subject_id,
              s.code as subject_code,
              s.name as subject_name,
              sec.id as section_id,
              sec.name as section_name
       FROM class_sessions cs
       LEFT JOIN class_slots cl ON cs.class_slot_id = cl.id
       JOIN subjects s ON s.id = COALESCE(cs.subject_id, cl.subject_id)
       LEFT JOIN sections sec ON sec.id = COALESCE(cs.section_id, cl.section_id)
       WHERE COALESCE(cs.faculty_id, cl.faculty_id) = $1
       ORDER BY cs.date DESC, COALESCE(cs.start_time, cl.start_time) DESC NULLS LAST, cs.id DESC
       LIMIT $2`,
      [facultyId, limit]
    );

    return result.rows;
  }

  async updateSessionLifecycle(classSessionId, lifecycleStatus) {
    const timestamps = {
      OPEN: { lockedAt: null, finalizedAt: null },
      LOCKED: { lockedAt: 'CURRENT_TIMESTAMP', finalizedAt: null },
      FINALIZED: { lockedAt: 'CURRENT_TIMESTAMP', finalizedAt: 'CURRENT_TIMESTAMP' },
    };

    const target = timestamps[lifecycleStatus];
    const query = `
      UPDATE class_sessions
      SET lifecycle_status = $2,
          locked_at = ${target.lockedAt === null ? 'NULL' : target.lockedAt},
          finalized_at = ${target.finalizedAt === null ? 'NULL' : target.finalizedAt},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [classSessionId, lifecycleStatus]);
    return result.rows[0] || null;
  }

  async getSessionStudents(classSessionId) {
    const result = await pool.query(
      `WITH session_ctx AS (
         SELECT cs.id,
                COALESCE(cs.section_id, cl.section_id) as section_id,
                s.department_id,
                s.semester
         FROM class_sessions cs
         LEFT JOIN class_slots cl ON cs.class_slot_id = cl.id
         JOIN subjects s ON s.id = COALESCE(cs.subject_id, cl.subject_id)
         WHERE cs.id = $1
       )
       SELECT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.student_code,
              COALESCE(a.status, 'UNMARKED') as attendance_status
       FROM users u
       JOIN session_ctx sc ON (
         (sc.section_id IS NOT NULL AND u.section_id = sc.section_id)
         OR (sc.section_id IS NULL AND u.department_id = sc.department_id AND u.semester = sc.semester)
       )
       LEFT JOIN attendance a ON a.student_id = u.id AND a.class_session_id = $1
       WHERE u.role = 'student' AND u.is_active = true
       ORDER BY u.first_name, u.last_name, u.id`,
      [classSessionId]
    );

    return result.rows;
  }

  async markAttendanceBulk(classSessionId, marks, changedBy = null, reason = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const marksPayload = marks.map((mark) => ({
        student_id: Number(mark.studentId),
        status: String(mark.status),
      }));

      const upsertResult = await client.query(
        `WITH incoming AS (
           SELECT *
           FROM jsonb_to_recordset($2::jsonb) AS x(student_id int, status text)
         ), existing AS (
           SELECT a.student_id, a.status as old_status
           FROM attendance a
           JOIN incoming i ON i.student_id = a.student_id
           WHERE a.class_session_id = $1
         ), upserted AS (
           INSERT INTO attendance (student_id, class_session_id, status)
           SELECT i.student_id, $1, i.status
           FROM incoming i
           ON CONFLICT (student_id, class_session_id)
           DO UPDATE SET status = EXCLUDED.status,
                         marked_at = CURRENT_TIMESTAMP
           RETURNING student_id, class_session_id, status, marked_at
         ), history_insert AS (
           INSERT INTO attendance_history (class_session_id, student_id, old_status, new_status, changed_by, reason)
           SELECT
             $1,
             u.student_id,
             e.old_status,
             u.status,
             $3,
             $4
           FROM upserted u
           LEFT JOIN existing e ON e.student_id = u.student_id
           WHERE e.old_status IS DISTINCT FROM u.status
           RETURNING id
         )
         SELECT student_id, class_session_id, status, marked_at
         FROM upserted
         ORDER BY student_id`,
        [classSessionId, JSON.stringify(marksPayload), changedBy, reason || null]
      );

      await client.query('COMMIT');
      return upsertResult.rows;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAttendanceHistory(classSessionId, limit = 200) {
    const result = await pool.query(
      `SELECT ah.id,
              ah.class_session_id,
              ah.student_id,
              us.first_name || ' ' || us.last_name as student_name,
              ah.old_status,
              ah.new_status,
              ah.reason,
              ah.changed_at,
              uc.first_name || ' ' || uc.last_name as changed_by_name
       FROM attendance_history ah
       JOIN users us ON us.id = ah.student_id
       LEFT JOIN users uc ON uc.id = ah.changed_by
       WHERE ah.class_session_id = $1
       ORDER BY ah.changed_at DESC
       LIMIT $2`,
      [classSessionId, Math.max(1, Math.min(1000, Number(limit) || 200))]
    );
    return result.rows;
  }

  async findStudentByIdentifier(identifier, sectionId = null) {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, student_code
       FROM users
       WHERE role = 'student'
         AND is_active = true
         AND (
           id::text = $1
           OR lower(email) = lower($1)
           OR lower(COALESCE(student_code, '')) = lower($1)
         )
         AND ($2::int IS NULL OR section_id = $2)
       ORDER BY id
       LIMIT 2`,
      [String(identifier).trim(), sectionId || null]
    );

    if (result.rows.length > 1) {
      return { ambiguous: true, student: null };
    }

    return { ambiguous: false, student: result.rows[0] || null };
  }

  async getAttendanceSummary(studentId, subjectId = null) {
    const params = [studentId];
    let subjectFilter = '';
    if (subjectId) {
      params.push(subjectId);
      subjectFilter = ` AND s.id = $${params.length}`;
    }

    const result = await pool.query(
      `WITH student_ctx AS (
         SELECT department_id, semester, section_id
         FROM users
         WHERE id = $1
       ), sessions AS (
         SELECT cs.id,
                COALESCE(cs.weight, CASE WHEN cl.is_lab THEN 2 ELSE 1 END, 1)::numeric as session_weight,
                COALESCE(cs.type, 'REGULAR') as session_type,
                s.id as subject_id,
                s.name as subject_name,
                cs.date
         FROM class_sessions cs
         LEFT JOIN class_slots cl ON cs.class_slot_id = cl.id
         JOIN subjects s ON s.id = COALESCE(cs.subject_id, cl.subject_id)
         JOIN student_ctx st ON (COALESCE(cs.section_id, cl.section_id) IS NOT NULL AND COALESCE(cs.section_id, cl.section_id) = st.section_id)
                             OR (COALESCE(cs.section_id, cl.section_id) IS NULL AND s.department_id = st.department_id AND s.semester = st.semester)
         LEFT JOIN holiday_instances hi ON hi.date = cs.date
         WHERE cs.status = 'CONDUCTED'
           AND (COALESCE(cs.type, 'REGULAR') = 'EXTRA' OR hi.id IS NULL)
           ${subjectFilter}
       ), attendance_map AS (
         SELECT a.class_session_id, a.status
         FROM attendance a
         WHERE a.student_id = $1
       )
       SELECT
         COALESCE(SUM(sess.session_weight), 0)::numeric as conducted_weight,
         COALESCE(SUM(CASE WHEN att.status = 'PRESENT' THEN sess.session_weight ELSE 0 END), 0)::numeric as attended_weight
       FROM sessions sess
       LEFT JOIN attendance_map att ON att.class_session_id = sess.id`,
      params
    );

    return result.rows[0];
  }

  async getSubjectRisk(studentId) {
    const result = await pool.query(
      `WITH student_ctx AS (
         SELECT department_id, semester, section_id
         FROM users
         WHERE id = $1
       ), sessions AS (
         SELECT s.id as subject_id,
                s.name as subject_name,
                cs.id as class_session_id,
                COALESCE(cs.weight, CASE WHEN cl.is_lab THEN 2 ELSE 1 END, 1)::numeric as session_weight,
                cs.date,
                COALESCE(cs.type, 'REGULAR') as session_type
         FROM class_sessions cs
         LEFT JOIN class_slots cl ON cs.class_slot_id = cl.id
         JOIN subjects s ON s.id = COALESCE(cs.subject_id, cl.subject_id)
         JOIN student_ctx st ON (COALESCE(cs.section_id, cl.section_id) IS NOT NULL AND COALESCE(cs.section_id, cl.section_id) = st.section_id)
                             OR (COALESCE(cs.section_id, cl.section_id) IS NULL AND s.department_id = st.department_id AND s.semester = st.semester)
         LEFT JOIN holiday_instances hi ON hi.date = cs.date
         WHERE cs.status = 'CONDUCTED'
           AND (COALESCE(cs.type, 'REGULAR') = 'EXTRA' OR hi.id IS NULL)
       )
       SELECT
         sess.subject_id,
         sess.subject_name,
         COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN sess.session_weight ELSE 0 END), 0)::numeric as attended,
         COALESCE(SUM(sess.session_weight), 0)::numeric as conducted
       FROM sessions sess
       LEFT JOIN attendance a ON a.class_session_id = sess.class_session_id AND a.student_id = $1
       GROUP BY sess.subject_id, sess.subject_name
       ORDER BY sess.subject_name`,
      [studentId]
    );
    return result.rows;
  }

  async getStudentExtraStats(studentId) {
    const result = await pool.query(
      `WITH student_ctx AS (
         SELECT department_id, semester, section_id
         FROM users
         WHERE id = $1
       ), sessions AS (
         SELECT cs.id,
                COALESCE(cs.weight, CASE WHEN cl.is_lab THEN 2 ELSE 1 END, 1)::numeric as session_weight,
                COALESCE(cs.type, 'REGULAR') as session_type
         FROM class_sessions cs
         LEFT JOIN class_slots cl ON cs.class_slot_id = cl.id
         JOIN subjects s ON s.id = COALESCE(cs.subject_id, cl.subject_id)
         JOIN student_ctx st ON (COALESCE(cs.section_id, cl.section_id) IS NOT NULL AND COALESCE(cs.section_id, cl.section_id) = st.section_id)
                             OR (COALESCE(cs.section_id, cl.section_id) IS NULL AND s.department_id = st.department_id AND s.semester = st.semester)
         WHERE cs.status = 'CONDUCTED'
       )
       SELECT
         COUNT(*) FILTER (WHERE s.session_type = 'EXTRA' AND a.status = 'PRESENT')::int as extra_sessions_attended,
         COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN GREATEST(s.session_weight - 1, 0) ELSE 0 END), 0)::numeric as bonus_attendance_credits
       FROM sessions s
       LEFT JOIN attendance a ON a.class_session_id = s.id AND a.student_id = $1`,
      [studentId]
    );
    return result.rows[0] || { extra_sessions_attended: 0, bonus_attendance_credits: 0 };
  }

  async getFacultyIrregularityScore(facultyId, fromDate, toDate) {
    const result = await pool.query(
      `WITH dates AS (
         SELECT generate_series($2::date, $3::date, interval '1 day')::date as date
       ), scheduled AS (
         SELECT d.date, cl.id as class_slot_id
         FROM dates d
         JOIN class_slots cl ON cl.day_of_week = EXTRACT(DOW FROM d.date)::int
         WHERE cl.faculty_id = $1
       )
       SELECT
         COUNT(s.class_slot_id)::int as scheduled_count,
         (COUNT(cs.id) FILTER (WHERE cs.status = 'CONDUCTED'))::int as conducted_count,
         (COUNT(cs.id) FILTER (WHERE cs.status = 'CANCELLED'))::int as cancelled_count
       FROM scheduled s
       LEFT JOIN class_sessions cs ON cs.class_slot_id = s.class_slot_id AND cs.date = s.date`,
      [facultyId, fromDate, toDate]
    );

    return result.rows[0];
  }
}

module.exports = new AcademicRepository();
