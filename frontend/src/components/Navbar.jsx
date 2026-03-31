import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { leaveService } from '../services/leaveService';
import toast from 'react-hot-toast';

export default function Navbar({ title }) {
  const { user, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const seenNotificationIds = useRef(new Set());
  const profileRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const pollNotifications = async () => {
      try {
        const res = await leaveService.getMyNotifications(10);
        const payload = res.data?.data;
        if (!mounted || !payload) {
          return;
        }

        setUnreadCount(Number(payload.unreadCount || 0));

        for (const item of payload.items || []) {
          if (!item.read_at && !seenNotificationIds.current.has(item.id)) {
            seenNotificationIds.current.add(item.id);
            toast(item.title, { id: `notif-${item.id}` });
          }
        }
      } catch {
        // no-op: notifications are optional in UI and should not block rendering
      }
    };

    pollNotifications();
    const interval = setInterval(pollNotifications, 15000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <header className="sticky top-16 z-30 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="flex items-center justify-between px-6 h-16">
        <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-slate-700">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
          </div>
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center"
              onClick={() => setProfileOpen((prev) => !prev)}
              title="Open profile"
            >
              <span className="text-white text-sm font-semibold">
                {user?.first_name?.charAt(0)}{user?.last_name?.charAt(0)}
              </span>
            </button>

            {profileOpen ? (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                <p className="text-sm font-semibold text-slate-800">{user?.first_name} {user?.last_name}</p>
                <p className="text-xs text-slate-500 capitalize mt-0.5">{user?.role || 'user'}</p>
                <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                  <p><span className="font-medium text-slate-700">Email:</span> {user?.email || '-'}</p>
                  <p><span className="font-medium text-slate-700">Department:</span> {user?.department_name || '-'}</p>
                  <p><span className="font-medium text-slate-700">Section:</span> {user?.section_name || '-'}</p>
                  <p><span className="font-medium text-slate-700">Semester:</span> {user?.semester || '-'}</p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="btn-outline w-full mt-3 !py-2 !text-xs"
                >
                  Logout
                </button>
              </div>
            ) : null}
          </div>
          <div className="relative" title="Unread notifications">
            <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
              {unreadCount}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
