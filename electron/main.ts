import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exportModMarkdownRequestSchema,
  exportModMarkdownResponseSchema,
  exportTranslationJsonRequestSchema,
  exportTranslationJsonResponseSchema,
  importTranslationJsonResponseSchema,
  loadModsRequestSchema,
  saveTranslationModRequestSchema,
  saveTranslationModResponseSchema,
  type LoadModsRequest,
} from '../src/shared/ipc.ts';
import {
  createTranslationModBuffer,
  parseMod,
} from '../src/shared/mod-format.ts';
import { renderProjectMarkdown } from '../src/shared/mod-markdown.ts';
import type {
  InspectorRecord,
  LoadedMod,
  TranslationRecord,
} from '../src/shared/models.ts';

const electronRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(electronRoot, '..');
const rendererDist = path.join(appRoot, 'dist');
const preloadPath = path.join(electronRoot, 'preload.mjs');
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

const createWindow = async () => {
  const mainWindow = new BrowserWindow({
    width: 1520,
    height: 1000,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#0f0b09',
    show: false,
    title: 'Kenshiツール',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(rendererDist, 'index.html'));
  }
};

const collectModPathsFromDirectory = async (directoryPath: string) => {
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const sortedEntries = [...entries].sort((left, right) =>
    left.name.localeCompare(right.name, 'ja'),
  );
  const collectedPaths: string[] = [];

  for (const entry of sortedEntries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nestedPaths = await collectModPathsFromDirectory(fullPath);
      collectedPaths.push(...nestedPaths);
      continue;
    }

    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.mod') {
      collectedPaths.push(fullPath);
    }
  }

  return collectedPaths;
};

const uniquePreserveOrder = (items: string[]) => {
  const uniqueItems: string[] = [];
  const visitedItems = new Set<string>();

  for (const item of items) {
    if (visitedItems.has(item)) {
      continue;
    }

    visitedItems.add(item);
    uniqueItems.push(item);
  }

  return uniqueItems;
};

const collectModPaths = async (pathsToScan: string[]) => {
  const collectedPaths: string[] = [];

  for (const currentPath of pathsToScan) {
    const stats = await lstat(currentPath);
    if (stats.isDirectory()) {
      const nestedPaths = await collectModPathsFromDirectory(currentPath);
      collectedPaths.push(...nestedPaths);
      continue;
    }

    if (stats.isFile() && path.extname(currentPath).toLowerCase() === '.mod') {
      collectedPaths.push(currentPath);
    }
  }

  return uniquePreserveOrder(collectedPaths);
};

const parseProject = async (input: LoadModsRequest) => {
  const modPaths = await collectModPaths(input.paths);

  if (modPaths.length === 0) {
    throw new Error('modファイルが見つかりませんでした。');
  }

  const dependencies: string[] = [];
  const records: TranslationRecord[] = [];
  const inspectorRecords: InspectorRecord[] = [];
  const mods: LoadedMod[] = [];

  for (const modPath of modPaths) {
    const fileBuffer = await readFile(modPath);
    const modName = path.basename(modPath, '.mod');
    const parsed = parseMod(fileBuffer, modName, modPath);

    dependencies.push(modName);
    records.push(...parsed.translationRecords);
    inspectorRecords.push(...parsed.inspectorRecords);
    mods.push({
      fileName: path.basename(modPath),
      filePath: modPath,
      header: parsed.header,
      recordCount: parsed.inspectorRecords.length,
    });
  }

  const uniqueDependencies = uniquePreserveOrder(dependencies);

  return {
    dependencies: uniqueDependencies,
    inspectorRecords,
    mods,
    records,
    sourceModName: uniqueDependencies[0] ?? 'unknown',
  };
};

