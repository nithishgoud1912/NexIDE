import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node-pty";
import os from "os";
import { shellSessions } from "@/lib/terminal-store";

// This prevents the route from being static
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "Terminal API is reachable" });
}

export async function POST(req: NextRequest) {
  try {
    const { action, id, data, cols, rows, cwd } = await req.json();

    if (action === "create") {
      const shell = os.platform() === "win32" ? "powershell.exe" : "bash";

      const ptyProcess = spawn(shell, [], {
        name: "xterm-color",
        cols: cols || 80,
        rows: rows || 24,
        cwd: cwd || process.cwd(),
        env: process.env,
      });

      const sessionId = id || Math.random().toString(36).substring(7);
      shellSessions.set(sessionId, ptyProcess);

      //   console.log(
      //     `[Local Terminal] Created session ${sessionId} in ${ptyProcess.cwd}`,
      //   );

      return NextResponse.json({
        sessionId,
        pid: ptyProcess.pid,
        status: "created",
      });
    }

    if (action === "resize") {
      const ptyProcess = shellSessions.get(id);
      if (ptyProcess) {
        ptyProcess.resize(cols, rows);
        return NextResponse.json({ status: "resized" });
      }
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (action === "write") {
      const ptyProcess = shellSessions.get(id);
      if (ptyProcess) {
        ptyProcess.write(data);
        return NextResponse.json({ status: "written" });
      }
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (action === "read") {
      // For polling basic output (MVP)
      // Note: Real streaming should use WebSockets, which Next.js App Router
      // doesn't support natively in API routes yet without a custom server.
      // We'll use a simple buffer queue or similar for MVP.

      // Actually, for "Remote Control", a better pattern without custom server
      // is to let the client poll frequently, or use Server-Sent Events (SSE).

      // Let's implement a quick polling buffer for now.
      // But wait... ptyProcess.on('data') is async.
      // We need to buffer data for the client to fetch.

      return NextResponse.json(
        { error: "Read not implemented via POST. Use WebSocket/SSE." },
        { status: 501 },
      );
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[Local Terminal] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: String(error) },
      { status: 500 },
    );
  }
}
