# 🎨 Frontend Architecture: Viva & Presentation Guide

This guide provides a high-level overview of the **ezMedra** frontend, built with **React** and **Vite**. Use this to explain your UI/UX decisions and technical structure during your viva.

---

## 🏗️ High-Level Architecture
The frontend is a **Single Page Application (SPA)** that follows a modular, component-based structure:
1.  **Context API**: Handles global state (Authentication, User Profiles) so data is available everywhere without "Prop Drilling."
2.  **Services Layer**: Encapsulates all API logic. Components don't call the backend directly; they call a service.
3.  **Protected Routing**: A "Gatekeeper" system that redirects users based on their roles (Student vs. Faculty vs. Admin).

**Key Technical Highlight**: We use **Axios Interceptors** to automatically attach JWT security tokens to every request and handle session timeouts (401 errors) gracefully.

---

## 📂 Folder-by-Folder Breakdown

| Folder | What does it do? | Viva Talking Point |
|---|---|---|
| **`src/context/`** | Global State | "The **AuthContext** manages the logged-in user's state and persists it to `localStorage`." |
| **`src/services/`** | API Communication | "All backend communication is centralized here using **Axios** for clean, reusable API calls." |
| **`src/pages/`** | Full-Screen Views | "Each role has its own dashboard (Student, Faculty, Admin) to keep the UI clean and specific to the user's needs." |
| **`src/components/`**| UI Building Blocks | "Contains reusable elements like `Modal`, `Table`, and `Sidebar` to ensure a consistent look and feel." |
| **`src/utils/`** | Formatters | "Helper functions for date formatting and UI calculations shared across pages." |
| **`tailwind.config.js`**| Styling System | "We use **Tailwind CSS** for a modern, responsive, and maintainable design system." |

---

## 🛠️ The "Secret Sauce" (Advanced Features)

### 1. Role-Based Access Control (RBAC)
Our `ProtectedRoute.jsx` component wraps every sensitive page. If a student tries to manually type `/admin` in the URL, React Router will detect the role mismatch and redirect them to the home page or a 403 Forbidden view.

### 2. Automatic Session Recovery
Inside `AuthContext.jsx`, we check `localStorage` as soon as the app loads. If a valid token exists, the user is logged back in automatically, providing a "stay logged in" experience.

### 3. Dynamic Sidebar & Layouts
The `DashboardLayout.jsx` creates a consistent workspace with a fixed Sidebar and Topbar. The Sidebar content changes dynamically based on whether you are an Admin, Faculty, or Student.

---

## 💡 Potential Viva Questions & Answers

**Q: Why use Vite instead of Create React App (CRA)?**
**A:** Vite uses **ES Modules** and a highly optimized build engine (esbuild), making it much faster for both development (Hot Module Replacement) and final production builds.

**Q: How do you handle authentication securely in the frontend?**
**A:** We store the **JWT token** in `localStorage`. This token is automatically added to the `Authorization` header of every API request using an **Axios Interceptor**.

**Q: What is the benefit of using the Context API over Redux?**
**A:** For an application of this scale, the **Context API** is more lightweight and built-in to React. It provides all the global state management we need (Auth status) without the complexity of Redux boilerplate.

---

## 📊 Summary of Main Pages
*   **`Login.jsx`**: A multi-role entry point that redirects users to their specific dashboard upon success.
*   **`StudentDashboard.jsx`**: Where students can apply for leave and view their projected attendance risk.
*   **`FacultyDashboard.jsx`**: A workflow-heavy page for reviewing and forwarding leave requests.
*   **`AdminDashboard.jsx`**: A command center for managing users, holidays, and high-level system logs.
