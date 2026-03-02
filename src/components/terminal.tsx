"use client";

import { useEffect, useRef } from "react";
import "xterm/css/xterm.css";
import { WebContainer } from "@webcontainer/api";
import { useShell } from "@/context/shell-context";

interface TerminalProps {
  instance: WebContainer;
}

export default function Terminal({ instance }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const { terminal, fitAddon, boot, bootLocal, isLocalTerminal } = useShell();

  useEffect(() => {
    if (isLocalTerminal) {
      if (!terminal) {
        bootLocal();
      }
    } else if (instance) {
      boot(instance);
    }
  }, [instance, boot, bootLocal, isLocalTerminal, terminal]);

  useEffect(() => {
    if (!terminalRef.current || !terminal || !fitAddon) return;

    // Delay initial open and fit to ensure container is ready and fonts are loaded
    const timeout = setTimeout(() => {
      if (
        terminal &&
        terminalRef.current &&
        terminal.element !== terminalRef.current
      ) {
        terminal.open(terminalRef.current);
        terminal.focus();
        try {
          fitAddon.fit();
        } catch (e) {
          console.warn("Failed to fit terminal on init:", e);
        }
      }
    }, 100);

    let resizeTimeout: NodeJS.Timeout;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        try {
          if (terminal && terminal.element && fitAddon) {
            fitAddon.fit();
            // Small delay to ensure the grid has updated before scrolling
            requestAnimationFrame(() => {
              terminal.scrollToBottom();
            });
          }
        } catch (e) {
          // console.warn("Failed to fit terminal on resize:", e);
        }
      }, 100); // Debounce for 100ms
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      clearTimeout(timeout);
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
    };
  }, [terminal, fitAddon]);

  const handleContainerClick = () => {
    if (terminal) {
      terminal.focus();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    // If there is a selection, copy it on right click (common terminal behavior)
    if (terminal && terminal.hasSelection()) {
      const text = terminal.getSelection();
      if (text) {
        navigator.clipboard.writeText(text);
      }
    }
  };

  return (
    <div
      ref={terminalRef}
      className="h-full w-full bg-background overflow-hidden p-3 terminal-container"
      onClick={handleContainerClick}
      onContextMenu={handleContextMenu}
    />
  );
}
