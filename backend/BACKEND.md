# Backend Codebase Overview

This document provides a detailed breakdown of every folder and file inside the `backend` directory of the Student Leave Management System (SLMS).

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Web framework | Express.js |
| Database | PostgreSQL (Supabase) / In-memory mock |
| Authentication | JWT + bcrypt |
| File uploads | Multer (in-memory storage) |
| Validation | express-validator |
| Architecture | Controller → Service → Repository (3-tier) |

---

## Top-Level Files

### `server.js`
Application entry point. Responsibilities:
- Configures CORS, JSON body parsing, and rate-limiting middleware
- Mounts all route namespaces (`/api/auth`, `/api/leaves`, `/api/faculty`, `/api/admin`, `/api/reports`, `/api/academic`, `/api/notifications`)
- Exposes a health-check endpoint at `GET /api/health`
- Registers domain event handlers
- Starts the background system worker
- Runs productization schema migrations on boot
- Listens on port `5000` (overridable via `PORT` environment variable)

### `package.json`
Project manifest. Key points:
- **Name:** `slms-backend`
- **Main entry:** `server.js`
- **Core dependencies:** `express`, `pg`, `jsonwebtoken`, `bcrypt`, `multer`, `express-validator`, `cors`, `dotenv`
- **NPM scripts:** `start`, `dev` (auto-reload with `--watch`), `seed:*` (data seeding), `test` and `test:*` (targeted test runs)

### `.env.example`
Template for required environment variables:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — PostgreSQL connection
- `DATABASE_URL` — Optional Supabase connection string
- `JWT_SECRET`, `JWT_EXPIRES_IN` — JWT signing configuration
- `PORT`, `NODE_ENV` — Server settings

---

## Folder Breakdown

---

### `config/`

Handles database connectivity and schema management.

| File | Purpose |
|---|---|
| `db.js` | Creates a PostgreSQL connection pool. Supports `USE_MOCK_DB=true` to swap in the in-memory mock. Enables SSL for production/Supabase connections. Exports the active pool. |
| `init.sql` | Complete database schema (DDL). Defines all tables, foreign keys, indexes, and check constraints. Key tables: `users`, `departments`, `sections`, `subjects`, `class_slots`, `class_sessions`, `attendance`, `attendance_history`, `leave_applications`, `holidays`, `holiday_instances`, `notifications`, `notification_queue`, `documents`, `delegations`, `audit_logs`, `idempotency_keys`. |
| `mockDb.js` | In-memory mock that implements the same `pool.query()` / `pool.connect()` interface as the real PostgreSQL pool. Pre-seeded with 5 departments, 4 leave types, and 3 demo users. Useful for local development and CI without a live database. |
| `productization.migration.js` | Idempotent `ALTER TABLE` migration runner. Adds columns and constraints that were introduced after the initial schema (e.g., `lifecycle_status` on sessions, risk-assessment columns on leave applications, attendance history tracking). Runs automatically on server boot. |

---

### `events/`

Implements a lightweight event-driven architecture for asynchronous operations.

| File | Purpose |
|---|---|
| `eventBus.js` | Central event emitter built on Node.js `EventEmitter`. Defines `EVENT_TYPES` (e.g., `NOTIFICATION_ENQUEUE`). Exports `emitEvent(type, payload)` to publish events and `domainEvents` for handler registration. |
| `registerHandlers.js` | Registers all domain event listeners at startup. On `NOTIFICATION_ENQUEUE`, calls `commonRepository.enqueueNotificationEvent()` to persist the notification to the queue table. Error handling ensures handler failures do not crash the request. |

---

### `middleware/`

Express middleware for cross-cutting concerns.

| File | Purpose |
|---|---|
| `auth.middleware.js` | JWT verification and role-based access control. Exports `verifyToken`, `authorizeRoles(...roles)`, and `authorizePermission(permissionKey)`. Falls back to a role-permission map when token-level permissions are absent. |
| `errorHandler.js` | Global error handling. Provides the `AppError` custom error class (statusCode + error code), the `errorHandler` Express middleware that returns structured JSON errors, and `asyncHandler(fn)` to wrap async route handlers. Development mode includes stack traces. |
| `rateLimit.middleware.js` | Token-bucket rate limiter. Default window: 60 s, max 120 requests. Keyed by authenticated user ID or client IP. Returns `429 Too Many Requests` when exceeded. |
| `adminDelegation.middleware.js` | Resolves active admin delegations. Checks the `delegations` table for the requesting admin and, if found, augments `req.user` with delegation metadata and elevates `adminType` to `SUPER_ADMIN` for global-scope delegations. |
| `validate.js` | Integrates `express-validator`. The `validateRequest` middleware collects validation errors and returns a `400` response with field-level messages if any are present. |
| `upload.js` | Multer configuration for document uploads. In-memory storage, 5 MB limit. Used by the leave-application document attachment flow. |

