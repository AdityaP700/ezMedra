import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function DashboardLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="transition-all duration-300">
        <div className="fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
