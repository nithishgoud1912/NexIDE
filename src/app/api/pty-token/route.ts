import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tokenPath = path.join(process.cwd(), ".pty-token");
    if (!fs.existsSync(tokenPath)) {
      return NextResponse.json({ error: "PTY token not found. Is the terminal server running?" }, { status: 503 });
    }

    const token = fs.readFileSync(tokenPath, "utf8");
    return NextResponse.json({ token });
  } catch (error) {
    console.error("Failed to read PTY token:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
