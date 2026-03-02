"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import {
  GitBranch,
  GitCommit,
  Plus,
  Minus,
  RefreshCw,
  Upload,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Circle,
} from "lucide-react";

interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
  lineNo?: number;
}

interface FileDiff {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  lines: DiffLine[];
  expanded: boolean;
}

interface GitStatusProps {
  isOpen: boolean;
  onClose: () => void;
  /** WebContainer instance to read files from */
  instance: {
    fs: { readFile: (path: string, enc: "utf-8") => Promise<string> };
  } | null;
  /** Original file contents (before edits) keyed by path */
  originalContents: Record<string, string>;
  /** Current file contents (after edits) keyed by path */
  currentContents: Record<string, string>;
  /** Repo linked to this project (e.g. "owner/repo") */
  repoUrl?: string;
  onPush?: () => void;
}

function computeDiff(original: string, current: string): DiffLine[] {
  const origLines = original.split("\n");
  const currLines = current.split("\n");

  // Simple LCS-based diff (Myers-lite)
  const diff: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < origLines.length || j < currLines.length) {
    if (i >= origLines.length) {
      diff.push({ type: "added", content: currLines[j], lineNo: j + 1 });
      j++;
    } else if (j >= currLines.length) {
      diff.push({ type: "removed", content: origLines[i], lineNo: i + 1 });
      i++;
    } else if (origLines[i] === currLines[j]) {
      diff.push({ type: "context", content: origLines[i], lineNo: i + 1 });
      i++;
      j++;
    } else {
      // Check ahead for a match (simple lookahead of 3)
      const lookahead = 3;
      let foundAdd = false;
      let foundRem = false;

      for (let k = 1; k <= lookahead; k++) {
        if (j + k < currLines.length && origLines[i] === currLines[j + k]) {
          // Lines were added before the match
          for (let l = 0; l < k; l++) {
            diff.push({
              type: "added",
              content: currLines[j + l],
              lineNo: j + l + 1,
            });
          }
          j += k;
          foundAdd = true;
          break;
        }
        if (i + k < origLines.length && origLines[i + k] === currLines[j]) {
          // Lines were removed before the match
          for (let l = 0; l < k; l++) {
            diff.push({
              type: "removed",
              content: origLines[i + l],
              lineNo: i + l + 1,
            });
          }
          i += k;
          foundRem = true;
          break;
        }
      }

      if (!foundAdd && !foundRem) {
        diff.push({ type: "removed", content: origLines[i], lineNo: i + 1 });
        diff.push({ type: "added", content: currLines[j], lineNo: j + 1 });
        i++;
        j++;
      }
    }
  }

  return diff;
}

function buildFileDiffs(
  originalContents: Record<string, string>,
  currentContents: Record<string, string>,
): FileDiff[] {
  const allPaths = new Set([
    ...Object.keys(originalContents),
    ...Object.keys(currentContents),
  ]);

  const diffs: FileDiff[] = [];

  for (const path of allPaths) {
    const original = originalContents[path] ?? "";
    const current = currentContents[path] ?? "";

    if (original === current) continue; // No change

    const status: FileDiff["status"] = !originalContents[path]
      ? "added"
      : !currentContents[path]
        ? "deleted"
        : "modified";

    const lines = computeDiff(original, current);
    const additions = lines.filter((l) => l.type === "added").length;
    const deletions = lines.filter((l) => l.type === "removed").length;

    diffs.push({ path, status, additions, deletions, lines, expanded: false });
  }

  return diffs.sort((a, b) => a.path.localeCompare(b.path));
}

const STATUS_COLORS: Record<FileDiff["status"], string> = {
  modified: "text-yellow-400",
  added: "text-green-400",
  deleted: "text-red-400",
  renamed: "text-blue-400",
};

const STATUS_LABELS: Record<FileDiff["status"], string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
};

