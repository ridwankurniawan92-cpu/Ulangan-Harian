import React, { useEffect, useState } from 'react';
import { Award, BookOpen, MessageSquare, TrendingUp, User } from 'lucide-react';
import type { UserSession } from '../../../shared/types.ts';
import { apiFetch, formatDateId } from '../../lib/api.ts';
import { EmptyState, LoadingState, ScoreBarChart, useToast } from '../ui/ToastAndModal.tsx';

interface ChildSummary {
  id: number;
  nis: string;
  nisn: string | null;
  full_name: string;
  gender: 'L' | 'P';
  class_name: string;
  relationship_label: string;
}

interface ParentResultRow {
  id: number;
  exam_id: number;
  total_score: number;
  max_possible_score: number;
  percentage: number;
  correct_count: number;
  wrong_count: number;
  unanswered_count: number;
  kktp_threshold: number;
  is_passed: number;
  teacher_note: string;
  graded_at: string;
  exam_title: string;
  topic: string;
  subject_name: string;
  exam_date: string | null;
}

interface ParentDashboardData {
  children: ChildSummary[];
  selectedChild: ChildSummary | null;
  results: ParentResultRow[];
  upcomingExams: Array<{
    id: number;
    title: string;
    status: string;
    subject_name: string;
    exam_date: string | null;
    participant_status: string;
  }>;
}

