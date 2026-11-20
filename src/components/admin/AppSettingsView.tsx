import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { ActivityLogItem, AppSettings } from '../../../shared/types.ts';
import { apiFetch, formatDateTimeId } from '../../lib/api.ts';
import { LoadingState, useToast } from '../ui/ToastAndModal.tsx';

export function AppSettingsView({ onSettingsUpdated }: { onSettingsUpdated: () => void }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [schoolName, setSchoolName] = useState('');
  const [academicYear, setAcademicYear] = useState('2026/2027');
  const [semester, setSemester] = useState('Ganjil');
  const [defaultKktp, setDefaultKktp] = useState('75');
  const [classes, setClasses] = useState<string[]>([]);
  const [newClassInput, setNewClassInput] = useState('');
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [setRes, logRes] = await Promise.all([
        apiFetch<{ settings: AppSettings }>('/api/admin/settings'),
        apiFetch<{ logs: ActivityLogItem[] }>('/api/admin/activity-logs'),
      ]);
      setSchoolName(setRes.settings.school_name);
      setAcademicYear(setRes.settings.academic_year);
      setSemester(setRes.settings.semester);
      setDefaultKktp(String(setRes.settings.default_kktp));
      setClasses(setRes.settings.classes);
      setLogs(logRes.logs);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat pengaturan.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (classes.length === 0) {
      showToast('Minimal harus ada 1 rombongan belajar kelas 3.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          school_name: schoolName,
          academic_year: academicYear,
          semester,
          classes,
          default_kktp: Number(defaultKktp),
        }),
      });
      showToast('Pengaturan aplikasi berhasil disimpan.', 'success');
      onSettingsUpdated();
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addClass = () => {
    const clean = newClassInput.trim();
    if (!clean) return;
    if (classes.includes(clean)) {
      showToast('Nama kelas sudah ada.', 'warning');
      return;
    }
    setClasses((prev) => [...prev, clean]);
    setNewClassInput('');
  };

  if (loading) return <LoadingState label="Memuat pengaturan aplikasi..." />;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="font-display text-lg font-bold text-slate-900">Identitas Sekolah &amp; Tahun Ajaran</h2>
          <p className="text-xs text-slate-500">Sesuaikan identitas sekolah, semester aktif, dan daftar rombel Kelas III.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Sekolah</label>
            <input
              type="text"
              required
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun Ajaran</label>
            <input
              type="text"
              required
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Semester Aktif</label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
            >
              <option value="Ganjil">Ganjil</option>
              <option value="Genap">Genap</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Daftar Rombel / Kelas III</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {classes.map((c) => (
                <div
                  key={c}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
                >
                  <span>Kelas {c}</span>
                  {classes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setClasses((prev) => prev.filter((item) => item !== c))}
                      className="text-slate-400 hover:text-red-600"
                      title="Hapus kelas"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Tambah rombel, misal: 3D"
                value={newClassInput}
                onChange={(e) => setNewClassInput(e.target.value)}
                className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
              <button
                type="button"
                onClick={addClass}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Plus className="w-4 h-4" />
                Tambah
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">KKTP Standar Aplikasi</label>
            <input
              type="number"
              min={0}
              max={100}
              value={defaultKktp}
              onChange={(e) => setDefaultKktp(e.target.value)}
              className="w-36 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-mono tabular-nums"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Kurikulum: {academicYear ? 'Kurikulum Merdeka · Kelas III SD' : ''}
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      </form>

      {/* Activity Logs */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="font-display text-base font-bold text-slate-900 mb-4">Log Aktivitas Keamanan &amp; Sistem</h3>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
              <tr>
                <th className="px-3 py-2.5">Waktu</th>
                <th className="px-3 py-2.5">Aktor</th>
                <th className="px-3 py-2.5">Peran</th>
                <th className="px-3 py-2.5">Aksi</th>
                <th className="px-3 py-2.5">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                    {formatDateTimeId(l.created_at)}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{l.actor_name}</td>
                  <td className="px-3 py-2.5 text-slate-500">{l.actor_role}</td>
                  <td className="px-3 py-2.5 font-mono text-blue-700">{l.action}</td>
                  <td className="px-3 py-2.5 text-slate-600">{l.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
