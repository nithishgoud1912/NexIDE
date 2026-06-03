import { toast } from "sonner";
import { openLocalFolder } from "@/lib/file-system";
import { fetchRepoZip, transformZipToTree } from "@/lib/github-import";

interface UseGithubCloneProps {
  session: any;
  searchParams: any;
  setShowCloneLanding: (show: boolean) => void;
  setIsMounting: (mounting: boolean) => void;
  setProjectName: (name: string) => void;
  setRootHandle: (handle: any) => void;
  setCurrentRepoUrl: (url: string) => void;
  setCurrentProjectId: (id: string) => void;
  setOpenFiles: (files: any[]) => void;
  setActiveFilePath: (path: string) => void;
  handleOpenFolder: (handle: any) => Promise<void>;
}

export function useGithubClone({
  session,
  searchParams,
  setShowCloneLanding,
  setIsMounting,
  setProjectName,
  setRootHandle,
  setCurrentRepoUrl,
  setCurrentProjectId,
  setOpenFiles,
  setActiveFilePath,
  handleOpenFolder,
}: UseGithubCloneProps) {
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

  return { handleCloneToLocal };
}
