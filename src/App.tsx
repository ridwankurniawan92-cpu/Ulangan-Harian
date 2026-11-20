import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  BookMarked,
  BookOpen,
  Calendar,
  CheckSquare,
  ClipboardList,
  Database,
  FilePlus2,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PlayCircle,
  Settings,
  Sliders,
  TrendingUp,
  User,
  UserCheck,
  Users,
} from 'lucide-react';
import type { AppSettings, UserSession } from '../shared/types.ts';
import { apiFetch, clearAuthToken } from './lib/api.ts';
import { ToastProvider, LoadingState, useToast } from './components/ui/ToastAndModal.tsx';
import { AppShell, type NavItem } from './components/ui/AppShell.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { StudentsManager } from './components/admin/StudentsManager.tsx';
import { ParentsManager } from './components/admin/ParentsManager.tsx';
import { SubjectsManager } from './components/admin/SubjectsManager.tsx';
import { QuestionBank } from './components/admin/QuestionBank.tsx';
import { ExamBuilder } from './components/admin/ExamBuilder.tsx';
import { ExamsAndSchedule } from './components/admin/ExamsAndSchedule.tsx';
import { ResultsAndGrading } from './components/admin/ResultsAndGrading.tsx';
import { ItemAnalysisView, KktpSettingsView, RecapView } from './components/admin/RecapAndAnalysis.tsx';
import { AppSettingsView } from './components/admin/AppSettingsView.tsx';
import { StudentPortal } from './components/student/StudentPortal.tsx';
import { ExamRunner } from './components/student/ExamRunner.tsx';
import { ParentPortal } from './components/parent/ParentPortal.tsx';

const SUPERADMIN_MENU: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'students', label: 'Data Peserta Didik', icon: <GraduationCap className="w-4 h-4" /> },
  { id: 'parents', label: 'Data Orang Tua', icon: <Users className="w-4 h-4" /> },
  { id: 'subjects', label: 'Mata Pelajaran', icon: <BookMarked className="w-4 h-4" /> },
  { id: 'question-bank', label: 'Bank Soal', icon: <Database className="w-4 h-4" /> },
  { id: 'create-exam', label: 'Buat Ulangan', icon: <FilePlus2 className="w-4 h-4" /> },
  { id: 'exam-schedule', label: 'Jadwal Ulangan', icon: <Calendar className="w-4 h-4" /> },
  { id: 'active-exams', label: 'Ulangan Aktif', icon: <PlayCircle className="w-4 h-4" /> },
  { id: 'exam-results', label: 'Hasil Ulangan', icon: <CheckSquare className="w-4 h-4" /> },
  { id: 'recap', label: 'Rekap Nilai', icon: <ClipboardList className="w-4 h-4" /> },
  { id: 'item-analysis', label: 'Analisis Soal', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'kktp', label: 'Pengaturan KKTP', icon: <Sliders className="w-4 h-4" /> },
  { id: 'settings', label: 'Pengaturan Aplikasi', icon: <Settings className="w-4 h-4" /> },
  { id: 'logout', label: 'Logout', icon: <LogOut className="w-4 h-4" /> },
];

const STUDENT_MENU: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'available-exams', label: 'Ulangan Tersedia', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'my-exams', label: 'Ulangan Saya', icon: <PlayCircle className="w-4 h-4" /> },
  { id: 'results', label: 'Hasil dan Nilai', icon: <Award className="w-4 h-4" /> },
  { id: 'history', label: 'Riwayat Ulangan', icon: <History className="w-4 h-4" /> },
  { id: 'profile', label: 'Profil', icon: <User className="w-4 h-4" /> },
  { id: 'logout', label: 'Logout', icon: <LogOut className="w-4 h-4" /> },
];

const PARENT_MENU: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'child-profile', label: 'Profil Anak', icon: <UserCheck className="w-4 h-4" /> },
  { id: 'exam-results', label: 'Hasil Ulangan', icon: <Award className="w-4 h-4" /> },
  { id: 'score-history', label: 'Riwayat Nilai', icon: <Activity className="w-4 h-4" /> },
  { id: 'progress-chart', label: 'Grafik Perkembangan', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'teacher-notes', label: 'Catatan Guru', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'logout', label: 'Logout', icon: <LogOut className="w-4 h-4" /> },
];

