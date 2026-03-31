import { useState, useEffect } from 'react';
import { leaveService } from '../services/leaveService';
import { authService } from '../services/authService';
import Navbar from '../components/Navbar';
import Table from '../components/Table';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import toast from 'react-hot-toast';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'student',
    departmentId: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, deptsRes] = await Promise.all([
        leaveService.getAllUsers(),
        authService.getDepartments(),
      ]);
      setUsers(usersRes.data.data);
      setDepartments(deptsRes.data.data);
    } catch {
      toast.error('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await authService.register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        role: form.role,
        departmentId: form.departmentId ? parseInt(form.departmentId) : undefined,
      });
      toast.success('User created.');
      setShowAdd(false);
      setForm({ firstName: '', lastName: '', email: '', password: '', role: 'student', departmentId: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (userId) => {
    try {
      const res = await leaveService.toggleUserStatus(userId);
      toast.success(res.data.message);
      fetchData();
    } catch {
      toast.error('Failed to toggle user status.');
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await leaveService.deleteUser(deleteTarget.id);
      toast.success('User deleted.');
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.first_name} {row.last_name}</p>
          <p className="text-xs text-slate-400">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      render: (row) => (
        <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600 capitalize">
          {row.role}
        </span>
      ),
    },
    { key: 'department_name', label: 'Department', render: (row) => row.department_name || '—' },
    { key: 'leave_balance', label: 'Balance' },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${
          row.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleToggle(row.id)}
            className={`!py-1.5 !px-3 !text-xs ${row.is_active ? 'btn-outline' : 'btn-success'}`}
            id={`toggle-${row.id}`}
          >
            {row.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={() => setDeleteTarget(row)}
            className="btn-danger !py-1.5 !px-3 !text-xs"
            id={`delete-${row.id}`}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Navbar title="User Management" />
      <div className="p-6 space-y-6 fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">User Management</h2>
            <p className="text-slate-400 mt-1">{users.length} registered user{users.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary" id="btn-add-user">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add User
          </button>
        </div>

        <Table columns={columns} data={users} loading={loading} emptyMessage="No users found." />

        {/* Add User Modal */}
        <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New User">
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">First Name</label>
                <input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="input"
                  placeholder="John"
                  required
                  id="add-firstname"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Last Name</label>
                <input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="input"
                  placeholder="Doe"
                  required
                  id="add-lastname"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input"
                required
                id="add-email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input"
                minLength={6}
                required
                id="add-password"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input" id="add-role">
                  <option value="student">Student</option>
                  <option value="faculty">Faculty</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Department</label>
                <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="input" id="add-department">
                  <option value="">Select</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary" id="add-submit">
                {submitting ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                Create User
              </button>
            </div>
          </form>
        </Modal>

        <ConfirmDialog
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Delete User"
          message={`Are you sure you want to delete ${deleteTarget?.first_name} ${deleteTarget?.last_name}? This action cannot be undone.`}
          confirmText="Delete"
          loading={deleteLoading}
        />
      </div>
    </>
  );
}
