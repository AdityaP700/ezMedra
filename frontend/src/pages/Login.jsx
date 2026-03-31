import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import toast from 'react-hot-toast';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [sections, setSections] = useState([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, register, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'student',
    departmentId: '',
    academicYear: '2',
    sectionId: '',
    autoAssignSection: 'true',
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isAuthenticated && user) {
      const routes = {
        student: '/student',
        faculty: '/faculty',
        phd_scholar: '/faculty',
        ta: '/faculty',
        admin: '/admin',
      };
      navigate(routes[user.role] || '/');
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    authService.getDepartments().then((res) => {
      setDepartments(res.data.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const shouldLoadSections = !isLogin
      && form.role === 'student'
      && form.departmentId
      && form.academicYear;

    if (!shouldLoadSections) {
      setSections([]);
      return;
    }

    let isMounted = true;
    setLoadingSections(true);
    authService.getSections({
      departmentId: Number(form.departmentId),
      academicYear: Number(form.academicYear),
    })
      .then((res) => {
        if (!isMounted) return;
        setSections(res.data.data || []);
      })
      .catch(() => {
        if (!isMounted) return;
        setSections([]);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoadingSections(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isLogin, form.role, form.departmentId, form.academicYear]);

  const validateForm = () => {
    const errs = {};
    if (!isLogin) {
      if (!form.firstName.trim()) errs.firstName = 'First name is required';
      if (!form.lastName.trim()) errs.lastName = 'Last name is required';
      if (!form.departmentId) errs.departmentId = 'Department is required';
      if (form.role === 'student') {
        if (!form.academicYear) errs.academicYear = 'Year is required';
        if (form.autoAssignSection !== 'true' && !form.sectionId) errs.sectionId = 'Section is required or enable auto-assign';
      }
    }
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Invalid email';
    if (!form.password) errs.password = 'Password is required';
    else if (!isLogin && form.password.length < 6) errs.password = 'Min 6 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);

    try {
      let result;
      if (isLogin) {
        result = await login(form.email, form.password);
      } else {
        result = await register({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          password: form.password,
          role: form.role,
          departmentId: form.departmentId ? parseInt(form.departmentId) : undefined,
          academicYear: form.role === 'student' ? parseInt(form.academicYear, 10) : undefined,
          sectionId: form.role === 'student' && form.autoAssignSection !== 'true' && form.sectionId
            ? parseInt(form.sectionId, 10)
            : undefined,
        });
      }

      if (result.success) {
        toast.success(isLogin ? 'Welcome back!' : 'Account created!');
      } else {
        toast.error(result.message);
        if (result.errors) {
          const fieldErrors = {};
          result.errors.forEach((err) => {
            fieldErrors[err.field] = err.message;
          });
          setErrors(fieldErrors);
        }
      }
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (errors[e.target.name]) {
      setErrors({ ...errors, [e.target.name]: '' });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-white/5 rounded-full" />
          <div className="absolute top-1/2 -right-20 w-60 h-60 bg-white/5 rounded-full" />
          <div className="absolute bottom-20 left-20 w-40 h-40 bg-white/10 rounded-full" />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mb-8">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
            Student Leave<br />Management System
          </h2>
          <p className="text-primary-200 text-lg leading-relaxed max-w-md">
            Streamlined leave application, review, and approval — from student to faculty to admin.
          </p>
          <div className="mt-12 space-y-3">
            {['3-step approval workflow', 'Real-time status tracking', 'Automatic balance management'].map((feat) => (
              <div key={feat} className="flex items-center gap-3 text-primary-100">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm">{feat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-xl">S</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">SLMS</h1>
          </div>

          <div className="card p-8">
            {/* Tabs */}
            <div className="flex bg-slate-100 rounded-xl p-1 mb-8">
              <button
                onClick={() => { setIsLogin(true); setErrors({}); }}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isLogin ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
                id="tab-login"
              >
                Login
              </button>
              <button
                onClick={() => { setIsLogin(false); setErrors({}); }}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                  !isLogin ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
                id="tab-register"
              >
                Register
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">First Name</label>
                    <input
                      name="firstName"
                      value={form.firstName}
                      onChange={handleChange}
                      className={`input ${errors.firstName ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500' : ''}`}
                      placeholder="John"
                      id="input-firstname"
                    />
                    {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Last Name</label>
                    <input
                      name="lastName"
                      value={form.lastName}
                      onChange={handleChange}
                      className={`input ${errors.lastName ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500' : ''}`}
                      placeholder="Doe"
                      id="input-lastname"
                    />
                    {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName}</p>}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className={`input ${errors.email ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500' : ''}`}
                  placeholder="you@example.com"
                  id="input-email"
                />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={handleChange}
                    className={`input pr-10 ${errors.password ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500' : ''}`}
                    placeholder="••••••••"
                    id="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    id="toggle-password"
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              </div>

              {!isLogin && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                    <select
                      name="role"
                      value={form.role}
                      onChange={handleChange}
                      className="input"
                      id="input-role"
                    >
                      <option value="student">Student</option>
                      <option value="faculty">Faculty</option>
                      <option value="admin">Admin (HOD)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Department</label>
                    <select
                      name="departmentId"
                      value={form.departmentId}
                      onChange={handleChange}
                      className={`input ${errors.departmentId ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500' : ''}`}
                      id="input-department"
                    >
                      <option value="">Select department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    {errors.departmentId && <p className="text-xs text-red-500 mt-1">{errors.departmentId}</p>}
                  </div>

                  {form.role === 'student' ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Academic Year</label>
                        <select
                          name="academicYear"
                          value={form.academicYear}
                          onChange={handleChange}
                          className={`input ${errors.academicYear ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500' : ''}`}
                          id="input-academic-year"
                        >
                          <option value="1">1st Year</option>
                          <option value="2">2nd Year</option>
                          <option value="3">3rd Year</option>
                          <option value="4">4th Year</option>
                        </select>
                        {errors.academicYear && <p className="text-xs text-red-500 mt-1">{errors.academicYear}</p>}
                      </div>

                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={form.autoAssignSection === 'true'}
                          onChange={(e) => setForm((prev) => ({
                            ...prev,
                            autoAssignSection: e.target.checked ? 'true' : 'false',
                            sectionId: e.target.checked ? '' : prev.sectionId,
                          }))}
                        />
                        Auto-assign least filled section
                      </label>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Section</label>
                        <select
                          name="sectionId"
                          value={form.sectionId}
                          onChange={handleChange}
                          className={`input ${errors.sectionId ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500' : ''}`}
                          id="input-section"
                          disabled={form.autoAssignSection === 'true'}
                        >
                          <option value="">{loadingSections ? 'Loading sections...' : 'Select section'}</option>
                          {sections.map((section) => (
                            <option key={section.id} value={section.id}>
                              {section.name} (Sem {section.semester}) - {section.student_count} students
                            </option>
                          ))}
                        </select>
                        {errors.sectionId && <p className="text-xs text-red-500 mt-1">{errors.sectionId}</p>}
                        {form.autoAssignSection === 'true' && sections[0] ? (
                          <p className="text-xs text-slate-500 mt-1">
                            Suggested: {sections[0].name} (Sem {sections[0].semester}, {sections[0].student_count} students)
                          </p>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </>
              )}

              {isLogin && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="remember" className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                  <label htmlFor="remember" className="text-sm text-slate-600">Remember me</label>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-2"
                id="btn-submit"
              >
                {loading ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                {isLogin ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
