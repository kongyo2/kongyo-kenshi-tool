import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadModsRequestSchema,
  saveTranslationModRequestSchema,
  saveTranslationModResponseSchema,
  type LoadModsRequest,
} from '../src/shared/ipc.ts';
import {
  createTranslationModBuffer,
  parseModBuffer,
} from '../src/shared/mod-format.ts';
import type { TranslationRecord } from '../src/shared/models.ts';

const electronRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(electronRoot, '..');
const rendererDist = path.join(appRoot, 'dist');
const preloadPath = path.join(electronRoot, 'preload.mjs');
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

const createWindow = async () => {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#17120f',
    show: false,
    title: 'Kenshi翻訳ヘルパー',
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

  for (const modPath of modPaths) {
    const fileBuffer = await readFile(modPath);
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    );
    const parsedRecords = parseModBuffer(
      arrayBuffer,
      input.replaceWordSwap,
    );

    dependencies.push(path.basename(modPath, '.mod'));
    records.push(...parsedRecords);
  }

  if (records.length === 0) {
    throw new Error(
      '翻訳対象として扱えるテキストが見つかりませんでした。',
    );
  }

  return {
    dependencies: uniquePreserveOrder(dependencies),
    records,
    replaceWordSwap: input.replaceWordSwap,
    sourceModName:
      uniquePreserveOrder(dependencies)[0] ?? 'unknown',
  };
};

const registerIpc = () => {
  ipcMain.handle('dialog:pick-mod-files', async () => {
    const result = await dialog.showOpenDialog({
      filters: [
        {
          extensions: ['mod'],
          name: 'Kenshi mod',
        },
      ],
      properties: ['openFile', 'multiSelections'],
      title: 'Kenshi modファイルを選択',
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
          name: 'Kenshi translation mod',
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

    const buffer = createTranslationModBuffer(
      input.project,
      input.exportOptions,
    );
    await writeFile(dialogResult.filePath, Buffer.from(buffer));

    return saveTranslationModResponseSchema.parse({
      canceled: false,
      filePath: dialogResult.filePath,
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
