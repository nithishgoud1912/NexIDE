"use client";

import { useShell } from "@/context/shell-context";
import { WebContainer } from "@webcontainer/api";
import { RotateCcw, ExternalLink, Globe } from "lucide-react";
import { useState, useEffect, useRef, startTransition } from "react";

interface PreviewProps {
  instance: WebContainer | null;
}

export default function Preview({ instance }: PreviewProps) {
  const { previewUrl: globalUrl, setPreviewUrl } = useShell();
  const [key, setKey] = useState(0);
  const [internalUrl, setInternalUrl] = useState<string>(globalUrl || "");
  const [isLoading, setIsLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    startTransition(() => {
      if (globalUrl) {
        setInternalUrl(globalUrl);
        setIsLoading(true);
      } else {
        setInternalUrl("");
      }
    });
  }, [globalUrl]);

  useEffect(() => {
    if (internalUrl) {
      startTransition(() => setIsLoading(true));
    }
  }, []);

  const handleRefresh = () => {
    setKey((prev) => prev + 1);
    setIsLoading(true);
  };

  const handleUrlChange = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    let url = formData.get("url") as string;
    if (url) {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "http://" + url;
      }
      setInternalUrl(url);
      setKey((prev) => prev + 1);
      setIsLoading(true);
    }
  };

  const showIdleState = !internalUrl && !globalUrl;
  const isLive = !isLoading && !showIdleState;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Address Bar */}
      <div className="h-9 bg-[#f0f0f0] border-b border-zinc-300 flex items-center px-2 gap-2">
        <div className="flex items-center gap-1">
          <div
            className={`w-2 h-2 rounded-full mr-1 ${isLive ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-zinc-300"}`}
            title={isLive ? "Server Live" : "Server Offline"}
          />
          <button
            onClick={handleRefresh}
            className="p-1 hover:bg-zinc-200 rounded transition-colors text-zinc-600"
          >
            <RotateCcw
              className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        <form onSubmit={handleUrlChange} className="flex-1">
          <div className="relative group">
            <div className="absolute left-2 top-1.5 text-zinc-400">
              <Globe className="w-3 h-3" />
            </div>
            <input
              name="url"
              type="text"
              value={internalUrl}
              onChange={(e) => setInternalUrl(e.target.value)}
              placeholder="http://localhost:3000"
              className="w-full h-6 bg-white border border-zinc-200 rounded-md pl-6 pr-2 text-[10px] text-zinc-600 focus:outline-none focus:border-blue-400 transition-colors shadow-sm"
            />
          </div>
        </form>

        <a
          href={internalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 hover:bg-zinc-200 rounded transition-colors text-zinc-600"
          title="Open in New Tab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="flex-1 relative bg-white overflow-hidden">
        {showIdleState ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center space-y-4 bg-[#0a0a0a]">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center text-zinc-700 animate-pulse">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-400">
                Preview Idle
              </h3>
              <p className="text-[11px] text-zinc-600 mt-1 max-w-[200px]">
                Click &quot;Run&quot; or enter a URL above to preview your
                application.
              </p>
            </div>
          </div>
        ) : (
          <>
            {isLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0d0d0d] text-zinc-400 space-y-3">
                <RotateCcw className="w-6 h-6 animate-spin text-blue-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  Initializing Preview...
                </span>
                <span className="text-[9px] text-zinc-600 font-mono truncate max-w-[80%]">
                  {internalUrl}
                </span>
              </div>
            )}
            <iframe
              key={`${internalUrl}-${key}`}
              ref={iframeRef}
              src={internalUrl || undefined}
              className="w-full h-full border-none bg-white"
              title="Preview"
              onLoad={() => {
                console.log("[Preview] Iframe loaded:", internalUrl);
                setIsLoading(false);
              }}
              allow="cross-origin-isolated; autoplay; clipboard-read; clipboard-write; camera; microphone; geolocation"
              {...({ credentialless: "true" } as any)}
            />
          </>
        )}
      </div>
    </div>
  );
}
