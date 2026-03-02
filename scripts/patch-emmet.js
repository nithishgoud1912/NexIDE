/**
 * postinstall script: patches emmet-monaco-es to fix JSX/TSX support.
 *
 * The library has two bugs that prevent Emmet from working in
 * javascriptreact / typescriptreact languages:
 *
 * 1. Token validation only accepts identifier.js / identifier.ts,
 *    but Monaco uses identifier.javascriptreact / identifier.typescriptreact.
 *
 * 2. LANGUAGE_MODES map has no entries for javascriptreact / typescriptreact,
 *    so triggerCharacters is undefined and the provider never fires.
 */
const fs = require("fs");
const path = require("path");

const distDir = path.join(
  __dirname,
  "..",
  "node_modules",
  "emmet-monaco-es",
  "dist",
);

// All dist files that may be loaded
const filesToPatch = [
  "emmet-monaco.esm.js",
  "emmet-monaco.common.js",
  "emmet-monaco.js",
];

let patchedCount = 0;

filesToPatch.forEach((filename) => {
  const filepath = path.join(distDir, filename);
  if (!fs.existsSync(filepath)) return;

  let content = fs.readFileSync(filepath, "utf8");
  let changed = false;

  // Fix 1: Token validation — add react language token types
  // Match both 4-space and no-space variants
  const oldTokens =
    "'identifier.js', 'type.identifier.js', 'identifier.ts', 'type.identifier.ts'";
  const newTokens =
    "'identifier.js', 'type.identifier.js', 'identifier.ts', 'type.identifier.ts', 'identifier.javascriptreact', 'type.identifier.javascriptreact', 'identifier.typescriptreact', 'type.identifier.typescriptreact'";

  if (
    content.includes(oldTokens) &&
    !content.includes("identifier.javascriptreact")
  ) {
    content = content.replace(oldTokens, newTokens);
    changed = true;
  }

  // Fix 2: Add LANGUAGE_MODES entries for react languages
  // Match the typescript line followed by }; (with optional indentation)
  const tsLineRegex = /(typescript:\s*\[.*?\],?\n)(\s*\};)/g;
  if (!content.includes("javascriptreact:")) {
    content = content.replace(tsLineRegex, (match, tsLine, closing) => {
      // Detect indentation from the typescript line
      const indent = tsLine.match(/^(\s*)/)[1];
      return (
        tsLine +
        indent +
        "javascriptreact: ['!', '.', '}', '*', '$', ']', '/', '>', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],\n" +
        indent +
        "typescriptreact: ['!', '.', '}', '*', '$', ']', '/', '>', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],\n" +
        closing
      );
    });
    if (content.includes("javascriptreact:")) {
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filepath, content, "utf8");
    patchedCount++;
    console.log(`[postinstall] Patched ${filename}`);
  }
});

if (patchedCount > 0) {
  console.log(
    `[postinstall] emmet-monaco-es patched (${patchedCount} files) — JSX/TSX Emmet enabled`,
  );
} else {
  console.log("[postinstall] emmet-monaco-es already patched or not found");
}
