import { contextBridge, ipcRenderer, webUtils } from "electron";

import type { ElectronApi, LoadProgress } from "../src/shared/ipc.ts";

const electronApi = {
  closeProject: async (projectId) => ipcRenderer.invoke("mods:close", projectId),
  copyModMarkdown: async (input) => ipcRenderer.invoke("mods:copy-markdown", input),
  detectVanillaDataPath: async () => ipcRenderer.invoke("kenshi:detect-vanilla-data-path"),
  exportModMarkdown: async (input) => ipcRenderer.invoke("mods:export-markdown", input),
  getAppSettings: async () => ipcRenderer.invoke("settings:get-all"),
  getContextRecords: async (projectId) => ipcRenderer.invoke("mods:get-context-records", projectId),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  loadMods: async (input) => ipcRenderer.invoke("mods:load", input),
  measureModMarkdown: async (input) => ipcRenderer.invoke("mods:measure-markdown", input),
  onLoadProgress: (callback) => {
    const handler = (_event: unknown, progress: LoadProgress) => {
      callback(progress);
    };
    ipcRenderer.on("mods:load-progress", handler);
    return () => {
      ipcRenderer.removeListener("mods:load-progress", handler);
    };
  },
  pickAndSaveVanillaDataPath: async () =>
    ipcRenderer.invoke("settings:pick-and-save-vanilla-data-path"),
  pickModFiles: async () => ipcRenderer.invoke("dialog:pick-mod-files"),
  pickModFolders: async () => ipcRenderer.invoke("dialog:pick-mod-folders"),
  resolveEnabledMods: async () => ipcRenderer.invoke("kenshi:resolve-enabled-mods"),
  revealFileInFolder: async (filePath) => ipcRenderer.invoke("shell:show-item-in-folder", filePath),
  saveExportOptions: async (options) => ipcRenderer.invoke("settings:save-export-options", options),
  saveLastTargetPaths: async (paths) =>
    ipcRenderer.invoke("settings:save-last-target-paths", paths),
  saveReferencePaths: async (paths) => ipcRenderer.invoke("settings:save-reference-paths", paths),
  saveVanillaDataPath: async (dataPath) =>
    ipcRenderer.invoke("settings:save-vanilla-data-path", dataPath),
} satisfies ElectronApi;

contextBridge.exposeInMainWorld("electronApi", electronApi);
