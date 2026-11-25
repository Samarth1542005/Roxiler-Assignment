export type Role = 'admin' | 'user' | 'owner';

export interface User {
  id: string;
  name: string;
  email: string;
  address: string;
  role: Role;
}

export interface Store {
  id: string;
  name: string;
  email?: string;
  address: string;
  owner_id?: string | null;
  owner_name?: string | null;
  overall_rating?: number | null;
  rating?: number | null;
  average_rating?: number | null;
  rating_count: number;
  user_rating?: number | null;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body as T;
}

export function queryString(values: Record<string, string>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}
