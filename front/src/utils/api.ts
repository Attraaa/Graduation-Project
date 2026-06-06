const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const getToken = () => localStorage.getItem('moti.token');

export const api = {
  async post<T>(path: string, body: unknown, auth = false): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? '서버 오류가 발생했습니다.');
    return data as T;
  },

  async get<T>(path: string, auth = true): Promise<T> {
    const headers: Record<string, string> = {};
    if (auth) {
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${BASE_URL}${path}`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? '서버 오류가 발생했습니다.');
    return data as T;
  },

  async patch<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? '서버 오류가 발생했습니다.');
    return data as T;
  },

  async put<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? '서버 오류가 발생했습니다.');
    return data as T;
  },
};

export const setToken = (token: string) => localStorage.setItem('moti.token', token);
export const removeToken = () => localStorage.removeItem('moti.token');
