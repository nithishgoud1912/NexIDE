import { useEffect, useRef } from "react";
import { WebContainer, FileSystemTree } from "@webcontainer/api";
import { Session } from "next-auth";
import { toast } from "sonner";
import { getRecentProjects } from "@/lib/recent-projects";

type WebContainerState = "booting" | "ready" | "error";

interface UseWorkspaceInitOptions {
  state: WebContainerState;
  instance: WebContainer | null;
  session: Session | null;
  searchParams: URLSearchParams | null;
  files: FileSystemTree | null;
  isMounting: boolean;
  currentProjectId: string;
  rootHandle: FileSystemDirectoryHandle | null;
  setProjectName: (name: string) => void;
  setRootHandle: (handle: FileSystemDirectoryHandle | null) => void;
  setCurrentRepoUrl: (url: string) => void;
  setCurrentProjectId: (id: string) => void;
  setOpenFiles: (files: any[]) => void;
  setActiveFilePath: (path: string) => void;
  setIsInitializing: (v: boolean) => void;
  setShowAutoOpenPrompt: (v: boolean) => void;
  setShowCloneLanding: (v: boolean) => void;
  handleOpenFolder: (handle?: FileSystemDirectoryHandle) => Promise<void>;
}

/**
 * Handles the initial workspace load based on URL params:
 * - action=open + projectId → restore recent project
 * - action=clone → show clone landing
 * - no params → show empty workspace
 */
export function useWorkspaceInit({
  state,
  instance,
  session,
  searchParams,
  files,
  isMounting,
  currentProjectId,
  rootHandle,
  setProjectName,
  setRootHandle,
  setCurrentRepoUrl,
  setCurrentProjectId,
  setOpenFiles,
  setActiveFilePath,
  setIsInitializing,
  setShowAutoOpenPrompt,
  setShowCloneLanding,
  handleOpenFolder,
}: UseWorkspaceInitOptions) {
  const hasInitialized = useRef(false);

  useEffect(() => {
    const projectId = searchParams?.get("projectId");
    const action = searchParams?.get("action");

    if (state === "error") {
      setIsInitializing(false);
      return;
    }

    if (state !== "ready" || !instance) return;
    // Only run once per mount
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    if (action === "open" && projectId) {
      const loadProject = async () => {
        try {
          const recents = await getRecentProjects();
          const match = recents.find((p) => p.id === projectId);

          if (match) {
            setProjectName(match.name);
            setRootHandle(match.handle || null);
            setCurrentRepoUrl(match.repoUrl || "");

            if (match.handle) {
              const status = await (
                match.handle as FileSystemDirectoryHandle & {
                  queryPermission: (opts: {
                    mode: string;
                  }) => Promise<PermissionState>;
                }
              ).queryPermission({ mode: "readwrite" });

              if (status === "granted") {
                if (!files && !isMounting) {
                  await handleOpenFolder(match.handle);
                }
              } else {
                setShowAutoOpenPrompt(true);
                setIsInitializing(false);
              }
            } else if (match.repoUrl && !files && !isMounting) {
              window.history.replaceState(
                null,
                "",
                `/workspace?action=clone&repo=${match.repoUrl}`,
              );
              setIsInitializing(false);
            } else {
              setIsInitializing(false);
            }
          } else {
            setIsInitializing(false);
          }
        } catch (err) {
          console.error("Load project failed:", err);
          setIsInitializing(false);
        }
      };
      loadProject();
    } else if (action === "clone") {
      setShowCloneLanding(true);
      setIsInitializing(false);
    } else {
      setIsInitializing(false);
    }
  }, [state, instance]); // Intentionally minimal deps — runs once when ready
}
