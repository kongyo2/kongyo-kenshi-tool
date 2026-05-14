import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appSettingsSchema, type AppSettings } from '../src/shared/ipc.ts';

const defaultSettings: AppSettings = {
  lastTargetPaths: [],
  referencePaths: [],
  vanillaDataPath: null,
};

const getSettingsFilePath = () =>
  path.join(app.getPath('userData'), 'settings.json');

export const loadAppSettings = async (): Promise<AppSettings> => {
  try {
    const raw = await readFile(getSettingsFilePath(), 'utf-8');
    return appSettingsSchema.parse(JSON.parse(raw));
  } catch {
    return defaultSettings;
  }
};

export const saveAppSettings = async (
  patch: Partial<AppSettings>,
): Promise<AppSettings> => {
  const current = await loadAppSettings();
  const merged = appSettingsSchema.parse({ ...current, ...patch });
  const filePath = getSettingsFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
};
