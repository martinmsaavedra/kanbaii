const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `API error: ${res.status}`);
  }
  return json.data;
}

export const api = {
  // Health (returns root-level fields, not wrapped in .data)
  getHealth: async (): Promise<{ cwd: string; version: string }> => {
    const res = await fetch(`${API_BASE}/api/health`);
    return res.json();
  },

  // Projects
  listProjects: () => apiFetch<any[]>('/api/projects'),
  getProject: (slug: string) => apiFetch<any>(`/api/projects/${slug}`),
  createProject: (data: { title: string; description?: string; color?: string }) =>
    apiFetch<any>('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (slug: string, data: Record<string, unknown>) =>
    apiFetch<any>(`/api/projects/${slug}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (slug: string) =>
    apiFetch<void>(`/api/projects/${slug}`, { method: 'DELETE' }),

  // Work Items
  listWorkItems: (projectSlug: string) =>
    apiFetch<any[]>(`/api/projects/${projectSlug}/work-items`),
  getWorkItem: (projectSlug: string, wiId: string) =>
    apiFetch<any>(`/api/projects/${projectSlug}/work-items/${wiId}`),
  createWorkItem: (projectSlug: string, data: Record<string, unknown>) =>
    apiFetch<any>(`/api/projects/${projectSlug}/work-items`, { method: 'POST', body: JSON.stringify(data) }),
  updateWorkItem: (projectSlug: string, wiId: string, data: Record<string, unknown>) =>
    apiFetch<any>(`/api/projects/${projectSlug}/work-items/${wiId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteWorkItem: (projectSlug: string, wiId: string) =>
    apiFetch<void>(`/api/projects/${projectSlug}/work-items/${wiId}`, { method: 'DELETE' }),

  // Tasks
  createTask: (projectSlug: string, wiId: string, data: Record<string, unknown>) =>
    apiFetch<any>(`/api/projects/${projectSlug}/work-items/${wiId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (projectSlug: string, wiId: string, taskId: string, data: Record<string, unknown>) =>
    apiFetch<any>(`/api/projects/${projectSlug}/work-items/${wiId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  moveTask: (projectSlug: string, wiId: string, taskId: string, data: { toColumn: string; toIndex: number }) =>
    apiFetch<any>(`/api/projects/${projectSlug}/work-items/${wiId}/tasks/${taskId}/move`, { method: 'POST', body: JSON.stringify(data) }),
  deleteTask: (projectSlug: string, wiId: string, taskId: string) =>
    apiFetch<void>(`/api/projects/${projectSlug}/work-items/${wiId}/tasks/${taskId}`, { method: 'DELETE' }),
};
