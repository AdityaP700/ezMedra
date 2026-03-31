const pool = require('../../config/db');

class FacultyRepository {
  async autoForwardStalePendingLeaves(departmentId) {
    const result = await pool.query(
      `UPDATE leave_applications la
       SET status = 'escalated',
           faculty_recommendation = 'forward',
           faculty_remarks = COALESCE(la.faculty_remarks, 'Auto-escalated to HOD after faculty SLA timeout.'),
           hod_deadline_at = COALESCE(la.hod_deadline_at, CURRENT_TIMESTAMP + INTERVAL '24 hours'),
           updated_at = CURRENT_TIMESTAMP
       FROM users us
       WHERE la.student_id = us.id
         AND us.department_id = $1
         AND la.status IN ('faculty_pending', 'pending')
         AND la.is_deleted = false
         AND COALESCE(la.faculty_deadline_at, la.created_at + INTERVAL '24 hours') < NOW()
       RETURNING la.id`,
      [departmentId]
    );

    return result.rows.length;
  }

  async getPendingLeaves(departmentId, facultyId) {
    const result = await pool.query(
      `SELECT la.*, lt.name as leave_type_name,
              us.first_name || ' ' || us.last_name as student_name,
              us.email as student_email
       FROM leave_applications la
       JOIN leave_types lt ON la.leave_type_id = lt.id
       JOIN users us ON la.student_id = us.id
       WHERE us.department_id = $1
         AND la.status IN ('faculty_pending', 'pending')
         AND la.is_deleted = false
         AND (la.assigned_faculty_id IS NULL OR la.assigned_faculty_id = $2)
       ORDER BY
         CASE WHEN la.risk_flag = 'HIGH_RISK' THEN 0 ELSE 1 END,
         CASE WHEN la.is_late = true THEN 0 ELSE 1 END,
         la.start_date ASC,
         la.created_at ASC`,
      [departmentId, facultyId]
    );
    return result.rows;
  }

  async forwardLeave(leaveId, facultyId, remarks) {
    const result = await pool.query(
      `UPDATE leave_applications
       SET status = 'hod_review',
           reviewed_by_faculty = $2,
           faculty_remarks = $3,
           faculty_recommendation = 'forward',
           faculty_reviewed_at = CURRENT_TIMESTAMP,
           hod_deadline_at = COALESCE(hod_deadline_at, CURRENT_TIMESTAMP + INTERVAL '24 hours'),
           version_no = version_no + 1,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status IN ('faculty_pending', 'pending') AND is_deleted = false
       RETURNING *`,
      [leaveId, facultyId, remarks]
    );
    return result.rows[0] || null;
  }

  async rejectLeave(leaveId, facultyId, remarks) {
    const result = await pool.query(
      `UPDATE leave_applications
       SET status = 'hod_review',
           reviewed_by_faculty = $2,
           faculty_remarks = $3,
           faculty_recommendation = 'reject',
           faculty_reviewed_at = CURRENT_TIMESTAMP,
           hod_deadline_at = COALESCE(hod_deadline_at, CURRENT_TIMESTAMP + INTERVAL '24 hours'),
           version_no = version_no + 1,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status IN ('faculty_pending', 'pending') AND is_deleted = false
       RETURNING *`,
      [leaveId, facultyId, remarks]
    );
    return result.rows[0] || null;
  }

  async getLeaveById(leaveId) {
    const result = await pool.query(
      `SELECT la.*, lt.name as leave_type_name,
              us.first_name || ' ' || us.last_name as student_name,
              us.department_id as student_department_id
       FROM leave_applications la
       JOIN leave_types lt ON la.leave_type_id = lt.id
       JOIN users us ON la.student_id = us.id
       WHERE la.id = $1 AND la.is_deleted = false`,
      [leaveId]
    );
    return result.rows[0] || null;
  }
}

module.exports = new FacultyRepository();
