import { Monaco } from "@monaco-editor/react";

export function registerThemes(monaco: Monaco) {
  // GitHub Dark
  monaco.editor.defineTheme("github-dark", {
    base: "vs-dark",
    inherit: true,
    semanticHighlighting: true,
    rules: [
      { token: "", foreground: "d1d5da", background: "24292e" },
      { token: "tag", foreground: "85e89d" },
      { token: "attribute.name", foreground: "79b8ff" },
      { token: "keyword", foreground: "f97583" },
      { token: "string", foreground: "9ecbff" },
      { token: "number", foreground: "79b8ff" },
      { token: "comment", foreground: "6a737d", fontStyle: "italic" },
      { token: "type", foreground: "b392f0" },
      { token: "function", foreground: "b392f0" },
      { token: "variable", foreground: "e1e4e8" },
      { token: "delimiter", foreground: "e1e4e8" },
      { token: "constant", foreground: "79b8ff" },
      { token: "regexp", foreground: "9ecbff" },
      { token: "class", foreground: "b392f0" },
      { token: "interface", foreground: "b392f0" },
      { token: "property", foreground: "79b8ff" },
      { token: "parameter", foreground: "e1e4e8" },
      { token: "method", foreground: "b392f0" },
    ],
    colors: {
      "editor.background": "#24292e",
      "editor.foreground": "#d1d5da",
      "editorCursor.foreground": "#c8e1ff",
      "editor.lineHighlightBackground": "#2b3036",
      "editorLineNumber.foreground": "#444d56",
      "editor.selectionBackground": "#3392FF44",
      "editor.inactiveSelectionBackground": "#3392FF22",
    },
  });

  // One Dark Pro
  monaco.editor.defineTheme("one-dark-pro", {
    base: "vs-dark",
    inherit: true,
    semanticHighlighting: true,
    rules: [
      { token: "", foreground: "abb2bf", background: "282c34" },
      { token: "tag", foreground: "e06c75" },
      { token: "attribute.name", foreground: "d19a66" },
      { token: "keyword", foreground: "c678dd" },
      { token: "operator", foreground: "56b6c2" },
      { token: "string", foreground: "98c379" },
      { token: "number", foreground: "d19a66" },
      { token: "comment", foreground: "5c6370", fontStyle: "italic" },
      { token: "type", foreground: "e5c07b" },
      { token: "function", foreground: "61afef" },
      { token: "variable", foreground: "abb2bf" },
      { token: "constant", foreground: "d19a66" },
      { token: "regexp", foreground: "98c379" },
      { token: "delimiter", foreground: "abb2bf" },
      { token: "class", foreground: "e5c07b" },
      { token: "interface", foreground: "e5c07b" },
      { token: "property", foreground: "d19a66" },
      { token: "parameter", foreground: "abb2bf" },
      { token: "method", foreground: "61afef" },
    ],
    colors: {
      "editor.background": "#282c34",
      "editor.foreground": "#abb2bf",
      "editorCursor.foreground": "#528bff",
      "editor.lineHighlightBackground": "#2c313c",
      "editorLineNumber.foreground": "#4b5263",
      "editor.selectionBackground": "#3e4451",
    },
  });

  // Night Owl
  monaco.editor.defineTheme("night-owl", {
    base: "vs-dark",
    inherit: true,
    semanticHighlighting: true,
    rules: [
      { token: "", foreground: "d6deeb", background: "011627" },
      { token: "tag", foreground: "addb67" },
      { token: "attribute.name", foreground: "c792ea" },
      { token: "keyword", foreground: "c792ea" },
      { token: "operator", foreground: "c792ea" },
      { token: "string", foreground: "ecc48d" },
      { token: "number", foreground: "f78c6c" },
      { token: "comment", foreground: "637777", fontStyle: "italic" },
      { token: "type", foreground: "ffcb6b" },
      { token: "function", foreground: "82aaff" },
      { token: "variable", foreground: "d6deeb" },
      { token: "constant", foreground: "82aaff" },
      { token: "regexp", foreground: "ecc48d" },
      { token: "delimiter", foreground: "d9f5dd" },
      { token: "class", foreground: "ffcb6b" },
      { token: "interface", foreground: "ffcb6b" },
      { token: "property", foreground: "80cbc4" },
      { token: "parameter", foreground: "d6deeb" },
      { token: "method", foreground: "82aaff" },
    ],
    colors: {
      "editor.background": "#011627",
      "editor.foreground": "#d6deeb",
      "editorCursor.foreground": "#80a4c2",
      "editor.lineHighlightBackground": "#000300",
      "editorLineNumber.foreground": "#4b5263",
      "editor.selectionBackground": "#1d3b53",
    },
  });

  // JellyFish (Approximation based on vibrant contrast)
  monaco.editor.defineTheme("jellyfish", {
    base: "vs-dark",
    inherit: true,
    semanticHighlighting: true,
    rules: [
      { token: "", foreground: "e5e5e5", background: "150014" },
      { token: "tag", foreground: "ff0055" },
      { token: "keyword", foreground: "ff0055" }, // Pink
      { token: "string", foreground: "00e5ff" }, // Cyan
      { token: "number", foreground: "a600ff" }, // Purple
      { token: "comment", foreground: "606060", fontStyle: "italic" },
      { token: "function", foreground: "00e5ff" },
      { token: "type", foreground: "ff0055" },
      { token: "constant", foreground: "a600ff" },
      { token: "variable", foreground: "e5e5e5" },
      { token: "class", foreground: "00e5ff" },
      { token: "interface", foreground: "00e5ff" },
      { token: "property", foreground: "ff0055" },
      { token: "parameter", foreground: "e5e5e5" },
      { token: "method", foreground: "00e5ff" },
    ],
    colors: {
      "editor.background": "#150014",
      "editor.foreground": "#e5e5e5",
      "editorCursor.foreground": "#ff0055",
      "editor.lineHighlightBackground": "#220022",
      "editorLineNumber.foreground": "#ff0055",
      "editor.selectionBackground": "#440044",
    },
  });

  // Vue (Based on Vetur/Volar usually dark green accents)
  monaco.editor.defineTheme("vue-theme", {
    base: "vs-dark",
    inherit: true,
    semanticHighlighting: true,
    rules: [
      { token: "", foreground: "d1d1d1", background: "2e3c43" },
      { token: "tag", foreground: "42b883" },
      { token: "keyword", foreground: "42b883" }, // Vue Green
      { token: "string", foreground: "42b983" },
      { token: "number", foreground: "42b883" },
      { token: "comment", foreground: "475f63", fontStyle: "italic" },
      { token: "function", foreground: "618cba" }, // Blueish
      { token: "type", foreground: "42b883" },
      { token: "constant", foreground: "42b883" },
      { token: "class", foreground: "42b883" },
      { token: "interface", foreground: "42b883" },
      { token: "property", foreground: "42b883" },
      { token: "parameter", foreground: "d1d1d1" },
      { token: "method", foreground: "618cba" },
    ],
    colors: {
      "editor.background": "#2e3c43",
      "editor.foreground": "#d1d1d1",
      "editorCursor.foreground": "#42b883",
      "editor.lineHighlightBackground": "#1e282d",
      "editorLineNumber.foreground": "#475f63",
      "editor.selectionBackground": "#1e282d",
    },
  });
  // Dracula
  monaco.editor.defineTheme("dracula", {
    base: "vs-dark",
    inherit: true,
    semanticHighlighting: true,
    rules: [
      { token: "", foreground: "f8f8f2", background: "282a36" },
      { token: "tag", foreground: "ff79c6" },
      { token: "attribute.name", foreground: "50fa7b" },
      { token: "keyword", foreground: "ff79c6" },
      { token: "string", foreground: "f1fa8c" },
      { token: "number", foreground: "bd93f9" },
      { token: "comment", foreground: "6272a4", fontStyle: "italic" },
      { token: "function", foreground: "50fa7b" },
      { token: "type", foreground: "8be9fd" },
      { token: "operator", foreground: "ff79c6" },
      { token: "constant", foreground: "bd93f9" },
      { token: "regexp", foreground: "ff5555" },
      { token: "delimiter", foreground: "f8f8f2" },
      { token: "variable", foreground: "f8f8f2" },
      { token: "class", foreground: "8be9fd" },
      { token: "interface", foreground: "8be9fd" },
      { token: "property", foreground: "50fa7b" },
      { token: "parameter", foreground: "ff79c6" },
      { token: "method", foreground: "50fa7b" },
    ],
    colors: {
      "editor.background": "#282a36",
      "editor.foreground": "#f8f8f2",
      "editorCursor.foreground": "#f8f8f0",
      "editor.lineHighlightBackground": "#44475a",
      "editorLineNumber.foreground": "#6272a4",
      "editor.selectionBackground": "#44475a",
    },
  });

  // Monokai
  monaco.editor.defineTheme("monokai", {
    base: "vs-dark",
    inherit: true,
    semanticHighlighting: true,
    rules: [
      { token: "", foreground: "f8f8f2", background: "272822" },
      { token: "tag", foreground: "f92672" },
      { token: "attribute.name", foreground: "a6e22e" },
      { token: "keyword", foreground: "f92672" },
      { token: "string", foreground: "e6db74" },
      { token: "number", foreground: "ae81ff" },
      { token: "comment", foreground: "75715e", fontStyle: "italic" },
      { token: "type", foreground: "66d9ef" },
      { token: "function", foreground: "a6e22e" },
      { token: "operator", foreground: "f92672" },
      { token: "constant", foreground: "ae81ff" },
      { token: "regexp", foreground: "e6db74" },
      { token: "delimiter", foreground: "f8f8f2" },
      { token: "class", foreground: "66d9ef" },
      { token: "interface", foreground: "66d9ef" },
      { token: "property", foreground: "a6e22e" },
      { token: "parameter", foreground: "fd971f" },
      { token: "method", foreground: "a6e22e" },
    ],
    colors: {
      "editor.background": "#272822",
      "editor.foreground": "#f8f8f2",
      "editorCursor.foreground": "#f8f8f0",
      "editor.lineHighlightBackground": "#3e3d32",
      "editorLineNumber.foreground": "#90908a",
      "editor.selectionBackground": "#49483e",
    },
  });
}
