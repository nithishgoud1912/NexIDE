import { get, set, del } from "idb-keyval";

const RECENT_PROJECTS_KEY = "nexide-recent-projects";

export interface RecentProject {
  id: string; // Internal Unique ID
  name: string;
  handle?: FileSystemDirectoryHandle;
  repoUrl?: string;
  lastOpened: number;
}

function generateId() {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export async function addRecentProject(
  name: string,
  handle?: FileSystemDirectoryHandle,
  repoUrl?: string,
) {
  const projects = await getRecentProjects();
  const existing = projects.find(
    (p) => p.name === name || (repoUrl && p.repoUrl === repoUrl),
  );

  const id = existing?.id || generateId();

  const newProjects: RecentProject[] = [
    { id, name, handle, repoUrl, lastOpened: Date.now() },
    ...projects.filter((p) => p.id !== id),
  ].slice(0, 15); // Keep last 15

  await set(RECENT_PROJECTS_KEY, newProjects);
  return id;
}

export async function getRecentProjects(): Promise<RecentProject[]> {
  if (typeof window === "undefined") return [];
  const projects = await get(RECENT_PROJECTS_KEY);
  return projects || [];
}

export async function clearRecentProjects() {
  await del(RECENT_PROJECTS_KEY);
}

export async function removeRecentProject(id: string) {
  const projects = await getRecentProjects();
  const newProjects = projects.filter((p) => p.id !== id);
  await set(RECENT_PROJECTS_KEY, newProjects);
}
