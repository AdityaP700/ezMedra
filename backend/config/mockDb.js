/**
 * In-Memory Mock Database
 * ========================
 * Simulates PostgreSQL pool.query() and pool.connect() behavior
 * using in-memory arrays. Activated by setting USE_MOCK_DB=true in .env
 *
 * Includes pre-seeded data:
 *  - 4 departments
 *  - 4 leave types
 *  - 3 users (admin, faculty, student) with bcrypt-hashed passwords
 */

const bcrypt = require('bcrypt');

// ── In-Memory Tables ──────────────────────────────
let departments = [
  { id: 1, name: 'Information Technology', code: 'IT', created_at: new Date() },
  { id: 2, name: 'Computer Science & Engineering', code: 'CSE', created_at: new Date() },
  { id: 3, name: 'Computer Engineering', code: 'CE', created_at: new Date() },
  { id: 4, name: 'Electrical Engineering', code: 'EE', created_at: new Date() },
  { id: 5, name: 'Electronics & Communication Engineering', code: 'ECE', created_at: new Date() },
];

let leaveTypes = [
  { id: 1, name: 'Sick Leave', description: 'Medical or health-related leave', max_days: 10, is_active: true, created_at: new Date() },
  { id: 2, name: 'Casual Leave', description: 'Personal or casual leave', max_days: 7, is_active: true, created_at: new Date() },
  { id: 3, name: 'Academic Leave', description: 'Conference, workshop, or academic event', max_days: 5, is_active: true, created_at: new Date() },
  { id: 4, name: 'Emergency Leave', description: 'Urgent or emergency leave', max_days: 3, is_active: true, created_at: new Date() },
];

let users = [];
let facultyProfiles = [];
let leaveApplications = [];
let notifications = [];
let classSlots = [];
let classSessions = [];
let attendanceRows = [];

let nextUserId = 1;
let nextFacultyProfileId = 1;
let nextLeaveId = 1;
let nextNotificationId = 1;
let nextClassSessionId = 1;

// ── Password Hashing for Seed Data ─────────────────
let seeded = false;

async function ensureSeeded() {
  if (seeded) return;
  seeded = true;

  const hash = await bcrypt.hash('admin123', 12);
  const fHash = await bcrypt.hash('faculty123', 12);
  const sHash = await bcrypt.hash('student123', 12);

  users = [
    {
      id: nextUserId++, first_name: 'Admin', last_name: 'HOD', email: 'admin@slms.com', password: hash,
      role: 'admin', admin_type: 'DEPARTMENT_ADMIN', department_id: 1, section_id: null, semester: 1,
      attendance_percentage: 100, leave_balance: 0, is_active: true, created_at: new Date(), updated_at: new Date(),
    },
    {
      id: nextUserId++, first_name: 'Dr. Sharma', last_name: 'Faculty', email: 'faculty@slms.com', password: fHash,
      role: 'faculty', admin_type: null, department_id: 1, section_id: null, semester: 1,
      attendance_percentage: 100, leave_balance: 0, is_active: true, created_at: new Date(), updated_at: new Date(),
    },
    {
      id: nextUserId++, first_name: 'Aditya', last_name: 'Patel', email: 'student@slms.com', password: sHash,
      role: 'student', admin_type: null, department_id: 1, section_id: 1, semester: 5,
      attendance_percentage: 82, leave_balance: 20, is_active: true, created_at: new Date(), updated_at: new Date(),
    },
  ];

  facultyProfiles = [
    { id: nextFacultyProfileId++, user_id: 2, department_id: 1, designation: 'Associate Professor', created_at: new Date() },
  ];

  classSlots = [
    { id: 1, subject_id: 1, faculty_id: 2, section_id: 1, day_of_week: 1, start_time: '10:00', end_time: '11:00', is_lab: false, created_at: new Date() },
  ];

  classSessions = [
    {
      id: nextClassSessionId++, class_slot_id: 1, subject_id: 1, faculty_id: 2, section_id: 1,
      date: new Date().toISOString().slice(0, 10), start_time: '10:00', end_time: '11:00',
      status: 'CONDUCTED', type: 'REGULAR', weight: 1,
      cancellation_source: null, cancellation_reason: null, created_at: new Date(), updated_at: new Date(),
    },
  ];

  console.log('🧪 Mock DB seeded with test accounts');
  console.log('   Admin:   admin@slms.com   / admin123');
  console.log('   Faculty: faculty@slms.com / faculty123');
  console.log('   Student: student@slms.com / student123');
}