---

### `modules/`

Feature modules structured as Controller → Service → Repository triplets. Each module owns its own routes file.

#### `modules/academic/`
Manages the academic calendar: timetable, class sessions, and attendance.

- **`academic.routes.js`** — Route definitions for `/api/academic`
- **`academic.controller.js`** — HTTP handlers (create session, mark attendance, fetch timetable, list recent sessions, list eligible students)
- **`academic.service.js`** — Business logic: session lifecycle transitions (`OPEN → LOCKED → FINALIZED`), attendance marking with history, academic calendar generation from timetable slots
- **`academic.repository.js`** — SQL queries: class slots, sessions, attendance records, faculty subject assignments, section-student rosters

Key endpoints:
- `POST /api/academic/sessions` — Create a regular or extra class session
- `POST /api/academic/sessions/:id/attendance` — Record attendance for a session
- `GET /api/academic/faculty/sessions/recent` — Fetch a faculty's recent sessions
- `GET /api/academic/sessions/:id/students` — Fetch eligible students for a session

#### `modules/admin/`
Administrative operations: holiday management, user management, delegations.

- **`admin.routes.js`** — Route definitions for `/api/admin`
- **`admin.controller.js`** — HTTP handlers
- **`admin.service.js`** — Business logic: holiday instance computation (supports one-time and recurring rules like "3rd Saturday"), delegation lifecycle, user onboarding
- **`admin.repository.js`** — SQL queries: users, departments, holidays, `holiday_instances`, `delegations`

#### `modules/auth/`
User authentication and registration.

- **`auth.routes.js`** — Route definitions for `/api/auth`
- **`auth.controller.js`** — HTTP handlers for login, register, profile fetch
- **`auth.service.js`** — bcrypt password hashing (salt 12), JWT generation (24 h expiry), role-based onboarding (auto-assign section to students, auto-create teaching roles for faculty)
- **`auth.repository.js`** — SQL queries: user lookup, faculty profiles, section assignment

#### `modules/common/`
Shared utilities used across multiple modules.

- **`common.repository.js`** — Cross-cutting DB helpers:
  - `logAudit()` — Writes to `audit_logs`
  - `getIdempotency()` / `saveIdempotency()` — Idempotency key look-up and storage
  - `createNotifications()` — Batch-inserts notification rows
  - `enqueueNotificationEvent()` — Pushes a row into `notification_queue`
  - `processNotificationQueue()` — Background processor: marks queued items as delivered

#### `modules/faculty/`
Faculty-specific operations.

- **`faculty.routes.js`** — Route definitions for `/api/faculty`
- **`faculty.controller.js`** — HTTP handlers
- **`faculty.service.js`** — Business logic for faculty profiles and subject assignments
- **`faculty.repository.js`** — SQL queries: faculty profiles, subject-to-section assignments, teaching roles

#### `modules/leave/`
The core leave management workflow.

- **`leave.routes.js`** — Route definitions for `/api/leaves`
- **`leave.controller.js`** — HTTP handlers
- **`leave.service.js`** — Comprehensive business logic (500 + lines):
  - Leave submission in `DATE_BASED` (full days) and `SESSION_BASED` (specific class sessions) modes
  - Attendance percentage calculation and risk assessment (`GREEN / YELLOW / RED`)
  - Holiday and class-session overlap calculation
  - Workflow transitions: `submitted → faculty_pending → hod_review → approved / rejected`
  - Back-date validation (max 7 days), file attachment validation, idempotent submission
  - Faculty and HOD approval/rejection with escalation to conflict resolution
- **`leave.repository.js`** — SQL queries: leave applications, leave types, documents, holiday instances, class sessions, workflow transitions

**Business rules enforced:**
- Minimum 75 % attendance required (hard block below 60 %)
- Risk tiers: `GREEN` (> 80 % after leave), `YELLOW` (75–80 %), `RED` (< 75 %, requires HOD override)
- Maximum 3 leave applications per 7 days per student (returns `429` when exceeded)
- Faculty review window: 24 h — if the deadline passes without action the application is automatically escalated to `hod_review` with status `escalated` and a system-generated remark ("Auto-escalated to HOD after faculty SLA timeout")
- HOD review window: 24 h — deadline stored as `hod_deadline_at`; overdue items remain visible in the admin queue for manual action

#### `modules/notifications/`
Notification retrieval and delivery.

- **`notifications.routes.js`** — Route definitions for `/api/notifications`
- **`notifications.controller.js`** — HTTP handlers
- **`notifications.service.js`** — Fetch paginated user notifications, mark as read

#### `modules/policy/`
Stateless rule engine for leave and attendance policies.

