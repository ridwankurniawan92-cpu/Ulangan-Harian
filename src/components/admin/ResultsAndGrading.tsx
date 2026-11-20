import React, { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Eye, Globe, Lock, Save, X } from 'lucide-react';
import type { ExamItem } from '../../../shared/types.ts';
import { apiFetch, formatDateTimeId } from '../../lib/api.ts';
import { EmptyState, LoadingState, useToast } from '../ui/ToastAndModal.tsx';

interface ExamResultRow {
  id: number;
  participant_id: number;
  student_id: number;
  nis: string;
  student_name: string;
  class_name: string;
  total_score: number;
  max_possible_score: number;
  percentage: number;
  correct_count: number;
  wrong_count: number;
  unanswered_count: number;
  kktp_threshold: number;
  is_passed: number;
  is_published: number;
  teacher_note: string;
  started_at: string | null;
  finished_at: string | null;
}

interface NotTakenRow {
  id: number;
  nis: string;
  full_name: string;
  class_name: string;
  participant_status: string;
}

interface GradingItem {
  question_id: number;
  question_type: 'pg_4' | 'pg_3' | 'isian_singkat' | 'uraian';
  question_text: string;
  question_image: string | null;
  correct_answer_text: string | null;
  effective_weight: number;
  selected_option: string | null;
  answer_text: string | null;
  is_correct: number | null;
  score_awarded: number;
  teacher_feedback: string | null;
  options: Array<{ option_label: string; option_text: string; is_correct: number }>;
}

