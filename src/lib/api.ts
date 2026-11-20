const AUTH_TOKEN_KEY = 'uh_k3_auth_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // ignore storage errors
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function apiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getAuthToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { error: text || 'Terjadi kesalahan pada server.' };
  }

  if (!res.ok) {
    const err = new Error(String(data.error || 'Permintaan gagal diproses.')) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = typeof data.code === 'string' ? data.code : undefined;
    throw err;
  }

  return data as T;
}

export function getOrCreateExamDeviceToken(examId: number): string {
  const key = `uh_k3_device_token_${examId}`;
  let existing = localStorage.getItem(key);
  if (!existing) {
    existing =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, existing);
  }
  return existing;
}

export function formatDateId(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const parsed = new Date(dateStr.includes('T') || dateStr.includes(' ') ? dateStr.replace(' ', 'T') : `${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTimeId(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const iso = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + (dateStr.endsWith('Z') ? '' : 'Z');
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
