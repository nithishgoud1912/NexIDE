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
import { useTheme } from "next-themes";
import { useIDEStore } from "@/store/use-ide-store";

interface ShellContextType {
  terminal: any;
  fitAddon: any;
  boot: (instance: WebContainer) => Promise<void>;
  sendCommand: (command: string) => void;
  interrupt: () => void;
  restart: () => Promise<void>;
  previewUrl: string | null;
  setPreviewUrl: (url: string | null) => void;
  activePort: number | null;
  syncSize: () => void;
  destroy: () => void;
  instance: WebContainer | null;
  subscribeToOutput: (callback: (data: string) => void) => () => void;

  // Stubs for removed local features so other components don't break
  isLocalTerminal: boolean;
  toggleTerminalMode: () => void;
  requestTypes: (packages: string[]) => void;
  updateRootPath: (path: string) => void;
  findProjectOnHost: (name: string) => void;
  openProjectPath: (path: string) => void;
  bootLocal: () => Promise<void>;
}

export const ShellContext = createContext<ShellContextType | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [terminal, setTerminal] = useState<any>(null);
  const [fitAddon, setFitAddon] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activePort, setActivePort] = useState<number | null>(null);
  const currentInstanceRef = useRef<WebContainer | null>(null);
  const [currentInstance, setCurrentInstance] = useState<WebContainer | null>(
    null,
  );
  const terminalRef = useRef<any>(null);
  const inputWriterRef = useRef<WritableStreamDefaultWriter<string> | null>(
    null,
  );
  const isBootingRef = useRef(false);
  const { theme: appTheme, systemTheme } = useTheme();

  const outputListenersRef = useRef<Set<(data: string) => void>>(new Set());

  // Refs for cleanup
  const shellProcessRef = useRef<WebContainerProcess | null>(null);

  // Update Terminal Theme when App Theme changes
  useEffect(() => {
    if (!terminal) return;
    const currentTheme = appTheme === "system" ? systemTheme : appTheme;

    const themes: Record<string, any> = {
      light: {
        background: "#ffffff",
        foreground: "#1f2937",
        cursor: "#000000",
        selection: "rgba(0,0,0,0.1)",
        black: "#000000",
      },
      dark: {
        background: "#0c0c0c",
        foreground: "#d4d4d4",
        cursor: "#ffffff",
        selection: "rgba(255,255,255,0.1)",
      },
      "deep-space": {
        background: "#000000",
        foreground: "#ffffff",
        cursor: "#3b82f6",
        selection: "#1e293b",
      },
      "nordic-night": {
        background: "#0f172a",
        foreground: "#e2e8f0",
        cursor: "#22d3ee",
        selection: "#334155",
      },
      "cyber-amber": {
        background: "#121212",
        foreground: "#fbbf24",
        cursor: "#fbbf24",
        selection: "rgba(251, 191, 36, 0.2)",
      },
      glassmorphism: {
        background: "#00000000",
        foreground: "#ffffff",
        cursor: "#ffffff",
        selection: "rgba(255,255,255,0.1)",
      },
    };

    terminal.options.theme = themes[currentTheme || "dark"] || themes.dark;
  }, [terminal, appTheme, systemTheme]);

  const boot = useCallback(async (instance: WebContainer) => {
    if (typeof window === "undefined") return;

    const { Terminal: Xterm } = await import("xterm");
    const { FitAddon } = await import("@xterm/addon-fit");
    const { WebLinksAddon } = await import("@xterm/addon-web-links");

    if (isBootingRef.current) return;
    isBootingRef.current = true;

    currentInstanceRef.current = instance;
    setCurrentInstance(instance);

    try {
      if (terminalRef.current) {
        terminalRef.current.dispose();
      }

      if (shellProcessRef.current) {
        shellProcessRef.current.kill();
        shellProcessRef.current = null;
      }

      if (inputWriterRef.current) {
        inputWriterRef.current.releaseLock();
        inputWriterRef.current = null;
      }

      // Init Xterm
      const xterm = new Xterm({
        cursorBlink: true,
        convertEol: true,
        scrollback: 5000,
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

      // Spawn jsh (WebContainer shell)
      const shellProcess = await instance.spawn("jsh", {
        terminal: { cols: xterm.cols, rows: xterm.rows },
      });
      shellProcessRef.current = shellProcess;

      // Pipe output from shell to xterm
      shellProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            xterm.write(data);
            outputListenersRef.current.forEach((listener) => {
              try {
                listener(data);
              } catch (e) {}
            });
          },
        }),
      );

      const input = shellProcess.input.getWriter();
      inputWriterRef.current = input;

      // Attach Input Listener (xterm -> PTY)
      xterm.onData((data) => {
        input.write(data);
      });

      xterm.onResize((dims) => {
        shellProcess.resize(dims);
      });

      // Listen for background server ports to show preview
      instance.on("server-ready", (port, url) => {
        console.log(`[WebContainer] Server Ready: ${url}`);
        setPreviewUrl(url);
        setActivePort(port);
      });

      console.log("[WebContainer] Terminal initialized in Browser!");
    } catch (e) {
      console.error("Failed to boot WebContainer terminal", e);
    } finally {
      isBootingRef.current = false;
    }
  }, []);

  const sendCommand = useCallback((command: string) => {
    try {
      if (inputWriterRef.current) {
        inputWriterRef.current.write(command + "\\n");
      }
    } catch (e) {
      console.error("Failed to send command:", e);
    }
  }, []);

  const interrupt = useCallback(() => {
    try {
      if (inputWriterRef.current) {
        inputWriterRef.current.write("\\x03");
      }
    } catch (e) {
      console.error("Failed to send interrupt:", e);
    }
  }, []);

  const restart = useCallback(async () => {
    if (currentInstanceRef.current) {
      const instance = currentInstanceRef.current;
      await boot(instance);
    }
  }, [boot]);

  const destroy = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
    }
    if (inputWriterRef.current) {
      inputWriterRef.current.releaseLock();
      inputWriterRef.current = null;
    }
    if (shellProcessRef.current) {
      shellProcessRef.current.kill();
      shellProcessRef.current = null;
    }

    setTerminal(null);
    setFitAddon(null);
    setPreviewUrl(null);
    isBootingRef.current = false;
    currentInstanceRef.current = null;
    setCurrentInstance(null);
  }, []);

  const syncSize = useCallback(() => {
    if (terminalRef.current && fitAddon && shellProcessRef.current) {
      try {
        terminalRef.current.reset();
        fitAddon.fit();
        const dims = {
          cols: terminalRef.current.cols,
          rows: terminalRef.current.rows,
        };
        shellProcessRef.current.resize(dims);
        terminalRef.current.refresh(0, terminalRef.current.rows - 1);
        requestAnimationFrame(() => terminalRef.current?.scrollToBottom());
      } catch (e) {}
    }
  }, [fitAddon]);

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
      syncSize,
      destroy,
      subscribeToOutput,
      instance: currentInstance,

      // Stubs
      isLocalTerminal: false,
      toggleTerminalMode: () => {},
      requestTypes: () => {},
      updateRootPath: () => {},
      findProjectOnHost: () => {},
      openProjectPath: () => {},
      bootLocal: async () => {},
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
      syncSize,
      destroy,
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
