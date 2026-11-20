import React, { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  PlayCircle,
  User,
} from 'lucide-react';
import type { UserSession } from '../../../shared/types.ts';
import { apiFetch, formatDateId, formatDateTimeId } from '../../lib/api.ts';
import { EmptyState, LoadingState, useToast } from '../ui/ToastAndModal.tsx';

export interface StudentExamViewItem {
  id: number;
  title: string;
  subject_name: string;
  class_name: string;
  topic: string;
  duration_minutes: number;
  question_count: number;
  max_score: number;
  kktp: number;
  instructions: string;
  status: 'terjadwal' | 'aktif' | 'selesai';
  exam_date: string | null;
  start_time: string | null;
  end_time: string | null;
  participant_status: 'belum_mulai' | 'sedang_mengerjakan' | 'selesai' | 'dihentikan';
  started_at: string | null;
  finished_at: string | null;
  is_published: boolean;
  result: {
    total_score: number;
    max_possible_score: number;
    percentage: number;
    is_passed: boolean;
    teacher_note: string;
    correct_count: number;
    wrong_count: number;
    unanswered_count: number;
  } | null;
}

interface StudentDashboardData {
  exams: StudentExamViewItem[];
  stats: {
    availableCount: number;
    ongoingCount: number;
    completedCount: number;
    unattemptedActiveCount: number;
    publishedCount: number;
    averageScore: number;
  };
}

