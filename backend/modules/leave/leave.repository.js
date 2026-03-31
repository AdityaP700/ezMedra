const pool = require('../../config/db');

class LeaveRepository {
  async getAllHolidays() {
    const result = await pool.query(
      `SELECT id, name, date, type, is_recurring, rule, description
       FROM holidays
       ORDER BY COALESCE(date, CURRENT_DATE), name ASC`
    );
    return result.rows;
  }

  async getHolidaysInRange(startDate, endDate) {
    const result = await pool.query(
      `SELECT id, name, date, type, is_recurring, rule, description
       FROM holidays
       WHERE date BETWEEN $1::date AND $2::date
          OR (is_recurring = true AND date IS NOT NULL)
          OR (type = 'WEEKEND_RULE' AND rule IS NOT NULL)
       ORDER BY COALESCE(date, $1::date) ASC`,
      [startDate, endDate]
    );
    return result.rows;
  }

  async getHolidayInstancesInRange(startDate, endDate) {
    const result = await pool.query(
      `SELECT hi.date, h.id as holiday_id, h.name, h.type, h.is_recurring, h.rule, h.description
       FROM holiday_instances hi
       JOIN holidays h ON h.id = hi.holiday_id
       WHERE hi.date BETWEEN $1::date AND $2::date
       ORDER BY hi.date ASC`,
      [startDate, endDate]
    );
    return result.rows;
  }

  async getWeekendRuleHolidays() {
    const result = await pool.query(
      `SELECT id, name, type, is_recurring, rule, description
       FROM holidays
       WHERE type = 'WEEKEND_RULE' AND rule IS NOT NULL`
    );
    return result.rows;
  }

  async getStudentClassSlotsByDateRange(studentId, startDate, endDate) {
    const result = await pool.query(
      `WITH student_ctx AS (
         SELECT department_id, semester, section_id
         FROM users
         WHERE id = $1
       ), conducted_regular AS (
         SELECT cs.id as class_session_id,
                cs.date as class_date,
                COALESCE(cs.start_time, slot.start_time) as start_time,
                COALESCE(cs.end_time, slot.end_time) as end_time,
                COALESCE(cs.weight, CASE WHEN slot.is_lab THEN 2 ELSE 1 END, 1)::numeric as session_weight,
                'REGULAR'::text as session_type,
                subj.id as subject_id,
                subj.name as subject_name,
                cs.class_slot_id
         FROM class_sessions cs
         JOIN class_slots slot ON slot.id = cs.class_slot_id
         JOIN subjects subj ON subj.id = slot.subject_id
         JOIN student_ctx st ON (slot.section_id IS NOT NULL AND slot.section_id = st.section_id)
                             OR (slot.section_id IS NULL AND subj.department_id = st.department_id AND subj.semester = st.semester)
         LEFT JOIN holiday_instances hi ON hi.date = cs.date
         WHERE cs.type = 'REGULAR'
           AND cs.status = 'CONDUCTED'
           AND cs.date BETWEEN $2::date AND $3::date
           AND hi.id IS NULL
       ), dates AS (
         SELECT generate_series($2::date, $3::date, interval '1 day')::date as class_date
       ), scheduled_regular_fallback AS (
         SELECT d.class_date,
                slot.id as class_slot_id,
                COALESCE(cs.start_time, slot.start_time) as start_time,
                COALESCE(cs.end_time, slot.end_time) as end_time,
                CASE WHEN slot.is_lab THEN 2 ELSE 1 END::numeric as default_weight,
                subj.id as subject_id,
                subj.name as subject_name,
                cs.id as class_session_id,
                cs.status as session_status,
                cs.weight as session_weight
         FROM dates d
         JOIN class_slots slot ON slot.day_of_week = EXTRACT(DOW FROM d.class_date)::int
         JOIN subjects subj ON subj.id = slot.subject_id
         JOIN student_ctx st ON (slot.section_id IS NOT NULL AND slot.section_id = st.section_id)
                             OR (slot.section_id IS NULL AND subj.department_id = st.department_id AND subj.semester = st.semester)
         LEFT JOIN class_sessions cs
           ON cs.class_slot_id = slot.id
          AND cs.date = d.class_date
          AND cs.type = 'REGULAR'
         LEFT JOIN holiday_instances hi ON hi.date = d.class_date
         WHERE hi.id IS NULL
           AND cs.id IS NULL
       ), extra_sessions AS (
         SELECT cls.id as class_session_id,
                cls.date as class_date,
                cls.start_time,
                cls.end_time,
                cls.weight::numeric as session_weight,
                cls.type as session_type,
                subj.id as subject_id,
                subj.name as subject_name
         FROM class_sessions cls
         LEFT JOIN class_slots slot ON cls.class_slot_id = slot.id
         JOIN subjects subj ON subj.id = COALESCE(cls.subject_id, slot.subject_id)
         JOIN student_ctx st ON (COALESCE(cls.section_id, slot.section_id) IS NOT NULL AND COALESCE(cls.section_id, slot.section_id) = st.section_id)
                             OR (COALESCE(cls.section_id, slot.section_id) IS NULL AND subj.department_id = st.department_id AND subj.semester = st.semester)
         WHERE cls.status = 'CONDUCTED'
           AND cls.type = 'EXTRA'
           AND cls.date BETWEEN $2::date AND $3::date
       )
       SELECT
         cr.class_session_id,
         cr.class_date,
         cr.start_time,
         cr.end_time,
         cr.session_weight,
         cr.session_type,
         cr.subject_id,
         cr.subject_name
       FROM conducted_regular cr
       UNION ALL
       SELECT
         NULL as class_session_id,
         sr.class_date,
         sr.start_time,
         sr.end_time,
         COALESCE(sr.default_weight, 1)::numeric as session_weight,
         'REGULAR' as session_type,
         sr.subject_id,
         sr.subject_name
       FROM scheduled_regular_fallback sr
       UNION ALL
       SELECT
         ex.class_session_id,
         ex.class_date,
         ex.start_time,
         ex.end_time,
         COALESCE(ex.session_weight, 1)::numeric as session_weight,
         ex.session_type,
         ex.subject_id,
         ex.subject_name
       FROM extra_sessions ex
       ORDER BY class_date ASC, start_time ASC`,
      [studentId, startDate, endDate]
    );
    return result.rows;
  }

