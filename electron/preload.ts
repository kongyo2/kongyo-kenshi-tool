import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ElectronApi, LoadProgress } from '../src/shared/ipc.ts';

const electronApi = {
  copyModMarkdown: async (input) =>
    ipcRenderer.invoke('mods:copy-markdown', input),
  exportModMarkdown: async (input) =>
    ipcRenderer.invoke('mods:export-markdown', input),
  getAppSettings: async () => ipcRenderer.invoke('settings:get-all'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  loadMods: async (input) => ipcRenderer.invoke('mods:load', input),
  onLoadProgress: (callback) => {
    const handler = (_event: unknown, progress: LoadProgress) => {
      callback(progress);
    };
    ipcRenderer.on('mods:load-progress', handler);
    return () => {
      ipcRenderer.removeListener('mods:load-progress', handler);
    };
  },
  pickAndSaveVanillaDataPath: async () =>
    ipcRenderer.invoke('settings:pick-and-save-vanilla-data-path'),
  pickModFiles: async () => ipcRenderer.invoke('dialog:pick-mod-files'),
  pickModFolders: async () => ipcRenderer.invoke('dialog:pick-mod-folders'),
  revealFileInFolder: async (filePath) =>
    ipcRenderer.invoke('shell:show-item-in-folder', filePath),
  saveLastTargetPaths: async (paths) =>
    ipcRenderer.invoke('settings:save-last-target-paths', paths),
  saveReferencePaths: async (paths) =>
    ipcRenderer.invoke('settings:save-reference-paths', paths),
} satisfies ElectronApi;

contextBridge.exposeInMainWorld('electronApi', electronApi);
