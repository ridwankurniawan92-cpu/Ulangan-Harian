import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  Edit3,
  KeyRound,
  Plus,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type { ParentProfile, StudentProfile } from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { ConfirmModal, EmptyState, LoadingState, useToast } from '../ui/ToastAndModal.tsx';

export function StudentsManager({ classes }: { classes: string[] }) {
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [parents, setParents] = useState<ParentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudentProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<StudentProfile | null>(null);
  const [resetTarget, setResetTarget] = useState<StudentProfile | null>(null);
  const [resetPwdValue, setResetPwdValue] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [nis, setNis] = useState('');
  const [nisn, setNisn] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'L' | 'P'>('L');
  const [className, setClassName] = useState(classes[0] || '3A');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [parentMode, setParentMode] = useState<'none' | 'new' | 'existing'>('new');
  const [existingParentId, setExistingParentId] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentUsername, setParentUsername] = useState('');
  const [parentPassword, setParentPassword] = useState('');
  const [parentWhatsapp, setParentWhatsapp] = useState('');
  const [editParentIds, setEditParentIds] = useState<number[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([
        apiFetch<{ students: StudentProfile[] }>('/api/admin/students'),
        apiFetch<{ parents: ParentProfile[] }>('/api/admin/parents'),
      ]);
      setStudents(sRes.students);
      setParents(pRes.parents);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat data peserta didik.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAddModal = () => {
    setEditing(null);
    setNis('');
    setNisn('');
    setFullName('');
    setGender('L');
    setClassName(classes[0] || '3A');
    setUsername('');
    setPassword('');
    setParentMode('new');
    setExistingParentId('');
    setParentName('');
    setParentUsername('');
    setParentPassword('');
    setParentWhatsapp('');
    setEditParentIds([]);
    setModalOpen(true);
  };

  const openEditModal = (st: StudentProfile) => {
    setEditing(st);
    setNis(st.nis);
    setNisn(st.nisn || '');
    setFullName(st.full_name);
    setGender(st.gender);
    setClassName(st.class_name);
    setUsername(st.username);
    setEditParentIds(st.parent_ids || []);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/admin/students/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            nis,
            nisn,
            fullName,
            gender,
            className,
            username,
            parentIds: editParentIds,
          }),
        });
        showToast('Data peserta didik berhasil diperbarui.', 'success');
      } else {
        await apiFetch('/api/admin/students', {
          method: 'POST',
          body: JSON.stringify({
            nis,
            nisn,
            fullName,
            gender,
            className,
            username,
            password,
            existingParentId: parentMode === 'existing' ? existingParentId : null,
            parentName: parentMode === 'new' ? parentName : '',
            parentUsername: parentMode === 'new' ? parentUsername : '',
            parentPassword: parentMode === 'new' ? parentPassword : '',
            parentWhatsapp: parentMode === 'new' ? parentWhatsapp : '',
          }),
        });
        showToast('Peserta didik baru berhasil ditambahkan.', 'success');
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan data.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (st: StudentProfile) => {
    try {
      const res = await apiFetch<{ is_active: number }>(`/api/admin/students/${st.id}/toggle-active`, {
        method: 'PATCH',
      });
      showToast(
        `Akun ${st.full_name} berhasil ${res.is_active === 1 ? 'diaktifkan' : 'dinonaktifkan'}.`,
        'success'
      );
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah status akun.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/admin/students/${deleteTarget.id}`, { method: 'DELETE' });
      showToast(`Peserta didik ${deleteTarget.full_name} telah dihapus.`, 'success');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus data.', 'error');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    try {
      await apiFetch(`/api/admin/students/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPwdValue }),
      });
      showToast(`Kata sandi ${resetTarget.full_name} berhasil direset.`, 'success');
      setResetTarget(null);
      setResetPwdValue('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mereset kata sandi.', 'error');
    }
  };

  const downloadTemplate = () => {
    const templateRows = [
      {
        NIS: '2026001',
        NISN: '0161234567',
        'Nama Lengkap': 'Contoh: Nama Siswa',
        'Jenis Kelamin (L/P)': 'L',
        Kelas: classes[0] || '3A',
        'Username Siswa': 'siswa_nis001',
        'Password Awal Siswa': '123456',
        'Nama Orang Tua': 'Nama Wali Murid',
        'Username Orang Tua': 'ortu_nis001',
        'Password Orang Tua': '123456',
        'No WA Orang Tua': '08123456789',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Siswa');
    XLSX.writeFile(wb, 'Template_Impor_Peserta_Didik_Kelas3.xlsx');
    showToast('Template Excel berhasil diunduh. Hapus baris contoh sebelum mengisi data asli.', 'info');
  };

  const exportStudents = () => {
    if (students.length === 0) {
      showToast('Belum ada data peserta didik untuk diunduh.', 'warning');
      return;
    }
    const rows = students.map((s, idx) => ({
      No: idx + 1,
      NIS: s.nis,
      NISN: s.nisn || '-',
      'Nama Lengkap': s.full_name,
      'Jenis Kelamin': s.gender,
      Kelas: s.class_name,
      'Username Siswa': s.username,
      'Orang Tua Terhubung': s.parent_names || '-',
      Status: s.is_active === 1 ? 'Aktif' : 'Nonaktif',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data_Peserta_Didik');
    XLSX.writeFile(wb, 'Data_Peserta_Didik_Kelas3.xlsx');
    showToast('Data peserta didik berhasil diekspor ke Excel.', 'success');
  };

  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const mapped = rawRows.map((r) => ({
        nis: r['NIS'] ?? r['nis'] ?? '',
        nisn: r['NISN'] ?? r['nisn'] ?? '',
        fullName: r['Nama Lengkap'] ?? r['Nama'] ?? r['fullName'] ?? '',
        gender: r['Jenis Kelamin (L/P)'] ?? r['Jenis Kelamin'] ?? r['JK'] ?? r['gender'] ?? 'L',
        className: r['Kelas'] ?? r['className'] ?? classes[0] ?? '3A',
        username: r['Username Siswa'] ?? r['Username'] ?? r['username'] ?? '',
        password: r['Password Awal Siswa'] ?? r['Password'] ?? r['password'] ?? '',
        parentName: r['Nama Orang Tua'] ?? r['parentName'] ?? '',
        parentUsername: r['Username Orang Tua'] ?? r['parentUsername'] ?? '',
        parentPassword: r['Password Orang Tua'] ?? r['parentPassword'] ?? '',
        parentWhatsapp: r['No WA Orang Tua'] ?? r['WhatsApp'] ?? r['parentWhatsapp'] ?? '',
      }));

      const res = await apiFetch<{ imported: number; errors: string[] }>('/api/admin/students/import', {
        method: 'POST',
        body: JSON.stringify({ rows: mapped }),
      });
      if (res.imported > 0) {
        showToast(`Berhasil mengimpor ${res.imported} peserta didik.`, 'success');
      }
      if (res.errors.length > 0) {
        showToast(res.errors[0], 'warning');
      }
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membaca file Excel.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const filtered = students.filter((s) => {
    const matchesClass = classFilter === 'all' || s.class_name === classFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      s.full_name.toLowerCase().includes(q) ||
      s.nis.toLowerCase().includes(q) ||
      s.username.toLowerCase().includes(q) ||
      (s.parent_names || '').toLowerCase().includes(q);
    return matchesClass && matchesSearch;
  });

  if (loading) return <LoadingState label="Memuat data peserta didik..." />;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, NIS, username, orang tua..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="all">Semua Kelas</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                Kelas {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Template Excel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            Impor Excel
          </button>
          <button
            type="button"
            onClick={exportStudents}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh Excel
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Tambah Peserta Didik
          </button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title={students.length === 0 ? 'Belum ada peserta didik terdaftar' : 'Tidak ada peserta didik yang cocok'}
          description={
            students.length === 0
              ? 'Tambahkan akun peserta didik secara manual atau unggah file Excel untuk memulai.'
              : 'Coba ubah kata kunci pencarian atau filter kelas Anda.'
          }
          action={
            students.length === 0 && (
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                <Plus className="w-4 h-4" />
                Tambah Peserta Didik Pertama
              </button>
            )
          }
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">NIS / NISN</th>
                  <th className="px-4 py-3">Nama Lengkap</th>
                  <th className="px-4 py-3">JK</th>
                  <th className="px-4 py-3">Kelas</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Orang Tua Terhubung</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      <div>{s.nis}</div>
                      {s.nisn && <div className="text-[11px] text-slate-400">{s.nisn}</div>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{s.full_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{s.gender}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-blue-700 whitespace-nowrap">
                      Kelas {s.class_name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.username}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {s.parent_names ? s.parent_names : <span className="text-slate-400">Belum terhubung</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold ${
                          s.is_active === 1 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {s.is_active === 1 ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(s)}
                          title="Edit siswa"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(s);
                            setResetPwdValue('');
                          }}
                          title="Reset kata sandi"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(s)}
                          title={s.is_active === 1 ? 'Nonaktifkan akun' : 'Aktifkan akun'}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                        >
                          {s.is_active === 1 ? (
                            <ToggleRight className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(s)}
                          title="Hapus siswa"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
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

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleSave}
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl my-8 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display text-lg font-bold text-slate-900">
                {editing ? 'Edit Peserta Didik' : 'Tambah Peserta Didik Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">NIS *</label>
                <input
                  type="text"
                  required
                  value={nis}
                  onChange={(e) => setNis(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">NISN (Opsional)</label>
                <input
                  type="text"
                  value={nisn}
                  onChange={(e) => setNisn(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Kelamin *</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                >
                  <option value="L">Laki-laki (L)</option>
                  <option value="P">Perempuan (P)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas *</label>
                <select
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                >
                  {classes.map((c) => (
                    <option key={c} value={c}>
                      Kelas {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Username Siswa *</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              {!editing && (
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
              )}
            </div>

            {/* Parent connection section */}
            {editing ? (
              <div className="border-t border-slate-100 pt-4">
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Hubungkan dengan Akun Orang Tua
                </label>
                {parents.length === 0 ? (
                  <p className="text-xs text-slate-500">Belum ada akun orang tua terdaftar.</p>
                ) : (
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1">
                    {parents.map((p) => (
                      <label key={p.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editParentIds.includes(p.id)}
                          onChange={(e) => {
                            if (e.target.checked) setEditParentIds((prev) => [...prev, p.id]);
                            else setEditParentIds((prev) => prev.filter((id) => id !== p.id));
                          }}
                          className="rounded border-slate-300 text-blue-700"
                        />
                        <span className="font-semibold text-slate-800">{p.full_name}</span>
                        <span className="text-slate-400 font-mono">@{p.username}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Akun Orang Tua / Wali</span>
                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setParentMode('new')}
                      className={`rounded-md px-2.5 py-1 font-medium ${parentMode === 'new' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}
                    >
                      Buat Baru
                    </button>
                    <button
                      type="button"
                      onClick={() => setParentMode('existing')}
                      className={`rounded-md px-2.5 py-1 font-medium ${parentMode === 'existing' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}
                    >
                      Pilih yang Ada
                    </button>
                    <button
                      type="button"
                      onClick={() => setParentMode('none')}
                      className={`rounded-md px-2.5 py-1 font-medium ${parentMode === 'none' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}
                    >
                      Nanti Saja
                    </button>
                  </div>
                </div>

                {parentMode === 'new' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Orang Tua / Wali</label>
                      <input
                        type="text"
                        required
                        value={parentName}
                        onChange={(e) => setParentName(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">No. WhatsApp (Opsional)</label>
                      <input
                        type="text"
                        value={parentWhatsapp}
                        onChange={(e) => setParentWhatsapp(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Username Orang Tua</label>
                      <input
                        type="text"
                        required
                        value={parentUsername}
                        onChange={(e) => setParentUsername(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Password Orang Tua</label>
                      <input
                        type="text"
                        required
                        minLength={4}
                        value={parentPassword}
                        onChange={(e) => setParentPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {parentMode === 'existing' && (
                  <select
                    value={existingParentId}
                    onChange={(e) => setExistingParentId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    <option value="">-- Pilih Akun Orang Tua --</option>
                    {parents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} (@{p.username})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {saving ? 'Menyimpan...' : 'Simpan Data'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form onSubmit={handleResetPassword} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900">Atur Ulang Kata Sandi</h3>
            <p className="text-xs text-slate-600">
              Siswa: <span className="font-semibold text-slate-900">{resetTarget.full_name}</span> (@{resetTarget.username})
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kata Sandi Baru</label>
              <input
                type="text"
                required
                minLength={4}
                value={resetPwdValue}
                onChange={(e) => setResetPwdValue(e.target.value)}
                placeholder="Minimal 4 karakter"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
              >
                Reset Kata Sandi
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Hapus Akun Peserta Didik"
        message={`Apakah Anda yakin ingin menghapus peserta didik "${deleteTarget?.full_name}"? Seluruh riwayat ujian dan nilai siswa tersebut juga akan dihapus.`}
        confirmLabel="Ya, Hapus"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
