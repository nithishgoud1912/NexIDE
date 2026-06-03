import { NextRequest } from "next/server";
import { auth } from "@/auth";

// Node.js runtime — edge runtime can silently drop env vars on some hosts
export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    // Auth check — prevent unauthenticated API abuse
    const session = await auth();
    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { prefix, suffix, language, filePath } = await req.json();

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      console.error("[AI Complete] Missing GROQ_API_KEY");
      return new Response(JSON.stringify({ error: "Missing GROQ_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Chat-style prompt — FIM tokens (<fim_prefix> etc.) only work on base/FIM
    // models, not chat models. Using them here makes llama output them literally.
    const recentPrefix = prefix.slice(-2000);
    const recentSuffix = suffix ? suffix.slice(0, 1400) : "";

    const userMessage =
      `Language: ${language || "javascript"}\n` +
      `File: ${filePath || "untitled"}\n\n` +
      `[CODE BEFORE CURSOR - insert your completion here]\n${recentPrefix}` +
      (recentSuffix
        ? `\n\n[CODE AFTER CURSOR - ⚠️ DO NOT OUTPUT ANY OF THIS, IT ALREADY EXISTS IN THE FILE]\n${recentSuffix}\n`
        : "\n") +
      `\nYour task: output ONLY the new code that goes immediately after [CODE BEFORE CURSOR]. ` +
      `Stop before any line that appears in [CODE AFTER CURSOR]. ` +
      `Preserve indentation. No markdown, no explanations.`;

    // Use the first non-empty suffix line as a hard stop so the model halts
    // before repeating any code that already exists below the cursor.
    const firstSuffixLine = (suffix || "")
      .split("\n")
      .map((l: string) => l.trim())
      .find((l: string) => l.length > 3) || "";

    // Groq hard-limits stop sequences to 4 items max
    const stopSeqs: string[] = ["```", "[CODE BEFORE CURSOR", "[CODE AFTER CURSOR"];
    if (firstSuffixLine) stopSeqs.push(firstSuffixLine);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        // 70b is dramatically better than 8b for code quality.
        // Groq runs it at ~280 tokens/s so TTFT stays under 300ms.
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are an expert inline code completion engine embedded in a code editor. " +
              "The user will show you code with a clearly marked cursor position. " +
              "Your job is to predict what comes immediately after the cursor.\n\n" +
              "Rules:\n" +
              "- Return ONLY the raw code to insert (no markdown, no backticks, no explanations)\n" +
              "- Match the existing indentation and coding style exactly\n" +
              "- The [CODE AFTER CURSOR] section ALREADY EXISTS — never repeat or re-generate it\n" +
              "- Stop generating the moment you would output anything from [CODE AFTER CURSOR]\n" +
              "- Keep completions focused: 1–15 lines is ideal\n" +
              "- If nothing new is needed, return an empty string",
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0,
        max_tokens: 120,
        top_p: 1,
        stream: true,
        stop: stopSeqs,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[AI Complete] Groq API error:", response.status, errText);
      return new Response(JSON.stringify({ completion: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const data = trimmed.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const text = parsed?.choices?.[0]?.delta?.content || "";
                if (text) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
                  );
                }
              } catch {
                // Ignore malformed JSON chunks
              }
            }
          }
        } catch (err) {
          console.error("[AI Complete] Stream error:", err);
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          console.log(
            `[AI Complete] Finished in ${Date.now() - startTime}ms`,
          );
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Completion API error:", error);
    return new Response(JSON.stringify({ completion: "" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
