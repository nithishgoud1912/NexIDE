"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X, ChevronRight, FileCode2, Loader2 } from "lucide-react";
import { WebContainer } from "@webcontainer/api";
import { getFileIcon } from "./file-tree";

interface SearchMatch {
  file: string;
  line: number;
  column: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

interface SearchResult {
  file: string;
  matches: SearchMatch[];
}

interface FindInFilesProps {
  isOpen: boolean;
  onClose: () => void;
  instance: WebContainer | null;
  onFileClick: (path: string, line?: number) => void;
}

async function searchInContainer(
  instance: WebContainer,
  query: string,
  caseSensitive: boolean,
  useRegex: boolean,
  currentPath: string = "",
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".cache",
  ]);
  const SKIP_EXTS = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "ico",
    "svg",
    "pdf",
    "zip",
    "tar",
    "gz",
    "mp4",
    "mp3",
    "woff",
    "woff2",
    "ttf",
    "otf",
    "eot",
    "lock",
  ]);

  let regex: RegExp;
  try {
    if (useRegex) {
      regex = new RegExp(query, caseSensitive ? "g" : "gi");
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      regex = new RegExp(escaped, caseSensitive ? "g" : "gi");
    }
  } catch {
    return [];
  }

  async function walk(dir: string) {
    let entries;
    try {
      entries = await instance.fs.readdir(dir || "/", { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = dir ? `${dir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(fullPath);
        }
      } else {
        const ext = entry.name.split(".").pop()?.toLowerCase() || "";
        if (SKIP_EXTS.has(ext)) continue;

        try {
          const content = await instance.fs.readFile(fullPath, "utf-8");
          const lines = content.split("\n");
          const fileMatches: SearchMatch[] = [];

          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(line)) !== null) {
              fileMatches.push({
                file: fullPath,
                line: lineIdx + 1,
                column: match.index + 1,
                text: line,
                matchStart: match.index,
                matchEnd: match.index + match[0].length,
              });
              if (!regex.global) break;
            }
          }

          if (fileMatches.length > 0) {
            results.push({ file: fullPath, matches: fileMatches });
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  await walk(currentPath);
  return results;
}

export function FindInFiles({
  isOpen,
  onClose,
  instance,
  onFileClick,
}: FindInFilesProps) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [totalMatches, setTotalMatches] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const runSearch = useCallback(
    async (q: string) => {
      if (!q.trim() || !instance) {
        setResults([]);
        setTotalMatches(0);
        return;
      }

      setIsSearching(true);
      try {
        const found = await searchInContainer(
          instance,
          q,
          caseSensitive,
          useRegex,
        );
        setResults(found);
        setTotalMatches(found.reduce((acc, r) => acc + r.matches.length, 0));
        // Auto-expand all files if few results
        if (found.length <= 10) {
          setExpandedFiles(new Set(found.map((r) => r.file)));
        }
      } catch (e) {
        console.error("Search failed:", e);
      } finally {
        setIsSearching(false);
      }
    },
    [instance, caseSensitive, useRegex],
  );

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 400);
  };

  const toggleFile = (file: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter") runSearch(query);
  };

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-[#0c0c0e] border-l border-white/5">
      {/* Header */}
      <div className="h-10 border-b border-white/5 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-[11px] font-semibold text-zinc-200 uppercase tracking-wider">
            Find in Files
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-md transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-white/5 shrink-0 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search across all files..."
            className="w-full bg-white/4 border border-white/8 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/10 transition-all"
          />
          {isSearching && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 animate-spin" />
          )}
        </div>

        {/* Options */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCaseSensitive((v) => !v);
              if (query) runSearch(query);
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all ${
              caseSensitive
                ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                : "bg-white/3 border-white/8 text-zinc-500 hover:text-zinc-300"
            }`}
            title="Case Sensitive"
          >
            Aa
          </button>
          <button
            onClick={() => {
              setUseRegex((v) => !v);
              if (query) runSearch(query);
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all ${
              useRegex
                ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                : "bg-white/3 border-white/8 text-zinc-500 hover:text-zinc-300"
            }`}
            title="Use Regular Expression"
          >
            .*
          </button>
          {results.length > 0 && (
            <span className="ml-auto text-[10px] text-zinc-500">
              {totalMatches} match{totalMatches !== 1 ? "es" : ""} in{" "}
              {results.length} file{results.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {!query.trim() ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
            <Search className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-xs text-zinc-500">
              Type to search across all files in your project
            </p>
          </div>
        ) : results.length === 0 && !isSearching ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
            <p className="text-xs text-zinc-500">No results found</p>
          </div>
        ) : (
          <div className="py-1">
            {results.map((result) => {
              const isExpanded = expandedFiles.has(result.file);
              const fileName = result.file.split("/").pop() || result.file;
              return (
                <div key={result.file}>
                  {/* File header */}
                  <button
                    onClick={() => toggleFile(result.file)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/3 transition-colors text-left"
                  >
                    <ChevronRight
                      className={`w-3 h-3 text-zinc-600 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                    <span className="shrink-0">{getFileIcon(fileName)}</span>
                    <span className="text-xs text-zinc-300 font-medium truncate flex-1">
                      {fileName}
                    </span>
                    <span className="text-[10px] text-zinc-600 shrink-0">
                      {result.matches.length}
                    </span>
                  </button>

                  {/* Matches */}
                  {isExpanded &&
                    result.matches.map((match, idx) => (
                      <button
                        key={idx}
                        onClick={() => onFileClick(match.file, match.line)}
                        className="w-full flex items-start gap-2 pl-8 pr-3 py-1 hover:bg-violet-500/5 transition-colors text-left group"
                      >
                        <span className="text-[10px] text-zinc-600 shrink-0 w-8 text-right font-mono pt-0.5">
                          {match.line}
                        </span>
                        <span className="text-[11px] text-zinc-400 font-mono truncate group-hover:text-zinc-200 transition-colors">
                          {match.text.slice(0, match.matchStart)}
                          <mark className="bg-yellow-400/30 text-yellow-200 rounded-sm">
                            {match.text.slice(match.matchStart, match.matchEnd)}
                          </mark>
                          {match.text.slice(match.matchEnd)}
                        </span>
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
