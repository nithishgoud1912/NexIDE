"use client";

import { useState, memo, useMemo, useCallback, useEffect, useRef } from "react";
import {
  FolderOpen,
  Folder,
  Code2,
  ChevronRight,
  Link as LinkIcon,
  Trash2,
  FilePlus,
  FolderPlus,
  FileCode2,
  FileJson,
  FileType2,
  FileImage,
  FileText,
  Pencil,
} from "lucide-react";
import {
  FileSystemTree,
  DirectoryNode,
  FileNode,
  SymlinkNode,
} from "@webcontainer/api";
import { useVirtualizer } from "@tanstack/react-virtual";

interface FileTreeProps {
  tree: FileSystemTree;
  onFileClick: (path: string) => void;
  onFileCreate?: (path: string) => void;
  onFolderCreate?: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (path: string) => void;
  activeFilePath?: string;
  projectName?: string;
  projectId?: string;
}

export interface FlatNode {
  path: string;
  name: string;
  depth: number;
  node: DirectoryNode | FileNode | SymlinkNode;
}

function flattenTree(
  tree: FileSystemTree,
  expandedFolders: Set<string>,
  currentPath = "",
  depth = 0
): FlatNode[] {
  let result: FlatNode[] = [];

  const entries = Object.entries(tree).sort(([nameA, nodeA], [nameB, nodeB]) => {
    const isDirA = "directory" in nodeA;
    const isDirB = "directory" in nodeB;
    if (isDirA && !isDirB) return -1;
    if (!isDirA && isDirB) return 1;
    return nameA.localeCompare(nameB);
  });

  for (const [name, node] of entries) {
    const path = currentPath ? `${currentPath}/${name}` : name;
    result.push({ path, name, depth, node });

    if ("directory" in node && expandedFolders.has(path)) {
      result = result.concat(
        flattenTree(node.directory, expandedFolders, path, depth + 1)
      );
    }
  }

  return result;
}

export const FileTree = memo(function FileTree({
  tree,
  onFileClick,
  onFileCreate,
  onFolderCreate,
  onDelete,
  onRename,
  activeFilePath,
  projectName,
  projectId,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );

  const flatNodes = useMemo(() => {
    return flattenTree(tree, expandedFolders);
  }, [tree, expandedFolders]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Auto-expand parents when active file changes
  useEffect(() => {
    if (activeFilePath) {
      const parts = activeFilePath.split("/");
      let currentPath = "";
      
      setExpandedFolders((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
          if (!next.has(currentPath)) {
            next.add(currentPath);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [activeFilePath]);

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28, // h-7 (28px)
    overscan: 20,
  });

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="flex items-center justify-between px-3 h-10 border-b border-border bg-muted/40 shrink-0">
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">
            {projectName || "EXPLORER"}
          </span>
          {projectId && (
            <span
              className="text-[9px] font-mono text-muted-foreground shrink-0 bg-accent px-1.5 py-0.5 rounded border border-border cursor-help"
              title={`Project ID: ${projectId}`}
            >
              {projectId.substring(0, 8)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFileCreate?.("");
            }}
            className="p-1 hover:bg-zinc-800 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="New File"
          >
            <FilePlus className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFolderCreate?.("");
            }}
            className="p-1 hover:bg-zinc-800 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="New Folder"
          >
            <FolderPlus className="w-3 h-3" />
          </button>
        </div>
      </div>
      
      <div
        ref={parentRef}
        className="flex flex-col flex-1 overflow-y-auto no-scrollbar"
        style={{ width: "100%" }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = flatNodes[virtualRow.index];
            return (
              <div
                key={item.path}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <FileTreeItem
                  name={item.name}
                  node={item.node}
                  path={item.path}
                  depth={item.depth}
                  isOpen={expandedFolders.has(item.path)}
                  onToggle={() => toggleFolder(item.path)}
                  onFileClick={onFileClick}
                  onFileCreate={onFileCreate}
                  onFolderCreate={onFolderCreate}
                  onDelete={onDelete}
                  onRename={onRename}
                  activeFilePath={activeFilePath}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

interface FileTreeItemProps {
  name: string;
  node: DirectoryNode | FileNode | SymlinkNode;
  path: string;
  depth: number;
  isOpen: boolean;
  onToggle: () => void;
  onFileClick: (path: string) => void;
  onFileCreate?: (path: string) => void;
  onFolderCreate?: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (path: string) => void;
  activeFilePath?: string;
}

export function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return <FileCode2 className="w-3.5 h-3.5 text-blue-400" />;
    case "js":
    case "jsx":
      return <FileCode2 className="w-3.5 h-3.5 text-yellow-400" />;
    case "css":
    case "scss":
    case "less":
      return <FileType2 className="w-3.5 h-3.5 text-cyan-400" />;
    case "html":
      return <FileCode2 className="w-3.5 h-3.5 text-orange-500" />;
    case "json":
      return <FileJson className="w-3.5 h-3.5 text-yellow-200" />;
    case "md":
      return <FileText className="w-3.5 h-3.5 text-white" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "svg":
    case "ico":
      return <FileImage className="w-3.5 h-3.5 text-purple-400" />;
    default:
      return <Code2 className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

const FileTreeItem = memo(function FileTreeItem({
  name,
  node,
  path,
  depth,
  isOpen,
  onToggle,
  onFileClick,
  onFileCreate,
  onFolderCreate,
  onDelete,
  onRename,
  activeFilePath,
}: FileTreeItemProps) {
  const isDirectory = "directory" in node;
  const isFile = "file" in node;
  const isSymlink = "symlink" in node;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDirectory) {
      onToggle();
    } else if (isFile) {
      onFileClick(path);
    }
  };

  const paddingLeft = depth * 12 + 12;
  const isActive = activeFilePath === path;

  return (
    <div
      className={`w-full group h-7 flex items-center gap-1.5 px-2 cursor-pointer transition-all border-l-[3px] ${
        isActive && isFile
          ? "bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-100"
          : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      } ${isSymlink ? "opacity-50 cursor-not-allowed" : ""}`}
      style={{ paddingLeft: `${paddingLeft}px` }}
      onClick={handleClick}
    >
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {isDirectory && (
          <span
            className={`transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
          >
            <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400" />
          </span>
        )}
        {!isDirectory && <div className="w-3" />}

        {isDirectory ? (
          isOpen ? (
            <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-blue-500/70 group-hover:text-blue-400 transition-colors" />
          )
        ) : isSymlink ? (
          <LinkIcon className="w-3.5 h-3.5 text-zinc-500" />
        ) : (
          getFileIcon(name)
        )}
        <span
          className={`text-[12px] truncate select-none ${isActive ? "font-semibold" : "font-medium"}`}
        >
          {name}
        </span>
      </div>

      {/* Actions */}
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 pr-1 transition-opacity">
        {isDirectory && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFileCreate?.(path);
              }}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title="New File"
            >
              <FilePlus className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFolderCreate?.(path);
              }}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title="New Folder"
            >
              <FolderPlus className="w-3 h-3" />
            </button>
          </>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRename?.(path);
          }}
          className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Rename"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(path);
          }}
          className="p-1 hover:bg-red-500/20 rounded text-muted-foreground hover:text-red-500 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});
