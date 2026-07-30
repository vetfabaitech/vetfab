/** Save/load/list explorer workspace snapshots against the backend's
 * Supabase-backed /api/v1/project endpoints. No store imports here (kept
 * pure fetch wrappers) so explorerStore can import this without a cycle.
 *
 * One snapshot per `projectId` -- callers own picking/generating that id
 * (see explorerStore.slugifyProjectId), it's just an opaque string here.
 *
 * Every call sends the stored session token -- the backend uses it to scope
 * save/load/list/delete to the signed-in account (see backend/app/api/deps.py
 * and app/services/project_storage_service.py), not just to identify who's
 * asking. AuthGuard guarantees a token exists before any of this app's pages
 * render, so `authHeaders()` is never called with nothing stored. */
import { getStoredAuthToken } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authHeaders(): HeadersInit {
  const token = getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface SaveProjectResult {
  savedAt: string;
  sizeBytes: number;
}

export interface LoadProjectResult {
  snapshot: Record<string, unknown> | null;
  savedAt: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  sizeBytes: number;
  updatedAt: string;
}

async function errorDetail(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.detail ?? fallback;
}

export async function saveProjectSnapshot(
  projectId: string,
  name: string,
  snapshot: object
): Promise<SaveProjectResult> {
  const res = await fetch(`${API_URL}/api/v1/project/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ projectId, name, snapshot }),
  });
  if (!res.ok) throw new Error(await errorDetail(res, `Save failed (${res.status})`));
  const data = await res.json();
  return { savedAt: data.savedAt, sizeBytes: data.sizeBytes };
}

export async function loadProjectSnapshot(projectId: string): Promise<LoadProjectResult> {
  const res = await fetch(`${API_URL}/api/v1/project/load/${encodeURIComponent(projectId)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await errorDetail(res, `Load failed (${res.status})`));
  const data = await res.json();
  return { snapshot: data.snapshot, savedAt: data.savedAt };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const res = await fetch(`${API_URL}/api/v1/project/list`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await errorDetail(res, `List failed (${res.status})`));
  const data = await res.json();
  return data.projects;
}
