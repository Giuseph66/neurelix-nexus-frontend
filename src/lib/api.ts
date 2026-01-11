import { getAccessToken } from '@/lib/authTokens';

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function getBaseUrl() {
  const base = import.meta.env.VITE_API_URL as string | undefined;
  console.log('base', base);
  if (!base) {
    throw new Error('VITE_API_URL não configurada');
  }
  return base.replace(/\/$/, '');
}

export type ApiFetchOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  auth?: boolean;
};

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const url = `${getBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;

  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.auth !== false) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const resp = await fetch(url, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const contentType = resp.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await resp.json().catch(() => null) : await resp.text().catch(() => null);

  if (!resp.ok) {
    const msg =
      (payload && typeof payload === 'object' && 'error' in (payload as any) && String((payload as any).error)) ||
      resp.statusText ||
      'Erro na API';
    throw new ApiError(msg, resp.status, payload);
  }

  return payload as T;
}


