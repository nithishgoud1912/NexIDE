<p align="center">
  <img src="https://img.shields.io/badge/NexIDE-Cloud--Powered%20IDE-blue?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="NexIDE Badge" />
</p>

<h1 align="center">✨ NexIDE — Cloud-Powered Code Editor</h1>

<p align="center">
  <b>A premium, browser-based IDE with real-time preview, integrated terminal, AI-powered coding assistance, and GitHub sync.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?style=flat-square&logo=tailwindcss" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Monaco_Editor-Latest-1E1E1E?style=flat-square&logo=visualstudiocode" alt="Monaco" />
  <img src="https://img.shields.io/badge/Prisma-5-2D3748?style=flat-square&logo=prisma" alt="Prisma" />
</p>

---

## 🚀 What is NexIDE?

**NexIDE** is a full-featured, browser-based Integrated Development Environment (IDE) that turns your browser into a professional workstation. It combines the power of **Monaco Editor** (the engine behind VS Code), an **integrated terminal**, **AI coding assistants**, and **GitHub integration** — all within a sleek, modern web interface.

> _"The browser is your workstation."_

---

## 🎯 Key Features

### 🖥️ Monaco Code Editor
- Full-powered code editor (same engine as VS Code)
- **Syntax highlighting** for 50+ languages with automatic language detection
- **Emmet support** for rapid HTML/CSS development
- **Auto-save** with configurable delay (default: 800ms)
- **Split-pane editing** — work on two files simultaneously (primary & secondary editors)
- **Tab management** — open, close, switch between multiple files
- **Unsaved file indicators** with visual dot markers
- **Customizable** — font size, line numbers, word wrap, themes

### 🤖 AI-Powered Coding
- **Inline Code Completion** — AI-driven autocomplete suggestions as you type (powered by Groq LLaMA)
- **AI Chat Panel** — conversational coding assistant with 3 provider options:
  - **Gemini 2.0 Flash** — Google's generative AI for chat
  - **Groq (LLaMA 3)** — fast inference for code suggestions
  - **GitHub Copilot (GPT-4o)** — context-aware code assistance
- **Markdown rendering** in chat responses with syntax-highlighted code blocks
- **Copy code** directly from AI responses

### 📁 File System
- **File System Access API** — read and write directly to your local file system
- **File Tree** with hierarchical navigation, folder collapsing, and file-type icons
- **CRUD Operations** — create, rename, and delete files/folders from within the IDE
- **IndexedDB storage** for project metadata and recent projects
- **Drag-and-drop** file management

### 🔌 Integrated Terminal
- **Full PTY terminal** powered by `node-pty` + `xterm.js`
- **Socket.IO** real-time communication between frontend and backend
- **WebGL accelerated** rendering for smooth terminal output
- **Auto-discovery** of project paths from common directories
- **Add-ons**: search, web links, fit-to-container

### 🐙 GitHub Integration
- **Clone repositories** directly from your GitHub account into a local folder
- **Repository browser** — search and select repos with metadata (stars, language, visibility)
- **Git diff viewer** — unified diff view showing additions, deletions, and modifications
- **Push changes** back to GitHub via the Octokit REST API
- **Profile page** — view your GitHub profile, repositories, followers, and stats

### 🔍 Search & Navigation
- **Command Palette** (`Ctrl+Shift+P`) — fuzzy search through commands and files
- **Find in Files** — search across the entire project with regex and case-sensitivity options
- **Recent file navigation** in the command palette

### 🖼️ Live Preview
- **WebContainer-based** in-browser preview of running applications
- **Refresh & URL navigation** within the preview pane
- **Resizable panels** — adjust editor, terminal, and preview sizes

### ⚙️ Settings & Customization
- **Editor themes** — 10+ built-in themes (Modern Dark, Monokai, Dracula, Solarized, GitHub, etc.)
- **App-wide dark/light/system** theme toggle
- **Font size**, **line numbers**, **word wrap** controls
- **Emmet enable/disable** toggle
- **Auto-save** configuration
- **Import/Export** settings and manage workspace cache

