/**
 * Unified Production Server for NexIDE
 *
 * Serves both Next.js and the PTY/Socket.IO terminal on a SINGLE port.
 * This is required for platforms like Render that expose only one port.
 *
 * Usage:  node server.js
 * Port:   process.env.PORT || 3000
 */

const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { parse } = require("url");
const next = require("next");
const { Server: SocketIOServer } = require("socket.io");

// ---------------------------------------------------------------------------
// 1. Next.js Setup
// ---------------------------------------------------------------------------
const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ---------------------------------------------------------------------------
// 2. Lazy-load node-pty (it's a native module; may not exist in all envs)
// ---------------------------------------------------------------------------
let pty;
try {
  pty = require("node-pty");
} catch (e) {
  console.warn(
    "[Server] node-pty not available — terminal features will be disabled.",
    e.message,
  );
}

// ---------------------------------------------------------------------------
// 3. PTY helper functions (ported from pty-server.js)
// ---------------------------------------------------------------------------
const chokidar = require("chokidar");

const typeCache = new Map();

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
    console.warn(`[Server] Failed to resolve types for ${pkgName}:`, e.message);
  }
  typeCache.set(cacheKey, null);
  return null;
}

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
  } catch (e) {
    console.error("[Server] Error during universal type sync:", e);
  }
}

function setupProjectSync(socket, projectPath) {
  const ignoredDirs = [
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".vscode",
    "tmp",
  ];

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
        const fullPath = path.join(dir, file);
        if (fs.lstatSync(fullPath).isDirectory()) {
          getAllFiles(fullPath, allFiles);
        } else {
          allFiles.push(fullPath);
        }
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
    console.log(`[Server] Warm Boot complete: Synced ${syncCount} files.`);
  } catch (e) {
    console.error("[Server] Warm Boot failed:", e);
  }

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
      if (fs.lstatSync(filePath).isDirectory()) return;

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

// ---------------------------------------------------------------------------
// 4. Boot
// ---------------------------------------------------------------------------
app.prepare().then(() => {
  // Create a raw HTTP server
  const server = http.createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Attach Socket.IO to the SAME server
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*", // In production the client connects to the same origin
      methods: ["GET", "POST"],
      credentials: true,
    },
    path: "/socket.io/", // default path
  });

  // ---------------------------------------------------------------------------
  // 5. Socket.IO Connection Handler (PTY logic)
  // ---------------------------------------------------------------------------
  io.on("connection", (socket) => {
    console.log("[Server] Client connected via Socket.IO");

    let projectWatcher = null;
    let pkgWatcher = null;
    let ptyProcess = null;
    let currentProjectPath = process.cwd();

    const startProjectServices = (projectPath) => {
      console.log(`[Server] Starting services for: ${projectPath}`);
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
      if (!pty) {
        socket.emit(
          "output",
          "\r\n\x1b[31m[Error] Terminal not available — node-pty is not installed.\x1b[0m\r\n",
        );
        return;
      }

      if (ptyProcess) {
        ptyProcess.kill();
      }

      console.log(`[Server] Spawning shell in: ${cwd}`);
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

    socket.on("open-project-path", (absolutePath) => {
      console.log(`[Server] Directly opening: ${absolutePath}`);
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
      console.log(`[Server] Searching for project: ${folderName}`);
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
          if (
            fs.existsSync(potential) &&
            fs.lstatSync(potential).isDirectory()
          ) {
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

    socket.on("request-types", (packages) => {
      packages.forEach((pkgName) => {
        const typeDef = getPackageTypes(pkgName, currentProjectPath);
        if (typeDef) {
          socket.emit("type-definition", typeDef);
        }
      });
    });

    /**
     * On-demand file reader: serves ANY file from the host filesystem.
     * This handles node_modules files — the warm boot and watcher skip
     * node_modules for performance, but when the user navigates into a
     * dependency (Go to Definition), the frontend requests the file here.
     */
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

        if (stat.size > 2 * 1024 * 1024) {
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
        const payload = { path: requestedPath, content, isDirectory: false };

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

    socket.on("disconnect", () => {
      console.log("[Server] Client disconnected, cleaning up");
      if (pkgWatcher) pkgWatcher.close();
      if (projectWatcher) projectWatcher.close();
      if (ptyProcess) ptyProcess.kill();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Start listening
  // ---------------------------------------------------------------------------
  server.listen(port, hostname, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║              NexIDE Server Ready                 ║
╠══════════════════════════════════════════════════╣
║  Next.js    →  http://${hostname}:${port}              ║
║  Socket.IO  →  same port (unified)               ║
║  Mode       →  ${dev ? "development" : "production "}                      ║
╚══════════════════════════════════════════════════╝
    `);
  });
});
