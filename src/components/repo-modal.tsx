"use client";

import React, { useState, useEffect } from "react";
import { Search, Lock, Globe, Github, X, Link, ArrowRight } from "lucide-react";
import { Repo, fetchRepos, getRepo } from "@/lib/github";
import { toast } from "sonner";

interface RepoModalProps {
  token: string;
  onSelect: (repo: Repo) => void;
  onClose: () => void;
}

export const RepoModal = ({ token, onSelect, onClose }: RepoModalProps) => {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [search, setSearch] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const handleImport = async () => {
    if (!repoUrl.trim()) return;

    let owner, repoName;
    try {
      const trimmed = repoUrl.trim();
      if (trimmed.startsWith("http")) {
        const url = new URL(trimmed);
        const pathParts = url.pathname.split("/").filter(Boolean);
        // pathParts: ["owner", "repo", "maybe", "more"]
        if (pathParts.length >= 2) {
          owner = pathParts[0];
          repoName = pathParts[1].replace(/\.git$/, "");
        }
      } else {
        const parts = trimmed.split("/");
        if (parts.length >= 2) {
          owner = parts[0];
          repoName = parts[1].replace(/\.git$/, "");
        }
      }
    } catch (e) {
      toast.error("Invalid URL format");
      return;
    }

    if (!owner || !repoName) {
      toast.warning(
        "Please provide a valid repository URL (e.g., https://github.com/owner/repo) or 'owner/repo'",
      );
      return;
    }

    setImportLoading(true);
    try {
      const repo = await getRepo(token, owner, repoName);
      onSelect(repo);
    } catch (e: any) {
      // 404 means not found OR private repo without access
      // 403 means forbidden
      console.error(e);
      toast.error(
        "You can't access this repository because you are not the owner of the repo or it doesn't exist.",
      );
    } finally {
      setImportLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos(token).then((data) => {
      setRepos(data);
      setLoading(false);
    });
  }, [token]);

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-100 flex items-center justify-center p-4">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#121212]">
          <h3 className="text-lg font-semibold text-white">
            Import from GitHub
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-white/5 bg-[#121212] space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-[#09090b] border border-white/10 rounded-lg px-3 py-2">
              <Link size={16} className="text-zinc-500" />
              <input
                className="bg-transparent outline-none w-full text-sm text-zinc-200 placeholder:text-zinc-600"
                placeholder="https://github.com/username/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleImport()}
              />
            </div>
            <button
              onClick={handleImport}
              disabled={importLoading || !repoUrl}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {importLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Import <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>

          <div className="w-full h-px bg-white/5" />

          <div className="flex items-center gap-2 bg-[#09090b] border border-white/10 rounded-lg px-3 py-2">
            <Search size={16} className="text-zinc-500" />
            <input
              className="bg-transparent outline-none w-full text-sm text-zinc-200 placeholder:text-zinc-600"
              placeholder="Search your repositories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 bg-[#1e1e1e]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-sm">Fetching repositories...</p>
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              No repositories found matching "{search}"
            </div>
          ) : (
            filteredRepos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => onSelect(repo)}
                className="flex items-center justify-between w-full p-3 hover:bg-[#2a2d2e] rounded-lg transition group border border-transparent hover:border-white/5"
              >
                <div className="flex items-center gap-3 text-left min-w-0">
                  <div
                    className={`p-2 rounded-md ${repo.private ? "bg-yellow-500/10 text-yellow-500" : "bg-blue-500/10 text-blue-400"}`}
                  >
                    {repo.private ? <Lock size={14} /> : <Globe size={14} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-zinc-200 truncate group-hover:text-blue-400 transition-colors">
                      {repo.name}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      {repo.full_name}
                    </div>
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Github
                    size={16}
                    className="text-zinc-600 group-hover:text-zinc-400"
                  />
                </div>
              </button>
            ))
          )}
        </div>
        <div className="p-3 bg-[#121212] border-t border-white/5 text-[10px] text-zinc-500 text-center uppercase tracking-wider font-medium">
          Select a repository to clone
        </div>
      </div>
    </div>
  );
};