### 🔐 Authentication
- **GitHub OAuth** via NextAuth.js (Auth.js v5)
- **JWT session strategy** for secure, stateless authentication
- **Protected routes** — workspace and dashboard require authentication
- **Prisma Adapter** with MongoDB for persistent user data

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15 (App Router, Server Components) |
| **UI Library** | React 19, Tailwind CSS 4, Radix UI, shadcn/ui |
| **Code Editor** | Monaco Editor (`@monaco-editor/react`) |
| **Terminal** | xterm.js + node-pty + Socket.IO |
| **AI** | Google Gemini API, Groq SDK, GitHub Copilot API |
| **State Management** | Zustand (persisted) |
| **Database** | MongoDB Atlas + Prisma ORM |
| **Authentication** | NextAuth.js v5 (GitHub OAuth) |
| **GitHub API** | Octokit REST |
| **Bundling** | JSZip (for repo cloning) |
| **File Storage** | File System Access API + IndexedDB (idb-keyval) |
| **Styling** | Tailwind CSS 4 with tw-animate, class-variance-authority |
| **Forms** | React Hook Form + Zod validation |
| **Notifications** | Sonner (toast notifications) |

---

## 📂 Project Structure

```
NexIDE/
├── prisma/
│   └── schema.prisma          # MongoDB schema (User, Account, Session, Settings, Project)
├── public/                    # Static assets
├── scripts/
│   └── patch-emmet.js         # Emmet Monaco integration patch
├── src/
│   ├── app/
│   │   ├── (auth)/            # Auth route group
│   │   ├── api/
│   │   │   ├── ai/
│   │   │   │   ├── chat/      # Gemini AI chat endpoint
│   │   │   │   └── complete/  # Groq code completion endpoint
│   │   │   ├── auth/          # NextAuth API routes
│   │   │   ├── github/        # GitHub API proxy (push, Copilot)
│   │   │   ├── local-shell/   # Local shell command execution
│   │   │   └── terminal/      # Terminal websocket endpoint
│   │   ├── auth/signin/       # Sign-in page (GitHub OAuth)
│   │   ├── dashboard/         # Dashboard with project actions
│   │   ├── profile/           # GitHub profile viewer
│   │   └── workspace/         # Main IDE workspace (2300+ lines)
│   ├── components/
│   │   ├── ai-chat-panel.tsx  # AI chat with multi-provider support
│   │   ├── command-palette.tsx # VS Code-style command palette
│   │   ├── dashboard-actions.tsx # Open folder / Import from GitHub
│   │   ├── editor.tsx         # Monaco editor with AI completions
│   │   ├── error-boundary.tsx # Error boundary for workspace
│   │   ├── file-tree.tsx      # Recursive file tree component
│   │   ├── find-in-files.tsx  # Project-wide search
│   │   ├── git-diff-panel.tsx # Git diff viewer with unified diffs
│   │   ├── preview.tsx        # Live preview via WebContainer
│   │   ├── recent-projects.tsx # Recent projects list
│   │   ├── repo-modal.tsx     # GitHub repository browser modal
│   │   ├── settings-widget.tsx # IDE settings popover
│   │   ├── terminal.tsx       # xterm.js terminal wrapper
│   │   ├── theme-provider.tsx # next-themes provider
│   │   └── ui/                # 56 shadcn/ui components
│   ├── context/               # React context providers
│   ├── hooks/
│   │   ├── use-auto-save.ts   # Auto-save hook
│   │   ├── use-file-operations.ts # File CRUD operations
│   │   ├── use-mobile.ts      # Mobile detection
│   │   ├── use-webcontainer.ts # WebContainer initialization
│   │   └── use-workspace-init.ts # Workspace bootstrap logic
│   ├── lib/
│   │   ├── download-zip.ts    # Export project as ZIP
│   │   ├── file-system.ts     # File System Access API helpers
│   │   ├── github-import.ts   # GitHub repo fetch & ZIP extraction
│   │   ├── github-sync.ts     # Push changes to GitHub
│   │   ├── github.ts          # Octokit client
│   │   ├── recent-projects.ts # IndexedDB recent projects
│   │   ├── templates.ts       # Project starter templates
│   │   ├── terminal-store.ts  # Terminal state
│   │   ├── themes.ts          # 10+ Monaco editor themes
│   │   ├── utils.ts           # Utility helpers (cn)
│   │   └── webcontainer.ts    # WebContainer singleton
│   ├── store/
│   │   ├── use-ai-chat-store.ts  # Zustand store for AI chat
│   │   └── use-ide-store.ts      # Zustand store for IDE state
│   └── types/
│       ├── file-system.d.ts   # File System type definitions
│       └── next-auth.d.ts     # NextAuth type extensions
├── pty-server.js              # Node.js PTY server (terminal backend)
├── middleware.ts               # Route protection middleware
├── next.config.mjs            # Next.js config (COOP/COEP headers)
└── package.json               # Dependencies & scripts
```

