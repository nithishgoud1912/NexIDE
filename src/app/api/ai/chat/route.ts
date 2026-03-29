import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

type Provider = "gemini" | "groq" | "copilot";

function buildSystemPrompt(context?: {
  filePath: string;
  language: string;
  code: string;
}) {
  return `You are NexIDE Assistant, a helpful AI coding assistant embedded in a web-based code editor called NexIDE.
You help users with:
- Answering coding questions
- Explaining code snippets
- Debugging errors
- Suggesting improvements
- Writing code snippets

When the user shares code context, use it to provide more relevant answers.
Always format code blocks with the appropriate language identifier.
Be concise but thorough. Use markdown formatting for readability.

${context ? `\n\nCurrent file context:\nFile: ${context.filePath}\nLanguage: ${context.language}\n\`\`\`${context.language}\n${context.code}\n\`\`\`` : ""}`;
}

// ─── Gemini Streaming ───
async function streamGemini(
  messages: { role: string; content: string }[],
  systemPrompt: string,
) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");

  const geminiMessages = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  const contents = [
    { role: "user", parts: [{ text: systemPrompt }] },
    {
      role: "model",
      parts: [
        {
          text: "Understood. I'm NexIDE Assistant, ready to help you with your coding questions. How can I assist you?",
        },
      ],
    },
    ...geminiMessages,
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          topP: 0.95,
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Gemini API error:", error);
    throw new Error("Gemini API request failed");
  }

  return createSSEStream(response, "gemini");
}

// ─── Groq Streaming (OpenAI-compatible) ───
async function streamGroq(
  messages: { role: string; content: string }[],
  systemPrompt: string,
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");

  const groqMessages = [{ role: "system", content: systemPrompt }, ...messages];

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: groqMessages,
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 0.95,
        stream: true,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      throw new Error(
        "Groq rate limit reached. Please wait a moment before sending another message.",
      );
    }
    console.error("Groq API error:", response.status, errorText);
    throw new Error(`Groq API request failed (${response.status})`);
  }

  return createSSEStream(response, "openai");
}

// ─── GitHub Copilot / GitHub Models Streaming (OpenAI-compatible) ───
async function streamCopilot(
  messages: { role: string; content: string }[],
  systemPrompt: string,
) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Missing GITHUB_TOKEN");

  const copilotMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const response = await fetch(
    "https://models.inference.ai.azure.com/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: copilotMessages,
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 0.95,
        stream: true,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      throw new Error(
        "GitHub Models rate limit reached. You've used your free quota. Please try Gemini or Groq instead, or wait before retrying.",
      );
    }
    if (response.status === 401) {
      throw new Error(
        "GitHub token is invalid or expired. Please check your GITHUB_TOKEN environment variable.",
      );
    }
    console.error("Copilot API error:", response.status, errorText);
    throw new Error(`Copilot API request failed (${response.status})`);
  }

  return createSSEStream(response, "openai");
}

// ─── Unified SSE stream transformer ───
function createSSEStream(response: Response, format: "gemini" | "openai") {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                let text = "";

                if (format === "gemini") {
                  text =
                    parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
                } else {
                  // OpenAI / Groq / Copilot format
                  text = parsed?.choices?.[0]?.delta?.content || "";
                }

                if (text) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
                  );
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      } catch (e) {
        console.error("Stream error:", e);
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return stream;
}

// ─── Main handler ───
export async function POST(req: NextRequest) {
  try {
    // Auth check — prevent unauthenticated API abuse
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messages, context, provider = "gemini" } = await req.json();

    const systemPrompt = buildSystemPrompt(context);

    let stream: ReadableStream;

    switch (provider as Provider) {
      case "groq":
        stream = await streamGroq(messages, systemPrompt);
        break;
      case "copilot":
        stream = await streamCopilot(messages, systemPrompt);
        break;
      case "gemini":
      default:
        stream = await streamGemini(messages, systemPrompt);
        break;
    }

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
