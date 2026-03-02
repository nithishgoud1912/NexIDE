"use client";

import { useEffect, useState } from "react";
import { WebContainer } from "@webcontainer/api";
import { getWebContainerInstance } from "@/lib/webcontainer";

export type WebContainerState = "booting" | "ready" | "error";

export function useWebContainer() {
  const [instance, setInstance] = useState<WebContainer | null>(null);
  const [state, setState] = useState<WebContainerState>("booting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const wc = await getWebContainerInstance();
        if (isMounted) {
          setInstance(wc);
          setState("ready");
        }
      } catch (err: unknown) {
        console.error("Failed to boot WebContainer:", err);
        if (isMounted) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to boot WebContainer. Check COOP/COEP headers.";
          setError(message);
          setState("error");
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  return { instance, state, error };
}
