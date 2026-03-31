const pool = require('../../config/db');

class AdminRepository {
  async getForwardedLeaves(scope = {}) {
    const params = [];
    let scopeWhere = '';

    if (scope.adminType === 'DEPARTMENT_ADMIN') {
      params.push(scope.departmentId);
      scopeWhere = ` AND us.department_id = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT la.*, lt.name as leave_type_name,
              EXISTS(SELECT 1 FROM documents doc WHERE doc.leave_id = la.id) as has_document,
              us.first_name || ' ' || us.last_name as student_name,
              us.email as student_email,
              d.name as department_name,
              uf.first_name || ' ' || uf.last_name as faculty_name,
              la.faculty_remarks,
              COALESCE(la.current_attendance, 100) as current_attendance,
              COALESCE(la.risk_indicator,
                CASE
                  WHEN COALESCE(la.projected_attendance, 100) < 70 THEN 'RED'
                  WHEN COALESCE(la.projected_attendance, 100) < 75 THEN 'YELLOW'
                  ELSE 'GREEN'
                END
              ) as risk_indicator,
              COALESCE(la.recommendation,
                CASE WHEN COALESCE(la.projected_attendance, 100) < 75 THEN 'REJECT' ELSE 'APPROVE' END
              ) as recommendation
       FROM leave_applications la
       JOIN leave_types lt ON la.leave_type_id = lt.id
       JOIN users us ON la.student_id = us.id
       LEFT JOIN departments d ON us.department_id = d.id
       LEFT JOIN users uf ON la.reviewed_by_faculty = uf.id
       WHERE la.status IN ('forwarded', 'hod_review', 'escalated', 'conflict', 'provisional')
         AND la.is_deleted = false
       ${scopeWhere}
       ORDER BY la.created_at ASC`,
      params
    );
    return result.rows;
  }

  /**
   * TRANSACTION-BASED APPROVAL
   * BEGIN → UPDATE leave_applications → UPDATE users balance → COMMIT
   * Rollback on any failure
   */
  async approveLeave(leaveId, adminId, remarks, approvedDays = null, scope = {}, options = {}) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const params = [leaveId];
      let scopeWhere = '';
      if (scope.adminType === 'DEPARTMENT_ADMIN') {
        params.push(scope.departmentId);
        scopeWhere = ` AND us.department_id = $${params.length}`;
      }

      // 1. Get the leave application with lock
      const leaveResult = await client.query(
        `SELECT la.*, us.leave_balance,
          EXISTS(SELECT 1 FROM documents doc WHERE doc.leave_id = la.id) as has_document
         FROM leave_applications la
         JOIN users us ON la.student_id = us.id
         WHERE la.id = $1
           AND la.status IN ('forwarded', 'hod_review', 'escalated', 'conflict', 'provisional')
           AND la.is_deleted = false
         ${scopeWhere}
         FOR UPDATE`,
        params
      );

      const leave = leaveResult.rows[0];
      if (!leave) {
        await client.query('ROLLBACK');
        return { error: 'Leave not found, already processed, or out of your admin scope.' };
      }

      const finalApprovedDays = approvedDays ? Number(approvedDays) : Number(leave.total_days);
      const overrideHighRisk = !!options.overrideHighRisk;
      if (!Number.isFinite(finalApprovedDays) || finalApprovedDays <= 0) {
        await client.query('ROLLBACK');
        return { error: 'Approved days must be a positive number.' };
      }
      if (finalApprovedDays > Number(leave.total_days)) {
        await client.query('ROLLBACK');
        return { error: 'Approved days cannot exceed requested days.' };
      }

      const belowThreshold = Number(leave.projected_attendance) < 75;
      const requiresDiscretionaryOverride = belowThreshold && !leave.has_document;
      if (requiresDiscretionaryOverride && !overrideHighRisk) {
        await client.query('ROLLBACK');
        return { error: 'This leave is below 75% projected attendance. Enable overrideHighRisk and provide remarks for discretionary approval.' };
      }

