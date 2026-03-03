"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FolderOpen, Clock, Trash2, ChevronRight, Github } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  getRecentProjects,
  RecentProject,
  clearRecentProjects,
  removeRecentProject,
} from "@/lib/recent-projects";
import { useIDEStore } from "@/store/use-ide-store";
import { toast } from "sonner";

export function RecentProjectsList() {
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadProjects = useCallback(async () => {
    const data = await getRecentProjects();
    setProjects(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const getTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const handleProjectClick = async (project: RecentProject) => {
    try {
      if (!project.handle) {
        router.push(`/workspace?action=open&projectId=${project.id}`);
        return;
      }

      const handle = project.handle as FileSystemDirectoryHandle & {
        queryPermission: (opts: { mode: string }) => Promise<PermissionState>;
        requestPermission: (opts: { mode: string }) => Promise<PermissionState>;
      };

      const currentStatus = await handle.queryPermission({
        mode: "readwrite",
      });
      let status = currentStatus;
      if (status !== "granted") {
        status = await handle.requestPermission({
          mode: "readwrite",
        });
      }

      if (status === "granted") {
        const setRootHandle = useIDEStore.getState().setRootHandle;
        const setProjectName = useIDEStore.getState().setProjectName;
        const setProjectId = useIDEStore.getState().setProjectId;

        setProjectName(project.name);
        setRootHandle(project.handle || null);
        setProjectId(project.id);

        router.push(`/workspace?action=open&projectId=${project.id}`);
      }
    } catch (err) {
      console.error("Permission request failed:", err);
      router.push(`/workspace?action=open&projectId=${project.id}`);
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground">Loading your projects...</span>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center text-muted-foreground mx-auto">
          <FolderOpen className="w-8 h-8" />
        </div>
        <div>
          <h4 className="text-foreground font-medium">No recent projects</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Open a local folder to see it here.
          </p>
        </div>
        <Link
          href="/workspace?action=open"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/10 text-blue-400 border border-blue-500/20 text-xs font-medium hover:bg-blue-600/20 transition-all"
        >
          Open Folder
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground uppercase tracking-widest text-xs font-semibold">
          <Clock className="w-4 h-4" />
          Recent Projects
        </div>
        <button
          onClick={() => {
            toast("Clear all history?", {
              description:
                "This will remove all project history from your dashboard.",
              action: {
                label: "Clear All",
                onClick: async () => {
                  await clearRecentProjects();
                  setProjects([]);
                  toast.success("History cleared");
                },
              },
            });
          }}
          className="text-[10px] text-muted-foreground hover:text-red-400 flex items-center gap-1 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Clear History
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl divide-y divide-white/5 overflow-hidden">
        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() => handleProjectClick(project)}
            className="flex items-center justify-between p-4 hover:bg-card transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-accent border border-border flex items-center justify-center group-hover:bg-blue-500/10 transition-colors">
                <FolderOpen className="w-5 h-5 text-muted-foreground group-hover:text-blue-400" />
              </div>
              <div>
                <h4 className="font-medium text-foreground group-hover:text-white flex items-center gap-2">
                  {project.name}
                  {project.repoUrl && (
                    <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground bg-card px-1.5 py-0.5 rounded border border-border uppercase font-bold tracking-wider">
                      <Github className="w-3 h-3" />
                      Git
                    </span>
                  )}
                </h4>
                <p className="text-[10px] text-muted-foreground truncate max-w-[200px] font-mono mt-0.5 uppercase tracking-tighter">
                  ID: {project.id}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground group-hover:text-foreground mr-2">
                {getTimeAgo(project.lastOpened)}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast(`Remove ${project.name}?`, {
                    description:
                      "This will only remove it from history, not your disk.",
                    action: {
                      label: "Remove",
                      onClick: () => {
                        removeRecentProject(project.id).then(loadProjects);
                        toast.success("Project removed from history");
                      },
                    },
                  });
                }}
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Remove from history"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
