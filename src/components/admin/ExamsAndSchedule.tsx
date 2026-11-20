import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Copy,
  Edit3,
  Eye,
  LockOpen,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { AppSettings, ExamItem, ExamStatus, SubjectItem } from '../../../shared/types.ts';
import { apiFetch, formatDateId, formatDateTimeId } from '../../lib/api.ts';
import { ConfirmModal, EmptyState, LoadingState, useToast } from '../ui/ToastAndModal.tsx';

interface MonitorParticipant {
  student_id: number;
  nis: string;
  full_name: string;
  class_name: string;
  participant_id: number | null;
  status: 'belum_mulai' | 'sedang_mengerjakan' | 'selesai' | 'dihentikan';
  started_at: string | null;
  finished_at: string | null;
  device_lock_token: string | null;
  answered_count: number;
  reset_count: number;
  total_score: number | null;
}

const STATUS_DISPLAY: Record<ExamStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'text-slate-600' },
  terjadwal: { label: 'Terjadwal', color: 'text-blue-700' },
  aktif: { label: 'Aktif Berlangsung', color: 'text-emerald-700' },
  selesai: { label: 'Selesai', color: 'text-slate-800' },
};

export function ExamsAndSchedule({
  mode,
  appSettings,
  onEditExam,
  onNavigate,
}: {
  mode: 'schedule' | 'active';
  appSettings: AppSettings;
  onEditExam: (examId: number) => void;
  onNavigate: (menuId: string) => void;
}) {
  const { showToast } = useToast();
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<ExamItem | null>(null);
  const [monitorExam, setMonitorExam] = useState<ExamItem | null>(null);
  const [monitorData, setMonitorData] = useState<{ totalQuestions: number; participants: MonitorParticipant[] } | null>(
    null
  );
  const [monitorLoading, setMonitorLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [eRes, sRes] = await Promise.all([
        apiFetch<{ exams: ExamItem[] }>('/api/admin/exams'),
        apiFetch<{ subjects: SubjectItem[] }>('/api/admin/subjects'),
      ]);
      setExams(eRes.exams);
      setSubjects(sRes.subjects);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat daftar ulangan.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [mode]);

  const loadMonitor = async (exam: ExamItem) => {
    setMonitorExam(exam);
    setMonitorLoading(true);
    try {
      const res = await apiFetch<{ totalQuestions: number; participants: MonitorParticipant[] }>(
        `/api/admin/exams/${exam.id}/monitor`
      );
      setMonitorData(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat progres peserta.', 'error');
    } finally {
      setMonitorLoading(false);
    }
  };

  const handleStatusChange = async (exam: ExamItem, nextStatus: ExamStatus) => {
    try {
      await apiFetch(`/api/admin/exams/${exam.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      showToast(`Status ulangan "${exam.title}" diubah menjadi ${STATUS_DISPLAY[nextStatus].label}.`, 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah status ulangan.', 'error');
    }
  };

  const handleCopy = async (exam: ExamItem) => {
    try {
      await apiFetch(`/api/admin/exams/${exam.id}/copy`, { method: 'POST' });
      showToast(`Ulangan "${exam.title}" berhasil disalin sebagai Draft.`, 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyalin ulangan.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/admin/exams/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Ulangan berhasil dihapus.', 'success');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus ulangan.', 'error');
    }
  };

  const handleResetParticipant = async (studentId: number, resetMode: 'device_only' | 'full') => {
    if (!monitorExam) return;
    try {
      await apiFetch(`/api/admin/exams/${monitorExam.id}/reset-participant/${studentId}`, {
        method: 'POST',
        body: JSON.stringify({ mode: resetMode }),
      });
      showToast(
        resetMode === 'device_only' ? 'Kunci perangkat dibuka.' : 'Sesi ujian peserta berhasil direset.',
        'success'
      );
      await loadMonitor(monitorExam);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mereset peserta.', 'error');
    }
  };

  const handleForceFinish = async (studentId: number) => {
    if (!monitorExam) return;
    try {
      await apiFetch(`/api/admin/exams/${monitorExam.id}/force-finish/${studentId}`, {
        method: 'POST',
      });
      showToast('Ujian peserta diakhiri dan nilai otomatis dihitung.', 'success');
      await loadMonitor(monitorExam);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengakhiri ujian.', 'error');
    }
  };

  const filtered = exams.filter((ex) => {
    if (mode === 'active' && ex.status !== 'aktif') return false;
    if (classFilter !== 'all' && ex.class_name !== classFilter) return false;
    if (subjectFilter !== 'all' && String(ex.subject_id) !== subjectFilter) return false;
    if (dateFilter && ex.exam_date !== dateFilter) return false;
    const s = search.toLowerCase();
    if (s && !ex.title.toLowerCase().includes(s) && !(ex.subject_name || '').toLowerCase().includes(s)) {
      return false;
    }
    return true;
  });

  if (loading) return <LoadingState label="Memuat daftar ulangan..." />;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari judul ulangan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="all">Semua Kelas</option>
            {appSettings.classes.map((c) => (
              <option key={c} value={c}>
                Kelas {c}
              </option>
            ))}
          </select>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="all">Semua Mapel</option>
            {subjects.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
          />
        </div>

        <button
          type="button"
          onClick={() => onNavigate('create-exam')}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Buat Ulangan Baru
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-6 h-6" />}
          title={mode === 'active' ? 'Tidak ada ulangan yang sedang aktif' : 'Belum ada jadwal ulangan'}
          description={
            mode === 'active'
              ? 'Aktifkan ulangan dari menu Jadwal Ulangan atau buat ulangan baru untuk mulai dipantau.'
              : 'Buat ulangan harian pertama Anda dan atur jadwal pelaksanaannya.'
          }
          action={
            <button
              type="button"
              onClick={() => onNavigate(mode === 'active' ? 'exam-schedule' : 'create-exam')}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              {mode === 'active' ? 'Buka Jadwal Ulangan' : 'Buat Ulangan'}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((ex) => {
            const stInfo = STATUS_DISPLAY[ex.status];
            return (
              <div
                key={ex.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className={`font-bold ${stInfo.color}`}>{stInfo.label}</span>
                    <span>·</span>
                    <span className="font-semibold text-blue-700">{ex.subject_name}</span>
                    <span>·</span>
                    <span>Kelas {ex.class_name}</span>
                    <span>·</span>
                    <span className="tabular-nums">
                      {ex.exam_date ? formatDateId(ex.exam_date) : 'Tanpa tanggal'} ({ex.start_time || '--:--'} –{' '}
                      {ex.end_time || '--:--'})
                    </span>
                  </div>
                  <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">{ex.title}</h3>
                  <p className="text-xs text-slate-600 tabular-nums">
                    {ex.assigned_question_count ?? ex.question_count} soal · Durasi {ex.duration_minutes} menit · KKTP{' '}
                    {ex.kktp} · Selesai: {ex.submitted_count ?? 0}/{ex.total_class_students ?? 0} siswa
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => loadMonitor(ex)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Pantau Progres
                  </button>

                  {ex.status !== 'aktif' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(ex, 'aktif')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Aktifkan
                    </button>
                  )}

                  {ex.status === 'aktif' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(ex, 'selesai')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 whitespace-nowrap"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Tutup Ulangan
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onEditExam(ex.id)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                    title="Edit ulangan"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(ex)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                    title="Salin ulangan"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(ex)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-red-50 hover:text-red-600"
                    title="Hapus ulangan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Monitoring Modal */}
      {monitorExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl my-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Pantau Progres: {monitorExam.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Kelas {monitorExam.class_name} · {monitorExam.subject_name} · Pengamanan sesi perangkat tunggal aktif
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadMonitor(monitorExam)}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Segarkan
                </button>
                <button
                  type="button"
                  onClick={() => setMonitorExam(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {monitorLoading || !monitorData ? (
                <LoadingState label="Memuat status peserta..." />
              ) : monitorData.participants.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Belum ada peserta didik di Kelas {monitorExam.class_name}.
                </p>
              ) : (
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5">NIS</th>
                      <th className="px-3 py-2.5">Nama Siswa</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Dijawab</th>
                      <th className="px-3 py-2.5">Mulai / Selesai</th>
                      <th className="px-3 py-2.5 text-right">Kontrol Guru</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monitorData.participants.map((p) => (
                      <tr key={p.student_id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2.5 font-mono text-xs tabular-nums">{p.nis}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-900">{p.full_name}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold ${
                              p.status === 'selesai'
                                ? 'text-emerald-700'
                                : p.status === 'sedang_mengerjakan'
                                  ? 'text-blue-700'
                                  : p.status === 'dihentikan'
                                    ? 'text-red-600'
                                    : 'text-slate-500'
                            }`}
                          >
                            {p.status === 'belum_mulai'
                              ? 'Belum Mulai'
                              : p.status === 'sedang_mengerjakan'
                                ? 'Sedang Mengerjakan'
                                : p.status === 'selesai'
                                  ? 'Selesai'
                                  : 'Dihentikan Guru'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs tabular-nums">
                          {p.answered_count}/{monitorData.totalQuestions}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 tabular-nums">
                          <div>M: {formatDateTimeId(p.started_at)}</div>
                          <div>S: {formatDateTimeId(p.finished_at)}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {p.status === 'sedang_mengerjakan' && p.device_lock_token && (
                              <button
                                type="button"
                                onClick={() => handleResetParticipant(p.student_id, 'device_only')}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                title="Izinkan siswa lanjut dari perangkat baru jika HP/tablet bermasalah"
                              >
                                <LockOpen className="w-3 h-3" />
                                Buka Kunci Perangkat
                              </button>
                            )}
                            {p.participant_id && (
                              <button
                                type="button"
                                onClick={() => handleResetParticipant(p.student_id, 'full')}
                                className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                              >
                                Reset Ujian
                              </button>
                            )}
                            {p.status !== 'selesai' && p.status !== 'dihentikan' && (
                              <button
                                type="button"
                                onClick={() => handleForceFinish(p.student_id)}
                                className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                              >
                                Akhiri
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Hapus Ulangan Harian"
        message={`Hapus ulangan "${deleteTarget?.title}"? Seluruh riwayat pengerjaan dan nilai pada ulangan ini juga akan dihapus.`}
        confirmLabel="Ya, Hapus"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