      if (leave.risk_flag === 'HIGH_RISK' && !leave.has_document && !overrideHighRisk) {
        await client.query('ROLLBACK');
        return { error: 'High-risk leave requires verified document or explicit overrideHighRisk=true.' };
      }
      if (overrideHighRisk && (!remarks || String(remarks).trim().length < 10)) {
        await client.query('ROLLBACK');
        return { error: 'High-risk override requires detailed admin remarks (minimum 10 characters).' };
      }

      // 2. Check sufficient balance
      if (leave.leave_balance < finalApprovedDays) {
        await client.query('ROLLBACK');
        return { error: `Insufficient leave balance. Available: ${leave.leave_balance}, Required: ${finalApprovedDays}` };
      }

      // 3. Update leave application status
      await client.query(
        `UPDATE leave_applications
         SET status = 'hod_approved',
             reviewed_by_admin = $2,
             admin_remarks = $3,
             approved_days = $4,
             override_flag = CASE WHEN faculty_recommendation = 'reject' OR $5::boolean = true THEN true ELSE false END,
             admin_reviewed_at = CURRENT_TIMESTAMP,
           version_no = version_no + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [leaveId, adminId, remarks || null, finalApprovedDays, overrideHighRisk]
      );

      // 4. Deduct leave balance
      await client.query(
        `UPDATE users
         SET leave_balance = leave_balance - $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [leave.student_id, finalApprovedDays]
      );

      await client.query('COMMIT');

      // Return updated leave
      const updated = await pool.query(
        `SELECT la.*, lt.name as leave_type_name,
                us.first_name || ' ' || us.last_name as student_name,
                us.leave_balance as new_balance
         FROM leave_applications la
         JOIN leave_types lt ON la.leave_type_id = lt.id
         JOIN users us ON la.student_id = us.id
         WHERE la.id = $1`,
        [leaveId]
      );

      return { data: updated.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async rejectLeave(leaveId, adminId, remarks, scope = {}) {
    const params = [leaveId, adminId, remarks];
    let scopeWhere = '';
    if (scope.adminType === 'DEPARTMENT_ADMIN') {
      params.push(scope.departmentId);
      scopeWhere = ` AND student_id IN (SELECT id FROM users WHERE department_id = $${params.length})`;
    }

    const result = await pool.query(
      `UPDATE leave_applications
       SET status = 'hod_rejected',
           reviewed_by_admin = $2,
           admin_remarks = $3,
           admin_reviewed_at = CURRENT_TIMESTAMP,
           version_no = version_no + 1,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND status IN ('forwarded', 'hod_review', 'escalated', 'conflict', 'provisional')
           AND is_deleted = false
       ${scopeWhere}
       RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  async verifyDocument(documentId, adminId) {
    const result = await pool.query(
      `UPDATE documents
       SET document_verified = true,
           verified_by_admin = $2,
           verified_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [documentId, adminId]
    );
    return result.rows[0] || null;
  }

  async getAllUsers(scope = {}) {
    const params = [];
    let scopeWhere = '';
    if (scope.adminType === 'DEPARTMENT_ADMIN') {
      params.push(scope.departmentId);
      scopeWhere = ` WHERE u.department_id = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.department_id,
              u.admin_type, u.leave_balance, u.is_active, u.created_at,
              d.name as department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       ${scopeWhere}
       ORDER BY u.created_at DESC`
      , params
    );
    return result.rows;
  }

  async toggleUserStatus(userId) {
    const result = await pool.query(
      `UPDATE users SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, first_name, last_name, email, role, is_active`,
      [userId]
    );
    return result.rows[0] || null;
  }

  async deleteUser(userId) {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, email',
      [userId]
    );
    return result.rows[0] || null;
  }

