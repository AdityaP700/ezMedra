const leaveRepository = require('./leave.repository');
const commonRepository = require('../common/common.repository');
const policyEngine = require('../policy/policy.engine');
const { emitEvent, EVENT_TYPES } = require('../../events/eventBus');
const { normalizeDateUTC, normalizeTimeHHMM } = require('../../utils/dateTime');
const { AppError } = require('../../middleware/errorHandler');

const MIN_ATTENDANCE = 75;
const HARD_BLOCK_ATTENDANCE = 60;
const RISK_GREEN_THRESHOLD = 80;
const MAX_BACKDATE_DAYS = 7;
const MAX_APPLICATIONS_PER_WEEK = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const DEMO_BASELINE_CLASSES = 60;
const PARTIAL_OVERLAP_THRESHOLD_MINUTES = 20;
const PARTIAL_SLOT_DEDUCTION = 0.5;
const FACULTY_REVIEW_HOURS = 24;
const HOD_REVIEW_HOURS = 24;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

class LeaveService {
  _resolveLeaveCreditPolicy(attendancePercentage) {
    const attendance = Number(attendancePercentage || 0);
    if (attendance < HARD_BLOCK_ATTENDANCE) {
      return {
        tier: 'CRITICAL',
        maxUsableDays: 1,
        message: 'Attendance below 60%: only 1 leave credit is usable.',
      };
    }
    if (attendance < MIN_ATTENDANCE) {
      return {
        tier: 'LOW',
        maxUsableDays: 3,
        message: 'Attendance below 75%: only 3 leave credits are usable.',
      };
    }
    return {
      tier: 'NORMAL',
      maxUsableDays: Number.POSITIVE_INFINITY,
      message: 'Attendance is healthy: full leave balance can be used.',
    };
  }

  _effectiveLeaveBalance(rawBalance, attendancePercentage) {
    const safeBalance = Number(rawBalance || 0);
    const policy = this._resolveLeaveCreditPolicy(attendancePercentage);
    const effective = Number.isFinite(policy.maxUsableDays)
      ? Math.min(safeBalance, policy.maxUsableDays)
      : safeBalance;
    return {
      effectiveBalance: Number(Math.max(0, effective).toFixed(2)),
      policy,
    };
  }

  async getLeaveTypes() {
    return leaveRepository.getLeaveTypes();
  }

  async getStudentLeaves(studentId) {
    return leaveRepository.getStudentLeaves(studentId);
  }

