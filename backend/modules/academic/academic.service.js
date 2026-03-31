const academicRepository = require('./academic.repository');
const leaveRepository = require('../leave/leave.repository');
const leaveService = require('../leave/leave.service');
const { AppError } = require('../../middleware/errorHandler');

const ATTENDANCE_EDIT_FREEZE_DAYS = 7;

class AcademicService {
  async getSections(departmentId, semester) {
    return academicRepository.getSections(departmentId, semester);
  }

  async createSection(payload) {
    return academicRepository.createSection(payload);
  }

  async assignSubject(payload) {
    const mapping = await academicRepository.validateFacultySectionMapping(payload);
    if (!mapping) {
      throw new AppError('Invalid assignment payload.', 400);
    }
    if (Number(mapping.faculty_department) !== Number(mapping.subject_department)) {
      throw new AppError('Faculty cannot be assigned outside subject department.', 400);
    }
    if (payload.sectionId && Number(mapping.faculty_department) !== Number(mapping.section_department)) {
      throw new AppError('Faculty cannot be assigned outside section department.', 400);
    }
    return academicRepository.createSubjectAssignment(payload);
  }

  async upsertTeachingRole(payload) {
    return academicRepository.upsertTeachingRole({
      ...payload,
      permissions: payload.permissions || { markAttendance: true, approveLeave: false },
    });
  }

  async getSubjects(departmentId, semester) {
    return academicRepository.getSubjects(departmentId, semester);
  }

  async createSubject(payload) {
    return academicRepository.createSubject(payload);
  }

  async createClassSlot(payload) {
    const mapping = await academicRepository.validateFacultySectionMapping(payload);
    if (!mapping) {
      throw new AppError('Invalid class slot payload.', 400);
    }
    if (Number(mapping.faculty_department) !== Number(mapping.subject_department)) {
      throw new AppError('Faculty cannot be assigned outside subject department.', 400);
    }
    if (payload.sectionId && Number(mapping.faculty_department) !== Number(mapping.section_department)) {
      throw new AppError('Faculty cannot be assigned outside section department.', 400);
    }
    return academicRepository.createClassSlot(payload);
  }

  async getClassSlots(filters) {
    return academicRepository.getClassSlots(filters);
  }

  async getFacultyTeachingAssignments(facultyId) {
    return academicRepository.getFacultyTeachingAssignments(facultyId);
  }

  async updateClassSlot(id, payload) {
    const updated = await academicRepository.updateClassSlot(id, payload);
    if (!updated) {
      throw new AppError('Class slot not found.', 404);
    }
    return updated;
  }

  async deleteClassSlot(id) {
    const deleted = await academicRepository.deleteClassSlot(id);
    if (!deleted) {
      throw new AppError('Class slot not found.', 404);
    }
    return deleted;
  }

