# SLMS Database Architecture & Workflow Documentation

Welcome to the comprehensive guide for the **Student Leave Management System (SLMS)** database. This document explains how the data is structured, how the different modules interact, and the core philosophies behind the database design.

---

## 1. High-Level Overview

* **Engine:** PostgreSQL
* **Connection Layer:** Node.js `pg` Pool using connection strings (`DATABASE_URL`). It is designed to switch seamlessly between a local offline database and a cloud-based Supabase database based on environment variables.
* **Paradigm:** Relational DB with strict Foreign Key constraints, logical checks (CHECK constraints), and unique indexes to prevent data duplication.

---

## 2. Core Entities: People & Places

The foundation of the system is identifying "Who" is in the system and "Where" they belong.

* **`departments`**: Academic departments (e.g., IT, CSE, EE).
* **`sections`**: Sub-divisions of a department and semester (e.g., IT1, CSEA). A section is linked to a department.
* **`users`**: The central table for everyone in the system.
  * **Roles:** `student`, `faculty`, `phd_scholar`, `ta`, `admin`.
  * **Key Balances:** Stores `leave_balance` (days left) and `attendance_percentage` (live dynamically updated percentage).
  * **`is_master` Flag:** A scalable boolean flag that grants extended permissions (like bypassing strict timetable constraints) without hardcoding emails.

---

## 3. The Academic Engine (Timetables & Classes)

The system distinguishes between a **scheduled rule** (Timetable) and an **actual occurrence** (Class Session). This is the most brilliant part of the architecture, allowing for cancellations, extra classes, and complex attendance tracking.

### A. The Timetable (Rules)
* **`subjects`**: Courses taught in a semester (e.g., Data Structures). Can be THEORY or LAB.
* **`subject_assignments` & `teaching_roles`**: Maps which Faculty teaches which Subject to which Section, and what permissions they have (e.g., `PRIMARY` faculty with `markAttendance: true`).
* **`class_slots`**: This is the **weekly timetable**. It says: *"Faculty X teaches Subject Y to Section Z every Tuesday (day 2) from 10:00 to 11:00."*

