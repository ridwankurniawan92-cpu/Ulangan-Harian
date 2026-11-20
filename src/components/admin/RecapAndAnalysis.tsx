import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart3, Download, FileSpreadsheet, FileText, Printer, Sliders } from 'lucide-react';
import type { AppSettings, ExamItem, StudentProfile, SubjectItem } from '../../../shared/types.ts';
import { apiFetch, formatDateId } from '../../lib/api.ts';
import { EmptyState, LoadingState, ScoreBarChart, useToast } from '../ui/ToastAndModal.tsx';

export function RecapView({ appSettings }: { appSettings: AppSettings }) {
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);

  const [studentId, setStudentId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [examId, setExamId] = useState('');
  const [className, setClassName] = useState('');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    summary: {
      highest: number;
      lowest: number;
      average: number;
      passedCount: number;
      failedCount: number;
      totalRecords: number;
    };
    rows: Array<{
      id: number;
      nis: string;
      student_name: string;
      class_name: string;
      exam_title: string;
      subject_name: string;
      exam_date: string;
      total_score: number;
      kktp_threshold: number;
      is_passed: number;
      is_published: number;
    }>;
    notTakenList: Array<{ nis: string; full_name: string; class_name: string; exam_title: string }>;
    chartData: Array<{ label: string; average: number; count: number; passed: number }>;
  } | null>(null);

  const loadFilters = async () => {
    const [stRes, subRes, exRes] = await Promise.all([
      apiFetch<{ students: StudentProfile[] }>('/api/admin/students'),
      apiFetch<{ subjects: SubjectItem[] }>('/api/admin/subjects'),
      apiFetch<{ exams: ExamItem[] }>('/api/admin/exams'),
    ]);
    setStudents(stRes.students);
    setSubjects(subRes.subjects);
    setExams(exRes.exams);
  };

  const loadRecap = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (studentId) qs.set('studentId', studentId);
      if (subjectId) qs.set('subjectId', subjectId);
      if (examId) qs.set('examId', examId);
      if (className) qs.set('className', className);
      const res = await apiFetch<NonNullable<typeof data>>(`/api/admin/recap?${qs.toString()}`);
      setData(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat rekap nilai.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFilters();
  }, []);

  useEffect(() => {
    loadRecap();
  }, [studentId, subjectId, examId, className]);

  const exportExcel = () => {
    if (!data || data.rows.length === 0) {
      showToast('Belum ada data nilai untuk diekspor.', 'warning');
      return;
    }
    const sheetRows = data.rows.map((r, i) => ({
      No: i + 1,
      NIS: r.nis,
      'Nama Peserta Didik': r.student_name,
      Kelas: r.class_name,
      'Mata Pelajaran': r.subject_name,
      'Judul Ulangan': r.exam_title,
      Tanggal: r.exam_date,
      Nilai: r.total_score,
      KKTP: r.kktp_threshold,
      Keterangan: r.is_passed === 1 ? 'Tuntas' : 'Belum Tuntas',
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Nilai');
    XLSX.writeFile(wb, `Rekap_Nilai_Kelas3_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Rekap nilai berhasil diunduh dalam format Excel.', 'success');
  };

  const exportPdf = () => {
    if (!data || data.rows.length === 0) {
      showToast('Belum ada data nilai untuk diekspor ke PDF.', 'warning');
      return;
    }
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('REKAP NILAI ULANGAN HARIAN KELAS 3', 14, 16);
    doc.setFontSize(10);
    doc.text(
      `${appSettings.school_name} · ${appSettings.curriculum} · Tahun Ajaran ${appSettings.academic_year}`,
      14,
      22
    );
    doc.text(
      `Rata-rata: ${data.summary.average} | Tertinggi: ${data.summary.highest} | Terendah: ${data.summary.lowest} | Tuntas: ${data.summary.passedCount} | Belum Tuntas: ${data.summary.failedCount}`,
      14,
      28
    );

    autoTable(doc, {
      startY: 34,
      head: [['No', 'NIS', 'Nama Peserta Didik', 'Kelas', 'Mata Pelajaran', 'Ulangan', 'Tanggal', 'Nilai', 'KKTP', 'Status']],
      body: data.rows.map((r, idx) => [
        idx + 1,
        r.nis,
        r.student_name,
        r.class_name,
        r.subject_name,
        r.exam_title,
        formatDateId(r.exam_date),
        r.total_score,
        r.kktp_threshold,
        r.is_passed === 1 ? 'Tuntas' : 'Belum Tuntas',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [29, 78, 216] },
    });

    doc.save(`Laporan_Nilai_Kelas3_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast('Laporan PDF berhasil diunduh.', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Filters & Export Actions */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="">Semua Kelas</option>
            {appSettings.classes.map((c) => (
              <option key={c} value={c}>
                Kelas {c}
              </option>
            ))}
          </select>

          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="">Semua Mata Pelajaran</option>
            {subjects.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="">Semua Ulangan Harian</option>
            {exams.map((ex) => (
              <option key={ex.id} value={String(ex.id)}>
                {ex.title} ({ex.class_name})
              </option>
            ))}
          </select>

          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="">Semua Peserta Didik</option>
            {students.map((st) => (
              <option key={st.id} value={String(st.id)}>
                {st.full_name} ({st.class_name})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="w-4 h-4" />
            Cetak Nilai
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Unduh Excel
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            <FileText className="w-4 h-4" />
            Unduh PDF
          </button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print-only mb-4">
        <h2 className="text-lg font-bold">LAPORAN REKAP NILAI ULANGAN HARIAN KELAS 3</h2>
        <p className="text-xs">
          {appSettings.school_name} · Tahun Ajaran {appSettings.academic_year} ({appSettings.semester})
        </p>
      </div>

      {loading || !data ? (
        <LoadingState label="Menghitung rekap nilai..." />
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Rata-rata Kelas</p>
              <p className="mt-1 font-display text-2xl font-bold text-blue-700 tabular-nums">{data.summary.average}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Nilai Tertinggi</p>
              <p className="mt-1 font-display text-2xl font-bold text-emerald-700 tabular-nums">{data.summary.highest}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Nilai Terendah</p>
              <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">{data.summary.lowest}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Mencapai KKTP</p>
              <p className="mt-1 font-display text-2xl font-bold text-emerald-700 tabular-nums">{data.summary.passedCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Belum Mencapai KKTP</p>
              <p className="mt-1 font-display text-2xl font-bold text-red-600 tabular-nums">{data.summary.failedCount}</p>
            </div>
          </div>

          {/* Chart */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 no-print">
            <h3 className="font-display text-sm font-bold text-slate-900 mb-3">Grafik Hasil Ulangan</h3>
            <ScoreBarChart
              data={data.chartData.map((c) => ({
                label: c.label,
                score: c.average,
                subtitle: `${c.count} peserta`,
              }))}
            />
          </div>

          {/* Results Table */}
          {data.rows.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="w-6 h-6" />}
              title="Belum ada data rekap nilai"
              description="Rekap nilai akan terisi otomatis setelah peserta didik menyelesaikan ulangan harian."
            />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">NIS</th>
                      <th className="px-4 py-3">Nama Siswa</th>
                      <th className="px-4 py-3">Kelas</th>
                      <th className="px-4 py-3">Mata Pelajaran</th>
                      <th className="px-4 py-3">Ulangan</th>
                      <th className="px-4 py-3">Tanggal</th>
                      <th className="px-4 py-3">Nilai</th>
                      <th className="px-4 py-3">KKTP</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.rows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">{r.nis}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{r.student_name}</td>
                        <td className="px-4 py-3 text-xs">{r.class_name}</td>
                        <td className="px-4 py-3 text-xs text-blue-700 font-medium">{r.subject_name}</td>
                        <td className="px-4 py-3 text-xs text-slate-700">{r.exam_title}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          {formatDateId(r.exam_date)}
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

          {/* Not Taken List */}
          {data.notTakenList.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-display text-sm font-bold text-slate-900 mb-3">
                Daftar Peserta Didik yang Belum Mengikuti Ulangan ({data.notTakenList.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">NIS</th>
                      <th className="py-2 pr-4">Nama Peserta Didik</th>
                      <th className="py-2 pr-4">Kelas</th>
                      <th className="py-2">Ulangan Harian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.notTakenList.map((n, idx) => (
                      <tr key={`${n.nis}-${idx}`}>
                        <td className="py-2 pr-4 font-mono tabular-nums">{n.nis}</td>
                        <td className="py-2 pr-4 font-semibold text-slate-800">{n.full_name}</td>
                        <td className="py-2 pr-4">{n.class_name}</td>
                        <td className="py-2 text-slate-600">{n.exam_title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ItemAnalysisView() {
  const { showToast } = useToast();
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<{
    totalParticipants: number;
    analysis: Array<{
      id: number;
      sort_order: number;
      question_type: string;
      question_text: string;
      topic: string;
      difficulty: string;
      correctCount: number;
      wrongCount: number;
      unansweredCount: number;
      correctRate: number;
      avgScore: number;
    }>;
  } | null>(null);

  useEffect(() => {
    apiFetch<{ exams: ExamItem[] }>('/api/admin/exams')
      .then((res) => {
        setExams(res.exams);
        if (res.exams.length > 0) setSelectedExamId(res.exams[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedExamId) return;
    apiFetch<NonNullable<typeof analysis>>(`/api/admin/item-analysis/${selectedExamId}`)
      .then(setAnalysis)
      .catch((err) => showToast(err instanceof Error ? err.message : 'Gagal memuat analisis soal.', 'error'));
  }, [selectedExamId]);

  if (loading) return <LoadingState label="Memuat analisis soal..." />;

  if (exams.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="w-6 h-6" />}
        title="Belum ada ulangan untuk dianalisis"
        description="Analisis butir soal akan tersedia setelah Anda membuat ulangan harian dan siswa mengerjakannya."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pilih Ulangan Harian</label>
        <select
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(Number(e.target.value))}
          className="w-full max-w-xl rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900"
        >
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.title} — {ex.subject_name} (Kelas {ex.class_name})
            </option>
          ))}
        </select>
      </div>

      {analysis && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900">Analisis Daya Serap per Butir Soal</h3>
            <span className="text-xs text-slate-500 tabular-nums">
              Total Peserta Mengerjakan: <strong>{analysis.totalParticipants}</strong>
            </span>
          </div>

          {analysis.analysis.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Belum ada butir soal pada ulangan ini.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {analysis.analysis.map((item, idx) => (
                <div key={item.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-bold text-slate-900">Soal #{idx + 1}</span>
                      <span>·</span>
                      <span className="uppercase font-semibold text-blue-700">{item.question_type.replace('_', ' ')}</span>
                      <span>·</span>
                      <span>Tingkat: {item.difficulty}</span>
                      {item.topic && (
                        <>
                          <span>·</span>
                          <span>{item.topic}</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-slate-900 line-clamp-2">{item.question_text}</p>
                  </div>

                  <div className="w-full lg:w-80 shrink-0 space-y-1.5">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="text-emerald-700 font-semibold">Benar: {item.correctCount}</span>
                      <span className="text-red-600 font-semibold">Salah: {item.wrongCount}</span>
                      <span className="text-slate-500">Kosong: {item.unansweredCount}</span>
                      <span className="font-mono font-bold text-slate-900">{item.correctRate}%</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          item.correctRate >= 70
                            ? 'bg-emerald-600'
                            : item.correctRate >= 40
                              ? 'bg-blue-600'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, item.correctRate)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function KktpSettingsView() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [defaultKktp, setDefaultKktp] = useState('75');
  const [subjects, setSubjects] = useState<Array<{ subject_id: number; subject_name: string; threshold: number }>>([]);
  const [exams, setExams] = useState<
    Array<{ exam_id: number; exam_title: string; class_name: string; subject_name: string; threshold: number }>
  >([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        defaultKktp: number;
        subjects: typeof subjects;
        exams: typeof exams;
      }>('/api/admin/kktp');
      setDefaultKktp(String(res.defaultKktp));
      setSubjects(res.subjects);
      setExams(res.exams);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat pengaturan KKTP.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateKktp = async (payload: { scope: 'default' | 'subject' | 'exam'; subjectId?: number; examId?: number; threshold: number }) => {
    try {
      await apiFetch('/api/admin/kktp', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('Batas KKTP diperbarui dan status ketuntasan dihitung ulang.', 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan KKTP.', 'error');
    }
  };

  if (loading) return <LoadingState label="Memuat pengaturan KKTP..." />;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">Batas KKTP Standar Sekolah</h2>
          <p className="text-xs text-slate-500">
            Digunakan sebagai nilai bawaan saat menambah mata pelajaran atau membuat ulangan baru.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            value={defaultKktp}
            onChange={(e) => setDefaultKktp(e.target.value)}
            className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
          />
          <button
            type="button"
            onClick={() => updateKktp({ scope: 'default', threshold: Number(defaultKktp) })}
            className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            Simpan Default
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h3 className="font-display text-base font-bold text-slate-900">KKTP per Mata Pelajaran</h3>
          {subjects.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada mata pelajaran terdaftar.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {subjects.map((s) => (
                <div key={s.subject_id} className="py-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-800">{s.subject_name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={s.threshold}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== s.threshold) {
                          updateKktp({ scope: 'subject', subjectId: s.subject_id, threshold: v });
                        }
                      }}
                      className="w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono tabular-nums"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h3 className="font-display text-base font-bold text-slate-900">KKTP per Ulangan Harian</h3>
          {exams.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada ulangan harian.</p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {exams.map((ex) => (
                <div key={ex.exam_id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{ex.exam_title}</p>
                    <p className="text-xs text-slate-500">
                      {ex.subject_name} · Kelas {ex.class_name}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={ex.threshold}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== ex.threshold) {
                        updateKktp({ scope: 'exam', examId: ex.exam_id, threshold: v });
                      }
                    }}
                    className="w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono tabular-nums shrink-0"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