export function StudentPortal({
  user,
  activeMenu,
  onNavigate,
  onStartExam,
}: {
  user: UserSession;
  activeMenu: string;
  onNavigate: (menuId: string) => void;
  onStartExam: (examId: number) => void;
}) {
  const { showToast } = useToast();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<StudentDashboardData>('/api/student/dashboard');
      setData(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat data siswa.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeMenu]);

  if (loading || !data) return <LoadingState label="Memuat portal peserta didik..." />;

  const { exams, stats } = data;
  const student = user.studentProfile;

  const availableExams = exams.filter(
    (e) => (e.status === 'aktif' || e.status === 'terjadwal') && e.participant_status !== 'selesai' && e.participant_status !== 'dihentikan'
  );
  const myExams = exams.filter((e) => e.status === 'aktif' || e.participant_status === 'sedang_mengerjakan');
  const completedExams = exams.filter((e) => e.participant_status === 'selesai' || e.participant_status === 'dihentikan');
  const publishedExams = completedExams.filter((e) => e.is_published && e.result !== null);

  if (activeMenu === 'profile') {
    return (
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-xl font-bold text-white">
            {user.fullName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">{user.fullName}</h2>
            <p className="text-sm text-slate-500">Peserta Didik · Kelas {student?.class_name}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl border border-slate-200 p-3.5">
            <p className="text-xs text-slate-500">NIS</p>
            <p className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">{student?.nis}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3.5">
            <p className="text-xs text-slate-500">NISN</p>
            <p className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">{student?.nisn || '-'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3.5">
            <p className="text-xs text-slate-500">Kelas</p>
            <p className="mt-1 font-semibold text-slate-900">Kelas {student?.class_name}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3.5">
            <p className="text-xs text-slate-500">Username Akun</p>
            <p className="mt-1 font-mono font-semibold text-slate-900">@{user.username}</p>
          </div>
        </div>

        {student?.parents && student.parents.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-bold text-slate-700 mb-2">Orang Tua / Wali Terhubung</h3>
            <div className="space-y-2">
              {student.parents.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs flex items-center justify-between">
                  <span className="font-semibold text-slate-900">{p.full_name}</span>
                  <span className="text-slate-500">{p.relationship_label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeMenu === 'available-exams' || activeMenu === 'my-exams') {
    const list = activeMenu === 'available-exams' ? availableExams : myExams;
    return (
      <div className="space-y-4">
        {list.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="w-6 h-6" />}
            title={activeMenu === 'available-exams' ? 'Belum ada ulangan tersedia' : 'Tidak ada ulangan berlangsung'}
            description="Jika guru sudah menjadwalkan atau mengaktifkan ulangan untuk kelasmu, daftarnya akan muncul di sini."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {list.map((ex) => (
              <div key={ex.id} className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-blue-700">{ex.subject_name}</span>
                    <span>·</span>
                    <span>Kelas {ex.class_name}</span>
                    <span>·</span>
                    <span className="tabular-nums">{ex.duration_minutes} menit</span>
                  </div>
                  <h3 className="mt-1.5 font-display text-lg font-bold text-slate-900">{ex.title}</h3>
                  {ex.topic && <p className="mt-1 text-xs text-slate-600">Materi: {ex.topic}</p>}
                  {ex.instructions && (
                    <p className="mt-2 text-xs text-slate-500 leading-relaxed">{ex.instructions}</p>
                  )}
                  <p className="mt-3 text-xs text-slate-500 tabular-nums">
                    Jadwal: {formatDateId(ex.exam_date)} ({ex.start_time || '--:--'} – {ex.end_time || '--:--'}) ·{' '}
                    {ex.question_count} soal · KKTP {ex.kktp}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  {ex.status === 'terjadwal' ? (
                    <span className="text-xs font-semibold text-blue-700">Menunggu Diaktifkan Guru</span>
                  ) : ex.participant_status === 'selesai' || ex.participant_status === 'dihentikan' ? (
                    <span className="text-xs font-semibold text-emerald-700">Sudah Dikerjakan</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartExam(ex.id)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      <PlayCircle className="w-4 h-4" />
                      {ex.participant_status === 'sedang_mengerjakan' ? 'Lanjutkan Mengerjakan' : 'Mulai Kerjakan Ulangan'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (activeMenu === 'results' || activeMenu === 'history') {
    const list = activeMenu === 'results' ? completedExams : exams;
    return (
      <div className="space-y-4">
        {list.length === 0 ? (
          <EmptyState
            icon={<Award className="w-6 h-6" />}
            title="Belum ada riwayat ulangan"
            description="Setelah kamu mengerjakan ulangan dan guru memublikasikan nilainya, hasilnya akan muncul di sini."
          />
        ) : (
          <div className="space-y-3">
            {list.map((ex) => (
              <div key={ex.id} className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-blue-700">{ex.subject_name}</span>
                    <span>·</span>
                    <span>{formatDateId(ex.exam_date)}</span>
                    {ex.finished_at && (
                      <>
                        <span>·</span>
                        <span>Dikumpulkan {formatDateTimeId(ex.finished_at)}</span>
                      </>
                    )}
                  </div>
                  <h3 className="font-display text-base font-bold text-slate-900">{ex.title}</h3>
                  {ex.is_published && ex.result?.teacher_note && (
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 mt-1">
                      <strong>Catatan Guru:</strong> {ex.result.teacher_note}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-left sm:text-right">
                  {ex.participant_status === 'belum_mulai' ? (
                    <span className="text-xs font-semibold text-slate-500">Belum Dikerjakan</span>
                  ) : ex.participant_status === 'sedang_mengerjakan' ? (
                    <button
                      type="button"
                      onClick={() => onStartExam(ex.id)}
                      className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                    >
                      Lanjutkan Ujian
                    </button>
                  ) : !ex.is_published || !ex.result ? (
                    <span className="text-xs font-semibold text-amber-700">Menunggu Penilaian / Publikasi Guru</span>
                  ) : (
                    <div>
                      <p className="font-display text-2xl font-bold text-slate-900 tabular-nums">
                        {ex.result.total_score}
                        <span className="text-xs font-normal text-slate-400"> / {ex.result.max_possible_score}</span>
                      </p>
                      <p className={`text-xs font-bold ${ex.result.is_passed ? 'text-emerald-700' : 'text-red-600'}`}>
                        {ex.result.is_passed ? 'Tuntas KKTP' : 'Belum Mencapai KKTP'} (KKTP {ex.kktp})
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                        Benar {ex.result.correct_count} · Salah {ex.result.wrong_count} · Kosong {ex.result.unanswered_count}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Default: Student Dashboard
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-white font-bold">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Halo, {user.fullName}!</h2>
            <p className="text-xs text-slate-500">
              Kelas {student?.class_name} · NIS {student?.nis} · Semangat belajar dan kerjakan ulangan dengan jujur!
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('available-exams')}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
        >
          <PlayCircle className="w-4 h-4" />
          Lihat Ulangan Tersedia
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Ulangan Tersedia</p>
          <p className="mt-2 font-display text-2xl font-bold text-blue-700 tabular-nums">{stats.availableCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Belum Dikerjakan (Aktif)</p>
          <p className="mt-2 font-display text-2xl font-bold text-amber-600 tabular-nums">{stats.unattemptedActiveCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Sudah Dikerjakan</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-700 tabular-nums">{stats.completedCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Rata-rata Nilai</p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">{stats.averageScore}</p>
        </div>
      </div>

      {/* Active / Available Exams Quick List */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-slate-900">Ulangan Siap Dikerjakan</h3>
          <button
            type="button"
            onClick={() => onNavigate('available-exams')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-800"
          >
            Semua Ulangan
          </button>
        </div>

        {availableExams.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">Belum ada ulangan aktif saat ini.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableExams.slice(0, 4).map((ex) => (
              <div key={ex.id} className="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-blue-700">{ex.subject_name}</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{ex.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 tabular-nums">
                    <Clock className="w-3.5 h-3.5" />
                    {ex.duration_minutes} menit · {ex.question_count} soal
                  </p>
                </div>
                {ex.status === 'aktif' ? (
                  <button
                    type="button"
                    onClick={() => onStartExam(ex.id)}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shrink-0"
                  >
                    {ex.participant_status === 'sedang_mengerjakan' ? 'Lanjutkan' : 'Kerjakan'}
                  </button>
                ) : (
                  <span className="text-xs font-medium text-slate-500 shrink-0">Terjadwal</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Published Scores */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-slate-900">Nilai Ulangan Terbaru</h3>
          <button
            type="button"
            onClick={() => onNavigate('results')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-800"
          >
            Semua Nilai
          </button>
        </div>

        {publishedExams.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">Belum ada nilai ulangan yang dipublikasikan.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {publishedExams.slice(0, 5).map((ex) => (
              <div key={ex.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-900">{ex.title}</p>
                  <p className="text-xs text-slate-500">
                    {ex.subject_name} · {formatDateId(ex.exam_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-base font-bold text-slate-900 tabular-nums">{ex.result!.total_score}</p>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold ${
                      ex.result!.is_passed ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {ex.result!.is_passed ? 'Tuntas' : 'Belum Tuntas'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