export function ResultsAndGrading() {
  const { showToast } = useToast();
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number>(0);
  const [selectedExam, setSelectedExam] = useState<ExamItem | null>(null);
  const [results, setResults] = useState<ExamResultRow[]>([]);
  const [notTaken, setNotTaken] = useState<NotTakenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);

  // Grading modal state
  const [gradingParticipantId, setGradingParticipantId] = useState<number | null>(null);
  const [gradingMeta, setGradingMeta] = useState<Record<string, unknown> | null>(null);
  const [gradingItems, setGradingItems] = useState<GradingItem[]>([]);
  const [manualScores, setManualScores] = useState<Record<number, { score: string; feedback: string }>>({});
  const [teacherNote, setTeacherNote] = useState('');
  const [savingGrade, setSavingGrade] = useState(false);

  const loadExams = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ exams: ExamItem[] }>('/api/admin/exams');
      setExams(res.exams);
      if (res.exams.length > 0 && !selectedExamId) {
        setSelectedExamId(res.exams[0].id);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat daftar ulangan.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadExamResults = async (examId: number) => {
    if (!examId) return;
    setResultsLoading(true);
    try {
      const res = await apiFetch<{ exam: ExamItem; results: ExamResultRow[]; notTaken: NotTakenRow[] }>(
        `/api/admin/exams/${examId}/results`
      );
      setSelectedExam(res.exam);
      setResults(res.results);
      setNotTaken(res.notTaken);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat hasil ulangan.', 'error');
    } finally {
      setResultsLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  useEffect(() => {
    if (selectedExamId) loadExamResults(selectedExamId);
  }, [selectedExamId]);

  const handleTogglePublish = async (publish: boolean) => {
    if (!selectedExamId) return;
    try {
      await apiFetch(`/api/admin/exams/${selectedExamId}/publish`, {
        method: 'PATCH',
        body: JSON.stringify({ published: publish }),
      });
      showToast(
        publish
          ? 'Nilai ulangan dipublikasikan! Siswa dan orang tua kini dapat melihat hasil.'
          : 'Publikasi nilai ditarik kembali.',
        'success'
      );
      await loadExamResults(selectedExamId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah status publikasi.', 'error');
    }
  };

  const openGradingModal = async (participantId: number) => {
    setGradingParticipantId(participantId);
    try {
      const res = await apiFetch<{ participant: Record<string, unknown>; items: GradingItem[] }>(
        `/api/admin/results/${participantId}/detail`
      );
      setGradingMeta(res.participant);
      setGradingItems(res.items);
      setTeacherNote(String(res.participant.teacher_note || ''));
      const scoreMap: Record<number, { score: string; feedback: string }> = {};
      for (const item of res.items) {
        scoreMap[item.question_id] = {
          score: String(item.score_awarded ?? 0),
          feedback: item.teacher_feedback || '',
        };
      }
      setManualScores(scoreMap);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuka detail jawaban.', 'error');
      setGradingParticipantId(null);
    }
  };

  const handleSaveGrade = async (publishNow: boolean) => {
    if (!gradingParticipantId) return;
    setSavingGrade(true);
    try {
      const questionScores = gradingItems
        .filter((it) => it.question_type === 'uraian' || it.question_type === 'isian_singkat')
        .map((it) => ({
          questionId: it.question_id,
          scoreAwarded: Number(manualScores[it.question_id]?.score ?? 0),
          maxWeight: it.effective_weight,
          feedback: manualScores[it.question_id]?.feedback ?? '',
        }));

      await apiFetch(`/api/admin/results/${gradingParticipantId}/grade`, {
        method: 'POST',
        body: JSON.stringify({ questionScores, teacherNote, publishNow }),
      });
      showToast(publishNow ? 'Nilai disimpan dan dipublikasikan.' : 'Koreksi nilai dan catatan guru disimpan.', 'success');
      setGradingParticipantId(null);
      await loadExamResults(selectedExamId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan koreksi.', 'error');
    } finally {
      setSavingGrade(false);
    }
  };

  if (loading) return <LoadingState label="Memuat hasil ulangan..." />;

  if (exams.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="w-6 h-6" />}
        title="Belum ada ulangan harian"
        description="Buat dan aktifkan ulangan harian terlebih dahulu agar hasil pengerjaan peserta didik muncul di sini."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Selector & Publish Controls */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex-1 max-w-xl">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Pilih Ulangan Harian</label>
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
          >
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title} — {ex.subject_name} (Kelas {ex.class_name})
              </option>
            ))}
          </select>
        </div>

        {selectedExam && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <span className="text-xs text-slate-600 mr-2">
              Status Publikasi:{' '}
              <strong className={selectedExam.is_results_published === 1 ? 'text-emerald-700' : 'text-amber-700'}>
                {selectedExam.is_results_published === 1 ? 'Sudah Dipublikasikan' : 'Belum Dipublikasikan'}
              </strong>
            </span>
            {selectedExam.is_results_published === 1 ? (
              <button
                type="button"
                onClick={() => handleTogglePublish(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Lock className="w-3.5 h-3.5" />
                Tarik Publikasi
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleTogglePublish(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Globe className="w-3.5 h-3.5" />
                Publikasikan Nilai ke Siswa &amp; Ortu
              </button>
            )}
          </div>
        )}
      </div>

      {resultsLoading ? (
        <LoadingState label="Memuat hasil peserta..." />
      ) : (
        <div className="space-y-6">
          {/* Submitted Table */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Daftar Nilai Peserta Didik ({results.length} sudah mengumpulkan)
              </h3>
              <span className="text-xs text-slate-500 tabular-nums">KKTP: {selectedExam?.kktp ?? 75}</span>
            </div>

            {results.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Belum ada peserta didik yang mengumpulkan ulangan ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">NIS</th>
                      <th className="px-4 py-3">Nama Peserta Didik</th>
                      <th className="px-4 py-3">Benar / Salah / Kosong</th>
                      <th className="px-4 py-3">Nilai Akhir</th>
                      <th className="px-4 py-3">Status KKTP</th>
                      <th className="px-4 py-3">Publikasi</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">{r.nis}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{r.student_name}</div>
                          <div className="text-[11px] text-slate-400">Selesai: {formatDateTimeId(r.finished_at)}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700">
                          {r.correct_count} / {r.wrong_count} / {r.unanswered_count}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm font-bold text-slate-900 tabular-nums">
                          {r.total_score} <span className="text-xs font-normal text-slate-400">({r.percentage}%)</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs font-bold ${r.is_passed === 1 ? 'text-emerald-700' : 'text-red-600'}`}>
                            {r.is_passed === 1 ? 'Tuntas' : 'Belum Tuntas'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">
                          {r.is_published === 1 ? (
                            <span className="text-emerald-700 font-semibold">Terpublikasi</span>
                          ) : (
                            <span className="text-slate-500">Tertunda</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openGradingModal(r.participant_id)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Koreksi &amp; Catatan
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Not Taken List */}
          {notTaken.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-display text-sm font-bold text-slate-900 mb-3">
                Peserta Didik Belum Mengumpulkan ({notTaken.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {notTaken.map((s) => (
                  <div key={s.id} className="rounded-xl border border-slate-200 px-3.5 py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">{s.full_name}</p>
                      <p className="text-slate-500 font-mono">NIS {s.nis}</p>
                    </div>
                    <span className="text-amber-700 font-semibold">
                      {s.participant_status === 'sedang_mengerjakan' ? 'Sedang Mengerjakan' : 'Belum Mulai'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Grading & Teacher Note Modal */}
      {gradingParticipantId && gradingMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl my-6 max-h-[92vh] flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Koreksi &amp; Feedback: {String(gradingMeta.student_name)}
                </h3>
                <p className="text-xs text-slate-500">
                  {String(gradingMeta.exam_title)} · Nilai Saat Ini:{' '}
                  <strong className="font-mono text-slate-900 tabular-nums">{String(gradingMeta.total_score ?? 0)}</strong>{' '}
                  (KKTP {String(gradingMeta.kktp)})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGradingParticipantId(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              {gradingItems.map((it, idx) => (
                <div key={it.question_id} className="rounded-xl border border-slate-200 p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-700">
                      Soal #{idx + 1} · {it.question_type.toUpperCase()} (Bobot Maks: {it.effective_weight})
                    </span>
                    {it.question_type !== 'uraian' && (
                      <span className={`font-bold ${it.is_correct === 1 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {it.is_correct === 1 ? 'Benar' : 'Salah / Kosong'} · Skor {it.score_awarded}
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-medium text-slate-900">{it.question_text}</p>
                  {it.question_image && (
                    <img src={it.question_image} alt="Lampiran" className="max-h-36 rounded-lg border border-slate-200" />
                  )}

                  {(it.question_type === 'pg_4' || it.question_type === 'pg_3') && (
                    <div className="text-xs space-y-1 bg-slate-50 rounded-lg p-3">
                      <p>
                        Jawaban Siswa:{' '}
                        <strong className="font-mono">{it.selected_option || '(Tidak dijawab)'}</strong>
                      </p>
                      <p className="text-emerald-700">
                        Kunci Jawaban:{' '}
                        <strong className="font-mono">
                          {it.options.find((o) => o.is_correct === 1)?.option_label || '-'}
                        </strong>
                      </p>
                    </div>
                  )}

                  {(it.question_type === 'isian_singkat' || it.question_type === 'uraian') && (
                    <div className="space-y-3 bg-slate-50 rounded-xl p-3.5">
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Jawaban Peserta Didik:</p>
                        <p className="mt-1 text-sm text-slate-900 whitespace-pre-line">
                          {it.answer_text || <span className="italic text-slate-400">(Tidak dijawab)</span>}
                        </p>
                      </div>
                      {it.correct_answer_text && (
                        <p className="text-xs text-emerald-800">
                          Acuan / Kunci: <strong>{it.correct_answer_text}</strong>
                        </p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Skor (0 – {it.effective_weight})
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={it.effective_weight}
                            step="0.5"
                            value={manualScores[it.question_id]?.score ?? '0'}
                            onChange={(e) =>
                              setManualScores((prev) => ({
                                ...prev,
                                [it.question_id]: {
                                  ...(prev[it.question_id] || { feedback: '' }),
                                  score: e.target.value,
                                },
                              }))
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono tabular-nums"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Catatan Butir Soal (Opsional)
                          </label>
                          <input
                            type="text"
                            placeholder="Catatan khusus untuk jawaban ini..."
                            value={manualScores[it.question_id]?.feedback ?? ''}
                            onChange={(e) =>
                              setManualScores((prev) => ({
                                ...prev,
                                [it.question_id]: {
                                  ...(prev[it.question_id] || { score: '0' }),
                                  feedback: e.target.value,
                                },
                              }))
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Catatan Guru untuk Siswa &amp; Orang Tua
                </label>
                <textarea
                  rows={2}
                  placeholder="Tuliskan apresiasi atau saran belajar untuk anak (akan tampil di dashboard siswa & orang tua setelah nilai dipublikasikan)..."
                  value={teacherNote}
                  onChange={(e) => setTeacherNote(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2.5 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setGradingParticipantId(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={savingGrade}
                onClick={() => handleSaveGrade(false)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" />
                Simpan Koreksi
              </button>
              <button
                type="button"
                disabled={savingGrade}
                onClick={() => handleSaveGrade(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Simpan &amp; Publikasikan Nilai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
