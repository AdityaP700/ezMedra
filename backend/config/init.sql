-- =============================================
-- SLMS Database Schema
-- =============================================

-- Drop tables if they exist (development only)
DROP TABLE IF EXISTS idempotency_keys CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS notification_queue CASCADE;
DROP TABLE IF EXISTS holiday_instances CASCADE;
DROP TABLE IF EXISTS teaching_roles CASCADE;
DROP TABLE IF EXISTS subject_assignments CASCADE;
DROP TABLE IF EXISTS sections CASCADE;
DROP TABLE IF EXISTS delegations CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS class_sessions CASCADE;
DROP TABLE IF EXISTS class_slots CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS leave_reassignment_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS leave_applications_archive CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS leave_applications CASCADE;
DROP TABLE IF EXISTS faculty_profiles CASCADE;
DROP TABLE IF EXISTS leave_types CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- =============================================
-- Departments
-- =============================================
CREATE TABLE departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(10) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Users
-- =============================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'faculty', 'phd_scholar', 'ta', 'admin')),
  admin_type VARCHAR(30) CHECK (admin_type IN ('DEPARTMENT_ADMIN', 'SUPER_ADMIN') OR admin_type IS NULL),
  student_code VARCHAR(20) UNIQUE,
  program VARCHAR(20) CHECK (program IN ('BTECH', 'MTECH', 'PHD') OR program IS NULL),
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  section_id INTEGER,
  leave_balance NUMERIC(8,2) NOT NULL DEFAULT 15,
  attendance_percentage FLOAT NOT NULL DEFAULT 100 CHECK (attendance_percentage >= 0 AND attendance_percentage <= 100),
  semester INTEGER NOT NULL DEFAULT 1 CHECK (semester >= 1 AND semester <= 10),
  is_active BOOLEAN DEFAULT true,
  is_master BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_section ON users(section_id);

-- =============================================
-- Audit Logs
-- =============================================
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id INTEGER,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);

-- =============================================
-- Idempotency Keys
-- =============================================
CREATE TABLE idempotency_keys (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  key VARCHAR(120) NOT NULL UNIQUE,
  action VARCHAR(100) NOT NULL,
  response_payload JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_idempotency_actor_action ON idempotency_keys(actor_id, action);

-- =============================================
-- Faculty Profiles (links faculty to department)
-- =============================================
CREATE TABLE faculty_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  designation VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- =============================================
-- Leave Types
-- =============================================
CREATE TABLE leave_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  max_days INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Subjects
-- =============================================
CREATE TABLE subjects (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'THEORY' CHECK (type IN ('THEORY', 'LAB')),
  credits NUMERIC(3,1) NOT NULL DEFAULT 3.0,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  semester INTEGER NOT NULL CHECK (semester >= 1 AND semester <= 10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subjects_department_sem ON subjects(department_id, semester);

CREATE TABLE sections (
  id SERIAL PRIMARY KEY,
  name VARCHAR(20) NOT NULL,
  branch VARCHAR(20) NOT NULL,
  semester INTEGER NOT NULL CHECK (semester >= 1 AND semester <= 10),
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, semester, department_id)
);

ALTER TABLE users
ADD CONSTRAINT fk_users_section
FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL;

CREATE TABLE subject_assignments (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subject_id, faculty_id, section_id)
);

CREATE TABLE teaching_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('PRIMARY', 'ASSISTANT')),
  permissions JSONB NOT NULL DEFAULT '{"markAttendance": true, "approveLeave": false}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, subject_id)
);

-- =============================================
-- Timetable: Class Slots
-- =============================================
CREATE TABLE class_slots (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_lab BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_class_slot_time CHECK (end_time > start_time)
);

CREATE INDEX idx_class_slots_faculty ON class_slots(faculty_id);
CREATE INDEX idx_class_slots_subject ON class_slots(subject_id);
CREATE INDEX idx_class_slots_section ON class_slots(section_id);

