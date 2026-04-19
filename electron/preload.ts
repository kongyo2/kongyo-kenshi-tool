import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ElectronApi } from '../src/shared/ipc.ts';

const electronApi = {
  exportModMarkdown: async (input) =>
    ipcRenderer.invoke('mods:export-markdown', input),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  loadMods: async (input) => ipcRenderer.invoke('mods:load', input),
  pickModFiles: async () => ipcRenderer.invoke('dialog:pick-mod-files'),
  pickModFolders: async () => ipcRenderer.invoke('dialog:pick-mod-folders'),
  revealFileInFolder: async (filePath) =>
    ipcRenderer.invoke('shell:show-item-in-folder', filePath),
} satisfies ElectronApi;

contextBridge.exposeInMainWorld('electronApi', electronApi);