  async getLeaveTypes() {
    const result = await pool.query(
      'SELECT * FROM leave_types WHERE is_active = true ORDER BY name'
    );
    return result.rows;
  }

  async getLeaveTypeById(leaveTypeId) {
    const result = await pool.query(
      'SELECT * FROM leave_types WHERE id = $1 AND is_active = true',
      [leaveTypeId]
    );
    return result.rows[0] || null;
  }

  async getStudentLeaves(studentId) {
    const result = await pool.query(
      `SELECT la.*, lt.name as leave_type_name,
              EXISTS(SELECT 1 FROM documents d WHERE d.leave_id = la.id) as has_document,
              uf.first_name || ' ' || uf.last_name as faculty_name,
              ua.first_name || ' ' || ua.last_name as admin_name
       FROM leave_applications la
       JOIN leave_types lt ON la.leave_type_id = lt.id
       LEFT JOIN users uf ON la.reviewed_by_faculty = uf.id
       LEFT JOIN users ua ON la.reviewed_by_admin = ua.id
       WHERE la.student_id = $1
         AND la.is_deleted = false
       ORDER BY la.created_at DESC`,
      [studentId]
    );
    return result.rows;
  }

  async autoEscalateAndProvisionLeaves() {
    await pool.query(
      `UPDATE leave_applications
       SET status = 'escalated',
           hod_deadline_at = COALESCE(hod_deadline_at, CURRENT_TIMESTAMP + INTERVAL '24 hours'),
           updated_at = CURRENT_TIMESTAMP
       WHERE is_deleted = false
         AND status IN ('faculty_pending', 'pending')
         AND faculty_deadline_at IS NOT NULL
         AND faculty_deadline_at < CURRENT_TIMESTAMP`
    );

    await pool.query(
      `UPDATE leave_applications
       SET status = 'provisional',
           provisional_at = COALESCE(provisional_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE is_deleted = false
         AND status IN ('escalated', 'hod_review', 'forwarded', 'conflict')
         AND end_date < CURRENT_DATE`
    );
  }

  async getStudentPolicyContext(studentId) {
    const result = await pool.query(
      `SELECT id, leave_balance, attendance_percentage, semester, department_id
       FROM users
       WHERE id = $1`,
      [studentId]
    );
    return result.rows[0] || null;
  }