-- =============================================
-- Timetable: Class Sessions
-- =============================================
CREATE TABLE class_sessions (
  id SERIAL PRIMARY KEY,
  class_slot_id INTEGER REFERENCES class_slots(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  faculty_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  status VARCHAR(20) NOT NULL CHECK (status IN ('CONDUCTED', 'CANCELLED')),
  lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (lifecycle_status IN ('OPEN', 'LOCKED', 'FINALIZED')),
  type VARCHAR(20) NOT NULL DEFAULT 'REGULAR' CHECK (type IN ('REGULAR', 'EXTRA')),
  weight NUMERIC(4,2) NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 2),
  cancellation_source VARCHAR(20) CHECK (cancellation_source IN ('HOLIDAY', 'FACULTY') OR cancellation_source IS NULL),
  cancellation_reason VARCHAR(255),
  locked_at TIMESTAMP,
  finalized_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_session_time_window CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  ),
  CONSTRAINT chk_session_origin CHECK (
    (type = 'REGULAR' AND class_slot_id IS NOT NULL)
    OR
    (type = 'EXTRA' AND class_slot_id IS NULL AND subject_id IS NOT NULL AND faculty_id IS NOT NULL AND section_id IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_regular_class_session ON class_sessions(class_slot_id, date, type) WHERE class_slot_id IS NOT NULL;
CREATE UNIQUE INDEX uq_extra_class_session ON class_sessions(subject_id, faculty_id, section_id, date, start_time, end_time, type) WHERE class_slot_id IS NULL;

CREATE INDEX idx_class_sessions_date ON class_sessions(date);
CREATE INDEX idx_class_sessions_status ON class_sessions(status);
CREATE INDEX idx_class_sessions_type ON class_sessions(type);
CREATE INDEX idx_class_sessions_section_date ON class_sessions(section_id, date);
CREATE INDEX idx_class_sessions_lifecycle ON class_sessions(lifecycle_status, date);

-- =============================================
-- Attendance
-- =============================================
CREATE TABLE attendance (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('PRESENT', 'ABSENT')),
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, class_session_id)
);

CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_session ON attendance(class_session_id);
CREATE INDEX idx_attendance_student_session ON attendance(student_id, class_session_id);

