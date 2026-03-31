import api from './api';

export const leaveService = {
  // Student
  getLeaveTypes: () => api.get('/leaves/types'),
  getMyLeaves: () => api.get('/leaves/my'),
  getBalance: () => api.get('/leaves/balance'),
  getInsights: () => api.get('/leaves/insights'),
  predictImpact: (data) => api.post('/leaves/predict', data),
  applyLeave: (data) => {
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    return api.post('/leaves', data, isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined);
  },
  cancelLeave: (id) => api.patch(`/leaves/${id}/cancel`),

  // Faculty
  getFacultyQueue: () => api.get('/faculty/leaves'),
  forwardLeave: (id, data) => api.patch(`/faculty/leaves/${id}/forward`, data),
  rejectLeaveByFaculty: (id, data) => api.patch(`/faculty/leaves/${id}/reject`, data),

  // Admin
  getAdminStats: () => api.get('/admin/stats'),
  getAdminQueue: () => api.get('/admin/leaves'),
  getHolidays: () => api.get('/admin/holidays'),
  addHoliday: (data) => api.post('/admin/holidays', data),
  updateHoliday: (id, data) => api.put(`/admin/holidays/${id}`, data),
  deleteHoliday: (id) => api.delete(`/admin/holidays/${id}`),
  getDelegations: () => api.get('/admin/delegations'),
  createDelegation: (data) => api.post('/admin/delegations', data),
  deactivateDelegation: (id) => api.patch(`/admin/delegations/${id}/deactivate`),
  reassignLeave: (id, data) => api.patch(`/admin/leaves/${id}/reassign`, data),
  recalculateHolidayImpact: () => api.post('/admin/recalculate-holiday-impact'),
  resetAcademicYear: () => api.post('/admin/academic-year/reset'),
  getAuditLogs: (limit = 100) => api.get('/admin/audit-logs', { params: { limit } }),
  approveLeave: (id, data) => api.patch(`/admin/leaves/${id}/approve`, data),
  approveBulk: (data) => api.patch('/admin/leaves/bulk/approve', data),
  rejectLeaveByAdmin: (id, data) => api.patch(`/admin/leaves/${id}/reject`, data),
  rejectBulk: (data) => api.patch('/admin/leaves/bulk/reject', data),
  verifyDocument: (id) => api.patch(`/admin/documents/${id}/verify`),
  getAllUsers: () => api.get('/admin/users'),
  toggleUserStatus: (id) => api.patch(`/admin/users/${id}/toggle`),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),

  // Reports
  getReports: (params) => api.get('/reports', { params }),
  getReportStats: (params) => api.get('/reports/stats', { params }),

  // Academic
  getSections: (params) => api.get('/academic/sections', { params }),
  getSubjects: (params) => api.get('/academic/subjects', { params }),
  createSubject: (data) => api.post('/academic/subjects', data),
  getClassSlots: (params) => api.get('/academic/slots', { params }),
  getMyTeachingAssignments: () => api.get('/academic/assignments/me'),
  createClassSlot: (data) => api.post('/academic/slots', data),
  updateClassSlot: (id, data) => api.put(`/academic/slots/${id}`, data),
  deleteClassSlot: (id) => api.delete(`/academic/slots/${id}`),
  markClassSession: (data) => api.post('/academic/sessions', data),
  markAttendance: (classSessionId, data) => api.post(`/academic/sessions/${classSessionId}/attendance`, data),
  updateSessionLifecycle: (classSessionId, data) => api.patch(`/academic/sessions/${classSessionId}/lifecycle`, data),
  getFacultyRecentSessions: (params) => api.get('/academic/faculty/sessions/recent', { params }),
  getSessionStudents: (classSessionId) => api.get(`/academic/sessions/${classSessionId}/students`),
  getAttendanceHistory: (classSessionId, params) => api.get(`/academic/sessions/${classSessionId}/attendance/history`, { params }),
  getMyAttendance: (subjectId) => api.get('/academic/attendance/me', { params: { subjectId } }),
  predictMyAttendance: (subjectId) => api.get('/academic/attendance/predict', { params: { subjectId } }),
  getMyAttendanceInsights: () => api.get('/academic/attendance/insights/me'),
  getFacultyInsights: () => api.get('/academic/faculty/insights/me'),

  // Notifications
  getMyNotifications: (limit = 20) => api.get('/notifications/me', { params: { limit } }),
  markNotificationRead: (id) => api.patch(`/notifications/${id}/read`),
};