  async getDefaultFacultyForDepartment(departmentId) {
    const result = await pool.query(
      `SELECT u.id
       FROM users u
       JOIN faculty_profiles fp ON fp.user_id = u.id
       WHERE u.role = 'faculty' AND u.department_id = $1 AND u.is_active = true
       ORDER BY u.created_at ASC
       LIMIT 1`,
      [departmentId]
    );
    return result.rows[0]?.id || null;
  }

  async getDefaultFacultyForStudent(studentId) {
    const assignmentResult = await pool.query(
      `WITH student_ctx AS (
         SELECT section_id, department_id, semester
         FROM users
         WHERE id = $1
       )
       SELECT sa.faculty_id as id
       FROM subject_assignments sa
       JOIN student_ctx st ON st.section_id IS NOT NULL AND sa.section_id = st.section_id
       ORDER BY sa.created_at ASC
       LIMIT 1`,
      [studentId]
    );

    if (assignmentResult.rows[0]?.id) {
      return assignmentResult.rows[0].id;
    }

    const studentResult = await pool.query(
      `SELECT department_id, semester
       FROM users
       WHERE id = $1`,
      [studentId]
    );

    const departmentId = studentResult.rows[0]?.department_id;
    const semester = studentResult.rows[0]?.semester;

    if (departmentId && semester) {
      const semesterAssignmentResult = await pool.query(
        `SELECT sa.faculty_id as id
         FROM subject_assignments sa
         JOIN subjects s ON s.id = sa.subject_id
         WHERE s.department_id = $1
           AND s.semester = $2
         ORDER BY sa.created_at ASC
         LIMIT 1`,
        [departmentId, semester]
      );

      if (semesterAssignmentResult.rows[0]?.id) {
        return semesterAssignmentResult.rows[0].id;
      }
    }

    if (!departmentId) {
      return null;
    }

    return this.getDefaultFacultyForDepartment(departmentId);
  }

  async getLeaveSessionImpact(studentId, startDate, endDate) {
    const result = await pool.query(
      `WITH student_ctx AS (
        SELECT department_id, semester, section_id
         FROM users
         WHERE id = $1
       ), sessions AS (
         SELECT cs.id,
                cs.date,
                cl.is_lab
         FROM class_sessions cs
         JOIN class_slots cl ON cs.class_slot_id = cl.id
         JOIN subjects s ON cl.subject_id = s.id
         JOIN student_ctx st ON (cl.section_id IS NOT NULL AND cl.section_id = st.section_id)
                             OR (cl.section_id IS NULL AND s.department_id = st.department_id AND s.semester = st.semester)
         LEFT JOIN holidays h ON h.date = cs.date
         WHERE cs.status = 'CONDUCTED'
           AND cs.date BETWEEN $2::date AND $3::date
           AND h.id IS NULL
       )
       SELECT
         COUNT(*)::int as conducted_sessions,
         COALESCE(SUM(CASE WHEN is_lab THEN 2 ELSE 1 END), 0)::int as weighted_sessions
       FROM sessions`,
      [studentId, startDate, endDate]
    );

    return result.rows[0] || { conducted_sessions: 0, weighted_sessions: 0 };
  }

  async getAttendanceStats(studentId) {
    const result = await pool.query(
      `WITH student_ctx AS (
        SELECT department_id, semester, section_id
         FROM users
         WHERE id = $1
       ), sessions AS (
         SELECT cs.id,
                cl.is_lab
         FROM class_sessions cs
         JOIN class_slots cl ON cs.class_slot_id = cl.id
         JOIN subjects s ON cl.subject_id = s.id
         JOIN student_ctx st ON (cl.section_id IS NOT NULL AND cl.section_id = st.section_id)
                             OR (cl.section_id IS NULL AND s.department_id = st.department_id AND s.semester = st.semester)
         LEFT JOIN holidays h ON h.date = cs.date
         WHERE cs.status = 'CONDUCTED' AND h.id IS NULL
       )
       SELECT
         COALESCE(SUM(CASE WHEN sess.is_lab THEN 2 ELSE 1 END), 0)::int as conducted_weight,
         COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN CASE WHEN sess.is_lab THEN 2 ELSE 1 END ELSE 0 END), 0)::int as attended_weight,
         COALESCE(SUM(CASE WHEN a.id IS NOT NULL THEN CASE WHEN sess.is_lab THEN 2 ELSE 1 END ELSE 0 END), 0)::int as marked_weight
       FROM sessions sess
       LEFT JOIN attendance a ON a.class_session_id = sess.id AND a.student_id = $1`,
      [studentId]
    );

    return result.rows[0] || { conducted_weight: 0, attended_weight: 0, marked_weight: 0 };
  }

