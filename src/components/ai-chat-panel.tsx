"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  X,
  Sparkles,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  Bot,
  User,
  FileCode,
  Zap,
  Github,
} from "lucide-react";
import {
  useAIChatStore,
  type AIProvider,
  type ChatMessage,
} from "@/store/use-ai-chat-store";

import { useShallow } from "zustand/react/shallow";

interface ProviderInfo {
  id: AIProvider;
  name: string;
  model: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: "gemini",
    name: "Gemini",
    model: "2.0 Flash",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    icon: <Sparkles className="w-3.5 h-3.5" />,
  },
  {
    id: "groq",
    name: "Groq",
    model: "Llama 3.3 70B",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
    icon: <Zap className="w-3.5 h-3.5" />,
  },
  {
    id: "copilot",
    name: "Copilot",
    model: "GPT-4o",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
    icon: <Github className="w-3.5 h-3.5" />,
  },
];

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  activeFilePath?: string;
  activeFileContent?: string;
  activeFileLanguage?: string;
}

// --- Code Block React Component ---
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-lang">{language}</span>
        <button
          className={`copy-code-btn ${copied ? "copied" : ""}`}
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span className="copy-label">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="copy-label">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="code-block">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// --- Parse markdown into React elements ---
function parseInlineMarkdown(text: string): string {
  let html = text;
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');
  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(
    /(<li class="md-li">.*<\/li>\n?)+/g,
    '<ul class="md-ul">$&</ul>',
  );
  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-oli">$1</li>');
  html = html.replace(
    /(<li class="md-oli">.*<\/li>\n?)+/g,
    '<ol class="md-ol">$&</ol>',
  );
  // Line breaks -> paragraphs
  html = html
    .split("\n\n")
    .map((block) => {
      if (block.startsWith("<") || block.trim() === "") return block;
      return `<p class="md-p">${block.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");
  return html;
}

// Splits markdown content into text segments and code blocks
function renderMarkdownContent(content: string): React.ReactNode[] {
  if (!content) {
    return [
      <span key="typing" className="typing-indicator">
        <span></span>
        <span></span>
        <span></span>
      </span>,
    ];
  }

  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  let partIndex = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Text before code block
    const textBefore = content.slice(lastIndex, match.index);
    if (textBefore.trim()) {
      parts.push(
        <div
          key={`text-${partIndex++}`}
          className="ai-chat-content"
          dangerouslySetInnerHTML={{ __html: parseInlineMarkdown(textBefore) }}
        />,
      );
    }

    // Code block as React component
    const lang = match[1] || "code";
    const code = match[2].trim();
    parts.push(
      <CodeBlock key={`code-${partIndex++}`} language={lang} code={code} />,
    );

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last code block
  const remaining = content.slice(lastIndex);
  if (remaining.trim()) {
    parts.push(
      <div
        key={`text-${partIndex++}`}
        className="ai-chat-content"
        dangerouslySetInnerHTML={{ __html: parseInlineMarkdown(remaining) }}
      />,
    );
  }

  return parts;
}

export function AIChatPanel({
  isOpen,
  onClose,
  projectId,
  activeFilePath,
  activeFileContent,
  activeFileLanguage,
}: AIChatPanelProps) {
  // Zustand store — actions only (stable references)
  const addMessage = useAIChatStore((s) => s.addMessage);
  const updateMessage = useAIChatStore((s) => s.updateMessage);
  const clearChat = useAIChatStore((s) => s.clearChat);
  const setProvider = useAIChatStore((s) => s.setProvider);

  // Data selectors — useShallow prevents infinite loops from new array references
  const messages = useAIChatStore(
    useShallow((s) => s.chats[projectId]?.messages ?? []),
  );
  const selectedProvider = useAIChatStore(
    (s) => s.chats[projectId]?.provider ?? s.defaultProvider,
  );

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentProvider = PROVIDERS.find((p) => p.id === selectedProvider)!;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
      provider: selectedProvider,
    };

    addMessage(projectId, userMessage);
    setInput("");
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now() + 1,
      provider: selectedProvider,
    };
    addMessage(projectId, assistantMessage);

    try {
      abortControllerRef.current = new AbortController();

      const allMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: input.trim() },
      ];

      const context =
        includeContext && activeFilePath && activeFileContent
          ? {
              filePath: activeFilePath,
              language: activeFileLanguage || "javascript",
              code: activeFileContent.slice(0, 3000),
            }
          : undefined;

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          context,
          provider: selectedProvider,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error("Failed to get response");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

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
              if (parsed.text) {
                fullContent += parsed.text;
                updateMessage(projectId, assistantMessageId, fullContent);
              }
            } catch {
              // Skip
            }
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("Chat error:", error);
      updateMessage(
        projectId,
        assistantMessageId,
        "Sorry, I encountered an error. Please try again.",
      );
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [
    input,
    isLoading,
    messages,
    includeContext,
    activeFilePath,
    activeFileContent,
    activeFileLanguage,
    selectedProvider,
    projectId,
    addMessage,
    updateMessage,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  };

  const handleClear = () => {
    clearChat(projectId);
  };

  const handleProviderChange = (provider: AIProvider) => {
    setProvider(projectId, provider);
    setIsDropdownOpen(false);
  };

  const copyMessageContent = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-[#0c0c0e] border-l border-white/5">
      {/* Header */}
      <div className="h-10 border-b border-white/5 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={`w-5 h-5 rounded-md ${currentProvider.bgColor} ${currentProvider.borderColor} border flex items-center justify-center`}
          >
            <span className={currentProvider.color}>
              {currentProvider.icon}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-zinc-200 uppercase tracking-wider">
            AI Assistant
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClear}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-md transition-colors"
            title="Clear Chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-md transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Provider Selector */}
      <div className="px-3 py-2 border-b border-white/5 shrink-0">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition-all text-xs ${
              isDropdownOpen
                ? `${currentProvider.bgColor} ${currentProvider.borderColor} ${currentProvider.color}`
                : "bg-white/[0.02] border-white/5 text-zinc-400 hover:bg-white/[0.04] hover:border-white/10"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={currentProvider.color}>
                {currentProvider.icon}
              </span>
              <span className="font-semibold">{currentProvider.name}</span>
              <span className="text-zinc-600 text-[10px] font-normal">
                {currentProvider.model}
              </span>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${
                isDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#141416] border border-white/10 rounded-lg overflow-hidden shadow-xl shadow-black/40 z-50">
              {PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => handleProviderChange(provider.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-all ${
                    selectedProvider === provider.id
                      ? `${provider.bgColor} ${provider.color}`
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-md ${provider.bgColor} border ${provider.borderColor} flex items-center justify-center`}
                  >
                    <span className={provider.color}>{provider.icon}</span>
                  </span>
                  <div className="flex flex-col items-start">
                    <span className="font-semibold">{provider.name}</span>
                    <span className="text-[9px] text-zinc-600">
                      {provider.model}
                    </span>
                  </div>
                  {selectedProvider === provider.id && (
                    <Check className="w-3.5 h-3.5 ml-auto" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-6 py-8">
            <div
              className={`w-16 h-16 rounded-2xl ${currentProvider.bgColor} border ${currentProvider.borderColor} flex items-center justify-center mb-5`}
            >
              <Bot className={`w-8 h-8 ${currentProvider.color} opacity-80`} />
            </div>
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">
              NexIDE Assistant
            </h3>
            <p className="text-xs text-zinc-500 text-center leading-relaxed mb-1">
              Ask me anything about your code.
            </p>
            <p
              className={`text-[10px] ${currentProvider.color} mb-6 font-medium`}
            >
              Using {currentProvider.name} • {currentProvider.model}
            </p>
            <div className="w-full space-y-2">
              {[
                "Explain this code",
                "How do I fix this error?",
                "Refactor for better performance",
                "Add TypeScript types",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-400 bg-white/2 hover:bg-white/5 border border-white/5 rounded-lg transition-all hover:border-violet-500/20 hover:text-zinc-300 group"
                >
                  <span className="opacity-50 group-hover:opacity-100 transition-opacity mr-1.5">
                    →
                  </span>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {messages.map((msg) => {
              // Find which provider icon to show for each assistant message
              const msgProvider =
                PROVIDERS.find((p) => p.id === msg.provider) || currentProvider;
              return (
                <div key={msg.id} className="flex gap-2.5">
                  <div
                    className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5 ${
                      msg.role === "user"
                        ? "bg-blue-500/10 border border-blue-500/20"
                        : `${msgProvider.bgColor} border ${msgProvider.borderColor}`
                    }`}
                  >
                    {msg.role === "user" ? (
                      <User className="w-3.5 h-3.5 text-blue-400" />
                    ) : (
                      <span className={msgProvider.color}>
                        {msgProvider.icon}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                        {msg.role === "user" ? "You" : msgProvider.name}
                      </span>
                      {msg.role === "assistant" && msg.content && (
                        <button
                          onClick={() =>
                            copyMessageContent(msg.content, msg.id)
                          }
                          className="p-0.5 text-zinc-600 hover:text-zinc-300 transition-colors"
                          title="Copy response"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                    {msg.role === "assistant" ? (
                      <div className="text-[13px] text-zinc-300 leading-relaxed">
                        {renderMarkdownContent(msg.content)}
                      </div>
                    ) : (
                      <p className="text-[13px] text-zinc-200 leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Context indicator */}
      {activeFilePath && (
        <div
          className={`mx-3 mb-1 flex items-center gap-1.5 text-[10px] cursor-pointer select-none transition-all rounded-md px-2 py-1 ${
            includeContext
              ? "text-violet-400 bg-violet-500/5 border border-violet-500/10"
              : "text-zinc-600 hover:text-zinc-400 bg-white/2 border border-white/5"
          }`}
          onClick={() => setIncludeContext(!includeContext)}
          title={
            includeContext
              ? "Click to exclude file context"
              : "Click to include file context"
          }
        >
          <FileCode className="w-3 h-3" />
          <span className="truncate font-medium">
            {includeContext ? "Including: " : "Excluded: "}
            {activeFilePath.split("/").pop()}
          </span>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-white/5 p-3 shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your code..."
              rows={1}
              className="w-full bg-white/3 border border-white/6 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-violet-500/30 focus:ring-1 focus:ring-violet-500/10 transition-all"
              style={{
                minHeight: "38px",
                maxHeight: "120px",
                height: `${Math.min(38 + (input.split("\n").length - 1) * 18, 120)}px`,
              }}
            />
          </div>
          {isLoading ? (
            <button
              onClick={handleStop}
              className="shrink-0 w-9 h-9 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 flex items-center justify-center transition-all text-red-400"
              title="Stop generating"
            >
              <div className="w-3 h-3 rounded-sm bg-red-400" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0 w-9 h-9 rounded-xl bg-linear-to-br from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-violet-600/10 active:scale-95"
              title="Send message"
            >
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          )}
        </div>
        <p className="text-[9px] text-zinc-600 mt-1.5 text-center">
          <span className={currentProvider.color}>{currentProvider.name}</span>
          {" • "}
          {currentProvider.model}
          {" • "}
          Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