### B. The Reality (Sessions & Attendance)
* **`class_sessions`**: A specific realization of a Slot. When Tuesday, April 6th rolls around, class_slot #5 generates class_session #100.
  * **Types:**
    * `REGULAR`: Generated from a scheduled `class_slot`.
    * `EXTRA`: Ad-hoc makeup classes created by faculty (no slot required).
  * **Lifecycle:** Sessions move from `OPEN` to `LOCKED` (can't change attendance easily) to `FINALIZED`.
* **`attendance`**: Simply links a `student_id` to a `class_session_id` with a status (`PRESENT` / `ABSENT`).
* **`attendance_history`**: An audit trail tracking if/when a teacher changes a student's attendance from Absent to Present later on.

> **Why this matters:** When a student applies for leave, the system doesn't just count "days". It looks at the `class_sessions` scheduled on those specific dates to calculate the precise "Class Units" missed.

---

## 4. The Leave Engine

The core workflow handles how a student asks for time off and how faculty/admins process it.

* **`leave_types`**: The rules for leaves (e.g., "Sick Leave" max 10 days, "Other" max 30 days).
* **`holidays` & `holiday_instances`**: Tracks public holidays, regional holidays, and weekend rules. The system skips leave deductions on these dates.
* **`leave_applications`**: The massive central hub for requests.
  * **Dates:** Tracks `start_date` and `end_date`.
  * **Workflow Statuses:** Follows a heavy state machine (`faculty_pending` ➔ `hod_review` ➔ `approved`/`rejected`).
  * **Risk Tiers:** Stores calculated prediction data (`risk_tier`: GREEN, YELLOW, RED) based on how the leave will impact the student's `attendance_percentage`.
* **`documents`**: Stores file URLs and metadata for medical certificates/proofs attached to a leave application.
* **`leave_reassignment_logs`**: If a faculty member is unavailable, an admin can route the leave approval to someone else. This tracks the hand-off.

---

## 5. Security & System Utilities

Background infrastructure to keep the system robust and accountable.

* **`audit_logs`**: Tracks "Who did What to Whom". Every major action (approving leave, finalizing attendance) leaves a footprint here.
* **`idempotency_keys`**: Extremely important for UI stability. When a user clicks "Approve" twice really fast, this table caches the first click using a unique key and silently accepts the second click without re-running DB queries.
* **`delegations`**: Allows an HOD/Admin to delegate their approval powers to another admin when they go on vacation.
* **`notifications` & `notification_queue`**: For alert mechanisms. In-app alerts go to `notifications`, while emails/SMS wait in the `notification_queue` for a background worker payload.

---

## 6. Key Relationships & Database Triggers

### Triggers
* **`trg_block_attendance_for_cancelled`**: A PostgreSQL trigger that watches the `attendance` table. If a faculty member cancels a `class_session` (e.g., teacher is sick), this trigger physically blocks any INSERT or UPDATE of attendance records for that session.

### JSON & Optimization
* **JSONB Columns**: Used in `audit_logs.metadata` and `teaching_roles.permissions`. This allows flexible, NoSQL-like features inside a harsh Relational structure.
* **Indexed Fields**: Heavy indexing is applied globally on foreign keys (`student_id`, `class_session_id`, `department_id`, etc.) and dates so that complex JOINS run in milliseconds.

---

## 7. Entity Relationship Map (Keys & Cardinality)

Every main table in SLMS uses an autoincrementing `id SERIAL` as its **Primary Key (PK)**. Below is exactly how the tables connect to each other via **Foreign Keys (FK)**, mapped by their relationship types:

### A. One-to-One (1:1) Relationships
* **`users` ↔ `faculty_profiles`**: A user acting as faculty has exactly *one* specific profile.
  * `faculty_profiles.user_id` (FK) ➔ `users.id` (PK). *(Enforced strictly by `UNIQUE(user_id)`)*.

### B. One-to-Many (1:N) Relationships
This is the most common relationship pattern. The "Many" side holds the Foreign Key.
* **`departments` ➔ `users`**: One department houses many users.
  * `users.department_id` (FK) ➔ `departments.id` (PK).
* **`sections` ➔ `users`**: One section holds many students.
  * `users.section_id` (FK) ➔ `sections.id` (PK).
* **`users` ➔ `leave_applications`**: One student creates many leave applications.
  * `leave_applications.student_id` (FK) ➔ `users.id` (PK).
* **`leave_types` ➔ `leave_applications`**: One leave type (e.g., Sick) can be applied to many applications.
  * `leave_applications.leave_type_id` (FK) ➔ `leave_types.id` (PK).
* **`class_slots` ➔ `class_sessions`**: One recurring timetable slot generates multiple real-life sessions across weeks.
  * `class_sessions.class_slot_id` (FK) ➔ `class_slots.id` (PK).
* **`leave_applications` ➔ `documents`**: One leave request can have multiple attached proof documents.
  * `documents.leave_id` (FK) ➔ `leave_applications.id` (PK).

### C. Many-to-Many (M:N) Relationships (Junction Tables)
When multiple entities associate with multiple other entities, SLMS uses junction (mapping) tables with compound Foreign Keys.

* **Students ↔ Class Sessions (`attendance`)**:
  * A student attends many sessions, and a session has many students.
  * Resolved via the **`attendance`** table.
  * `attendance.student_id` (FK) ➔ `users.id` (PK).
  * `attendance.class_session_id` (FK) ➔ `class_sessions.id` (PK).
  * *Constraint:* `UNIQUE(student_id, class_session_id)` prevents dual attendance entries.

* **Faculty ↔ Subjects ↔ Sections (`subject_assignments`)**:
  * Maps who teaches what subject, and to which section.
  * `subject_assignments.subject_id` (FK) ➔ `subjects.id` (PK).
  * `subject_assignments.faculty_id` (FK) ➔ `users.id` (PK).
  * `subject_assignments.section_id` (FK) ➔ `sections.id` (PK).

* **Faculty ↔ Subjects (`teaching_roles`)**:
  * Defines specific module-level JSON permissions for a subject.
  * `teaching_roles.user_id` (FK) ➔ `users.id` (PK).
  * `teaching_roles.subject_id` (FK) ➔ `subjects.id` (PK).

---

## Summary of the "Smart" Logic Flow

1. **Setup:** Admin creates `users`, `departments`, `subjects`, and `sections`.
2. **Timetable:** Admin links Faculty to Subjects (`subject_assignments`) and defines the weekly routine (`class_slots`).
3. **Daily Life:**
   * A Cron Job (or Teacher) materializes today's `class_slots` into `class_sessions`.
   * Teacher marks `attendance` for the session.
   * Student's `attendance_percentage` goes up or down.
4. **Leave Flow:**
   * Student applies for leave (`leave_applications`).
   * System scans `class_sessions` during those dates, ignoring `holidays`, and predicts the impact.
   * Faculty approves; missed classes are excused, preventing attendance drops.