CREATE TABLE attendance_history (
  id BIGSERIAL PRIMARY KEY,
  class_session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL CHECK (new_status IN ('PRESENT', 'ABSENT')),
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attendance_history_session ON attendance_history(class_session_id, changed_at DESC);
CREATE INDEX idx_attendance_history_student ON attendance_history(student_id, changed_at DESC);

-- =============================================
-- Leave Applications
-- =============================================
CREATE TABLE leave_applications (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  parent_application_id INTEGER REFERENCES leave_applications(id) ON DELETE SET NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  total_days NUMERIC(8,2) NOT NULL,
  leave_mode VARCHAR(20) NOT NULL DEFAULT 'DATE_BASED' CHECK (leave_mode IN ('DATE_BASED', 'SESSION_BASED')),
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'faculty_pending'
    CHECK (status IN (
      'pending', 'forwarded', 'approved', 'rejected', 'cancelled',
      'submitted', 'faculty_pending', 'faculty_approved', 'faculty_rejected',
      'escalated', 'conflict', 'hod_review', 'hod_approved', 'hod_rejected', 'provisional'
    )),
  faculty_remarks TEXT,
  faculty_recommendation VARCHAR(20) CHECK (faculty_recommendation IN ('forward', 'reject')),
  admin_remarks TEXT,
  late_reason TEXT,
  is_late BOOLEAN NOT NULL DEFAULT false,
  current_attendance FLOAT,
  risk_flag VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (risk_flag IN ('HIGH_RISK', 'NORMAL')),
  risk_indicator VARCHAR(20) CHECK (risk_indicator IN ('GREEN', 'YELLOW', 'RED')),
  recommendation VARCHAR(20) CHECK (recommendation IN ('APPROVE', 'REJECT')),
  calculated_at TIMESTAMP,
  projected_attendance FLOAT,
  risk_tier VARCHAR(20) CHECK (risk_tier IN ('GREEN', 'YELLOW', 'RED')),
  submit_anyway BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT,
  faculty_decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  faculty_deadline_at TIMESTAMP,
  hod_deadline_at TIMESTAMP,
  provisional_at TIMESTAMP,
  document_required BOOLEAN NOT NULL DEFAULT false,
  override_flag BOOLEAN NOT NULL DEFAULT false,
  approved_days NUMERIC(8,2),
  reviewed_by_faculty INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_admin INTEGER REFERENCES users(id) ON DELETE SET NULL,
  faculty_reviewed_at TIMESTAMP,
  admin_reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_total_days CHECK (total_days > 0),
  CONSTRAINT chk_approved_days CHECK (approved_days IS NULL OR (approved_days >= 0 AND approved_days <= total_days)),
  CONSTRAINT chk_leave_time_window CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX idx_leave_student ON leave_applications(student_id);
CREATE INDEX idx_leave_status ON leave_applications(status);
CREATE INDEX idx_leave_dates ON leave_applications(start_date, end_date);
CREATE INDEX idx_leave_risk ON leave_applications(risk_flag);
CREATE INDEX idx_leave_assigned_faculty ON leave_applications(assigned_faculty_id);
CREATE INDEX idx_leave_status_deleted ON leave_applications(status, is_deleted);
CREATE INDEX idx_leave_student_deleted ON leave_applications(student_id, is_deleted);

-- =============================================
-- Leave Archive
-- =============================================
CREATE TABLE leave_applications_archive (
  archived_id SERIAL PRIMARY KEY,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  leave_data JSONB NOT NULL
);

-- =============================================
-- Leave Reassignment Log
-- =============================================
CREATE TABLE leave_reassignment_logs (
  id SERIAL PRIMARY KEY,
  leave_id INTEGER NOT NULL,
  old_faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  new_faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  reassigned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Notifications
-- =============================================
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(to_user_id, read_at);

CREATE TABLE notification_queue (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

CREATE INDEX idx_notification_queue_status ON notification_queue(status, created_at);

-- =============================================
-- Holidays
-- =============================================
CREATE TABLE holidays (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  date DATE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('PUBLIC', 'REGIONAL', 'WEEKEND_RULE')),
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  rule VARCHAR(120),
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_holidays_date ON holidays(date);
CREATE UNIQUE INDEX uq_holidays_fixed_date ON holidays(date) WHERE date IS NOT NULL;
CREATE UNIQUE INDEX uq_holidays_rule_type ON holidays(rule, type) WHERE rule IS NOT NULL;

CREATE TABLE holiday_instances (
  id SERIAL PRIMARY KEY,
  holiday_id INTEGER NOT NULL REFERENCES holidays(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(holiday_id, date)
);

CREATE INDEX idx_holiday_instances_date ON holiday_instances(date);

-- =============================================
-- Leave Documents
-- =============================================
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  leave_id INTEGER NOT NULL REFERENCES leave_applications(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  document_verified BOOLEAN NOT NULL DEFAULT false,
  verified_by_admin INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_documents_leave ON documents(leave_id);

-- =============================================
-- Delegation
-- =============================================
CREATE TABLE delegations (
  id SERIAL PRIMARY KEY,
  from_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('DEPARTMENT', 'GLOBAL')),
  approvals_used INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_delegation_dates CHECK (end_date >= start_date AND end_date <= (start_date + INTERVAL '7 days'))
);

CREATE INDEX idx_delegation_to_admin ON delegations(to_admin_id, start_date, end_date);

CREATE OR REPLACE FUNCTION block_attendance_for_cancelled_sessions()
RETURNS TRIGGER AS $$
DECLARE
  session_status VARCHAR(20);
BEGIN
  SELECT status INTO session_status
  FROM class_sessions
  WHERE id = NEW.class_session_id;

  IF session_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Attendance cannot be marked for cancelled session %', NEW.class_session_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_attendance_for_cancelled
BEFORE INSERT OR UPDATE ON attendance
FOR EACH ROW
EXECUTE FUNCTION block_attendance_for_cancelled_sessions();

-- =============================================
-- Seed Data
-- =============================================

-- Departments
INSERT INTO departments (name, code) VALUES
  ('Information Technology', 'IT'),
  ('Computer Science & Engineering', 'CSE'),
  ('Computer Engineering', 'CE'),
  ('Electrical Engineering', 'EE'),
  ('Electronics & Communication Engineering', 'ECE');

-- Leave Types
INSERT INTO leave_types (name, description, max_days) VALUES
  ('Sick Leave', 'Medical or health-related leave', 10),
  ('Casual Leave', 'Personal or casual leave', 7),
  ('Academic Leave', 'Conference, workshop, or academic event', 5),
  ('Emergency Leave', 'Urgent or emergency leave', 3),
  ('Other', 'Custom unspecified leave reason', 30);

-- Subjects
INSERT INTO subjects (code, name, department_id, semester) VALUES
  ('IT501', 'Data Structures', 1, 5),
  ('IT502', 'Operating Systems', 1, 5),
  ('IT503L', 'Database Systems Lab', 1, 5),
  ('IT504', 'Computer Networks', 1, 5),
  ('IT505', 'Software Engineering', 1, 5),
  ('CSE301', 'Algorithms', 2, 3);

-- Sections
INSERT INTO sections (name, branch, semester, department_id) VALUES
  ('IT1', 'IT', 5, 1),
  ('CSEA', 'CSE', 3, 2);

-- Holidays
INSERT INTO holidays (name, date, type, is_recurring, rule, description) VALUES
  ('Republic Day', '2026-01-26', 'PUBLIC', true, NULL, 'National holiday'),
  ('Independence Day', '2026-08-15', 'PUBLIC', true, NULL, 'National holiday'),
  ('Gandhi Jayanti', '2026-10-02', 'PUBLIC', true, NULL, 'National holiday'),
  ('Third Saturday Off', NULL, 'WEEKEND_RULE', true, '3rd Saturday', 'Special weekend rule');

INSERT INTO holiday_instances (holiday_id, date)
SELECT h.id, d.date::date
FROM holidays h
JOIN generate_series('2026-01-01'::date, '2027-12-31'::date, interval '1 day') d(date) ON true
WHERE (h.type IN ('PUBLIC', 'REGIONAL') AND h.date IS NOT NULL)
  AND (
    (h.is_recurring = true AND EXTRACT(MONTH FROM h.date) = EXTRACT(MONTH FROM d.date) AND EXTRACT(DAY FROM h.date) = EXTRACT(DAY FROM d.date))
    OR
    (h.is_recurring = false AND h.date = d.date::date)
  )
ON CONFLICT (holiday_id, date) DO NOTHING;

-- NOTE: Run "node scripts/seed.js" to create default admin/faculty/student users
