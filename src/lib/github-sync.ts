import { Octokit } from "@octokit/rest";
import { WebContainer } from "@webcontainer/api";

interface PushOptions {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
  message?: string;
  webcontainerInstance: WebContainer;
}

/**
 * Browser-safe Uint8Array → base64 string conversion.
 * Avoids using Node.js Buffer which is not available in the browser.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Detect the default branch of a repository.
 */
async function getDefaultBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<string> {
  try {
    const { data } = await octokit.repos.get({ owner, repo });
    return data.default_branch || "main";
  } catch (e) {
    console.warn("[github-sync] Could not detect default branch, using 'main'");
    return "main";
  }
}

/**
 * Pushes all changes from WebContainer to GitHub.
 * Uses the Git Database API to create a commit with the new tree.
 */
export async function pushToGitHub({
  token,
  owner,
  repo,
  branch,
  message = "Update from NexIDE",
  webcontainerInstance,
}: PushOptions) {
  const octokit = new Octokit({ auth: token });

  // Auto-detect default branch if not provided
  const targetBranch = branch || (await getDefaultBranch(octokit, owner, repo));

  // 1. Get the latest commit SHA of the branch
  let baseTreeSha: string | undefined;
  let parentCommitSha: string | undefined;

  try {
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${targetBranch}`,
    });
    parentCommitSha = refData.object.sha;

    const { data: commitData } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: parentCommitSha,
    });
    baseTreeSha = commitData.tree.sha;
  } catch (e) {
    console.warn("[github-sync] Could not fetch base tree/commit:", e);
  }

  // 2. Recursively read all files from WebContainer
  const files: {
    path: string;
    content: Uint8Array;
    mode: "100644" | "100755" | "040000";
  }[] = [];

  async function readFiles(currentPath: string) {
    const entries = await webcontainerInstance.fs.readdir(currentPath || "/", {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;

      const entryPath = currentPath
        ? `${currentPath}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        await readFiles(entryPath);
      } else {
        const content = await webcontainerInstance.fs.readFile(entryPath);
        files.push({ path: entryPath, content, mode: "100644" });
      }
    }
  }

  await readFiles("");

  // 3. Create Blobs for all files (browser-safe encoding)
  const treeItems: {
    path: string;
    mode: "100644" | "100755" | "040000";
    type: "blob";
    sha: string;
  }[] = [];

  for (const file of files) {
    let contentStr: string;
    let encoding: "utf-8" | "base64" = "utf-8";

    try {
      // Try to decode as UTF-8 text first (strict mode throws on invalid bytes)
      contentStr = new TextDecoder("utf-8", { fatal: true }).decode(
        file.content,
      );
      encoding = "utf-8";
    } catch {
      // Binary file: use browser-safe base64 (no Node.js Buffer needed)
      contentStr = uint8ArrayToBase64(file.content);
      encoding = "base64";
    }

    try {
      const { data: blobData } = await octokit.git.createBlob({
        owner,
        repo,
        content: contentStr,
        encoding,
      });

      treeItems.push({
        path: file.path,
        mode: file.mode,
        type: "blob",
        sha: blobData.sha,
      });
    } catch (e) {
      console.warn(`[github-sync] Failed to create blob for ${file.path}:`, e);
    }
  }

  if (treeItems.length === 0) {
    throw new Error("No files to push.");
  }

  // 4. Create a new Tree
  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  // 5. Create Commit
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: parentCommitSha ? [parentCommitSha] : [],
  });

  // 6. Update Reference (push)
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${targetBranch}`,
    sha: newCommit.sha,
  });

  return newCommit;
}
