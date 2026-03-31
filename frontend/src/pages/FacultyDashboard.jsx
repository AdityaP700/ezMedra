import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { leaveService } from '../services/leaveService';
import Navbar from '../components/Navbar';
import Badge from '../components/Badge';
import Table from '../components/Table';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const DAY_META = [
  { key: 0, short: 'Sun', full: 'Sunday' },
  { key: 1, short: 'Mon', full: 'Monday' },
  { key: 2, short: 'Tue', full: 'Tuesday' },
  { key: 3, short: 'Wed', full: 'Wednesday' },
  { key: 4, short: 'Thu', full: 'Thursday' },
  { key: 5, short: 'Fri', full: 'Friday' },
  { key: 6, short: 'Sat', full: 'Saturday' },
];

const dayLabel = (day, mode = 'short') => {
  const item = DAY_META.find((d) => Number(d.key) === Number(day));
  if (!item) return `D${day}`;
  return mode === 'full' ? item.full : item.short;
};

const formatSlotTime = (time) => String(time || '').slice(0, 5) || '--:--';

const formatDateInputValue = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const nextDateForDay = (dayOfWeek) => {
  const today = new Date();
  const result = new Date(today);
  const currentDow = result.getDay();
  const targetDow = Number(dayOfWeek);
  let delta = (targetDow - currentDow + 7) % 7;
  if (delta === 0) {
    delta = 7;
  }
  result.setDate(result.getDate() + delta);
  const yyyy = result.getFullYear();
  const mm = String(result.getMonth() + 1).padStart(2, '0');
  const dd = String(result.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function FacultyDashboard() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [teachingAssignments, setTeachingAssignments] = useState([]);
  const [slots, setSlots] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [sessionStudents, setSessionStudents] = useState([]);
  const [attendanceDraft, setAttendanceDraft] = useState({});
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [updatingLifecycle, setUpdatingLifecycle] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [facultyInsights, setFacultyInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState(null);
  const [actionType, setActionType] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [sessionForm, setSessionForm] = useState({
    type: 'REGULAR',
    assignmentId: '',
    classSlotId: '',
    subjectId: '',
    sectionId: '',
    date: '',
    startTime: '',
    endTime: '',
    weight: '1',
    status: 'CONDUCTED',
  });
  const [attendanceForm, setAttendanceForm] = useState({ classSessionId: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await leaveService.getFacultyQueue();
      setLeaves(res.data.data);

      const [assignmentRes, slotRes, insightsRes, subjectRes, sectionRes, recentSessionsRes] = await Promise.allSettled([
        leaveService.getMyTeachingAssignments(),
        leaveService.getClassSlots(user?.id ? { facultyId: user.id } : undefined),
        leaveService.getFacultyInsights(),
        leaveService.getSubjects(),
        leaveService.getSections(),
        leaveService.getFacultyRecentSessions({ limit: 40 }),
      ]);

      if (assignmentRes.status === 'fulfilled') {
        setTeachingAssignments(assignmentRes.value.data.data || []);
      } else {
        setTeachingAssignments([]);
      }

      if (slotRes.status === 'fulfilled') {
        setSlots(slotRes.value.data.data || []);
      } else {
        setSlots([]);
      }

      if (insightsRes.status === 'fulfilled') {
        setFacultyInsights(insightsRes.value.data.data || null);
      } else {
        setFacultyInsights(null);
      }

      if (subjectRes.status === 'fulfilled') {
        setSubjects(subjectRes.value.data.data || []);
      } else {
        setSubjects([]);
      }

      if (sectionRes.status === 'fulfilled') {
        setSections(sectionRes.value.data.data || []);
      } else {
        setSections([]);
      }

      if (recentSessionsRes.status === 'fulfilled') {
        setRecentSessions(recentSessionsRes.value.data.data || []);
      } else {
        setRecentSessions([]);
      }
    } catch {
      toast.error('Failed to load leave requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user?.id]);

  useEffect(() => {
    const classSessionId = Number(attendanceForm.classSessionId);
    if (!classSessionId || classSessionId <= 0) {
      setSessionStudents([]);
      setAttendanceDraft({});
      setAttendanceHistory([]);
      return;
    }

    let isMounted = true;
    setLoadingRoster(true);
    leaveService.getSessionStudents(classSessionId)
      .then((res) => {
        if (!isMounted) return;
        const students = res.data.data?.students || [];
        setSessionStudents(students);
        const initialDraft = {};
        students.forEach((student) => {
          initialDraft[student.id] = student.attendance_status === 'PRESENT' || student.attendance_status === 'ABSENT'
            ? student.attendance_status
            : '';
        });
        setAttendanceDraft(initialDraft);
      })
      .catch((err) => {
        if (!isMounted) return;
        setSessionStudents([]);
        toast.error(err.response?.data?.message || 'Failed to load eligible students for this session.');
      })
      .finally(() => {
        if (!isMounted) return;
        setLoadingRoster(false);
      });

    return () => {
      isMounted = false;
    };
  }, [attendanceForm.classSessionId]);

  useEffect(() => {
    const classSessionId = Number(attendanceForm.classSessionId);
    if (!classSessionId || classSessionId <= 0) {
      setAttendanceHistory([]);
      return;
    }

    let isMounted = true;
    setLoadingHistory(true);
    leaveService.getAttendanceHistory(classSessionId, { limit: 10 })
      .then((res) => {
        if (!isMounted) return;
        setAttendanceHistory(res.data.data || []);
      })
      .catch(() => {
        if (!isMounted) return;
        setAttendanceHistory([]);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoadingHistory(false);
      });

    return () => {
      isMounted = false;
    };
  }, [attendanceForm.classSessionId]);

  const openAction = (leave, type) => {
    setActionTarget(leave);
    setActionType(type);
    setRemarks('');
  };

  const handleAction = async () => {
    if (actionType === 'reject' && remarks.trim().length < 5) {
      toast.error('Remarks required for rejection (min 5 chars).');
      return;
    }
    setSubmitting(true);
    try {
      if (actionType === 'forward') {
        await leaveService.forwardLeave(actionTarget.id, { remarks: remarks || null });
        toast.success('Leave forwarded to admin.');
      } else {
        await leaveService.rejectLeaveByFaculty(actionTarget.id, { remarks });
        toast.success('Rejection recommendation sent to admin.');
      }
      setActionTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSessionMark = async (e) => {
    e.preventDefault();
    if (!sessionForm.date) {
      toast.error('Please select a date for the session.');
      return;
    }

    try {
      const payload = {
        date: sessionForm.date,
        status: sessionForm.status,
        type: sessionForm.type,
        weight: Number(sessionForm.weight || 1),
      };

      if (sessionForm.type === 'EXTRA') {
        if (!sessionForm.subjectId || !sessionForm.sectionId || !sessionForm.startTime || !sessionForm.endTime) {
          toast.error('For EXTRA class, subject, section, start time and end time are required.');
          return;
        }
        payload.subjectId = Number(sessionForm.subjectId);
        payload.sectionId = Number(sessionForm.sectionId);
        payload.startTime = sessionForm.startTime;
        payload.endTime = sessionForm.endTime;
      } else {
        if (!sessionForm.classSlotId) {
          toast.error('Please select a class slot.');
          return;
        }
        payload.classSlotId = Number(sessionForm.classSlotId);
      }

      const sessionRes = await leaveService.markClassSession(payload);
      const createdSessionId = sessionRes?.data?.data?.id;
      toast.success('Session marked successfully.');
      setSessionForm({ type: 'REGULAR', assignmentId: '', classSlotId: '', subjectId: '', sectionId: '', date: '', startTime: '', endTime: '', weight: '1', status: 'CONDUCTED' });
      if (createdSessionId) {
        setAttendanceForm({ classSessionId: String(createdSessionId) });
      }
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to mark session.');
    }
  };

  const selectedSession = recentSessions.find((session) => Number(session.id) === Number(attendanceForm.classSessionId));
  const isSessionOpen = (selectedSession?.lifecycle_status || 'OPEN') === 'OPEN';
  const selectedAssignment = sessionForm.type === 'REGULAR'
    ? teachingAssignments.find((a) => Number(a.assignment_id) === Number(sessionForm.assignmentId))
    : null;
  const assignmentSlots = selectedAssignment
    ? slots.filter((slot) => Number(slot.subject_id) === Number(selectedAssignment.subject_id) && Number(slot.section_id) === Number(selectedAssignment.section_id))
    : [];
  const selectedRegularSlot = sessionForm.type === 'REGULAR'
    ? slots.find((slot) => Number(slot.id) === Number(sessionForm.classSlotId))
    : null;
  const suggestedDate = selectedRegularSlot ? nextDateForDay(selectedRegularSlot.day_of_week) : '';
  const today = new Date();
  const todayDow = today.getDay();
  const todayDate = formatDateInputValue(today);
  const todaysSlots = slots
    .filter((slot) => Number(slot.day_of_week) === Number(todayDow))
    .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));
  const weeklySchedule = DAY_META.map((day) => ({
    ...day,
    slots: slots
      .filter((slot) => Number(slot.day_of_week) === day.key)
      .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || ''))),
  })).filter((day) => day.slots.length > 0);

  const setAllStudentsStatus = (status) => {
    setAttendanceDraft((prev) => {
      const next = { ...prev };
      sessionStudents.forEach((student) => {
        next[student.id] = status;
      });
      return next;
    });
  };

  const handleAttendanceMark = async (e) => {
    e.preventDefault();
    if (!attendanceForm.classSessionId || Number(attendanceForm.classSessionId) <= 0) {
      toast.error('Please select a class session.');
      return;
    }

    if (!isSessionOpen) {
      toast.error(`Session is ${selectedSession?.lifecycle_status || 'LOCKED'}. Attendance edits are blocked.`);
      return;
    }

    const marks = sessionStudents
      .map((student) => ({
        studentId: Number(student.id),
        oldStatus: student.attendance_status,
        status: attendanceDraft[student.id] || '',
      }))
      .filter((row) => (row.status === 'PRESENT' || row.status === 'ABSENT') && row.status !== row.oldStatus)
      .map(({ studentId, status }) => ({ studentId, status }));

    if (marks.length === 0) {
      toast.error('No attendance changes detected.');
      return;
    }

    try {
      await leaveService.markAttendance(Number(attendanceForm.classSessionId), {
        marks,
        reason: correctionReason.trim() || undefined,
      });
      toast.success(`Attendance saved for ${marks.length} student(s).`);
      const [refreshedRoster, refreshedHistory] = await Promise.all([
        leaveService.getSessionStudents(Number(attendanceForm.classSessionId)),
        leaveService.getAttendanceHistory(Number(attendanceForm.classSessionId), { limit: 10 }),
      ]);
      const students = refreshedRoster.data.data?.students || [];
      setSessionStudents(students);
      const nextDraft = {};
      students.forEach((student) => {
        nextDraft[student.id] = student.attendance_status === 'PRESENT' || student.attendance_status === 'ABSENT'
          ? student.attendance_status
          : '';
      });
      setAttendanceDraft(nextDraft);
      setAttendanceHistory(refreshedHistory.data.data || []);
      setCorrectionReason('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to mark attendance.');
    }
  };

  const handleLifecycleAction = async (lifecycleStatus) => {
    if (!attendanceForm.classSessionId || Number(attendanceForm.classSessionId) <= 0) {
      toast.error('Select a class session first.');
      return;
    }

    setUpdatingLifecycle(true);
    try {
      await leaveService.updateSessionLifecycle(Number(attendanceForm.classSessionId), {
        lifecycleStatus,
        reason: correctionReason.trim() || undefined,
      });
      toast.success(`Session moved to ${lifecycleStatus}.`);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update session lifecycle.');
    } finally {
      setUpdatingLifecycle(false);
    }
  };

  const applyTodaySlotPreset = (slot) => {
    const matchedAssignment = teachingAssignments.find(
      (a) => Number(a.subject_id) === Number(slot.subject_id) && Number(a.section_id) === Number(slot.section_id)
    );
    setSessionForm((prev) => ({
      ...prev,
      type: 'REGULAR',
      assignmentId: matchedAssignment ? String(matchedAssignment.assignment_id) : prev.assignmentId,
      classSlotId: String(slot.id),
      date: todayDate,
      status: 'CONDUCTED',
      weight: '1',
    }));
  };

  const quickMarkTodaySlot = async (slot) => {
    try {
      const sessionRes = await leaveService.markClassSession({
        classSlotId: Number(slot.id),
        date: todayDate,
        status: 'CONDUCTED',
        type: 'REGULAR',
        weight: 1,
      });
      const createdSessionId = sessionRes?.data?.data?.id;
      toast.success(`Marked today's class for ${slot.subject_code || slot.subject_name}.`);
      if (createdSessionId) {
        setAttendanceForm({ classSessionId: String(createdSessionId) });
      }
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to mark today\'s class.');
    }
  };

  const quickCancelTodaySlot = async (slot) => {
    try {
      await leaveService.markClassSession({
        classSlotId: Number(slot.id),
        date: todayDate,
        status: 'CANCELLED',
        type: 'REGULAR',
        weight: 1,
      });
      toast.success(`Cancelled today's class for ${slot.subject_code || slot.subject_name}.`);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel today\'s class.');
    }
  };

  const columns = [
    { key: 'student_name', label: 'Student' },
    { key: 'leave_type_name', label: 'Leave Type' },
    {
      key: 'dates',
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
    {
      key: 'reason',
      label: 'Reason',
      render: (row) => (
        <span className="max-w-[200px] truncate block" title={row.reason}>
          {row.reason}
        </span>
      ),
    },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="flex gap-2">
          <button
            onClick={() => openAction(row, 'forward')}
            className="btn-primary !py-1.5 !px-3 !text-xs"
            id={`forward-${row.id}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Recommend Approve
          </button>
          <button
            onClick={() => openAction(row, 'reject')}
            className="btn-danger !py-1.5 !px-3 !text-xs"
            id={`reject-${row.id}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            Recommend Reject
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Navbar title="Leave Review Queue" />
      <div className="p-6 space-y-6 fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Leave Review Queue</h2>
            <p className="text-slate-400 mt-1">
              {leaves.length} pending request{leaves.length !== 1 ? 's' : ''} in your department
            </p>
          </div>
          <button onClick={fetchData} className="btn-outline" id="refresh-faculty">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            Refresh
          </button>
        </div>

        <Table
          columns={columns}
          data={leaves}
          loading={loading}
          emptyMessage="No pending leave requests. All caught up! 🎉"
        />

        {facultyInsights && (
          <div className="card p-4">
            <p className="text-sm text-slate-500">Faculty Irregularity Insight</p>
            <p className="text-lg font-semibold text-slate-800 mt-1">Irregularity Score: {facultyInsights.irregularityScore}</p>
            <p className="text-sm text-slate-600 mt-1">{facultyInsights.message}</p>
          </div>
        )}

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Your Weekly Schedule</h3>
            <p className="text-xs text-slate-500">Read-only timetable context</p>
          </div>
          {weeklySchedule.length === 0 ? (
            <p className="text-sm text-slate-500 mt-3">No assigned timetable slots found.</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {weeklySchedule.map((day) => (
                <div key={day.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-700">{day.full}</p>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                    {day.slots.map((slot) => (
                      <li key={slot.id}>
                        {slot.subject_code || slot.subject_name} • {formatSlotTime(slot.start_time)}-{formatSlotTime(slot.end_time)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Today's Classes ({dayLabel(todayDow, 'full')})</h3>
            <p className="text-xs text-slate-500">One-click actions</p>
          </div>
          {todaysSlots.length === 0 ? (
            <p className="text-sm text-slate-500 mt-3">No scheduled classes today.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {todaysSlots.map((slot) => (
                <div key={slot.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">{slot.subject_code || slot.subject_name}</span> • {formatSlotTime(slot.start_time)}-{formatSlotTime(slot.end_time)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-success !py-1.5 !px-3 !text-xs" onClick={() => quickMarkTodaySlot(slot)}>Mark Attendance</button>
                    <button type="button" className="btn-danger !py-1.5 !px-3 !text-xs" onClick={() => quickCancelTodaySlot(slot)}>Cancel Class</button>
                    <button type="button" className="btn-outline !py-1.5 !px-3 !text-xs" onClick={() => applyTodaySlotPreset(slot)}>Prepare Extra/Edit</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <details className="card p-4" open={false}>
            <summary className="cursor-pointer list-none flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">Advanced Session Controls</h3>
              <span className="text-xs text-slate-500">Show/Hide</span>
            </summary>
            <form onSubmit={handleSessionMark} className="space-y-3 mt-3">
            <select
              value={sessionForm.type}
              onChange={(e) => setSessionForm({ ...sessionForm, type: e.target.value })}
              className="input"
            >
              <option value="REGULAR">REGULAR</option>
              <option value="EXTRA">EXTRA (Make-up)</option>
            </select>
            {sessionForm.type === 'REGULAR' ? (
              <>
                <select
                  value={sessionForm.assignmentId}
                  onChange={(e) => {
                    const assignmentId = e.target.value;
                    const assignment = teachingAssignments.find((item) => Number(item.assignment_id) === Number(assignmentId));
                    const matchingSlots = assignment
                      ? slots.filter((slot) => Number(slot.subject_id) === Number(assignment.subject_id) && Number(slot.section_id) === Number(assignment.section_id))
                      : [];
                    const preferredSlotId = assignment?.default_class_slot_id || matchingSlots[0]?.id || '';

                    setSessionForm((prev) => ({
                      ...prev,
                      assignmentId,
                      classSlotId: preferredSlotId ? String(preferredSlotId) : '',
                    }));
                  }}
                  className="input"
                >
                  <option value="">Select teaching assignment</option>
                  {teachingAssignments.map((assignment) => (
                    <option key={assignment.assignment_id} value={assignment.assignment_id}>
                      {assignment.subject_code || assignment.subject_name} - {assignment.section_name}
                    </option>
                  ))}
                </select>

                <select
                  value={sessionForm.classSlotId}
                  onChange={(e) => setSessionForm({ ...sessionForm, classSlotId: e.target.value })}
                  className="input"
                  disabled={!sessionForm.assignmentId}
                >
                  <option value="">Select timetable slot</option>
                  {assignmentSlots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {dayLabel(slot.day_of_week, 'short')} • {formatSlotTime(slot.start_time)}-{formatSlotTime(slot.end_time)}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <select
                  value={sessionForm.subjectId}
                  onChange={(e) => setSessionForm({ ...sessionForm, subjectId: e.target.value })}
                  className="input"
                >
                  <option value="">Select subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.code} - {subject.name}</option>
                  ))}
                </select>
                <select
                  value={sessionForm.sectionId}
                  onChange={(e) => setSessionForm({ ...sessionForm, sectionId: e.target.value })}
                  className="input"
                >
                  <option value="">Select section</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>{section.name} (Sem {section.semester})</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="time"
                    value={sessionForm.startTime}
                    onChange={(e) => setSessionForm({ ...sessionForm, startTime: e.target.value })}
                    className="input"
                  />
                  <input
                    type="time"
                    value={sessionForm.endTime}
                    onChange={(e) => setSessionForm({ ...sessionForm, endTime: e.target.value })}
                    className="input"
                  />
                </div>
              </>
            )}
            <input
              type="date"
              value={sessionForm.date}
              onChange={(e) => setSessionForm({ ...sessionForm, date: e.target.value })}
              className="input"
            />
            {sessionForm.type === 'REGULAR' && selectedRegularSlot ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
                <p>
                  Slot schedule: <span className="font-semibold">{dayLabel(selectedRegularSlot.day_of_week, 'full')}</span> • {formatSlotTime(selectedRegularSlot.start_time)}-{formatSlotTime(selectedRegularSlot.end_time)}
                </p>
                <p className="mt-1">
                  Suggested next date: <span className="font-semibold">{suggestedDate}</span>
                </p>
                <button
                  type="button"
                  className="mt-2 btn-outline !py-1 !px-2 !text-xs"
                  onClick={() => setSessionForm((prev) => ({ ...prev, date: suggestedDate }))}
                >
                  Use suggested date
                </button>
              </div>
            ) : null}
            <select
              value={sessionForm.weight}
              onChange={(e) => setSessionForm({ ...sessionForm, weight: e.target.value })}
              className="input"
            >
              <option value="1">Session Weight: 1x</option>
              <option value="2">Session Weight: 2x (Double Attendance)</option>
            </select>
            <select
              value={sessionForm.status}
              onChange={(e) => setSessionForm({ ...sessionForm, status: e.target.value })}
              className="input"
            >
              <option value="CONDUCTED">CONDUCTED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
            <button type="submit" className="btn-primary">{sessionForm.type === 'EXTRA' ? 'Add Extra Class' : 'Save Session'}</button>
            </form>
          </details>

          <form onSubmit={handleAttendanceMark} className="card p-4 space-y-3">
            <h3 className="text-base font-semibold text-slate-800">Bulk Attendance</h3>
            <select
              value={attendanceForm.classSessionId}
              onChange={(e) => setAttendanceForm({ classSessionId: e.target.value })}
              className="input"
            >
              <option value="">Select recently marked session</option>
              {recentSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  #{session.id} | {session.date} | {session.subject_code || session.subject_name} | {session.section_name || 'No Section'} | {session.status} | {session.lifecycle_status || 'OPEN'}
                </option>
              ))}
            </select>

            {selectedSession ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p>
                  Session #{selectedSession.id} • {selectedSession.subject_code || selectedSession.subject_name} • Lifecycle: <span className="font-semibold">{selectedSession.lifecycle_status || 'OPEN'}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="btn-outline !py-1.5 !px-3 !text-xs" disabled={updatingLifecycle} onClick={() => handleLifecycleAction('OPEN')}>Reopen</button>
                  <button type="button" className="btn-outline !py-1.5 !px-3 !text-xs" disabled={updatingLifecycle} onClick={() => handleLifecycleAction('LOCKED')}>Lock</button>
                  <button type="button" className="btn-primary !py-1.5 !px-3 !text-xs" disabled={updatingLifecycle} onClick={() => handleLifecycleAction('FINALIZED')}>Finalize</button>
                </div>
              </div>
            ) : null}

            <textarea
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              className="input min-h-[72px] resize-none"
              placeholder="Reason for correction/lifecycle change (recommended for governance)"
            />

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-outline !py-1.5 !px-3 !text-xs" onClick={() => setAllStudentsStatus('PRESENT')} disabled={!isSessionOpen || loadingRoster}>Mark All Present</button>
              <button type="button" className="btn-outline !py-1.5 !px-3 !text-xs" onClick={() => setAllStudentsStatus('ABSENT')} disabled={!isSessionOpen || loadingRoster}>Mark All Absent</button>
              <button type="button" className="btn-ghost !py-1.5 !px-3 !text-xs" onClick={() => setAttendanceDraft({})} disabled={loadingRoster}>Clear Draft</button>
            </div>

            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left text-slate-600">
                    <th className="px-3 py-2 font-medium">Student</th>
                    <th className="px-3 py-2 font-medium">Current</th>
                    <th className="px-3 py-2 font-medium">New Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRoster ? (
                    <tr><td className="px-3 py-3 text-slate-400" colSpan={3}>Loading eligible students...</td></tr>
                  ) : sessionStudents.length === 0 ? (
                    <tr><td className="px-3 py-3 text-slate-400" colSpan={3}>No eligible students for this session.</td></tr>
                  ) : (
                    sessionStudents.map((student) => (
                      <tr key={student.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{student.first_name} {student.last_name} ({student.student_code || student.email})</td>
                        <td className="px-3 py-2 text-slate-600">{student.attendance_status}</td>
                        <td className="px-3 py-2">
                          <select
                            value={attendanceDraft[student.id] || ''}
                            onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, [student.id]: e.target.value }))}
                            className="input !h-9"
                            disabled={!isSessionOpen}
                          >
                            <option value="">Unmarked</option>
                            <option value="PRESENT">PRESENT</option>
                            <option value="ABSENT">ABSENT</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <button type="submit" className="btn-primary" disabled={!isSessionOpen || loadingRoster}>Save Bulk Attendance</button>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-600">Recent Attendance Changes</p>
              {loadingHistory ? <p className="text-xs text-slate-400 mt-2">Loading history...</p> : null}
              {!loadingHistory && attendanceHistory.length === 0 ? <p className="text-xs text-slate-400 mt-2">No change history found.</p> : null}
              {!loadingHistory && attendanceHistory.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {attendanceHistory.map((item) => (
                    <li key={item.id}>
                      {item.student_name}: {item.old_status || 'UNMARKED'} {'->'} {item.new_status} by {item.changed_by_name || 'system'}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </form>
        </div>

        {/* Action Modal */}
        <Modal
          isOpen={!!actionTarget}
          onClose={() => setActionTarget(null)}
          title={actionType === 'forward' ? 'Recommend Leave for Approval' : 'Recommend Leave for Rejection'}
          size="sm"
        >
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <p className="text-sm"><span className="font-medium text-slate-700">Student:</span> {actionTarget?.student_name}</p>
              <p className="text-sm"><span className="font-medium text-slate-700">Type:</span> {actionTarget?.leave_type_name}</p>
              <p className="text-sm"><span className="font-medium text-slate-700">Days:</span> {actionTarget?.total_days}</p>
              <p className="text-sm"><span className="font-medium text-slate-700">Reason:</span> {actionTarget?.reason}</p>
              <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                <p className="text-sm"><span className="font-medium text-slate-700">Current Attendance:</span> <span className="font-semibold text-sky-700">{Number(actionTarget?.current_attendance || 0).toFixed(1)}%</span></p>
                <p className="text-sm"><span className="font-medium text-slate-700">After Leave:</span> <span className={`font-semibold ${Number(actionTarget?.projected_attendance || 0) < 75 ? 'text-red-600' : 'text-emerald-700'}`}>{Number(actionTarget?.projected_attendance || 0).toFixed(1)}%</span></p>
                <p className="text-sm"><span className="font-medium text-slate-700">System Recommendation:</span> <span className={`font-semibold ${actionTarget?.recommendation === 'REJECT' ? 'text-red-600' : 'text-emerald-700'}`}>{actionTarget?.recommendation || 'N/A'}</span></p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Remarks {actionType === 'reject' ? '(required)' : '(optional)'}
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="input min-h-[80px] resize-none"
                placeholder={actionType === 'reject' ? 'Reason for rejection...' : 'Any notes for admin...'}
                id="action-remarks"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setActionTarget(null)} className="btn-ghost" disabled={submitting}>Cancel</button>
              <button
                onClick={handleAction}
                disabled={submitting}
                className={actionType === 'forward' ? 'btn-primary' : 'btn-danger'}
                id="action-submit"
              >
                {submitting ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                {actionType === 'forward' ? 'Recommend Approve → Forward to HOD' : 'Recommend Reject → Forward to HOD'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
}
