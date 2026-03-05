import type { Environment, Session } from '@/types';

const API_BASE = '/api';

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

export function getEnvironments(): Promise<Environment[]> {
  return api('GET', '/environments');
}

export function getSessions(): Promise<Session[]> {
  return api('GET', '/sessions');
}

export function createSession(envId: string, title: string, prompt?: string): Promise<{ id: string }> {
  return api('POST', '/sessions', {
    environment_id: envId,
    title: title || 'Remote Session',
    prompt: prompt || undefined,
  });
}

export function respondToPermission(
  sessionId: string,
  requestId: string,
  approved: boolean,
  updatedInput?: unknown
): Promise<void> {
  return api('POST', `/sessions/${sessionId}/permission`, {
    request_id: requestId,
    behavior: approved ? 'allow' : 'deny',
    ...(updatedInput ? { updatedInput } : {}),
  });
}

export function interruptSession(sessionId: string): Promise<void> {
  return api('POST', `/sessions/${sessionId}/interrupt`);
}
