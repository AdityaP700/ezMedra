# SLMS Implementation Documentation

## Project Summary

This workspace contains a full-stack Student Leave Management System (SLMS) with attendance-aware leave prediction, faculty review flow, admin governance, reports, and notification processing.

Current stack:

- Backend: Node.js, Express, PostgreSQL (Supabase), JWT auth
- Frontend: React + Vite + Tailwind
- Data access: Repository-Service-Controller pattern
- Background processing: system worker + event handlers + notification queue


## Workspace Layout

- backend: Express API, DB schema, business modules, worker, seed scripts
- frontend: React UI for student, faculty, admin workflows


## What Is Implemented Right Now

### 1) Attendance and Session Model

- Regular sessions linked to timetable slots
- Extra sessions (make-up sessions) independent from timetable
- Session weight support for weighted attendance (for example 2x sessions)
- Session status handling: CONDUCTED or CANCELLED
- Holiday-aware logic for regular session cancellation

### 2) Leave Prediction and Deduction

- Prediction uses:
  - working-day checks
  - holiday/weekend exclusions
  - session overlap windows for partial-day leave
  - session weights in deduction
- Deduction fallback includes timetable-based session expansion, so future date ranges can still produce non-zero deduction when appropriate

### 3) Faculty Workflow

- Review queue for leave forwarding/rejection recommendation
- Session marking UI for REGULAR and EXTRA sessions
- ERP-style attendance flow:
  - select recent session
  - fetch eligible student roster from session section
  - mark attendance from roster instead of manual hidden IDs

### 4) Admin Workflow

- Leave approvals and rejections
- Holiday configuration and holiday impact recalculation
- Delegation support
- User management and audit logging

### 5) Reports

- Leave report list with filtering and pagination
- Aggregate statistics endpoint
- Pagination count query stabilized for robust behavior

### 6) Reliability and Platform Features

- Soft-delete and version fields on leave applications
- Notification queue tables and processing hooks
- Idempotency storage for repeat-safe administrative operations
- Rate limiting middleware on API namespace


## Major Changes Applied In This Iteration

This section captures the key functional changes introduced and/or fixed.

### A) Supabase/PostgreSQL Integration

- Backend configured to run against PostgreSQL/Supabase
- Seed script available for repeatable demo data provisioning

Primary files:

- backend/config/db.js
- backend/.env
- backend/scripts/seed.js

### B) EXTRA Class and Weighted Attendance

- Extra class creation support with explicit subject, section, faculty, time window
- Session weight enforced in session creation and attendance analytics

Primary files:

- backend/modules/academic/academic.service.js
- backend/modules/academic/academic.repository.js
- backend/modules/academic/academic.routes.js
- backend/modules/academic/academic.controller.js
- frontend/src/pages/FacultyDashboard.jsx
- frontend/src/pages/StudentDashboard.jsx

### C) Leave Deduction Zero-Result Fix

- Date-range deduction now supports timetable fallback when pre-generated class_sessions do not exist for future dates
- Holiday exclusion and session weight logic preserved

Primary files:

- backend/modules/leave/leave.repository.js
- backend/modules/leave/leave.service.js

### D) Faculty Insights and Session Creation Stability Fixes

- Faculty insights SQL aggregate FILTER syntax corrected
- Class session upsert logic made deterministic (select-update/insert) to avoid ON CONFLICT inference errors in some PostgreSQL environments

Primary files:

- backend/modules/academic/academic.repository.js

### E) Attendance Input and ERP Alignment

- Input validation and flow upgraded from ad-hoc manual typing to session roster based marking
- Session-specific eligible students endpoint added
- Recent sessions endpoint added for faculty

Primary files:

- backend/modules/academic/academic.routes.js
- backend/modules/academic/academic.controller.js
- backend/modules/academic/academic.service.js
- backend/modules/academic/academic.repository.js
- frontend/src/services/leaveService.js
- frontend/src/pages/FacultyDashboard.jsx

### F) Reports Repository Crash Fix

- Replaced fragile regex-based count query generation with explicit, filter-synchronized count SQL

Primary files:

- backend/modules/reports/reports.repository.js


## Current API Surface (High-Level)

Mounted base routes are configured in backend/server.js:

- /api/auth
- /api/leaves
- /api/faculty
- /api/admin
- /api/reports
- /api/academic
- /api/notifications

New/important academic endpoints:

- GET /api/academic/faculty/sessions/recent
- GET /api/academic/sessions/:classSessionId/students
- POST /api/academic/sessions
- POST /api/academic/sessions/:classSessionId/attendance


## Database Notes

Schema source:

- backend/config/init.sql

Important entities:

- users, departments, sections
- subjects, class_slots, class_sessions, attendance
- leave_applications, leave_types, holidays, holiday_instances
- documents, notifications, notification_queue
- delegations, audit_logs, idempotency_keys

Notable constraints:

- Class session origin validation for REGULAR vs EXTRA
- Session time window checks
- Leave date and partial-day time constraints
- Attendance blocked for cancelled sessions via DB trigger


