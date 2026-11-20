import React, { useEffect, useState } from 'react';
import { BookMarked, Edit3, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { AppSettings, SubjectItem } from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { ConfirmModal, EmptyState, LoadingState, useToast } from '../ui/ToastAndModal.tsx';

export function SubjectsManager({ appSettings }: { appSettings: AppSettings }) {
  const { showToast } = useToast();
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectItem | null>(null);
  const [name, setName] = useState('');
  const [className, setClassName] = useState('Kelas III');
  const [semester, setSemester] = useState(appSettings.semester || 'Ganjil');
  const [kktp, setKktp] = useState(String(appSettings.default_kktp || 75));
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SubjectItem | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ subjects: SubjectItem[] }>('/api/admin/subjects');
      setSubjects(res.subjects);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat mata pelajaran.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setName('');
    setClassName('Kelas III');
    setSemester(appSettings.semester || 'Ganjil');
    setKktp(String(appSettings.default_kktp || 75));
    setModalOpen(true);
  };

  const openEdit = (s: SubjectItem) => {
    setEditing(s);
    setName(s.name);
    setClassName(s.class_name);
    setSemester(s.semester);
    setKktp(String(s.kktp_threshold));
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/admin/subjects/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name, className, semester }),
        });
        await apiFetch('/api/admin/kktp', {
          method: 'POST',
          body: JSON.stringify({ scope: 'subject', subjectId: editing.id, threshold: Number(kktp) }),
        });
        showToast('Mata pelajaran berhasil diperbarui.', 'success');
      } else {
        await apiFetch('/api/admin/subjects', {
          method: 'POST',
          body: JSON.stringify({ name, className, semester, kktp: Number(kktp) }),
        });
        showToast('Mata pelajaran berhasil ditambahkan.', 'success');
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan mata pelajaran.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSeedStandard = async () => {
    try {
      const res = await apiFetch<{ added: number }>('/api/admin/subjects/seed-standard', { method: 'POST' });
      showToast(`${res.added} mata pelajaran standar Kurikulum Merdeka Kelas 3 ditambahkan.`, 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menambahkan daftar mapel.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/admin/subjects/${deleteTarget.id}`, { method: 'DELETE' });
      showToast(`Mata pelajaran "${deleteTarget.name}" dihapus.`, 'success');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus mata pelajaran.', 'error');
    }
  };

  if (loading) return <LoadingState label="Memuat daftar mata pelajaran..." />;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">Daftar Mata Pelajaran Kelas III</h2>
          <p className="text-xs text-slate-500">
            Tahun Ajaran {appSettings.academic_year} · {appSettings.curriculum}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSeedStandard}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Isi Mapel Standar Kurikulum Merdeka
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Tambah Mata Pelajaran
          </button>
        </div>
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          icon={<BookMarked className="w-6 h-6" />}
          title="Belum ada mata pelajaran"
          description="Tambahkan mata pelajaran secara manual atau gunakan tombol Isi Mapel Standar Kurikulum Merdeka (Pendidikan Pancasila, Bahasa Indonesia, Matematika, IPAS, SBdP, Pendidikan Agama, Bahasa Sunda, PLH)."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={handleSeedStandard}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Isi 8 Mapel Standar Kelas 3
              </button>
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                <Plus className="w-4 h-4" />
                Tambah Manual
              </button>
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-base font-bold text-slate-900">{s.name}</h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-700"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(s)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {s.class_name} · Semester {s.semester} · TA {s.academic_year_label}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs tabular-nums">
                <span className="text-slate-600">
                  Soal: <strong className="text-slate-900">{s.question_count ?? 0}</strong> · Ulangan:{' '}
                  <strong className="text-slate-900">{s.exam_count ?? 0}</strong>
                </span>
                <span className="font-semibold text-emerald-700">KKTP {s.kktp_threshold}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form onSubmit={handleSave} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display text-lg font-bold text-slate-900">
                {editing ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Mata Pelajaran *</label>
              <input
                type="text"
                required
                placeholder="Contoh: Matematika"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tingkat / Kelas</label>
                <input
                  type="text"
                  required
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Semester</label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                >
                  <option value="Ganjil">Ganjil</option>
                  <option value="Genap">Genap</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batas KKTP (0–100)</label>
              <input
                type="number"
                min={0}
                max={100}
                required
                value={kktp}
                onChange={(e) => setKktp(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-mono tabular-nums focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Hapus Mata Pelajaran"
        message={`Hapus mata pelajaran "${deleteTarget?.name}"? Seluruh soal dan ulangan pada mata pelajaran ini juga akan terhapus.`}
        confirmLabel="Ya, Hapus"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
