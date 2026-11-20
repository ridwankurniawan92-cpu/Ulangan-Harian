import React, { useEffect, useState } from 'react';
import { Edit3, KeyRound, Plus, Search, ToggleLeft, ToggleRight, Trash2, Users, X } from 'lucide-react';
import type { ParentProfile, StudentProfile } from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { ConfirmModal, EmptyState, LoadingState, useToast } from '../ui/ToastAndModal.tsx';

export function ParentsManager() {
  const { showToast } = useToast();
  const [parents, setParents] = useState<ParentProfile[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ParentProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ParentProfile | null>(null);
  const [resetTarget, setResetTarget] = useState<ParentProfile | null>(null);
  const [resetPwd, setResetPwd] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        apiFetch<{ parents: ParentProfile[] }>('/api/admin/parents'),
        apiFetch<{ students: StudentProfile[] }>('/api/admin/students'),
      ]);
      setParents(pRes.parents);
      setStudents(sRes.students);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat data orang tua.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setFullName('');
    setUsername('');
    setPassword('');
    setWhatsappNumber('');
    setSelectedStudentIds([]);
    setModalOpen(true);
  };

  const openEdit = (p: ParentProfile) => {
    setEditing(p);
    setFullName(p.full_name);
    setUsername(p.username);
    setWhatsappNumber(p.whatsapp_number || '');
    setSelectedStudentIds((p.children || []).map((c) => c.id));
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/admin/parents/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ fullName, username, whatsappNumber, studentIds: selectedStudentIds }),
        });
        showToast('Data akun orang tua berhasil diperbarui.', 'success');
      } else {
        await apiFetch('/api/admin/parents', {
          method: 'POST',
          body: JSON.stringify({ fullName, username, password, whatsappNumber, studentIds: selectedStudentIds }),
        });
        showToast('Akun orang tua berhasil dibuat.', 'success');
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan data orang tua.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (p: ParentProfile) => {
    try {
      const res = await apiFetch<{ is_active: number }>(`/api/admin/parents/${p.id}/toggle-active`, { method: 'PATCH' });
      showToast(`Akun ${p.full_name} ${res.is_active === 1 ? 'diaktifkan' : 'dinonaktifkan'}.`, 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah status.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/admin/parents/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Akun orang tua berhasil dihapus.', 'success');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus akun.', 'error');
    }
  };

  const handleResetPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    try {
      await apiFetch(`/api/admin/parents/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPwd }),
      });
      showToast('Kata sandi orang tua berhasil direset.', 'success');
      setResetTarget(null);
      setResetPwd('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal reset kata sandi.', 'error');
    }
  };

  const filtered = parents.filter((p) => {
    const q = search.toLowerCase();
    return (
      !q ||
      p.full_name.toLowerCase().includes(q) ||
      p.username.toLowerCase().includes(q) ||
      (p.children || []).some((c) => c.full_name.toLowerCase().includes(q))
    );
  });

  if (loading) return <LoadingState label="Memuat data orang tua..." />;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama orang tua, username, atau nama anak..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Tambah Akun Orang Tua
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title="Belum ada akun orang tua"
          description="Buat akun orang tua dan hubungkan dengan peserta didik agar wali murid dapat memantau hasil belajar anak."
          action={
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              <Plus className="w-4 h-4" />
              Tambah Akun Orang Tua
            </button>
          }
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Nama Orang Tua / Wali</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">No. WhatsApp</th>
                  <th className="px-4 py-3">Anak Terhubung</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-900">{p.full_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.username}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 tabular-nums">{p.whatsapp_number || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {p.children && p.children.length > 0 ? (
                        p.children.map((c) => `${c.full_name} (${c.class_name})`).join(', ')
                      ) : (
                        <span className="text-slate-400">Belum terhubung</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-semibold ${p.is_active === 1 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {p.is_active === 1 ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(p);
                            setResetPwd('');
                          }}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                          title="Reset Password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle(p)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                          title="Aktif/Nonaktif"
                        >
                          {p.is_active === 1 ? (
                            <ToggleRight className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(p)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <form onSubmit={handleSave} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display text-lg font-bold text-slate-900">
                {editing ? 'Edit Akun Orang Tua' : 'Tambah Akun Orang Tua'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap Orang Tua / Wali *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Username *</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              {!editing ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password Awal *</label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">No. WhatsApp (Opsional)</label>
                  <input
                    type="text"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {!editing && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">No. WhatsApp (Opsional)</label>
                <input
                  type="text"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Hubungkan dengan Peserta Didik</label>
              {students.length === 0 ? (
                <p className="text-xs text-slate-500">Belum ada data peserta didik.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1">
                  {students.map((st) => (
                    <label key={st.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(st.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedStudentIds((prev) => [...prev, st.id]);
                          else setSelectedStudentIds((prev) => prev.filter((id) => id !== st.id));
                        }}
                        className="rounded border-slate-300 text-blue-700"
                      />
                      <span className="font-semibold text-slate-800">{st.full_name}</span>
                      <span className="text-slate-500">· Kelas {st.class_name} · NIS {st.nis}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
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

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form onSubmit={handleResetPwd} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900">Reset Kata Sandi Orang Tua</h3>
            <p className="text-xs text-slate-600">{resetTarget.full_name} (@{resetTarget.username})</p>
            <input
              type="text"
              required
              minLength={4}
              value={resetPwd}
              onChange={(e) => setResetPwd(e.target.value)}
              placeholder="Password baru (min 4 karakter)"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setResetTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700">
                Batal
              </button>
              <button type="submit" className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800">
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Hapus Akun Orang Tua"
        message={`Hapus akun orang tua "${deleteTarget?.full_name}"? Data nilai siswa tidak akan terhapus.`}
        confirmLabel="Ya, Hapus"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
