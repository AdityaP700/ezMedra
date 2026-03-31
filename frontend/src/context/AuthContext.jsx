import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('slms_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('slms_token'));
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await authService.login({ email, password });
      const { token: jwt } = res.data.data;
      localStorage.setItem('slms_token', jwt);
      setToken(jwt);

      const profileRes = await authService.getProfile();
      const userData = profileRes.data?.data || res.data.data.user;
      localStorage.setItem('slms_token', jwt);
      localStorage.setItem('slms_user', JSON.stringify(userData));
      setUser(userData);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed.',
      };
    } finally {
      setLoading(false);
    }
  };

  const register = async (data) => {
    setLoading(true);
    try {
      const res = await authService.register(data);
      const { token: jwt } = res.data.data;
      localStorage.setItem('slms_token', jwt);
      setToken(jwt);

      const profileRes = await authService.getProfile();
      const userData = profileRes.data?.data || res.data.data.user;
      localStorage.setItem('slms_token', jwt);
      localStorage.setItem('slms_user', JSON.stringify(userData));
      setUser(userData);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Registration failed.',
        errors: error.response?.data?.errors,
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('slms_token');
    localStorage.removeItem('slms_user');
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    authService.getProfile()
      .then((res) => {
        if (!mounted) return;
        const profile = res.data?.data;
        if (!profile) return;
        setUser(profile);
        localStorage.setItem('slms_user', JSON.stringify(profile));
      })
      .catch(() => {
        // keep fallback from localStorage when profile endpoint is unavailable
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