  _calculateRangeDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new AppError('Invalid leave dates.', 400);
    }

    if (end < start) {
      throw new AppError('End date must be after or equal to start date.', 400);
    }

    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }

  _isNthWeekdayOfMonth(date, weekday, nth) {
    return policyEngine.isNthWeekdayOfMonth(date, weekday, nth);
  }

  _matchesHolidayRule(date, rule) {
    return policyEngine.matchesHolidayRule(date, rule);
  }

  _matchesHolidayDate(date, holidayDate, isRecurring) {
    return policyEngine.matchesHolidayDate(date, holidayDate, isRecurring);
  }

  isSpecialWeekend(date, holidays = []) {
    return policyEngine.isSpecialWeekend(date, holidays);
  }

  isWorkingDay(date, holidays = []) {
    return policyEngine.isWorkingDay(date, holidays);
  }

  _parseTimeToMinutes(timeString) {
    return policyEngine.parseTimeToMinutes(timeString);
  }

  _resolveDailyLeaveWindow(dateKey, startDate, endDate, startTime, endTime) {
    return policyEngine.resolveDailyLeaveWindow(dateKey, startDate, endDate, startTime, endTime);
  }

  _calculateSlotOverlapDeduction({ slotStart, slotEnd, leaveStart, leaveEnd }) {
    return policyEngine.calculateSlotOverlapDeduction({ slotStart, slotEnd, leaveStart, leaveEnd });
  }

  async _calculateRangeBreakdown(startDate, endDate) {
    const rangeDays = this._calculateRangeDays(startDate, endDate);
    const [holidayInstances, weekendRules] = await Promise.all([
      leaveRepository.getHolidayInstancesInRange(startDate, endDate),
      leaveRepository.getWeekendRuleHolidays(),
    ]);
    const holidays = [
      ...holidayInstances.map((row) => ({
        id: row.holiday_id,
        name: row.name,
        date: row.date,
        type: row.type,
        is_recurring: row.is_recurring,
        rule: row.rule,
        description: row.description,
      })),
      ...weekendRules,
    ];

    const start = this._toDateOnly(startDate);
    const end = this._toDateOnly(endDate);

    let weekendDays = 0;
    let specialWeekendDays = 0;
    let holidayDays = 0;
    let workingDays = 0;
    const holidayMatches = [];

    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isSpecialWeekend = this.isSpecialWeekend(date, holidays);
      const matchingHoliday = holidays.find((holiday) => {
        if (holiday.type === 'WEEKEND_RULE') {
          return this._matchesHolidayRule(date, holiday.rule);
        }
        return this._matchesHolidayDate(date, holiday.date, holiday.is_recurring);
      });
      const isHoliday = !!matchingHoliday;

      if (isWeekend) {
        weekendDays += 1;
      }
      if (isSpecialWeekend) {
        specialWeekendDays += 1;
      }
      if (isHoliday) {
        holidayDays += 1;
        holidayMatches.push({
          date: this._formatDateKey(date),
          name: matchingHoliday.name,
          type: matchingHoliday.type,
        });
      }
      if (this.isWorkingDay(date, holidays)) {
        workingDays += 1;
      }
    }

    const excludedDays = rangeDays - workingDays;
    return {
      rangeDays,
      workingDays,
      weekendDays,
      specialWeekendDays,
      holidayDays,
      excludedDays,
      holidayDates: holidayMatches,
    };
  }

  async _calculateSessionDeduction(studentId, startDate, endDate, startTime = null, endTime = null) {
    let slots = await leaveRepository.getStudentClassSlotsByDateRange(studentId, startDate, endDate);

    // BUG FIX: Strict Date Filtering & Deduplication
    const startObj = this._toDateOnly(startDate);
    const endObj = this._toDateOnly(endDate);

    const uniqueMap = new Map();
    slots.forEach(slot => {
      const dayDate = this._toDateOnly(slot.class_date);
      if (dayDate >= startObj && dayDate <= endObj) {
        // Create unique key per session
        const uniqueKey = slot.class_session_id
          ? `session_${slot.class_session_id}`
          : `slot_${slot.class_slot_id}_${slot.class_date}`;
        uniqueMap.set(uniqueKey, slot);
      }
    });

    let uniqueSlots = Array.from(uniqueMap.values());

    // Safety Cap (Demo Only)
    if (uniqueSlots.length > 30) {
      uniqueSlots = uniqueSlots.slice(0, 20);
    }

    if (process.env.DEBUG_LEAVE_PREDICTION === 'true') {
      console.log("From:", startDate, "To:", endDate);
      console.log("Sessions before filter:", slots.length);
      console.log("Sessions after filter:", uniqueSlots.length);
    }

    const [holidayInstances, weekendRules] = await Promise.all([
      leaveRepository.getHolidayInstancesInRange(startDate, endDate),
      leaveRepository.getWeekendRuleHolidays(),
    ]);
    const holidays = [
      ...holidayInstances.map((row) => ({
        id: row.holiday_id,
        name: row.name,
        date: row.date,
        type: row.type,
        is_recurring: row.is_recurring,
        rule: row.rule,
      })),
      ...weekendRules,
    ];
    let totalDeductionUnits = 0;
    let actualSessionsAffected = 0;
    const availableSessionDates = new Set();
    const deductedSessionDates = new Set();
    const debugRows = [];

    for (const slot of uniqueSlots) {
      const dateKey = this._formatDateKey(this._toDateOnly(slot.class_date));
      availableSessionDates.add(dateKey);
      const dayDate = this._toDateOnly(slot.class_date);
      if (slot.session_type !== 'EXTRA' && !this.isWorkingDay(dayDate, holidays)) {
        continue;
      }

      const slotStart = this._parseTimeToMinutes(slot.start_time);
      const slotEnd = this._parseTimeToMinutes(slot.end_time);
      if (slotStart == null || slotEnd == null || slotEnd <= slotStart) {
        continue;
      }

      const { dayStart, dayEnd } = this._resolveDailyLeaveWindow(dateKey, startDate, endDate, startTime, endTime);
      if (dayEnd <= dayStart) {
        continue;
      }

      const overlapUnit = this._calculateSlotOverlapDeduction({
        slotStart,
        slotEnd,
        leaveStart: dayStart,
        leaveEnd: dayEnd,
      });

      // Fix Overlap Logic: Only count if overlap exists and > threshold
      if (overlapUnit > 0) {
        const sessionWeight = Number(slot.session_weight || 1);
        const weightedOverlap = Number((overlapUnit * sessionWeight).toFixed(2));

        actualSessionsAffected += 1;
        deductedSessionDates.add(dateKey);
        totalDeductionUnits += weightedOverlap;

        if (process.env.DEBUG_LEAVE_PREDICTION === 'true') {
          debugRows.push({
            date: dateKey,
            sessionType: slot.session_type,
            sessionWeight,
            overlapUnit,
            weightedOverlap,
          });
        }
      }
    }

    if (process.env.DEBUG_LEAVE_PREDICTION === 'true') {
      console.log('[leave-predict-debug]', {
        studentId,
        range: { startDate, endDate },
        sessions: uniqueSlots.length,
        weights: debugRows.slice(0, 50),
        totalDeduction: Number(totalDeductionUnits.toFixed(2)),
      });
    }

    return {
      availableSessions: uniqueSlots.length,
      affectedSessionsCount: actualSessionsAffected,
      weightedSessions: Number(totalDeductionUnits.toFixed(2)),
      availableSessionDates: Array.from(availableSessionDates).sort(),
      deductedSessionDates: Array.from(deductedSessionDates).sort(),
    };
  }

  _toDateOnly(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  _formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  _resolveCurrentAttendance({ attendanceStats, fallbackPercentage = 100 }) {
    const conductedRaw = Number(attendanceStats?.conducted_weight || 0);
    const attendedRaw = Number(attendanceStats?.attended_weight || 0);
    const marked = Number(attendanceStats?.marked_weight || 0);
    const safeFallback = Math.max(0, Math.min(100, Number(fallbackPercentage || 100)));

    // If marks are missing or no classes conducted, use the baseline directly
    if (marked === 0 || conductedRaw === 0) {
      const conducted = conductedRaw || DEMO_BASELINE_CLASSES;
      const attended = Number(((safeFallback / 100) * conducted).toFixed(2));
      return {
        conducted,
        attended,
        marked,
        percentage: +safeFallback.toFixed(1),
        usedFallback: true,
      };
    }

    return {
      conducted: conductedRaw,
      attended: attendedRaw,
      marked,
      percentage: +((attendedRaw / conductedRaw) * 100).toFixed(1),
      usedFallback: false,
    };
  }

  _calculateProjectedAttendance(currentAttendance, totalDays) {
    const dailyImpact = 1.5;
    return Math.max(0, +(currentAttendance - totalDays * dailyImpact).toFixed(1));
  }

  _riskIndicator(projectedAttendance) {
    if (projectedAttendance < HARD_BLOCK_ATTENDANCE) {
      return 'red';
    }
    if (projectedAttendance < MIN_ATTENDANCE) {
      return 'yellow';
    }
    return 'green';
  }

  _riskTier(projectedAttendance) {
    if (projectedAttendance < HARD_BLOCK_ATTENDANCE) {
      return 'RED';
    }
    if (projectedAttendance < MIN_ATTENDANCE) {
      return 'YELLOW';
    }
    return 'GREEN';
  }

  _recommendation(projectedAttendance) {
    return projectedAttendance < MIN_ATTENDANCE ? 'REJECT' : 'APPROVE';
  }

  _decisionAdvisory(projectedAttendance) {
    if (projectedAttendance < HARD_BLOCK_ATTENDANCE) {
      return 'Critical risk: approval is unlikely without exceptional justification.';
    }
    if (projectedAttendance < MIN_ATTENDANCE) {
      return 'Below required 75%, but may be approved with valid justification.';
    }
    return 'Within safe attendance range for normal faculty/HOD review.';
  }

  _validateDocument(file) {
    if (!file) {
      return;
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new AppError('Only PDF, JPG, PNG, or WEBP documents are allowed.', 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new AppError('Document size must be <= 5MB.', 400);
    }
  }

  async predictLeaveImpact({ studentId, leaveTypeId, startDate, endDate, startTime = null, endTime = null }) {
    const normalizedStartDate = normalizeDateUTC(startDate);
    const normalizedEndDate = normalizeDateUTC(endDate);
    const normalizedStartTime = normalizeTimeHHMM(startTime);
    const normalizedEndTime = normalizeTimeHHMM(endTime);

    if (!normalizedStartDate || !normalizedEndDate) {
      throw new AppError('Invalid date format. Expected ISO date.', 400);
    }

    const student = await leaveRepository.getStudentPolicyContext(studentId);
    if (!student) {
      throw new AppError('Student not found.', 404);
    }

    const dayBreakdown = await this._calculateRangeBreakdown(normalizedStartDate, normalizedEndDate);
    const sessionImpact = await this._calculateSessionDeduction(studentId, normalizedStartDate, normalizedEndDate, normalizedStartTime, normalizedEndTime);
    const attendanceStats = await leaveRepository.getAttendanceStats(studentId);

    const leaveDeductionDays = dayBreakdown.workingDays;
    const sessionDeductionUnits = Number((sessionImpact.weightedSessions || 0).toFixed(2));

    const baseline = this._resolveCurrentAttendance({
      attendanceStats,
      fallbackPercentage: student.attendance_percentage,
    });
    const conducted = baseline.conducted;
    const attended = baseline.attended;
    const currentAttendance = baseline.percentage;
    const projectedTotalUnits = Number((conducted + sessionDeductionUnits).toFixed(2));
    const projectedAttendance = projectedTotalUnits === 0
      ? 100
      : +((attended / projectedTotalUnits) * 100).toFixed(1);

    const riskIndicator = this._riskIndicator(projectedAttendance);
    const riskTier = this._riskTier(projectedAttendance);
    const recommendation = this._recommendation(projectedAttendance);
    const leaveType = leaveTypeId ? await leaveRepository.getLeaveTypeById(leaveTypeId) : null;

    if (leaveType && dayBreakdown.rangeDays > leaveType.max_days) {
      throw new AppError(`You can only apply for ${leaveType.max_days} day(s) for this leave type.`, 400);
    }

    const warnings = [];
    const canApplyRecommended = projectedAttendance >= MIN_ATTENDANCE;
    const decisionMessage = canApplyRecommended
      ? `Recommended: projected attendance stays at or above ${MIN_ATTENDANCE}%.`
      : `Risky: projected attendance falls below ${MIN_ATTENDANCE}%. Submit with strong justification.`;

    if (sessionDeductionUnits === 0) {
      warnings.push('No class overlap found in selected date/time range.');
    }
    if (baseline.usedFallback) {
      warnings.push('Attendance logs are not fully marked yet; current value uses profile baseline.');
    }

    return {
      currentAttendance,
      currentAttendedUnits: Number(attended.toFixed(2)),
      currentTotalUnits: Number(conducted.toFixed(2)),
      projectedAttendedUnits: Number(attended.toFixed(2)),
      projectedTotalUnits,
      projectedAttendance,
      riskTier,
      attendanceScore: Math.round(currentAttendance),
      riskIndicator,
      riskFlag: projectedAttendance < MIN_ATTENDANCE ? 'HIGH_RISK' : 'NORMAL',
      recommendation,
      calculatedAt: new Date().toISOString(),
      totalDays: leaveDeductionDays,
      selectedRangeDays: dayBreakdown.rangeDays,
      workingDays: dayBreakdown.workingDays,
      holidayDays: dayBreakdown.holidayDays,
      weekendDays: dayBreakdown.weekendDays,
      specialWeekendDays: dayBreakdown.specialWeekendDays,
      excludedDays: dayBreakdown.excludedDays,
      chargeableDays: leaveDeductionDays,
      affectedSessionsCount: sessionImpact.affectedSessionsCount, // <--- NEW UX EXPORT
      availableSessionsInRange: sessionImpact.availableSessions,
      availableSessionDates: sessionImpact.availableSessionDates,
      deductedSessionDates: sessionImpact.deductedSessionDates,
      minAttendanceRequired: MIN_ATTENDANCE,
      documentRequired: false,
      canApply: true,
      canApplyRecommended,
      submitAnywayAllowed: !canApplyRecommended,
      requiresOverrideReason: !canApplyRecommended,
      advisory: this._decisionAdvisory(projectedAttendance),
      decisionMessage,
      warnings,
      holidayAwareInsight: null,
    };
  }

  async getLeaveBalance(studentId) {
    const student = await leaveRepository.getStudentPolicyContext(studentId);
    if (!student) {
      throw new AppError('Student not found.', 404);
    }

    const rawBalance = await leaveRepository.getStudentBalance(studentId);
    if (rawBalance === null) {
      throw new AppError('Student not found.', 404);
    }

    const attendanceStats = await leaveRepository.getAttendanceStats(studentId);
    const baseline = this._resolveCurrentAttendance({
      attendanceStats,
      fallbackPercentage: student.attendance_percentage,
    });
    const { effectiveBalance } = this._effectiveLeaveBalance(rawBalance, baseline.percentage);
    return effectiveBalance;
  }

  async getStudentInsights(studentId) {
    const insights = await leaveRepository.getStudentInsights(studentId);
    if (!insights.profile) {
      throw new AppError('Student not found.', 404);
    }

    const attendanceStats = await leaveRepository.getAttendanceStats(studentId);
    const baseline = this._resolveCurrentAttendance({
      attendanceStats,
      fallbackPercentage: insights.profile.attendance_percentage,
    });
    const liveAttendancePercentage = baseline.percentage;

    const leaves = await leaveRepository.getStudentLeaves(studentId);
    let streak = 0;
    for (const leave of leaves) {
      if (leave.status !== 'approved' || leave.risk_flag === 'HIGH_RISK') {
        break;
      }
      streak += 1;
    }

    const activeLeaveStatuses = new Set([
      'pending',
      'faculty_pending',
      'submitted',
      'forwarded',
      'hod_review',
      'escalated',
      'conflict',
      'provisional',
    ]);
    const approvedLeaveStatuses = new Set(['approved', 'hod_approved']);
    const latestMeasuredLeave = leaves.find((leave) => {
      const value = Number(leave.current_attendance);
      return Number.isFinite(value);
    });
    const latestMeasuredAttendance = latestMeasuredLeave
      ? Number(latestMeasuredLeave.current_attendance)
      : null;
    // If live attendance fell back to profile defaults, prefer the latest measured leave snapshot.
    const effectiveAttendancePercentage =
      baseline.usedFallback && latestMeasuredAttendance != null
        ? latestMeasuredAttendance
        : liveAttendancePercentage;

    const badges = [];
    if (streak >= 3) {
      badges.push('consistent');
    }
    if ((insights.metrics?.active_high_risk_count || 0) > 0 || effectiveAttendancePercentage < MIN_ATTENDANCE) {
      badges.push('risky');
    }
    if ((insights.metrics?.documented_count || 0) > 0 || (insights.metrics?.document_required_count || 0) > 0) {
      badges.push('medical');
    }

    const attendanceScore = Math.round(effectiveAttendancePercentage);
    const riskIndicator = this._riskIndicator(effectiveAttendancePercentage);
    const pendingCount = leaves.filter((leave) => activeLeaveStatuses.has(String(leave.status || '').toLowerCase())).length;
    const approvedCount = leaves.filter((leave) => approvedLeaveStatuses.has(String(leave.status || '').toLowerCase())).length;
    const { effectiveBalance, policy } = this._effectiveLeaveBalance(insights.profile.leave_balance, effectiveAttendancePercentage);

    return {
      attendanceScore,
      attendancePercentage: Number(effectiveAttendancePercentage.toFixed(1)),
      minAttendanceRequired: MIN_ATTENDANCE,
      riskIndicator,
      streak,
      badges,
      semester: insights.profile.semester,
      pendingCount,
      approvedCount,
      effectiveLeaveBalance: effectiveBalance,
      leaveCreditTier: policy.tier,
      leaveCreditCapDays: Number.isFinite(policy.maxUsableDays) ? policy.maxUsableDays : null,
      leaveCreditMessage: policy.message,
    };
  }

  async applyLeave({
    studentId,
    leaveTypeId,
    startDate,
    endDate,
    startTime,
    endTime,
    reason,
    lateReason,
    previousApplicationId,
    submitAnyway,
    overrideReason,
    file,
  }) {
    const normalizedStartDate = normalizeDateUTC(startDate);
    const normalizedEndDate = normalizeDateUTC(endDate);
    const normalizedStartTime = normalizeTimeHHMM(startTime);
    const normalizedEndTime = normalizeTimeHHMM(endTime);

    if (!normalizedStartDate || !normalizedEndDate) {
      throw new AppError('Invalid date format. Expected ISO date.', 400);
    }

    const dayBreakdown = await this._calculateRangeBreakdown(normalizedStartDate, normalizedEndDate);
    const sessionImpact = await this._calculateSessionDeduction(studentId, normalizedStartDate, normalizedEndDate, normalizedStartTime, normalizedEndTime);
    const totalDays = dayBreakdown.workingDays;
    const sessionDeductionUnits = Number((sessionImpact.weightedSessions || 0).toFixed(2));
    if (sessionDeductionUnits === 0) {
      const availableDatesHint = (sessionImpact.availableSessionDates || []).slice(0, 3).join(', ');
      const hintSuffix = availableDatesHint ? ` Session dates currently found in this range: ${availableDatesHint}.` : '';
      throw new AppError(`No leave deduction required for selected dates. Please select working days with overlapping class sessions.${hintSuffix}`, 400);
    }

    const student = await leaveRepository.getStudentPolicyContext(studentId);
    if (!student) {
      throw new AppError('Student not found.', 404);
    }

    const weeklyApplications = await leaveRepository.countRecentApplications(studentId, 7);
    if (weeklyApplications >= MAX_APPLICATIONS_PER_WEEK) {
      throw new AppError('Rate limit exceeded: maximum 3 leave applications are allowed per 7 days.', 429);
    }

    // Check leave balance with attendance-based credit cap
    const rawBalance = await leaveRepository.getStudentBalance(studentId);
    const attendanceStats = await leaveRepository.getAttendanceStats(studentId);
    const baseline = this._resolveCurrentAttendance({
      attendanceStats,
      fallbackPercentage: student.attendance_percentage,
    });
    const { effectiveBalance, policy } = this._effectiveLeaveBalance(rawBalance, baseline.percentage);
    if (effectiveBalance < totalDays && !submitAnyway) {
      throw new AppError(
        `Insufficient leave credit. Usable: ${effectiveBalance} day(s), Requested: ${totalDays} day(s). ${policy.message}`,
        400
      );
    }

    // Check date overlap
    const hasOverlap = await leaveRepository.checkOverlap(studentId, startDate, endDate);
    if (hasOverlap) {
      throw new AppError('You already have a leave application for overlapping dates.', 409);
    }

    const leaveType = await leaveRepository.getLeaveTypeById(leaveTypeId);
    if (!leaveType) {
      throw new AppError('Invalid leave type selected.', 400);
    }
    if (dayBreakdown.rangeDays > leaveType.max_days) {
      throw new AppError(`Selected leave type allows maximum ${leaveType.max_days} day(s).`, 400);
    }

    if (normalizedStartDate === normalizedEndDate && ((normalizedStartTime && !normalizedEndTime) || (!normalizedStartTime && normalizedEndTime))) {
      throw new AppError('Both startTime and endTime are required for partial-day leave.', 400);
    }

    if (normalizedStartTime && normalizedEndTime && this._parseTimeToMinutes(normalizedEndTime) <= this._parseTimeToMinutes(normalizedStartTime)) {
      throw new AppError('endTime must be greater than startTime.', 400);
    }

    const start = this._toDateOnly(normalizedStartDate);
    const today = this._toDateOnly(new Date());
    const isLate = start < today;
    if (isLate) {
      const backDateDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));
      if (backDateDays > MAX_BACKDATE_DAYS) {
        throw new AppError(`Backdated leave beyond ${MAX_BACKDATE_DAYS} day(s) is not allowed.`, 400);
      }
      if (!lateReason || lateReason.trim().length < 10) {
        throw new AppError('Late requests require an explanation (minimum 10 characters).', 400);
      }
    }

    const prediction = await this.predictLeaveImpact({
      studentId,
      leaveTypeId,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
    });

    const projectedAttendance = Number(prediction.projectedAttendance);
    const riskyLeave = projectedAttendance < MIN_ATTENDANCE;
    const requiresOverride = riskyLeave;
    const normalizedOverrideReason = (overrideReason || '').trim();

    if (requiresOverride && !submitAnyway) {
      throw new AppError('This leave is risky. Enable submitAnyway and provide a valid justification.', 400);
    }
    if (requiresOverride && normalizedOverrideReason.length < 10) {
      throw new AppError('Override reason is required for risky leave (minimum 10 characters).', 400);
    }
    if (projectedAttendance < HARD_BLOCK_ATTENDANCE && normalizedOverrideReason.length < 15) {
      throw new AppError('Critical risk leave (<60%) requires a stronger justification (minimum 15 characters).', 400);
    }

    const defaultFacultyId = await leaveRepository.getDefaultFacultyForStudent(studentId);
    const initialStatus = defaultFacultyId ? 'faculty_pending' : 'hod_review';
    const now = new Date();
    const facultyDeadlineAt = defaultFacultyId
      ? new Date(now.getTime() + FACULTY_REVIEW_HOURS * 60 * 60 * 1000)
      : null;
    const hodDeadlineAt = defaultFacultyId
      ? null
      : new Date(now.getTime() + HOD_REVIEW_HOURS * 60 * 60 * 1000);

    this._validateDocument(file);

    // Create leave application
    const leave = await leaveRepository.createLeave({
      studentId,
      assignedFacultyId: defaultFacultyId,
      leaveTypeId,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      totalDays,
      reason,
      isLate,
      lateReason: lateReason || null,
      currentAttendance: prediction.currentAttendance,
      riskFlag: prediction.riskFlag,
      riskIndicator: String(prediction.riskIndicator || '').toUpperCase() || null,
      recommendation: prediction.recommendation || null,
      calculatedAt: prediction.calculatedAt || new Date().toISOString(),
      projectedAttendance,
      riskTier: prediction.riskTier,
      leaveMode: 'DATE_BASED',
      submitAnyway: !!submitAnyway,
      overrideReason: requiresOverride ? normalizedOverrideReason : null,
      documentRequired: false,
      initialStatus,
      parentApplicationId: previousApplicationId || null,
      versionNo: previousApplicationId ? 2 : 1,
      facultyDeadlineAt,
      hodDeadlineAt,
    });

    if (file) {
      const fileUrl = `/uploads/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
      await leaveRepository.attachDocument({
        leaveId: leave.id,
        fileUrl,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
      });
    }

    if (defaultFacultyId) {
      emitEvent(EVENT_TYPES.NOTIFICATION_ENQUEUE, {
        eventType: 'LEAVE_SUBMITTED',
        toUserId: defaultFacultyId,
        title: 'New Leave Application',
        message: `A leave request #${leave.id} requires your review.`,
      });
    }

    return {
      ...leave,
      warnings: prediction.warnings,
      risk_indicator: prediction.riskIndicator,
      risk_tier: prediction.riskTier,
      day_breakdown: {
        selected_range_days: dayBreakdown.rangeDays,
        working_days: dayBreakdown.workingDays,
        holiday_days: dayBreakdown.holidayDays,
        weekend_days: dayBreakdown.weekendDays,
        special_weekend_days: dayBreakdown.specialWeekendDays,
        excluded_days: dayBreakdown.excludedDays,
        chargeable_days: totalDays,
        affected_sessions_count: sessionImpact.affectedSessionsCount,
        available_sessions: sessionImpact.availableSessions,
      },
    };
  }

  async cancelLeave(leaveId, studentId) {
    const leave = await leaveRepository.cancelLeave(leaveId, studentId);
    if (!leave) {
      throw new AppError(
        'Leave application not found or cannot be cancelled (only PENDING leaves can be cancelled).',
        400
      );
    }

    emitEvent(EVENT_TYPES.NOTIFICATION_ENQUEUE, {
      eventType: 'LEAVE_CANCELLED',
      toUserId: studentId,
      title: 'Leave Cancelled',
      message: `Your leave request #${leave.id} has been cancelled.`,
    });

    return leave;
  }
}

module.exports = new LeaveService();
