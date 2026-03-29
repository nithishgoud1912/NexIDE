#!/usr/bin/env node

const os = require("os");
const fs = require("fs");
const path = require("path");
const pty = require("node-pty");
const { Server } = require("socket.io");
const chokidar = require("chokidar");
const open = require("open");

// Read version from package.json
const cliPkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "package.json"), "utf8"),
);
const CLI_VERSION = cliPkg.version;

const PORT = 3001;
const NEXIDE_URL = "https://nexide.onrender.com";
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB — skip files larger than this for on-demand reads

const io = new Server(PORT, {
  cors: {
    origin: ["http://localhost:3000", NEXIDE_URL],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const typeCache = new Map();

console.log(`
\x1b[36m╔══════════════════════════════════════════════════╗\x1b[0m
\x1b[36m║\x1b[0m  \x1b[32m🚀 NexIDE Local Agent v${CLI_VERSION.padEnd(25)}\x1b[0m \x1b[36m║\x1b[0m
\x1b[36m╠══════════════════════════════════════════════════╣\x1b[0m
\x1b[36m║\x1b[0m  Socket.IO  → port ${String(PORT).padEnd(28)} \x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  Platform   → ${os.platform().padEnd(33)} \x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  CWD        → ${process.cwd().slice(-33).padEnd(33)} \x1b[36m║\x1b[0m
\x1b[36m╚══════════════════════════════════════════════════╝\x1b[0m
`);

setTimeout(() => {
  console.log(`\x1b[33m🌐 Opening NexIDE in your browser: ${NEXIDE_URL}\x1b[0m`);
  console.log(
    `\x1b[90m   Keep this terminal open while you code!\x1b[0m\n`,
  );
  open(NEXIDE_URL);
}, 1000);

// ─────────────────────────────────────────────
// Helper: Package Type Definitions
// ─────────────────────────────────────────────
function getPackageTypes(pkgName, projectPath) {
  const cacheKey = `${pkgName}:${projectPath}`;
  if (typeCache.has(cacheKey)) return typeCache.get(cacheKey);

  try {
    const parts = pkgName.split("/");
    const basePkg = pkgName.startsWith("@")
      ? `${parts[0]}/${parts[1]}`
      : parts[0];
    const subRoute = pkgName.startsWith("@")
      ? parts.slice(2).join("/")
      : parts.slice(1).join("/");

    const pkgPath = path.join(projectPath, "node_modules", basePkg);
    const pkgJsonPath = path.join(pkgPath, "package.json");

    if (!fs.existsSync(pkgJsonPath)) return null;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));

    let typesPath = "";
    if (subRoute) {
      const potentialPath = path.join(pkgPath, subRoute + ".d.ts");
      const potentialIndexPath = path.join(pkgPath, subRoute, "index.d.ts");

      if (fs.existsSync(potentialPath)) {
        typesPath = potentialPath;
      } else if (fs.existsSync(potentialIndexPath)) {
        typesPath = potentialIndexPath;
      }
    }

    if (!typesPath) {
      const mainTypes = pkgJson.types || pkgJson.typings || "index.d.ts";
      typesPath = path.join(pkgPath, mainTypes);
    }

    if (fs.existsSync(typesPath)) {
      const result = {
        name: pkgName,
        path: `node_modules/${pkgName}/${path.basename(typesPath)}`,
        content: fs.readFileSync(typesPath, "utf8"),
      };
      typeCache.set(cacheKey, result);
      return result;
    }
  } catch (e) {
    // Silently ignore
  }
  typeCache.set(cacheKey, null);
  return null;
}

// ─────────────────────────────────────────────
// Helper: Sync All Project Types
// ─────────────────────────────────────────────
function syncAllProjectTypes(socket, projectPath) {
  try {
    const pkgJsonPath = path.join(projectPath, "package.json");
    if (!fs.existsSync(pkgJsonPath)) return;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    const deps = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.devDependencies || {}),
    };

    const packages = Object.keys(deps);
    const nodeModulesPath = path.join(projectPath, "node_modules");

    if (!fs.existsSync(nodeModulesPath)) return;

    packages.forEach((pkgName) => {
      const pkgPath = path.join(projectPath, "node_modules", pkgName);
      if (!fs.existsSync(pkgPath)) return;

      const typeDef = getPackageTypes(pkgName, projectPath);
      if (typeDef) {
        socket.emit("type-definition", typeDef);
      }
    });
  } catch (e) {}
}

