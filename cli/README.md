# @nanigoud1912/nexide

The local agent for **NexIDE** — a cloud-powered code editor that runs in your browser.

## What it does

When you run `npx @nanigoud1912/nexide`, it starts a local server that:

1. **🖥️ Native Terminal** — Spawns a real shell (PowerShell/Bash) on your machine, streamed live to the browser IDE
2. **📂 File Sync** — Watches your local project files and syncs changes bidirectionally with the cloud editor
3. **📦 Go-to-Definition** — Serves `node_modules` files on-demand so you can Ctrl+Click into dependency source code
4. **🔤 Type Definitions** — Automatically extracts and sends TypeScript type definitions for IntelliSense

## Usage

```bash
# Run from your project directory
cd my-project
npx @nanigoud1912/nexide
```

This opens [NexIDE](https://nexide.onrender.com) in your browser and connects it to your local machine.

## Requirements

- **Node.js 18+**
- A modern browser (Chrome, Edge, Firefox)

## How it works

```
Your Browser (NexIDE)  ←→  Socket.IO (port 3001)  ←→  Local Agent  ←→  Your Filesystem
```

The agent runs on port 3001 and the browser IDE connects to it for terminal I/O, file watching, and on-demand file reads.

## License

MIT
