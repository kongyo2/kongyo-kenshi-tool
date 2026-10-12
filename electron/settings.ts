import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

import { appSettingsSchema, type AppSettings } from "../src/shared/ipc.ts";

const getSettingsFilePath = () => path.join(app.getPath("userData"), "settings.json");

let cachedSettings: AppSettings | null = null;
// 書き込みを直列化する。同時に保存されると片方の変更が失われるため。
let writeQueue: Promise<unknown> = Promise.resolve();

const readSettingsFile = async (): Promise<AppSettings> => {
  try {
    const raw = await readFile(getSettingsFilePath(), "utf-8");
    const parsed = appSettingsSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return parsed.data;
    }
    // 一部の項目だけ壊れている場合は、読める項目を残して既定値で補う
    const partial = JSON.parse(raw) as Record<string, unknown>;
    const recovered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(partial)) {
      const field = appSettingsSchema.shape[key as keyof AppSettings];
      if (field && field.safeParse(value).success) {
        recovered[key] = value;
      }
    }
    return appSettingsSchema.parse(recovered);
  } catch {
    return appSettingsSchema.parse({});
  }
};

export const loadAppSettings = async (): Promise<AppSettings> => {
  cachedSettings ??= await readSettingsFile();
  return cachedSettings;
};

export const saveAppSettings = (patch: Partial<AppSettings>): Promise<AppSettings> => {
  const task = writeQueue.then(async () => {
    const current = await loadAppSettings();
    const merged = appSettingsSchema.parse({ ...current, ...patch });
    const filePath = getSettingsFilePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    // 書き込み途中で終了しても設定が壊れないよう、一時ファイルに書いてから置き換える
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(merged, null, 2), "utf-8");
    await rename(temporaryPath, filePath);
    cachedSettings = merged;
    return merged;
  });
  writeQueue = task.catch(() => undefined);
  return task;
};