  async getStats(scope = {}) {
    const params = [];
    let scopeWhere = ' WHERE is_deleted = false';
    if (scope.adminType === 'DEPARTMENT_ADMIN') {
      params.push(scope.departmentId);
      scopeWhere += ` AND student_id IN (SELECT id FROM users WHERE department_id = $${params.length})`;
    }

    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('pending', 'faculty_pending', 'submitted')) as pending,
        COUNT(*) FILTER (WHERE status IN ('forwarded', 'hod_review', 'escalated', 'conflict', 'provisional')) as forwarded,
        COUNT(*) FILTER (WHERE status IN ('approved', 'hod_approved')) as approved,
        COUNT(*) FILTER (WHERE status IN ('rejected', 'hod_rejected')) as rejected,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
      FROM leave_applications
      ${scopeWhere}
    `, params);
    return result.rows[0];
  }

  async getHolidays() {
    const result = await pool.query(
      `SELECT id, name, date, type, is_recurring, rule, description, created_at
       FROM holidays
       ORDER BY COALESCE(date, CURRENT_DATE) ASC, name ASC`
    );
    return result.rows;
  }

  async addHoliday({ name, date, type = 'PUBLIC', isRecurring = false, rule = null, description = null }) {
    const result = await pool.query(
      `INSERT INTO holidays (name, date, type, is_recurring, rule, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING id, name, date, type, is_recurring, rule, description, created_at`,
      [name, date || null, type, !!isRecurring, rule || null, description || null]
    );
    return result.rows[0] || null;
  }

  async updateHoliday(id, { name, date, type, isRecurring, rule, description }) {
    const result = await pool.query(
      `UPDATE holidays
       SET name = $2,
           date = $3,
           type = $4,
           is_recurring = $5,
           rule = $6,
           description = $7
       WHERE id = $1
       RETURNING id, name, date, type, is_recurring, rule, description, created_at`,
      [id, name, date || null, type, !!isRecurring, rule || null, description || null]
    );
    return result.rows[0] || null;
  }

  async deleteHoliday(id) {
    const result = await pool.query(
      `DELETE FROM holidays
       WHERE id = $1
       RETURNING id, name, date, type, is_recurring, rule, description`,
      [id]
    );
    return result.rows[0] || null;
  }

  async rebuildHolidayInstances(fromDate, toDate) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `DELETE FROM holiday_instances
         WHERE date BETWEEN $1::date AND $2::date`,
        [fromDate, toDate]
      );

      const holidaysResult = await client.query(
        `SELECT id, date, type, is_recurring, rule
         FROM holidays`
      );

      const datesResult = await client.query(
        `SELECT generate_series($1::date, $2::date, interval '1 day')::date as date`,
        [fromDate, toDate]
      );

      const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      const rowsToInsert = [];
      for (const d of datesResult.rows) {
        const date = new Date(d.date);
        const day = date.getUTCDay();
        const ordinal = Math.floor((date.getUTCDate() - 1) / 7) + 1;

        for (const h of holidaysResult.rows) {
          let matches = false;

          if (h.type === 'WEEKEND_RULE' && h.rule) {
            const m = String(h.rule).trim().toLowerCase().match(/^(\d+)(st|nd|rd|th)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i);
            if (m) {
              const nth = Number(m[1]);
              const weekday = weekdays.indexOf(m[3]);
              matches = weekday === day && nth === ordinal;
            }
          } else if (h.date) {
            const hd = new Date(h.date);
            if (h.is_recurring) {
              matches = hd.getUTCMonth() === date.getUTCMonth() && hd.getUTCDate() === date.getUTCDate();
            } else {
              matches = hd.toISOString().slice(0, 10) === date.toISOString().slice(0, 10);
            }
          }

          if (matches) {
            rowsToInsert.push({ holidayId: h.id, date: date.toISOString().slice(0, 10) });
          }
        }
      }

      for (const row of rowsToInsert) {
        await client.query(
          `INSERT INTO holiday_instances (holiday_id, date)
           VALUES ($1, $2)
           ON CONFLICT (holiday_id, date) DO NOTHING`,
          [row.holidayId, row.date]
        );
      }

      await client.query('COMMIT');
      return { generated: rowsToInsert.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async syncHolidaySessionsByDate(date, holidayName, isRecurring = false) {
    if (!date) {
      return { cancelledCount: 0 };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let sessionResult;
      if (isRecurring) {
        sessionResult = await client.query(
          `UPDATE class_sessions
           SET status = 'CANCELLED',
               cancellation_source = 'HOLIDAY',
               cancellation_reason = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM $1::date)
             AND EXTRACT(DAY FROM date) = EXTRACT(DAY FROM $1::date)
             AND type = 'REGULAR'
             AND status = 'CONDUCTED'
           RETURNING id`,
          [date, `Holiday: ${holidayName || 'Academic Holiday'}`]
        );
      } else {
        sessionResult = await client.query(
          `UPDATE class_sessions
           SET status = 'CANCELLED',
               cancellation_source = 'HOLIDAY',
               cancellation_reason = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE date = $1
             AND type = 'REGULAR'
             AND status = 'CONDUCTED'
           RETURNING id`,
          [date, `Holiday: ${holidayName || 'Academic Holiday'}`]
        );
      }

      if (sessionResult.rows.length > 0) {
        await client.query(
          `DELETE FROM attendance
           WHERE class_session_id = ANY($1::int[])`,
          [sessionResult.rows.map((row) => row.id)]
        );
      }

      await client.query('COMMIT');
      return { cancelledCount: sessionResult.rows.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getDelegations() {
    const result = await pool.query(
      `SELECT d.*,
              uf.first_name || ' ' || uf.last_name as from_admin_name,
              ut.first_name || ' ' || ut.last_name as to_admin_name
       FROM delegations d
       JOIN users uf ON d.from_admin_id = uf.id
       JOIN users ut ON d.to_admin_id = ut.id
       ORDER BY d.created_at DESC`
    );
    return result.rows;
  }

  async createDelegation({ fromAdminId, toAdminId, startDate, endDate, scope }) {
    const result = await pool.query(
      `INSERT INTO delegations (from_admin_id, to_admin_id, start_date, end_date, scope)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [fromAdminId, toAdminId, startDate, endDate, scope]
    );
    return result.rows[0];
  }

  async incrementDelegationUsage(toAdminId) {
    await pool.query(
      `UPDATE delegations
       SET approvals_used = approvals_used + 1
       WHERE to_admin_id = $1
         AND is_active = true
         AND CURRENT_DATE BETWEEN start_date AND end_date`,
      [toAdminId]
    );
  }

  async deactivateDelegation(id) {
    const result = await pool.query(
      `UPDATE delegations
       SET is_active = false
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  async cleanupExpiredDelegations() {
    const result = await pool.query(
      `UPDATE delegations
       SET is_active = false
       WHERE is_active = true
         AND end_date < CURRENT_DATE
       RETURNING id`
    );
    return { cleaned: result.rows.length };
  }

  async reassignLeave(leaveId, newFacultyId, reason, actorId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const leaveResult = await client.query(
        `SELECT * FROM leave_applications WHERE id = $1 AND is_deleted = false FOR UPDATE`,
        [leaveId]
      );
      const leave = leaveResult.rows[0];
      if (!leave) {
        await client.query('ROLLBACK');
        return null;
      }

      const oldFacultyId = leave.assigned_faculty_id;
      const updatedResult = await client.query(
        `UPDATE leave_applications
         SET assigned_faculty_id = $2,
           version_no = version_no + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND is_deleted = false
         RETURNING *`,
        [leaveId, newFacultyId]
      );

      await client.query(
        `INSERT INTO leave_reassignment_logs (leave_id, old_faculty_id, new_faculty_id, reason, reassigned_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [leaveId, oldFacultyId, newFacultyId, reason, actorId]
      );

      await client.query('COMMIT');
      return updatedResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new AdminRepository();
