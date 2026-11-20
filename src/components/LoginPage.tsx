import React, { useState } from 'react';
import { BookOpen, Eye, EyeOff, GraduationCap, ShieldCheck, Users } from 'lucide-react';
import type { AppSettings, RoleName } from '../../shared/types.ts';
import { apiFetch, setAuthToken } from '../lib/api.ts';

export function LoginPage({
  appSettings,
  onLoginSuccess,
}: {
  appSettings: AppSettings;
  onLoginSuccess: () => void;
}) {
  const [roleTab, setRoleTab] = useState<RoleName>('student');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; role: RoleName; token?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          password,
          expectedRole: roleTab,
        }),
      });
      if (res.token) {
        setAuthToken(res.token);
      }
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke sistem.');
    } finally {
      setLoading(false);
    }
  };

  const roleConfig: Record<RoleName, { title: string; helper: string; placeholder: string }> = {
    student: {
      title: 'Peserta Didik',
      helper: 'Gunakan username dan kata sandi yang diberikan oleh guru kelas.',
      placeholder: 'Contoh: siswa_ahmad',
    },
    parent: {
      title: 'Orang Tua / Wali',
      helper: 'Masuk untuk memantau nilai ulangan dan perkembangan belajar anak.',
      placeholder: 'Contoh: ortu_ahmad',
    },
    superadmin: {
      title: 'Superadmin (Guru)',
      helper: 'Kelola peserta didik, bank soal, jadwal ulangan, dan rekap nilai.',
      placeholder: 'Masukkan username guru',
    },
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row items-stretch">
      {/* Left Visual Column */}
      <div className="lg:w-1/2 bg-blue-800 text-white flex flex-col justify-between p-6 sm:p-10 lg:p-14">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 border border-white/20">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-display text-lg font-bold tracking-tight">ULANGAN HARIAN KELAS 3</p>
              <p className="text-xs text-blue-100">Sistem Evaluasi Pembelajaran Digital</p>
            </div>
          </div>

          <div className="mt-8 lg:mt-12 max-w-xl">
            <h1 className="font-display text-2xl sm:text-4xl font-bold leading-tight text-balance">
              Evaluasi belajar lebih rapi, ramah anak, dan transparan untuk orang tua.
            </h1>
            <p className="mt-4 text-sm sm:text-base text-blue-100 leading-relaxed">
              {appSettings.school_name} · {appSettings.class_level} · {appSettings.curriculum} · Tahun Ajaran{' '}
              {appSettings.academic_year}
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl overflow-hidden border border-white/15 bg-blue-900/40 shadow-lg">
          <img
            src="/src/assets/images/login_classroom_hero_1795188634468.jpg"
            alt="Meja belajar siswa kelas 3 SD dengan buku dan alat tulis"
            referrerPolicy="no-referrer"
            className="w-full h-56 sm:h-72 lg:h-80 object-cover"
          />
        </div>
      </div>

      {/* Right Login Column */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-16 bg-slate-50">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="mb-6">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">Masuk ke Aplikasi</h2>
            <p className="mt-1 text-sm text-slate-500">Pilih jenis akses pengguna Anda di bawah ini.</p>
          </div>

          {/* 3 Role Segmented Selector */}
          <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1 mb-6">
            <button
              type="button"
              onClick={() => {
                setRoleTab('student');
                setError('');
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                roleTab === 'student' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-4 h-4 shrink-0" />
              <span>Siswa</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRoleTab('parent');
                setError('');
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                roleTab === 'parent' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Orang Tua</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRoleTab('superadmin');
                setError('');
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                roleTab === 'superadmin' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Guru</span>
            </button>
          </div>

          <div className="mb-5 rounded-xl bg-blue-50/70 border border-blue-100 px-4 py-3">
            <p className="text-xs font-bold text-blue-900">{roleConfig[roleTab].title}</p>
            <p className="mt-0.5 text-xs text-blue-800/80 leading-relaxed">{roleConfig[roleTab].helper}</p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-username" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                required
                autoComplete="username"
                placeholder={roleConfig[roleTab].placeholder}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Masukkan kata sandi"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white pl-4 pr-11 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-700 py-3 px-4 text-sm font-semibold text-white hover:bg-blue-800 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {loading ? 'Memeriksa Akun...' : `Masuk sebagai ${roleConfig[roleTab].title}`}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Jika lupa kata sandi, silakan hubungi Guru Kelas III (Superadmin) untuk mengatur ulang akun Anda.
          </p>
        </div>
      </div>
    </div>
  );
}
