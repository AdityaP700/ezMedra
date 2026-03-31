import { useState, useEffect } from 'react';
import { leaveService } from '../services/leaveService';
import Navbar from '../components/Navbar';
import Badge from '../components/Badge';
import Table from '../components/Table';
import Modal from '../components/Modal';
import LeaveDecisionCard from '../components/LeaveDecisionCard';
import toast from 'react-hot-toast';

export default function AdminQueue() {
  const [leaves, setLeaves] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState(null);
  const [actionType, setActionType] = useState('');
  const [approvedDays, setApprovedDays] = useState('');
  const [remarks, setRemarks] = useState('');
  const [overrideHighRisk, setOverrideHighRisk] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await leaveService.getAdminQueue();
      setLeaves(res.data.data);
      setSelectedIds((prev) => prev.filter((id) => res.data.data.some((row) => row.id === id)));
    } catch {
      toast.error('Failed to load approval queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const openAction = (leave, type) => {
    setActionTarget(leave);
    setActionType(type);
    setApprovedDays(type === 'approve' ? String(leave.total_days) : '');
    setRemarks('');
    setOverrideHighRisk(false);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === leaves.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(leaves.map((l) => l.id));
  };

  const handleAction = async () => {
    if (actionType === 'reject' && remarks.trim().length < 5) {
      toast.error('Remarks required for rejection (min 5 chars).');
      return;
    }
    if (actionType === 'approve') {
      const parsedApprovedDays = parseInt(approvedDays, 10);
      if (!parsedApprovedDays || parsedApprovedDays < 1 || parsedApprovedDays > actionTarget.total_days) {
        toast.error('Approved days must be between 1 and requested days.');
        return;
      }
    }
    setSubmitting(true);
    try {
      if (actionType === 'approve') {
        await leaveService.approveLeave(actionTarget.id, {
          remarks: remarks || null,
          approvedDays: parseInt(approvedDays, 10),
          overrideHighRisk,
        });
        toast.success('Leave approved.');
      } else {
        await leaveService.rejectLeaveByAdmin(actionTarget.id, { remarks });
        toast.success('Leave rejected.');
      }
      setActionTarget(null);
      setApprovedDays('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) {
      toast.error('Select at least one request.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await leaveService.approveBulk({ leaveIds: selectedIds, remarks: 'Bulk approval' });
      const successful = res.data.data.filter((x) => x.success).length;
      toast.success(`Bulk approve completed: ${successful}/${selectedIds.length} succeeded.`);
      setSelectedIds([]);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk approve failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.length === 0) {
      toast.error('Select at least one request.');
      return;
    }
    const bulkReason = window.prompt('Enter rejection remarks for selected requests (min 5 chars):');
    if (!bulkReason || bulkReason.trim().length < 5) {
      toast.error('Bulk rejection requires remarks (min 5 chars).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await leaveService.rejectBulk({ leaveIds: selectedIds, remarks: bulkReason.trim() });
      const successful = res.data.data.filter((x) => x.success).length;
      toast.success(`Bulk reject completed: ${successful}/${selectedIds.length} succeeded.`);
      setSelectedIds([]);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk reject failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'select',
      label: (
        <input
          type="checkbox"
          checked={leaves.length > 0 && selectedIds.length === leaves.length}
          onChange={toggleSelectAll}
          aria-label="Select all"
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(row.id)}
          onChange={() => toggleSelect(row.id)}
          aria-label={`Select ${row.id}`}
        />
      ),
    },
    { key: 'student_name', label: 'Student' },
    { key: 'faculty_name', label: 'Faculty' },
    { key: 'leave_type_name', label: 'Type' },
    {
      key: 'dates',
      label: 'Dates',
      render: (row) =>
        `${new Date(row.start_date).toLocaleDateString()} — ${new Date(row.end_date).toLocaleDateString()}`,
    },
    { key: 'total_days', label: 'Days' },
    {
      key: 'faculty_recommendation',
      label: 'Faculty Rec.',
      render: (row) => (
        <span className={`font-medium ${row.faculty_recommendation === 'reject' ? 'text-rose-600' : 'text-emerald-600'}`}>
          {row.faculty_recommendation === 'reject' ? 'Reject' : 'Approve'}
        </span>
      ),
    },
    {
      key: 'faculty_remarks',
      label: 'Remarks',
      render: (row) => (
        <span className="max-w-[150px] truncate block text-slate-400" title={row.faculty_remarks}>
          {row.faculty_remarks || '—'}
        </span>
      ),
    },
    {
      key: 'risk_flag',
      label: 'Risk',
      render: (row) => (
        <span className={`badge ${row.risk_flag === 'HIGH_RISK' ? 'badge-rejected' : 'badge-approved'}`}>
          {row.risk_flag || 'NORMAL'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="flex gap-2">
          <button
            onClick={() => openAction(row, 'approve')}
            className="btn-success !py-1.5 !px-3 !text-xs"
            id={`approve-${row.id}`}
          >
            ✓ Approve
          </button>
          <button
            onClick={() => openAction(row, 'reject')}
            className="btn-danger !py-1.5 !px-3 !text-xs"
            id={`reject-${row.id}`}
          >
            ✕ Reject
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Navbar title="Approval Queue" />
      <div className="p-6 space-y-6 fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Approval Queue</h2>
            <p className="text-slate-400 mt-1">{leaves.length} forwarded request{leaves.length !== 1 ? 's' : ''} awaiting approval</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleBulkApprove} className="btn-success" disabled={submitting || selectedIds.length === 0} id="bulk-approve">
              Bulk Approve ({selectedIds.length})
            </button>
            <button onClick={handleBulkReject} className="btn-danger" disabled={submitting || selectedIds.length === 0} id="bulk-reject">
              Bulk Reject
            </button>
            <button onClick={fetchData} className="btn-outline" id="refresh-admin-queue">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        <Table columns={columns} data={leaves} loading={loading} emptyMessage="No forwarded leave requests. All clear! ✨" />

        <Modal
          isOpen={!!actionTarget}
          onClose={() => setActionTarget(null)}
          title={actionType === 'approve' ? 'Approve Leave Application' : 'Reject Leave Application'}
          size="sm"
        >
          <div className="space-y-4">
            {actionTarget ? (
              <LeaveDecisionCard
                studentName={actionTarget.student_name}
                leaveType={actionTarget.leave_type_name}
                startDate={actionTarget.start_date}
                endDate={actionTarget.end_date}
                currentAttendance={actionTarget.current_attendance}
                projectedAttendance={actionTarget.projected_attendance}
                onApprove={() => openAction(actionTarget, 'approve')}
                onReject={() => openAction(actionTarget, 'reject')}
                onViewDetails={null}
              />
            ) : null}
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <p className="text-sm"><span className="font-medium text-slate-700">Days:</span> {actionTarget?.total_days}</p>
              <p className="text-sm"><span className="font-medium text-slate-700">Faculty:</span> {actionTarget?.faculty_name}</p>
              <p className="text-sm"><span className="font-medium text-slate-700">Document:</span> {actionTarget?.has_document ? 'Attached' : 'Not attached'}</p>
              <p className="text-sm"><span className="font-medium text-slate-700">System Prediction:</span> <span className={actionTarget?.recommendation === 'REJECT' ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}>{actionTarget?.recommendation || (Number(actionTarget?.projected_attendance || 0) < 75 ? 'REJECT' : 'APPROVE')}</span></p>
              <p className="text-sm"><span className="font-medium text-slate-700">Faculty Recommendation:</span> <span className={actionTarget?.faculty_recommendation === 'reject' ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}>{actionTarget?.faculty_recommendation === 'reject' ? 'REJECT' : 'APPROVE'}</span></p>
              {actionTarget?.faculty_remarks && (
                <p className="text-sm"><span className="font-medium text-slate-700">Faculty Remarks:</span> {actionTarget.faculty_remarks}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Remarks {actionType === 'reject' ? '(required)' : '(optional)'}
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="input min-h-[80px] resize-none"
                placeholder={actionType === 'reject' ? 'Reason for rejection...' : 'Any remarks...'}
                id="admin-action-remarks"
              />
            </div>
            {actionType === 'approve' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Approved Days</label>
                <input
                  type="number"
                  min={1}
                  max={actionTarget?.total_days || 1}
                  value={approvedDays}
                  onChange={(e) => setApprovedDays(e.target.value)}
                  className="input"
                  id="approved-days"
                />
              </div>
            )}
            {actionType === 'approve' && actionTarget?.risk_flag === 'HIGH_RISK' && !actionTarget?.has_document ? (
              <label className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={overrideHighRisk}
                  onChange={(e) => setOverrideHighRisk(e.target.checked)}
                />
                <span>High-risk leave without document. Check to apply admin override (detailed remarks required).</span>
              </label>
            ) : null}
            {actionType === 'approve' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <p className="text-xs text-emerald-700">
                  Approving will deduct <strong>{approvedDays || actionTarget?.total_days} day(s)</strong> only when attendance policy checks pass.
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setActionTarget(null)} className="btn-ghost" disabled={submitting}>Cancel</button>
              <button
                onClick={handleAction}
                disabled={submitting}
                className={actionType === 'approve' ? 'btn-success' : 'btn-danger'}
                id="admin-action-submit"
              >
                {submitting ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                {actionType === 'approve' ? 'Approve & Deduct Balance' : 'Reject Application'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
}
