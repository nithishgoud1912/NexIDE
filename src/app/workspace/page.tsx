"use client";

import { useWebContainer } from "@/hooks/use-webcontainer";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  FolderOpen,
  Terminal as TerminalIcon,
  Code2,
  Github,
  CloudUpload,
  Download,
  Play,
  Settings as SettingsIcon,
  ChevronLeft,
  X,
  Plus,
  Trash2,
  RotateCcw,
  Eye,
  Globe,
  Layout,
  ChevronRight,
  TerminalSquare,
  LayoutTemplate,
  Save,
  SaveAll,
  RefreshCw,
  RotateCw,
  Check,
  Circle,
  ChevronDown,
  Folder,
  Columns,
  MessageSquare,
  Sparkles,
  XCircle,
  Search,
} from "lucide-react";
import { getFileIcon } from "@/components/file-tree";
import Link from "next/link";
import nextDynamic from "next/dynamic";
const Terminal = nextDynamic(() => import("@/components/terminal"), {
  ssr: false,
});
const CodeEditor = nextDynamic(() => import("@/components/editor"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-xs text-zinc-500 animate-pulse">
      Loading Editor...
    </div>
  ),
});
const SettingsWidget = nextDynamic(
  () =>
    import("@/components/settings-widget").then((mod) => mod.SettingsWidget),
  { ssr: false },
);
const AIChatPanel = nextDynamic(
  () => import("@/components/ai-chat-panel").then((mod) => mod.AIChatPanel),
  { ssr: false },
);
import {
  useState,
  useCallback,
  useEffect,
  Suspense,
  useRef,
  useMemo,
} from "react";
import { openLocalFolder, getWebContainerTree } from "@/lib/file-system";
import { FileSystemTree, WebContainer } from "@webcontainer/api";
import { FileTree } from "@/components/file-tree";
import { useSearchParams } from "next/navigation";
import Preview from "@/components/preview";
import { ShellProvider, useShell } from "@/context/shell-context";
import { useIDEStore } from "@/store/use-ide-store";
import { toast } from "sonner";
import { getRecentProjects } from "@/lib/recent-projects";
import { fetchRepoZip, transformZipToTree } from "@/lib/github-import";
import { useSession } from "next-auth/react";
import { downloadWebContainerAsZip } from "@/lib/download-zip";
import { pushToGitHub } from "@/lib/github-sync";
import { getRepo } from "@/lib/github";

export const dynamic = "force-dynamic";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilePlus, FolderPlus, Pencil } from "lucide-react";
import { WorkspaceErrorBoundary } from "@/components/error-boundary";
import { FindInFiles } from "@/components/find-in-files";
import { CommandPalette, CommandItem } from "@/components/command-palette";
import { GitDiffPanel } from "@/components/git-diff-panel";
import { GitBranch } from "lucide-react";

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="h-screen bg-[#0a0a0a]" />}>
      <ShellProvider>
        <WorkspaceErrorBoundary>
          <WorkspaceContent />
        </WorkspaceErrorBoundary>
      </ShellProvider>
    </Suspense>
  );
}

