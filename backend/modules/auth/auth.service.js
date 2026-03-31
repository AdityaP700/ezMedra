const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authRepository = require('./auth.repository');
const { AppError } = require('../../middleware/errorHandler');

class AuthService {
  async _ensureFacultyTeachingSetup(user) {
    if (!user || !['faculty', 'phd_scholar', 'ta'].includes(user.role)) {
      return user;
    }

    if (!user.department_id) {
      return user;
    }

    await authRepository.ensureDefaultFacultyTeachingSetup(user.id, user.department_id);
    return user;
  }

  async _ensureStudentSectionAssignment(user) {
    if (!user || user.role !== 'student') {
      return user;
    }

    if (user.section_id) {
      return user;
    }

    if (!user.department_id) {
      return user;
    }

    const sections = await authRepository.getSectionsForOnboarding(user.department_id, null);
    if (!sections.length) {
      return user;
    }

    // Prefer section with same semester; otherwise use least filled.
    const semesterMatch = sections.find((s) => Number(s.semester) === Number(user.semester));
    const chosenSection = semesterMatch || sections[0];
    await authRepository.updateUserSectionAndSemester(user.id, chosenSection.id, chosenSection.semester);
    return authRepository.findById(user.id);
  }

  async register({ firstName, lastName, email, password, role, departmentId, sectionId, academicYear, studentCode, program, semester }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    // Check if user already exists
    const existingUser = await authRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new AppError('Email already registered.', 409);
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    let resolvedDepartmentId = departmentId || null;
    let resolvedSectionId = sectionId || null;
    let resolvedSemester = semester || 1;

    if (role === 'student') {
      if (!resolvedDepartmentId) {
        throw new AppError('Department is required for student registration.', 400);
      }

      let selectedSection = null;
      if (resolvedSectionId) {
        selectedSection = await authRepository.getSectionById(resolvedSectionId);
        if (!selectedSection || Number(selectedSection.department_id) !== Number(resolvedDepartmentId)) {
          throw new AppError('Selected section does not belong to the chosen department.', 400);
        }
      } else {
        selectedSection = await authRepository.pickLeastFilledSection(resolvedDepartmentId, academicYear || null);
        if (!selectedSection) {
          throw new AppError('No section available for selected department/year. Contact admin.', 400);
        }
      }

      resolvedSectionId = selectedSection.id;
      resolvedSemester = selectedSection.semester;
    }

    if ((role === 'faculty' || role === 'phd_scholar' || role === 'ta') && !resolvedDepartmentId) {
      throw new AppError('Department is required for faculty registration.', 400);
    }

    // Create user
    const user = await authRepository.createUser({
      firstName,
      lastName,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      departmentId: resolvedDepartmentId,
      sectionId: resolvedSectionId,
      studentCode: studentCode || null,
      program: program || null,
      semester: resolvedSemester,
    });

    // Create faculty profile if teaching-capable role
    if ((role === 'faculty' || role === 'phd_scholar' || role === 'ta') && resolvedDepartmentId) {
      await authRepository.createFacultyProfile(user.id, resolvedDepartmentId);
    }

    if (['faculty', 'phd_scholar', 'ta'].includes(role) && resolvedDepartmentId) {
      await this._ensureFacultyTeachingSetup(user);
    }

    // Generate token
    const token = this._generateToken(user);

    return { user: this._sanitizeUser(user), token };
  }

  async login(email, password) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    // Find user
    const user = await authRepository.findByEmail(normalizedEmail);
    if (!user) {
      throw new AppError('Invalid email or password.', 401);
    }

    if (!user.is_active) {
      throw new AppError('Account is deactivated. Contact admin.', 403);
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError('Invalid email or password.', 401);
    }

    let hydratedUser = await this._ensureStudentSectionAssignment(user);
    hydratedUser = await this._ensureFacultyTeachingSetup(hydratedUser);

    // Generate token
    const token = this._generateToken(hydratedUser);

    return { user: this._sanitizeUser(hydratedUser), token };
  }

  async getProfile(userId) {
    const rawUser = await authRepository.findById(userId);
    if (!rawUser) {
      throw new AppError('User not found.', 404);
    }
    let user = await this._ensureStudentSectionAssignment(rawUser);
    user = await this._ensureFacultyTeachingSetup(user);
    return user;
  }

  async getDepartments() {
    return authRepository.getDepartments();
  }

  async getSectionsForOnboarding(departmentId, academicYear = null) {
    if (!departmentId) {
      throw new AppError('departmentId is required.', 400);
    }
    return authRepository.getSectionsForOnboarding(Number(departmentId), academicYear ? Number(academicYear) : null);
  }

  _generateToken(user) {
    const rolePermissions = {
      admin: { approveLeave: true, markAttendance: false, manageHoliday: true },
      faculty: { approveLeave: false, markAttendance: true, manageHoliday: false },
      phd_scholar: { approveLeave: false, markAttendance: true, manageHoliday: false },
      ta: { approveLeave: false, markAttendance: true, manageHoliday: false },
      student: { approveLeave: false, markAttendance: false, manageHoliday: false },
    };

    return jwt.sign(
      {
        userId: user.id,
        role: user.role,
        departmentId: user.department_id,
        adminType: user.admin_type || null,
        permissions: rolePermissions[user.role] || {},
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
  }

  _sanitizeUser(user) {
    const { password, ...safeUser } = user;
    return safeUser;
  }
}

module.exports = new AuthService();
