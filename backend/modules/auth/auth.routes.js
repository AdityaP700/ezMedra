const express = require('express');
const { body, query } = require('express-validator');
const { register, login, getProfile, getDepartments, getSectionsForOnboarding } = require('./auth.controller');
const { verifyToken } = require('../../middleware/auth.middleware');
const { validateRequest } = require('../../middleware/validate');

const router = express.Router();

// ── Validation Rules ──────────────────────────────
const registerValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required.'),
  body('lastName').trim().notEmpty().withMessage('Last name is required.'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters.'),
  body('role')
    .isIn(['student', 'faculty', 'phd_scholar', 'ta', 'admin'])
    .withMessage('Role must be student, faculty, phd_scholar, ta, or admin.'),
  body('departmentId').optional().isInt().withMessage('Department ID must be an integer.'),
  body('sectionId').optional().isInt().withMessage('Section ID must be an integer.'),
  body('academicYear').optional().isInt({ min: 1, max: 4 }).withMessage('academicYear must be between 1 and 4.'),
  body('studentCode').optional().isLength({ min: 5, max: 20 }).withMessage('studentCode must be 5-20 characters.'),
  body('program').optional().isIn(['BTECH', 'MTECH', 'PHD']).withMessage('program must be BTECH, MTECH, or PHD.'),
  body('semester').optional().isInt({ min: 1, max: 10 }).withMessage('Semester must be between 1 and 10.'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
];

// ── Routes ────────────────────────────────────────
router.post('/register', registerValidation, validateRequest, register);
router.post('/login', loginValidation, validateRequest, login);
router.get('/profile', verifyToken, getProfile);
router.get('/departments', getDepartments);
router.get(
  '/sections',
  [
    query('departmentId').isInt({ min: 1 }).withMessage('departmentId is required and must be valid.'),
    query('academicYear').optional().isInt({ min: 1, max: 4 }).withMessage('academicYear must be between 1 and 4.'),
  ],
  validateRequest,
  getSectionsForOnboarding
);

module.exports = router;