  async markClassSession(facultyId, payload) {
    const sessionType = payload.type || 'REGULAR';
    const sessionWeight = Number(payload.weight || 1);
    if (!Number.isFinite(sessionWeight) || sessionWeight <= 0 || sessionWeight > 2) {
      throw new AppError('Session weight must be between 0 and 2, maximum 2.', 400);
    }

    if (sessionType === 'EXTRA') {
      if (!payload.subjectId || !payload.sectionId || !payload.startTime || !payload.endTime) {
        throw new AppError('Extra class requires subjectId, sectionId, startTime, and endTime.', 400);
      }

      return academicRepository.upsertClassSession({
        classSlotId: null,
        subjectId: payload.subjectId,
        facultyId,
        sectionId: payload.sectionId,
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        status: payload.status,
        type: 'EXTRA',
        weight: sessionWeight,
        cancellationSource: payload.status === 'CANCELLED' ? 'FACULTY' : null,
        cancellationReason: payload.status === 'CANCELLED' ? 'Extra class cancelled manually by faculty.' : null,
      });
    }

    const classSlot = await academicRepository.getClassSlotById(payload.classSlotId);
    if (!classSlot) {
      throw new AppError('Class slot not found.', 404);
    }

    const sessionDate = leaveService._toDateOnly(payload.date);
    const sessionDayOfWeek = sessionDate.getDay();
    if (Number(classSlot.day_of_week) !== Number(sessionDayOfWeek)) {
      throw new AppError(
        'Regular class date must match the timetable day for the selected slot. Use EXTRA type for makeup/off-schedule classes.',
        400
      );
    }

    const canMark = await academicRepository.canUserMarkAttendance(facultyId, payload.classSlotId);
    if (!canMark) {
      throw new AppError('You do not have attendance marking authority for this slot.', 403);
    }

    const holidays = await leaveRepository.getHolidaysInRange(payload.date, payload.date);
    const isWorking = leaveService.isWorkingDay(sessionDate, holidays);

    if (!isWorking) {
      return academicRepository.upsertClassSession({
        classSlotId: payload.classSlotId,
        date: payload.date,
        status: 'CANCELLED',
        type: 'REGULAR',
        weight: sessionWeight,
        cancellationSource: 'HOLIDAY',
        cancellationReason: 'Cancelled due to academic holiday/weekend rule.',
      });
    }

    if (payload.status === 'CANCELLED') {
      return academicRepository.upsertClassSession({
        classSlotId: payload.classSlotId,
        date: payload.date,
        status: 'CANCELLED',
        type: 'REGULAR',
        weight: sessionWeight,
        cancellationSource: 'FACULTY',
        cancellationReason: 'Cancelled manually by faculty.',
      });
    }

    return academicRepository.upsertClassSession({
      classSlotId: payload.classSlotId,
      date: payload.date,
      status: payload.status,
      type: 'REGULAR',
      weight: sessionWeight,
      cancellationSource: null,
      cancellationReason: null,
    });
  }

  async markAttendance(facultyId, classSessionId, marks, reason = null) {
    const session = await academicRepository.getClassSessionById(classSessionId);
    if (!session) {
      throw new AppError('Class session not found.', 404);
    }
    const canMark = session.class_slot_id
      ? await academicRepository.canUserMarkAttendance(facultyId, session.class_slot_id)
      : Number(session.faculty_id) === Number(facultyId);
    if (!canMark) {
      throw new AppError('You do not have attendance marking authority for this session.', 403);
    }
    if (session.status !== 'CONDUCTED') {
      throw new AppError('Attendance can only be marked for conducted sessions.', 400);
    }
    if ((session.lifecycle_status || 'OPEN') !== 'OPEN') {
      throw new AppError(`Attendance is not editable. Session is ${session.lifecycle_status || 'LOCKED'}.`, 400);
    }

    const sessionDate = new Date(session.date);
    sessionDate.setHours(0, 0, 0, 0);
    const freezeCutoff = new Date();
    freezeCutoff.setHours(0, 0, 0, 0);
    freezeCutoff.setDate(freezeCutoff.getDate() - ATTENDANCE_EDIT_FREEZE_DAYS);
    if (sessionDate < freezeCutoff) {
      throw new AppError(`Attendance is frozen for sessions older than ${ATTENDANCE_EDIT_FREEZE_DAYS} days.`, 400);
    }

    const normalizedMarks = [];
    for (const mark of marks) {
      let studentId = mark.studentId ? Number(mark.studentId) : null;
      if (!studentId && mark.studentIdentifier) {
        const resolved = await academicRepository.findStudentByIdentifier(mark.studentIdentifier, session.section_id || null);
        if (resolved.ambiguous) {
          throw new AppError(`Multiple students matched "${mark.studentIdentifier}". Use Student ID for this entry.`, 400);
        }
        if (!resolved.student) {
          const globalMatch = await academicRepository.findStudentByIdentifier(mark.studentIdentifier, null);
          if (globalMatch.student) {
            throw new AppError(
              `Student "${mark.studentIdentifier}" exists but is not mapped to this class section. Assign the student to the correct section before marking attendance.`,
              400
            );
          }
          throw new AppError(`Student not found for "${mark.studentIdentifier}".`, 404);
        }
        studentId = Number(resolved.student.id);
      }

      if (!studentId) {
        throw new AppError('Each attendance mark requires studentId or studentIdentifier.', 400);
      }

      normalizedMarks.push({ studentId, status: mark.status });
    }

    return academicRepository.markAttendanceBulk(classSessionId, normalizedMarks, facultyId, reason);
  }

