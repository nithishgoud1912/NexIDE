import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

// This prevents the route from being static, ensuring it runs at runtime
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Auth check — prevent unauthenticated RCE
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { command, cwd } = await req.json();

    if (!command || typeof command !== "string") {
      return NextResponse.json(
        { error: "Command is required and must be a string" },
        { status: 400 },
      );
    }

    // Block dangerous commands
    const blockedPatterns = [
      /rm\s+-rf\s+\//,
      /mkfs/,
      /dd\s+if=/,
      /:(){ :|:& };:/,
      />\s*\/dev\/sd/,
    ];
    if (blockedPatterns.some((p) => p.test(command))) {
      return NextResponse.json(
        { error: "Command blocked for safety" },
        { status: 403 },
      );
    }

    // Default to the current project directory if no CWD is provided
    const workingDir = cwd || process.cwd();

    console.log(`[Local Shell] Executing: ${command} in ${workingDir}`);

    const { spawn } = await import("child_process");

    const child = spawn(command, {
      cwd: workingDir,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";

    if (child.stdout) {
      child.stdout.on("data", (data: Buffer) => {
        output += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data: Buffer) => {
        errorOutput += data.toString();
      });
    }

    const exitCode = await new Promise((resolve) => {
      child.on("close", (code: number | null) => resolve(code));
      // Timeout after 30 seconds
      setTimeout(() => {
        child.kill();
        resolve(-1);
      }, 30000);
    });

    return NextResponse.json({
      output,
      error: errorOutput,
      exitCode,
    });
  } catch (error) {
    console.error("[Local Shell] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