  async updateStudentAttendancePercentage(studentId) {
    const stats = await this.getAttendanceStats(studentId);
    const conducted = Number(stats.conducted_weight || 0);
    const attended = Number(stats.attended_weight || 0);
    const percentage = conducted === 0 ? 100 : Number(((attended / conducted) * 100).toFixed(2));

    await pool.query(
      `UPDATE users
       SET attendance_percentage = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [studentId, percentage]
    );
    return percentage;
  }

  async countRecentApplications(studentId, days) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS application_count
       FROM leave_applications
       WHERE student_id = $1
         AND is_deleted = false
         AND created_at >= NOW() - ($2::text || ' days')::interval
         AND status != 'cancelled'`,
      [studentId, days]
    );
    return result.rows[0]?.application_count || 0;
  }

  async getLeaveById(leaveId) {
    const result = await pool.query(
      `SELECT la.*, lt.name as leave_type_name,
              us.first_name || ' ' || us.last_name as student_name,
              us.email as student_email,
              d.name as department_name
       FROM leave_applications la
       JOIN leave_types lt ON la.leave_type_id = lt.id
       JOIN users us ON la.student_id = us.id
       LEFT JOIN departments d ON us.department_id = d.id
       WHERE la.id = $1
         AND la.is_deleted = false`,
      [leaveId]
    );
    return result.rows[0] || null;
  }

  async checkOverlap(studentId, startDate, endDate, excludeId = null) {
    let query = `
      SELECT id FROM leave_applications
      WHERE student_id = $1
        AND is_deleted = false
        AND status NOT IN ('rejected', 'hod_rejected', 'cancelled')
        AND start_date <= $3
        AND end_date >= $2
    `;
    const params = [studentId, startDate, endDate];

    if (excludeId) {
      query += ' AND id != $4';
      params.push(excludeId);
    }

    const result = await pool.query(query, params);
    return result.rows.length > 0;
  }

  async createLeave({
    studentId,
    leaveTypeId,
    startDate,
    endDate,
    startTime,
    endTime,
    assignedFacultyId,
    totalDays,
    reason,
    isLate,
    lateReason,
    currentAttendance,
    riskFlag,
    riskIndicator,
    recommendation,
    calculatedAt,
    projectedAttendance,
    riskTier,
    leaveMode,
    submitAnyway,
    overrideReason,
    documentRequired,
    initialStatus,
    parentApplicationId,
    versionNo,
    facultyDeadlineAt,
    hodDeadlineAt,
  }) {
    const result = await pool.query(
      `INSERT INTO leave_applications (
        student_id, assigned_faculty_id, leave_type_id, start_date, end_date, start_time, end_time, total_days, reason,
        is_late, late_reason, current_attendance, risk_flag, risk_indicator, recommendation, calculated_at,
        projected_attendance, risk_tier, leave_mode, submit_anyway, override_reason,
        document_required, status, parent_application_id, version_no, faculty_deadline_at, hod_deadline_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
       RETURNING *`,
      [
        studentId,
        assignedFacultyId || null,
        leaveTypeId,
        startDate,
        endDate,
        startTime || null,
        endTime || null,
        totalDays,
        reason,
        isLate,
        lateReason,
        currentAttendance,
        riskFlag,
        riskIndicator,
        recommendation,
        calculatedAt || new Date(),
        projectedAttendance,
        riskTier || null,
        leaveMode || 'DATE_BASED',
        !!submitAnyway,
        overrideReason || null,
        documentRequired,
        initialStatus || 'faculty_pending',
        parentApplicationId || null,
        versionNo || 1,
        facultyDeadlineAt || null,
        hodDeadlineAt || null,
      ]
    );
    return result.rows[0];
  }