  async updateSessionLifecycle(actor, classSessionId, lifecycleStatus, reason = null) {
    const session = await academicRepository.getClassSessionById(classSessionId);
    if (!session) {
      throw new AppError('Class session not found.', 404);
    }

    const target = String(lifecycleStatus || '').toUpperCase();
    if (!['OPEN', 'LOCKED', 'FINALIZED'].includes(target)) {
      throw new AppError('Invalid lifecycle status. Allowed: OPEN, LOCKED, FINALIZED.', 400);
    }

    const actorRole = actor?.role;
    const isAdmin = actorRole === 'admin';
    const canMark = session.class_slot_id
      ? await academicRepository.canUserMarkAttendance(actor.userId, session.class_slot_id)
      : Number(session.faculty_id) === Number(actor.userId);

    if (!isAdmin && !canMark) {
      throw new AppError('You do not have permission to update this session lifecycle.', 403);
    }

    const current = session.lifecycle_status || 'OPEN';
    if (current === 'FINALIZED' && target !== 'FINALIZED' && !isAdmin) {
      throw new AppError('Finalized session can only be reopened by admin.', 403);
    }
    if (target === 'OPEN' && current === 'FINALIZED' && !reason) {
      throw new AppError('Reason is required to reopen a finalized session.', 400);
    }

    const updated = await academicRepository.updateSessionLifecycle(classSessionId, target);
    return {
      ...updated,
      lifecycle_note: reason || null,
    };
  }

