import { useState, useEffect } from 'react';
import { leaveService } from '../services/leaveService';
import Navbar from '../components/Navbar';
import StatCard from '../components/StatCard';
import Table from '../components/Table';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import toast from 'react-hot-toast';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ name: '', date: '', type: 'PUBLIC', isRecurring: false, rule: '', description: '' });
  const [delegationForm, setDelegationForm] = useState({ fromAdminId: '', toAdminId: '', startDate: '', endDate: '', scope: 'DEPARTMENT' });
  const [reassignForm, setReassignForm] = useState({ leaveId: '', newFacultyId: '', reason: '' });
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, holidaysRes] = await Promise.all([
        leaveService.getAdminStats(),
        leaveService.getHolidays(),
      ]);
      setStats(statsRes.data.data);
      setHolidays(holidaysRes.data.data);

      const [delegationRes, auditRes] = await Promise.all([
        leaveService.getDelegations(),
        leaveService.getAuditLogs(25),
      ]);
      setDelegations(delegationRes.data.data || []);
      setAuditLogs(auditRes.data.data || []);
    } catch {
      toast.error('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!holidayForm.name.trim()) {
      toast.error('Holiday name is required.');
      return;
    }
    if (holidayForm.type !== 'WEEKEND_RULE' && !holidayForm.date) {
      toast.error('Date is required for PUBLIC/REGIONAL holidays.');
      return;
    }
    if (holidayForm.type === 'WEEKEND_RULE' && holidayForm.rule.trim().length < 3) {
      toast.error('Rule is required for weekend-rule holidays.');
      return;
    }
    setSavingHoliday(true);
    try {
      await leaveService.addHoliday({
        name: holidayForm.name.trim(),
        date: holidayForm.type === 'WEEKEND_RULE' ? null : holidayForm.date,
        type: holidayForm.type,
        isRecurring: holidayForm.isRecurring,
        rule: holidayForm.type === 'WEEKEND_RULE' ? holidayForm.rule.trim() : null,
        description: holidayForm.description.trim() || null,
      });
      toast.success('Holiday added.');
      setHolidayForm({ name: '', date: '', type: 'PUBLIC', isRecurring: false, rule: '', description: '' });
      setShowHolidayModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add holiday.');
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async () => {
    try {
      await leaveService.deleteHoliday(deleteTarget.id);
      toast.success('Holiday removed.');
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove holiday.');
    }
  };

  const handleCreateDelegation = async (e) => {
    e.preventDefault();
    try {
      await leaveService.createDelegation({
        fromAdminId: Number(delegationForm.fromAdminId),
        toAdminId: Number(delegationForm.toAdminId),
        startDate: delegationForm.startDate,
        endDate: delegationForm.endDate,
        scope: delegationForm.scope,
      });
      toast.success('Delegation created.');
      setDelegationForm({ fromAdminId: '', toAdminId: '', startDate: '', endDate: '', scope: 'DEPARTMENT' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create delegation.');
    }
  };

  const handleReassignLeave = async (e) => {
    e.preventDefault();
    try {
      await leaveService.reassignLeave(Number(reassignForm.leaveId), {
        newFacultyId: Number(reassignForm.newFacultyId),
        reason: reassignForm.reason,
      });
      toast.success('Leave reassigned.');
      setReassignForm({ leaveId: '', newFacultyId: '', reason: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reassign leave.');
    }
  };

  const handleResetAcademicYear = async () => {
    if (!window.confirm('Reset academic year? This archives leave records and resets attendance/balance.')) {
      return;
    }
    try {
      await leaveService.resetAcademicYear();
      toast.success('Academic year reset completed.');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset academic year.');
    }
  };

  const holidayColumns = [
    { key: 'name', label: 'Name' },
    {
      key: 'date',
      label: 'Date',
      render: (row) => (row.date ? new Date(row.date).toLocaleDateString() : 'Rule-based'),
    },
    { key: 'type', label: 'Type' },
    { key: 'rule', label: 'Rule' },
    { key: 'description', label: 'Description' },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <button
          onClick={() => setDeleteTarget(row)}
          className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
          id={`delete-holiday-${row.id}`}
        >
          Remove
        </button>
      ),
    },
  ];

  return (
    <>
      <Navbar title="Admin Dashboard" />
      <div className="p-6 space-y-6 fade-in">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Overview</h2>
          <p className="text-slate-400 mt-1">System-wide leave statistics</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Applications" value={stats?.total ?? '—'} color="info" loading={loading} />
          <StatCard title="Approved" value={stats?.approved ?? '—'} color="success" loading={loading} />
          <StatCard title="Rejected" value={stats?.rejected ?? '—'} color="danger" loading={loading} />
          <StatCard title="Pending" value={Number(stats?.pending ?? 0) + Number(stats?.forwarded ?? 0)} color="warning" loading={loading} />
        </div>

        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Holiday Calendar</h3>
              <p className="text-sm text-slate-400">Used in leave deduction (working days only).</p>
            </div>
            <button className="btn-primary" onClick={() => setShowHolidayModal(true)} id="btn-add-holiday">
              Add Holiday
            </button>
          </div>
          <Table
            columns={holidayColumns}
            data={holidays}
            loading={loading}
            emptyMessage="No holidays added yet."
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <form onSubmit={handleCreateDelegation} className="card p-4 space-y-3">
            <h3 className="text-base font-semibold text-slate-800">Admin Delegation</h3>
            <input type="number" placeholder="From Admin ID" className="input" value={delegationForm.fromAdminId} onChange={(e) => setDelegationForm({ ...delegationForm, fromAdminId: e.target.value })} />
            <input type="number" placeholder="To Admin ID" className="input" value={delegationForm.toAdminId} onChange={(e) => setDelegationForm({ ...delegationForm, toAdminId: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="input" value={delegationForm.startDate} onChange={(e) => setDelegationForm({ ...delegationForm, startDate: e.target.value })} />
              <input type="date" className="input" value={delegationForm.endDate} onChange={(e) => setDelegationForm({ ...delegationForm, endDate: e.target.value })} />
            </div>
            <select className="input" value={delegationForm.scope} onChange={(e) => setDelegationForm({ ...delegationForm, scope: e.target.value })}>
              <option value="DEPARTMENT">DEPARTMENT</option>
              <option value="GLOBAL">GLOBAL</option>
            </select>
            <button type="submit" className="btn-primary">Create Delegation</button>
            <div className="text-xs text-slate-500">Active delegations: {delegations.length}</div>
          </form>

          <form onSubmit={handleReassignLeave} className="card p-4 space-y-3">
            <h3 className="text-base font-semibold text-slate-800">Faculty Reassignment</h3>
            <input type="number" placeholder="Leave ID" className="input" value={reassignForm.leaveId} onChange={(e) => setReassignForm({ ...reassignForm, leaveId: e.target.value })} />
            <input type="number" placeholder="New Faculty ID" className="input" value={reassignForm.newFacultyId} onChange={(e) => setReassignForm({ ...reassignForm, newFacultyId: e.target.value })} />
            <textarea placeholder="Reason" className="input min-h-[90px] resize-none" value={reassignForm.reason} onChange={(e) => setReassignForm({ ...reassignForm, reason: e.target.value })} />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Reassign Leave</button>
              <button type="button" className="btn-outline" onClick={handleResetAcademicYear}>Reset Academic Year</button>
            </div>
          </form>
        </div>

        <div className="card p-4">
          <h3 className="text-base font-semibold text-slate-800 mb-3">Recent Audit Logs</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {auditLogs.length === 0 ? <p className="text-sm text-slate-400">No audit logs yet.</p> : null}
            {auditLogs.map((log) => (
              <div key={log.id} className="border border-slate-100 rounded-lg p-3 text-sm">
                <p className="font-medium text-slate-700">{log.action} <span className="text-slate-400">by {log.actor_name || 'System'}</span></p>
                <p className="text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        <Modal isOpen={showHolidayModal} onClose={() => setShowHolidayModal(false)} title="Add Holiday" size="sm">
          <form onSubmit={handleAddHoliday} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
              <input
                type="text"
                value={holidayForm.name}
                onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                className="input"
                placeholder="e.g. Republic Day"
                id="holiday-name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
              <select
                value={holidayForm.type}
                onChange={(e) => setHolidayForm({ ...holidayForm, type: e.target.value })}
                className="input"
                id="holiday-type"
              >
                <option value="PUBLIC">PUBLIC</option>
                <option value="REGIONAL">REGIONAL</option>
                <option value="WEEKEND_RULE">WEEKEND_RULE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Date</label>
              <input
                type="date"
                value={holidayForm.date}
                onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                className="input"
                id="holiday-date"
                disabled={holidayForm.type === 'WEEKEND_RULE'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Rule (for weekend-rule holidays)</label>
              <input
                type="text"
                value={holidayForm.rule}
                onChange={(e) => setHolidayForm({ ...holidayForm, rule: e.target.value })}
                className="input"
                placeholder="e.g. 3rd Saturday"
                id="holiday-rule"
                disabled={holidayForm.type !== 'WEEKEND_RULE'}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={holidayForm.isRecurring}
                onChange={(e) => setHolidayForm({ ...holidayForm, isRecurring: e.target.checked })}
                id="holiday-recurring"
              />
              <label htmlFor="holiday-recurring" className="text-sm text-slate-700">Recurring holiday</label>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
              <input
                type="text"
                value={holidayForm.description}
                onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })}
                className="input"
                placeholder="e.g. Diwali"
                id="holiday-description"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" className="btn-ghost" onClick={() => setShowHolidayModal(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={savingHoliday} id="holiday-save">
                Save Holiday
              </button>
            </div>
          </form>
        </Modal>

        <ConfirmDialog
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteHoliday}
          title="Remove Holiday"
          message={`Remove ${deleteTarget?.name || 'this holiday'} from the calendar?`}
          confirmText="Remove"
          loading={false}
        />
      </div>
    </>
  );
}
