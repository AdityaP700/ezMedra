const pool = require('../../config/db');

class ReportsRepository {
  async getLeaveReport({ startDate, endDate, status, studentId, departmentId, page = 1, limit = 50 }) {
    let query = `
      SELECT la.*, lt.name as leave_type_name,
             us.first_name || ' ' || us.last_name as student_name,
             us.email as student_email,
             d.name as department_name,
             uf.first_name || ' ' || uf.last_name as faculty_name,
             ua.first_name || ' ' || ua.last_name as admin_name
      FROM leave_applications la
      JOIN leave_types lt ON la.leave_type_id = lt.id
      JOIN users us ON la.student_id = us.id
      LEFT JOIN departments d ON us.department_id = d.id
      LEFT JOIN users uf ON la.reviewed_by_faculty = uf.id
      LEFT JOIN users ua ON la.reviewed_by_admin = ua.id
      WHERE 1=1
    `;
    let countQuery = `
      SELECT COUNT(*) as total
      FROM leave_applications la
      JOIN users us ON la.student_id = us.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND la.start_date >= $${paramIndex++}`;
      countQuery += ` AND la.start_date >= $${paramIndex - 1}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND la.end_date <= $${paramIndex++}`;
      countQuery += ` AND la.end_date <= $${paramIndex - 1}`;
      params.push(endDate);
    }
    if (status) {
      query += ` AND la.status = $${paramIndex++}`;
      countQuery += ` AND la.status = $${paramIndex - 1}`;
      params.push(status);
    }
    if (studentId) {
      query += ` AND la.student_id = $${paramIndex++}`;
      countQuery += ` AND la.student_id = $${paramIndex - 1}`;
      params.push(studentId);
    }
    if (departmentId) {
      query += ` AND us.department_id = $${paramIndex++}`;
      countQuery += ` AND us.department_id = $${paramIndex - 1}`;
      params.push(departmentId);
    }

    const countResult = await pool.query(countQuery, params);
    const total = Number(countResult.rows?.[0]?.total || 0);

    // Paginated results
    const offset = (page - 1) * limit;
    query += ` ORDER BY la.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    return {
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAggregateStats({ startDate, endDate, departmentId }) {
    let query = `
      SELECT
        COUNT(*) as total_applications,
        COUNT(*) FILTER (WHERE la.status = 'pending') as pending,
        COUNT(*) FILTER (WHERE la.status = 'forwarded') as forwarded,
        COUNT(*) FILTER (WHERE la.status = 'approved') as approved,
        COUNT(*) FILTER (WHERE la.status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE la.status = 'cancelled') as cancelled,
        COALESCE(SUM(la.total_days) FILTER (WHERE la.status = 'approved'), 0) as total_approved_days
      FROM leave_applications la
      JOIN users us ON la.student_id = us.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND la.start_date >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND la.end_date <= $${paramIndex++}`;
      params.push(endDate);
    }
    if (departmentId) {
      query += ` AND us.department_id = $${paramIndex++}`;
      params.push(departmentId);
    }

    const result = await pool.query(query, params);
    return result.rows[0];
  }
}

module.exports = new ReportsRepository();
