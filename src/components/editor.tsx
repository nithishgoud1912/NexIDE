"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import Editor, { Monaco, BeforeMount } from "@monaco-editor/react";
import { useIDEStore } from "@/store/use-ide-store";
import { emmetHTML, emmetJSX, emmetCSS } from "emmet-monaco-es";
import { registerThemes } from "@/lib/themes";

// --- AI Inline Completion Logic ---
let inlineProviderDisposable: { dispose: () => void } | null = null;
let completionDebounceTimer: NodeJS.Timeout | null = null;
let activeAbortController: AbortController | null = null;
let isRequestInFlight = false;

// Simple cache to avoid re-fetching for the same position
const completionCache = new Map<string, string>();
const MAX_CACHE_SIZE = 20;

function getCacheKey(prefix: string, language: string): string {
  return `${language}:${prefix.slice(-200)}`;
}

async function fetchAICompletion(
  prefix: string,
  suffix: string,
  language: string,
  filePath: string,
  signal: AbortSignal,
): Promise<string> {
  try {
    const response = await fetch("/api/ai/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, suffix, language, filePath }),
      signal,
    });

    if (!response.ok) return "";

    const reader = response.body?.getReader();
    if (!reader) return "";

    const decoder = new TextDecoder();
    let fullText = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              fullText += parsed.text || "";
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullText.trim();
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return "";
    console.error("fetchAICompletion error:", e);
    return "";
  }
}

function registerInlineCompletionProvider(monaco: Monaco) {
  if (inlineProviderDisposable) {
    inlineProviderDisposable.dispose();
    inlineProviderDisposable = null;
  }

  const allLanguages = monaco.languages
    .getLanguages()
    .map((l: { id: string }) => l.id);

  inlineProviderDisposable = monaco.languages.registerInlineCompletionsProvider(
    allLanguages,
    {
      provideInlineCompletions: async (
        model: any,
        position: any,
        _context: any,
        token: any,
      ) => {
        if (activeAbortController) {
          activeAbortController.abort();
          activeAbortController = null;
        }

        if (isRequestInFlight) {
          return { items: [] };
        }

        const lineContent = model.getLineContent(position.lineNumber);
        const beforeCursor = lineContent.substring(0, position.column - 1);
        if (beforeCursor.trim().length < 3) {
          return { items: [] };
        }

        const trimmed = beforeCursor.trim();
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("/*") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("#")
        ) {
          return { items: [] };
        }

        await new Promise<void>((resolve) => {
          if (completionDebounceTimer) clearTimeout(completionDebounceTimer);
          completionDebounceTimer = setTimeout(resolve, 250);
        });

        if (token.isCancellationRequested) {
          return { items: [] };
        }

        const startLine = Math.max(1, position.lineNumber - 100);
        const prefix = model.getValueInRange({
          startLineNumber: startLine,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const language = model.getLanguageId();
        const cacheKey = getCacheKey(prefix, language);
        if (completionCache.has(cacheKey)) {
          const cached = completionCache.get(cacheKey)!;
          if (cached) {
            return {
              items: [
                {
                  insertText: cached,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                  },
                },
              ],
            };
          }
          return { items: [] };
        }

        const totalLines = model.getLineCount();
        const endLine = Math.min(totalLines, position.lineNumber + 100);
        const suffix = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: endLine,
          endColumn: model.getLineMaxColumn(endLine),
        });

        const filePath = model.uri.path || "";
        const abortController = new AbortController();
        activeAbortController = abortController;
        token.onCancellationRequested(() => abortController.abort());

        isRequestInFlight = true;

        try {
          let suggestion = await fetchAICompletion(
            prefix,
            suffix,
            language,
            filePath,
            abortController.signal,
          );

          if (suggestion && suffix.trim()) {
            const trimmedSuffix = suffix.trim();
            for (let i = Math.min(suggestion.length, 50); i > 0; i--) {
              const suggestionEnd = suggestion.slice(-i);
              if (trimmedSuffix.startsWith(suggestionEnd)) {
                suggestion = suggestion.slice(0, -i);
                break;
              }
            }
          }

          if (completionCache.size >= MAX_CACHE_SIZE) {
            const firstKey = completionCache.keys().next().value;
            if (firstKey) completionCache.delete(firstKey);
          }
          completionCache.set(cacheKey, suggestion);

          if (!suggestion || token.isCancellationRequested) {
            return { items: [] };
          }

          return {
            items: [
              {
                insertText: suggestion,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              },
            ],
          };
        } finally {
          isRequestInFlight = false;
          activeAbortController = null;
        }
      },
      freeInlineCompletions: () => {},
    },
  );
}