function WorkspaceContent() {
  const { instance, state } = useWebContainer();
  const {
    sendCommand,
    previewUrl,
    setPreviewUrl,
    activePort,
    interrupt,
    restart,

    syncSize,
    updateRootPath,
    findProjectOnHost,
    openProjectPath,
    destroy,
    terminal,
    subscribeToOutput,
  } = useShell();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const {
    projectName,
    setProjectName,
    projectId: currentProjectId,
    setProjectId: setCurrentProjectId,
    repoUrl: currentRepoUrl,
    setRepoUrl: setCurrentRepoUrl,
    activeFilePath,
    setActiveFilePath,
    openFiles,
    setOpenFiles,
    rootHandle,
    setRootHandle,
    addOpenFile,
    closeFile,
    closeAllFiles,
    updateFileContent,
    isAutoSave,
    setIsAutoSave,
    unsavedFiles,
    markFileUnsaved,
    markFileSaved,
    projectPaths,
    setProjectPath,
    autoSaveDelay,
    setAutoSaveDelay,
    secondaryActiveFilePath,
    setSecondaryActiveFilePath,
    activeEditor,
    setActiveEditor,
  } = useIDEStore();

  const currentLocalPath = currentProjectId
    ? projectPaths[currentProjectId]
    : undefined;

  const activeFilePrimary = useMemo(
    () => openFiles.find((f) => f.path === activeFilePath),
    [activeFilePath, openFiles],
  );
  const activeFileSecondary = useMemo(
    () => openFiles.find((f) => f.path === secondaryActiveFilePath),
    [secondaryActiveFilePath, openFiles],
  );

  const [files, setFiles] = useState<FileSystemTree | null>(null);
  const [isMounting, setIsMounting] = useState(false);
  const [isTerminalVisible, setIsTerminalVisible] = useState(true);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [promptDialog, setPromptDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    icon: React.ReactNode;
    placeholder: string;
    defaultValue: string;
    onConfirm: (val: string) => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    icon: null,
    placeholder: "",
    defaultValue: "",
    onConfirm: () => {},
  });
  const [promptValue, setPromptValue] = useState("");

  // activeFile state removed in favor of useMemo

  const [showAutoOpenPrompt, setShowAutoOpenPrompt] = useState(false);
  const [showCloneLanding, setShowCloneLanding] = useState(false);
  const [isFindInFilesOpen, setIsFindInFilesOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isGitDiffOpen, setIsGitDiffOpen] = useState(false);
  // Track original file contents for git diff (snapshot on file open)
  const originalContentsRef = useRef<Record<string, string>>({});

  const [isStartingServer, setIsStartingServer] = useState(false);
  const [showPathInput, setShowPathInput] = useState(false);
  const [manualPath, setManualPath] = useState("");
  const searchedProjectsRef = useRef<Set<string>>(new Set());
  const syncedPathRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Map<string, string>>(new Map());
  const isSavingRef = useRef<Set<string>>(new Set());
  const openFilesRef = useRef(openFiles);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+F → Find in Files
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setIsFindInFilesOpen((v) => !v);
        setIsCommandPaletteOpen(false);
        setIsGitDiffOpen(false);
      }
      // Ctrl+Shift+G → Git Diff / Source Control
      if (e.ctrlKey && e.shiftKey && e.key === "G") {
        e.preventDefault();
        setIsGitDiffOpen((v) => !v);
        setIsFindInFilesOpen(false);
        setIsCommandPaletteOpen(false);
      }
      // Ctrl+P → Command Palette
      if (e.ctrlKey && !e.shiftKey && e.key === "p") {
        e.preventDefault();
        setIsCommandPaletteOpen((v) => !v);
        setIsFindInFilesOpen(false);
        setIsGitDiffOpen(false);
      }
      // Ctrl+S → Save
      if (e.ctrlKey && !e.shiftKey && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilePath, openFiles]);

  // File Watcher for Sync Lock (Stability)
  useEffect(() => {
    if (!instance) return;

    let watcherPrimary: ReturnType<typeof instance.fs.watch> | null = null;
    let watcherSecondary: ReturnType<typeof instance.fs.watch> | null = null;

    const watchFile = (path: string, pane: "primary" | "secondary") => {
      try {
        return instance.fs.watch(path, async (event) => {
          // Sync Lock: Ignore external updates if this editor is focused
          if (isEditorFocused && activeEditor === pane) {
            return;
          }

          try {
            // Reload content from FS
            const content = await instance.fs.readFile(path, "utf-8");
            updateFileContent(path, content);
          } catch (e) {
            // File might be deleted
          }
        });
      } catch (e) {
        console.error("Failed to watch file:", path, e);
        return null;
      }
    };

    if (activeFilePath) {
      watcherPrimary = watchFile(activeFilePath, "primary");
    }

    if (secondaryActiveFilePath) {
      watcherSecondary = watchFile(secondaryActiveFilePath, "secondary");
    }

    return () => {
      watcherPrimary?.close();
      watcherSecondary?.close();
    };
  }, [
    instance,
    activeFilePath,
    secondaryActiveFilePath,
    isEditorFocused,
    activeEditor,
    updateFileContent,
  ]);

  // Keep openFilesRef in sync with state
  useEffect(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);

  // Watch for previewUrl changes to auto-navigate to current HTML file
  useEffect(() => {
    if (isStartingServer && previewUrl && activeFilePath?.endsWith(".html")) {
      // Ensure we don't loop
      if (previewUrl.includes(activeFilePath) && previewUrl.includes("?t=")) {
        return;
      }

      try {
        const urlObj = new URL(previewUrl);
        // Only trigger if the previewUrl is just the root origin
        if (urlObj.pathname === "/" || urlObj.pathname === "") {
          const fullUrl = `${urlObj.origin}/${activeFilePath}?t=${Date.now()}`;
          console.log(
            "[Workspace] Server detected, auto-navigating to:",
            fullUrl,
          );

          // IMPORTANT: Set flag to false FIRST to prevent infinite loop
          setIsStartingServer(false);
          setPreviewUrl(fullUrl);
        }
      } catch (e) {
        console.warn("Auto-navigation failed", e);
      }
    }
  }, [previewUrl, isStartingServer, activeFilePath, setPreviewUrl]);

  const fixPermissions = async (wc: WebContainer) => {
    try {
      const entries = await wc.fs.readdir("/", { withFileTypes: true });
      if (!entries.find((e) => e.name === "node_modules" && e.isDirectory()))
        return;
      await wc.spawn("chmod", ["-R", "+x", "node_modules/.bin"]);
    } catch (e) {
      console.warn("Failed to fix permissions:", e);
    }
  };

  const resetEnvironment = async () => {
    if (!instance) return;
    await restart(); // Full shell restart to clear stuck processes
    setTimeout(() => {
      sendCommand("npm install && clear");
    }, 1000); // Give shell time to boot
  };

  const handleOpenFolder = useCallback(
    async (existingHandle?: FileSystemDirectoryHandle) => {
      try {
        setIsMounting(true);
        setShowAutoOpenPrompt(false);

        // Clear URL params to prevent interfering logic from "clone" mode
        window.history.replaceState(null, "", "/workspace");

        let handle: FileSystemDirectoryHandle;
        let tree: FileSystemTree;
        const { getFileSystemTree } = await import("@/lib/file-system");

        if (existingHandle) {
          handle = existingHandle;
          tree = await getFileSystemTree(handle);
        } else if (rootHandle) {
          const status = await (
            rootHandle as FileSystemDirectoryHandle & {
              requestPermission: (opts: {
                mode: string;
              }) => Promise<PermissionState>;
            }
          ).requestPermission({
            mode: "readwrite",
          });
          if (status !== "granted") {
            // Cancelled
            return;
          }
          handle = rootHandle;
          tree = await getFileSystemTree(handle);
        } else {
          try {
            const result = await openLocalFolder();
            handle = result.handle;
            tree = result.tree;
          } catch (e: unknown) {
            // User cancelled or error
            return;
          }
        }

        setProjectName(handle.name);
        setRootHandle(handle);
        // Preserve repo URL if already set (cloning), otherwise clear it
        if (!existingHandle) {
          setCurrentRepoUrl("");
        }
        const { addRecentProject } = await import("@/lib/recent-projects");
        const newId = await addRecentProject(handle.name, handle);

        const isNewProject = newId !== currentProjectId;
        if (isNewProject) {
          setOpenFiles([]);
          setActiveFilePath("");
          // Reset original contents snapshot for new project
          originalContentsRef.current = {};
        }
        setCurrentProjectId(newId);

        // Update URL to include the projectId so it's "attached" to the current session
        const currentAction = searchParams?.get("action") || "open";
        const newUrl = `/workspace?action=${currentAction}&projectId=${newId}`;
        window.history.replaceState(null, "", newUrl);

        if (instance) {
          // Unmount previous? No API for that, just mount over.
          // Ideally we should empty the directory but it's risky.
          // For now, let's assume overwriting is okay or user reloads.

          await instance.mount(tree);
          await fixPermissions(instance);

          // Restore open files ONLY if same project (e.g. reload or re-open same folder)
          if (!isNewProject && openFiles.length > 0) {
            for (const file of openFiles) {
              await instance.fs.writeFile(file.path, file.content);
            }
          }

          setFiles(tree);
          if (tree["package.json"]) resetEnvironment();

          // Force UI update
          setIsInitializing(false);

          const existingPath = projectPaths[newId];
          if (existingPath) {
            openProjectPath(existingPath);
          } else {
            findProjectOnHost(handle.name);
          }
        }
      } catch (err: unknown) {
        console.error("Failed to open folder:", err);
        toast.error("Failed to open folder: " + String(err));
      } finally {
        setIsMounting(false);
        setIsInitializing(false);
      }
    },
    [
      instance,
      setProjectName,
      setRootHandle,
      rootHandle,
      currentProjectId,
      setCurrentProjectId,
      setOpenFiles,
      setActiveFilePath,
      sendCommand,
      currentLocalPath,
      setProjectPath,
      findProjectOnHost,
      openProjectPath,
    ],
  );

  const refreshFiles = useCallback(async () => {
    if (!instance) return;
    const tree = await getWebContainerTree(instance);
    setFiles(tree);
  }, [instance]);

  const handleFileClick = useCallback(
    async (path: string) => {
      if (!instance) return;
      try {
        const content = await instance.fs.readFile(path, "utf-8");
        const fileName = path.split("/").pop() || path;
        // Snapshot original content for git diff (only on first open)
        if (!originalContentsRef.current[path]) {
          originalContentsRef.current[path] = content;
        }
        addOpenFile({ path, name: fileName, content });
        setActiveFilePath(path);
      } catch (err) {
        console.error("Failed to read file:", err);
      }
    },
    [instance, addOpenFile, setActiveFilePath],
  );

  const handleFileCreate = useCallback(
    async (parentPath: string) => {
      setPromptValue("");
      setPromptDialog({
        isOpen: true,
        title: "Create New File",
        description: "Enter a name for your new file.",
        icon: <FilePlus className="w-5 h-5 text-blue-400" />,
        placeholder: "index.js",
        defaultValue: "",
        onConfirm: async (name) => {
          if (!instance) return;
          const path = parentPath ? `${parentPath}/${name}` : name;
          await instance.fs.writeFile(path, "");
          setPromptDialog((prev) => ({ ...prev, isOpen: false }));
          await refreshFiles();
        },
      });
    },
    [instance, refreshFiles],
  );

  const handleFolderCreate = useCallback(
    async (parentPath: string) => {
      setPromptValue("");
      setPromptDialog({
        isOpen: true,
        title: "Create New Folder",
        description: "Enter a name for your new directory.",
        icon: <FolderPlus className="w-5 h-5 text-blue-400" />,
        placeholder: "src",
        defaultValue: "",
        onConfirm: async (name) => {
          if (!instance) return;
          const path = parentPath ? `${parentPath}/${name}` : name;
          await instance.fs.mkdir(path);
          setPromptDialog((prev) => ({ ...prev, isOpen: false }));
          await refreshFiles();
        },
      });
    },
    [instance, refreshFiles],
  );

  const handleDelete = useCallback(
    async (path: string) => {
      if (!instance) return;

      toast(`Delete ${path}?`, {
        description: "This action cannot be undone.",
        action: {
          label: "Delete",
          onClick: async () => {
            await instance.fs.rm(path, { recursive: true });

            // Sync delete to local disk
            if (rootHandle) {
              try {
                const { deleteEntryLocally } =
                  await import("@/lib/file-system");
                await deleteEntryLocally(rootHandle, path);
              } catch (e) {
                console.error("Failed to delete locally:", e);
              }
            }

            await refreshFiles();
            if (activeFilePath === path) setActiveFilePath("");
            closeFile(path);
          },
        },
      });
    },
    [
      instance,
      refreshFiles,
      activeFilePath,
      setActiveFilePath,
      closeFile,
      rootHandle,
    ],
  );

  const handleRename = useCallback(
    async (oldPath: string) => {
      const oldName = oldPath.split("/").pop() || "";
      setPromptValue(oldName);
      setPromptDialog({
        isOpen: true,
        title: "Rename Item",
        description: `Enter a new name for "${oldName}".`,
        icon: <Pencil className="w-5 h-5 text-blue-400" />,
        placeholder: "new-name.js",
        defaultValue: oldName,
        onConfirm: async (newName) => {
          if (!newName || !instance || newName === oldName) return;

          const parentDir = oldPath.split("/").slice(0, -1).join("/");
          const newPath = parentDir ? `${parentDir}/${newName}` : newName;

          try {
            // 1. WebContainer rename (mv command is most reliable for internal use if fs.rename is flaky)
            const mv = await instance.spawn("mv", [oldPath, newPath]);
            await mv.exit;

            // 2. Sync to local disk
            if (rootHandle) {
              try {
                const { renameEntryLocally } =
                  await import("@/lib/file-system");
                await renameEntryLocally(rootHandle, oldPath, newPath);
              } catch (e) {
                console.error("Failed to rename locally:", e);
              }
            }

            // 3. Update open files store if the renamed file was open
            const wasActive = activeFilePath === oldPath;
            const fileInOpen = openFiles.find((f) => f.path === oldPath);

            if (fileInOpen) {
              setOpenFiles((prev) =>
                prev.map((f) =>
                  f.path === oldPath
                    ? { ...f, path: newPath, name: newName }
                    : f,
                ),
              );
              // Update active path if it was the one renamed
              if (wasActive) {
                setActiveFilePath(newPath);
              }
            }

            setPromptDialog((prev) => ({ ...prev, isOpen: false }));
            await refreshFiles();
          } catch (err) {
            console.error("Rename failed:", err);
            toast.error("Rename failed: " + String(err));
          }
        },
      });
    },
    [
      instance,
      rootHandle,
      refreshFiles,
      activeFilePath,
      setOpenFiles,
      setActiveFilePath,
      openFiles,
    ],
  );

  const handleManualPathSubmit = () => {
    if (manualPath && currentProjectId) {
      setProjectPath(currentProjectId, manualPath);
      openProjectPath(manualPath);
      setShowPathInput(false);
    }
  };

  const handleDownloadZip = useCallback(async () => {
    if (!instance) return;
    try {
      await downloadWebContainerAsZip(instance, projectName || "project");
    } catch (e) {
      console.error("Failed to download zip:", e);
      toast.error("Failed to download project zip.");
    }
  }, [instance, projectName]);

  const handlePushToGitHub = useCallback(async () => {
    if (!instance || !session?.accessToken) {
      toast.error("You must be signed in with GitHub to push changes.");
      return;
    }

    // Check URL param first, then fall back to the store value (set when opening a local folder linked to a repo)
    const repo = searchParams?.get("repo") || currentRepoUrl;
    if (!repo) {
      toast.warning(
        "No GitHub repository linked. Clone a repo or link one to enable push.",
      );
      return;
    }

    const owner = repo.split("/")[0];
    const repoName = repo.split("/")[1];

    try {
      if (terminal)
        terminal.writeln(
          "\r\n\x1b[33m[System] Verifying repository access...\x1b[0m",
        );

      // Check if user has push access
      try {
        const repoDetails = await getRepo(
          session.accessToken as string,
          owner,
          repoName,
        );
        if (!repoDetails.permissions?.push && !repoDetails.permissions?.admin) {
          throw new Error(
            "You do not have permission to push to this repository (not an owner/collaborator).",
          );
        }
      } catch (e: unknown) {
        throw new Error(
          "Failed to verify permissions: " +
            (e instanceof Error ? e.message : "Unknown error"),
        );
      }

      if (terminal)
        terminal.writeln(
          "\r\n\x1b[33m[System] Pushing changes to GitHub...\x1b[0m",
        );

      await pushToGitHub({
        token: session.accessToken as string,
        owner,
        repo: repoName,
        webcontainerInstance: instance,
        message: `Update from NexIDE at ${new Date().toLocaleString()}`,
      });

      if (terminal)
        terminal.writeln(
          "\x1b[32m[System] Successfully pushed to GitHub!\x1b[0m",
        );
      toast.success("Successfully pushed changes to GitHub!");
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error("Push failed:", err);
      if (terminal)
        terminal.writeln(`\x1b[31m[System] Push failed: ${err.message}\x1b[0m`);
      toast.error(`Failed to push to GitHub: ${err.message}`);
    }
  }, [instance, session, searchParams, terminal]);

  useEffect(() => {
    const projectId = searchParams?.get("projectId");
    const action = searchParams?.get("action");

    if (state === "error") {
      setIsInitializing(false);
      return;
    }

    if (state === "ready" && instance) {
      if (action === "open") {
        if (projectId) {
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
                  ).queryPermission({
                    mode: "readwrite",
                  });
                  if (status === "granted") {
                    if (!files && !isMounting)
                      await handleOpenFolder(match.handle);
                  } else {
                    setShowAutoOpenPrompt(true);
                    setIsInitializing(false);
                  }
                } else if (match.repoUrl && !files && !isMounting) {
                  // Fallback to clone behavior if it was a repo
                  window.history.replaceState(
                    null,
                    "",
                    `/workspace?action=clone&repo=${match.repoUrl}`,
                  );
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
          setIsInitializing(false);
        }
      } else if (action === "clone") {
        setShowCloneLanding(true);
        setIsInitializing(false);
      } else {
        setIsInitializing(false);
      }
    }
  }, [
    state,
    instance,
    searchParams,
    session,
    files,
    isMounting,
    setProjectName,
    setRootHandle,
    setCurrentRepoUrl,
    currentProjectId,
    setCurrentProjectId,
    setOpenFiles,
    setActiveFilePath,
    handleOpenFolder,
  ]);

  const handleCloneToLocal = async () => {
    const repoFullName = searchParams?.get("repo");
    if (!repoFullName || !session?.accessToken) return;

    const toastId = toast.loading(`Cloning ${repoFullName}...`, {
      description: "Please select a local folder to save the project.",
    });

    try {
      // 1. Ask user for a local folder
      const { handle } = await openLocalFolder();

      // Ensure we have write access
      const status = await (
        handle as FileSystemDirectoryHandle & {
          requestPermission: (opts: {
            mode: string;
          }) => Promise<PermissionState>;
        }
      ).requestPermission({
        mode: "readwrite",
      });

      if (status !== "granted") {
        toast.error("Permission denied to write to folder.", { id: toastId });
        return;
      }

      setShowCloneLanding(false);
      setIsMounting(true);

      toast.loading(`Cloning ${repoFullName}...`, {
        id: toastId,
        description: "Downloading files from GitHub...",
      });

      // 2. Fetch Zip
      const blob = await fetchRepoZip(
        repoFullName,
        session.accessToken as string,
      );

      toast.loading(`Cloning ${repoFullName}...`, {
        id: toastId,
        description: "Extracting and writing to disk...",
      });

      // 3. Transform to tree
      const tree = await transformZipToTree(blob);

      // 4. Write to local handle
      const { mountTreeLocally } = await import("@/lib/file-system");
      await mountTreeLocally(handle, tree);

      // 5. Update IDE state
      setProjectName(handle.name);
      setRootHandle(handle);
      setCurrentRepoUrl(repoFullName);

      // Save to recent projects
      const { addRecentProject } = await import("@/lib/recent-projects");
      const id = await addRecentProject(handle.name, handle, repoFullName);
      setCurrentProjectId(id);

      // Clear previous workspace state
      setOpenFiles([]);
      setActiveFilePath("");

      // Trigger WebContainer mount & terminal start
      await handleOpenFolder(handle);

      toast.success("Successfully cloned to local disk!", { id: toastId });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("Clone failed:", error);
      toast.error(`Clone failed: ${error.message}`, {
        id: toastId,
      });
      setIsMounting(false);
    }
  };

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
  }, [currentProjectId, setProjectPath, updateRootPath]);

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
    currentLocalPath,
    rootHandle,
    findProjectOnHost,
    openProjectPath,
  ]);

  const activeFile = useMemo(() => {
    return (
      openFiles.find((f) => f.path === activeFilePath) || {
        name: "",
        content: "",
      }
    );
  }, [activeFilePath, openFiles]);

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
            // Only mark saved if content hasn't changed since save started
            if (currentFile && currentFile.content === content) {
              markFileSaved(path);
            }
          }, 50);
        }

        // 4. Handle package.json changes
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

  const handleSave = async () => {
    if (!activeFilePath) return;
    const file = openFiles.find((f) => f.path === activeFilePath);
    if (!file) return;
    await saveFile(file.path, file.content);
  };

  const handleSaveAll = useCallback(async () => {
    const unsavedParams = Array.from(unsavedFiles);
    for (const path of unsavedParams) {
      const file = openFiles.find((f) => f.path === path);
      if (file) {
        await saveFile(file.path, file.content);
      }
    }
  }, [openFiles, saveFile, unsavedFiles]);

  const handleCloseProject = useCallback(() => {
    destroy();
    setFiles(null);
    setOpenFiles([]);
    setActiveFilePath("");
    setProjectName("NexIDE Workspace");
    setRootHandle(null);
    setCurrentProjectId("");
    setIsPreviewVisible(false);
    originalContentsRef.current = {};
  }, [
    destroy,
    setOpenFiles,
    setActiveFilePath,
    setProjectName,
    setRootHandle,
    setCurrentProjectId,
  ]);

  const handleRefresh = async () => {
    // 1. REPO MODE: Silent re-clone
    if (searchParams?.get("repo") && session?.accessToken && instance) {
      const repoFullName = searchParams.get("repo")!;
      try {
        if (terminal)
          terminal.writeln(
            "\r\n\x1b[33m[System] Refreshing repository content (fetching latest)...\x1b[0m",
          );

        // Fetch latest zip
        const blob = await fetchRepoZip(
          repoFullName,
          session.accessToken as string,
        );
        const tree = await transformZipToTree(blob);

        // Mount new tree (WebContainer merge/overwrite)
        await instance.mount(tree);
        setFiles(tree);

        // Reload active file content if open
        if (activeFilePath) {
          try {
            const content = await instance.fs.readFile(activeFilePath);
            // safe update (content is Uint8Array from fs.readFile usually, but we need string/uint8array for editor)
            // fs.readFile returns Uint8Array by default without encoding
            updateFileContent(activeFilePath, content);
          } catch (e) {
            // file might be deleted or moved
          }
        }

        if (terminal)
          terminal.writeln(
            "\x1b[32m[System] Repository refreshed successfully.\x1b[0m",
          );
      } catch (e) {
        console.error("Failed to refresh GitHub repo", e);
        if (terminal)
          terminal.writeln("\x1b[31m[System] Refresh failed.\x1b[0m");
      }
      return;
    }

    // 2. LOCAL MODE: Re-read file tree
    if (!rootHandle || !instance) return;
    try {
      const { getFileSystemTree } = await import("@/lib/file-system");
      const tree = await getFileSystemTree(rootHandle);
      await instance.mount(tree); // Remount to sync WC
      setFiles(tree);

      // Reload active file content
      if (activeFilePath) {
        const contents = await instance.fs.readFile(activeFilePath, "utf-8");
        updateFileContent(activeFilePath, contents);
      }
    } catch (e) {
      console.error("Refresh failed", e);
    }
  };

  // Auto-save logic removed in favor of debounced onChange

  const handleRun = async () => {
    // 1. Ensure all files are saved
    await handleSaveAll();

    setIsPreviewVisible(true);
    setIsTerminalVisible(true);

    const isPackageJson = files && files["package.json"];

    // We strictly assume LOCAL terminal now (which is mirrored to WC for preview)
    // Send command to the active terminal (which is local)

    // Interrupt any running process first (clean start)
    interrupt();
    setPreviewUrl("");
    setIsStartingServer(true);

    setTimeout(() => {
      if (isPackageJson) {
        // Run dev server locally.
        sendCommand("npm run dev");
      } else {
        // Serve static files
        // Use 'serve' or 'http-server'
        sendCommand("npx -y serve . -p 3000");
      }
    }, 400);
  };

  return (
    <div className="h-screen flex flex-col bg-[#09090b] text-zinc-300 overflow-hidden font-sans selection:bg-blue-500/30">
      <header className="h-10 border-b border-white/5 flex items-center justify-between px-3 bg-[#09090b]/80 backdrop-blur-md z-30 select-none">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="p-2 hover:bg-white/5 rounded-lg transition-colors group"
          >
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <h1 className="text-sm font-semibold text-white tracking-tight">
                  {projectName}
                </h1>
                <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                  {state}
                </span>
                {rootHandle && (
                  <button
                    onClick={handleCloseProject}
                    className="text-[10px] text-zinc-400 hover:text-red-400 font-bold uppercase bg-white/5 px-1.5 py-0.5 rounded border border-white/5 transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
              {/* Breadcrumbs */}
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-medium overflow-hidden max-w-[400px]">
                <span className="hover:text-zinc-300 cursor-pointer transition-colors shrink-0">
                  {projectName}
                  {currentProjectId && (
                    <span className="text-zinc-600 ml-1.5 font-normal">
                      ({currentProjectId})
                    </span>
                  )}
                </span>
                {activeFilePath && (
                  <>
                    <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
                    {activeFilePath.split("/").map((part, i, arr) => (
                      <div
                        key={part + i}
                        className="flex items-center gap-1.5 shrink-0"
                      >
                        <span className="shrink-0 opacity-70">
                          {i === arr.length - 1 ? (
                            getFileIcon(part)
                          ) : (
                            <Folder className="w-3 h-3 text-blue-400/60" />
                          )}
                        </span>
                        <span
                          className={`hover:text-zinc-300 cursor-pointer transition-colors ${i === arr.length - 1 ? "text-blue-400 font-semibold" : ""}`}
                        >
                          {part}
                        </span>
                        {i < arr.length - 1 && (
                          <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* File Actions */}
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={handleSave}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
              title="Save (Ctrl+S)"
            >
              <Save className="w-4 h-4" />
            </button>
            <button
              onClick={handleSaveAll}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
              title="Save All"
            >
              <SaveAll className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsAutoSave(!isAutoSave)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors text-xs font-medium ${isAutoSave ? "bg-green-500/10 text-green-400" : "text-zinc-400 hover:bg-white/5"}`}
              title="Toggle Auto Save"
            >
              <span>Auto Save</span>
              {isAutoSave && <Check className="w-3.5 h-3.5" />}
            </button>
            {!searchParams?.get("repo") && (
              <button
                onClick={handleRefresh}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
                title="Refresh from Disk"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* Toggles */}
          <div className="flex items-center gap-1.5 bg-white/5 rounded-lg p-0.5 border border-white/5 mr-2">
            <button
              onClick={() => setIsTerminalVisible(!isTerminalVisible)}
              className={`p-1.5 rounded-md transition-all ${isTerminalVisible ? "bg-blue-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"}`}
              title="Toggle Terminal"
            >
              <TerminalSquare className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsPreviewVisible(!isPreviewVisible)}
              className={`p-1.5 rounded-md transition-all ${isPreviewVisible ? "bg-blue-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"}`}
              title="Toggle Preview"
            >
              <LayoutTemplate className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleRun}
            className="flex items-center gap-2 px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-all text-xs font-semibold shadow-lg shadow-green-600/10 active:scale-95"
            title="Run Project"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Run
          </button>
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
            title="Command Palette (Ctrl+P)"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsAIChatOpen(!isAIChatOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-xs font-semibold active:scale-95 ${isAIChatOpen ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20" : "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5"}`}
            title="Toggle AI Assistant"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI
          </button>
          <SettingsWidget>
            <button className="ml-2 hover:bg-white/5 p-1.5 rounded-lg transition-colors group outline-none">
              <SettingsIcon className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            </button>
          </SettingsWidget>
        </div>
      </header>

      <div className="flex-1 min-h-0 relative">
        {(isMounting || (isInitializing && state !== "error")) && (
          <div className="absolute inset-0 bg-background/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 relative">
              <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-semibold text-foreground uppercase tracking-widest">
                {isMounting
                  ? searchParams?.get("action") === "clone"
                    ? "Cloning Repository..."
                    : "Mounting Filesystem..."
                  : "Booting NexIDE..."}
              </span>
              <span className="text-xs text-muted-foreground italic">
                {isMounting
                  ? searchParams?.get("action") === "clone"
                    ? "Downloading and installing dependencies..."
                    : "Synchronizing local workspace"
                  : "Initializing WebContainer engine"}
              </span>
            </div>
          </div>
        )}
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel
            defaultSize={20}
            minSize={15}
            maxSize={400}
            className="resizable-panel-transition"
          >
            <div className="h-full flex flex-col border-r border-border bg-background">
              <div className="p-4 flex items-center justify-between border-b border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Explorer
                </span>
                <div className="flex items-center gap-1.5">
                  {searchParams?.get("repo") && (
                    <button
                      onClick={handlePushToGitHub}
                      className="text-zinc-500 hover:text-green-400 cursor-pointer transition-colors"
                      title="Push changes to GitHub"
                    >
                      <CloudUpload className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsFindInFilesOpen((v) => !v)}
                    className={`cursor-pointer transition-colors ${
                      isFindInFilesOpen
                        ? "text-violet-400"
                        : "text-zinc-500 hover:text-violet-400"
                    }`}
                    title="Find in Files (Ctrl+Shift+F)"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setIsGitDiffOpen((v) => !v);
                      setIsFindInFilesOpen(false);
                    }}
                    className={`cursor-pointer transition-colors ${
                      isGitDiffOpen
                        ? "text-green-400"
                        : "text-zinc-500 hover:text-green-400"
                    }`}
                    title="Source Control / Git Diff"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleDownloadZip}
                    className="text-zinc-500 hover:text-blue-400 cursor-pointer transition-colors"
                    title="Download Project ZIP"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleRefresh}
                    className="text-zinc-500 hover:text-blue-400 cursor-pointer transition-colors"
                    title="Refresh File Tree"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {isFindInFilesOpen ? (
                  <FindInFiles
                    isOpen={isFindInFilesOpen}
                    onClose={() => setIsFindInFilesOpen(false)}
                    instance={instance}
                    onFileClick={(path, _line) => handleFileClick(path)}
                  />
                ) : isGitDiffOpen ? (
                  <GitDiffPanel
                    isOpen={isGitDiffOpen}
                    onClose={() => setIsGitDiffOpen(false)}
                    instance={instance}
                    originalContents={originalContentsRef.current}
                    currentContents={Object.fromEntries(
                      openFiles
                        .filter((f) => typeof f.content === "string")
                        .map((f) => [f.path, f.content as string]),
                    )}
                    repoUrl={
                      searchParams?.get("repo") || currentRepoUrl || undefined
                    }
                    onPush={handlePushToGitHub}
                  />
                ) : (
                  <div className="flex-1 overflow-y-auto custom-scrollbar bg-background">
                    {files ? (
                      <FileTree
                        tree={files}
                        onFileClick={handleFileClick}
                        onFileCreate={handleFileCreate}
                        onFolderCreate={handleFolderCreate}
                        onDelete={handleDelete}
                        onRename={handleRename}
                        activeFilePath={activeFilePath}
                        projectName={projectName}
                        projectId={currentProjectId}
                      />
                    ) : (
                      <div className="p-8 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                          <FolderOpen className="w-6 h-6 text-zinc-600" />
                        </div>
                        <p className="text-xs text-zinc-500 mb-4">
                          No folder opened
                        </p>
                        <button
                          onClick={() => handleOpenFolder()}
                          disabled={isMounting}
                          className="w-full py-2 px-4 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors border border-white/5"
                        >
                          Open Folder
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-1 bg-transparent hover:bg-blue-500/20 transition-colors" />

          <ResizablePanel
            defaultSize={80}
            className="resizable-panel-transition"
          >
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel
                defaultSize={isPreviewVisible ? 60 : 100}
                className="resizable-panel-transition"
              >
                <ResizablePanelGroup orientation="vertical">
                  {/* Editor Section */}
                  <ResizablePanel
                    defaultSize={isTerminalVisible ? 70 : 100}
                    className="bg-background resizable-panel-transition"
                  >
                    <div className="h-full flex flex-col bg-background">
                      {secondaryActiveFilePath ? (
                        <ResizablePanelGroup direction="horizontal">
                          <ResizablePanel defaultSize={50} minSize={20}>
                            {/* Primary Pane */}
                            <div
                              className={`h-full flex flex-col border-r border-border ${activeEditor === "primary" ? "ring-1 ring-inset ring-blue-500/20" : ""}`}
                            >
                              {/* Tabs Primary */}
                              <div className="flex items-center h-9 bg-muted/40 border-b border-border">
                                <div className="flex-1 flex overflow-x-auto no-scrollbar">
                                  {openFiles.map((file) => (
                                    <div
                                      key={file.path}
                                      onClick={() => {
                                        setActiveFilePath(file.path);
                                        setActiveEditor("primary");
                                      }}
                                      className={`group relative h-full flex items-center px-3 min-w-[100px] max-w-[150px] cursor-pointer border-r border-border select-none ${activeFilePath === file.path ? "bg-background text-foreground border-t-2 border-t-blue-500" : "bg-muted/40 text-muted-foreground hover:bg-background hover:text-foreground border-t-2 border-t-transparent"}`}
                                    >
                                      <span className="text-xs truncate">
                                        {file.name}
                                      </span>
                                      <X
                                        className="w-3 h-3 ml-2 opacity-0 group-hover:opacity-100 hover:text-red-400"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          closeFile(file.path);
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center px-1 border-l border-border gap-0.5">
                                  <button
                                    className="p-1.5 hover:bg-white/5 text-zinc-400 hover:text-white rounded-md transition-colors"
                                    onClick={() => closeAllFiles()}
                                    title="Close All Files"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    className="p-1.5 hover:bg-white/5 text-zinc-400 hover:text-white rounded-md transition-colors"
                                    onClick={() => {
                                      setSecondaryActiveFilePath(
                                        activeFilePath,
                                      );
                                      setActiveEditor("secondary");
                                    }}
                                    title="Split Editor"
                                  >
                                    <Columns className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex-1 relative">
                                {activeFilePath && activeFilePrimary ? (
                                  <CodeEditor
                                    key={activeFilePath}
                                    initialValue={
                                      activeFilePrimary.content as string
                                    }
                                    path={activeFilePath}
                                    onFocus={() => {
                                      setIsEditorFocused(true);
                                      setActiveEditor("primary");
                                    }}
                                    onBlur={() => setIsEditorFocused(false)}
                                    onChange={(val) => {
                                      updateFileContent(activeFilePath, val);
                                      if (!unsavedFiles.has(activeFilePath))
                                        markFileUnsaved(activeFilePath);
                                      // Auto-save logic simplified for brevity - assumes existing debouncer handles standard flow or we replicate it
                                      // Ideally we reuse a handleContentChange function
                                      if (isAutoSave)
                                        saveFile(activeFilePath, val); // simple auto save
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
                                    Select a file
                                  </div>
                                )}
                              </div>
                            </div>
                          </ResizablePanel>
                          <ResizableHandle />
                          <ResizablePanel defaultSize={50} minSize={20}>
                            {/* Secondary Pane */}
                            <div
                              className={`h-full flex flex-col ${activeEditor === "secondary" ? "ring-1 ring-inset ring-blue-500/20" : ""}`}
                            >
                              {/* Tabs Secondary */}
                              <div className="flex items-center h-9 bg-muted/40 border-b border-border">
                                <div className="flex-1 flex overflow-x-auto no-scrollbar">
                                  {openFiles.map((file) => (
                                    <div
                                      key={file.path}
                                      onClick={() => {
                                        setSecondaryActiveFilePath(file.path);
                                        setActiveEditor("secondary");
                                      }}
                                      className={`group relative h-full flex items-center px-3 min-w-[100px] max-w-[150px] cursor-pointer border-r border-border select-none ${secondaryActiveFilePath === file.path ? "bg-background text-foreground border-t-2 border-t-blue-500" : "bg-muted/40 text-muted-foreground hover:bg-background hover:text-foreground border-t-2 border-t-transparent"}`}
                                    >
                                      <span className="text-xs truncate">
                                        {file.name}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center px-1 border-l border-border gap-0.5">
                                  <button
                                    className="p-1.5 hover:bg-white/5 text-zinc-400 hover:text-white rounded-md transition-colors"
                                    onClick={() => closeAllFiles()}
                                    title="Close All Files"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    className="p-1.5 hover:bg-white/5 text-zinc-400 hover:text-white rounded-md transition-colors"
                                    onClick={() => {
                                      setSecondaryActiveFilePath(null);
                                      setActiveEditor("primary");
                                    }}
                                    title="Close Split"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex-1 relative">
                                {secondaryActiveFilePath &&
                                activeFileSecondary ? (
                                  <CodeEditor
                                    key={secondaryActiveFilePath}
                                    initialValue={
                                      activeFileSecondary.content as string
                                    }
                                    path={secondaryActiveFilePath}
                                    onFocus={() => {
                                      setIsEditorFocused(true);
                                      setActiveEditor("secondary");
                                    }}
                                    onBlur={() => setIsEditorFocused(false)}
                                    onChange={(val) => {
                                      updateFileContent(
                                        secondaryActiveFilePath,
                                        val,
                                      );
                                      if (
                                        !unsavedFiles.has(
                                          secondaryActiveFilePath,
                                        )
                                      )
                                        markFileUnsaved(
                                          secondaryActiveFilePath,
                                        );
                                      if (isAutoSave)
                                        saveFile(secondaryActiveFilePath, val);
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
                                    Select a file
                                  </div>
                                )}
                              </div>
                            </div>
                          </ResizablePanel>
                        </ResizablePanelGroup>
                      ) : (
                        // Single Pane (Original Logic essentially)
                        <div className="h-full flex flex-col">
                          <div className="flex items-center h-9 px-0 bg-muted/40 border-b border-border overflow-x-auto no-scrollbar">
                            {openFiles.map((file) => (
                              <div
                                key={file.path}
                                onClick={() => setActiveFilePath(file.path)}
                                className={`group relative h-full flex items-center px-3 min-w-[120px] max-w-[200px] cursor-pointer transition-all border-r border-border select-none ${activeFilePath === file.path ? "bg-background text-foreground border-t-2 border-t-blue-500" : "bg-muted/40 text-muted-foreground hover:bg-background hover:text-foreground border-t-2 border-t-transparent"}`}
                              >
                                <span className="text-xs truncate flex items-center">
                                  {file.name}
                                  {unsavedFiles.has(file.path) &&
                                    !isAutoSave && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-1.5 inline-block" />
                                    )}
                                </span>
                                <X
                                  className="w-3 h-3 ml-2 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Debugging: Force close immediately
                                    console.log(
                                      "Forcing close for:",
                                      file.path,
                                    );
                                    closeFile(file.path);
                                  }}
                                />
                              </div>
                            ))}
                            <div className="ml-auto mr-1 flex items-center gap-0.5">
                              <button
                                className="p-1.5 hover:bg-white/5 text-zinc-400 hover:text-white rounded-md transition-colors"
                                onClick={() => closeAllFiles()}
                                title="Close All Files"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                              <button
                                className="p-1.5 hover:bg-white/5 text-zinc-400 hover:text-white rounded-md transition-colors"
                                onClick={() => {
                                  setSecondaryActiveFilePath(activeFilePath);
                                  setActiveEditor("secondary");
                                }}
                                title="Split Editor"
                              >
                                <Columns className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="flex-1 min-h-0 relative bg-background flex flex-col items-center justify-center">
                            {activeFilePath && activeFilePrimary ? (
                              <CodeEditor
                                key={activeFilePath}
                                initialValue={
                                  activeFilePrimary.content as string
                                }
                                path={activeFilePath}
                                onFocus={() => {
                                  setIsEditorFocused(true);
                                  // Single view acts as primary
                                  setActiveEditor("primary");
                                }}
                                onBlur={() => setIsEditorFocused(false)}
                                onChange={(content) => {
                                  // 1. Update local state immediately (for UI responsiveness)
                                  updateFileContent(activeFilePath, content);

                                  // 2. Mark as unsaved
                                  if (!unsavedFiles.has(activeFilePath)) {
                                    markFileUnsaved(activeFilePath);
                                  }

                                  // 3. Queue the save operation (if auto-save enabled)
                                  if (isAutoSave) {
                                    // Add to save queue
                                    saveQueueRef.current.set(
                                      activeFilePath,
                                      content,
                                    );

                                    // Clear existing debounce timer
                                    if (debounceTimer.current) {
                                      clearTimeout(debounceTimer.current);
                                    }

                                    // Set new debounce timer
                                    debounceTimer.current = setTimeout(
                                      async () => {
                                        // Process all queued saves
                                        const entries = Array.from(
                                          saveQueueRef.current.entries(),
                                        );
                                        saveQueueRef.current.clear();

                                        for (const [queuedPath, _] of entries) {
                                          // Skip if already saving this file
                                          if (
                                            isSavingRef.current.has(queuedPath)
                                          ) {
                                            continue;
                                          }

                                          // Get the most recent content from ref (not the queued value)
                                          const currentFile =
                                            openFilesRef.current.find(
                                              (f) => f.path === queuedPath,
                                            );
                                          if (!currentFile) continue;

                                          try {
                                            isSavingRef.current.add(queuedPath);
                                            await saveFile(
                                              queuedPath,
                                              currentFile.content,
                                            );
                                          } catch (error) {
                                            console.error(
                                              `Failed to save ${queuedPath}:`,
                                              error,
                                            );
                                          } finally {
                                            isSavingRef.current.delete(
                                              queuedPath,
                                            );
                                          }
                                        }
                                      },
                                      autoSaveDelay,
                                    );
                                  }
                                }}
                                onSave={async (content) => {
                                  // Manual save (Ctrl+S)
                                  updateFileContent(activeFilePath, content);
                                  await saveFile(activeFilePath, content);
                                }}
                              />
                            ) : (
                              <div className="text-center text-muted-foreground">
                                <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                                  <Code2 className="w-8 h-8 opacity-20" />
                                </div>
                                <p className="text-sm font-medium">
                                  No file is open
                                </p>
                                <p className="text-xs opacity-50 mt-1">
                                  Select a file from the explorer
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </ResizablePanel>

                  {/* Terminal Section (Down) */}
                  {isTerminalVisible && (
                    <>
                      <ResizableHandle className="h-1 bg-transparent hover:bg-blue-500/20 transition-colors" />
                      <ResizablePanel
                        defaultSize={30}
                        className="resizable-panel-transition"
                      >
                        <div className="h-full flex flex-col bg-background">
                          <div className="h-9 border-b border-border flex items-center px-4 justify-between">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1.5 text-zinc-200 text-[11px] font-medium uppercase tracking-widest">
                                Terminal
                              </div>
                              {currentLocalPath ? (
                                <div
                                  className="flex items-center gap-1.5 text-emerald-400 text-[9px] font-mono tracking-tight bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/20 transition-colors"
                                  onClick={() => {
                                    setManualPath(currentLocalPath);
                                    setShowPathInput(true);
                                  }}
                                  title="Click to edit path"
                                >
                                  <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                                  {currentLocalPath}
                                </div>
                              ) : (
                                <button
                                  onClick={() => setShowPathInput(true)}
                                  className="text-[9px] text-zinc-500 hover:text-white transition-colors underline"
                                >
                                  Set Absolute Path
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <RefreshCw
                                className={`w-3.5 h-3.5 text-zinc-500 hover:text-blue-400 cursor-pointer transition-colors active:rotate-180 duration-500`}
                                onClick={syncSize}
                              />
                              <RotateCcw
                                className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                                onClick={resetEnvironment}
                              />
                              <X
                                className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                                onClick={() => setIsTerminalVisible(false)}
                              />
                            </div>
                          </div>
                          <div className="flex-1 overflow-hidden bg-background">
                            {instance ? (
                              <Terminal instance={instance} />
                            ) : (
                              <div className="text-xs text-zinc-600 italic p-4">
                                Initializing terminal...
                              </div>
                            )}
                          </div>
                        </div>
                      </ResizablePanel>
                    </>
                  )}
                </ResizablePanelGroup>
              </ResizablePanel>

              {/* Preview Section (Right) */}
              {isPreviewVisible && (
                <>
                  <ResizableHandle className="w-1 bg-transparent hover:bg-blue-500/20 transition-colors" />
                  <ResizablePanel
                    defaultSize={50}
                    className="resizable-panel-transition"
                  >
                    <div className="h-full flex flex-col bg-background border-l border-border">
                      <div className="h-10 px-4 border-b border-border flex items-center justify-between bg-background">
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            Preview
                          </span>
                        </div>
                        <X
                          className="w-4 h-4 text-zinc-500 hover:text-white cursor-pointer"
                          onClick={() => setIsPreviewVisible(false)}
                        />
                      </div>
                      <div className="flex-1 min-h-0">
                        <Preview instance={instance} />
                      </div>
                    </div>
                  </ResizablePanel>
                </>
              )}

              {/* AI Chat Panel (Total Right) */}
              {isAIChatOpen && (
                <>
                  <ResizableHandle className="w-1 bg-transparent hover:bg-violet-500/20 transition-colors" />
                  <ResizablePanel
                    defaultSize={25}
                    minSize={15}
                    maxSize={4000}
                    className="resizable-panel-transition"
                  >
                    <AIChatPanel
                      isOpen={isAIChatOpen}
                      onClose={() => setIsAIChatOpen(false)}
                      projectId={currentProjectId || "default"}
                      activeFilePath={activeFilePath}
                      activeFileContent={
                        activeFilePrimary?.content as string | undefined
                      }
                      activeFileLanguage={
                        activeFilePath
                          ? activeFilePath.split(".").pop() || "javascript"
                          : undefined
                      }
                    />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Status Bar */}
      <footer className="h-6 border-t border-border bg-background flex items-center justify-between px-3 z-40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 hover:bg-white/5 px-1.5 h-full transition-colors cursor-pointer group">
            <div
              className={`w-2 h-2 rounded-full ${state === "ready" ? "bg-green-500" : state === "error" ? "bg-red-500" : "bg-yellow-500"} shadow-[0_0_8px_rgba(34,197,94,0.3)]`}
            />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider group-hover:text-foreground">
              {state === "ready"
                ? "WebContainer Connected"
                : state === "booting"
                  ? "Booting Engine..."
                  : "Engine Offline"}
            </span>
          </div>
          {activeFilePath && (
            <div className="flex items-center gap-1.5 text-zinc-500 text-[10px]">
              <span className="font-mono">{activeFilePath}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1 hover:text-zinc-300 cursor-pointer px-1.5 h-full transition-colors">
            <Layout className="w-3 h-3" />
            <span>Layout: Default</span>
          </div>
          <div className="flex items-center gap-1 hover:text-zinc-300 cursor-pointer px-1.5 h-full transition-colors">
            <Globe className="w-3 h-3 text-blue-400" />
            <span>Port: {activePort || "None"}</span>
          </div>
          <div className="flex items-center gap-1 px-1.5 text-zinc-600 select-none">
            <span>Powered by NexIDE v1.0</span>
          </div>
        </div>
      </footer>

      {showAutoOpenPrompt && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-100 flex items-center justify-center p-4">
          <div className="bg-popover border border-border rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden group">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 shadow-inner">
                <FolderOpen className="w-10 h-10 text-blue-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground tracking-tight">
                  Restore Access: {projectName}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Click below to re-grant NexIDE access to your folder.
                </p>
              </div>
              <button
                onClick={() => handleOpenFolder()}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all transform active:scale-95 shadow-lg shadow-blue-500/20"
              >
                Restore Access
              </button>
              <button
                onClick={() => setShowAutoOpenPrompt(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel and use empty workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloneLanding && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-100 flex items-center justify-center p-4">
          <div className="bg-popover border border-border rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden group">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 rounded-3xl bg-purple-600/10 flex items-center justify-center border border-purple-500/20 shadow-inner">
                <Github className="w-10 h-10 text-purple-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground tracking-tight">
                  Clone Repository
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  You are about to clone{" "}
                  <span className="text-foreground font-semibold">
                    {searchParams?.get("repo")}
                  </span>
                  . NexIDE will download the files and save them to your local
                  disk for a full development experience.
                </p>
              </div>
              <button
                onClick={handleCloneToLocal}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all transform active:scale-95 shadow-lg shadow-purple-500/20"
              >
                Choose Save Location & Clone
              </button>
              <Link
                href="/dashboard"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Manual Path Input Dialog */}
      {showPathInput && (
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-100 flex items-center justify-center p-4">
          <div className="bg-popover border border-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <FolderOpen className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Project Host Path
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">
                    Manual Configuration
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                Enter the absolute path to{" "}
                <span className="text-foreground font-medium">
                  {projectName}
                </span>{" "}
                on your terminal host. This is required for real-time type
                syncing and terminal local mode.
              </p>

              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    value={manualPath}
                    onChange={(e) => setManualPath(e.target.value)}
                    placeholder="C:\Users\...\project-folder"
                    className="w-full bg-input/50 border border-input rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50 transition-colors"
                    autoFocus
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleManualPathSubmit()
                    }
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleManualPathSubmit}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 rounded-lg transition-colors shadow-lg shadow-blue-600/20"
                  >
                    Save & Sync
                  </button>
                  <button
                    onClick={() => setShowPathInput(false)}
                    className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <Dialog
        open={promptDialog.isOpen}
        onOpenChange={(open) =>
          setPromptDialog((prev) => ({ ...prev, isOpen: open }))
        }
      >
        <DialogContent className="sm:max-w-[400px] bg-[#09090b]/95 backdrop-blur-xl border-white/10 text-zinc-300 p-0 overflow-hidden shadow-2xl shadow-blue-500/10">
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
                {promptDialog.icon}
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-white text-base font-semibold">
                  {promptDialog.title}
                </DialogTitle>
                <DialogDescription className="text-zinc-500 text-[11px] leading-relaxed">
                  {promptDialog.description}
                </DialogDescription>
              </div>
            </div>

            <div className="relative">
              <Input
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                placeholder={promptDialog.placeholder}
                className="bg-white/5 border-white/10 text-sm h-10 focus:ring-blue-500/20 focus:border-blue-500/50 pl-3 transition-all font-medium text-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && promptValue.trim()) {
                    promptDialog.onConfirm(promptValue);
                  }
                  if (e.key === "Escape") {
                    setPromptDialog((prev) => ({ ...prev, isOpen: false }));
                  }
                }}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-mono pointer-events-none select-none">
                Enter ↵
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() =>
                  setPromptDialog((prev) => ({ ...prev, isOpen: false }))
                }
                className="h-8 px-4 text-xs hover:bg-white/5 text-zinc-500 hover:text-white transition-colors"
              >
                Cancel
              </Button>
              <Button
                onClick={() => promptDialog.onConfirm(promptValue)}
                className="h-8 px-4 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-lg shadow-blue-500/20"
                disabled={!promptValue.trim()}
              >
                Confirm
              </Button>
            </div>
          </div>
          <div className="h-1px w-full bg-linear-to-r from-transparent via-blue-500/50 to-transparent opacity-50" />
        </DialogContent>
      </Dialog>
      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        recentFiles={openFiles.map((f) => ({ path: f.path, name: f.name }))}
        onFileOpen={(path) => handleFileClick(path)}
        commands={[
          {
            id: "run",
            label: "Run Project",
            description: "Start the dev server and open preview",
            icon: <Play className="w-4 h-4" />,
            shortcut: "Ctrl+Enter",
            category: "Project",
            action: handleRun,
            keywords: ["start", "dev", "server", "npm"],
          },
          {
            id: "save",
            label: "Save File",
            description: "Save the currently active file",
            icon: <Save className="w-4 h-4" />,
            shortcut: "Ctrl+S",
            category: "File",
            action: handleSave,
          },
          {
            id: "save-all",
            label: "Save All Files",
            description: "Save all unsaved files",
            icon: <SaveAll className="w-4 h-4" />,
            category: "File",
            action: handleSaveAll,
          },
          {
            id: "close-all",
            label: "Close All Tabs",
            description: "Close all open editor tabs",
            icon: <XCircle className="w-4 h-4" />,
            category: "File",
            action: closeAllFiles,
          },
          {
            id: "find-in-files",
            label: "Find in Files",
            description: "Search across all project files",
            icon: <Search className="w-4 h-4" />,
            shortcut: "Ctrl+Shift+F",
            category: "Search",
            action: () => setIsFindInFilesOpen(true),
            keywords: ["search", "grep", "find"],
          },
          {
            id: "source-control",
            label: "Source Control",
            description: "View file diffs and push changes to GitHub",
            icon: <GitBranch className="w-4 h-4" />,
            shortcut: "Ctrl+Shift+G",
            category: "Search",
            action: () => {
              setIsGitDiffOpen(true);
              setIsFindInFilesOpen(false);
            },
            keywords: ["git", "diff", "changes", "commit", "status"],
          },
          {
            id: "toggle-terminal",
            label: "Toggle Terminal",
            description: "Show or hide the terminal panel",
            icon: <TerminalSquare className="w-4 h-4" />,
            category: "View",
            action: () => setIsTerminalVisible((v) => !v),
            keywords: ["shell", "console"],
          },
          {
            id: "toggle-preview",
            label: "Toggle Preview",
            description: "Show or hide the browser preview",
            icon: <Eye className="w-4 h-4" />,
            category: "View",
            action: () => setIsPreviewVisible((v) => !v),
          },
          {
            id: "toggle-ai",
            label: "Toggle AI Chat",
            description: "Open or close the AI assistant panel",
            icon: <Sparkles className="w-4 h-4" />,
            category: "View",
            action: () => setIsAIChatOpen((v) => !v),
            keywords: ["gemini", "groq", "copilot", "assistant"],
          },
          {
            id: "split-editor",
            label: "Split Editor",
            description: "Open a second editor pane side by side",
            icon: <Columns className="w-4 h-4" />,
            category: "View",
            action: () => {
              setSecondaryActiveFilePath(activeFilePath);
              setActiveEditor("secondary");
            },
          },
          {
            id: "open-folder",
            label: "Open Local Folder",
            description: "Open a folder from your file system",
            icon: <FolderOpen className="w-4 h-4" />,
            category: "Project",
            action: () => handleOpenFolder(),
            keywords: ["import", "local"],
          },
          {
            id: "download-zip",
            label: "Download as ZIP",
            description: "Download the entire project as a ZIP file",
            icon: <Download className="w-4 h-4" />,
            category: "Project",
            action: handleDownloadZip,
          },
          {
            id: "push-github",
            label: "Push to GitHub",
            description: "Push current changes to the linked GitHub repository",
            icon: <Github className="w-4 h-4" />,
            category: "Project",
            action: handlePushToGitHub,
            keywords: ["commit", "push", "sync"],
          },
          {
            id: "refresh",
            label: "Refresh File Tree",
            description: "Re-read files from disk and sync with WebContainer",
            icon: <RefreshCw className="w-4 h-4" />,
            category: "Project",
            action: handleRefresh,
          },
          {
            id: "close-project",
            label: "Close Project",
            description:
              "Close the current project and return to empty workspace",
            icon: <X className="w-4 h-4" />,
            category: "Project",
            action: handleCloseProject,
          },
        ]}
      />
    </div>
  );
}
