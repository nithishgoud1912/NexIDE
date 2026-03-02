"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  startTransition,
} from "react";
import { Search, X } from "lucide-react";
import { getFileIcon } from "./file-tree";

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  category: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
  recentFiles?: { path: string; name: string }[];
  onFileOpen?: (path: string) => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  commands,
  recentFiles = [],
  onFileOpen,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build file commands from recent files
  const fileCommands: CommandItem[] = recentFiles.map((f) => ({
    id: `file:${f.path}`,
    label: f.name,
    description: f.path,
    icon: getFileIcon(f.name),
    category: "Open File",
    action: () => onFileOpen?.(f.path),
  }));

  const allItems = [...fileCommands, ...commands];

  const filtered = query.trim()
    ? allItems.filter((item) => {
        const q = query.toLowerCase();
        return (
          item.label.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.keywords?.some((k) => k.toLowerCase().includes(q))
        );
      })
    : commands; // Show commands (not files) when no query

  // Group by category
  const grouped = useMemo(() => {
    return filtered.reduce(
      (acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
      },
      {} as Record<string, CommandItem[]>,
    );
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => Object.values(grouped).flat(), [grouped]);

  useEffect(() => {
    if (isOpen) {
      startTransition(() => {
        setQuery("");
        setSelectedIndex(0);
      });
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  useEffect(() => {
    startTransition(() => setSelectedIndex(0));
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatList[selectedIndex];
        if (item) {
          item.action();
          onClose();
        }
      }
    },
    [flatList, selectedIndex, onClose],
  );

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl mx-4 bg-[#111113] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search files..."
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="text-[10px] text-zinc-600 bg-white/5 border border-white/8 rounded px-1.5 py-0.5 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[400px] overflow-y-auto py-2 custom-scrollbar"
        >
          {flatList.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-zinc-600">
              No commands found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="px-4 py-1.5">
                  <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
                    {category}
                  </span>
                </div>
                {items.map((item) => {
                  const globalIdx = flatList.indexOf(item);
                  const isSelected = globalIdx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      data-index={globalIdx}
                      onClick={() => {
                        item.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "bg-violet-500/10 text-white"
                          : "text-zinc-400 hover:bg-white/3 hover:text-zinc-200"
                      }`}
                    >
                      <span
                        className={`shrink-0 ${isSelected ? "text-violet-400" : "text-zinc-500"}`}
                      >
                        {item.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {item.label}
                        </div>
                        {item.description && (
                          <div className="text-[10px] text-zinc-600 truncate mt-0.5">
                            {item.description}
                          </div>
                        )}
                      </div>
                      {item.shortcut && (
                        <div className="flex items-center gap-1 shrink-0">
                          {item.shortcut.split("+").map((key, i) => (
                            <kbd
                              key={i}
                              className="text-[10px] text-zinc-600 bg-white/5 border border-white/8 rounded px-1.5 py-0.5 font-mono"
                            >
                              {key}
                            </kbd>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-white/5 px-4 py-2 flex items-center gap-4 text-[10px] text-zinc-600">
          <span className="flex items-center gap-1">
            <kbd className="bg-white/5 border border-white/8 rounded px-1 font-mono">
              ↑↓
            </kbd>{" "}
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-white/5 border border-white/8 rounded px-1 font-mono">
              ↵
            </kbd>{" "}
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-white/5 border border-white/8 rounded px-1 font-mono">
              ESC
            </kbd>{" "}
            close
          </span>
        </div>
      </div>
    </div>
  );
}
