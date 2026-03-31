const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Access denied. No token provided.', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    throw new AppError('Invalid or expired token.', 401);
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError('Access denied. Insufficient permissions.', 403);
    }
    next();
  };
};

const ROLE_PERMISSION_FALLBACK = {
  admin: { approveLeave: true, markAttendance: false, manageHoliday: true },
  faculty: { approveLeave: false, markAttendance: true, manageHoliday: false },
  phd_scholar: { approveLeave: false, markAttendance: true, manageHoliday: false },
  ta: { approveLeave: false, markAttendance: true, manageHoliday: false },
  student: { approveLeave: false, markAttendance: false, manageHoliday: false },
};

const authorizePermission = (permissionKey) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new AppError('Access denied. No authenticated user.', 401, 'AUTH_REQUIRED');
    }

    const tokenPermissions = req.user.permissions || {};
    const fallback = ROLE_PERMISSION_FALLBACK[req.user.role] || {};
    const allowed = tokenPermissions[permissionKey] === true || fallback[permissionKey] === true;

    if (!allowed) {
      throw new AppError(`Access denied. Missing permission: ${permissionKey}.`, 403, 'PERMISSION_DENIED');
    }
    next();
  };
};

module.exports = { verifyToken, authorizeRoles, authorizePermission };
