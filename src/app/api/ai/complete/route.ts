import { NextRequest } from "next/server";

export const runtime = "edge"; // Use edge runtime for faster streaming

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const { prefix, suffix, language, filePath } = await req.json();

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing GITHUB_TOKEN" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const prompt = `Task: Code completion (Filling in the middle)
File: ${filePath || "untitled"}
Language: ${language || "javascript"}

--- CODE PREFIX ---
${prefix.slice(-1000)}

--- CODE SUFFIX ---
${suffix ? suffix.slice(0, 1000) : ""}

--- INSTRUCTIONS ---
- Predict the missing code that logically connects the CODE PREFIX and CODE SUFFIX.
- Return ONLY the missing code tokens.
- DO NOT repeat any code from the CODE PREFIX or CODE SUFFIX.
- Stop immediately when you reach the CODE SUFFIX content.
- NO markdown, NO explanations, NO backticks.
- If the completion is already present in the suffix, return an empty string.

--- MISSING CODE ---`;

    const response = await fetch(
      "https://models.inference.ai.azure.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are an expert code completion engine. Return ONLY the bridge code that connects the prefix and suffix. No markdown, no backticks, no chat.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0,
          max_tokens: 64,
          top_p: 1,
          stream: true,
          stop: [
            "```",
            "\n\n\n",
            "--- CODE SUFFIX ---",
            suffix?.trim().split("\n")[0],
          ].filter(Boolean),
        }),
      },
    );

    if (!response.ok) {
      console.error("[AI Complete] API error:", response.status);
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
                // Ignore malformed JSON
              }
            }
          }
        } catch (err) {
          console.error("[AI Complete] Stream error:", err);
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          console.log(
            `[AI Complete] Request finished in ${Date.now() - startTime}ms`,
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
