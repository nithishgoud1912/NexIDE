"use client";

import { FolderOpen, Plus, ChevronRight } from "lucide-react";
import { openLocalFolder } from "@/lib/file-system";
import { useIDEStore } from "@/store/use-ide-store";
import { useRouter } from "next/navigation";
import { addRecentProject } from "@/lib/recent-projects";

import { useState } from "react";
import { RepoModal } from "./repo-modal";
import { Github } from "lucide-react";

import { toast } from "sonner";

export function DashboardActions({ session }: { session: any }) {
  const [showGithubModal, setShowGithubModal] = useState(false);
  const router = useRouter();
  const {
    setProjectName,
    setRootHandle,
    setProjectId,
    setOpenFiles,
    setActiveFilePath,
  } = useIDEStore();

  const handleOpenLocalFolder = async () => {
    try {
      const { handle } = await openLocalFolder();

      // Request permission (standard gesture)
      const status = await (handle as any).requestPermission({
        mode: "readwrite",
      });

      if (status === "granted") {
        setProjectName(handle.name);
        setRootHandle(handle);

        // Save to recent projects first to get an ID
        const id = await addRecentProject(handle.name, handle);
        setProjectId(id);

        // Clear previous workspace state
        setOpenFiles([]);
        setActiveFilePath("");

        // Navigate to workspace
        router.push(`/workspace?action=open&projectId=${id}`);
      }
    } catch (err) {
      console.error("Failed to select folder:", err);
    }
  };

  const handleRepoSelect = async (repo: any) => {
    setShowGithubModal(false);

    const toastId = toast.loading(`Cloning ${repo.full_name}...`, {
      description: "Please select a local folder to save the project.",
    });

    try {
      // 1. Ask user for a local folder
      const { handle } = await openLocalFolder();

      // Ensure we have write access
      const status = await (handle as any).requestPermission({
        mode: "readwrite",
      });

      if (status !== "granted") {
        toast.error("Permission denied to write to folder.", { id: toastId });
        return;
      }

      toast.loading(`Cloning ${repo.full_name}...`, {
        id: toastId,
        description: "Downloading files from GitHub...",
      });

      // 2. Fetch Zip
      const { fetchRepoZip, transformZipToTree } =
        await import("@/lib/github-import");
      const { mountTreeLocally } = await import("@/lib/file-system");

      const blob = await fetchRepoZip(repo.full_name, session.accessToken);

      toast.loading(`Cloning ${repo.full_name}...`, {
        id: toastId,
        description: "Extracting and writing to disk...",
      });

      // 3. Transform to tree
      const tree = await transformZipToTree(blob);

      // 4. Write to local handle
      await mountTreeLocally(handle, tree);

      // 5. Update IDE state
      setProjectName(handle.name);
      setRootHandle(handle);

      // Save to recent projects
      const id = await addRecentProject(handle.name, handle, repo.full_name);
      setProjectId(id);

      // Clear previous workspace state
      setOpenFiles([]);
      setActiveFilePath("");

      toast.success("Successfully cloned to local disk!", { id: toastId });

      // 6. Navigate to workspace
      router.push(
        `/workspace?action=open&projectId=${id}&repo=${repo.full_name}`,
      );
    } catch (err: any) {
      console.error("Clone failed:", err);
      toast.error(`Clone failed: ${err.message || String(err)}`, {
        id: toastId,
      });
    }
  };

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <button
        onClick={handleOpenLocalFolder}
        className="group relative overflow-hidden bg-white/5 border border-white/10 p-6 rounded-2xl hover:bg-white/10 hover:border-blue-500/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.1)] transition-all text-left w-full"
      >
        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
          <FolderOpen className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold text-white">Open Local Folder</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Select a folder from your local machine (recommended).
        </p>
        <div className="absolute top-4 right-4 text-zinc-600 group-hover:text-blue-400 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </div>
      </button>

      <button
        onClick={() => {
          if (!session?.accessToken) {
            toast.warning(
              "Please sign out and sign in again to enable GitHub integration.",
            );
            return;
          }
          setShowGithubModal(true);
        }}
        className="group relative overflow-hidden bg-white/5 border border-white/10 p-6 rounded-2xl hover:bg-white/10 hover:border-purple-500/50 hover:shadow-[0_0_20px_rgba(168,85,247,0.1)] transition-all text-left w-full"
      >
        <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 mb-4 group-hover:scale-110 transition-transform">
          <Github className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold text-white">Import from GitHub</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Clone a repository directly from your GitHub account.
        </p>
        <div className="absolute top-4 right-4 text-zinc-600 group-hover:text-purple-400 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </div>
      </button>

      {showGithubModal && session?.accessToken && (
        <RepoModal
          token={session.accessToken}
          onSelect={handleRepoSelect}
          onClose={() => setShowGithubModal(false)}
        />
      )}
    </section>
  );
}
