import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flag,
  Save,
  Send,
} from 'lucide-react';
import { apiFetch, getOrCreateExamDeviceToken } from '../../lib/api.ts';
import { ConfirmModal, LoadingState, useToast } from '../ui/ToastAndModal.tsx';

interface RunnerQuestion {
  id: number;
  question_type: 'pg_4' | 'pg_3' | 'isian_singkat' | 'uraian';
  question_text: string;
  question_image: string | null;
  sort_order: number;
  options: Array<{
    option_label: string;
    option_text: string;
    option_image: string | null;
  }>;
}

interface AnswerDraft {
  selectedOption: string | null;
  answerText: string;
  isFlagged: boolean;
}

export function ExamRunner({
  examId,
  studentName,
  onExit,
  onCompleted,
}: {
  examId: number;
  studentName: string;
  onExit: () => void;
  onCompleted: () => void;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [examMeta, setExamMeta] = useState<{
    id: number;
    title: string;
    subject_name: string;
    duration_minutes: number;
    instructions: string;
    exam_date: string | null;
    start_time: string | null;
    end_time: string | null;
  } | null>(null);

  const [deviceToken, setDeviceToken] = useState('');
  const [questions, setQuestions] = useState<RunnerQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, AnswerDraft>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const warned5Min = useRef(false);
  const warned1Min = useRef(false);
  const autoSubmittedRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    const startExam = async () => {
      setLoading(true);
      setError('');
      try {
        const localToken = getOrCreateExamDeviceToken(examId);
        const res = await apiFetch<{
          exam: NonNullable<typeof examMeta>;
          deviceToken: string;
          remainingSeconds: number;
          questions: RunnerQuestion[];
          savedAnswers: Array<{
            question_id: number;
            selected_option: string | null;
            answer_text: string | null;
            is_flagged: number;
          }>;
        }>(`/api/student/exams/${examId}/start`, {
          method: 'POST',
          body: JSON.stringify({ deviceToken: localToken }),
        });

        setExamMeta(res.exam);
        setDeviceToken(res.deviceToken);
        localStorage.setItem(`uh_k3_device_token_${examId}`, res.deviceToken);
        setQuestions(res.questions);
        setRemainingSeconds(res.remainingSeconds);

        const initAnswers: Record<number, AnswerDraft> = {};
        for (const q of res.questions) {
          initAnswers[q.id] = { selectedOption: null, answerText: '', isFlagged: false };
        }
        for (const sa of res.savedAnswers) {
          initAnswers[sa.question_id] = {
            selectedOption: sa.selected_option,
            answerText: sa.answer_text || '',
            isFlagged: sa.is_flagged === 1,
          };
        }
        setAnswers(initAnswers);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memulai ulangan.');
      } finally {
        setLoading(false);
      }
    };
    startExam();
  }, [examId]);

  const buildPayloadAnswers = useCallback((map: Record<number, AnswerDraft>) => {
    return Object.entries(map).map(([qid, val]) => ({
      questionId: Number(qid),
      selectedOption: val.selectedOption,
      answerText: val.answerText,
      isFlagged: val.isFlagged,
    }));
  }, []);

  const syncAutosave = useCallback(
    async (overrideMap?: Record<number, AnswerDraft>, silent = true) => {
      if (!deviceToken || questions.length === 0) return;
      setSavingStatus('saving');
      try {
        const res = await apiFetch<{ remainingSeconds: number }>(`/api/student/exams/${examId}/autosave`, {
          method: 'POST',
          body: JSON.stringify({
            deviceToken,
            answers: buildPayloadAnswers(overrideMap || answersRef.current),
          }),
        });
        if (typeof res.remainingSeconds === 'number') {
          setRemainingSeconds(res.remainingSeconds);
        }
        setSavingStatus('saved');
        if (!silent) {
          showToast('Jawaban berhasil disimpan.', 'success');
        }
      } catch (err) {
        setSavingStatus('idle');
        if (!silent) {
          showToast(err instanceof Error ? err.message : 'Gagal menyimpan jawaban.', 'error');
        }
      }
    },
    [deviceToken, examId, questions.length, buildPayloadAnswers, showToast]
  );

  const handleFinalSubmit = useCallback(
    async (isAuto = false) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        await apiFetch(`/api/student/exams/${examId}/submit`, {
          method: 'POST',
          body: JSON.stringify({
            deviceToken,
            answers: buildPayloadAnswers(answersRef.current),
            autoSubmitted: isAuto,
          }),
        });
        showToast(
          isAuto ? 'Waktu habis! Ujian otomatis dikumpulkan.' : 'Ulangan berhasil dikumpulkan! Hebat!',
          'success'
        );
        onCompleted();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Gagal mengumpulkan ujian.', 'error');
        setSubmitting(false);
      }
    },
    [examId, deviceToken, buildPayloadAnswers, submitting, showToast, onCompleted]
  );

  // Countdown Timer
  useEffect(() => {
    if (loading || error || questions.length === 0) return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            handleFinalSubmit(true);
          }
          return 0;
        }
        if (prev === 300 && !warned5Min.current) {
          warned5Min.current = true;
          showToast('Perhatian: Waktu ujian tersisa 5 menit lagi.', 'warning');
        }
        if (prev === 60 && !warned1Min.current) {
          warned1Min.current = true;
          showToast('Segera periksa jawaban! Waktu tersisa 1 menit lagi.', 'warning');
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, error, questions.length, handleFinalSubmit, showToast]);

  // Periodic Autosave every 15 seconds
  useEffect(() => {
    if (loading || error || questions.length === 0) return;
    const timer = setInterval(() => {
      syncAutosave(undefined, true);
    }, 15000);
    return () => clearInterval(timer);
  }, [loading, error, questions.length, syncAutosave]);

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <LoadingState label="Menyiapkan lembar soal ulangan..." />
      </div>
    );
  }

  if (error || !examMeta) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900">Tidak Dapat Membuka Ujian</h2>
          <p className="text-sm text-slate-600 leading-relaxed">{error || 'Ujian tidak tersedia.'}</p>
          <button
            type="button"
            onClick={onExit}
            className="w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Kembali ke Dashboard Siswa
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIdx];
  const currentDraft = currentQuestion
    ? answers[currentQuestion.id] || { selectedOption: null, answerText: '', isFlagged: false }
    : { selectedOption: null, answerText: '', isFlagged: false };

  const isQuestionAnswered = (q: RunnerQuestion) => {
    const d = answers[q.id];
    if (!d) return false;
    if (q.question_type === 'pg_4' || q.question_type === 'pg_3') return Boolean(d.selectedOption);
    return d.answerText.trim().length > 0;
  };

  const answeredCount = questions.filter(isQuestionAnswered).length;
  const flaggedCount = questions.filter((q) => answers[q.id]?.isFlagged).length;
  const unansweredCount = questions.length - answeredCount;

  const updateCurrentDraft = (patch: Partial<AnswerDraft>, triggerImmediateSave = false) => {
    if (!currentQuestion) return;
    const nextMap = {
      ...answers,
      [currentQuestion.id]: { ...currentDraft, ...patch },
    };
    setAnswers(nextMap);
    if (triggerImmediateSave) {
      syncAutosave(nextMap, true);
    }
  };

  const goToQuestion = (nextIdx: number) => {
    syncAutosave(answers, true);
    setCurrentIdx(nextIdx);
  };

  const isTimeCritical = remainingSeconds <= 300;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Exam Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 sm:px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">{examMeta.title}</h1>
            <p className="text-xs text-slate-500 truncate">
              {studentName} · {examMeta.subject_name} · {examMeta.duration_minutes} menit
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-500">
              {savingStatus === 'saving'
                ? 'Menyimpan...'
                : savingStatus === 'saved'
                  ? 'Tersimpan otomatis'
                  : ''}
            </span>
            <div
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 font-mono text-sm sm:text-base font-bold tabular-nums ${
                isTimeCritical
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-blue-200 bg-blue-50 text-blue-800'
              }`}
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span>{formatTimer(remainingSeconds)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Question Area (3 cols) */}
        <div className="lg:col-span-3 space-y-5">
          {currentQuestion && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 px-3 items-center justify-center rounded-xl bg-blue-700 text-sm font-bold text-white tabular-nums">
                    Soal {currentIdx + 1} dari {questions.length}
                  </span>
                  {currentDraft.isFlagged && (
                    <span className="text-xs font-bold text-amber-700">Ditandai Ragu-ragu</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => updateCurrentDraft({ isFlagged: !currentDraft.isFlagged }, true)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors ${
                    currentDraft.isFlagged
                      ? 'border-amber-400 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Flag className="w-4 h-4" />
                  {currentDraft.isFlagged ? 'Hapus Tanda' : 'Tandai Soal'}
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-base sm:text-lg font-medium text-slate-900 leading-relaxed whitespace-pre-line">
                  {currentQuestion.question_text}
                </p>

                {currentQuestion.question_image && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 inline-block">
                    <img
                      src={currentQuestion.question_image}
                      alt={`Gambar soal nomor ${currentIdx + 1}`}
                      className="max-h-72 w-auto rounded-lg object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Answer Input Area */}
              {(currentQuestion.question_type === 'pg_4' || currentQuestion.question_type === 'pg_3') && (
                <div className="space-y-3 pt-2">
                  {currentQuestion.options.map((opt) => {
                    const selected = currentDraft.selectedOption === opt.option_label;
                    return (
                      <button
                        key={opt.option_label}
                        type="button"
                        onClick={() => updateCurrentDraft({ selectedOption: opt.option_label }, true)}
                        className={`w-full text-left flex items-center gap-4 rounded-2xl border-2 p-4 transition-all cursor-pointer ${
                          selected
                            ? 'border-blue-600 bg-blue-50/70'
                            : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold transition-colors ${
                            selected ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {opt.option_label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm sm:text-base font-medium text-slate-900">{opt.option_text}</p>
                          {opt.option_image && (
                            <img
                              src={opt.option_image}
                              alt={`Gambar pilihan ${opt.option_label}`}
                              className="mt-2 max-h-36 rounded-lg border border-slate-200 object-contain"
                            />
                          )}
                        </div>
                        {selected && <CheckCircle2 className="w-6 h-6 text-blue-700 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentQuestion.question_type === 'isian_singkat' && (
                <div className="pt-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Tuliskan jawaban singkatmu di bawah ini:
                  </label>
                  <input
                    type="text"
                    placeholder="Ketik jawabanmu di sini..."
                    value={currentDraft.answerText}
                    onChange={(e) => updateCurrentDraft({ answerText: e.target.value }, false)}
                    onBlur={() => syncAutosave(answers, true)}
                    className="w-full rounded-2xl border-2 border-slate-300 px-4 py-3.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              )}

              {currentQuestion.question_type === 'uraian' && (
                <div className="pt-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Tuliskan jawaban lengkapmu di bawah ini:
                  </label>
                  <textarea
                    rows={5}
                    placeholder="Ketik penjelasan jawabanmu di sini..."
                    value={currentDraft.answerText}
                    onChange={(e) => updateCurrentDraft({ answerText: e.target.value }, false)}
                    onBlur={() => syncAutosave(answers, true)}
                    className="w-full rounded-2xl border-2 border-slate-300 px-4 py-3.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              )}

              {/* Bottom Navigation Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => goToQuestion(currentIdx - 1)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Soal Sebelumnya
                </button>

                <button
                  type="button"
                  onClick={() => syncAutosave(answers, false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  <Save className="w-4 h-4" />
                  Simpan Jawaban
                </button>

                {currentIdx < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => goToQuestion(currentIdx + 1)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800"
                  >
                    Soal Berikutnya
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      syncAutosave(answers, true);
                      setConfirmSubmitOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <Send className="w-4 h-4" />
                    Selesai Ujian
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Question Number Grid & Summary (1 col) */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5 sticky top-20">
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900">Navigasi Nomor Soal</h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Dijawab {answeredCount} dari {questions.length} soal
            </p>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, idx) => {
              const answered = isQuestionAnswered(q);
              const flagged = answers[q.id]?.isFlagged;
              const isCurrent = idx === currentIdx;

              let btnStyle = 'border-slate-200 bg-white text-slate-700 hover:border-blue-400';
              if (isCurrent) {
                btnStyle = 'border-blue-700 bg-blue-700 text-white ring-2 ring-blue-200';
              } else if (flagged) {
                btnStyle = 'border-amber-400 bg-amber-100 text-amber-900';
              } else if (answered) {
                btnStyle = 'border-emerald-500 bg-emerald-600 text-white';
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => goToQuestion(idx)}
                  className={`h-10 rounded-xl border text-sm font-mono font-bold tabular-nums transition-colors ${btnStyle}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-emerald-600 inline-block" />
              <span>Sudah dijawab ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-amber-300 border border-amber-500 inline-block" />
              <span>Ditandai ragu-ragu ({flaggedCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-white border border-slate-300 inline-block" />
              <span>Belum dijawab ({unansweredCount})</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              syncAutosave(answers, true);
              setConfirmSubmitOpen(true);
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Send className="w-4 h-4" />
            Selesai &amp; Kumpulkan Ujian
          </button>
        </aside>
      </div>

      <ConfirmModal
        open={confirmSubmitOpen}
        title="Kumpulkan Jawaban Ujian?"
        message={
          unansweredCount > 0 || flaggedCount > 0
            ? `Kamu telah menjawab ${answeredCount} dari ${questions.length} soal. Masih ada ${unansweredCount} soal belum dijawab dan ${flaggedCount} soal ditandai ragu-ragu. Yakin ingin mengakhiri ujian sekarang?`
            : `Semua ${questions.length} soal sudah kamu jawab! Tekan "Ya, Kumpulkan" untuk mengakhiri dan mengirim jawabanmu.`
        }
        confirmLabel="Ya, Kumpulkan"
        cancelLabel="Periksa Lagi"
        loading={submitting}
        onConfirm={() => handleFinalSubmit(false)}
        onCancel={() => setConfirmSubmitOpen(false)}
      />
    </div>
  );
}