const registerIpc = () => {
  ipcMain.handle('dialog:pick-mod-files', async () => {
    const result = await dialog.showOpenDialog({
      filters: [
        {
          extensions: ['mod'],
          name: 'Kenshi modファイル',
        },
      ],
      properties: ['openFile', 'multiSelections'],
      title: 'modファイルを選択',
    });

    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:pick-mod-folders', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'multiSelections'],
      title: 'modを含むフォルダを選択',
    });

    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('mods:load', async (_event, rawInput) => {
    const input = loadModsRequestSchema.parse(rawInput);
    return parseProject(input);
  });

  ipcMain.handle('mods:save-translation-mod', async (_event, rawInput) => {
    const input = saveTranslationModRequestSchema.parse(rawInput);
    const defaultPath = path.join(
      app.getPath('downloads'),
      `${input.project.sourceModName}_translate.mod`,
    );
    const dialogResult = await dialog.showSaveDialog({
      defaultPath,
      filters: [
        {
          extensions: ['mod'],
          name: '翻訳modファイル',
        },
      ],
      title: '翻訳modの保存先を選択',
    });

    if (dialogResult.canceled || !dialogResult.filePath) {
      return saveTranslationModResponseSchema.parse({
        canceled: true,
        filePath: null,
      });
    }

    const buffer = createTranslationModBuffer(input.project);
    await writeFile(dialogResult.filePath, Buffer.from(buffer));

    return saveTranslationModResponseSchema.parse({
      canceled: false,
      filePath: dialogResult.filePath,
    });
  });

  ipcMain.handle(
    'translation:export-json',
    async (_event, rawInput) => {
      const input = exportTranslationJsonRequestSchema.parse(rawInput);
      const defaultPath = path.join(
        app.getPath('downloads'),
        input.fileName,
      );
      const dialogResult = await dialog.showSaveDialog({
        defaultPath,
        filters: [
          {
            extensions: ['json'],
            name: '翻訳プロジェクト',
          },
        ],
        title: '翻訳プロジェクトをエクスポート',
      });

      if (dialogResult.canceled || !dialogResult.filePath) {
        return exportTranslationJsonResponseSchema.parse({
          canceled: true,
          filePath: null,
        });
      }

      await writeFile(dialogResult.filePath, input.payload, 'utf-8');

      return exportTranslationJsonResponseSchema.parse({
        canceled: false,
        filePath: dialogResult.filePath,
      });
    },
  );

  ipcMain.handle('mods:export-markdown', async (_event, rawInput) => {
    const input = exportModMarkdownRequestSchema.parse(rawInput);
    const defaultPath = path.join(
      app.getPath('downloads'),
      `${input.project.sourceModName}_mod_data.md`,
    );
    const dialogResult = await dialog.showSaveDialog({
      defaultPath,
      filters: [
        {
          extensions: ['md'],
          name: 'Markdownファイル',
        },
      ],
      title: 'modデータのMarkdown書き出し先を選択',
    });

    if (dialogResult.canceled || !dialogResult.filePath) {
      return exportModMarkdownResponseSchema.parse({
        canceled: true,
        filePath: null,
      });
    }

    const markdown = renderProjectMarkdown(input.project);
    await writeFile(dialogResult.filePath, markdown, 'utf-8');

    return exportModMarkdownResponseSchema.parse({
      canceled: false,
      filePath: dialogResult.filePath,
    });
  });

  ipcMain.handle('translation:import-json', async () => {
    const dialogResult = await dialog.showOpenDialog({
      filters: [
        {
          extensions: ['json'],
          name: '翻訳プロジェクト',
        },
      ],
      properties: ['openFile'],
      title: '翻訳プロジェクトをインポート',
    });

    if (
      dialogResult.canceled ||
      dialogResult.filePaths.length === 0
    ) {
      return importTranslationJsonResponseSchema.parse({
        canceled: true,
        payload: null,
      });
    }

    const payload = await readFile(dialogResult.filePaths[0], 'utf-8');

    return importTranslationJsonResponseSchema.parse({
      canceled: false,
      payload,
    });
  });

  ipcMain.handle('shell:show-item-in-folder', async (_event, filePath) => {
    const filePathValue =
      typeof filePath === 'string' ? filePath : '';
    if (filePathValue.length > 0) {
      shell.showItemInFolder(filePathValue);
    }
  });
};

process.on('message', (message) => {
  if (message !== 'electron-vite&type=hot-reload') {
    return;
  }

  for (const currentWindow of BrowserWindow.getAllWindows()) {
    currentWindow.webContents.reload();
  }
});

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('jp.prett.kongyo.kenshi.tool');
  }

  Menu.setApplicationMenu(null);
  registerIpc();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });

  return undefined;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