export function GitDiffPanel({
  isOpen,
  onClose,
  originalContents,
  currentContents,
  repoUrl,
  onPush,
}: GitStatusProps) {
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    const computed = buildFileDiffs(originalContents, currentContents);
    setDiffs(computed);
    setTimeout(() => setIsRefreshing(false), 300);
  }, [originalContents, currentContents]);

  useEffect(() => {
    if (isOpen) startTransition(() => refresh());
  }, [isOpen, refresh]);

  const toggleFile = (path: string) => {
    setDiffs((prev) =>
      prev.map((d) => (d.path === path ? { ...d, expanded: !d.expanded } : d)),
    );
  };

  if (!isOpen) return null;

  const totalAdditions = diffs.reduce((s, d) => s + d.additions, 0);
  const totalDeletions = diffs.reduce((s, d) => s + d.deletions, 0);

  return (
    <div className="h-full flex flex-col bg-[#0c0c0e] border-l border-white/5">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-semibold text-zinc-300">
            Source Control
          </span>
          {diffs.length > 0 && (
            <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full font-mono">
              {diffs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={refresh}
            title="Refresh"
            className="p-1 hover:bg-white/5 rounded transition-colors"
          >
            <RefreshCw
              className={`w-3 h-3 text-zinc-500 hover:text-zinc-300 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>
          {repoUrl && onPush && diffs.length > 0 && (
            <button
              onClick={onPush}
              title="Push to GitHub"
              className="flex items-center gap-1 px-2 py-0.5 bg-violet-600/80 hover:bg-violet-600 text-white text-[10px] rounded transition-colors"
            >
              <Upload className="w-2.5 h-2.5" />
              Push
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/5 rounded transition-colors text-zinc-500 hover:text-zinc-300 text-xs"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {diffs.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-white/2 border-b border-white/5 shrink-0">
          <span className="text-[10px] text-zinc-500">
            {diffs.length} file{diffs.length !== 1 ? "s" : ""} changed
          </span>
          <span className="text-[10px] text-green-400 font-mono">
            +{totalAdditions}
          </span>
          <span className="text-[10px] text-red-400 font-mono">
            -{totalDeletions}
          </span>
          {repoUrl && (
            <span className="text-[10px] text-zinc-600 ml-auto truncate">
              {repoUrl}
            </span>
          )}
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {diffs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600">
            <GitCommit className="w-8 h-8 opacity-30" />
            <p className="text-xs">No changes detected</p>
            <p className="text-[10px] text-zinc-700">
              Edit files to see a diff here
            </p>
          </div>
        ) : (
          <div className="py-1">
            {diffs.map((diff) => (
              <div
                key={diff.path}
                className="border-b border-white/3 last:border-0"
              >
                {/* File header row */}
                <button
                  onClick={() => toggleFile(diff.path)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/3 transition-colors text-left group"
                >
                  {diff.expanded ? (
                    <ChevronDown className="w-3 h-3 text-zinc-600 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                  )}
                  <span
                    className={`text-[10px] font-bold w-3 shrink-0 ${STATUS_COLORS[diff.status]}`}
                  >
                    {STATUS_LABELS[diff.status]}
                  </span>
                  <span className="text-xs text-zinc-300 truncate flex-1 font-mono">
                    {diff.path.split("/").pop()}
                  </span>
                  <span className="text-[10px] text-zinc-600 truncate hidden group-hover:block">
                    {diff.path}
                  </span>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {diff.additions > 0 && (
                      <span className="text-[10px] text-green-400 font-mono">
                        +{diff.additions}
                      </span>
                    )}
                    {diff.deletions > 0 && (
                      <span className="text-[10px] text-red-400 font-mono">
                        -{diff.deletions}
                      </span>
                    )}
                  </div>
                </button>

                {/* Diff lines */}
                {diff.expanded && (
                  <div className="overflow-x-auto bg-black/20">
                    <table className="w-full text-[10px] font-mono border-collapse">
                      <tbody>
                        {diff.lines.map((line, idx) => {
                          if (line.type === "context") return null; // Hide context for brevity
                          return (
                            <tr
                              key={idx}
                              className={
                                line.type === "added"
                                  ? "bg-green-500/8"
                                  : "bg-red-500/8"
                              }
                            >
                              <td className="w-8 text-right pr-2 text-zinc-700 select-none border-r border-white/5 py-0.5 pl-2">
                                {line.lineNo}
                              </td>
                              <td className="w-4 text-center select-none py-0.5">
                                {line.type === "added" ? (
                                  <Plus className="w-2.5 h-2.5 text-green-400 inline" />
                                ) : (
                                  <Minus className="w-2.5 h-2.5 text-red-400 inline" />
                                )}
                              </td>
                              <td
                                className={`py-0.5 px-2 whitespace-pre ${
                                  line.type === "added"
                                    ? "text-green-300"
                                    : "text-red-300 line-through opacity-60"
                                }`}
                              >
                                {line.content || " "}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {diff.lines.filter((l) => l.type !== "context").length ===
                      0 && (
                      <div className="flex items-center gap-1.5 px-4 py-2 text-zinc-600 text-[10px]">
                        <Circle className="w-2 h-2" />
                        Binary or whitespace-only change
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      {!repoUrl && (
        <div className="px-3 py-2 border-t border-white/5 shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
            <AlertCircle className="w-3 h-3" />
            Open a project cloned from GitHub to enable push
          </div>
        </div>
      )}
    </div>
  );
}