---

## ⚡ Getting Started

### Prerequisites

- **Node.js** 18+
- **MongoDB** instance (Atlas or local)
- **GitHub OAuth App** credentials
- **API Keys** for AI features (optional):
  - Google Gemini API key
  - Groq API key

### 1. Clone the Repository

```bash
git clone https://github.com/nithishgoud1912/NexIDE.git
cd NexIDE
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<db>"

# NextAuth
AUTH_SECRET="your-secret-key"  # Generate with: openssl rand -base64 32

# GitHub OAuth
AUTH_GITHUB_ID="your-github-client-id"
AUTH_GITHUB_SECRET="your-github-client-secret"

# AI APIs (optional)
GOOGLE_GENERATIVE_AI_API_KEY="your-gemini-api-key"
GROQ_API_KEY="your-groq-api-key"
GITHUB_TOKEN="your-github-personal-access-token"
```

### 4. Initialize the Database

```bash
npx prisma generate
npx prisma db push
```

### 5. Run the Application

```bash
# Start both Next.js dev server and PTY terminal server
npm run terminal-dev

# Or run them separately:
npm run dev           # Next.js on port 3000
npm run terminal-server  # PTY server on port 3001
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🎮 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + S` | Save current file |
| `Ctrl + Shift + P` | Open Command Palette |
| `Ctrl + Shift + F` | Find in Files |
| `Ctrl + B` | Toggle Sidebar |
| `Ctrl + J` | Toggle Terminal |
| `Ctrl + \`` | Toggle AI Chat |
| `Ctrl + Shift + G` | Toggle Git Diff Panel |

---

## 📊 Database Schema

The application uses **MongoDB** with **Prisma ORM** and includes the following models:

- **User** — authenticated users with profile data
- **Account** — OAuth provider accounts (GitHub)
- **Session** — active user sessions
- **Settings** — per-user IDE preferences (theme, font size, font family)
- **Project** — saved projects linked to users with unique names

---

## 🧩 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/[...nextauth]` | ALL | NextAuth.js authentication routes |
| `/api/ai/chat` | POST | Gemini AI chat (streaming SSE) |
| `/api/ai/complete` | POST | Groq code completion |
| `/api/github` | POST | GitHub push & Copilot proxy |

---

## 🛡️ Security

- **JWT-based** session management (stateless, no server-side session storage)
- **Route protection** via NextAuth middleware (workspace & dashboard are protected)
- **CORS** configured for PTY server with credential support
- **COOP/COEP headers** for WebContainer security requirements

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is open source.

---

<p align="center">
  Built by <a href="https://github.com/nithishgoud1912">Nithish Goud</a>
</p>
