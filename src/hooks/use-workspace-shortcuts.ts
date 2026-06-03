import { useEffect } from "react";

interface UseWorkspaceShortcutsProps {
  activeFilePath: string | null;
  openFiles: any[];
  setIsFindInFilesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCommandPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGitDiffOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleSave: () => void;
}

export function useWorkspaceShortcuts({
  activeFilePath,
  openFiles,
  setIsFindInFilesOpen,
  setIsCommandPaletteOpen,
  setIsGitDiffOpen,
  handleSave,
}: UseWorkspaceShortcutsProps) {
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
  }, [
    activeFilePath,
    openFiles,
    setIsFindInFilesOpen,
    setIsCommandPaletteOpen,
    setIsGitDiffOpen,
    handleSave,
  ]);
}