function MainApp() {
  const { showToast } = useToast();
  const [hydrating, setHydrating] = useState(true);
  const [user, setUser] = useState<UserSession | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    school_name: 'SD Negeri Kurikulum Merdeka',
    class_level: 'Kelas III',
    curriculum: 'Kurikulum Merdeka',
    academic_year: '2026/2027',
    semester: 'Ganjil',
    classes: ['3A', '3B', '3C'],
    default_kktp: 75,
  });

  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [activeRunnerExamId, setActiveRunnerExamId] = useState<number | null>(null);

  const hydrateSession = useCallback(async () => {
    try {
      const res = await apiFetch<{ user: UserSession | null; appSettings: AppSettings }>('/api/auth/me');
      if (!res.user) clearAuthToken();
      setUser(res.user);
      if (res.appSettings) setAppSettings(res.appSettings);
    } catch {
      clearAuthToken();
      setUser(null);
    } finally {
      setHydrating(false);
    }
  }, []);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearAuthToken();
      setUser(null);
      setActiveMenu('dashboard');
      setEditingExamId(null);
      setActiveRunnerExamId(null);
      showToast('Anda telah keluar dari aplikasi.', 'info');
    }
  };

  if (hydrating) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <LoadingState label="Memuat Sistem Ulangan Harian Kelas 3..." />
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        appSettings={appSettings}
        onLoginSuccess={() => {
          setActiveMenu('dashboard');
          hydrateSession();
        }}
      />
    );
  }

  // Student Exam Runner Mode (Distraction-free full screen)
  if (user.role === 'student' && activeRunnerExamId !== null) {
    return (
      <ExamRunner
        examId={activeRunnerExamId}
        studentName={user.fullName}
        onExit={() => setActiveRunnerExamId(null)}
        onCompleted={() => {
          setActiveRunnerExamId(null);
          setActiveMenu('results');
        }}
      />
    );
  }

  const navItems =
    user.role === 'superadmin'
      ? SUPERADMIN_MENU
      : user.role === 'student'
        ? STUDENT_MENU
        : PARENT_MENU;

  const handleNavigate = (menuId: string) => {
    if (menuId !== 'create-exam') {
      setEditingExamId(null);
    }
    setActiveMenu(menuId);
  };

  return (
    <AppShell
      user={user}
      appSettings={appSettings}
      navItems={navItems}
      activeMenu={activeMenu}
      onSelectMenu={handleNavigate}
      onLogout={handleLogout}
    >
      {user.role === 'superadmin' && (
        <>
          {activeMenu === 'dashboard' && <AdminDashboard onNavigate={handleNavigate} />}
          {activeMenu === 'students' && <StudentsManager classes={appSettings.classes} />}
          {activeMenu === 'parents' && <ParentsManager />}
          {activeMenu === 'subjects' && <SubjectsManager appSettings={appSettings} />}
          {activeMenu === 'question-bank' && <QuestionBank onNavigate={handleNavigate} />}
          {activeMenu === 'create-exam' && (
            <ExamBuilder
              appSettings={appSettings}
              editingExamId={editingExamId}
              onClearEditing={() => setEditingExamId(null)}
              onNavigate={handleNavigate}
            />
          )}
          {activeMenu === 'exam-schedule' && (
            <ExamsAndSchedule
              mode="schedule"
              appSettings={appSettings}
              onEditExam={(id) => {
                setEditingExamId(id);
                setActiveMenu('create-exam');
              }}
              onNavigate={handleNavigate}
            />
          )}
          {activeMenu === 'active-exams' && (
            <ExamsAndSchedule
              mode="active"
              appSettings={appSettings}
              onEditExam={(id) => {
                setEditingExamId(id);
                setActiveMenu('create-exam');
              }}
              onNavigate={handleNavigate}
            />
          )}
          {activeMenu === 'exam-results' && <ResultsAndGrading />}
          {activeMenu === 'recap' && <RecapView appSettings={appSettings} />}
          {activeMenu === 'item-analysis' && <ItemAnalysisView />}
          {activeMenu === 'kktp' && <KktpSettingsView />}
          {activeMenu === 'settings' && <AppSettingsView onSettingsUpdated={hydrateSession} />}
        </>
      )}

      {user.role === 'student' && (
        <StudentPortal
          user={user}
          activeMenu={activeMenu}
          onNavigate={handleNavigate}
          onStartExam={(examId) => setActiveRunnerExamId(examId)}
        />
      )}

      {user.role === 'parent' && (
        <ParentPortal user={user} activeMenu={activeMenu} onNavigate={handleNavigate} />
      )}
    </AppShell>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <MainApp />
    </ToastProvider>
  );
}
