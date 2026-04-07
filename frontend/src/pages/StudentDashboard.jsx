import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { leaveService } from '../services/leaveService';
import Navbar from '../components/Navbar';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import Table from '../components/Table';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import toast from 'react-hot-toast';

const SEMESTER_TOTAL_CLASSES = 60;
const MIN_ATTENDANCE_PERCENT = 75;

export default function StudentDashboard() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(null);
  const [insights, setInsights] = useState(null);
  const [attendancePrediction, setAttendancePrediction] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const [form, setForm] = useState({
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    reason: '',
    lateReason: '',
    submitAnyway: false,
    overrideReason: '',
    document: null,
  });

  const calcDays = () => {
    if (!form.startDate || !form.endDate) return 0;
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    if (end < start) return 0;
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  };

  const selectedLeaveType = leaveTypes.find((t) => Number(t.id) === Number(form.leaveTypeId));
  const selectedMaxDays = Number(selectedLeaveType?.max_days || 0);
  const selectedCalendarDays = calcDays();
  const exceedsLeaveTypeLimit = !!selectedLeaveType && selectedCalendarDays > selectedMaxDays;

  const getMaxEndDate = () => {
    if (!form.startDate || !selectedLeaveType) return undefined;
    const d = new Date(form.startDate);
    d.setDate(d.getDate() + selectedMaxDays - 1);
    return d.toISOString().slice(0, 10);
  };

  const maxEndDate = getMaxEndDate();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [balRes, leavesRes, typesRes, insightsRes] = await Promise.all([
        leaveService.getBalance(),
        leaveService.getMyLeaves(),
        leaveService.getLeaveTypes(),
        leaveService.getInsights(),
      ]);
      setBalance(balRes.data.data.balance);
      setLeaves(leavesRes.data.data);
      setLeaveTypes(typesRes.data.data);
      setInsights(insightsRes.data.data);

      const predictionRes = await leaveService.predictMyAttendance();
      setAttendancePrediction(predictionRes.data.data);
    } catch {
      toast.error('Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canPredict = form.leaveTypeId && form.startDate && form.endDate;
    if (!canPredict) {
      setPrediction(null);
      return;
    }

    if (exceedsLeaveTypeLimit) {
      setPrediction(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setPredicting(true);
      try {
        const res = await leaveService.predictImpact({
          leaveTypeId: parseInt(form.leaveTypeId, 10),
          startDate: form.startDate,
          endDate: form.endDate,
          startTime: form.startTime || undefined,
          endTime: form.endTime || undefined,
        });
        setPrediction(res.data.data);
      } catch {
        setPrediction(null);
      } finally {
        setPredicting(false);
      }
    }, 320);

    return () => clearTimeout(timeout);
  }, [form.leaveTypeId, form.startDate, form.endDate, form.startTime, form.endTime, exceedsLeaveTypeLimit]);

  const handleApply = async (e) => {
    e.preventDefault();
    if (!form.leaveTypeId || !form.startDate || !form.endDate || form.reason.length < 10) {
      toast.error('Please fill all fields (reason min 10 chars).');
      return;
    }
    if (exceedsLeaveTypeLimit) {
      toast.error(`Max allowed is ${selectedMaxDays} day(s) for ${selectedLeaveType?.name}.`);
      return;
    }
    if (prediction?.documentRequired && !form.document) {
      toast.error('Supporting document is required for this leave request.');
      return;
    }
    if (prediction?.requiresOverrideReason) {
      if (!form.submitAnyway) {
        toast.error('This is a risky leave. Enable submit anyway and add justification.');
        return;
      }
      if ((form.overrideReason || '').trim().length < 10) {
        toast.error('Justification is required (minimum 10 characters).');
        return;
      }
      if (String(prediction.riskTier || '').toUpperCase() === 'RED' && (form.overrideReason || '').trim().length < 15) {
        toast.error('Critical risk requires stronger justification (minimum 15 characters).');
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('leaveTypeId', String(parseInt(form.leaveTypeId, 10)));
      payload.append('startDate', form.startDate);
      payload.append('endDate', form.endDate);
      if (form.startTime) payload.append('startTime', form.startTime);
      if (form.endTime) payload.append('endTime', form.endTime);
      payload.append('reason', form.reason);
      if (form.lateReason) {
        payload.append('lateReason', form.lateReason);
      }
      payload.append('submitAnyway', String(!!form.submitAnyway));
      if (form.overrideReason) {
        payload.append('overrideReason', form.overrideReason);
      }
      if (form.document) {
        payload.append('document', form.document);
      }

      await leaveService.applyLeave(payload);
      toast.success('Leave application submitted!');
      setShowApply(false);
      setPrediction(null);
      setForm({ leaveTypeId: '', startDate: '', endDate: '', startTime: '', endTime: '', reason: '', lateReason: '', submitAnyway: false, overrideReason: '', document: null });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to apply.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      await leaveService.cancelLeave(cancelTarget.id);
      toast.success('Leave cancelled.');
      setCancelTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel.');
    } finally {
      setCancelLoading(false);
    }
  };

  const columns = [
    { key: 'leave_type_name', label: 'Leave Type' },
    {
      key: 'start_date',
      label: 'Dates',
      render: (row) =>
        `${new Date(row.start_date).toLocaleDateString()} — ${new Date(row.end_date).toLocaleDateString()}`,
    },
    { key: 'total_days', label: 'Days' },
    {
      key: 'current_attendance',
      label: 'Current %',
      render: (row) => (
        <span className="font-medium text-sky-700">{Number(row.current_attendance || 0).toFixed(1)}%</span>
      ),
    },
    {
      key: 'projected_attendance',
      label: 'After Leave %',
      render: (row) => {
        const projected = Number(row.projected_attendance || 0);
        const colorClass = projected < 75 ? 'text-red-600 font-bold' : projected < 80 ? 'text-amber-600 font-semibold' : 'text-emerald-700 font-medium';
        return <span className={colorClass}>{projected.toFixed(1)}%</span>;
      },
    },
    {
      key: 'risk_flag',
      label: 'Risk',
      render: (row) => {
        const riskIndicator = row.risk_indicator || (Number(row.projected_attendance || 100) < 75 ? 'RED' : Number(row.projected_attendance || 100) < 80 ? 'YELLOW' : 'GREEN');
        const colorMap = { RED: 'badge-rejected', YELLOW: 'badge-forwarded', GREEN: 'badge-approved' };
        return (
          <span className={`badge ${colorMap[riskIndicator] || 'badge-approved'}`}>
            {riskIndicator}
          </span>
        );
      },
    },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) =>
        row.status === 'pending' ? (
          <button
            onClick={() => setCancelTarget(row)}
            className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
            id={`cancel-${row.id}`}
          >
            Cancel
          </button>
        ) : (
          <span className="text-sm text-slate-300">—</span>
        ),
    },
  ];

  const pendingCount = leaves.filter((l) => l.status === 'pending').length;
  const approvedCount = leaves.filter((l) => l.status === 'approved').length;
  const attendanceScore = insights?.attendanceScore ?? 0;
  const riskIndicator = insights?.riskIndicator || 'green';
  const riskTone = riskIndicator === 'red' ? 'text-red-600 bg-red-50 border-red-200' : riskIndicator === 'yellow' ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200';
  const minimumClassesRequired = Math.ceil((MIN_ATTENDANCE_PERCENT / 100) * SEMESTER_TOTAL_CLASSES);
  const estimatedAttendedClasses = Math.round((Math.max(0, Math.min(100, attendanceScore)) / 100) * SEMESTER_TOTAL_CLASSES);
  const classesNeededForThreshold = Math.max(0, minimumClassesRequired - estimatedAttendedClasses);

  const toClassEquivalent = (percent) => Math.round((Math.max(0, Math.min(100, Number(percent || 0))) / 100) * SEMESTER_TOTAL_CLASSES);

  return (
    <>
      <Navbar title="Student Dashboard" />
      <div className="p-6 space-y-6 fade-in">
        {/* Welcome */}
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Welcome back, {user?.first_name}
          </h2>
          <p className="text-slate-400 mt-1">Manage attendance-aware leave applications</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard title={`Leave Days Left (out of ${user?.leave_balance ?? 15})`} value={balance ?? '—'} color="primary" loading={loading} />
          <StatCard title="Pending" value={pendingCount} color="warning" loading={loading} />
          <StatCard title="Approved" value={approvedCount} color="success" loading={loading} />
          <StatCard title="Attendance Streak" value={insights?.streak ?? 0} color="info" loading={loading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card p-5 transition-all duration-300">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-500">Attendance Score</p>
              <span className="text-2xl font-bold text-slate-800">{attendanceScore}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-500"
                style={{ width: `${Math.max(0, Math.min(100, attendanceScore))}%` }}
              />
            </div>
            <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2">
              <p className="text-xs text-sky-700 font-medium">
                Target math: {MIN_ATTENDANCE_PERCENT}% of {SEMESTER_TOTAL_CLASSES} classes = {minimumClassesRequired} classes.
              </p>
              <p className="text-xs text-sky-600 mt-1">
                Estimated attended: {estimatedAttendedClasses}/{SEMESTER_TOTAL_CLASSES}
                {classesNeededForThreshold > 0 ? ` | Need ${classesNeededForThreshold} more to hit threshold.` : ' | Threshold achieved.'}
              </p>
            </div>
          </div>

          <div className="card p-5 transition-all duration-300">
            <p className="text-sm font-medium text-slate-500 mb-3">Risk Indicator</p>
            <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border ${riskTone}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${riskIndicator === 'red' ? 'bg-red-500' : riskIndicator === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500'} ${riskIndicator !== 'green' ? 'animate-pulse' : ''}`} />
              <span className="text-sm font-semibold uppercase tracking-wide">{riskIndicator}</span>
            </div>
          </div>

          <div className="card p-5 transition-all duration-300">
            <p className="text-sm font-medium text-slate-500 mb-3">Badges</p>
            <div className="flex flex-wrap gap-2">
              {(insights?.badges || []).length === 0 ? <span className="text-sm text-slate-400">No badges yet</span> : null}
              {(insights?.badges || []).map((badge) => (
                <span
                  key={badge}
                  className={`badge ${badge === 'risky' ? 'badge-rejected' : badge === 'medical' ? 'badge-forwarded' : 'badge-approved'}`}
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* {attendancePrediction && (
          <div className="card p-5 bg-gradient-to-br from-white to-sky-50/50 border-sky-100">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">Attendance Prediction</p>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-900 text-white tracking-wide">SEM-5 TARGET</span>
            </div>
            <p className="text-lg font-semibold text-slate-800 mt-2">Current: {attendancePrediction.currentPercentage}%</p>
            <p className="text-sm text-slate-600 mt-1">{attendancePrediction.recommendation}</p>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-slate-500 text-xs">Min Required</p>
                <p className="font-semibold text-slate-800">{minimumClassesRequired}/{SEMESTER_TOTAL_CLASSES} classes</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-slate-500 text-xs">Current Equivalent</p>
                <p className="font-semibold text-slate-800">{toClassEquivalent(attendancePrediction.currentPercentage)}/{SEMESTER_TOTAL_CLASSES}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-slate-500 text-xs">Extra Sessions</p>
                <p className="font-semibold text-slate-800">{attendancePrediction.extraSessionsAttended || 0} (+{attendancePrediction.bonusAttendanceCredits || 0})</p>
              </div>
            </div>
            {attendancePrediction.recoveryModeMessage ? (
              <p className="text-sm text-indigo-700 mt-2">{attendancePrediction.recoveryModeMessage}</p>
            ) : null}
            {attendancePrediction.warning ? (
              <p className="text-sm text-red-600 mt-1">{attendancePrediction.warning}</p>
            ) : null}
          </div>
        )} */}

        {/* Quick Action */}
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-800">My Applications</h3>
          <button onClick={() => setShowApply(true)} className="btn-primary" id="btn-apply-leave">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Apply Leave
          </button>
        </div>

        {/* Table */}
        <Table columns={columns} data={leaves} loading={loading} emptyMessage="No leave applications yet." />

        {/* Apply Leave Modal */}
        <Modal isOpen={showApply} onClose={() => setShowApply(false)} title="Apply for Leave" size="lg">
          <form onSubmit={handleApply} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Leave Type</label>
              <select
                value={form.leaveTypeId}
                onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}
                className="input"
                id="apply-type"
              >
                <option value="">Select type</option>
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} (max {t.max_days} days)</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">From</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="input"
                  id="apply-start"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">To</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="input"
                  min={form.startDate || undefined}
                  max={maxEndDate}
                  id="apply-end"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Time (Optional)</label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  className="input"
                  id="apply-start-time"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">End Time (Optional)</label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  className="input"
                  id="apply-end-time"
                />
              </div>
            </div>
            {calcDays() > 0 && (
              <p className={`text-sm font-medium ${exceedsLeaveTypeLimit ? 'text-red-600' : 'text-primary-600'}`}>
                Total days: {calcDays()}
                {selectedLeaveType ? ` (max ${selectedMaxDays})` : ''}
              </p>
            )}
            {exceedsLeaveTypeLimit ? (
              <p className="text-xs text-red-600 font-medium">
                You exceeded allowed leave duration. Maximum allowed: {selectedMaxDays} day(s).
              </p>
            ) : null}
            {predicting ? <p className="text-xs text-slate-400">Calculating impact...</p> : null}
            {prediction && (
              <div className={`rounded-xl border p-3 transition-all duration-300 ${prediction.riskIndicator === 'red' ? 'bg-red-50 border-red-200' : prediction.riskIndicator === 'yellow' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <p className="text-sm font-semibold text-slate-700">Leave impact prediction</p>
                <p className="text-sm text-slate-600 mt-1">Attendance: {prediction.currentAttendance}% {'->'} {prediction.projectedAttendance}%</p>
                <p className={`text-sm font-semibold mt-1 ${prediction.canApplyRecommended ? 'text-emerald-700' : 'text-red-700'}`}>
                  {prediction.decisionMessage}
                </p>
                <p className={`text-sm font-semibold mt-1 ${String(prediction.riskTier || '').toUpperCase() === 'RED' ? 'text-red-700' : String(prediction.riskTier || '').toUpperCase() === 'YELLOW' ? 'text-amber-700' : 'text-emerald-700'}`}>
                  Risk Tier: {prediction.riskTier || 'GREEN'}
                </p>
                {prediction.advisory ? (
                  <p className="text-xs text-slate-700 mt-1">{prediction.advisory}</p>
                ) : null}
                <p className="text-xs text-slate-500 mt-1">
                  Semester target: {MIN_ATTENDANCE_PERCENT}% of {SEMESTER_TOTAL_CLASSES} = {minimumClassesRequired} classes.
                  Projected: {prediction.projectedAttendedUnits ?? toClassEquivalent(prediction.projectedAttendance)} / {prediction.projectedTotalUnits ?? SEMESTER_TOTAL_CLASSES}
                  {' '}({prediction.projectedAttendance}%).
                </p>
                <p className="text-sm text-slate-600 mt-1">Risk: <span className="font-medium uppercase">{prediction.riskIndicator}</span></p>
                <div className="mt-2 rounded-lg bg-white/70 border border-slate-200 p-2.5 text-xs text-slate-700">
                  <p>Selected range: <span className="font-medium">{prediction.selectedRangeDays}</span> day(s)</p>
                  <p>Sessions affected: <span className="font-medium">{prediction.availableSessionsInRange ?? 0}</span></p>
                  <p>Weighted impact: <span className="font-semibold">{prediction.chargeableDays}</span> class unit(s)</p>
                  <p>You may miss up to <span className="font-medium">{prediction.affectedSessionsCount ?? prediction.availableSessionsInRange ?? 0}</span> sessions across <span className="font-medium">{prediction.workingDays}</span> working day(s).</p>
                  <p>- Holidays: <span className="font-medium">{prediction.holidayDays}</span> day(s)</p>
                  <p>- Weekends: <span className="font-medium">{prediction.weekendDays}</span> day(s)</p>
                  <p>- Working days: <span className="font-medium">{prediction.workingDays}</span> day(s)</p>
                </div>
                {Array.isArray(prediction.availableSessionDates) && prediction.availableSessionDates.length > 0 ? (
                  <p className="text-xs text-slate-600 mt-2">
                    Session dates considered: {prediction.availableSessionDates.slice(0, 5).join(', ')}
                  </p>
                ) : null}
                {Array.isArray(prediction.deductedSessionDates) && prediction.deductedSessionDates.length > 0 ? (
                  <p className="text-xs text-emerald-700 mt-1">
                    Deduction applies on: {prediction.deductedSessionDates.slice(0, 5).join(', ')}
                  </p>
                ) : null}
                {prediction.warnings?.length ? (
                  <ul className="mt-2 space-y-1">
                    {prediction.warnings.map((warning) => (
                      <li key={warning} className="text-xs text-slate-600">- {warning}</li>
                    ))}
                  </ul>
                ) : null}

                {prediction.requiresOverrideReason ? (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
                    <label className="flex items-center gap-2 text-sm font-medium text-amber-900">
                      <input
                        type="checkbox"
                        checked={form.submitAnyway}
                        onChange={(e) => setForm({ ...form, submitAnyway: e.target.checked })}
                      />
                      Submit anyway with justification
                    </label>
                    <textarea
                      value={form.overrideReason}
                      onChange={(e) => setForm({ ...form, overrideReason: e.target.value })}
                      className="input mt-2 min-h-[70px] resize-none"
                      placeholder={String(prediction.riskTier || '').toUpperCase() === 'RED' ? 'Critical case: explain emergency context (min 15 chars)...' : 'Explain why this leave should still be considered (min 10 chars)...'}
                    />
                  </div>
                ) : null}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Reason</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="input min-h-[100px] resize-none"
                placeholder="Explain your reason for leave (min 10 chars)..."
                id="apply-reason"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Remarks (optional)</label>
              <textarea
                value={form.lateReason}
                onChange={(e) => setForm({ ...form, lateReason: e.target.value })}
                className="input min-h-[80px] resize-none"
                placeholder="Add any context for faculty/admin review..."
                id="apply-late-reason"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Supporting Document (optional)
              </label>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setForm({ ...form, document: e.target.files?.[0] || null })}
                className="input"
                id="apply-document"
              />
              <p className="text-xs text-slate-400 mt-1">Allowed: PDF, JPG, PNG, WEBP up to 5MB.</p>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowApply(false)} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={submitting || exceedsLeaveTypeLimit} className="btn-primary" id="apply-submit">
                {submitting ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                Submit Application
              </button>
            </div>
          </form>
        </Modal>

        {/* Cancel Confirmation */}
        <ConfirmDialog
          isOpen={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleCancel}
          title="Cancel Leave Application"
          message={`Are you sure you want to cancel your ${cancelTarget?.leave_type_name} leave (${cancelTarget?.total_days} days)?`}
          confirmText="Yes, Cancel"
          loading={cancelLoading}
        />

      </div>

    </>
  );
}
