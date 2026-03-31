const pool = require('./db');

async function runProductizationMigrations() {
  if (!pool || typeof pool.query !== 'function') {
    return;
  }

  const statements = [
    `ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'OPEN'`,
    `ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP`,
    `ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP`,
    `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS current_attendance FLOAT`,
    `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS risk_indicator VARCHAR(20)`,
    `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS recommendation VARCHAR(20)`,
    `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMP`,
    `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS leave_mode VARCHAR(20) NOT NULL DEFAULT 'DATE_BASED'`,
    `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS risk_tier VARCHAR(20)`,
    `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS submit_anyway BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS override_reason TEXT`,
    `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS faculty_decisions JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS faculty_deadline_at TIMESTAMP`,
    `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS hod_deadline_at TIMESTAMP`,
    `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS provisional_at TIMESTAMP`,
    `UPDATE class_sessions
     SET lifecycle_status = 'OPEN'
     WHERE lifecycle_status IS NULL`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'chk_class_session_lifecycle_status'
       ) THEN
         ALTER TABLE class_sessions
           ADD CONSTRAINT chk_class_session_lifecycle_status
           CHECK (lifecycle_status IN ('OPEN', 'LOCKED', 'FINALIZED'));
       END IF;
     END
     $$`,
    `DO $$
     BEGIN
       IF EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'leave_applications_status_check'
       ) THEN
         ALTER TABLE leave_applications DROP CONSTRAINT leave_applications_status_check;
       END IF;
       ALTER TABLE leave_applications
         ADD CONSTRAINT leave_applications_status_check
         CHECK (status IN (
           'pending', 'forwarded', 'approved', 'rejected', 'cancelled',
           'submitted', 'faculty_pending', 'faculty_approved', 'faculty_rejected',
           'escalated', 'conflict', 'hod_review', 'hod_approved', 'hod_rejected', 'provisional'
         ));
     END
     $$`,
    `DO $$
     BEGIN
       IF EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'leave_applications_leave_mode_check'
       ) THEN
         ALTER TABLE leave_applications DROP CONSTRAINT leave_applications_leave_mode_check;
       END IF;
       ALTER TABLE leave_applications
         ADD CONSTRAINT leave_applications_leave_mode_check
         CHECK (leave_mode IN ('DATE_BASED', 'SESSION_BASED'));
     END
     $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'chk_leave_risk_tier'
       ) THEN
         ALTER TABLE leave_applications
           ADD CONSTRAINT chk_leave_risk_tier
           CHECK (risk_tier IS NULL OR risk_tier IN ('GREEN', 'YELLOW', 'RED'));
       END IF;
     END
     $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'chk_leave_risk_indicator'
       ) THEN
         ALTER TABLE leave_applications
           ADD CONSTRAINT chk_leave_risk_indicator
           CHECK (risk_indicator IS NULL OR risk_indicator IN ('GREEN', 'YELLOW', 'RED'));
       END IF;
     END
     $$`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'chk_leave_recommendation'
       ) THEN
         ALTER TABLE leave_applications
           ADD CONSTRAINT chk_leave_recommendation
           CHECK (recommendation IS NULL OR recommendation IN ('APPROVE', 'REJECT'));
       END IF;
     END
     $$`,
    `CREATE TABLE IF NOT EXISTS attendance_history (
       id BIGSERIAL PRIMARY KEY,
       class_session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
       student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       old_status VARCHAR(20),
       new_status VARCHAR(20) NOT NULL CHECK (new_status IN ('PRESENT', 'ABSENT')),
       changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
       reason TEXT,
       changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_history_session ON attendance_history(class_session_id, changed_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_history_student ON attendance_history(student_id, changed_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_class_sessions_lifecycle ON class_sessions(lifecycle_status, date DESC)`,
    `ALTER TABLE users ALTER COLUMN leave_balance SET DEFAULT 15`,
    `UPDATE users
     SET leave_balance = 15,
       updated_at = CURRENT_TIMESTAMP
     WHERE role = 'student'`,
  ];

  for (const sql of statements) {
    await pool.query(sql);
  }
}

module.exports = {
  runProductizationMigrations,
};
