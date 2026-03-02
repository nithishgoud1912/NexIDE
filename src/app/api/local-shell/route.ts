import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

// This prevents the route from being static, ensuring it runs at runtime
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { command, cwd } = await req.json();

    if (!command) {
      return NextResponse.json(
        { error: "Command is required" },
        { status: 400 },
      );
    }

    // Default to the current project directory if no CWD is provided
    // In dev mode, process.cwd() is usually the project root
    const workingDir = cwd || process.cwd();

    console.log(`[Local Shell] Executing: ${command} in ${workingDir}`);

    // Spawn the command
    // "shell: true" allows us to chain commands like 'npm install && clear'
    const child = spawn(command, {
      cwd: workingDir,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";

    // Collect stdout
    if (child.stdout) {
      child.stdout.on("data", (data) => {
        output += data.toString();
      });
    }

    // Collect stderr
    if (child.stderr) {
      child.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });
    }

    // Wait for process to exit
    const exitCode = await new Promise((resolve) => {
      child.on("close", (code) => resolve(code));
    });

    return NextResponse.json({
      output,
      error: errorOutput,
      exitCode,
    });
  } catch (error) {
    console.error("[Local Shell] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: String(error) },
      { status: 500 },
    );
  }
}