interface EditorProps {
  initialValue: string | Uint8Array;
  language?: string;
  theme?: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
  path?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Called when Monaco navigates to a different file (e.g. Go to Definition) */
  onOpenFile?: (path: string, content: string) => void;
}

let emmetRegistered = false;

function registerAllEmmet(monaco: Monaco) {
  if (emmetRegistered) return;
  try {
    emmetHTML(monaco, ["html"]);
    emmetJSX(monaco, ["javascript", "typescript"]);
    emmetCSS(monaco, ["css", "scss", "less"]);
    emmetRegistered = true;
  } catch {
    // Ignore emmet registration errors
  }
}

function getLanguageFromPath(name?: string): string {
  if (!name) return "javascript";
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return "html";
    case "css":
      return "css";
    case "scss":
      return "scss";
    case "less":
      return "less";
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "mjs":
    case "cjs":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
    case "mdx":
      return "markdown";
    case "py":
      return "python";
    case "yaml":
    case "yml":
      return "yaml";
    case "xml":
    case "svg":
      return "xml";
    case "sh":
    case "bash":
      return "shell";
    case "sql":
      return "sql";
    case "graphql":
    case "gql":
      return "graphql";
    case "dockerfile":
      return "dockerfile";
    case "vue":
      return "vue";
    default:
      if (name.toLowerCase() === "dockerfile") return "dockerfile";
      if (name.toLowerCase().includes(".gitignore")) return "plaintext";
      if (name.toLowerCase().includes(".env")) return "plaintext";
      return "plaintext";
  }
}

