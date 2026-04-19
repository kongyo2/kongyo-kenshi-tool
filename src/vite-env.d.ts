import type { ElectronApi } from './shared/ipc.ts';

declare global {
  interface Window {
    electronApi: ElectronApi;
  }
}

export {};
