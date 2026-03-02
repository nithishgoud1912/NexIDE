import { NextRequest } from "next/server";
import { shellSessions } from "@/lib/terminal-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "No ID" }), {
      status: 400,
    });
  }

  const ptyProcess = shellSessions.get(id);

  if (!ptyProcess) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
    });
  }

  // Create stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      if (!ptyProcess) return;

      const onData = (data: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ output: data })}\n\n`),
        );
      };

      ptyProcess.on("data", onData);

      req.signal.addEventListener("abort", () => {
        ptyProcess.removeListener("data", onData);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