export default function CodeEditor({
  initialValue,
  theme: themeProp = "vs-dark",
  onSave,
  onChange,
  path,
  onFocus,
  onBlur,
  onOpenFile,
}: EditorProps) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>("");

  const {
    fontSize,
    theme: storeTheme,
    showLineNumbers,
    wordWrap,
    emmetEnabled,
  } = useIDEStore();

  const themeToUse = storeTheme || themeProp;

  const displayValue =
    typeof initialValue === "string"
      ? initialValue
      : new TextDecoder().decode(initialValue);

  useEffect(() => {
    lastSavedContentRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const model = editor.getModel();
    if (!model) return;
    const currentValue = editor.getValue();
    if (displayValue !== currentValue && !isTypingRef.current) {
      const position = editor.getPosition();
      const scrollTop = editor.getScrollTop();
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: displayValue }],
        () => null,
      );
      if (position) {
        requestAnimationFrame(() => {
          editor.setPosition(position);
          editor.setScrollTop(scrollTop);
        });
      }
      lastSavedContentRef.current = displayValue;
    }
  }, [displayValue]);

  const handleBeforeMount: BeforeMount = useCallback(
    (monaco: Monaco) => {
      if (emmetEnabled) registerAllEmmet(monaco);
      registerThemes(monaco);
    },
    [emmetEnabled],
  );

  function handleEditorDidMount(editor: any, monaco: Monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    if (typeof window !== "undefined") {
      (window as any).monaco = monaco;
    }

    if (emmetEnabled) registerAllEmmet(monaco);
    registerInlineCompletionProvider(monaco);

    const model = editor.getModel();
    if (model && path) {
      const expectedLang = getLanguageFromPath(path);
      const actualLang = model.getLanguageId();
      if (actualLang !== expectedLang) {
        monaco.editor.setModelLanguage(model, expectedLang);
      }
    }

    const compilerOptions = {
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      reactNamespace: "React",
      allowJs: true,
      typeRoots: ["node_modules/@types"],
      baseUrl: "file:///",
      paths: { "@/*": ["file:///src/*"] },
      lib: ["dom", "esnext"],
    };
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
      compilerOptions,
    );
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(
      compilerOptions,
    );

    // ──────────────────────────────────────────────
    // Intercept "Go to Definition" for node_modules
    // ──────────────────────────────────────────────
    // When Monaco resolves a definition to a file URI that contains
    // node_modules, we fetch it on-demand from the PTY server which
    // has access to the host filesystem.
    const editorService = (editor as any)._codeEditorService;
    if (editorService) {
      const origOpenCodeEditor = editorService.openCodeEditor?.bind(editorService);
      editorService.openCodeEditor = async (
        input: any,
        source: any,
        sideBySide?: boolean,
      ) => {
        const targetUri = input?.resource;
        if (targetUri) {
          const uriStr = targetUri.toString();
          const uriPath = targetUri.path || "";

          // Check if this is a node_modules file
          if (uriPath.includes("node_modules/") || uriPath.includes("node_modules\\")) {
            // Extract the relative path: strip leading file:/// and slashes
            let relativePath = uriPath.replace(/^\/+/, "");

            // Ensure it starts with node_modules/
            const nmIndex = relativePath.indexOf("node_modules/");
            if (nmIndex >= 0) {
              relativePath = relativePath.substring(nmIndex);
            }

            console.log(`[Editor] Go-to-Definition intercepted for: ${relativePath}`);

            // Check if model already exists
            let model = monaco.editor.getModel(targetUri);

            if (!model) {
              // Request file from host via PTY server through a window event
              const fileData = await new Promise<{ content: string } | null>(
                (resolve) => {
                  const handleResponse = (e: Event) => {
                    const detail = (e as CustomEvent).detail;
                    if (detail?.path === relativePath) {
                      window.removeEventListener(
                        "pty-file-response",
                        handleResponse,
                      );
                      resolve(detail);
                    }
                  };

                  window.addEventListener(
                    "pty-file-response",
                    handleResponse,
                  );

                  // Dispatch request to shell context
                  window.dispatchEvent(
                    new CustomEvent("pty-file-request", {
                      detail: { path: relativePath },
                    }),
                  );

                  // Timeout after 8 seconds
                  setTimeout(() => {
                    window.removeEventListener(
                      "pty-file-response",
                      handleResponse,
                    );
                    resolve(null);
                  }, 8000);
                },
              );

              if (fileData?.content) {
                const lang = getLanguageFromPath(relativePath);
                model = monaco.editor.createModel(
                  fileData.content,
                  lang,
                  targetUri,
                );
                console.log(
                  `[Editor] Created model for node_modules file: ${relativePath}`,
                );
              } else {
                console.warn(
                  `[Editor] Could not fetch node_modules file: ${relativePath}`,
                );
                // Fall through to original handler
              }
            }

            // If we have a model, open it in the current editor
            if (model) {
              editor.setModel(model);

              // Jump to the specific position if requested
              if (input.options?.selection) {
                const sel = input.options.selection;
                editor.revealLineInCenter(
                  sel.startLineNumber || sel.selectionStartLineNumber || 1,
                );
                editor.setPosition({
                  lineNumber: sel.startLineNumber || sel.selectionStartLineNumber || 1,
                  column: sel.startColumn || sel.selectionStartColumn || 1,
                });
              }

              // Notify parent that we opened a node_modules file
              if (onOpenFile) {
                onOpenFile(relativePath, model.getValue());
              }

              return editor;
            }
          }
        }

        // Fall back to the original handler for non-node_modules files
        if (origOpenCodeEditor) {
          return origOpenCodeEditor(input, source, sideBySide);
        }
        return null;
      };
    }

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.(editor.getValue());
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
      editor.trigger("keyboard", "editor.action.triggerSuggest", {});
    });

    if (emmetEnabled) {
      editor.addCommand(
        monaco.KeyCode.Tab,
        () => {
          const model = editor.getModel();
          const position = editor.getPosition();
          if (!model || !position) {
            editor.trigger("source", "editor.action.indentLines", null);
            return;
          }
          const lineContent = model.getLineContent(position.lineNumber);
          const beforeCursor = lineContent.substring(0, position.column - 1);
          if (beforeCursor.length > 0 && /\S$/.test(beforeCursor)) {
            editor.trigger("emmet", "editor.action.triggerSuggest", {});
          } else {
            editor.trigger("source", "editor.action.indentLines", null);
          }
        },
        "editorTextFocus && !suggestWidgetVisible && !editorHasSelection && !inSnippetMode && !editorTabMovesFocus && !inlineSuggestionVisible",
      );
    }

    editor.addCommand(
      monaco.KeyCode.Tab,
      () => {
        editor.trigger("keyboard", "editor.action.inlineSuggest.commit", {});
      },
      "editorTextFocus && inlineSuggestionVisible",
    );

    editor.onDidChangeModelContent(() => {
      isTypingRef.current = true;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
      }, 2000);
      if (path && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("user-edit", { detail: path }));
      }
    });

    editor.onDidFocusEditorText(() => onFocus?.());
    editor.onDidBlurEditorText(() => onBlur?.());
    editor.focus();
  }

  const handleChange = (value: string | undefined) => {
    const newValue = value || "";
    if (newValue !== lastSavedContentRef.current) {
      onChange?.(newValue);
    }
  };

  return (
    <div
      className={`h-full w-full border-t border-white/5 transition-all duration-300 ${path ? "editor-glow-active" : ""}`}
    >
      <div className="h-full">
        <Editor
          height="100%"
          path={path}
          language={getLanguageFromPath(path)}
          defaultValue={displayValue}
          theme={themeToUse}
          beforeMount={handleBeforeMount}
          onMount={handleEditorDidMount}
          onChange={handleChange}
          options={{
            fontSize: fontSize || 14,
            fontFamily: "'Consolas', 'Menlo', 'Liberation Mono', monospace",
            fontLigatures: true,
            minimap: { enabled: true },
            padding: { top: 16 },
            automaticLayout: true,
            lineNumbers: showLineNumbers ? "on" : "off",
            glyphMargin: true,
            folding: true,
            wordWrap: wordWrap,
            scrollBeyondLastLine: false,
            renderWhitespace: "selection",
            stickyScroll: { enabled: true },
            smoothScrolling: true,
            mouseWheelZoom: true,
            tabSize: 2,
            autoClosingBrackets: "always",
            autoClosingQuotes: "always",
            autoIndent: "full",
            // @ts-ignore
            autoClosingTags: true,
            linkedEditing: true,
            bracketPairColorization: { enabled: true },
            formatOnType: false,
            formatOnPaste: true,
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: "on",
            acceptSuggestionOnCommitCharacter: true,
            tabCompletion: "on",
            wordBasedSuggestions: "allDocuments",
            wordBasedSuggestionsOnlySameLanguage: true,
            snippetSuggestions: "inline",
            suggestSelection: "first",
            quickSuggestions: { other: true, comments: true, strings: true },
            quickSuggestionsDelay: 100,
            suggest: {
              showKeywords: true,
              showSnippets: true,
              showFunctions: true,
              showConstructors: true,
              showFields: true,
              showVariables: true,
              showClasses: true,
              showInterfaces: true,
              showModules: true,
              showProperties: true,
              showEvents: true,
              showOperators: true,
              showUnits: true,
              showValues: true,
              showConstants: true,
              showEnums: true,
              showEnumMembers: true,
              showColors: true,
              showFiles: true,
              showReferences: true,
              showFolders: true,
              showTypeParameters: true,
              showMethods: true,
              showStructs: true,
              showWords: true,
              filterGraceful: true,
              localityBonus: true,
              shareSuggestSelections: true,
              snippetsPreventQuickSuggestions: false,
              showIcons: true,
              preview: true,
              previewMode: "subwordSmart",
              showStatusBar: true,
              insertMode: "insert",
              showDeprecated: false,
            },
            parameterHints: { enabled: true, cycle: true },
            guides: {
              indentation: true,
              bracketPairs: true,
              bracketPairsHorizontal: true,
              highlightActiveBracketPair: true,
              highlightActiveIndentation: true,
            },
            hover: { enabled: true, delay: 300 },
            stablePeek: true,
            inlineSuggest: { enabled: true },
            unicodeHighlight: { ambiguousCharacters: false },
          }}
        />
      </div>
    </div>
  );
}
