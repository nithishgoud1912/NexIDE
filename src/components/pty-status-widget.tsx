"use client";

import { useEffect, useState } from "react";
import { Terminal, Activity } from "lucide-react";

export function PtyStatusWidget() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [ping, setPing] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const checkStatus = async () => {
      const ptyUrl = process.env.NEXT_PUBLIC_PTY_URL || "http://localhost:3001";
      const start = Date.now();
      try {
        const res = await fetch(`${ptyUrl}/socket.io/?EIO=4&transport=polling`);
        if (mounted) {
          setStatus(res.ok ? "online" : "offline");
          if (res.ok) setPing(Date.now() - start);
        }
      } catch (e) {
        if (mounted) setStatus("offline");
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="bg-secondary border border-border p-6 rounded-2xl transition-all duration-300 hover:border-border/80">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm uppercase tracking-widest text-muted-foreground">
          Local Bridge Status
        </h3>
        <Terminal className="w-4 h-4 text-muted-foreground" />
      </div>
      
      <div className="flex items-center gap-4 text-muted-foreground">
        <div className={`w-2.5 h-2.5 rounded-full ${status === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : status === 'checking' ? 'bg-yellow-500' : 'bg-red-500'}`} />
        <div className="flex flex-col">
          <span className={`text-sm font-medium ${status === 'online' ? 'text-green-400' : status === 'checking' ? 'text-yellow-400' : 'text-red-400'}`}>
            {status === "online" ? "Connected & Active" : status === "checking" ? "Connecting..." : "Offline (Start Server)"}
          </span>
          {status === "online" && ping !== null && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Activity className="w-3 h-3" /> {ping}ms ping
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
