import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronApi } from '../src/shared/ipc.ts';

const electronApi = {
  loadMods: async (input) => ipcRenderer.invoke('mods:load', input),
  pickModFiles: async () => ipcRenderer.invoke('dialog:pick-mod-files'),
  pickModFolders: async () => ipcRenderer.invoke('dialog:pick-mod-folders'),
  revealFileInFolder: async (filePath) =>
    ipcRenderer.invoke('shell:show-item-in-folder', filePath),
  saveTranslationMod: async (input) =>
    ipcRenderer.invoke('mods:save-translation-mod', input),
} satisfies ElectronApi;

contextBridge.exposeInMainWorld('electronApi', electronApi);

