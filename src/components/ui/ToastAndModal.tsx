import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => {
          const styles =
            t.variant === 'success'
              ? 'bg-emerald-700 text-white border-emerald-800'
              : t.variant === 'error'
                ? 'bg-red-700 text-white border-red-800'
                : t.variant === 'warning'
                  ? 'bg-amber-600 text-white border-amber-700'
                  : 'bg-slate-900 text-white border-slate-800';
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-all ${styles}`}
            >
              {t.variant === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              ) : t.variant === 'error' || t.variant === 'warning' ? (
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
              )}
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="opacity-80 hover:opacity-100 shrink-0"
                aria-label="Tutup notifikasi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">{message}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-700 hover:bg-blue-800'
            } disabled:opacity-60`}
          >
            {loading ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700 mb-4">{icon}</div>
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-slate-500 leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Memuat data...' }: { label?: string }) {
  return (
    <div className="space-y-4 py-6">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
        <span>{label}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="h-24 rounded-xl bg-slate-200/70 animate-pulse" />
        <div className="h-24 rounded-xl bg-slate-200/70 animate-pulse" />
        <div className="h-24 rounded-xl bg-slate-200/70 animate-pulse" />
      </div>
    </div>
  );
}

export function ScoreBarChart({
  data,
  kktpLine,
  emptyText = 'Belum ada data nilai untuk ditampilkan.',
}: {
  data: Array<{ label: string; score: number; subtitle?: string }>;
  kktpLine?: number;
  emptyText?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }

  const maxVal = 100;
  const chartHeight = 180;
  const kktpY = kktpLine !== undefined ? chartHeight - (Math.min(100, Math.max(0, kktpLine)) / maxVal) * chartHeight : null;

  return (
    <div className="relative w-full">
      <div className="flex items-end gap-3 pt-6 pb-2 px-2 overflow-x-auto">
        <div className="flex flex-col justify-between h-[180px] text-[11px] font-mono tabular-nums text-slate-400 pr-2 border-r border-slate-200 shrink-0">
          <span>100</span>
          <span>75</span>
          <span>50</span>
          <span>25</span>
          <span>0</span>
        </div>
        <div className="relative flex-1 min-w-[320px] h-[180px] flex items-end gap-3 sm:gap-4 px-2">
          {/* Grid lines */}
          {[25, 50, 75, 100].map((v) => (
            <div
              key={v}
              className="absolute left-0 right-0 border-t border-slate-100 pointer-events-none"
              style={{ bottom: `${(v / maxVal) * 100}%` }}
            />
          ))}
          {kktpY !== null && (
            <div
              className="absolute left-0 right-0 border-t-2 border-dashed border-emerald-500/70 pointer-events-none flex justify-end"
              style={{ top: `${kktpY}px` }}
            >
              <span className="-mt-4 bg-white px-1 text-[10px] font-mono tabular-nums font-semibold text-emerald-700">
                KKTP {kktpLine}
              </span>
            </div>
          )}

          {data.map((d, idx) => {
            const pct = Math.min(100, Math.max(0, d.score));
            const isAboveKktp = kktpLine !== undefined ? d.score >= kktpLine : true;
            return (
              <div
                key={`${d.label}-${idx}`}
                className="relative flex-1 min-w-[44px] max-w-[84px] h-full flex flex-col justify-end items-center group"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {hoveredIdx === idx && (
                  <div className="absolute -top-9 z-10 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow-md tabular-nums">
                    {d.score} {d.subtitle ? `· ${d.subtitle}` : ''}
                  </div>
                )}
                <span className="mb-1 text-[11px] font-mono tabular-nums font-semibold text-slate-700">
                  {d.score}
                </span>
                <div
                  className={`w-full max-w-[40px] rounded-t-lg transition-all duration-200 ${
                    isAboveKktp ? 'bg-blue-600 group-hover:bg-blue-700' : 'bg-amber-500 group-hover:bg-amber-600'
                  }`}
                  style={{ height: `${Math.max(4, pct)}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-start gap-3 sm:gap-4 pl-11 pr-2 mt-1 overflow-x-auto">
        {data.map((d, idx) => (
          <div key={`lbl-${idx}`} className="flex-1 min-w-[44px] max-w-[84px] text-center">
            <p className="text-[11px] text-slate-600 truncate" title={d.label}>
              {d.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
