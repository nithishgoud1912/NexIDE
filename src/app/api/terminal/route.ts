import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node-pty";
import os from "os";
import { shellSessions } from "@/lib/terminal-store";
import { auth } from "@/auth";

// This prevents the route from being static
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "Terminal API is reachable" });
}

export async function POST(req: NextRequest) {
  try {
    // Auth check — prevent unauthenticated terminal access
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action, id, data, cols, rows, cwd } = await req.json();

    if (!action || typeof action !== "string") {
      return NextResponse.json(
        { error: "Action is required" },
        { status: 400 },
      );
    }

    if (action === "create") {
      const shell = os.platform() === "win32" ? "powershell.exe" : "bash";

      // Filter sensitive env vars before passing to PTY
      const safeEnv = { ...process.env };
      const sensitiveKeys = [
        "AUTH_SECRET",
        "AUTH_GITHUB_SECRET",
        "AUTH_GITHUB_ID",
        "DATABASE_URL",
        "GITHUB_TOKEN",
        "GOOGLE_GENERATIVE_AI_API_KEY",
        "GROQ_API_KEY",
      ];
      sensitiveKeys.forEach((key) => delete safeEnv[key]);

      const ptyProcess = spawn(shell, [], {
        name: "xterm-color",
        cols: cols || 80,
        rows: rows || 24,
        cwd: cwd || process.cwd(),
        env: safeEnv as Record<string, string>,
      });

      const sessionId = id || Math.random().toString(36).substring(7);
      shellSessions.set(sessionId, ptyProcess);

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
      return NextResponse.json(
        { error: "Read not implemented via POST. Use WebSocket/SSE." },
        { status: 501 },
      );
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[Local Terminal] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
