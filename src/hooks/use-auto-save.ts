import { useCallback, useRef } from "react";
import { WebContainer } from "@webcontainer/api";
import { OpenFile } from "@/store/use-ide-store";

interface UseAutoSaveOptions {
  instance: WebContainer | null;
  rootHandle: FileSystemDirectoryHandle | null;
  openFiles: OpenFile[];
  markFileSaved: (path: string) => void;
  sendCommand: (cmd: string) => void;
}

export function useAutoSave({
  instance,
  rootHandle,
  openFiles,
  markFileSaved,
  sendCommand,
}: UseAutoSaveOptions) {
  const saveQueueRef = useRef<Map<string, string>>(new Map());
  const isSavingRef = useRef<Set<string>>(new Set());
  const openFilesRef = useRef(openFiles);

  // Keep ref in sync
  const syncOpenFilesRef = useCallback(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);

  const saveFile = useCallback(
    async (path: string, content: string | Uint8Array) => {
      try {
        // 1. Save to WebContainer
        if (instance) {
          await instance.fs.writeFile(path, content);
        }

        // 2. Save to local filesystem
        let localSaveSuccess = true;
        if (rootHandle) {
          try {
            const { saveFileLocally } = await import("@/lib/file-system");
            await saveFileLocally(rootHandle, path, content);
          } catch (e) {
            console.error("Local save failed:", e);
            localSaveSuccess = false;
          }
        }

        // 3. Mark as saved ONLY after both saves succeed and content hasn't changed
        if (localSaveSuccess) {
          setTimeout(() => {
            const currentFile = openFilesRef.current.find(
              (f) => f.path === path,
            );
            if (currentFile && currentFile.content === content) {
              markFileSaved(path);
            }
          }, 50);
        }

        // 4. Handle package.json changes — auto-install
        if (path === "package.json" || path.endsWith("/package.json")) {
          sendCommand("npm install");
        }
      } catch (error) {
        console.error("Save error:", error);
        throw error;
      }
    },
    [instance, rootHandle, markFileSaved, sendCommand],
  );

  /**
   * Enqueue a debounced save. Prevents concurrent saves of the same file.
   * Call this from onChange handlers.
   */
  const enqueueSave = useCallback(
    async (path: string, content: string, delayMs: number) => {
      saveQueueRef.current.set(path, content);

      if (isSavingRef.current.has(path)) return;
      isSavingRef.current.add(path);

      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const latestContent = saveQueueRef.current.get(path);
      saveQueueRef.current.delete(path);
      isSavingRef.current.delete(path);

      if (latestContent !== undefined) {
        await saveFile(path, latestContent);
      }
    },
    [saveFile],
  );

  return { saveFile, enqueueSave, syncOpenFilesRef };
}
