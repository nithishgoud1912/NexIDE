"use client";

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { WebContainer, WebContainerProcess } from "@webcontainer/api";
import { io, Socket } from "socket.io-client";
import { useTheme } from "next-themes";
import { useIDEStore } from "@/store/use-ide-store";

interface ShellContextType {
  terminal: any;
  fitAddon: any;
  boot: (instance: WebContainer) => Promise<void>;
  /* Send command to terminal */
  sendCommand: (command: string) => void;
  /* Send SIGINT (Ctrl+C) to terminal */
  interrupt: () => void;
  /* Kill and restart the shell */
  restart: () => Promise<void>;
  previewUrl: string | null;
  setPreviewUrl: (url: string | null) => void;
  activePort: number | null;
  isLocalTerminal: boolean;
  toggleTerminalMode: () => void;
  syncSize: () => void;
  requestTypes: (packages: string[]) => void;
  updateRootPath: (path: string) => void;
  findProjectOnHost: (name: string) => void;
  openProjectPath: (path: string) => void;
  bootLocal: () => Promise<void>;
  destroy: () => void;
  instance: WebContainer | null;
  subscribeToOutput: (callback: (data: string) => void) => () => void;
}

export const ShellContext = createContext<ShellContextType | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [terminal, setTerminal] = useState<any>(null);
  const [fitAddon, setFitAddon] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activePort, setActivePort] = useState<number | null>(null);
  // Track instance in both a ref (for callbacks) and state (for consumers)
  const currentInstanceRef = useRef<WebContainer | null>(null);
  const [currentInstance, setCurrentInstance] = useState<WebContainer | null>(
    null,
  );
  const terminalRef = useRef<any>(null);
  const inputWriterRef = useRef<WritableStreamDefaultWriter<string> | null>(
    null,
  );
  const [isLocalTerminal, setIsLocalTerminal] = useState(false);
  const isBootingRef = useRef(false);
  const localSocketRef = useRef<Socket | null>(null);
  const { theme: appTheme, systemTheme } = useTheme();

  const userEditTimestampsRef = useRef<Map<string, number>>(new Map());
  const outputListenersRef = useRef<Set<(data: string) => void>>(new Set());
  const FILE_SYNC_GRACE_PERIOD = 5000; // 5 seconds - prevents race conditions during auto-save

  // Refs for cleanup
  const shellProcessRef = useRef<WebContainerProcess | null>(null);
  const serverListenerCleanupRef = useRef<(() => void) | null>(null);
  const isLocalTerminalRef = useRef(isLocalTerminal);

  useEffect(() => {
    isLocalTerminalRef.current = isLocalTerminal;
  }, [isLocalTerminal]);

  // Helper to ensure socket is initialized once
  const initSocket = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (localSocketRef.current) return localSocketRef.current;

    // In production (Render), the PTY server runs on the same port as Next.js.
    // Pass undefined/empty to socket.io-client to connect to the same origin.
    // For local dev, set NEXT_PUBLIC_PTY_URL=http://localhost:3001
    const ptyUrl = process.env.NEXT_PUBLIC_PTY_URL || "";
    console.log(`[Shell] Connecting to PTY at ${ptyUrl || "(same origin)"}...`);
    const socket = ptyUrl ? io(ptyUrl) : io();
    localSocketRef.current = socket;

    socket.on("connect", () => {
      console.log("[PTY Server] Connected for types and sync.");
    });

    socket.on("type-definition", ({ name, path, content }) => {
      const monaco = (window as any).monaco;
      const tsLanguages = monaco?.languages?.typescript as any;
      if (tsLanguages?.typescriptDefaults) {
        tsLanguages.typescriptDefaults.addExtraLib(content, `file:///${path}`);
        console.log(`[ShellContext] Injected types for ${name}`);
      }
    });

    socket.on("file-sync", async ({ path, content }) => {
      const monaco = (window as any).monaco;

      // 1. Mirror to WebContainer (The "Reverse Bridge")
      // We strip the file:/// prefix to get the relative path for the container
      // The PTY sends file:///src/App.tsx -> we want src/App.tsx
      if (currentInstanceRef.current) {
        try {
          const relativePath = path.replace("file:///", "");
          await currentInstanceRef.current.fs.writeFile(relativePath, content);
          // console.log(`[ShellContext] Mirrored ${relativePath} to WebContainer`);
        } catch (e) {
          console.warn(
            `[ShellContext] Failed to mirror ${path} to WebContainer`,
            e,
          );
        }
      }

      if (!monaco) return;

      // Check if user recently edited this file
      const lastEditTime = userEditTimestampsRef.current.get(path);
      const now = Date.now();

      // Increased grace period and added active editor check
      if (lastEditTime && now - lastEditTime < FILE_SYNC_GRACE_PERIOD) {
        // console.log(`[ShellContext] Skipping file-sync for ${path} - user is active`);
        return;
      }

      const currentActivePath = useIDEStore.getState().activeFilePath;
      if (currentActivePath && path.endsWith(currentActivePath)) {
        return;
      }

      // Verify if any editor currently has this path open and focused
      const editors = monaco.editor.getEditors();
      const isActiveInEditor = editors.some((editor: any) => {
        const model = editor.getModel();
        return (
          model &&
          model.uri.toString() === monaco.Uri.parse(path).toString() &&
          editor.hasTextFocus()
        );
      });

      if (isActiveInEditor) {
        return;
      }

      const uri = monaco.Uri.parse(path);
      let model = monaco.editor.getModel(uri);

      if (model) {
        const currentValue = model.getValue();
        // Only update if content is different
        if (currentValue !== content) {
          // Update model logic remains the same...
          // Use pushEditOperations for smoother updates if it's visible but not focused
          model.pushEditOperations(
            [],
            [
              {
                range: model.getFullModelRange(),
                text: content,
              },
            ],
            () => null,
          );
        }
      } else {
        // Create new model
        const ext = path.split(".").pop()?.toLowerCase();
        const lang =
          ext === "ts"
            ? "typescript"
            : ext === "tsx"
              ? "typescriptreact"
              : ext === "js"
                ? "javascript"
                : ext === "jsx"
                  ? "javascriptreact"
                  : "typescript";

        monaco.editor.createModel(content, lang, uri);
      }
    });

    socket.on("project-located", (absolutePath: string) => {
      console.log(`[ShellContext] Project auto-located at ${absolutePath}`);
      if (typeof window !== "undefined") {
        const event = new CustomEvent("project-located", {
          detail: absolutePath,
        });
        window.dispatchEvent(event);
      }
    });

    socket.on("root-path", (path: string) => {
      console.log(`[ShellContext] Backend root confirmed at: ${path}`);
      if (typeof window !== "undefined") {
        const event = new CustomEvent("root-path-confirmed", { detail: path });
        window.dispatchEvent(event);
      }
    });

    socket.on("project-not-found", (folderName: string) => {
      console.warn(
        `[ShellContext] Backend could not find folder: ${folderName}`,
      );
      if (typeof window !== "undefined") {
        const event = new CustomEvent("project-not-found", {
          detail: folderName,
        });
        window.dispatchEvent(event);
      }
    });

    return socket;
  }, []);

  // 1. Establish Long-lived Connection to Local PTY Server for Types & Sync
  useEffect(() => {
    initSocket();
    return () => {
      if (localSocketRef.current) {
        localSocketRef.current.disconnect();
        localSocketRef.current = null;
      }
    };
  }, [initSocket]);

  // Listen for user edit events from editor
  useEffect(() => {
    const handleUserEdit = (e: CustomEvent) => {
      userEditTimestampsRef.current.set(e.detail, Date.now());
    };

    if (typeof window !== "undefined") {
      window.addEventListener("user-edit", handleUserEdit as any);
      return () =>
        window.removeEventListener("user-edit", handleUserEdit as any);
    }
  }, []);

  // Update Terminal Theme when App Theme changes
  useEffect(() => {
    if (!terminal) return;
    const currentTheme = appTheme === "system" ? systemTheme : appTheme;

    // Theme configurations
    // Note: background can be 'transparent' if allowTransparency is on (except for xterm limitation)
    // Actually standard xterm needs a color or transparent.
    const themes: Record<string, any> = {
      light: {
        background: "#ffffff",
        foreground: "#1f2937", // gray-800
        cursor: "#000000",
        selection: "rgba(0,0,0,0.1)",
        black: "#000000",
      },
      dark: {
        // Modern Dark
        background: "#0c0c0c",
        foreground: "#d4d4d4",
        cursor: "#ffffff",
        selection: "rgba(255,255,255,0.1)",
      },
      "deep-space": {
        background: "#000000",
        foreground: "#ffffff",
        cursor: "#3b82f6", // Electric Blue
        selection: "#1e293b",
      },
      "nordic-night": {
        background: "#0f172a", // Slate 900
        foreground: "#e2e8f0", // Slate 200
        cursor: "#22d3ee", // Cyan
        selection: "#334155",
      },
      "cyber-amber": {
        background: "#121212",
        foreground: "#fbbf24", // Amber
        cursor: "#fbbf24",
        selection: "rgba(251, 191, 36, 0.2)",
      },
      glassmorphism: {
        background: "#00000000", // Transparent
        foreground: "#ffffff",
        cursor: "#ffffff",
        selection: "rgba(255,255,255,0.1)",
      },
    };

    const selectedTheme = themes[currentTheme || "dark"] || themes.dark;

    // Apply theme
    terminal.options.theme = selectedTheme;
  }, [terminal, appTheme, systemTheme]);

  // New: Boot ONLY the preview server (headless)
  const bootPreviewServer = useCallback(async (instance: WebContainer) => {
    // Background process: npm install && npm run dev
    console.log("[ShellContext] Starting Headless Preview Server...");

    // Listen for server-ready
    const cleanup = instance.on("server-ready", (port, url) => {
      console.log(`[WebContainer] Background Preview Ready: ${url}`);
      setPreviewUrl(url);
      setActivePort(port);
    });
    serverListenerCleanupRef.current = cleanup;

    // Run commands silently
    try {
      // We assume 'npm install' is handled or we do it efficiently?
      // Let's try skipping install if node_modules exists (simplification)
      const installProcess = await instance.spawn("npm", ["install"]);
      await installProcess.exit;

      // Start Dev Server
      // FORCE Host 0.0.0.0
      const devProcess = await instance.spawn("npm", [
        "run",
        "dev",
        "--",
        "--host",
      ]);

      // Log output only to console for debug, not to terminal (terminal is for local PTY)
      devProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            // console.debug("[Preview Server]", data);
          },
        }),
      );

      shellProcessRef.current = devProcess;
    } catch (e) {
      console.error("Failed to start preview server", e);
    }
  }, []);

  // Boot Local Terminal (Now the DEFAULT and ONLY interactive terminal)
  const bootLocal = useCallback(async () => {
    if (typeof window === "undefined") return;

    const { Terminal: Xterm } = await import("xterm");
    const { FitAddon } = await import("@xterm/addon-fit");
    const { WebLinksAddon } = await import("@xterm/addon-web-links");

    if (isBootingRef.current) return;
    // If we're already local, don't reboot unless forced (handled by caller)
    if (isLocalTerminal && terminalRef.current) return;

    isBootingRef.current = true;
    try {
      // Dispose previous
      if (terminalRef.current) {
        terminalRef.current.dispose();
      }

      // Cleanup WebContainer shell process if it was running interactively (remote mode)
      if (shellProcessRef.current) {
        shellProcessRef.current.kill();
        shellProcessRef.current = null;
      }

      setIsLocalTerminal(true);
      isLocalTerminalRef.current = true;

      // Init Xterm
      const xterm = new Xterm({
        cursorBlink: true,
        convertEol: true,
        allowProposedApi: true,
        scrollback: 5000,
        scrollOnUserInput: true,
        allowTransparency: true,
        rightClickSelectsWord: true, // Improved selection for copying
        theme: {
          background: "#0c0c0c",
          foreground: "#d4d4d4",
          cursor: "#f59e0b",
        },
      });

      const fit = new FitAddon();
      xterm.loadAddon(fit);
      xterm.loadAddon(new WebLinksAddon());

      setTerminal(xterm);
      setFitAddon(fit);
      terminalRef.current = xterm;

      // 1. Use the existing Long-lived Socket
      const socket = initSocket() as any;
      if (!socket) {
        throw new Error("Local PTY Server socket could not be initialized");
      }

      socket.off("connect");
      socket.off("output");
      socket.off("disconnect");

      socket.on("connect", () => {
        console.log("[Local Terminal] Terminal session active on Socket.IO");
        // Initial resize
        socket.emit("resize", { cols: xterm.cols, rows: xterm.rows });
        xterm.writeln(
          "\x1b[33m[Local Mode] Connected to Host Shell (Socket.IO)\x1b[0m",
        );
      });

      // 2. Pipe PTY Output -> xterm
      socket.on("output", (data: string) => {
        // We ALWAYS show local output now.
        // Virtual mode doesn't exist for the terminal anymore.
        xterm.write(data);

        // Notify Listeners (Agent)
        outputListenersRef.current.forEach((listener) => {
          try {
            listener(data);
          } catch (e) {
            console.error("Output listener failed", e);
          }
        });

        // Auto-detect localhost URL
        const cleanData = data.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
        const urlMatch = cleanData.match(/(?:http:\/\/)?localhost:(\d+)/i);
        if (urlMatch) {
          const port = parseInt(urlMatch[1], 10);
          const url = `http://localhost:${port}`;
          // Avoid setting if already set to prevent jitter, but allow if different
          // Also ignore default dev ports that might be internal if not explicitly seen
          console.log(`[Local Terminal] Detected Local Server: ${url}`);
          setPreviewUrl(url);
          setActivePort(port);
        }
      });

      socket.on("disconnect", () => {
        xterm.writeln("\r\n\x1b[31m[Disconnected from Host]\x1b[0m");
      });

      // 3. Attach Input Listener (xterm -> PTY)
      xterm.onData((data) => {
        socket.emit("input", data);
      });

      // 4. Shortcut Interceptor & Copy Support
      xterm.attachCustomKeyEventHandler((ev) => {
        if (ev.ctrlKey && ev.key === "c" && ev.type === "keydown") {
          if (xterm.hasSelection()) {
            const text = xterm.getSelection();
            navigator.clipboard.writeText(text);
            return false; // Handled
          }
          socket.emit("input", "\x03");
          ev.preventDefault();
          return false;
        }
        return true;
      });

      xterm.onResize((dims) => {
        socket.emit("resize", {
          cols: dims.cols,
          rows: dims.rows,
        });
      });

      console.log("[Local Terminal] Terminal initialized.");
    } catch (e) {
      console.error("Failed to boot local terminal", e);
    } finally {
      isBootingRef.current = false;
    }
  }, [isLocalTerminal, initSocket]);

  // Boot WebContainer (NOW ONLY FOR PREVIEW, NO INTERACTIVE TERMINAL)
  const boot = useCallback(
    async (instance: WebContainer) => {
      // Set instance in both ref (for callbacks) and state (for consumers)
      currentInstanceRef.current = instance;
      setCurrentInstance(instance);

      // Start the headless preview server
      await bootPreviewServer(instance);

      // Boot the LOCAL terminal for user interaction (if not already)
      if (!isLocalTerminal) {
        bootLocal();
      }
    },
    [bootPreviewServer, isLocalTerminal, bootLocal],
  );

  // Deprecated: No longer toggling since we are Local-First
  const toggleTerminalMode = useCallback(() => {
    // No-op or maybe restart local?
    bootLocal();
  }, [bootLocal]);

  const sendCommand = useCallback(
    (command: string) => {
      try {
        if (isLocalTerminal && localSocketRef.current) {
          (localSocketRef.current as any).emit("input", command + "\n");
        } else if (inputWriterRef.current) {
          inputWriterRef.current.write(command + "\n");
        } else {
          console.warn("Terminal input writer not ready.");
        }
      } catch (e) {
        console.error("Failed to send command:", e);
      }
    },
    [isLocalTerminal],
  );

  const interrupt = useCallback(() => {
    try {
      if (isLocalTerminal && localSocketRef.current) {
        (localSocketRef.current as any).emit("input", "\x03");
      } else if (inputWriterRef.current) {
        inputWriterRef.current.write("\x03");
      } else {
        console.warn("Terminal input writer not ready for interrupt.");
      }
    } catch (e) {
      console.error("Failed to send interrupt:", e);
    }
  }, [isLocalTerminal]);

  const restart = useCallback(async () => {
    if (currentInstanceRef.current) {
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      if (inputWriterRef.current) {
        try {
          await inputWriterRef.current.close();
        } catch (e) {}
        inputWriterRef.current = null;
      }
      const instance = currentInstanceRef.current;
      currentInstanceRef.current = null;
      await boot(instance);
    }
  }, [boot]);

  const destroy = useCallback(() => {
    interrupt();
    if (terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
    }
    if (localSocketRef.current) {
      localSocketRef.current.disconnect();
      localSocketRef.current = null;
    }
    if (inputWriterRef.current) {
      inputWriterRef.current.close().catch(() => {});
      inputWriterRef.current = null;
    }
    // Cleanup previous shell process
    if (shellProcessRef.current) {
      shellProcessRef.current.kill();
      shellProcessRef.current = null;
    }
    // Cleanup server listener
    if (serverListenerCleanupRef.current) {
      serverListenerCleanupRef.current();
      serverListenerCleanupRef.current = null;
    }

    setTerminal(null);
    setFitAddon(null);
    setPreviewUrl(null);
    setIsLocalTerminal(false);
    isBootingRef.current = false;
    currentInstanceRef.current = null;
    setCurrentInstance(null);
    console.log("[ShellContext] Cleaned up and terminal destroyed.");
  }, [interrupt]);

  const syncSize = useCallback(() => {
    if (terminalRef.current && fitAddon) {
      try {
        console.log("[Terminal] Performing full sync and reset...");
        terminalRef.current.reset();
        fitAddon.fit();
        const dims = {
          cols: terminalRef.current.cols,
          rows: terminalRef.current.rows,
        };
        if (isLocalTerminal && localSocketRef.current) {
          localSocketRef.current.emit("resize", dims);
        }
        terminalRef.current.refresh(0, terminalRef.current.rows - 1);
        requestAnimationFrame(() => {
          terminalRef.current?.scrollToBottom();
        });
        console.log(`[Terminal] Sync complete: ${dims.cols}x${dims.rows}`);
      } catch (e) {
        console.warn("Manual syncSize failed:", e);
      }
    }
  }, [isLocalTerminal, fitAddon]);

  const updateRootPath = useCallback((path: string) => {
    if (localSocketRef.current) {
      (localSocketRef.current as any).emit("chdir", path);
    }
  }, []);

  const findProjectOnHost = useCallback((name: string) => {
    if (localSocketRef.current) {
      (localSocketRef.current as any).emit("find-project", name);
    }
  }, []);

  const openProjectPath = useCallback((path: string) => {
    if (localSocketRef.current) {
      (localSocketRef.current as any).emit("open-project-path", path);
    }
  }, []);

  const subscribeToOutput = useCallback((callback: (data: string) => void) => {
    outputListenersRef.current.add(callback);
    return () => {
      outputListenersRef.current.delete(callback);
    };
  }, []);

  const value = React.useMemo(
    () => ({
      terminal,
      fitAddon,
      boot,
      sendCommand,
      interrupt,
      restart,
      previewUrl,
      setPreviewUrl,
      activePort,
      isLocalTerminal,
      toggleTerminalMode,
      syncSize,
      destroy,
      requestTypes: (packages: string[]) => {
        if (localSocketRef.current) {
          (localSocketRef.current as any).emit("request-types", packages);
        }
      },
      updateRootPath,
      findProjectOnHost,
      openProjectPath,
      bootLocal,
      subscribeToOutput,
      // Use state-tracked instance so consumers re-render when it changes
      instance: currentInstance,
    }),
    [
      terminal,
      fitAddon,
      boot,
      sendCommand,
      interrupt,
      restart,
      previewUrl,
      activePort,
      isLocalTerminal,
      toggleTerminalMode,
      syncSize,
      destroy,
      updateRootPath,
      findProjectOnHost,
      openProjectPath,
      bootLocal,
      subscribeToOutput,
      currentInstance,
    ],
  );

  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export const useShell = () => {
  const context = useContext(ShellContext);
  if (!context) throw new Error("useShell must be used within a ShellProvider");
  return context;
};
