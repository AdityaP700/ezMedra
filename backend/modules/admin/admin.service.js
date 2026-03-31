const adminRepository = require('./admin.repository');
const leaveRepository = require('../leave/leave.repository');
const leaveService = require('../leave/leave.service');
const commonRepository = require('../common/common.repository');
const { emitEvent, EVENT_TYPES } = require('../../events/eventBus');
const pool = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');

class AdminService {
  _assertDecisionAuthority(adminUser) {
    if ((adminUser?.adminType || 'SUPER_ADMIN') === 'SUPER_ADMIN') {
      throw new AppError('System Admin is read-only for leave decisions. Use department HOD/Admin account to approve or reject.', 403);
    }
  }

  _resolveScope(adminUser) {
    return {
      adminType: adminUser?.adminType || 'SUPER_ADMIN',
      departmentId: adminUser?.departmentId || null,
    };
  }

  async _executeWithIdempotency({ actorId, action, idempotencyKey, executor }) {
    if (!idempotencyKey) {
      return executor();
    }

    const cached = await commonRepository.getIdempotency(actorId, idempotencyKey, action);
    if (cached) {
      return cached;
    }

    const result = await executor();
    await commonRepository.saveIdempotency(actorId, idempotencyKey, action, result);
    return result;
  }

  async getForwardedLeaves(adminUser) {
    await leaveRepository.autoEscalateAndProvisionLeaves();
    return adminRepository.getForwardedLeaves(this._resolveScope(adminUser));
  }

  async approveLeave(leaveId, adminId, remarks, approvedDays, adminUser, idempotencyKey, options = {}) {
    this._assertDecisionAuthority(adminUser);
    const result = await this._executeWithIdempotency({
      actorId: adminId,
      action: 'ADMIN_APPROVE_LEAVE',
      idempotencyKey,
      executor: () => adminRepository.approveLeave(
        leaveId,
        adminId,
        remarks,
        approvedDays,
        this._resolveScope(adminUser),
        options
      ),
    });

    if (result.error) {
      throw new AppError(result.error, 400);
    }

    await commonRepository.logAudit({
      actorId: adminId,
      action: 'LEAVE_APPROVED',
      entityType: 'leave',
      entityId: Number(leaveId),
      metadata: {
        approvedDays: result.data?.approved_days,
        override: !!result.data?.override_flag,
        overrideHighRisk: !!options.overrideHighRisk,
        delegated: !!adminUser?.isDelegated,
      },
    });

    if (adminUser?.isDelegated) {
      await adminRepository.incrementDelegationUsage(adminId);
      await commonRepository.logAudit({
        actorId: adminId,
        action: 'DELEGATION_USED_FOR_APPROVAL',
        entityType: 'leave',
        entityId: Number(leaveId),
        metadata: null,
      });
    }

    if (result.data?.student_id) {
      emitEvent(EVENT_TYPES.NOTIFICATION_ENQUEUE, {
        eventType: 'LEAVE_APPROVED',
        toUserId: result.data.student_id,
        title: 'Leave Approved',
        message: `Your leave request #${leaveId} has been approved.`,
      });
    }

    return result.data;
  }

  async approveLeavesBulk(leaveIds, adminId, remarks, adminUser, idempotencyKey) {
    this._assertDecisionAuthority(adminUser);
    return this._executeWithIdempotency({
      actorId: adminId,
      action: 'ADMIN_BULK_APPROVE',
      idempotencyKey,
      executor: async () => {
        const results = [];

        for (const leaveId of leaveIds) {
          const result = await adminRepository.approveLeave(
            leaveId,
            adminId,
            remarks || 'Bulk approval',
            null,
            this._resolveScope(adminUser)
          );

          if (!result.error) {
            await commonRepository.logAudit({
              actorId: adminId,
              action: 'LEAVE_APPROVED_BULK',
              entityType: 'leave',
              entityId: Number(leaveId),
              metadata: { delegated: !!adminUser?.isDelegated },
            });

            if (adminUser?.isDelegated) {
              await adminRepository.incrementDelegationUsage(adminId);
              await commonRepository.logAudit({
                actorId: adminId,
                action: 'DELEGATION_USED_FOR_APPROVAL',
                entityType: 'leave',
                entityId: Number(leaveId),
                metadata: { mode: 'bulk' },
              });
            }
          }

          results.push({
            leaveId,
            success: !result.error,
            error: result.error || null,
          });
        }

        return results;
      },
    });
  }