// ── Helper: Deep clone rows to prevent mutation ────
function clone(rows) {
  return JSON.parse(JSON.stringify(rows));
}

// ── Query Router ──────────────────────────────────
// Parses SQL strings and routes to the correct in-memory handler

function parseQuery(text, params) {
  const t = text.replace(/\s+/g, ' ').trim().toLowerCase();

  // ─── DEPARTMENTS ───
  if (t.includes('from departments')) {
    return { rows: clone(departments) };
  }

  // ─── Academic: mark-attendance authority query ───
  if (t.includes('teaching_permission') && t.includes('join class_slots cs') && t.includes('where u.id')) {
    const userId = Number(params[0]);
    const classSlotId = Number(params[1]);
    const user = users.find((u) => Number(u.id) === userId);
    const slot = classSlots.find((s) => Number(s.id) === classSlotId);
    if (!user || !slot) return { rows: [] };
    return {
      rows: [{
        role: user.role,
        faculty_id: slot.faculty_id,
        teaching_permission: user.role === 'faculty' || user.role === 'phd_scholar' || user.role === 'ta',
      }],
    };
  }

  // ─── AUTH: find by email ───
  if (t.includes('from users u') && t.includes('where u.email')) {
    const email = params[0];
    const user = users.find((u) => u.email === email);
    if (!user) return { rows: [] };
    const dept = departments.find((d) => d.id === user.department_id);
    return { rows: [clone({ ...user, department_name: dept?.name || null })] };
  }

  // ─── AUTH: find by id ───
  if (t.includes('from users u') && t.includes('where u.id')) {
    const id = Number(params[0]);
    const user = users.find((u) => Number(u.id) === id);
    if (!user) return { rows: [] };
    const dept = departments.find((d) => d.id === user.department_id);
    const { password, ...safe } = user;
    return { rows: [clone({ ...safe, department_name: dept?.name || null })] };
  }

  // ─── AUTH: create user ───
  if (t.includes('insert into users')) {
    const newUser = {
      id: nextUserId++,
      first_name: params[0],
      last_name: params[1],
      email: params[2],
      password: params[3],
      role: params[4],
      admin_type: params[5] || null,
      department_id: params[6] || null,
      section_id: params[7] || null,
      student_code: params[8] || null,
      program: params[9] || null,
      semester: params[10] || 1,
      leave_balance: 20,
      attendance_percentage: 100,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
    // ON CONFLICT (email) DO NOTHING
    if (users.find((u) => u.email === newUser.email)) {
      return { rows: [] };
    }
    users.push(newUser);
    const { password, ...safe } = newUser;
    return { rows: [clone(safe)] };
  }

  // ─── Faculty profile ───
  if (t.includes('insert into faculty_profiles')) {
    const profile = {
      id: nextFacultyProfileId++,
      user_id: params[0],
      department_id: params[1],
      designation: params[2] || 'Faculty',
      created_at: new Date(),
    };
    if (!facultyProfiles.find((fp) => fp.user_id === profile.user_id)) {
      facultyProfiles.push(profile);
    }
    return { rows: [clone(profile)] };
  }

  // ─── LEAVE TYPES ───
  if (t.includes('from leave_types') && t.includes('is_active')) {
    return { rows: clone(leaveTypes.filter((lt) => lt.is_active)) };
  }

  // ─── Academic: subjects ───
  if (t.includes('from subjects s') && t.includes('join departments d')) {
    return {
      rows: [{
        id: 1,
        code: 'IT501',
        name: 'Data Structures',
        type: 'THEORY',
        credits: 3,
        department_id: 1,
        semester: 5,
        department_name: 'Information Technology',
      }],
    };
  }

  // ─── Academic: sections ───
  if (t.includes('from sections')) {
    return { rows: [{ id: 1, name: 'IT1', branch: 'IT', semester: 5, department_id: 1, created_at: new Date() }] };
  }

  // ─── LEAVE: student leaves ───
  if (t.includes('from leave_applications la') && t.includes('where la.student_id')) {
    const studentId = params[0];
    const result = leaveApplications
      .filter((la) => la.student_id === studentId)
      .map((la) => enrichLeave(la))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { rows: clone(result) };
  }

  // ─── LEAVE: check overlap ───
  if (t.includes('from leave_applications') && t.includes('not in') && t.includes('start_date <=') && t.includes('end_date >=')) {
    const studentId = params[0];
    const startDate = new Date(params[1]);
    const endDate = new Date(params[2]);
    const excludeId = params[3] || null;
    const overlapping = leaveApplications.filter((la) => {
      if (la.student_id !== studentId) return false;
      if (['rejected', 'cancelled'].includes(la.status)) return false;
      if (excludeId && la.id === excludeId) return false;
      return new Date(la.start_date) <= endDate && new Date(la.end_date) >= startDate;
    });
    return { rows: overlapping.map((la) => ({ id: la.id })) };
  }

  // ─── LEAVE: create ───
  if (t.includes('insert into leave_applications')) {
    const newLeave = {
      id: nextLeaveId++,
      student_id: params[0],
      assigned_faculty_id: params[1] || null,
      leave_type_id: params[2],
      start_date: params[3],
      end_date: params[4],
      start_time: params[5] || null,
      end_time: params[6] || null,
      total_days: params[7],
      reason: params[8],
      is_late: params[9] || false,
      late_reason: params[10] || null,
      current_attendance: params[11] || 100,
      risk_flag: params[12] || 'NORMAL',
      risk_indicator: params[13] || 'GREEN',
      recommendation: params[14] || 'APPROVE',
      calculated_at: params[15] || new Date().toISOString(),
      projected_attendance: params[16] || 100,
      document_required: params[17] || false,
      status: params[18] || 'pending',
      parent_application_id: params[19] || null,
      version_no: params[20] || 1,
      faculty_remarks: null,
      faculty_recommendation: null,
      admin_remarks: null,
      override_flag: false,
      approved_days: null,
      reviewed_by_faculty: null,
      reviewed_by_admin: null,
      faculty_reviewed_at: null,
      admin_reviewed_at: null,
      is_deleted: false,
      has_document: false,
      created_at: new Date(),
      updated_at: new Date(),
    };
    leaveApplications.push(newLeave);
    return { rows: [clone(newLeave)] };
  }

  // ─── LEAVE: cancel ───
  if (t.includes('update leave_applications') && t.includes("status = 'cancelled'")) {
    const leaveId = parseInt(params[0]);
    const studentId = parseInt(params[1]);
    const leave = leaveApplications.find((la) => la.id === leaveId && la.student_id === studentId && la.status === 'pending');
    if (!leave) return { rows: [] };
    leave.status = 'cancelled';
    leave.updated_at = new Date();
    return { rows: [clone(leave)] };
  }

  // ─── LEAVE: get balance ───
  if (t.includes('leave_balance') && t.includes('from users') && t.includes('where id')) {
    const user = users.find((u) => Number(u.id) === Number(params[0]));
    if (!user) return { rows: [] };
    return {
      rows: [{
        id: user.id,
        department_id: user.department_id,
        section_id: user.section_id || null,
        leave_balance: user.leave_balance,
        attendance_percentage: user.attendance_percentage,
        semester: user.semester,
      }],
    };
  }

  // ─── LEAVE: student insights metrics ───
  if (t.includes('pending_count') && t.includes('approved_count') && t.includes('from leave_applications') && t.includes('where student_id')) {
    const studentId = Number(params[0]);
    const mine = leaveApplications.filter((la) => Number(la.student_id) === studentId);
    const pending = mine.filter((la) => la.status === 'pending').length;
    const approved = mine.filter((la) => la.status === 'approved').length;
    return {
      rows: [{
        pending_count: pending,
        approved_count: approved,
        active_high_risk_count: 0,
        document_required_count: 0,
        documented_count: 0,
      }],
    };
  }

  // ─── FACULTY: pending leaves for department ───
  if (t.includes('from leave_applications la') && t.includes('us.department_id') && t.includes("la.status = 'pending'") && t.includes('la.is_deleted = false') && t.includes('la.assigned_faculty_id')) {
    const deptId = params[0];
    const facultyId = params[1];
    const result = leaveApplications
      .filter((la) => {
        if (la.is_deleted) return false;
        const student = users.find((u) => u.id === la.student_id);
        return student?.department_id === deptId && la.status === 'pending'
          && (!la.assigned_faculty_id || la.assigned_faculty_id === facultyId);
      })
      .map((la) => {
        const student = users.find((u) => u.id === la.student_id);
        const lt = leaveTypes.find((t) => t.id === la.leave_type_id);
        return { ...la, leave_type_name: lt?.name, student_name: `${student?.first_name} ${student?.last_name}`, student_email: student?.email };
      })
      .sort((a, b) => {
        // Priority: HIGH_RISK first, then late applications, then by start_date
        const riskA = a.risk_flag === 'HIGH_RISK' ? 0 : 1;
        const riskB = b.risk_flag === 'HIGH_RISK' ? 0 : 1;
        if (riskA !== riskB) return riskA - riskB;
        const lateA = a.is_late ? 0 : 1;
        const lateB = b.is_late ? 0 : 1;
        if (lateA !== lateB) return lateA - lateB;
        return new Date(a.start_date) - new Date(b.start_date);
      });
    return { rows: clone(result) };
  }

  // ─── Academic: class slots ───
  if (t.includes('from class_slots cs') && t.includes('join subjects s') && t.includes('join users u')) {
    const rows = classSlots.map((slot) => {
      const subject = { id: slot.subject_id, code: 'IT501', name: 'Data Structures', department_id: 1, semester: 5 };
      const faculty = users.find((u) => Number(u.id) === Number(slot.faculty_id));
      return {
        ...slot,
        subject_code: subject.code,
        subject_name: subject.name,
        department_id: subject.department_id,
        semester: subject.semester,
        section_name: 'IT1',
        faculty_name: faculty ? `${faculty.first_name} ${faculty.last_name}` : null,
      };
    });
    return { rows: clone(rows) };
  }

  // ─── Academic: attendance summary CTE ───
  if (t.includes('with student_ctx as') && t.includes('conducted_weight') && t.includes('attended_weight')) {
    const studentId = Number(params[0]);
    const relevant = classSessions.filter((s) => s.status === 'CONDUCTED');
    const conducted = relevant.reduce((sum, s) => sum + Number(s.weight || 1), 0);
    const attended = relevant.reduce((sum, s) => {
      const mark = attendanceRows.find((a) => Number(a.student_id) === studentId && Number(a.class_session_id) === Number(s.id));
      return sum + (mark?.status === 'PRESENT' ? Number(s.weight || 1) : 0);
    }, 0);
    return { rows: [{ conducted_weight: conducted, attended_weight: attended }] };
  }

  // ─── Academic: subject risk CTE ───
  if (t.includes('with student_ctx as') && t.includes('subject_id') && t.includes('subject_name') && t.includes('order by sess.subject_name')) {
    const studentId = Number(params[0]);
    const conducted = classSessions.filter((s) => s.status === 'CONDUCTED').reduce((sum, s) => sum + Number(s.weight || 1), 0);
    const attended = classSessions.filter((s) => s.status === 'CONDUCTED').reduce((sum, s) => {
      const mark = attendanceRows.find((a) => Number(a.student_id) === studentId && Number(a.class_session_id) === Number(s.id));
      return sum + (mark?.status === 'PRESENT' ? Number(s.weight || 1) : 0);
    }, 0);
    return { rows: [{ subject_id: 1, subject_name: 'Data Structures', attended, conducted }] };
  }

  // ─── Academic: student extra stats ───
  if (t.includes('extra_sessions_attended') && t.includes('bonus_attendance_credits')) {
    const studentId = Number(params[0]);
    let extraSessionsAttended = 0;
    let bonus = 0;
    for (const s of classSessions) {
      if (s.status !== 'CONDUCTED') continue;
      const mark = attendanceRows.find((a) => Number(a.student_id) === studentId && Number(a.class_session_id) === Number(s.id));
      if (mark?.status === 'PRESENT' && s.type === 'EXTRA') {
        extraSessionsAttended += 1;
      }
      if (mark?.status === 'PRESENT') {
        bonus += Math.max(Number(s.weight || 1) - 1, 0);
      }
    }
    return { rows: [{ extra_sessions_attended: extraSessionsAttended, bonus_attendance_credits: bonus }] };
  }

  // ─── Academic: mark attendance upsert ───
  if (t.includes('insert into attendance') && t.includes('on conflict (student_id, class_session_id)')) {
    const studentId = Number(params[0]);
    const classSessionId = Number(params[1]);
    const status = params[2];
    let existing = attendanceRows.find((a) => Number(a.student_id) === studentId && Number(a.class_session_id) === classSessionId);
    if (!existing) {
      existing = { id: attendanceRows.length + 1, student_id: studentId, class_session_id: classSessionId, status, marked_at: new Date() };
      attendanceRows.push(existing);
    } else {
      existing.status = status;
      existing.marked_at = new Date();
    }
    return { rows: [clone(existing)] };
  }

  // ─── Academic: class session upsert (regular/extra) ───
  if (t.includes('insert into class_sessions') && t.includes('on conflict')) {
    const isExtra = t.includes("'extra'") || (t.includes('subject_id') && t.includes('section_id') && !t.includes('(class_slot_id, date, type)'));
    if (isExtra) {
      const [subjectId, facultyId, sectionId, date, startTime, endTime, status, weight, cancellationSource, cancellationReason] = params;
      let row = classSessions.find(
        (s) => s.type === 'EXTRA'
          && Number(s.subject_id) === Number(subjectId)
          && Number(s.faculty_id) === Number(facultyId)
          && Number(s.section_id) === Number(sectionId)
          && String(s.date) === String(date)
          && String(s.start_time) === String(startTime)
          && String(s.end_time) === String(endTime)
      );
      if (!row) {
        row = {
          id: nextClassSessionId++,
          class_slot_id: null,
          subject_id: Number(subjectId),
          faculty_id: Number(facultyId),
          section_id: Number(sectionId),
          date,
          start_time: startTime,
          end_time: endTime,
          status,
          type: 'EXTRA',
          weight: Number(weight || 1),
          cancellation_source: cancellationSource || null,
          cancellation_reason: cancellationReason || null,
          created_at: new Date(),
          updated_at: new Date(),
        };
        classSessions.push(row);
      } else {
        row.status = status;
        row.weight = Number(weight || row.weight || 1);
        row.cancellation_source = cancellationSource || null;
        row.cancellation_reason = cancellationReason || null;
        row.updated_at = new Date();
      }
      return { rows: [clone(row)] };
    }

    const [classSlotId, date, status, weight, cancellationSource, cancellationReason] = params;
    let row = classSessions.find((s) => Number(s.class_slot_id) === Number(classSlotId) && String(s.date) === String(date) && s.type === 'REGULAR');
    if (!row) {
      const slot = classSlots.find((s) => Number(s.id) === Number(classSlotId));
      row = {
        id: nextClassSessionId++,
        class_slot_id: Number(classSlotId),
        subject_id: slot?.subject_id || 1,
        faculty_id: slot?.faculty_id || 2,
        section_id: slot?.section_id || 1,
        date,
        start_time: slot?.start_time || '10:00',
        end_time: slot?.end_time || '11:00',
        status,
        type: 'REGULAR',
        weight: Number(weight || 1),
        cancellation_source: cancellationSource || null,
        cancellation_reason: cancellationReason || null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      classSessions.push(row);
    } else {
      row.status = status;
      row.weight = Number(weight || row.weight || 1);
      row.cancellation_source = cancellationSource || null;
      row.cancellation_reason = cancellationReason || null;
      row.updated_at = new Date();
    }
    return { rows: [clone(row)] };
  }

  // ─── Academic: class session by id ───
  if (t.includes('from class_sessions cs') && t.includes('where cs.id')) {
    const id = Number(params[0]);
    const session = classSessions.find((s) => Number(s.id) === id);
    if (!session) return { rows: [] };
    return { rows: [clone(session)] };
  }

  // ─── FACULTY: get leave by id (for dept check) ───
  if (t.includes('from leave_applications la') && t.includes('where la.id') && t.includes('student_department_id')) {
    const leaveId = parseInt(params[0]);
    const leave = leaveApplications.find((la) => la.id === leaveId);
    if (!leave) return { rows: [] };
    const student = users.find((u) => u.id === leave.student_id);
    const lt = leaveTypes.find((t) => t.id === leave.leave_type_id);
    return { rows: [clone({ ...leave, leave_type_name: lt?.name, student_name: `${student?.first_name} ${student?.last_name}`, student_department_id: student?.department_id })] };
  }

  // ─── FACULTY: forward leave (recommend approve) ───
  if (t.includes('update leave_applications') && t.includes("status = 'forwarded'") && t.includes("faculty_recommendation = 'forward'") && t.includes("status = 'pending'")) {
    const leaveId = parseInt(params[0]);
    const leave = leaveApplications.find((la) => la.id === leaveId && la.status === 'pending');
    if (!leave) return { rows: [] };
    leave.status = 'forwarded';
    leave.reviewed_by_faculty = params[1];
    leave.faculty_remarks = params[2];
    leave.faculty_recommendation = 'forward';
    leave.faculty_reviewed_at = new Date();
    leave.version_no = (leave.version_no || 1) + 1;
    leave.updated_at = new Date();
    return { rows: [clone(leave)] };
  }

  // ─── FACULTY: recommend reject (forwards to admin with reject recommendation) ───
  if (t.includes('update leave_applications') && t.includes("status = 'forwarded'") && t.includes("faculty_recommendation = 'reject'") && t.includes("status = 'pending'")) {
    const leaveId = parseInt(params[0]);
    const leave = leaveApplications.find((la) => la.id === leaveId && la.status === 'pending');
    if (!leave) return { rows: [] };
    leave.status = 'forwarded';
    leave.reviewed_by_faculty = params[1];
    leave.faculty_remarks = params[2];
    leave.faculty_recommendation = 'reject';
    leave.faculty_reviewed_at = new Date();
    leave.version_no = (leave.version_no || 1) + 1;
    leave.updated_at = new Date();
    return { rows: [clone(leave)] };
  }

  // ─── ADMIN: forwarded leaves ───
  if (t.includes('from leave_applications la') && t.includes("la.status = 'forwarded'") && t.includes('order by la.created_at asc')) {
    const result = leaveApplications
      .filter((la) => la.status === 'forwarded')
      .map((la) => enrichLeaveAdmin(la))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return { rows: clone(result) };
  }

  // ─── ADMIN: get leave for approval (FOR UPDATE) ───
  if (t.includes('from leave_applications la') && t.includes('for update')) {
    const leaveId = parseInt(params[0]);
    const leave = leaveApplications.find((la) => la.id === leaveId && la.status === 'forwarded');
    if (!leave) return { rows: [] };
    const student = users.find((u) => u.id === leave.student_id);
    return { rows: [clone({ ...leave, leave_balance: student?.leave_balance || 0 })] };
  }

  // ─── ADMIN: update leave status to approved ───
  if (t.includes('update leave_applications') && t.includes("status = 'approved'")) {
    const leaveId = parseInt(params[0]);
    const leave = leaveApplications.find((la) => la.id === leaveId);
    if (leave) {
      leave.status = 'approved';
      leave.reviewed_by_admin = params[1];
      leave.admin_remarks = params[2] || null;
      leave.approved_days = params[3] || leave.total_days;
      leave.override_flag = leave.faculty_recommendation === 'reject' || !!params[4];
      leave.admin_reviewed_at = new Date();
      leave.version_no = (leave.version_no || 1) + 1;
      leave.updated_at = new Date();
    }
    return { rows: [] };
  }

  // ─── ADMIN: deduct leave balance ───
  if (t.includes('update users') && t.includes('leave_balance = leave_balance -')) {
    const userId = params[0];
    const days = params[1];
    const user = users.find((u) => u.id === userId);
    if (user) {
      user.leave_balance -= days;
      user.updated_at = new Date();
    }
    return { rows: [] };
  }

  // ─── ADMIN: reject leave (forwarded) ───
  if (t.includes('update leave_applications') && t.includes("status = 'rejected'") && t.includes("status = 'forwarded'")) {
    const leaveId = parseInt(params[0]);
    const leave = leaveApplications.find((la) => la.id === leaveId && la.status === 'forwarded');
    if (!leave) return { rows: [] };
    leave.status = 'rejected';
    leave.reviewed_by_admin = params[1];
    leave.admin_remarks = params[2];
    leave.admin_reviewed_at = new Date();
    leave.updated_at = new Date();
    return { rows: [clone(leave)] };
  }

  // ─── ADMIN: get approved leave (post-approve query) ───
  if (t.includes('from leave_applications la') && t.includes('new_balance') && t.includes('where la.id')) {
    const leaveId = parseInt(params[0]);
    const leave = leaveApplications.find((la) => la.id === leaveId);
    if (!leave) return { rows: [] };
    const student = users.find((u) => u.id === leave.student_id);
    const lt = leaveTypes.find((t) => t.id === leave.leave_type_id);
    return { rows: [clone({ ...leave, leave_type_name: lt?.name, student_name: `${student?.first_name} ${student?.last_name}`, new_balance: student?.leave_balance })] };
  }

  // ─── ADMIN: get all users ───
  if (t.includes('from users u') && t.includes('order by u.created_at desc') && !t.includes('where')) {
    const result = users.map((u) => {
      const dept = departments.find((d) => d.id === u.department_id);
      const { password, ...safe } = u;
      return { ...safe, department_name: dept?.name || null };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { rows: clone(result) };
  }

  // ─── ADMIN: toggle user status ───
  if (t.includes('update users') && t.includes('is_active = not is_active')) {
    const userId = parseInt(params[0]);
    const user = users.find((u) => u.id === userId);
    if (!user) return { rows: [] };
    user.is_active = !user.is_active;
    user.updated_at = new Date();
    return { rows: [clone({ id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email, role: user.role, is_active: user.is_active })] };
  }

  // ─── ADMIN: delete user ───
  if (t.includes('delete from users')) {
    const userId = parseInt(params[0]);
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return { rows: [] };
    const deleted = users.splice(idx, 1)[0];
    return { rows: [{ id: deleted.id, email: deleted.email }] };
  }

  // ─── ADMIN: stats ───
  if (t.includes('count(*)') && t.includes('filter') && t.includes('from leave_applications') && !t.includes('join users')) {
    return {
      rows: [{
        total: String(leaveApplications.length),
        pending: String(leaveApplications.filter((la) => la.status === 'pending').length),
        forwarded: String(leaveApplications.filter((la) => la.status === 'forwarded').length),
        approved: String(leaveApplications.filter((la) => la.status === 'approved').length),
        rejected: String(leaveApplications.filter((la) => la.status === 'rejected').length),
        cancelled: String(leaveApplications.filter((la) => la.status === 'cancelled').length),
      }],
    };
  }

  // ─── REPORTS: filtered list ───
  if (t.includes('count(*) as total') && t.includes('from leave_applications la') && t.includes('join users us')) {
    const filtered = filterLeaves(params, t);
    return { rows: [{ total: String(filtered.length) }] };
  }

  if (t.includes('from leave_applications la') && t.includes('join leave_types lt') && t.includes('join users us') && t.includes('limit')) {
    const filtered = filterLeaves(params, t).map((la) => enrichLeaveAdmin(la));
    // Simple pagination: just return all for mock
    return { rows: clone(filtered) };
  }

  // ─── REPORTS: aggregate stats ───
  if (t.includes('total_applications') && t.includes('total_approved_days')) {
    const filtered = filterLeaves(params, t);
    return {
      rows: [{
        total_applications: String(filtered.length),
        pending: String(filtered.filter((la) => la.status === 'pending').length),
        forwarded: String(filtered.filter((la) => la.status === 'forwarded').length),
        approved: String(filtered.filter((la) => la.status === 'approved').length),
        rejected: String(filtered.filter((la) => la.status === 'rejected').length),
        cancelled: String(filtered.filter((la) => la.status === 'cancelled').length),
        total_approved_days: String(filtered.filter((la) => la.status === 'approved').reduce((sum, la) => sum + la.total_days, 0)),
      }],
    };
  }

  // ─── Transaction control (no-op) ───
  if (t === 'begin' || t === 'commit' || t === 'rollback') {
    return { rows: [] };
  }

  // ─── Notifications: list ───
  if (t.includes('from notifications') && t.includes('where to_user_id') && t.includes('order by created_at desc')) {
    const userId = Number(params[0]);
    const limit = Number(params[1] || 20);
    const items = notifications
      .filter((n) => Number(n.to_user_id) === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit)
      .map((n) => ({ id: n.id, title: n.title, message: n.message, created_at: n.created_at, read_at: n.read_at || null }));
    return { rows: clone(items) };
  }

  // ─── Notifications: unread count ───
  if (t.includes('count(*)::int as unread_count') && t.includes('from notifications') && t.includes('read_at is null')) {
    const userId = Number(params[0]);
    const count = notifications.filter((n) => Number(n.to_user_id) === userId && !n.read_at).length;
    return { rows: [{ unread_count: count }] };
  }

  // ─── Notifications: mark read ───
  if (t.includes('update notifications') && t.includes('set read_at') && t.includes('returning')) {
    const id = Number(params[0]);
    const userId = Number(params[1]);
    const item = notifications.find((n) => Number(n.id) === id && Number(n.to_user_id) === userId);
    if (!item) return { rows: [] };
    if (!item.read_at) item.read_at = new Date();
    return { rows: [{ id: item.id, read_at: item.read_at }] };
  }

  // ─── Notifications: insert ───
  if (t.includes('insert into notifications')) {
    const row = {
      id: nextNotificationId++,
      to_user_id: Number(params[0]),
      title: params[1],
      message: params[2],
      created_at: new Date(),
      read_at: null,
    };
    notifications.push(row);
    return { rows: [clone(row)] };
  }

  // ─── Fallback ───
  console.warn(`⚠️  Mock DB: Unhandled query: ${text.substring(0, 80)}...`);
  return { rows: [] };
}

// ── Enrichment helpers ────────────────────────────
function enrichLeave(la) {
  const lt = leaveTypes.find((t) => t.id === la.leave_type_id);
  const faculty = users.find((u) => u.id === la.reviewed_by_faculty);
  const admin = users.find((u) => u.id === la.reviewed_by_admin);
  return {
    ...la,
    leave_type_name: lt?.name || null,
    faculty_name: faculty ? `${faculty.first_name} ${faculty.last_name}` : null,
    admin_name: admin ? `${admin.first_name} ${admin.last_name}` : null,
  };
}

function enrichLeaveAdmin(la) {
  const student = users.find((u) => u.id === la.student_id);
  const dept = departments.find((d) => d.id === student?.department_id);
  const lt = leaveTypes.find((t) => t.id === la.leave_type_id);
  const faculty = users.find((u) => u.id === la.reviewed_by_faculty);
  const admin = users.find((u) => u.id === la.reviewed_by_admin);
  return {
    ...la,
    leave_type_name: lt?.name || null,
    student_name: student ? `${student.first_name} ${student.last_name}` : null,
    student_email: student?.email || null,
    department_name: dept?.name || null,
    faculty_name: faculty ? `${faculty.first_name} ${faculty.last_name}` : null,
    admin_name: admin ? `${admin.first_name} ${admin.last_name}` : null,
    faculty_remarks: la.faculty_remarks,
  };
}

function filterLeaves(params, queryText) {
  // Simple filter: return all for mock (filters are applied at SQL level in real DB)
  return [...leaveApplications].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// ── Mock Pool Implementation ──────────────────────
const mockPool = {
  async query(text, params = []) {
    await ensureSeeded();
    return parseQuery(text, params);
  },

  async connect() {
    await ensureSeeded();
    // Returns a client-like object for transactions
    return {
      query: (text, params = []) => parseQuery(text, params),
      release: () => {},
    };
  },

  on(event, handler) {
    if (event === 'connect') {
      console.log('🧪 Mock PostgreSQL pool initialized (in-memory)');
    }
  },
};

module.exports = mockPool;
