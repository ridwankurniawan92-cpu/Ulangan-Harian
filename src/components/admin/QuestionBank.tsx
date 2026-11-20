import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Edit3,
  ImagePlus,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AnswerOption,
  DifficultyLevel,
  MatchMode,
  QuestionItem,
  QuestionType,
  SubjectItem,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { ConfirmModal, EmptyState, LoadingState, useToast } from '../ui/ToastAndModal.tsx';

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  pg_4: 'Pilihan Ganda (A–D)',
  pg_3: 'Pilihan Ganda (A–C)',
  isian_singkat: 'Isian Singkat',
  uraian: 'Uraian',
};

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  mudah: 'Mudah',
  sedang: 'Sedang',
  sulit: 'Sulit',
};

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

export function QuestionEditorModal({
  open,
  subjects,
  initialQuestion,
  defaultSubjectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  subjects: SubjectItem[];
  initialQuestion?: QuestionItem | null;
  defaultSubjectId?: number;
  onClose: () => void;
  onSaved: (createdOrUpdatedId: number) => void;
}) {
  const { showToast } = useToast();
  const [subjectId, setSubjectId] = useState<number>(defaultSubjectId || subjects[0]?.id || 0);
  const [questionType, setQuestionType] = useState<QuestionType>('pg_4');
  const [questionText, setQuestionText] = useState('');
  const [questionImage, setQuestionImage] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [learningObjective, setLearningObjective] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('sedang');
  const [weight, setWeight] = useState('1');
  const [correctAnswerText, setCorrectAnswerText] = useState('');
  const [matchMode, setMatchMode] = useState<MatchMode>('case_insensitive');
  const [options, setOptions] = useState<AnswerOption[]>([
    { option_label: 'A', option_text: '', option_image: null, is_correct: true },
    { option_label: 'B', option_text: '', option_image: null, is_correct: false },
    { option_label: 'C', option_text: '', option_image: null, is_correct: false },
    { option_label: 'D', option_text: '', option_image: null, is_correct: false },
  ]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialQuestion) {
      setSubjectId(initialQuestion.subject_id);
      setQuestionType(initialQuestion.question_type);
      setQuestionText(initialQuestion.question_text);
      setQuestionImage(initialQuestion.question_image);
      setTopic(initialQuestion.topic || '');
      setLearningObjective(initialQuestion.learning_objective || '');
      setDifficulty(initialQuestion.difficulty || 'sedang');
      setWeight(String(initialQuestion.weight || 1));
      setCorrectAnswerText(initialQuestion.correct_answer_text || '');
      setMatchMode(initialQuestion.match_mode || 'case_insensitive');

      const labels = initialQuestion.question_type === 'pg_3' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
      const mapped = labels.map((lbl, idx) => {
        const found = initialQuestion.options?.find((o) => o.option_label === lbl);
        return (
          found || {
            option_label: lbl,
            option_text: '',
            option_image: null,
            is_correct: idx === 0,
          }
        );
      });
      setOptions(mapped);
    } else {
      setSubjectId(defaultSubjectId || subjects[0]?.id || 0);
      setQuestionType('pg_4');
      setQuestionText('');
      setQuestionImage(null);
      setTopic('');
      setLearningObjective('');
      setDifficulty('sedang');
      setWeight('1');
      setCorrectAnswerText('');
      setMatchMode('case_insensitive');
      setOptions([
        { option_label: 'A', option_text: '', option_image: null, is_correct: true },
        { option_label: 'B', option_text: '', option_image: null, is_correct: false },
        { option_label: 'C', option_text: '', option_image: null, is_correct: false },
        { option_label: 'D', option_text: '', option_image: null, is_correct: false },
      ]);
    }
  }, [open, initialQuestion, defaultSubjectId, subjects]);

  const handleQuestionTypeChange = (nextType: QuestionType) => {
    setQuestionType(nextType);
    if (nextType === 'pg_3') {
      setOptions((prev) => {
        const sliced = prev.slice(0, 3);
        if (!sliced.some((o) => o.is_correct)) sliced[0].is_correct = true;
        return sliced;
      });
    } else if (nextType === 'pg_4') {
      setOptions((prev) => {
        if (prev.length >= 4) return prev.slice(0, 4);
        return [...prev, { option_label: 'D', option_text: '', option_image: null, is_correct: false }];
      });
    }
  };

  const handleImageUpload = async (file: File, onDone: (url: string) => void) => {
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await apiFetch<{ url: string }>('/api/upload', {
        method: 'POST',
        body: JSON.stringify({ dataUrl, fileName: file.name }),
      });
      onDone(res.url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengunggah gambar.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) {
      showToast('Silakan pilih mata pelajaran terlebih dahulu.', 'warning');
      return;
    }
    if ((questionType === 'pg_4' || questionType === 'pg_3') && !options.some((o) => o.is_correct)) {
      showToast('Tentukan satu pilihan jawaban yang benar.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        subjectId,
        questionType,
        questionText,
        questionImage,
        correctAnswerText: questionType === 'isian_singkat' || questionType === 'uraian' ? correctAnswerText : null,
        matchMode,
        weight: Number(weight || 1),
        topic,
        learningObjective,
        difficulty,
        options: questionType === 'pg_4' || questionType === 'pg_3' ? options : [],
      };

      let savedId = initialQuestion?.id || 0;
      if (initialQuestion) {
        await apiFetch(`/api/admin/questions/${initialQuestion.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Soal berhasil diperbarui.', 'success');
      } else {
        const res = await apiFetch<{ id: number }>('/api/admin/questions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        savedId = res.id;
        showToast('Soal berhasil disimpan ke Bank Soal.', 'success');
      }
      onSaved(savedId);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan soal.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl my-6 space-y-5 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-display text-lg font-bold text-slate-900">
            {initialQuestion ? 'Edit Soal' : 'Tambah Soal Baru'}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran *</label>
            <select
              required
              value={subjectId}
              onChange={(e) => setSubjectId(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Soal *</label>
            <select
              value={questionType}
              onChange={(e) => handleQuestionTypeChange(e.target.value as QuestionType)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            >
              <option value="pg_4">Pilihan Ganda A, B, C, D</option>
              <option value="pg_3">Pilihan Ganda A, B, C</option>
              <option value="isian_singkat">Isian Singkat</option>
              <option value="uraian">Uraian</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kesulitan</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
              >
                <option value="mudah">Mudah</option>
                <option value="sedang">Sedang</option>
                <option value="sulit">Sulit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bobot Nilai</label>
              <input
                type="number"
                min={1}
                step="0.5"
                required
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Materi / Topik</label>
            <input
              type="text"
              placeholder="Contoh: Pecahan Sederhana"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tujuan Pembelajaran</label>
            <input
              type="text"
              placeholder="Contoh: Siswa mampu membandingkan pecahan"
              value={learningObjective}
              onChange={(e) => setLearningObjective(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Pertanyaan / Teks Soal *</label>
          <textarea
            rows={3}
            required
            placeholder="Tuliskan pertanyaan dengan bahasa yang jelas untuk siswa kelas 3 SD..."
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
          />

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
              <ImagePlus className="w-4 h-4 text-blue-700" />
              <span>{uploading ? 'Mengunggah...' : 'Tambah Gambar Soal'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, (url) => setQuestionImage(url));
                  e.target.value = '';
                }}
              />
            </label>
            {questionImage && (
              <div className="flex items-center gap-2">
                <img
                  src={questionImage}
                  alt="Lampiran soal"
                  className="h-14 w-auto rounded-lg border border-slate-200 object-contain"
                />
                <button
                  type="button"
                  onClick={() => setQuestionImage(null)}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  Hapus Gambar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Answer Options */}
        {(questionType === 'pg_4' || questionType === 'pg_3') && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">Pilihan Jawaban & Kunci Benar</label>
              <span className="text-xs text-slate-500">Klik tombol lingkaran untuk menandai jawaban benar</span>
            </div>
            <div className="space-y-2.5">
              {options.map((opt, idx) => (
                <div
                  key={opt.option_label}
                  className={`rounded-xl border p-3 transition-colors ${
                    opt.is_correct ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setOptions((prev) =>
                          prev.map((o, i) => ({
                            ...o,
                            is_correct: i === idx,
                          }))
                        )
                      }
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold border transition-colors ${
                        opt.is_correct
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-blue-500'
                      }`}
                      title="Tandai sebagai kunci jawaban benar"
                    >
                      {opt.option_label}
                    </button>
                    <input
                      type="text"
                      placeholder={`Teks pilihan ${opt.option_label}`}
                      value={opt.option_text}
                      onChange={(e) =>
                        setOptions((prev) =>
                          prev.map((o, i) => (i === idx ? { ...o, option_text: e.target.value } : o))
                        )
                      }
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
                    />
                    <label className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer shrink-0">
                      <ImagePlus className="w-4 h-4 inline mr-1" />
                      Gambar
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleImageUpload(file, (url) =>
                              setOptions((prev) =>
                                prev.map((o, i) => (i === idx ? { ...o, option_image: url } : o))
                              )
                            );
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  {opt.option_image && (
                    <div className="mt-2 pl-11 flex items-center gap-2">
                      <img
                        src={opt.option_image}
                        alt={`Gambar pilihan ${opt.option_label}`}
                        className="h-14 rounded-lg border border-slate-200 object-contain"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setOptions((prev) =>
                            prev.map((o, i) => (i === idx ? { ...o, option_image: null } : o))
                          )
                        }
                        className="text-xs text-red-600 hover:underline"
                      >
                        Hapus
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {questionType === 'isian_singkat' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kunci Jawaban (pisahkan dengan | jika lebih dari satu)
              </label>
              <input
                type="text"
                placeholder="Contoh: 24|dua puluh empat"
                value={correctAnswerText}
                onChange={(e) => setCorrectAnswerText(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Metode Pencocokan Otomatis</label>
              <select
                value={matchMode}
                onChange={(e) => setMatchMode(e.target.value as MatchMode)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
              >
                <option value="case_insensitive">Sama Persis (Abaikan Huruf Besar/Kecil)</option>
                <option value="exact">Sama Persis (Peka Huruf Besar/Kecil)</option>
                <option value="contains">Mengandung Kata Kunci</option>
              </select>
            </div>
          </div>
        )}

        {questionType === 'uraian' && (
          <div className="border-t border-slate-100 pt-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Panduan / Rubrik Kunci Jawaban (Untuk Acuan Koreksi Guru)
            </label>
            <textarea
              rows={2}
              placeholder="Tuliskan poin jawaban yang diharapkan (tidak ditampilkan ke siswa saat ujian)..."
              value={correctAnswerText}
              onChange={(e) => setCorrectAnswerText(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving || uploading}
            className="rounded-xl bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Soal'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function QuestionBank({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { showToast } = useToast();
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [subjectFilter, setSubjectFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuestionItem | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [qRes, sRes] = await Promise.all([
        apiFetch<{ questions: QuestionItem[] }>('/api/admin/questions'),
        apiFetch<{ subjects: SubjectItem[] }>('/api/admin/subjects'),
      ]);
      setQuestions(qRes.questions);
      setSubjects(sRes.subjects);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat bank soal.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/admin/questions/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Soal berhasil dihapus dari Bank Soal.', 'success');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus soal.', 'error');
    }
  };

  const filtered = questions.filter((q) => {
    const mSub = subjectFilter === 'all' || String(q.subject_id) === subjectFilter;
    const mType = typeFilter === 'all' || q.question_type === typeFilter;
    const s = search.toLowerCase();
    const mSearch =
      !s || q.question_text.toLowerCase().includes(s) || q.topic.toLowerCase().includes(s);
    return mSub && mType && mSearch;
  });

  if (loading) return <LoadingState label="Memuat Bank Soal..." />;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari teks soal atau materi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="all">Semua Mata Pelajaran</option>
            {subjects.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="all">Semua Jenis Soal</option>
            <option value="pg_4">PG A–D</option>
            <option value="pg_3">PG A–C</option>
            <option value="isian_singkat">Isian Singkat</option>
            <option value="uraian">Uraian</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            if (subjects.length === 0) {
              showToast('Tambahkan Mata Pelajaran terlebih dahulu sebelum membuat soal.', 'warning');
              onNavigate('subjects');
              return;
            }
            setEditing(null);
            setEditorOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Tambah Soal Baru
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-6 h-6" />}
          title={questions.length === 0 ? 'Bank Soal Masih Kosong' : 'Tidak ada soal yang sesuai filter'}
          description={
            questions.length === 0
              ? 'Belum ada soal contoh yang dibuat otomatis. Silakan tambahkan butir soal secara manual sesuai materi Kurikulum Merdeka Kelas III.'
              : 'Coba ubah filter mata pelajaran, jenis soal, atau kata kunci pencarian.'
          }
          action={
            questions.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  if (subjects.length === 0) onNavigate('subjects');
                  else {
                    setEditing(null);
                    setEditorOpen(true);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                <Plus className="w-4 h-4" />
                {subjects.length === 0 ? 'Buat Mata Pelajaran Dulu' : 'Buat Soal Pertama'}
              </button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((q, idx) => (
            <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-bold text-slate-800 tabular-nums">#{idx + 1}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-blue-700">{q.subject_name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{QUESTION_TYPE_LABELS[q.question_type]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{DIFFICULTY_LABELS[q.difficulty]}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums font-medium">Bobot {q.weight}</span>
                    {q.topic && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Materi: {q.topic}</span>
                      </>
                    )}
                  </div>

                  <p className="text-sm sm:text-base font-medium text-slate-900 leading-relaxed whitespace-pre-line">
                    {q.question_text}
                  </p>

                  {q.question_image && (
                    <img
                      src={q.question_image}
                      alt="Gambar soal"
                      className="max-h-44 rounded-xl border border-slate-200 object-contain"
                    />
                  )}

                  {(q.question_type === 'pg_4' || q.question_type === 'pg_3') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {q.options.map((opt) => (
                        <div
                          key={opt.option_label}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                            opt.is_correct
                              ? 'border-emerald-300 bg-emerald-50/70 text-emerald-900 font-semibold'
                              : 'border-slate-200 bg-slate-50/60 text-slate-700'
                          }`}
                        >
                          <span className="font-bold shrink-0">{opt.option_label}.</span>
                          <span className="flex-1">{opt.option_text}</span>
                          {opt.option_image && (
                            <img src={opt.option_image} alt={opt.option_label} className="h-8 rounded object-contain" />
                          )}
                          {Boolean(opt.is_correct) && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                        </div>
                      ))}
                    </div>
                  )}

                  {q.question_type === 'isian_singkat' && (
                    <p className="text-xs text-emerald-700 font-semibold">
                      Kunci Jawaban: {q.correct_answer_text || '(Penilaian manual)'}
                    </p>
                  )}

                  {q.question_type === 'uraian' && q.correct_answer_text && (
                    <p className="text-xs text-slate-500">Acuan Rubrik: {q.correct_answer_text}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(q);
                      setEditorOpen(true);
                    }}
                    className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                    title="Edit soal"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(q)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-red-50 hover:text-red-600"
                    title="Hapus soal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <QuestionEditorModal
        open={editorOpen}
        subjects={subjects}
        initialQuestion={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={() => loadData()}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title="Hapus Soal dari Bank Soal"
        message="Apakah Anda yakin ingin menghapus soal ini? Soal juga akan terlepas dari ulangan yang belum dikerjakan."
        confirmLabel="Ya, Hapus"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
