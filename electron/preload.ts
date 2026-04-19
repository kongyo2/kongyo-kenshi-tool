import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ElectronApi } from '../src/shared/ipc.ts';

const electronApi = {
  exportModMarkdown: async (input) =>
    ipcRenderer.invoke('mods:export-markdown', input),
  exportTranslationJson: async (input) =>
    ipcRenderer.invoke('translation:export-json', input),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  importTranslationJson: async () =>
    ipcRenderer.invoke('translation:import-json'),
  loadMods: async (input) => ipcRenderer.invoke('mods:load', input),
  pickModFiles: async () => ipcRenderer.invoke('dialog:pick-mod-files'),
  pickModFolders: async () => ipcRenderer.invoke('dialog:pick-mod-folders'),
  revealFileInFolder: async (filePath) =>
    ipcRenderer.invoke('shell:show-item-in-folder', filePath),
  saveTranslationMod: async (input) =>
    ipcRenderer.invoke('mods:save-translation-mod', input),
} satisfies ElectronApi;

contextBridge.exposeInMainWorld('electronApi', electronApi);