  async getFacultyRecentSessions(facultyId, limit = 25) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
    return academicRepository.getFacultyRecentSessions(facultyId, safeLimit);
  }

  async getSessionStudentsForAttendance(facultyId, classSessionId) {
    const session = await academicRepository.getClassSessionById(classSessionId);
    if (!session) {
      throw new AppError('Class session not found.', 404);
    }

    const canMark = session.class_slot_id
      ? await academicRepository.canUserMarkAttendance(facultyId, session.class_slot_id)
      : Number(session.faculty_id) === Number(facultyId);
    if (!canMark) {
      throw new AppError('You do not have attendance marking authority for this session.', 403);
    }

    const students = await academicRepository.getSessionStudents(classSessionId);
    return {
      session,
      students,
    };
  }

  async getAttendanceHistory(actor, classSessionId, limit = 200) {
    const session = await academicRepository.getClassSessionById(classSessionId);
    if (!session) {
      throw new AppError('Class session not found.', 404);
    }

    const isAdmin = actor?.role === 'admin';
    const canMark = session.class_slot_id
      ? await academicRepository.canUserMarkAttendance(actor.userId, session.class_slot_id)
      : Number(session.faculty_id) === Number(actor.userId);

    if (!isAdmin && !canMark) {
      throw new AppError('You do not have permission to view attendance history for this session.', 403);
    }

    return academicRepository.getAttendanceHistory(classSessionId, limit);
  }

  async getAttendanceSummary(studentId, subjectId = null) {
    const summary = await academicRepository.getAttendanceSummary(studentId, subjectId);
    const conducted = Number(summary.conducted_weight || 0);
    const attended = Number(summary.attended_weight || 0);
    const percentage = conducted === 0 ? 100 : +((attended / conducted) * 100).toFixed(2);

    return { conducted, attended, percentage };
  }

  async predictAttendance(studentId, subjectId = null) {
    const summary = await this.getAttendanceSummary(studentId, subjectId);
    const extraStats = await academicRepository.getStudentExtraStats(studentId);
    const threshold = 75;
    const lookAhead = 10;

    const requiredRaw = Math.ceil((threshold / 100) * (summary.conducted + lookAhead) - summary.attended);
    const requiredInNext10 = Math.max(0, Math.min(lookAhead, requiredRaw));
    const attainableWithinLookAhead = requiredRaw <= lookAhead;
    const neededToReachThreshold = Math.max(0, Math.ceil(((threshold / 100) * summary.conducted - summary.attended) / (1 - threshold / 100)));
    const recoveryExtraClassesNeeded = neededToReachThreshold;

    let recommendation = `You need to attend ${requiredInNext10} out of next ${lookAhead} classes to reach ${threshold}%.`;
    if (!attainableWithinLookAhead) {
      recommendation = `Even if you attend all next ${lookAhead} classes, you may still stay below ${threshold}%.`;
    }
    if (summary.conducted === 0) {
      recommendation = `No attendance history yet. Attend at least ${Math.ceil((threshold / 100) * lookAhead)} out of next ${lookAhead} classes to build toward ${threshold}%.`;
    }

    return {
      currentPercentage: summary.percentage,
      conductedClasses: summary.conducted,
      attendedClasses: summary.attended,
      threshold,
      lookAhead,
      requiredClassesToReachThreshold: neededToReachThreshold,
      requiredInLookAhead: requiredInNext10,
      attainableWithinLookAhead,
      recoveryExtraClassesNeeded,
      extraSessionsAttended: Number(extraStats.extra_sessions_attended || 0),
      bonusAttendanceCredits: Number(extraStats.bonus_attendance_credits || 0),
      recommendation,
      recoveryModeMessage: recoveryExtraClassesNeeded > 0
        ? `Attendance Recovery Mode: Attend ${recoveryExtraClassesNeeded} extra classes to reach ${threshold}%.`
        : 'You are at or above attendance threshold.',
      warning: summary.percentage < threshold ? 'Attendance is below threshold.' : null,
    };
  }

  async getStudentInsights(studentId) {
    const [overall, bySubject] = await Promise.all([
      this.getAttendanceSummary(studentId),
      academicRepository.getSubjectRisk(studentId),
    ]);
    const extraStats = await academicRepository.getStudentExtraStats(studentId);

    const subjectRisk = bySubject.map((row) => {
      const attended = Number(row.attended || 0);
      const conducted = Number(row.conducted || 0);
      const percentage = conducted === 0 ? 100 : +((attended / conducted) * 100).toFixed(2);
      return {
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        attendancePercentage: percentage,
        risk: percentage < 75 ? 'HIGH' : percentage < 85 ? 'MEDIUM' : 'LOW',
      };
    });

    return {
      attendance: overall,
      subjectRisk,
      extraSessionsAttended: Number(extraStats.extra_sessions_attended || 0),
      bonusAttendanceCredits: Number(extraStats.bonus_attendance_credits || 0),
    };
  }

  async getFacultyInsights(facultyId) {
    const now = new Date();
    const toDate = now.toISOString().slice(0, 10);
    const from = new Date(now);
    from.setDate(now.getDate() - 29);
    const fromDate = from.toISOString().slice(0, 10);

    const stats = await academicRepository.getFacultyIrregularityScore(facultyId, fromDate, toDate);
    const scheduled = Number(stats.scheduled_count || 0);
    const conducted = Number(stats.conducted_count || 0);
    const irregularityScore = scheduled === 0 ? 0 : +(100 - (conducted / scheduled) * 100).toFixed(2);

    return {
      range: { fromDate, toDate },
      scheduled,
      conducted,
      cancelled: Number(stats.cancelled_count || 0),
      irregularityScore,
      message: `Only ${conducted} classes conducted out of ${scheduled} scheduled in last 30 days.`,
    };
  }

  async generateSessions({ fromDate, toDate }) {
    if (!fromDate || !toDate) {
      throw new AppError('fromDate and toDate are required.', 400);
    }

    const slots = await academicRepository.getClassSlots({});
    const holidays = await leaveRepository.getHolidayInstancesInRange(fromDate, toDate);
    const holidaySet = new Set(holidays.map((h) => String(h.date).slice(0, 10)));

    const start = new Date(`${fromDate}T00:00:00Z`);
    const end = new Date(`${toDate}T00:00:00Z`);
    let generated = 0;

    for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
      const dateKey = date.toISOString().slice(0, 10);
      const dayOfWeek = date.getUTCDay();

      for (const slot of slots) {
        if (Number(slot.day_of_week) !== dayOfWeek) {
          continue;
        }

        const isHoliday = holidaySet.has(dateKey);
        await academicRepository.upsertClassSession({
          classSlotId: slot.id,
          date: dateKey,
          status: isHoliday ? 'CANCELLED' : 'CONDUCTED',
          type: 'REGULAR',
          weight: 1,
          cancellationSource: isHoliday ? 'HOLIDAY' : null,
          cancellationReason: isHoliday ? 'Pre-generated and cancelled due to holiday.' : null,
        });
        generated += 1;
      }
    }

    return { generated };
  }
}

module.exports = new AcademicService();