- **`policy.engine.js`** — `PolicyEngine` singleton:
  - `isWorkingDay(date, holidays)` — Excludes weekends and holidays
  - `isSpecialWeekend(date, holidays)` — Detects special working Saturdays
  - `matchesHolidayRule(date, rule)` — Matches Nth-weekday recurring patterns
  - `calculateSlotOverlapDeduction()` — Computes class session overlap with a leave window (20-minute partial-overlap threshold)
  - UTC date/time normalisation utilities

#### `modules/reports/`
Analytics and reporting.

- **`reports.routes.js`** — Route definitions for `/api/reports`
- **`reports.controller.js`** — HTTP handlers
- **`reports.service.js`** — Report generation: leave statistics, attendance analytics
- **`reports.repository.js`** — Aggregated SQL queries for leave lists (with filtering and pagination), attendance summaries, faculty workload

---

### `scripts/`

Standalone utility scripts for database seeding and smoke testing. Run with `node scripts/<filename>`.

| File | Purpose |
|---|---|
| `seed.js` | Creates a full demo dataset: 2 departments, 4 sections, subjects, 1 admin, 2 faculty per department, 10 students per section, class slots, teaching roles. Idempotent (safe to re-run). |
| `seedLeaveQueuesDemo.js` | Inserts sample leave applications in various workflow states for UI/workflow testing. |
| `seedWorkflowScenarios.js` | Creates complex workflow scenarios (escalations, overrides, conflicts) for integration testing. |
| `seedMasterFaculty.js` | Creates `master.faculty@slms.com` (password: `faculty123`) — a catch-all reviewer assigned to every IT subject and section. Re-assigns all existing `faculty_pending` / `pending` IT leaves to this account so the full review queue is visible from one login. Run with `npm run seed:master-faculty`. |
| `makeAllStudentsAttendance100.js` | Utility to reset all student attendance percentages to 100 %. Useful before demonstrations. |
| `e2e-smoke.js` | End-to-end smoke test that exercises the login, leave application, and approval flows. |
| `verifySemesterTimetable.js` | Validates timetable generation correctness: checks for schedule conflicts, session counts, and slot coverage. |

---

### `tests/`

Automated test suites for critical subsystems. Run with `npm test` or individual `npm run test:<name>` scripts.

| File | What It Tests | Script |
|---|---|---|
| `policy-engine.test.js` | PolicyEngine: holiday rule matching, working-day checks, slot-overlap deductions | `npm run test:policy` |
| `admin-idempotency.test.js` | Idempotency key handling: duplicate submission detection and response caching | `npm run test:idempotency` |
| `academic-session-generation.test.js` | Class session creation from timetable slots, lifecycle transitions, conflict detection | `npm run test:sessions` |
| `worker-cycle.test.js` | Background worker: holiday instance rebuild, delegation cleanup, notification processing | `npm run test:worker` |

---

### `tmp/`

Temporary one-off scripts for production fixes. Not part of the normal application flow.

| File | Purpose |
|---|---|
| `fix_admin.js` | Updates `admin@slms.com` to have `admin_type = 'DEPARTMENT_ADMIN'`. Used as a one-time DB repair script. |

---

### `utils/`

Small, reusable helper functions shared across the codebase.

| File | Exports | Purpose |
|---|---|---|
| `dateTime.js` | `normalizeDateUTC(dateLike)`, `normalizeTimeHHMM(timeLike)` | Converts any date/time input to consistent `YYYY-MM-DD` / `HH:MM` formats in UTC. Ensures uniform date handling across all modules. |

---

### `workers/`

Background job processing for maintenance tasks.

| File | Purpose |
|---|---|
| `system.worker.js` | Periodic maintenance loop (default interval: 60 s). On each tick runs three parallel tasks: (1) process up to 100 queued notifications, (2) rebuild holiday instances for the current year, (3) clean up expired admin delegations. Exports `startSystemWorker()`, `stopSystemWorker()`, and `runMaintenanceCycle()`. Disabled if `ENABLE_BACKGROUND_WORKER=false`. |

---

## Data Flow Summary

```
HTTP Request
    │
    ▼
Middleware (rate-limit → auth → validate)
    │
    ▼
Router  (/api/<module>)
    │
    ▼
Controller  (parse request, call service)
    │
    ▼
Service  (business rules, orchestration)
    │
    ▼
Repository  (SQL queries via pg pool)
    │
    ▼
PostgreSQL (Supabase)
```

Asynchronous side-channel:

```
Service emits event via eventBus
    │
    ▼
registerHandlers listener
    │
    ▼
notification_queue table
    │
    ▼
system.worker (every 60 s) → processNotificationQueue
```

---

## Leave Approval Workflow

```
Student submits leave application
    │
    ▼  (attendance risk check)
faculty_pending   ← Faculty reviews (24 h window)
    │
    ▼
hod_review        ← HOD approves / rejects (24 h window)
    │
    ▼
approved / rejected / escalated
```
