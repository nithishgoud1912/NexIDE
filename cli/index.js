#!/usr/bin/env node

const os = require("os");
const fs = require("fs");
const path = require("path");
const pty = require("node-pty");
const { Server } = require("socket.io");
const chokidar = require("chokidar");
const open = require("open");

// Port 3001 as recommended by user instructions
const NEXT_PORT = process.env.PORT || 3000;
const io = new Server(3001, {
  cors: {
    origin: ["http://localhost:3000", "https://nexide.onrender.com"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const typeCache = new Map();

console.log(`
\x1b[36m=========================================================\x1b[0m
\x1b[32m  NexIDE Local Agent Started (Port 3001)\x1b[0m
\x1b[36m=========================================================\x1b[0m
`);

setTimeout(() => {
  const url = "https://nexide.onrender.com";
  console.log(`\n\x1b[33m🚀 Opening NexIDE in your browser: ${url}\x1b[0m`);
  console.log(
    `\x1b[90m(Keep this terminal window open while you code!)\x1b[0m\n`,
  );
  open(url);
}, 1000);

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
      } catch (e) {}
    });
  } catch (e) {}

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

io.on("connection", (socket) => {
  let projectWatcher = null;
  let pkgWatcher = null;
  let ptyProcess = null;
  let currentProjectPath = process.cwd();

  const startProjectServices = (projectPath) => {
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

  socket.on("request-types", (packages) => {
    packages.forEach((pkgName) => {
      const typeDef = getPackageTypes(pkgName, currentProjectPath);
      if (typeDef) {
        socket.emit("type-definition", typeDef);
      }
    });
  });

  socket.on("disconnect", () => {
    if (pkgWatcher) pkgWatcher.close();
    if (projectWatcher) projectWatcher.close();
    if (ptyProcess) ptyProcess.kill();
  });
});