## Frontend Behavior Summary

### Student Dashboard

- Leave impact prediction card with attendance risk and chargeable days
- Working day and holiday-aware warning messages
- Extra-session and bonus-credit insight fields

### Faculty Dashboard

- Session creation for REGULAR and EXTRA
- Attendance marking from recent session + eligible student roster
- Reduced reliance on raw IDs and hidden internal mapping knowledge


## How To Run Locally

## 1) Backend

- Install dependencies in backend
- Configure backend environment variables
- Ensure PostgreSQL connectivity
- Start server

Suggested commands:

- npm install
- node scripts/seed.js
- npm run dev

## 2) Frontend

- Install dependencies in frontend
- Configure frontend environment variables
- Start Vite dev server

Suggested commands:

- npm install
- npm run dev


## Seeded Demo Credentials

Generated by backend/scripts/seed.js:

- Admin: admin@slms.com / admin123
- Faculty: faculty1@slms.com / faculty123
- PhD: phd@slms.com / faculty123
- TA: ta@slms.com / faculty123
- Student: student1@slms.com / student123


## Real-Time Testing Workflow (Recommended)

1. Login as faculty
2. Mark a REGULAR session using assigned slot and date
3. Open attendance panel
4. Select the same session from Recent Sessions
5. Select student from Eligible Students roster
6. Mark PRESENT or ABSENT
7. Login as student and verify attendance/leave impact changes


## Known Operational Notes

- Repeated backend 401 logs usually indicate stale browser token reuse from previous sessions. Re-login refreshes JWT.
- If session creation works but roster is empty, validate class slot section mapping and student section assignment.
- Frontend dependency audit reports moderate vulnerabilities from npm ecosystem packages; can be handled separately per policy.


## Suggested Next Improvements

- Bulk attendance marking grid for full-class submission in one request
- Session lock window and attendance revision audit trail
- Exportable attendance sheets and leave reports
- Role-specific dashboards with stronger operational analytics


## Document Scope

This file describes the current implementation state in this workspace and the major modifications completed during the recent delivery cycle.


## Reality Check: Productization Phase

Current maturity assessment:

- Strong backend foundations: layered architecture, idempotency, audit logs, session/attendance model
- Correct domain model: weighted sessions, section-scoped roster, holiday-aware deduction, extra sessions
- Usable UI coverage: student insights and faculty roster attendance

Conclusion:

- This system is beyond MVP and has entered productization phase.


## Productization Gaps (High Priority)

### 1) Scale Workflow Gap: Bulk Attendance

Current limitation:

- Attendance is still single-student submission oriented.

Impact:

- Inefficient for real sections (for example, 100-200 students).

Required direction:

- Implement bulk attendance grid as primary flow.
- Keep per-student updates as fallback only.


### 2) Session Lifecycle Control Gap

Current limitation:

- Session state mostly covers conducted/cancelled outcomes.

Impact:

- Late edits and inconsistent operational control.

Required direction:

- Introduce lifecycle states such as OPEN, LOCKED, FINALIZED.
- Define edit windows and lock rules.


### 3) Attendance Change Governance Gap

Current limitation:

- Re-marking can occur without full revision lineage.

Impact:

- Weak traceability and manipulation risk.

Required direction:

- Add attendance_history log:
  - old_status
  - new_status
  - changed_by
  - changed_at
  - reason


### 4) Prediction Utilization Gap

Current limitation:

- Prediction is visible but not deeply decision-driving.

Impact:

- Core differentiator is under-leveraged.

Required direction:

- Use prediction/risk signals in faculty and admin actions.
- Add risk alerts and policy thresholds during approvals.


### 5) Exception Handling Gap

Current limitation:

- No complete override workflow for real-world corrections.

Required direction:

- Add exception chain:
  - override request
  - approval authority
  - adjustment application
  - audit trail


## Product Identity Recommendation

Preferred positioning:

- Attendance Intelligence Platform (prediction-first, risk-first, insight-first).

Alternative positioning:

- Generic ERP clone (less differentiated).


## Execution Roadmap (Recommended)

### Step 1: Bulk Attendance (Immediate)

- Build session roster grid with one-click/batch status actions.
- Support submit-all and partial save.

### Step 2: Session Locking

- Add state machine and configurable lock window.
- Prevent unauthorized edits after lock/finalize.

### Step 3: Attendance Audit Trail

- Persist change history and expose admin review APIs.

### Step 4: Prediction-Driven Operations

- Show risk banners in faculty and admin workflows.
- Add policy gates for high-risk approvals.

### Step 5: Product Reframing

- Align UX copy and roadmap around attendance intelligence outcomes.


## Updated Immediate Priorities for This Repo

- Priority P0: Bulk attendance grid and backend bulk endpoint optimization.
- Priority P1: Session lifecycle and lock/finalization controls.
- Priority P1: Attendance history and correction governance.
- Priority P2: Prediction-driven operational policy automation.