  async rejectLeave(leaveId, adminId, remarks, adminUser, idempotencyKey) {
    this._assertDecisionAuthority(adminUser);
    if (!remarks || remarks.trim().length < 5) {
      throw new AppError('Remarks are required when rejecting (min 5 chars).', 400);
    }

    const leave = await this._executeWithIdempotency({
      actorId: adminId,
      action: 'ADMIN_REJECT_LEAVE',
      idempotencyKey,
      executor: () => adminRepository.rejectLeave(leaveId, adminId, remarks, this._resolveScope(adminUser)),
    });

    if (!leave) {
      throw new AppError('Leave not found, already processed, or out of your admin scope.', 404);
    }

    await commonRepository.logAudit({
      actorId: adminId,
      action: 'LEAVE_REJECTED',
      entityType: 'leave',
      entityId: Number(leaveId),
      metadata: { delegated: !!adminUser?.isDelegated },
    });

    if (leave.student_id) {
      emitEvent(EVENT_TYPES.NOTIFICATION_ENQUEUE, {
        eventType: 'LEAVE_REJECTED',
        toUserId: leave.student_id,
        title: 'Leave Rejected',
        message: `Your leave request #${leaveId} has been rejected.`,
      });
    }

    return leave;
  }

  async rejectLeavesBulk(leaveIds, adminId, remarks, adminUser, idempotencyKey) {
    this._assertDecisionAuthority(adminUser);
    if (!remarks || remarks.trim().length < 5) {
      throw new AppError('Remarks are required for bulk reject (min 5 chars).', 400);
    }

    return this._executeWithIdempotency({
      actorId: adminId,
      action: 'ADMIN_BULK_REJECT',
      idempotencyKey,
      executor: async () => {
        const results = [];

        for (const leaveId of leaveIds) {
          const result = await adminRepository.rejectLeave(
            leaveId,
            adminId,
            remarks,
            this._resolveScope(adminUser)
          );

          if (result) {
            await commonRepository.logAudit({
              actorId: adminId,
              action: 'LEAVE_REJECTED_BULK',
              entityType: 'leave',
              entityId: Number(leaveId),
              metadata: { delegated: !!adminUser?.isDelegated },
            });
          }

          results.push({
            leaveId,
            success: !!result,
          });
        }

        return results;
      },
    });
  }

  async verifyDocument(documentId, adminId) {
    const doc = await adminRepository.verifyDocument(documentId, adminId);
    if (!doc) {
      throw new AppError('Document not found.', 404);
    }

    await commonRepository.logAudit({
      actorId: adminId,
      action: 'DOCUMENT_VERIFIED',
      entityType: 'document',
      entityId: Number(documentId),
      metadata: null,
    });

    return doc;
  }

  async getAllUsers(adminUser) {
    return adminRepository.getAllUsers(this._resolveScope(adminUser));
  }

  async toggleUserStatus(userId) {
    const user = await adminRepository.toggleUserStatus(userId);
    if (!user) {
      throw new AppError('User not found.', 404);
    }
    return user;
  }

  async deleteUser(userId) {
    const user = await adminRepository.deleteUser(userId);
    if (!user) {
      throw new AppError('User not found.', 404);
    }
    return user;
  }

  async getStats(adminUser) {
    return adminRepository.getStats(this._resolveScope(adminUser));
  }

  async getHolidays() {
    return adminRepository.getHolidays();
  }

