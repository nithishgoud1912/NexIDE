const os = require("os");
const fs = require("fs");
const path = require("path");
const pty = require("node-pty");
const { Server } = require("socket.io");
const chokidar = require("chokidar");

// Port 3001 as recommended by user instructions
const NEXT_PORT = process.env.PORT || 3000;
const io = new Server(3001, {
  cors: {
    // Only allow connections from the Next.js dev server (localhost)
    origin: [
      `http://localhost:${NEXT_PORT}`,
      `http://127.0.0.1:${NEXT_PORT}`,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const typeCache = new Map();

console.log("PTY Server started on port 3001");

/**
 * Helper to find and read type definitions for a package
 * Enhanced to handle sub-modules and better entry point detection
 */
function getPackageTypes(pkgName, projectPath) {
  const cacheKey = `${pkgName}:${projectPath}`;
  if (typeCache.has(cacheKey)) return typeCache.get(cacheKey);

  try {
    // Support sub-modules like 'next/navigation'
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
      // Try to find types for the sub-route
      // 1. Check if it's explicitly in package.json exports (simplified)
      // 2. Check if a .d.ts exists at that path in node_modules
      const potentialPath = path.join(pkgPath, subRoute + ".d.ts");
      const potentialIndexPath = path.join(pkgPath, subRoute, "index.d.ts");

      if (fs.existsSync(potentialPath)) {
        typesPath = potentialPath;
      } else if (fs.existsSync(potentialIndexPath)) {
        typesPath = potentialIndexPath;
      }
    }

    if (!typesPath) {
      // Fallback to main types
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
    console.warn(
      `[PTY Server] Failed to resolve types for ${pkgName}:`,
      e.message,
    );
  }
  typeCache.set(cacheKey, null);
  return null;
}

/**
 * Universally syncs all types found in package.json dependencies
 * Dynamically discovers sub-module types (e.g., next/navigation, lucide-react/dist/...)
 */
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
    console.log(
      `[PTY Server] Universal type sync: Scanning ${packages.length} packages in ${nodeModulesPath}...`,
    );

    if (!fs.existsSync(nodeModulesPath)) {
      console.warn(
        `[PTY Server] node_modules folder NOT FOUND at ${nodeModulesPath}. Types will NOT be synced.`,
      );
      return;
    }

    packages.forEach((pkgName) => {
      const pkgPath = path.join(projectPath, "node_modules", pkgName);
      if (!fs.existsSync(pkgPath)) return;

      // Only get the main types for the package to avoid massive recursive scanning
      const typeDef = getPackageTypes(pkgName, projectPath);
      if (typeDef) {
        socket.emit("type-definition", typeDef);
      }
    });
  } catch (e) {
    console.error("[PTY Server] Error during universal type sync:", e);
  }
}

/**
 * Watch local src folder for changes and stream to frontend
 * Includes a "Warm Boot" to send all current files on connection
 */
function setupProjectSync(socket, projectPath) {
  console.log(`[PTY Server] Starting project sync for ${projectPath}`);

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

  // 1. Warm Boot
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
    console.log(`[PTY Server] Warm Boot complete: Synced ${syncCount} files.`);
  } catch (e) {
    console.error("[PTY Server] Warm Boot failed:", e);
  }

  // 2. Watcher with Debounce for performance
  const watcher = chokidar.watch(projectPath, {
    persistent: true,
    ignoreInitial: true,
    ignored: (path) => shouldIgnore(path),
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  watcher.on("all", (event, filePath) => {
    if (event === "unlink" || event === "unlinkDir") return; // Handle deletions if needed
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

io.on("connection", (socket) => {
  console.log("Client connected to PTY");

  let projectWatcher = null;
  let pkgWatcher = null;
  let ptyProcess = null;
  let currentProjectPath = process.cwd();

  const startProjectServices = (projectPath) => {
    console.log(`[PTY Server] Starting services for: ${projectPath}`);
    currentProjectPath = projectPath;

    // Clean up old watchers
    if (projectWatcher) projectWatcher.close();
    if (pkgWatcher) pkgWatcher.close();

    // 1. Initial Type Sync
    syncAllProjectTypes(socket, projectPath);

    // 2. Start File Sync
    projectWatcher = setupProjectSync(socket, projectPath);

    // 3. Watch package.json
    const pkgJsonPath = path.join(projectPath, "package.json");
    console.log(`[PTY Server] Checking for package.json at: ${pkgJsonPath}`);
    if (fs.existsSync(pkgJsonPath)) {
      console.log(`[PTY Server] Found package.json. Setting up watcher.`);
      pkgWatcher = chokidar.watch(pkgJsonPath).on("change", () => {
        console.log("[PTY Server] package.json changed, resyncing types...");
        syncAllProjectTypes(socket, projectPath);
      });
    } else {
      console.warn(
        `[PTY Server] No package.json found in ${projectPath}. Type sync skipped.`,
      );
    }
  };

  // We'll call startProjectServices when the user actually opens a path
  // or when we find it. Defaulting to nothing initially to avoid the "my-web-ide" start.

  const setupPty = (cwd) => {
    if (ptyProcess) {
      console.log(
        `[PTY Server] PTY already active. Cleaning up before restart in: ${cwd}`,
      );
      ptyProcess.kill();
    }

    console.log(`[PTY Server] Spawning shell in: ${cwd}`);
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

  // Initially, we DON'T setup the PTY immediately.
  // We wait for the client to tell us where the project is.
  // This prevents starting in 'my-web-ide' and then jumping.

  socket.on("input", (data) => {
    if (!ptyProcess) {
      console.log(
        "[PTY Server] Input received but no PTY active. Spawning in default path.",
      );
      setupPty(process.cwd());
    }
    ptyProcess.write(data);
  });

  socket.on("resize", ({ cols, rows }) => {
    if (ptyProcess) {
      try {
        ptyProcess.resize(cols, rows);
      } catch (e) {}
    }
  });

  socket.on("open-project-path", (absolutePath) => {
    console.log(`[PTY Server] Directly opening: ${absolutePath}`);
    if (fs.existsSync(absolutePath)) {
      startProjectServices(absolutePath);
      // If PTY not started or started in wrong place, (re)spawn it correctly
      setupPty(absolutePath);
      socket.emit("root-path", absolutePath);
    } else {
      socket.emit("error", `Project path does not exist: ${absolutePath}`);
    }
  });

  socket.on("chdir", (newPath) => {
    console.log(`[PTY Server] Manually changing directory to: ${newPath}`);
    startProjectServices(newPath);
    setupPty(newPath);
    socket.emit("root-path", newPath);
  });

  socket.on("find-project", (folderName) => {
    console.log(`[PTY Server] Searching for project: ${folderName}`);
    const home = os.homedir();

    // 1. Build an intelligent search queue
    // Priority 1: Current directory and its parents (siblings of the project)
    const contextRoots = [];
    let curr = process.cwd();
    // Go up 4 levels from server location to check for sibling projects
    for (let i = 0; i < 4; i++) {
      contextRoots.push(curr);
      // Also check if current directory IS the project
      if (path.basename(curr) === folderName) {
        console.log(`[PTY Server] Current directory is the project: ${curr}`);
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

    // Priority 2: Common Windows/Shared locations
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
          console.log(`[PTY Server] Located project at: ${potential}`);
          socket.emit("project-located", potential);
          socket.emit("root-path", potential);

          startProjectServices(potential);
          setupPty(potential);
          return;
        }
      } catch (e) {}
    }
    console.warn(
      `[PTY Server] Could not find project "${folderName}" in:`,
      allRoots,
    );
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

  socket.on("disconnect", () => {
    console.log("Client disconnected, cleaning up");
    if (pkgWatcher) pkgWatcher.close();
    if (projectWatcher) projectWatcher.close();
    if (ptyProcess) ptyProcess.kill();
  });
});