// ─────────────────────────────────────────────
// Helper: Project File Sync (Warm Boot + Watcher)
// ─────────────────────────────────────────────
function setupProjectSync(socket, projectPath) {
  const ignoredDirs = [
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".vscode",
    ".cache",
    ".turbo",
    ".swc",
    "tmp",
    "coverage",
    "__pycache__",
  ];

  const SKIP_FILES = new Set([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
  ]);

  const shouldIgnore = (filePath) => {
    return ignoredDirs.some(
      (dir) =>
        filePath.includes(path.sep + dir + path.sep) ||
        filePath.endsWith(path.sep + dir),
    );
  };

  // Warm Boot — send all current files on connection
  try {
    const getAllFiles = (dir, allFiles = []) => {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        if (ignoredDirs.includes(file)) return;
        if (SKIP_FILES.has(file)) return;
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.lstatSync(fullPath);
          if (stat.isDirectory()) {
            getAllFiles(fullPath, allFiles);
          } else if (stat.size <= MAX_FILE_SIZE) {
            allFiles.push(fullPath);
          }
        } catch (e) {}
      });
      return allFiles;
    };

    const files = getAllFiles(projectPath);
    let syncCount = 0;
    files.forEach((fullPath) => {
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        const virtualPath = path
          .relative(projectPath, fullPath)
          .replace(/\\/g, "/");

        socket.emit("file-sync", {
          path: `file:///${virtualPath}`,
          content: content,
        });
        syncCount++;
      } catch (e) {}
    });
    console.log(`[NexIDE] Warm Boot: Synced ${syncCount} files.`);
  } catch (e) {}

  // File Watcher
  const watcher = chokidar.watch(projectPath, {
    persistent: true,
    ignoreInitial: true,
    ignored: (watchPath) => shouldIgnore(watchPath),
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  watcher.on("all", (event, filePath) => {
    if (event === "unlink" || event === "unlinkDir") return;
    try {
      const stat = fs.lstatSync(filePath);
      if (stat.isDirectory()) return;
      if (stat.size > MAX_FILE_SIZE) return;

      const fileName = path.basename(filePath);
      if (SKIP_FILES.has(fileName)) return;

      const content = fs.readFileSync(filePath, "utf8");
      const virtualPath = path
        .relative(projectPath, filePath)
        .replace(/\\/g, "/");

      socket.emit("file-sync", {
        path: `file:///${virtualPath}`,
        content: content,
      });
    } catch (e) {}
  });

  return watcher;
}

// ═════════════════════════════════════════════
// Socket.IO Connection Handler
// ═════════════════════════════════════════════
io.on("connection", (socket) => {
  console.log("[NexIDE] Client connected.");

  let projectWatcher = null;
  let pkgWatcher = null;
  let ptyProcess = null;
  let currentProjectPath = process.cwd();

  const startProjectServices = (projectPath) => {
    console.log(`[NexIDE] Starting services for: ${projectPath}`);
    currentProjectPath = projectPath;

    if (projectWatcher) projectWatcher.close();
    if (pkgWatcher) pkgWatcher.close();

    syncAllProjectTypes(socket, projectPath);
    projectWatcher = setupProjectSync(socket, projectPath);

    const pkgJsonPath = path.join(projectPath, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      pkgWatcher = chokidar.watch(pkgJsonPath).on("change", () => {
        syncAllProjectTypes(socket, projectPath);
      });
    }
  };

  const setupPty = (cwd) => {
    if (ptyProcess) {
      ptyProcess.kill();
    }

    console.log(`[NexIDE] Spawning shell in: ${cwd}`);
    const shell = os.platform() === "win32" ? "powershell.exe" : "bash";
    const shellArgs =
      os.platform() === "win32"
        ? ["-NoProfile", "-ExecutionPolicy", "Bypass"]
        : ["--norc", "--noprofile"];

    ptyProcess = pty.spawn(shell, shellArgs, {
      name: "xterm-color",
      cols: 80,
      rows: 30,
      cwd: cwd,
      env: process.env,
    });

    ptyProcess.onData((data) => {
      socket.emit("output", data);
    });
  };

  // ── Terminal I/O ──
  socket.on("input", (data) => {
    if (!ptyProcess) {
      setupPty(process.cwd());
    }
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  });

  socket.on("resize", ({ cols, rows }) => {
    if (ptyProcess) {
      try {
        ptyProcess.resize(cols, rows);
      } catch (e) {}
    }
  });

  // ── Project Management ──
  socket.on("open-project-path", (absolutePath) => {
    console.log(`[NexIDE] Opening: ${absolutePath}`);
    if (fs.existsSync(absolutePath)) {
      startProjectServices(absolutePath);
      setupPty(absolutePath);
      socket.emit("root-path", absolutePath);
    } else {
      socket.emit("error", `Project path does not exist: ${absolutePath}`);
    }
  });

  socket.on("chdir", (newPath) => {
    startProjectServices(newPath);
    setupPty(newPath);
    socket.emit("root-path", newPath);
  });

  socket.on("find-project", (folderName) => {
    console.log(`[NexIDE] Searching for project: ${folderName}`);
    const home = os.homedir();
    const contextRoots = [];
    let curr = process.cwd();
    for (let i = 0; i < 4; i++) {
      contextRoots.push(curr);
      if (path.basename(curr) === folderName) {
        socket.emit("project-located", curr);
        socket.emit("root-path", curr);
        startProjectServices(curr);
        setupPty(curr);
        return;
      }
      const parent = path.dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }

    const commonRoots = [
      path.join(home, "Desktop"),
      path.join(home, "Documents"),
      path.join(home, "OneDrive", "Desktop"),
      path.join(home, "OneDrive", "Documents"),
      path.join(home, "Downloads"),
    ];

    const allRoots = [...new Set([...contextRoots, ...commonRoots])];

    for (const root of allRoots) {
      try {
        if (!fs.existsSync(root)) continue;
        const potential = path.join(root, folderName);
        if (fs.existsSync(potential) && fs.lstatSync(potential).isDirectory()) {
          socket.emit("project-located", potential);
          socket.emit("root-path", potential);
          startProjectServices(potential);
          setupPty(potential);
          return;
        }
      } catch (e) {}
    }
    socket.emit("project-not-found", folderName);
  });

  // ── Type Definitions ──
  socket.on("request-types", (packages) => {
    packages.forEach((pkgName) => {
      const typeDef = getPackageTypes(pkgName, currentProjectPath);
      if (typeDef) {
        socket.emit("type-definition", typeDef);
      }
    });
  });

  // ── On-Demand File Reader (node_modules + any file) ──
  // This is the key handler for serving node_modules files.
  // The warm boot and watcher skip node_modules for performance,
  // but when the user does "Go to Definition" into a dependency,
  // the frontend requests the specific file through this event.
  socket.on("request-file", (requestedPath, callback) => {
    try {
      let fullPath;
      if (path.isAbsolute(requestedPath)) {
        fullPath = requestedPath;
      } else {
        fullPath = path.join(currentProjectPath, requestedPath);
      }

      if (!fs.existsSync(fullPath)) {
        const errPayload = { error: `File not found: ${requestedPath}` };
        if (typeof callback === "function") {
          callback(errPayload);
        } else {
          socket.emit("file-content-error", errPayload);
        }
        return;
      }

      const stat = fs.lstatSync(fullPath);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(fullPath).map((name) => {
          const childPath = path.join(fullPath, name);
          const childStat = fs.lstatSync(childPath);
          return { name, isDirectory: childStat.isDirectory() };
        });
        const payload = { path: requestedPath, entries, isDirectory: true };
        if (typeof callback === "function") {
          callback(payload);
        } else {
          socket.emit("file-content", payload);
        }
        return;
      }

      // Limit to 2 MB to prevent hanging
      if (stat.size > MAX_FILE_SIZE) {
        const errPayload = {
          error: `File too large (${stat.size} bytes): ${requestedPath}`,
        };
        if (typeof callback === "function") {
          callback(errPayload);
        } else {
          socket.emit("file-content-error", errPayload);
        }
        return;
      }

      const content = fs.readFileSync(fullPath, "utf8");
      const payload = {
        path: requestedPath,
        content,
        isDirectory: false,
      };

      if (typeof callback === "function") {
        callback(payload);
      } else {
        socket.emit("file-content", payload);
      }
    } catch (e) {
      const errPayload = {
        error: `Failed to read ${requestedPath}: ${e.message}`,
      };
      if (typeof callback === "function") {
        callback(errPayload);
      } else {
        socket.emit("file-content-error", errPayload);
      }
    }
  });

  // ── Cleanup ──
  socket.on("disconnect", () => {
    console.log("[NexIDE] Client disconnected, cleaning up.");
    if (pkgWatcher) pkgWatcher.close();
    if (projectWatcher) projectWatcher.close();
    if (ptyProcess) ptyProcess.kill();
  });
});
