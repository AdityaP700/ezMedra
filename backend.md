# 🚀 Backend Architecture: Viva & Presentation Guide

This guide is designed to help you explain the backend of **ezMedra** (Student Leave Management System) quickly and effectively during your viva or presentation.

---

## 🏛️ High-Level Architecture
The backend is built using **Node.js** and **Express.js**, following a **Modular 3-Tier Architecture**:
1.  **Controllers**: These act as the "Entry Points" for HTTP requests from the frontend. They parse the data and format the final response.
2.  **Services**: This is the "Brain" of the application. All complex business logic (e.g., assessing if a student will drop below 75% attendance) lives here.
3.  **Repositories**: The "Database Interface." These are responsible for raw SQL queries and data storage.

**Key Technical Highlight**: We use an **Event-Driven Architecture** for side effects (like sending notifications) to ensure the API remains fast and responsive.

---

## 📂 Folder-by-Folder Breakdown

| Folder | What does it do? | Viva Talking Point |
|---|---|---|
| **`config/`** | Server & DB Setup | "We support both **Supabase (PostgreSQL)** and a **Mock In-Memory DB** for zero-setup local testing." |
| **`modules/`** | Business Features | "Each feature (Auth, Leave, Academic) is its own module, making the code easier to maintain and test." |
| **`middleware/`** | Security & Filters | "Handles **JWT Authentication**, **Role-Based Access Control (RBAC)**, and **Rate Limiting**." |
| **`events/`** | Notification Bus | "Uses a Node.js **EventEmitter** to trigger notifications asynchronously, so the main system stays fast." |
| **`policy/`** | Rule Engine | "A standalone engine that calculates holidays, weekends, and attendance overlap percentages." |
| **`workers/`** | Maintenance Jobs | "A separate process that handles background tasks like clearing expired delegations every 60 seconds." |
| **`utils/`** | Shared Utilities | "Small helpers for consistent **UTC date/time handling**, ensuring the system works across time zones." |
| **`scripts/`** | Scenario Seeders | "Automated scripts that populate the system with dummy students and faculty for testing." |

---

## 🛠️ The "Secret Sauce" (Advanced Features)

### 1. The Policy Engine (`modules/policy/`)
Instead of hardcoding simple rules, we built a stateless engine. It doesn't just check dates; it calculates **partial attendance overlaps** (e.g., if a student takes a half-day, it knows exactly which class sessions are missed).

### 2. Admin Delegation (`middleware/adminDelegation.js`)
We implemented a feature where an Admin can **delegate** their authority to another user temporarily. The middleware automatically detects this and elevates permissions without requiring a password change.

### 3. Mock Database (`config/mockDb.js`)
To make the project "Plug and Play," we built a full in-memory simulation of PostgreSQL. This allows the backend to run perfectly even without an internet connection or a local database server.

---

## 💡 Potential Viva Questions & Answers

**Q: Why use a Service layer instead of putting all logic in Controllers?**
**A:** To follow the **Single Responsibility Principle**. If we need to calculate attendance risk for multiple features (like applying for a leave vs. just viewing insights), we can reuse the same Service function.

**Q: How do you handle database security?**
**A:** We use **Parameterized Queries** to prevent **SQL Injection** and **bcrypt** to securely hash all user passwords.

**Q: What happens if a teacher fails to respond to a leave request?**
**A:** Our **SLA (Service Level Agreement)** logic in `leave.service.js` automatically **escalates** the request to the HOD after a 24-hour timeout.

---

## 📊 Summary of Main Modules
*   **`auth`**: Registration and Secure Login (Admin, Faculty, Student).
*   **`academic`**: Timetables, Class Sessions, and real-time Attendance Marking.
*   **`leave`**: The core logic—handles Risk Tiers (Green/Yellow/Red) and the multi-level approval flow.
*   **`reports`**: Generates analytics and attendance summaries for students and admins.
