import api from './api';

export const authService = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getProfile: () => api.get('/auth/profile'),
  getDepartments: () => api.get('/auth/departments'),
  getSections: (params) => api.get('/auth/sections', { params }),
};
