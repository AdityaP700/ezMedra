const pool = require('../config/db');

const resolveAdminDelegation = async (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return next();
  }

  try {
    const result = await pool.query(
      `SELECT d.*, ua.admin_type as from_admin_type, ua.department_id as from_department_id
       FROM delegations d
       JOIN users ua ON d.from_admin_id = ua.id
       WHERE d.to_admin_id = $1
         AND d.is_active = true
         AND CURRENT_DATE BETWEEN d.start_date AND d.end_date
       ORDER BY d.created_at DESC
       LIMIT 1`,
      [req.user.userId]
    );

    const delegation = result.rows[0];
    if (delegation) {
      req.user.isDelegated = true;
      req.user.delegationId = delegation.id;
      req.user.actingFromAdminId = delegation.from_admin_id;
      if (delegation.scope === 'GLOBAL') {
        req.user.adminType = 'SUPER_ADMIN';
      } else {
        req.user.adminType = 'DEPARTMENT_ADMIN';
        req.user.departmentId = delegation.from_department_id;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { resolveAdminDelegation };