  async attachDocument({ leaveId, fileUrl, fileName, mimeType, fileSizeBytes }) {
    const result = await pool.query(
      `INSERT INTO documents (leave_id, file_url, file_name, mime_type, file_size_bytes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [leaveId, fileUrl, fileName, mimeType, fileSizeBytes]
    );
    return result.rows[0];
  }

  async cancelLeave(leaveId, studentId) {
    const result = await pool.query(
      `UPDATE leave_applications
       SET status = 'cancelled',
           version_no = version_no + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND student_id = $2
         AND status IN ('pending', 'faculty_pending', 'submitted')
         AND is_deleted = false
       RETURNING *`,
      [leaveId, studentId]
    );
    return result.rows[0] || null;
  }

  async getStudentBalance(studentId) {
    const result = await pool.query(
      'SELECT leave_balance FROM users WHERE id = $1',
      [studentId]
    );
    return result.rows[0]?.leave_balance ?? null;
  }

  async getStudentInsights(studentId) {
    const [profileResult, metricsResult] = await Promise.all([
      pool.query(
        `SELECT leave_balance, attendance_percentage, semester
         FROM users
         WHERE id = $1`,
        [studentId]
      ),
      pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE status IN ('pending', 'faculty_pending', 'submitted')) AS pending_count,
          COUNT(*) FILTER (WHERE status IN ('approved', 'hod_approved')) AS approved_count,
          COUNT(*) FILTER (WHERE risk_flag = 'HIGH_RISK' AND status NOT IN ('rejected', 'hod_rejected', 'cancelled')) AS active_high_risk_count,
          COUNT(*) FILTER (WHERE document_required = true) AS document_required_count,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM documents d WHERE d.leave_id = leave_applications.id)) AS documented_count
         FROM leave_applications
         WHERE student_id = $1
           AND is_deleted = false`,
        [studentId]
      ),
    ]);

    return {
      profile: profileResult.rows[0] || null,
      metrics: metricsResult.rows[0] || null,
    };
  }

  async reassignLeave(leaveId, newFacultyId) {
    const result = await pool.query(
      `UPDATE leave_applications
       SET assigned_faculty_id = $2,
           version_no = version_no + 1,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status IN ('pending', 'faculty_pending', 'forwarded', 'hod_review', 'escalated') AND is_deleted = false
       RETURNING *`,
      [leaveId, newFacultyId]
    );
    return result.rows[0] || null;
  }

  async getDocumentByLeaveId(leaveId) {
    const result = await pool.query(
      `SELECT *
       FROM documents
       WHERE leave_id = $1
       ORDER BY uploaded_at DESC
       LIMIT 1`,
      [leaveId]
    );
    return result.rows[0] || null;
  }

  async listRecalculableLeaves() {
    const result = await pool.query(
      `SELECT id, student_id, start_date, end_date, start_time, end_time, total_days, approved_days, status
       FROM leave_applications
       WHERE status IN ('pending', 'faculty_pending', 'forwarded', 'hod_review', 'escalated', 'approved', 'hod_approved')
         AND is_deleted = false
       ORDER BY created_at ASC`
    );
    return result.rows;
  }

  async updateLeaveAfterRecalculation({ leaveId, totalDays, approvedDays, balanceDelta }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const leaveResult = await client.query(
        `UPDATE leave_applications
         SET total_days = $2,
             approved_days = CASE WHEN approved_days IS NULL THEN NULL ELSE $3 END,
           version_no = version_no + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [leaveId, totalDays, approvedDays]
      );

      if (balanceDelta !== 0 && leaveResult.rows[0] && ['approved', 'hod_approved'].includes(leaveResult.rows[0].status)) {
        await client.query(
          `UPDATE users
           SET leave_balance = leave_balance + $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [leaveResult.rows[0].student_id, balanceDelta]
        );
      }

      await client.query('COMMIT');
      return leaveResult.rows[0] || null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getLeaveStudentDepartment(leaveId) {
    const result = await pool.query(
      `SELECT la.id, u.department_id as student_department_id
       FROM leave_applications la
       JOIN users u ON u.id = la.student_id
       WHERE la.id = $1`,
      [leaveId]
    );
    return result.rows[0] || null;
  }

  async getFacultyDepartment(facultyId) {
    const result = await pool.query(
      `SELECT department_id
       FROM users
       WHERE id = $1 AND role = 'faculty'`,
      [facultyId]
    );
    return result.rows[0] || null;
  }
}

module.exports = new LeaveRepository();
