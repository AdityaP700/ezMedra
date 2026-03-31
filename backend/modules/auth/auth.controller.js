const authService = require('./auth.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, role, departmentId, sectionId, academicYear, studentCode, program, semester } = req.body;

  const result = await authService.register({
    firstName,
    lastName,
    email,
    password,
    role,
    departmentId,
    sectionId,
    academicYear,
    studentCode,
    program,
    semester,
  });

  res.status(201).json({
    success: true,
    message: 'Registration successful.',
    data: result,
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const result = await authService.login(email, password);

  res.json({
    success: true,
    message: 'Login successful.',
    data: result,
  });
});

const getProfile = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.userId);

  res.json({
    success: true,
    data: user,
  });
});

const getDepartments = asyncHandler(async (req, res) => {
  const departments = await authService.getDepartments();

  res.json({
    success: true,
    data: departments,
  });
});

const getSectionsForOnboarding = asyncHandler(async (req, res) => {
  const sections = await authService.getSectionsForOnboarding(req.query.departmentId, req.query.academicYear);

  res.json({
    success: true,
    data: sections,
  });
});

module.exports = { register, login, getProfile, getDepartments, getSectionsForOnboarding };
