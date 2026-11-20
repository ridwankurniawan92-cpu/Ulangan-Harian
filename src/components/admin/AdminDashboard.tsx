import React, { useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  PlayCircle,
  Plus,
  Users,
} from 'lucide-react';
import { apiFetch, formatDateTimeId } from '../../lib/api.ts';
import { EmptyState, LoadingState, ScoreBarChart } from '../ui/ToastAndModal.tsx';
import type { ActivityLogItem } from '../../../shared/types.ts';

interface DashboardData {
  stats: {
    studentCount: number;
    subjectCount: number;
    activeExamCount: number;
    completedExamCount: number;
    questionCount: number;
    finishedParticipantsCount: number;
    pendingActiveCount: number;
    classAverageScore: number;
  };
  scoreProgression: Array<{
    id: number;
    title: string;
    subject_name: string;
    class_name: string;
    kktp: number;
    average_score: number;
    participant_count: number;
  }>;
  ongoingExams: Array<{
    id: number;
    title: string;
    class_name: string;
    duration_minutes: number;
    kktp: number;
    subject_name: string;
    exam_date: string | null;
    start_time: string | null;
    end_time: string | null;
    total_students: number;
    finished_students: number;
    working_students: number;
  }>;
  recentActivities: ActivityLogItem[];
}

export function AdminDashboard({ onNavigate }: { onNavigate: (menuId: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<DashboardData>('/api/admin/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat ringkasan dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingState label="Memuat dashboard guru..." />;
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error || 'Data dashboard tidak tersedia.'}
      </div>
    );
  }

  const { stats, scoreProgression, ongoingExams, recentActivities } = data;

  const kpiCards = [
    { label: 'Jumlah Peserta Didik', value: stats.studentCount, icon: <Users className="w-5 h-5 text-blue-700" />, target: 'students' },
    { label: 'Mata Pelajaran', value: stats.subjectCount, icon: <BookOpen className="w-5 h-5 text-blue-700" />, target: 'subjects' },
    { label: 'Ulangan Aktif', value: stats.activeExamCount, icon: <PlayCircle className="w-5 h-5 text-emerald-700" />, target: 'active-exams' },
    { label: 'Ulangan Selesai', value: stats.completedExamCount, icon: <ClipboardCheck className="w-5 h-5 text-slate-700" />, target: 'exam-results' },
    { label: 'Sudah Mengerjakan', value: stats.finishedParticipantsCount, icon: <CheckCircle2 className="w-5 h-5 text-emerald-700" />, target: 'exam-results' },
    { label: 'Belum Selesai (Aktif)', value: stats.pendingActiveCount, icon: <Clock className="w-5 h-5 text-amber-600" />, target: 'active-exams' },
    { label: 'Rata-rata Nilai Kelas', value: stats.classAverageScore, icon: <Activity className="w-5 h-5 text-blue-700" />, target: 'recap' },
    { label: 'Total Butir Soal', value: stats.questionCount, icon: <BookOpen className="w-5 h-5 text-slate-700" />, target: 'question-bank' },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Start Banner when empty */}
      {stats.studentCount === 0 && stats.subjectCount === 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Selamat Datang di Sistem Evaluasi Ulangan Harian Kelas 3
            </h2>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl">
              Basis data masih bersih tanpa data contoh. Mulailah dengan menambahkan Mata Pelajaran, menginput atau mengimpor Data Peserta Didik, lalu mengisi Bank Soal.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('subjects')}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Atur Mata Pelajaran
            </button>
            <button
              type="button"
              onClick={() => onNavigate('students')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Tambah Siswa
            </button>
          </div>
        </div>
      )}

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onNavigate(c.target)}
            className="text-left rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{c.label}</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-100">
                {c.icon}
              </div>
            </div>
            <p className="mt-3 font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
              {c.value}
            </p>
          </button>
        ))}
      </div>

      {/* Main Split: Chart + Ongoing Exams */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">Grafik Perkembangan Nilai Ulangan</h2>
              <p className="text-xs text-slate-500">Rata-rata nilai kelas per ulangan harian</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('recap')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
            >
              Lihat Rekap Lengkap
            </button>
          </div>
          <ScoreBarChart
            data={scoreProgression.map((s) => ({
              label: s.title,
              score: s.average_score,
              subtitle: `${s.subject_name} (${s.class_name})`,
            }))}
            emptyText="Belum ada hasil ulangan untuk digrafikkan."
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-bold text-slate-900">Ulangan Berlangsung</h2>
            <button
              type="button"
              onClick={() => onNavigate('active-exams')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800"
            >
              Pantau
            </button>
          </div>

          {ongoingExams.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <p className="text-sm font-medium text-slate-600">Tidak ada ulangan yang sedang aktif.</p>
              <button
                type="button"
                onClick={() => onNavigate('create-exam')}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800"
              >
                <Plus className="w-3.5 h-3.5" />
                Buat Ulangan Baru
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {ongoingExams.map((ex) => (
                <div key={ex.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-bold text-slate-900 truncate">{ex.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {ex.subject_name} · Kelas {ex.class_name} · {ex.duration_minutes} menit
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs tabular-nums">
                    <span className="text-emerald-700 font-semibold">Selesai: {ex.finished_students}/{ex.total_students}</span>
                    <span className="text-blue-700 font-medium">Mengerjakan: {ex.working_students}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-bold text-slate-900">Aktivitas Terbaru</h2>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-800"
          >
            Semua Log
          </button>
        </div>

        {recentActivities.length === 0 ? (
          <EmptyState
            icon={<Activity className="w-5 h-5" />}
            title="Belum ada log aktivitas"
            description="Setiap aktivitas login, pengelolaan soal, dan pengerjaan ujian akan tercatat di sini."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 pr-4">Waktu</th>
                  <th className="py-2.5 pr-4">Pengguna</th>
                  <th className="py-2.5 pr-4">Aksi</th>
                  <th className="py-2.5">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentActivities.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 pr-4 text-xs text-slate-500 whitespace-nowrap tabular-nums">
                      {formatDateTimeId(log.created_at)}
                    </td>
                    <td className="py-2.5 pr-4 text-xs font-semibold text-slate-800 whitespace-nowrap">
                      {log.actor_name}
                    </td>
                    <td className="py-2.5 pr-4 text-xs font-mono text-blue-700 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2.5 text-xs text-slate-600">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
