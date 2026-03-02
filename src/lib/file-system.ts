import { FileSystemTree, WebContainer } from "@webcontainer/api";

/**
 * Recursively reads a directory handle and returns a WebContainer FileSystemTree
 */
export async function getFileSystemTree(
  directoryHandle: FileSystemDirectoryHandle,
): Promise<FileSystemTree> {
  const tree: FileSystemTree = {};

  for await (const [name, handle] of directoryHandle.entries()) {
    if (
      name === "node_modules" ||
      name === ".git" ||
      name === ".next" ||
      name === "dist" ||
      name === "build" ||
      name === ".vscode"
    ) {
      continue;
    }

    if (handle.kind === "directory") {
      tree[name] = {
        directory: await getFileSystemTree(handle as FileSystemDirectoryHandle),
      };
    } else if (handle.kind === "file") {
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile(); // This might still be slow for large files

      const isBinary =
        /.(jpe?g|png|gif|webp|ico|svg|pdf|zip|rar|tar|gz|mp4|mp3|woff2?|ttf|otf|eot)$/i.test(
          name,
        );

      let contents: string | Uint8Array;
      if (isBinary) {
        const buffer = await file.arrayBuffer();
        contents = new Uint8Array(buffer);
      } else {
        contents = await file.text();
      }

      tree[name] = {
        file: {
          contents,
        },
      };
    }
  }

  return tree;
}

/**
 * Open a directory picker and return the handle and the tree
 */
export async function openLocalFolder() {
  if (typeof window === "undefined" || !window.showDirectoryPicker) {
    throw new Error("File System Access API is not supported in this browser.");
  }

  const handle = await window.showDirectoryPicker({
    mode: "readwrite",
  });

  const tree = await getFileSystemTree(handle);
  return { handle, tree };
}

/**
 * Save file content back to the local file system
 */
export async function saveFileLocally(
  rootHandle: FileSystemDirectoryHandle,
  path: string,
  content: string | Uint8Array,
) {
  try {
    const parts = path.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) return;

    let currentDir = rootHandle;

    // Navigate to the correct directory
    for (const part of parts) {
      currentDir = await currentDir.getDirectoryHandle(part, { create: true });
    }

    // Get the file handle and write
    const fileHandle = await currentDir.getFileHandle(fileName, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  } catch (err) {
    console.error("Failed to save file locally:", err);
    throw err;
  }
}

/**
 * Recursively reads a WebContainer's file system structure
 * Note: Does not read file contents to keep it fast
 */
export async function getWebContainerTree(
  instance: WebContainer,
  path: string = ".",
): Promise<FileSystemTree> {
  const tree: FileSystemTree = {};
  const entries = await instance.fs.readdir(path, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path === "." ? entry.name : `${path}/${entry.name}`;
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === ".git"
      ) {
        tree[entry.name] = { directory: {} };
        continue;
      }
      tree[entry.name] = {
        directory: await getWebContainerTree(instance, entryPath),
      };
    } else {
      tree[entry.name] = {
        file: {
          contents: "", // Placeholder, fetch on demand
        },
      };
    }
  }

  return tree;
}
/**
 * Delete a file or directory from the local file system
 */
export async function deleteEntryLocally(
  rootHandle: FileSystemDirectoryHandle,
  path: string,
) {
  try {
    const parts = path.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) return;

    let currentDir = rootHandle;

    // Navigate to the correct directory
    for (const part of parts) {
      // We only get handle, we don't create if missing for deletion
      try {
        currentDir = await currentDir.getDirectoryHandle(part);
      } catch (e) {
        // Path doesn't exist, nothing to delete
        return;
      }
    }

    // Remove the entry (file or directory)
    // recursive: true is ignored for files but needed for directories
    await currentDir.removeEntry(fileName, { recursive: true });
  } catch (err) {
    console.error("Failed to delete locally:", err);
    throw err;
  }
}

/**
 * Rename a file or directory on the local file system
 */
export async function renameEntryLocally(
  rootHandle: FileSystemDirectoryHandle,
  oldPath: string,
  newPath: string,
) {
  try {
    const oldParts = oldPath.split("/").filter(Boolean);
    const oldName = oldParts.pop();
    if (!oldName) return;

    const newParts = newPath.split("/").filter(Boolean);
    const newName = newParts.pop();
    if (!newName) return;

    let currentDir = rootHandle;
    for (const part of oldParts) {
      currentDir = await currentDir.getDirectoryHandle(part);
    }

    // Get the handle for the item to rename
    let handle;
    try {
      handle = await currentDir.getFileHandle(oldName);
    } catch (e) {
      handle = await currentDir.getDirectoryHandle(oldName);
    }

    if (handle) {
      // @ts-ignore - 'move' is supported in modern browsers but maybe not in TS types yet
      if (typeof handle.move === "function") {
        // @ts-ignore
        await handle.move(newName);
      } else {
        // Fallback: This is complex for directories, for now we log
        console.warn("handle.move not supported on this browser.");
      }
    }
  } catch (err) {
    console.error("Failed to rename locally:", err);
    throw err;
  }
}

/**
 * Recursively writes a FileSystemTree to a local DirectoryHandle
 */
export async function mountTreeLocally(
  handle: FileSystemDirectoryHandle,
  tree: FileSystemTree,
) {
  for (const [name, entry] of Object.entries(tree)) {
    if ("directory" in entry) {
      const dirHandle = await handle.getDirectoryHandle(name, { create: true });
      await mountTreeLocally(dirHandle, entry.directory);
    } else if ("file" in entry && "contents" in entry.file) {
      const fileHandle = await handle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(entry.file.contents);
      await writable.close();
    }
  }
}
