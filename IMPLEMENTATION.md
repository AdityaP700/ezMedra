# SLMS Demo Presentation Guide: Master Implementation 🚀

This guide is your **step-by-step master script** for presenting the SLMS architecture. It focuses strictly on the sophisticated attendance prediction engine, edge cases, and role-based workflows that separate this project from standard CRUD applications.

---

## 1. Setting the Stage (The Introduction)

**🗣️ What you say to the evaluators:**
> *"Unlike a basic form-filling application, SLMS is built on a **predictive attendance engine**. When a student requests leave, the system doesn't just subtract days. It actively scans the weekly timetable, filters out scheduled academic holidays, simulates the exact class sessions the student will miss, and predicts their future attendance percentage dynamically. Based on this risk, the request triggers dynamic routing."*

---

## 2. Default Login Credentials

I have generated specific users to represent the distinct scenarios you need to showcase. Note: Run `npm run seed:demo` or `node scripts/seedDemoStudents.js` in the backend folder to ensure these users exist in your DB.

| Role | Email / ID | Password | Scenario |
| :--- | :--- | :--- | :--- |
| **Safe Student** | `safe.student@slms.com` | `student123` | High Attendance (Safe) |
| **Borderline Student** | `borderline.student@slms.com` | `student123` | Drops < 75% on request |
| **Critical Student** | `critical.student@slms.com` | `student123` | Already < 75% (Needs Override) |
| **Master Faculty** | `master.faculty@slms.com` | `faculty123` | Reviewer + Timetable Override |
| **Department HOD** | `admin@slms.com` | `admin123` | Admin & Escalation Authority |

---

## 3. The 3 Demo Scenarios in Action

### 🟩 Case 1: The "Safe" Leave
**Goal:** Show the clean, frictionless prediction engine working perfectly.
1. **Log in as:** `safe.student@slms.com` (100% Attendance)
2. **Action:** Apply for 2 days of "Casual Leave".
3. **What happens:**
   * The UI shows the real-time prediction (e.g., dropping from 100% to ~93%).
   * The Risk Indicator stays **GREEN (Safe)**.
   * **🗣️ Explain:** *"Because this student remains securely above the 75% threshold, the system flags this as a low-risk request that can be processed without strict escalation."*

### 🟨 Case 2: The "Borderline" Leave
**Goal:** Show the intelligence of the system intervening before a student ruins their academic standing.
1. **Log in as:** `borderline.student@slms.com` (~82-85% Attendance)
2. **Action:** Apply for 5 days of "Sick Leave".
3. **What happens:**
   * The prediction runs and simulates that missing 5 days of actual scheduled class sessions will push them to **72%**.
   * The UI immediately flags this as **YELLOW/RED Risk**.
   * **🗣️ Explain:** *"Here, the intelligence of the system kicks in. The student has decent attendance, but this specific leave window contains heavy academic slots. The system detects the drop below the 75% mandate and generates a proactive warning. This prevents faculty from blindly approving risky leaves."*

### 🟥 Case 3: The "Critical" Leave (Strict Policy Override)
**Goal:** Prove the system handles absolute edge cases and enforces strict academic policy.
1. **Log in as:** `critical.student@slms.com` (65% Attendance)
2. **Action:** Attempt to apply for any leave.
3. **What happens:**
   * The predictive engine instantly rejects the core premise, flagging a critical **RED Risk** since they are already below the minimum mandated attendance.
   * The application button might be blocked, **OR** a special override pane expands.
   * To proceed, the student *must* check the **Override/Submit Anyway box** and type a mandatory valid reason (e.g., Medical Emergency).
   * **🗣️ Explain:** *"For students already defaulting on attendance, the system strictly enforces the college policy. They are forced into a mandatory override workflow requiring written justification. This request immediately bypasses lower-level approvals and triggers an 'Escalation' to the Master Faculty and HOD."*

---

## 4. The Faculty & Admin View (The Resolution)

### 👨‍🏫 Master Faculty Review
1. **Log in as:** `master.faculty@slms.com`
2. **Action:** Open the Leave Request Queue.
3. **What happens:**
   * The faculty sees all 3 requests.
   * The interface clearly separates them by badges (Safe, Warning, Critical Risk).
   * **🗣️ Explain:** *"The Master Faculty doesn't need to manually check student records. The DB prediction engine statically snapshots the risk assessment and provides the faculty with a data-driven recommendation. They also possess an `is_master` flag allowing them to seamlessly schedule makeup sessions for these students by bypassing strict timetable day constraints."*

### 👔 Admin / HOD Sign-off
1. **Log in as:** `admin@slms.com`
2. **Action:** Open the Admin Dashboard -> Leave Queue.
3. **What happens:**
   * The Admin sees the escalated **Critical Student** case.
   * **🗣️ Explain:** *"Because the Critical Student forced an override, their request escalated to the HOD. As the Admin, I have the final authority to reject or conditionally approve this leave based on the securely attached medical documentation."*

---

## 💡 Viva / Q&A Defense Sheet (Cheat Codes)

* **Q: Why not just use Google Forms for leave?**
  * *A: Google Forms are static. This system is a dynamic state machine that cross-references a live timetable, removes verified holidays, deduplicates sessions, and calculates real mathematical attendance drops before a decision is even made.*
* **Q: How are you managing the 'Master Faculty' permissions securely?**
  * *A: We eliminated hard-coded email logic. We maintain a scalable `is_master` Boolean flag on the `users` table. This grants controlled override permissions over timetable rules securely and follows proper Role-Based Access Control (RBAC).*
* **Q: What happens if two people approve a leave at the exact same millisecond? (Concurrency)**
  * *A: We implemented an `idempotency_keys` table. The first request is processed and cached using a unique hash. The second request is silently blocked, completely preventing data corruption or duplicate attendance rewrites.*