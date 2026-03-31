const facultyRepository = require('./faculty.repository');
const { AppError } = require('../../middleware/errorHandler');

class FacultyService {
  async getPendingLeaves(departmentId, facultyId) {
    if (!departmentId) {
      throw new AppError('Faculty must be assigned to a department.', 400);
    }

    await facultyRepository.autoForwardStalePendingLeaves(departmentId);

    return facultyRepository.getPendingLeaves(departmentId, facultyId);
  }

  async forwardLeave(leaveId, facultyId, departmentId, remarks) {
    // Verify leave exists and belongs to faculty's department
    const leave = await facultyRepository.getLeaveById(leaveId);
    if (!leave) {
      throw new AppError('Leave application not found.', 404);
    }
    if (leave.student_department_id !== departmentId) {
      throw new AppError('This leave is not from your department.', 403);
    }
    if (!['faculty_pending', 'pending'].includes(leave.status)) {
      throw new AppError('Only pending leaves can be forwarded.', 400);
    }

    if (String(leave.risk_tier || '').toUpperCase() === 'RED' && (!remarks || remarks.trim().length < 10)) {
      throw new AppError('High-risk (<60%) approval recommendation requires remarks (minimum 10 chars).', 400);
    }

    const updated = await facultyRepository.forwardLeave(leaveId, facultyId, remarks || null);
    if (!updated) {
      throw new AppError('Failed to forward leave application.', 500);
    }
    return updated;
  }

  async rejectLeave(leaveId, facultyId, departmentId, remarks) {
    if (!remarks || remarks.trim().length < 5) {
      throw new AppError('Remarks are required when rejecting (min 5 chars).', 400);
    }

    const leave = await facultyRepository.getLeaveById(leaveId);
    if (!leave) {
      throw new AppError('Leave application not found.', 404);
    }
    if (leave.student_department_id !== departmentId) {
      throw new AppError('This leave is not from your department.', 403);
    }
    if (!['faculty_pending', 'pending'].includes(leave.status)) {
      throw new AppError('Only pending leaves can be rejected.', 400);
    }

    const updated = await facultyRepository.rejectLeave(leaveId, facultyId, remarks);
    if (!updated) {
      throw new AppError('Failed to send rejection recommendation.', 500);
    }
    return updated;
  }
}

module.exports = new FacultyService();
