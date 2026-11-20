import React, { useEffect, useState } from 'react';
import { Check, Plus, Save } from 'lucide-react';
import type { AppSettings, ExamStatus, QuestionItem, SubjectItem } from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { LoadingState, useToast } from '../ui/ToastAndModal.tsx';
import { QuestionEditorModal } from './QuestionBank.tsx';

export function ExamBuilder({
  appSettings,
  editingExamId,
  onClearEditing,
  onNavigate,
}: {
  appSettings: AppSettings;
  editingExamId: number | null;
  onClearEditing: () => void;
  onNavigate: (menuId: string) => void;
}) {
  const { showToast } = useToast();
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [bankQuestions, setBankQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState<number>(0);
  const [className, setClassName] = useState(appSettings.classes[0] || '3A');
  const [topic, setTopic] = useState('');
  const [learningObjective, setLearningObjective] = useState('');
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState('45');
  const [maxScore, setMaxScore] = useState('100');
  const [kktp, setKktp] = useState(String(appSettings.default_kktp || 75));
  const [instructions, setInstructions] = useState(
    'Bacalah setiap soal dengan teliti. Kerjakan dengan jujur dan periksa kembali jawaban sebelum menekan tombol Selesai Ujian.'
  );
  const [status, setStatus] = useState<ExamStatus>('terjadwal');
  const [isResultsPublished, setIsResultsPublished] = useState(false);
  const [allowReviewKeys, setAllowReviewKeys] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);

  const [newQuestionModalOpen, setNewQuestionModalOpen] = useState(false);

  const loadInitial = async () => {
    setLoading(true);
    try {
      const [sRes, qRes] = await Promise.all([
        apiFetch<{ subjects: SubjectItem[] }>('/api/admin/subjects'),
        apiFetch<{ questions: QuestionItem[] }>('/api/admin/questions'),
      ]);
      setSubjects(sRes.subjects);
      setBankQuestions(qRes.questions);

      if (editingExamId) {
        const exRes = await apiFetch<{
          exam: Record<string, unknown>;
          questions: Array<{ id: number }>;
        }>(`/api/admin/exams/${editingExamId}`);
        const ex = exRes.exam;
        setTitle(String(ex.title || ''));
        setSubjectId(Number(ex.subject_id));
        setClassName(String(ex.class_name || appSettings.classes[0] || '3A'));
        setTopic(String(ex.topic || ''));
        setLearningObjective(String(ex.learning_objective || ''));
        setExamDate(String(ex.exam_date || new Date().toISOString().slice(0, 10)));
        setStartTime(String(ex.start_time || '07:30'));
        setEndTime(String(ex.end_time || '09:00'));
        setDurationMinutes(String(ex.duration_minutes || 45));
        setMaxScore(String(ex.max_score || 100));
        setKktp(String(ex.kktp || 75));
        setInstructions(String(ex.instructions || ''));
        setStatus((ex.status as ExamStatus) || 'draft');
        setIsResultsPublished(ex.is_results_published === 1);
        setAllowReviewKeys(ex.allow_review_keys === 1);
        setSelectedQuestionIds(exRes.questions.map((q) => q.id));
      } else if (sRes.subjects.length > 0) {
        setSubjectId(sRes.subjects[0].id);
        setKktp(String(sRes.subjects[0].kktp_threshold));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat formulir ulangan.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
  }, [editingExamId]);

  const reloadQuestionsOnly = async (autoSelectId?: number) => {
    const qRes = await apiFetch<{ questions: QuestionItem[] }>('/api/admin/questions');
    setBankQuestions(qRes.questions);
    if (autoSelectId && !selectedQuestionIds.includes(autoSelectId)) {
      setSelectedQuestionIds((prev) => [...prev, autoSelectId]);
    }
  };

  const handleSubjectChange = (newSubId: number) => {
    setSubjectId(newSubId);
    const subj = subjects.find((s) => s.id === newSubId);
    if (subj && !editingExamId) {
      setKktp(String(subj.kktp_threshold));
    }
  };

  const toggleQuestion = (qid: number) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(qid) ? prev.filter((id) => id !== qid) : [...prev, qid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) {
      showToast('Pilih mata pelajaran terlebih dahulu.', 'warning');
      return;
    }
    if (status === 'aktif' && selectedQuestionIds.length === 0) {
      showToast('Pilih minimal 1 soal jika ingin langsung mengaktifkan ulangan.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title,
        subjectId,
        className,
        topic,
        learningObjective,
        examDate,
        startTime,
        endTime,
        durationMinutes: Number(durationMinutes),
        maxScore: Number(maxScore),
        kktp: Number(kktp),
        instructions,
        status,
        isResultsPublished,
        allowReviewKeys,
        questionIds: selectedQuestionIds,
      };

      if (editingExamId) {
        await apiFetch(`/api/admin/exams/${editingExamId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Ulangan harian berhasil diperbarui.', 'success');
        onClearEditing();
      } else {
        await apiFetch('/api/admin/exams', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Ulangan harian berhasil dibuat.', 'success');
      }
      onNavigate('exam-schedule');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan ulangan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Menyiapkan penyusun ulangan..." />;

  const matchingQuestions = bankQuestions.filter((q) => !subjectId || q.subject_id === subjectId);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              {editingExamId ? 'Edit Ulangan Harian' : 'Buat Ulangan Harian Baru'}
            </h2>
            <p className="text-xs text-slate-500">Atur identitas ulangan, jadwal pelaksanaan, KKTP, dan butir soal.</p>
          </div>
          {editingExamId && (
            <button
              type="button"
              onClick={() => {
                onClearEditing();
                onNavigate('exam-schedule');
              }}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
            >
              Batalkan Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Ulangan *</label>
            <input
              type="text"
              required
              placeholder="Contoh: Ulangan Harian 1 - Bilangan Cacah"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran *</label>
            <select
              required
              value={subjectId}
              onChange={(e) => handleSubjectChange(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
            >
              <option value={0}>-- Pilih Mapel --</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas *</label>
            <select
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
            >
              {appSettings.classes.map((c) => (
                <option key={c} value={c}>
                  Kelas {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Materi Pokok</label>
            <input
              type="text"
              placeholder="Contoh: Bab 1 Bilangan"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tujuan Pembelajaran</label>
            <input
              type="text"
              placeholder="Tujuan pembelajaran Kurikulum Merdeka"
              value={learningObjective}
              onChange={(e) => setLearningObjective(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-100">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Mulai</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Selesai</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Durasi (Menit)</label>
            <input
              type="number"
              min={5}
              max={240}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nilai Maksimal</label>
            <input
              type="number"
              min={10}
              max={1000}
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Batas KKTP</label>
            <input
              type="number"
              min={0}
              max={100}
              value={kktp}
              onChange={(e) => setKktp(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Instruksi Pengerjaan (Ramah Siswa)</label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status Ulangan</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ExamStatus)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold focus:border-blue-600 focus:outline-none"
              >
                <option value="draft">Draft (Belum Tayang)</option>
                <option value="terjadwal">Terjadwal</option>
                <option value="aktif">Aktif (Siswa Dapat Mengerjakan)</option>
                <option value="selesai">Selesai / Ditutup</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isResultsPublished}
                onChange={(e) => setIsResultsPublished(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              Publikasikan nilai otomatis (jika tanpa soal uraian)
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allowReviewKeys}
                onChange={(e) => setAllowReviewKeys(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              Izinkan siswa meninjau kunci setelah dipublikasikan
            </label>
          </div>
        </div>
      </div>

      {/* Question Selection & Direct Creation */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              Pilih Soal dari Bank Soal ({selectedQuestionIds.length} soal dipilih)
            </h3>
            <p className="text-xs text-slate-500">
              Centang soal yang sudah ada atau buat soal baru langsung untuk ulangan ini.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNewQuestionModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Buat Soal Baru untuk Ulangan Ini
          </button>
        </div>

        {matchingQuestions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              Belum ada soal pada Bank Soal untuk mata pelajaran yang dipilih.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Klik tombol &quot;Buat Soal Baru untuk Ulangan Ini&quot; di atas untuk langsung membuat soal.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {matchingQuestions.map((q) => {
              const checked = selectedQuestionIds.includes(q.id);
              return (
                <label
                  key={q.id}
                  className={`flex items-start gap-3 p-3.5 cursor-pointer transition-colors ${
                    checked ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      checked ? 'bg-blue-700 border-blue-700 text-white' : 'border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleQuestion(q.id)}
                      className="sr-only"
                    />
                    {checked && <Check className="w-3.5 h-3.5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-semibold text-blue-700 uppercase">{q.question_type.replace('_', ' ')}</span>
                      <span>·</span>
                      <span>{q.difficulty}</span>
                      <span>·</span>
                      <span className="tabular-nums">Bobot {q.weight}</span>
                      {q.topic && (
                        <>
                          <span>·</span>
                          <span>{q.topic}</span>
                        </>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-900 line-clamp-2">{q.question_text}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            onClearEditing();
            onNavigate('exam-schedule');
          }}
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Menyimpan...' : editingExamId ? 'Simpan Perubahan Ulangan' : 'Simpan Ulangan Harian'}
        </button>
      </div>

      <QuestionEditorModal
        open={newQuestionModalOpen}
        subjects={subjects}
        defaultSubjectId={subjectId}
        onClose={() => setNewQuestionModalOpen(false)}
        onSaved={(newQId) => reloadQuestionsOnly(newQId)}
      />
    </form>
  );
}
