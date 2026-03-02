import { useCallback } from "react";
import { WebContainer, FileSystemTree } from "@webcontainer/api";
import { toast } from "sonner";
import { OpenFile } from "@/store/use-ide-store";

export interface PromptDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  placeholder: string;
  defaultValue: string;
  onConfirm: (val: string) => void;
}

interface UseFileOperationsOptions {
  instance: WebContainer | null;
  rootHandle: FileSystemDirectoryHandle | null;
  activeFilePath: string;
  openFiles: OpenFile[];
  addOpenFile: (file: OpenFile) => void;
  setActiveFilePath: (path: string) => void;
  setOpenFiles: (
    updater: OpenFile[] | ((prev: OpenFile[]) => OpenFile[]),
  ) => void;
  closeFile: (path: string) => void;
  setFiles: (tree: FileSystemTree | null) => void;
  setPromptDialog: (dialog: PromptDialogState) => void;
  setPromptValue: (val: string) => void;
}

export function useFileOperations({
  instance,
  rootHandle,
  activeFilePath,
  openFiles,
  addOpenFile,
  setActiveFilePath,
  setOpenFiles,
  closeFile,
  setFiles,
  setPromptDialog,
  setPromptValue,
}: UseFileOperationsOptions) {
  const refreshFiles = useCallback(async () => {
    if (!instance) return;
    // Walk the WebContainer FS to build a tree
    const tree: FileSystemTree = {};
    const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build"]);

    async function walk(dir: string, node: FileSystemTree) {
      const entries = await instance!.fs.readdir(dir || "/", {
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (SKIP.has(entry.name)) continue;
        const fullPath = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          node[entry.name] = { directory: {} };
          await walk(
            fullPath,
            (node[entry.name] as { directory: FileSystemTree }).directory,
          );
        } else {
          try {
            const content = await instance!.fs.readFile(fullPath, "utf-8");
            node[entry.name] = { file: { contents: content } };
          } catch {
            node[entry.name] = { file: { contents: "" } };
          }
        }
      }
    }

    await walk("", tree);
    setFiles(tree);
  }, [instance, setFiles]);

  const handleFileClick = useCallback(
    async (path: string) => {
      if (!instance) return;
      try {
        const content = await instance.fs.readFile(path, "utf-8");
        const fileName = path.split("/").pop() || path;
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
        icon: null,
        placeholder: "index.js",
        defaultValue: "",
        onConfirm: async (name) => {
          if (!instance) return;
          const path = parentPath ? `${parentPath}/${name}` : name;
          await instance.fs.writeFile(path, "");
          setPromptDialog({
            isOpen: false,
            title: "",
            description: "",
            icon: null,
            placeholder: "",
            defaultValue: "",
            onConfirm: () => {},
          });
          await refreshFiles();
        },
      });
    },
    [instance, refreshFiles, setPromptDialog, setPromptValue],
  );

  const handleFolderCreate = useCallback(
    async (parentPath: string) => {
      setPromptValue("");
      setPromptDialog({
        isOpen: true,
        title: "Create New Folder",
        description: "Enter a name for your new directory.",
        icon: null,
        placeholder: "src",
        defaultValue: "",
        onConfirm: async (name) => {
          if (!instance) return;
          const path = parentPath ? `${parentPath}/${name}` : name;
          await instance.fs.mkdir(path);
          setPromptDialog({
            isOpen: false,
            title: "",
            description: "",
            icon: null,
            placeholder: "",
            defaultValue: "",
            onConfirm: () => {},
          });
          await refreshFiles();
        },
      });
    },
    [instance, refreshFiles, setPromptDialog, setPromptValue],
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
        icon: null,
        placeholder: "new-name.js",
        defaultValue: oldName,
        onConfirm: async (newName) => {
          if (!newName || !instance || newName === oldName) return;
          const parentDir = oldPath.split("/").slice(0, -1).join("/");
          const newPath = parentDir ? `${parentDir}/${newName}` : newName;
          try {
            const mv = await instance.spawn("mv", [oldPath, newPath]);
            await mv.exit;

            if (rootHandle) {
              try {
                const { renameEntryLocally } =
                  await import("@/lib/file-system");
                await renameEntryLocally(rootHandle, oldPath, newPath);
              } catch (e) {
                console.error("Failed to rename locally:", e);
              }
            }

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
              if (wasActive) setActiveFilePath(newPath);
            }

            setPromptDialog({
              isOpen: false,
              title: "",
              description: "",
              icon: null,
              placeholder: "",
              defaultValue: "",
              onConfirm: () => {},
            });
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
      setPromptDialog,
      setPromptValue,
    ],
  );

  return {
    refreshFiles,
    handleFileClick,
    handleFileCreate,
    handleFolderCreate,
    handleDelete,
    handleRename,
  };
}
