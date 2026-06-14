# NexIDE

### A Local-First Browser IDE
*Code in your browser. Execute on your machine.*

NexIDE is a hybrid development environment that combines the convenience of a browser-based IDE with the power of your local machine.

Unlike traditional cloud IDEs that rely on remote containers, sandboxed terminals, and uploaded workspaces, NexIDE connects directly to your local filesystem and terminal, allowing developers to work inside a browser without sacrificing performance or control.

---

## Why NexIDE?

Modern cloud IDEs solve portability but introduce new problems:

* ❌ Slow environment setup
* ❌ Remote container overhead
* ❌ Fake browser terminals
* ❌ Large repository limitations
* ❌ Constant workspace synchronization
* ❌ Dependency installation delays

NexIDE takes a different approach. Instead of moving your code to the cloud, NexIDE brings the IDE to where your code already lives.

```
Browser UI
     │
     ▼
NexIDE Local Bridge
     │
 ┌───┴────┐
 ▼        ▼
Filesystem Terminal
 ▼        ▼
Your Machine
```

The browser handles the interface. Your machine handles the work.

---

## Key Features

### Local Filesystem Access
Work directly on files stored on your machine using the File System Access API.
* Open local folders
* Create files and directories
* Rename and delete resources
* Instant synchronization (no uploads, no remote copies, no workspace migration)

### Real Terminal Integration
NexIDE provides a real PTY-backed terminal powered by:
* `node-pty`
* `Socket.IO`
* `xterm.js`

This is not a simulated terminal. Commands execute directly on your machine.
```bash
npm install
git status
docker compose up
```
All work exactly as expected.

### VS Code Powered Editing
Built on Monaco Editor, the same editor engine used by VS Code.
* Multi-tab editing
* Split view
* Syntax highlighting
* Emmet support
* Auto-save
* Theme customization

### AI Coding Assistant
Integrated support for multiple AI providers:
* Gemini
* Groq (LLaMA 3)
* GitHub Copilot

**Capabilities:**
* Inline completions
* Code generation
* Refactoring suggestions
* Interactive AI chat

### GitHub Workflow Integration
Manage repositories without leaving the IDE.
* Repository browser
* Clone repositories
* View diffs
* Push changes
* GitHub profile insights

### Live Preview
Instantly preview applications using WebContainers. Perfect for:
* React
* Next.js
* Vite
* Static websites

---

## Architecture

NexIDE follows a hybrid architecture.

```
┌───────────────────────────┐
│        Browser UI         │
│                           │
│ Monaco Editor             │
│ AI Assistant              │
│ File Explorer             │
│ Command Palette           │
└─────────────┬─────────────┘
              │
              ▼
      Socket.IO Layer
              │
 ┌────────────┴────────────┐
 ▼                         ▼
PTY Server          Filesystem API
 ▼                         ▼
Local Shell         Local Files
              │
              ▼
        Your Machine
```

This design provides:
* Near-native responsiveness
* Reduced cloud costs
* Better privacy
* Faster file operations
* Real terminal access

---

## Tech Stack

* **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS, Zustand, Monaco Editor
* **Backend**: Node.js, Socket.IO, Next.js API Routes
* **Data Layer**: MongoDB Atlas, Prisma ORM
* **Authentication**: NextAuth.js, GitHub OAuth
* **AI**: Gemini, Groq, GitHub Copilot
* **Developer Tools**: WebContainers, `xterm.js`, `node-pty`

---

## Performance Highlights

* **Virtualized File Tree**: Large repositories remain responsive through viewport-based rendering.
* **Smart File Synchronization**: Efficient filesystem watching prevents unnecessary updates and re-renders.
* **Optimized State Management**: Normalized state architecture minimizes React rendering overhead.
* **Low-Latency Terminal Communication**: Persistent Socket.IO channels provide real-time terminal interaction.

---

## Getting Started

### Installation
```bash
git clone https://github.com/nithishgoud1912/NexIDE.git
cd NexIDE
npm install
```

### Environment Variables
Create a `.env` file in the root directory and configure the following variables:
```env
DATABASE_URL=

AUTH_SECRET=

AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=

GOOGLE_GENERATIVE_AI_API_KEY=
GROQ_API_KEY=

GITHUB_TOKEN=
```

### Run Development Server
```bash
npm run terminal-dev
```

Open your browser and navigate to:
[http://localhost:3000](http://localhost:3000)

---

## Future Roadmap

* **Collaboration**: Shared workspaces, live cursors, pair programming
* **Infrastructure**: Docker execution environments, containerized development, workspace snapshots
* **AI**: AI code reviews, automated bug detection, architecture analysis
* **Platform**: Standalone desktop application, offline support, plugin ecosystem

---

## Philosophy

The browser should be a workstation, not a limitation.

NexIDE was built to remove the friction between developers and their environments.
* No setup.
* No migrations.
* No fake terminals.
* Just code.

---

## Author

**Nithish Kumar Goud**