  async addHoliday(date, description, type) {
    const payload = typeof date === 'object' && date !== null
      ? date
      : { date, description, type };

    if (!payload?.name || payload.name.trim().length < 2) {
      throw new AppError('Holiday name is required.', 400);
    }

    if (payload.type === 'WEEKEND_RULE' && !payload.rule) {
      throw new AppError('rule is required for WEEKEND_RULE holidays.', 400);
    }

    if (payload.type !== 'WEEKEND_RULE' && !payload.date) {
      throw new AppError('date is required for PUBLIC/REGIONAL holidays.', 400);
    }

    const holiday = await adminRepository.addHoliday({
      name: payload.name.trim(),
      date: payload.date || null,
      type: payload.type || 'PUBLIC',
      isRecurring: !!payload.isRecurring,
      rule: payload.rule || null,
      description: payload.description?.trim() || null,
    });
    if (!holiday) {
      throw new AppError('Holiday already exists with same date/rule.', 409);
    }

    if (holiday.date) {
      await adminRepository.syncHolidaySessionsByDate(holiday.date, holiday.name, holiday.is_recurring);
    }

    const yearStart = `${new Date().getUTCFullYear()}-01-01`;
    const yearEnd = `${new Date().getUTCFullYear() + 1}-12-31`;
    await adminRepository.rebuildHolidayInstances(yearStart, yearEnd);

    await this.recalculateLeavesOnHolidayChange();
    return holiday;
  }

  async updateHoliday(id, payload) {
    if (payload.type === 'WEEKEND_RULE' && !payload.rule) {
      throw new AppError('rule is required for WEEKEND_RULE holidays.', 400);
    }
    if (payload.type !== 'WEEKEND_RULE' && !payload.date) {
      throw new AppError('date is required for PUBLIC/REGIONAL holidays.', 400);
    }

    const holiday = await adminRepository.updateHoliday(id, {
      name: payload.name?.trim(),
      date: payload.date || null,
      type: payload.type,
      isRecurring: !!payload.isRecurring,
      rule: payload.rule || null,
      description: payload.description?.trim() || null,
    });

    if (!holiday) {
      throw new AppError('Holiday not found.', 404);
    }

    if (holiday.date) {
      await adminRepository.syncHolidaySessionsByDate(holiday.date, holiday.name, holiday.is_recurring);
    }

    const yearStart = `${new Date().getUTCFullYear()}-01-01`;
    const yearEnd = `${new Date().getUTCFullYear() + 1}-12-31`;
    await adminRepository.rebuildHolidayInstances(yearStart, yearEnd);

    await this.recalculateLeavesOnHolidayChange();
    return holiday;
  }

  async deleteHoliday(id) {
    const holiday = await adminRepository.deleteHoliday(id);
    if (!holiday) {
      throw new AppError('Holiday not found.', 404);
    }
    const yearStart = `${new Date().getUTCFullYear()}-01-01`;
    const yearEnd = `${new Date().getUTCFullYear() + 1}-12-31`;
    await adminRepository.rebuildHolidayInstances(yearStart, yearEnd);

    await this.recalculateLeavesOnHolidayChange();
    return holiday;
  }

  async getDelegations() {
    return adminRepository.getDelegations();
  }

  async createDelegation(payload, actorId) {
    const start = new Date(payload.startDate);
    const end = new Date(payload.endDate);
    const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays < 0 || diffDays > 7) {
      throw new AppError('Delegation duration must be between 0 and 7 days.', 400);
    }

