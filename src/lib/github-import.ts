import JSZip from "jszip";
import { FileSystemTree } from "@webcontainer/api";

/**
 * Fetches a repository as a ZIP blob from GitHub using the API.
 * This automatically uses the default branch if no ref is specified.
 */
export async function fetchRepoZip(
  repoFullName: string,
  token: string,
  branch?: string,
): Promise<Blob> {
  const params = new URLSearchParams();
  params.set("repo", repoFullName);
  if (branch) params.set("branch", branch);

  const url = `/api/github/download?${params.toString()}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    // Try to parse error as JSON
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(
        `Failed to fetch repository zip: ${errorJson.error || response.statusText}`,
      );
    } catch {
      throw new Error(
        `Failed to fetch repository zip (${response.status}): ${errorText || response.statusText}`,
      );
    }
  }

  return await response.blob();
}

/**
 * Converts a GitHub Repo ZIP Blob into a WebContainer FileSystemTree
 */
export async function transformZipToTree(blob: Blob): Promise<FileSystemTree> {
  const zip = await JSZip.loadAsync(blob);
  const tree: FileSystemTree = {};

  // Get the name of the root folder GitHub adds (the first entry)
  // GitHub zips always have a top-level folder like `owner-repo-sha/`
  const rootDirName = Object.keys(zip.files)[0].split("/")[0];
  const rootFolderPath = `${rootDirName}/`;

  for (const [path, file] of Object.entries(zip.files)) {
    // Skip the root folder entry itself and any directories
    if (file.dir || path === rootFolderPath) continue;

    // Remove the 'root-folder/' prefix from the path
    const relativePath = path.replace(rootFolderPath, "");
    if (!relativePath) continue;

    // Always read as Uint8Array to ensure binary fidelity and avoid encoding issues
    // WebContainer and our Editor handle Uint8Array correctly
    const content = await file.async("uint8array");

    // Split path to build nested folders in the tree
    const parts = relativePath.split("/");
    let current: any = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // It's a file
        current[part] = {
          file: { contents: content },
        };
      } else {
        // It's a directory
        if (!current[part]) {
          current[part] = { directory: {} };
        }
        current = current[part].directory;
      }
    }
  }

  return tree;
}