export function ParentPortal({
  user,
  activeMenu,
  onNavigate,
}: {
  user: UserSession;
  activeMenu: string;
  onNavigate: (menuId: string) => void;
}) {
  const { showToast } = useToast();
  const [selectedChildId, setSelectedChildId] = useState<number>(0);
  const [data, setData] = useState<ParentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async (childId?: number) => {
    setLoading(true);
    try {
      const qs = childId ? `?studentId=${childId}` : '';
      const res = await apiFetch<ParentDashboardData>(`/api/parent/dashboard${qs}`);
      setData(res);
      if (res.selectedChild && !selectedChildId) {
        setSelectedChildId(res.selectedChild.id);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat data pemantauan anak.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedChildId || undefined);
  }, [selectedChildId, activeMenu]);

  if (loading || !data) return <LoadingState label="Memuat perkembangan belajar anak..." />;

  if (data.children.length === 0 || !data.selectedChild) {
    return (
      <EmptyState
        icon={<User className="w-6 h-6" />}
        title="Belum ada data anak yang terhubung"
        description="Akun orang tua Anda belum dihubungkan dengan akun peserta didik. Silakan hubungi Guru Kelas III (Superadmin)."
      />
    );
  }

  const child = data.selectedChild;
  const results = data.results;
  const avgScore =
    results.length > 0
      ? Math.round((results.reduce((acc, r) => acc + r.total_score, 0) / results.length) * 10) / 10
      : 0;
  const passedCount = results.filter((r) => r.is_passed === 1).length;
  const notesList = results.filter((r) => r.teacher_note && r.teacher_note.trim().length > 0);

  const childSelectorBar = data.children.length > 1 && (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4">
      <span className="text-xs font-semibold text-slate-600">Pilih Profil Anak:</span>
      <select
        value={child.id}
        onChange={(e) => setSelectedChildId(Number(e.target.value))}
        className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900"
      >
        {data.children.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name} (Kelas {c.class_name})
          </option>
        ))}
      </select>
    </div>
  );

  if (activeMenu === 'child-profile') {
    return (
      <div className="space-y-6 max-w-2xl">
        {childSelectorBar}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-lg font-bold text-white">
              {child.full_name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">{child.full_name}</h2>
              <p className="text-sm text-slate-500">Kelas {child.class_name} · {child.relationship_label}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">NIS</p>
              <p className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">{child.nis}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">NISN</p>
              <p className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">{child.nisn || '-'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">Jenis Kelamin</p>
              <p className="mt-1 font-semibold text-slate-900">{child.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">Akun Pemantau</p>
              <p className="mt-1 font-semibold text-slate-900">{user.fullName}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeMenu === 'progress-chart') {
    return (
      <div className="space-y-6">
        {childSelectorBar}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Grafik Perkembangan Nilai — {child.full_name}
            </h2>
            <p className="text-xs text-slate-500">Perkembangan nilai ulangan harian yang telah dipublikasikan guru</p>
          </div>
          <ScoreBarChart
            data={results.map((r) => ({
              label: r.exam_title,
              score: r.total_score,
              subtitle: r.subject_name,
            }))}
            kktpLine={results[0]?.kktp_threshold}
            emptyText="Belum ada nilai yang dipublikasikan untuk ditampilkan di grafik."
          />
        </div>
      </div>
    );
  }

  if (activeMenu === 'teacher-notes') {
    return (
      <div className="space-y-6">
        {childSelectorBar}
        {notesList.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="w-6 h-6" />}
            title="Belum ada catatan guru"
            description="Catatan dan umpan balik dari guru pada hasil ulangan anak akan tampil di sini setelah nilai dipublikasikan."
          />
        ) : (
          <div className="space-y-3">
            {notesList.map((n) => (
              <div key={n.id} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-blue-700">{n.subject_name} · {n.exam_title}</span>
                  <span>{formatDateId(n.exam_date || n.graded_at)}</span>
                </div>
                <p className="text-sm text-slate-800 leading-relaxed">{n.teacher_note}</p>
                <p className="text-xs font-mono text-slate-500 tabular-nums">
                  Nilai: <strong className="text-slate-900">{n.total_score}</strong> ({n.is_passed ? 'Tuntas' : 'Belum Tuntas'})
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (activeMenu === 'exam-results' || activeMenu === 'score-history') {
    return (
      <div className="space-y-6">
        {childSelectorBar}
        {results.length === 0 ? (
          <EmptyState
            icon={<Award className="w-6 h-6" />}
            title="Belum ada hasil ulangan dipublikasikan"
            description="Nilai ulangan hanya ditampilkan setelah guru selesai memeriksa dan memublikasikannya."
          />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Mata Pelajaran</th>
                    <th className="px-4 py-3">Judul Ulangan</th>
                    <th className="px-4 py-3">Benar / Salah / Kosong</th>
                    <th className="px-4 py-3">Nilai</th>
                    <th className="px-4 py-3">KKTP</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...results].reverse().map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {formatDateId(r.exam_date || r.graded_at)}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-blue-700">{r.subject_name}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.exam_title}</td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600">
                        {r.correct_count} / {r.wrong_count} / {r.unanswered_count}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 tabular-nums">{r.total_score}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums">{r.kktp_threshold}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs font-bold ${r.is_passed === 1 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {r.is_passed === 1 ? 'Tuntas' : 'Belum Tuntas'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Default: Parent Dashboard
  return (
    <div className="space-y-6">
      {childSelectorBar}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-700">Pemantauan Belajar Orang Tua (Mode Lihat Saja)</p>
          <h2 className="mt-1 font-display text-xl font-bold text-slate-900">{child.full_name}</h2>
          <p className="text-xs text-slate-500">
            Kelas {child.class_name} · NIS {child.nis}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('exam-results')}
          className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
        >
          Lihat Daftar Nilai
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Ulangan Dinilai</p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">{results.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Rata-rata Nilai</p>
          <p className="mt-2 font-display text-2xl font-bold text-blue-700 tabular-nums">{avgScore}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Tuntas KKTP</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-700 tabular-nums">{passedCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Catatan Guru</p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">{notesList.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-700" />
              Grafik Perkembangan Nilai
            </h3>
          </div>
          <ScoreBarChart
            data={results.map((r) => ({
              label: r.exam_title,
              score: r.total_score,
              subtitle: r.subject_name,
            }))}
            kktpLine={results[0]?.kktp_threshold}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
          <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-700" />
            Daftar Ulangan Kelas {child.class_name}
          </h3>
          {data.upcomingExams.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">Belum ada jadwal ulangan.</p>
          ) : (
            <div className="space-y-2.5">
              {data.upcomingExams.slice(0, 6).map((ex) => (
                <div key={ex.id} className="rounded-xl border border-slate-200 p-3 text-xs">
                  <p className="font-bold text-slate-900 truncate">{ex.title}</p>
                  <p className="text-slate-500 mt-0.5">
                    {ex.subject_name} · {formatDateId(ex.exam_date)}
                  </p>
                  <p className="mt-1 font-semibold text-blue-700">
                    Status anak:{' '}
                    {ex.participant_status === 'selesai'
                      ? 'Sudah mengerjakan'
                      : ex.participant_status === 'sedang_mengerjakan'
                        ? 'Sedang mengerjakan'
                        : 'Belum mengerjakan'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
