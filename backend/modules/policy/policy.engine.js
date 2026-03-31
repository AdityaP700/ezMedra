class PolicyEngine {
  constructor({ minAttendance = 75, hardBlockAttendance = 60, partialOverlapThresholdMinutes = 20, partialSlotDeduction = 0.5 } = {}) {
    this.minAttendance = minAttendance;
    this.hardBlockAttendance = hardBlockAttendance;
    this.partialOverlapThresholdMinutes = partialOverlapThresholdMinutes;
    this.partialSlotDeduction = partialSlotDeduction;
  }

  toDateOnly(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day));
    }
    const d = new Date(value);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  formatDateKey(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  parseTimeToMinutes(timeString) {
    if (!timeString) return null;
    const [hour, minute] = String(timeString).split(':').map(Number);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return hour * 60 + minute;
  }

  isNthWeekdayOfMonth(date, weekday, nth) {
    if (date.getUTCDay() !== weekday) return false;
    const ordinal = Math.floor((date.getUTCDate() - 1) / 7) + 1;
    return ordinal === nth;
  }

  matchesHolidayRule(date, rule) {
    if (!rule || typeof rule !== 'string') return false;
    const normalized = rule.trim().toLowerCase();
    const match = normalized.match(/^(\d+)(st|nd|rd|th)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i);
    if (!match) return false;

    const nth = Number(match[1]);
    const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(match[3]);
    if (weekday < 0 || nth < 1 || nth > 5) return false;
    return this.isNthWeekdayOfMonth(date, weekday, nth);
  }

  matchesHolidayDate(date, holidayDate, isRecurring) {
    if (!holidayDate) return false;
    const holiday = this.toDateOnly(holidayDate);
    if (isRecurring) {
      return holiday.getUTCDate() === date.getUTCDate() && holiday.getUTCMonth() === date.getUTCMonth();
    }
    return this.formatDateKey(holiday) === this.formatDateKey(date);
  }

  isSpecialWeekend(date, holidays = []) {
    return holidays.some((holiday) => holiday.type === 'WEEKEND_RULE' && this.matchesHolidayRule(date, holiday.rule));
  }

  isWorkingDay(date, holidays = [], weekendDays = [0, 6]) {
    if (weekendDays.includes(date.getUTCDay())) return false;

    const hasHoliday = holidays.some((holiday) => {
      if (holiday.type === 'WEEKEND_RULE') {
        return this.matchesHolidayRule(date, holiday.rule);
      }
      return this.matchesHolidayDate(date, holiday.date, holiday.is_recurring || holiday.isRecurring);
    });
    return !hasHoliday;
  }

  resolveDailyLeaveWindow(dateKey, startDate, endDate, startTime, endTime) {
    const isStartDate = dateKey === startDate;
    const isEndDate = dateKey === endDate;
    const dayStart = isStartDate && startTime ? this.parseTimeToMinutes(startTime) : 0;
    const dayEnd = isEndDate && endTime ? this.parseTimeToMinutes(endTime) : 23 * 60 + 59;

    return {
      dayStart: dayStart == null ? 0 : dayStart,
      dayEnd: dayEnd == null ? 23 * 60 + 59 : dayEnd,
    };
  }

  calculateSlotOverlapDeduction({ slotStart, slotEnd, leaveStart, leaveEnd }) {
    const overlap = Math.max(0, Math.min(slotEnd, leaveEnd) - Math.max(slotStart, leaveStart));
    const slotDuration = Math.max(1, slotEnd - slotStart);

    if (overlap >= slotDuration) return 1;
    if (overlap >= this.partialOverlapThresholdMinutes) return this.partialSlotDeduction;
    return 0;
  }
}

module.exports = new PolicyEngine();
