import { useEffect, useRef } from "react";

interface UseProjectSyncProps {
  currentProjectId: string | null;
  rootHandle: FileSystemDirectoryHandle | null;
  currentLocalPath?: string;
  setProjectPath: (projectId: string, path: string) => void;
  updateRootPath: (path: string) => void;
  findProjectOnHost: (name: string) => void;
  openProjectPath: (path: string) => void;
  setShowPathInput: (show: boolean) => void;
}

export function useProjectSync({
  currentProjectId,
  rootHandle,
  currentLocalPath,
  setProjectPath,
  updateRootPath,
  findProjectOnHost,
  openProjectPath,
  setShowPathInput,
}: UseProjectSyncProps) {
  const searchedProjectsRef = useRef<Set<string>>(new Set());
  const syncedPathRef = useRef<string | null>(null);

  // Listen for project-located event from the shell
  useEffect(() => {
    const handleProjectLocated = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      const path = customEvent.detail;
      if (currentProjectId) {
        setProjectPath(currentProjectId, path);
      }
      updateRootPath(path);
    };

    const handleRootConfirmed = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      const path = customEvent.detail;
      syncedPathRef.current = path;
      if (currentProjectId) {
        setProjectPath(currentProjectId, path);
      }
    };

    const handleProjectNotFound = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      console.warn(
        `[Workspace] Project "${customEvent.detail}" not found on host machine.`,
      );
      setShowPathInput(true);
    };

    window.addEventListener("project-located", handleProjectLocated);
    window.addEventListener("root-path-confirmed", handleRootConfirmed);
    window.addEventListener("project-not-found", handleProjectNotFound);

    return () => {
      window.removeEventListener("project-located", handleProjectLocated);
      window.removeEventListener("root-path-confirmed", handleRootConfirmed);
      window.removeEventListener("project-not-found", handleProjectNotFound);
    };
  }, [currentProjectId, setProjectPath, updateRootPath, setShowPathInput]);

  // Sync with host on initial load or connection
  useEffect(() => {
    if (!currentProjectId || !rootHandle) return;

    if (currentLocalPath) {
      if (syncedPathRef.current === currentLocalPath) return;
      openProjectPath(currentLocalPath);
      syncedPathRef.current = currentLocalPath;
    } else {
      if (!searchedProjectsRef.current.has(currentProjectId)) {
        searchedProjectsRef.current.add(currentProjectId);
        findProjectOnHost(rootHandle.name);
      }
    }
  }, [
    currentProjectId,
    rootHandle,
    currentLocalPath,
    openProjectPath,
    findProjectOnHost,
  ]);

  return { syncedPathRef, searchedProjectsRef };
}
