import { WebContainer } from "@webcontainer/api";

let webcontainerInstance: WebContainer | null = null;

export const getWebContainerInstance = async () => {
  if (!webcontainerInstance) {
    webcontainerInstance = await WebContainer.boot();
  }
  return webcontainerInstance;
};
