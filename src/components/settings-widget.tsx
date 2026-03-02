"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useSession, signOut, signIn } from "next-auth/react";
import { useIDEStore } from "@/store/use-ide-store";
import { ShellContext } from "@/context/shell-context";
import {
  Github,
  LogOut,
  Trash2,
  Monitor,
  Moon,
  Type,
  Save,
  RotateCcw,
  List,
  AlignLeft,
  Settings as SettingsIconIcon,
  Code2,
  User,
  GitBranch,
  Terminal,
} from "lucide-react";
import { fetchRepoZip, transformZipToTree } from "@/lib/github-import";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useContext, useRef } from "react";
import { useTheme } from "next-themes";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface SettingsWidgetProps {
  children: React.ReactNode;
}

export function SettingsWidget({ children }: SettingsWidgetProps) {
  const { data: session } = useSession();
  const {
    isAutoSave,
    setIsAutoSave,
    fontSize,
    setFontSize,
    theme,
    setTheme,
    showLineNumbers,
    setShowLineNumbers,
    wordWrap,
    setWordWrap,
    emmetEnabled,
    setEmmetEnabled,
    autoSaveDelay,
    setAutoSaveDelay,
  } = useIDEStore();
  const shell = useContext(ShellContext);
  const { setTheme: setAppTheme, theme: appTheme } = useTheme();
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    if (!importUrl || !shell?.instance) return;
    toast("Import Repository?", {
      description:
        "This will download the repo and save it to a local folder. Continue?",
      action: {
        label: "Import",
        onClick: async () => {
          try {
            if (!shell.instance) return;
            setIsImporting(true);
            const token = (session?.accessToken as string) || "";

            // 1. Ask user for a local save folder
            const { openLocalFolder } = await import("@/lib/file-system");
            let handle: FileSystemDirectoryHandle;
            try {
              const result = await openLocalFolder();
              handle = result.handle;
            } catch {
              toast.error("Folder selection cancelled.");
              return;
            }

            const permStatus = await (handle as any).requestPermission({
              mode: "readwrite",
            });
            if (permStatus !== "granted") {
              toast.error("Permission denied to write to folder.");
              return;
            }

            // 2. Fetch and transform ZIP
            const blob = await fetchRepoZip(importUrl, token);
            const tree = await transformZipToTree(blob);

            // 3. Mount in WebContainer
            await shell.instance.mount(tree);

            // 4. Write to local disk (consistent with dashboard import)
            const { mountTreeLocally } = await import("@/lib/file-system");
            await mountTreeLocally(handle, tree);

            toast.success(
              "Imported successfully! Files saved to local disk. Please refresh file tree.",
            );
            setImportUrl("");
          } catch (e) {
            toast.error("Import failed: " + String(e));
          } finally {
            setIsImporting(false);
          }
        },
      },
    });
  };

  const handleClearCache = async () => {
    toast("Clear System Cache?", {
      description:
        "This will reload the app and clear ALL local WebContainer storage. This cannot be undone.",
      action: {
        label: "Clear All",
        onClick: async () => {
          // Clear IndexedDB keys used by WebContainer
          const dbs = await window.indexedDB.databases();
          dbs.forEach((db) => {
            if (db.name) window.indexedDB.deleteDatabase(db.name);
          });
          localStorage.clear();
          window.location.reload();
        },
      },
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-80 bg-popover border border-border p-0 text-popover-foreground shadow-2xl mr-2 max-h-[80vh] overflow-y-auto"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="p-4 border-b border-border bg-muted/50">
          <h4 className="font-medium text-foreground text-sm">Settings</h4>
          <p className="text-xs text-muted-foreground">
            Manage your workspace preferences
          </p>
        </div>

        <div className="p-2 space-y-1">
          {/* Section: Appearance */}
          <div className="p-2 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              <Monitor className="w-3 h-3" /> Appearance
            </div>

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Monitor className="w-3.5 h-3.5 text-zinc-400" />
                <Label className="text-xs text-zinc-300 font-normal">
                  App Theme
                </Label>
              </div>
              <Select value={appTheme} onValueChange={setAppTheme}>
                <SelectTrigger className="h-7 w-[130px] bg-secondary/50 border-input text-xs text-foreground">
                  <SelectValue placeholder="System" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-popover-foreground">
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="deep-space">Deep Space</SelectItem>
                  <SelectItem value="nordic-night">Nordic Night</SelectItem>
                  <SelectItem value="cyber-amber">Cyber Amber</SelectItem>
                  <SelectItem value="glassmorphism">Glassmorphism</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Code2 className="w-3.5 h-3.5 text-zinc-400" />
                <Label className="text-xs text-zinc-300 font-normal">
                  Editor Theme
                </Label>
              </div>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="h-7 w-[130px] bg-white/5 border-white/10 text-xs text-white">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent className="bg-[#1e1e20] border-white/10 text-zinc-300">
                  <SelectItem value="vs-dark">Modern Dark</SelectItem>
                  <SelectItem value="vs-light">Modern Light</SelectItem>
                  <SelectItem value="hc-black">High Contrast</SelectItem>
                  <SelectItem value="github-dark">GitHub Dark</SelectItem>
                  <SelectItem value="one-dark-pro">One Dark Pro</SelectItem>
                  <SelectItem value="night-owl">Night Owl</SelectItem>
                  <SelectItem value="jellyfish">JellyFish</SelectItem>
                  <SelectItem value="vue-theme">Vue Theme</SelectItem>
                  <SelectItem value="dracula">Dracula</SelectItem>
                  <SelectItem value="monokai">Monokai</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Type className="w-3.5 h-3.5 text-zinc-400" />
                <Label className="text-xs text-zinc-300 font-normal">
                  Font Size
                </Label>
              </div>
              <Select
                value={fontSize.toString()}
                onValueChange={(val) => setFontSize(Number(val))}
              >
                <SelectTrigger className="h-7 w-[130px] bg-secondary/50 border-input text-xs text-foreground">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-popover-foreground">
                  <SelectItem value="10">10px</SelectItem>
                  <SelectItem value="12">12px</SelectItem>
                  <SelectItem value="14">14px</SelectItem>
                  <SelectItem value="16">16px</SelectItem>
                  <SelectItem value="18">18px</SelectItem>
                  <SelectItem value="20">20px</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="bg-white/5 mx-2" />

          {/* Section: Editor */}
          <div className="p-2 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              <Save className="w-3 h-3" /> Editor
            </div>

            <div className="flex items-center justify-between p-2 bg-white/5 border border-white/5 rounded-md">
              <div className="space-y-0.5">
                <Label className="text-xs text-zinc-200 font-medium block">
                  Auto Save
                </Label>
                <span className="text-[10px] text-zinc-500 block">
                  Saves to WebContainer
                </span>
              </div>
              <Switch
                className="scale-90 data-[state=checked]:bg-blue-600"
                checked={isAutoSave}
                onCheckedChange={setIsAutoSave}
              />
            </div>

            {isAutoSave && (
              <div className="px-2 py-1 space-y-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-zinc-500 uppercase tracking-tighter">
                    Sync Latency
                  </span>
                  <span className="text-blue-400 font-mono">
                    {autoSaveDelay}ms
                  </span>
                </div>
                <Slider
                  value={[autoSaveDelay]}
                  min={100}
                  max={5000}
                  step={100}
                  onValueChange={(val) => setAutoSaveDelay(val[0])}
                  className="py-1"
                />
                <p className="text-[9px] text-zinc-600 italic">
                  Higher latency prevents cursor jumps and sync race conditions.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <List className="w-3.5 h-3.5 text-zinc-400" />
                <Label className="text-xs text-zinc-300 font-normal">
                  Line Numbers
                </Label>
              </div>
              <Switch
                className="scale-75 data-[state=checked]:bg-blue-600"
                checked={showLineNumbers}
                onCheckedChange={setShowLineNumbers}
              />
            </div>

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <AlignLeft className="w-3.5 h-3.5 text-zinc-400" />
                <Label className="text-xs text-zinc-300 font-normal">
                  Word Wrap
                </Label>
              </div>
              <Switch
                className="scale-75 data-[state=checked]:bg-blue-600"
                checked={wordWrap === "on"}
                onCheckedChange={(checked) =>
                  setWordWrap(checked ? "on" : "off")
                }
              />
            </div>

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Code2 className="w-3.5 h-3.5 text-zinc-400" />
                <Label className="text-xs text-zinc-300 font-normal">
                  Emmet Abbreviations
                </Label>
              </div>
              <Switch
                className="scale-75 data-[state=checked]:bg-blue-600"
                checked={emmetEnabled}
                onCheckedChange={setEmmetEnabled}
              />
            </div>
          </div>

          <Separator className="bg-white/5 mx-2" />

          {/* Section: System */}
          <div className="p-2 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              <SettingsIconIcon className="w-3 h-3" /> System
            </div>

            <div className="p-2 bg-white/5 border border-white/5 rounded-md space-y-2">
              <div className="flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5 text-zinc-400" />
                <Label className="text-xs text-zinc-300 font-normal">
                  Import GitHub Repo
                </Label>
              </div>
              <div className="flex gap-1">
                <Input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="owner/repo"
                  className="h-7 text-xs bg-black/20 border-white/10"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2 text-[10px]"
                  onClick={handleImport}
                  disabled={isImporting || !importUrl}
                >
                  {isImporting ? "..." : "Import"}
                </Button>
              </div>
            </div>

            {shell && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shell.syncSize()}
                  className="h-7 text-[10px] justify-center bg-white/5 border-white/10 hover:bg-white/10 text-zinc-300"
                >
                  <Terminal className="w-3 h-3 mr-1.5" />
                  Fix Term Size
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    toast("Restart WebContainer?", {
                      description:
                        "This will kill all running processes and restart the environment.",
                      action: {
                        label: "Restart",
                        onClick: async () => {
                          await shell.restart();
                        },
                      },
                    });
                  }}
                  className="h-7 text-[10px] justify-center text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border border-transparent"
                >
                  <RotateCcw className="w-3 h-3 mr-1.5" />
                  Restart WC
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearCache}
              className="w-full h-8 text-[11px] justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Clear System Cache
            </Button>
          </div>

          <Separator className="bg-white/5 mx-2" />

          {/* Section: Account */}
          <div className="p-2 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              <User className="w-3 h-3" /> Account
            </div>

            {session?.user ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-white/5 border border-white/5 rounded-md">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {session.user.image && (
                      <img
                        src={session.user.image}
                        alt="Avatar"
                        className="w-8 h-8 rounded-full border border-white/10"
                      />
                    )}
                    <div className="overflow-hidden">
                      <span className="text-xs text-zinc-200 font-medium block truncate">
                        {session.user.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 block truncate">
                        {session.user.email}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => signOut()}
                    className="shrink-0 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open("/profile", "_self")}
                  className="w-full h-7 text-[10px] bg-white/5 border-white/10 hover:bg-white/10 text-zinc-300"
                >
                  <User className="w-3 h-3 mr-2" />
                  View Profile
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signIn()}
                className="w-full h-8 text-[11px] justify-start hover:bg-white/5"
              >
                <Github className="w-3.5 h-3.5 mr-2" />
                Sign In with GitHub
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
