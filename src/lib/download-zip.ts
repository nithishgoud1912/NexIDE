import JSZip from "jszip";
import { WebContainer } from "@webcontainer/api";

/**
 * Downloads the current WebContainer file system as a ZIP file.
 * Skips node_modules and .git folders.
 */
export async function downloadWebContainerAsZip(
  webcontainerInstance: WebContainer,
  repoName: string = "project",
) {
  const zip = new JSZip();

  async function addToZip(currentPath: string, zipFolder: JSZip) {
    const entries = await webcontainerInstance.fs.readdir(currentPath || "/", {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const entryPath = currentPath
        ? `${currentPath}/${entry.name}`
        : entry.name;

      if (entry.name === "node_modules" || entry.name === ".git") continue;

      if (entry.isDirectory()) {
        const newFolder = zipFolder.folder(entry.name);
        if (newFolder) {
          await addToZip(entryPath, newFolder);
        }
      } else {
        const content = await webcontainerInstance.fs.readFile(entryPath);
        zipFolder.file(entry.name, content);
      }
    }
  }

  await addToZip("", zip);

  const blob = await zip.generateAsync({ type: "blob" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${repoName}-latest.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
