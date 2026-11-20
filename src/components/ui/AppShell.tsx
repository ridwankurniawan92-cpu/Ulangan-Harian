import React, { useEffect, useState } from 'react';
import {
  Bell,
  BookOpen,
  CheckCheck,
  KeyRound,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import type { AppSettings, NotificationItem, UserSession } from '../../../shared/types.ts';
import { apiFetch, formatDateTimeId } from '../../lib/api.ts';
import { useToast } from './ToastAndModal.tsx';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export function AppShell({
  user,
  appSettings,
  navItems,
  activeMenu,
  onSelectMenu,
  onLogout,
  children,
}: {
  user: UserSession;
  appSettings: AppSettings;
  navItems: NavItem[];
  activeMenu: string;
  onSelectMenu: (id: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const { showToast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  const loadNotifications = async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(data.notifications);
    } catch {
      // ignore transient polling error
    }
  };

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 25000);
    return () => clearInterval(timer);
  }, []);

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;

  const markRead = async (n: NotificationItem) => {
    if (n.is_read === 0) {
      await apiFetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, is_read: 1 } : item)));
    }
    if (n.link_target) {
      if (n.link_target.startsWith('monitor:')) onSelectMenu('active-exams');
      else if (n.link_target.startsWith('exam-results:')) onSelectMenu('exam-results');
      else if (n.link_target === 'results') onSelectMenu(user.role === 'student' ? 'results' : 'exam-results');
      else if (n.link_target === 'available-exams') onSelectMenu('available-exams');
    }
    setNotifOpen(false);
  };

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdLoading(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      showToast('Kata sandi berhasil diperbarui.', 'success');
      setPwdModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah kata sandi.', 'error');
    } finally {
      setPwdLoading(false);
    }
  };

  const activeNav = navItems.find((i) => i.id === activeMenu);

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
          <BookOpen className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-slate-900 truncate">ULANGAN HARIAN</p>
          <p className="text-xs text-slate-500 truncate">Kelas III · {appSettings.academic_year}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Menu navigasi">
        {navItems.map((item) => {
          const isLogout = item.id === 'logout';
          const isActive = item.id === activeMenu;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                if (isLogout) onLogout();
                else onSelectMenu(item.id);
              }}
              className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                isLogout
                  ? 'text-red-600 hover:bg-red-50 mt-2'
                  : isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
        <p className="font-semibold text-slate-700 truncate">{appSettings.school_name}</p>
        <p className="mt-0.5 truncate">
          {appSettings.curriculum} · Semester {appSettings.semester}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[264px] shrink-0 sticky top-0 h-screen">{sidebarContent}</aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative z-10 w-72 max-w-[85vw] h-full">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Tutup menu"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6 py-3.5 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">
                {activeNav?.label || 'Dashboard'}
              </h1>
              <p className="text-xs text-slate-500 truncate hidden sm:block">
                ULANGAN HARIAN KELAS 3 · {user.roleDisplayName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  loadNotifications();
                }}
                className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                aria-label="Notifikasi"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-700 px-1 text-[10px] font-bold text-white tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 z-40 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <span className="text-sm font-bold text-slate-900">Notifikasi</span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllRead}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          Tandai semua dibaca
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-slate-500">
                          Belum ada notifikasi baru.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => markRead(n)}
                            className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                              n.is_read === 0 ? 'bg-blue-50/50' : 'bg-white'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-bold text-slate-900">{n.title}</p>
                              <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                                {formatDateTimeId(n.created_at)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600 leading-relaxed">{n.message}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white shrink-0">
                {user.fullName.slice(0, 2).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left max-w-[160px]">
                <p className="text-xs font-semibold text-slate-900 truncate">{user.fullName}</p>
                <p className="text-[11px] text-slate-500 truncate">@{user.username}</p>
              </div>
              <button
                type="button"
                onClick={() => setPwdModalOpen(true)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Ubah kata sandi"
                aria-label="Ubah kata sandi"
              >
                <KeyRound className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="Keluar"
                aria-label="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>

      {/* Change Password Modal */}
      {pwdModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleChangePassword}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Ubah Kata Sandi</h3>
              <button
                type="button"
                onClick={() => setPwdModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kata Sandi Saat Ini</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kata Sandi Baru</label>
              <input
                type="password"
                required
                minLength={4}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPwdModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={pwdLoading}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {pwdLoading ? 'Menyimpan...' : 'Simpan Kata Sandi'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
