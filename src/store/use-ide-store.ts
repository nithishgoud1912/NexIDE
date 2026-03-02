import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface OpenFile {
  path: string;
  name: string;
  content: string | Uint8Array;
}

interface IDEState {
  projectName: string;
  projectId: string;
  repoUrl: string;
  activeFilePath: string;
  secondaryActiveFilePath: string | null;
  activeEditor: "primary" | "secondary";
  openFiles: OpenFile[];
  isAutoSave: boolean;
  autoSaveDelay: number;
  fontSize: number;
  theme: string;
  showLineNumbers: boolean;
  wordWrap: "on" | "off";
  emmetEnabled: boolean;
  rootHandle: FileSystemDirectoryHandle | null;
  projectPaths: Record<string, string>;
  unsavedFiles: Set<string>;

  setProjectName: (name: string) => void;
  setProjectId: (id: string) => void;
  setRepoUrl: (url: string) => void;
  setActiveFilePath: (path: string) => void;
  setSecondaryActiveFilePath: (path: string | null) => void;
  setActiveEditor: (editor: "primary" | "secondary") => void;
  setOpenFiles: (
    files: OpenFile[] | ((prev: OpenFile[]) => OpenFile[]),
  ) => void;
  setIsAutoSave: (isAutoSave: boolean) => void;
  setAutoSaveDelay: (delay: number) => void;
  setFontSize: (size: number) => void;
  setTheme: (theme: string) => void;
  setShowLineNumbers: (show: boolean) => void;
  setWordWrap: (wrap: "on" | "off") => void;
  setEmmetEnabled: (enabled: boolean) => void;
  setRootHandle: (handle: FileSystemDirectoryHandle | null) => void;
  setProjectPath: (projectId: string, path: string) => void;

  markFileUnsaved: (path: string) => void;
  markFileSaved: (path: string) => void;
  addOpenFile: (file: OpenFile) => void;
  closeFile: (path: string) => void;
  closeAllFiles: () => void;
  updateFileContent: (path: string, content: string | Uint8Array) => void;
}

export const useIDEStore = create<IDEState>()(
  persist(
    (set) => ({
      projectName: "NexIDE Workspace",
      projectId: "",
      repoUrl: "",
      activeFilePath: "",
      secondaryActiveFilePath: null,
      activeEditor: "primary",
      openFiles: [],
      isAutoSave: true,
      autoSaveDelay: 800,
      fontSize: 14,
      theme: "vs-dark",
      showLineNumbers: true,
      wordWrap: "on",
      emmetEnabled: true,
      rootHandle: null,
      projectPaths: {},
      unsavedFiles: new Set(),

      setProjectName: (name: string) => set({ projectName: name }),
      setProjectId: (id: string) => set({ projectId: id }),
      setRepoUrl: (url: string) => set({ repoUrl: url }),
      setActiveFilePath: (path: string) => set({ activeFilePath: path }),
      setSecondaryActiveFilePath: (path) =>
        set({ secondaryActiveFilePath: path }),
      setActiveEditor: (editor) => set({ activeEditor: editor }),
      setOpenFiles: (files) =>
        set((state) => ({
          openFiles:
            typeof files === "function" ? files(state.openFiles) : files,
        })),
      setIsAutoSave: (isAutoSave: boolean) => set({ isAutoSave }),
      setAutoSaveDelay: (autoSaveDelay: number) => set({ autoSaveDelay }),
      setFontSize: (size: number) => set({ fontSize: size }),
      setTheme: (theme: string) => set({ theme }),
      setShowLineNumbers: (show: boolean) => set({ showLineNumbers: show }),
      setWordWrap: (wrap: "on" | "off") => set({ wordWrap: wrap }),
      setEmmetEnabled: (enabled: boolean) => set({ emmetEnabled: enabled }),
      setRootHandle: (handle: FileSystemDirectoryHandle | null) =>
        set({ rootHandle: handle }),
      setProjectPath: (projectId: string, path: string) =>
        set((state) => ({
          projectPaths: { ...state.projectPaths, [projectId]: path },
        })),

      markFileUnsaved: (path: string) =>
        set((state) => {
          const newSet = new Set(state.unsavedFiles);
          newSet.add(path);
          return { unsavedFiles: newSet };
        }),
      markFileSaved: (path: string) =>
        set((state) => {
          const newSet = new Set(state.unsavedFiles);
          newSet.delete(path);
          return { unsavedFiles: newSet };
        }),

      addOpenFile: (file: OpenFile) =>
        set((state) => {
          if (state.openFiles.find((f) => f.path === file.path)) {
            // Update existing file content instead of ignoring
            return {
              openFiles: state.openFiles.map((f) =>
                f.path === file.path ? { ...f, content: file.content } : f,
              ),
            };
          }
          return { openFiles: [...state.openFiles, file] };
        }),

      closeFile: (path: string) =>
        set((state) => {
          console.log("[useIDEStore] Closing file:", path);
          const nextFiles = state.openFiles.filter((f) => f.path !== path);
          let nextActive = state.activeFilePath;
          let nextSecondary = state.secondaryActiveFilePath;

          if (state.activeFilePath === path) {
            nextActive =
              nextFiles.length > 0 ? nextFiles[nextFiles.length - 1].path : "";
          }
          if (state.secondaryActiveFilePath === path) {
            nextSecondary = null;
            // If secondary was active but closed, logic handled here
          }

          // Also remove from unsaved
          const newUnsaved = new Set(state.unsavedFiles);
          newUnsaved.delete(path);
          return {
            openFiles: nextFiles,
            activeFilePath: nextActive,
            secondaryActiveFilePath: nextSecondary,
            unsavedFiles: newUnsaved,
          };
        }),

      closeAllFiles: () =>
        set({
          openFiles: [],
          activeFilePath: "",
          secondaryActiveFilePath: null,
          unsavedFiles: new Set(),
        }),

      updateFileContent: (path: string, content: string | Uint8Array) =>
        set((state) => ({
          openFiles: state.openFiles.map((f) =>
            f.path === path ? { ...f, content } : f,
          ),
        })),
    }),
    {
      name: "nexide-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        projectName: state.projectName,
        projectId: state.projectId,
        repoUrl: state.repoUrl,
        activeFilePath: state.activeFilePath,
        secondaryActiveFilePath: state.secondaryActiveFilePath,
        activeEditor: state.activeEditor,
        // Only persist paths, not content (content is re-read from FS on open)
        openFiles: state.openFiles.map((f) => ({
          path: f.path,
          name: f.name,
          content: typeof f.content === "string" ? "" : "",
        })),
        isAutoSave: state.isAutoSave,
        autoSaveDelay: state.autoSaveDelay,
        fontSize: state.fontSize,
        theme: state.theme,
        showLineNumbers: state.showLineNumbers,
        wordWrap: state.wordWrap,
        emmetEnabled: state.emmetEnabled,
        projectPaths: state.projectPaths,
        // Convert Set to Array for JSON serialization
        unsavedFiles: [] as string[],
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert Array back to Set after rehydration
          state.unsavedFiles = new Set(
            Array.isArray(state.unsavedFiles) ? state.unsavedFiles : [],
          );
        }
      },
    },
  ),
);