    const delegation = await adminRepository.createDelegation(payload);
    await commonRepository.logAudit({
      actorId,
      action: 'DELEGATION_CREATED',
      entityType: 'delegation',
      entityId: delegation.id,
      metadata: payload,
    });
    return delegation;
  }

  async deactivateDelegation(id, actorId) {
    const delegation = await adminRepository.deactivateDelegation(id);
    if (!delegation) {
      throw new AppError('Delegation not found.', 404);
    }
    await commonRepository.logAudit({
      actorId,
      action: 'DELEGATION_DEACTIVATED',
      entityType: 'delegation',
      entityId: Number(id),
      metadata: null,
    });
    return delegation;
  }

  async reassignLeave(leaveId, newFacultyId, reason, actorId) {
    if (!reason || reason.trim().length < 5) {
      throw new AppError('Reassignment reason is required (min 5 chars).', 400);
    }

    const leaveDept = await leaveRepository.getLeaveStudentDepartment(leaveId);
    if (!leaveDept) {
      throw new AppError('Leave not found.', 404);
    }

    const facultyDept = await leaveRepository.getFacultyDepartment(newFacultyId);
    if (!facultyDept) {
      throw new AppError('Target faculty not found.', 404);
    }

    if (Number(leaveDept.student_department_id) !== Number(facultyDept.department_id)) {
      throw new AppError('Faculty reassignment must stay within the student department.', 400);
    }

    const leave = await adminRepository.reassignLeave(leaveId, newFacultyId, reason.trim(), actorId);
    if (!leave) {
      throw new AppError('Leave not found.', 404);
    }

    await commonRepository.logAudit({
      actorId,
      action: 'LEAVE_REASSIGNED',
      entityType: 'leave',
      entityId: Number(leaveId),
      metadata: { newFacultyId, reason },
    });

    emitEvent(EVENT_TYPES.NOTIFICATION_ENQUEUE, {
      eventType: 'LEAVE_REASSIGNED',
      toUserId: newFacultyId,
      title: 'Leave Assigned',
      message: `Leave request #${leaveId} has been assigned to you.`,
    });

    return leave;
  }

  async recalculateLeavesOnHolidayChange() {
    const leaves = await leaveRepository.listRecalculableLeaves();
    let updatedCount = 0;
    const impactedStudents = new Set();

    for (const leave of leaves) {
      const prediction = await leaveService.predictLeaveImpact({
        studentId: leave.student_id,
        leaveTypeId: null,
        startDate: leave.start_date,
        endDate: leave.end_date,
        startTime: leave.start_time,
        endTime: leave.end_time,
      });
      const recalculatedTotal = Number(prediction.chargeableDays || 0);

      const oldApproved = leave.approved_days == null ? Number(leave.total_days) : Number(leave.approved_days);
      const recalculatedApproved = leave.approved_days == null
        ? null
        : Number(Math.max(0, Math.min(Number(leave.approved_days), recalculatedTotal)).toFixed(2));
      const newApprovedComparable = recalculatedApproved == null ? recalculatedTotal : recalculatedApproved;

      const balanceDelta = leave.status === 'approved'
        ? Number((oldApproved - newApprovedComparable).toFixed(2))
        : 0;

      await leaveRepository.updateLeaveAfterRecalculation({
        leaveId: leave.id,
        totalDays: Number(recalculatedTotal.toFixed(2)),
        approvedDays: recalculatedApproved,
        balanceDelta,
      });
      impactedStudents.add(Number(leave.student_id));
      updatedCount += 1;
    }

    for (const studentId of impactedStudents) {
      await leaveRepository.updateStudentAttendancePercentage(studentId);
    }

    return { updatedCount };
  }

  async resetAcademicYear(actorId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO leave_applications_archive (leave_data)
         SELECT to_jsonb(la.*)
         FROM leave_applications la`
      );

      await client.query('DELETE FROM leave_applications');
      await client.query('DELETE FROM attendance');
      await client.query('DELETE FROM class_sessions');

      await client.query(
        `UPDATE users
         SET leave_balance = CASE WHEN role = 'student' THEN 20 ELSE leave_balance END,
             attendance_percentage = CASE WHEN role = 'student' THEN 100 ELSE attendance_percentage END,
             updated_at = CURRENT_TIMESTAMP`
      );

      await commonRepository.logAudit({
        actorId,
        action: 'ACADEMIC_YEAR_RESET',
        entityType: 'system',
        entityId: null,
        metadata: { note: 'Leave/attendance reset with archival.' },
      }, client);

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAuditLogs(limit) {
    return commonRepository.getAuditLogs({ limit: Number(limit) || 100 });
  }
}

module.exports = new AdminService();
