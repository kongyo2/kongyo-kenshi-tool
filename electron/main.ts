import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } from 'electron';
import { access, lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  copyModMarkdownResponseSchema,
  exportModMarkdownRequestSchema,
  exportModMarkdownResponseSchema,
  loadModsRequestSchema,
  type LoadModsRequest,
  type LoadProgress,
} from '../src/shared/ipc.ts';
import { parseMod } from '../src/shared/mod-format.ts';
import { renderProjectMarkdown } from '../src/shared/mod-markdown.ts';
import type { InspectorRecord, LoadedMod, TextRecord } from '../src/shared/models.ts';
import { loadAppSettings, saveAppSettings } from './settings.ts';

const electronRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(electronRoot, '..');
const rendererDist = path.join(appRoot, 'dist');
const preloadPath = path.join(electronRoot, 'preload.mjs');
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

const modFileExtensions = new Set(['.mod', '.base']);

const isModFile = (filePath: string) =>
  modFileExtensions.has(path.extname(filePath).toLowerCase());

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

    if (entry.isFile() && isModFile(entry.name)) {
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

    if (stats.isFile() && isModFile(currentPath)) {
      collectedPaths.push(currentPath);
    }
  }

  return uniquePreserveOrder(collectedPaths);
};

interface CollectResult {
  missingPaths: string[];
  paths: string[];
}

const collectModPathsLenient = async (
  pathsToScan: string[],
): Promise<CollectResult> => {
  const collectedPaths: string[] = [];
  const missingPaths: string[] = [];

  for (const currentPath of pathsToScan) {
    try {
      const stats = await lstat(currentPath);
      if (stats.isDirectory()) {
        const nestedPaths = await collectModPathsFromDirectory(currentPath);
        collectedPaths.push(...nestedPaths);
        continue;
      }
      if (stats.isFile() && isModFile(currentPath)) {
        collectedPaths.push(currentPath);
      }
    } catch {
      missingPaths.push(currentPath);
    }
  }

  return {
    missingPaths,
    paths: uniquePreserveOrder(collectedPaths),
  };
};

type ProgressReporter = (progress: LoadProgress) => void;

const parseModFiles = async (
  modPaths: readonly string[],
  role: LoadedMod['role'],
  reportProgress: ProgressReporter,
  totalFiles: number,
  startIndex: number,
) => {
  const textRecords: TextRecord[] = [];
  const inspectorRecords: InspectorRecord[] = [];
  const mods: LoadedMod[] = [];

  let processed = 0;
  for (const modPath of modPaths) {
    reportProgress({
      current: startIndex + processed + 1,
      currentFile: path.basename(modPath),
      phase: role,
      total: totalFiles,
    });
    const fileBuffer = await readFile(modPath);
    const modName = path.parse(modPath).name;
    const parsed = parseMod(fileBuffer, modName, modPath);

    textRecords.push(...parsed.textRecords);
    inspectorRecords.push(...parsed.inspectorRecords);
    mods.push({
      fileName: path.basename(modPath),
      filePath: modPath,
      header: parsed.header,
      recordCount: parsed.inspectorRecords.length,
      role,
    });
    processed += 1;
  }

  return {
    inspectorRecords,
    mods,
    textRecords,
  };
};

const parseProject = async (
  input: LoadModsRequest,
  reportProgress: ProgressReporter,
) => {
  const modPaths = await collectModPaths(input.paths);

  if (modPaths.length === 0) {
    throw new Error('modファイルが見つかりませんでした。');
  }

  const referenceCollection = await collectModPathsLenient(input.referencePaths);
  const referenceModPaths = referenceCollection.paths.filter(
    (modPath) => !modPaths.includes(modPath),
  );
  const totalFiles = modPaths.length + referenceModPaths.length;
  const targetProject = await parseModFiles(
    modPaths,
    'target',
    reportProgress,
    totalFiles,
    0,
  );
  const referenceProject = await parseModFiles(
    referenceModPaths,
    'reference',
    reportProgress,
    totalFiles,
    modPaths.length,
  );
  const uniqueDependencies = uniquePreserveOrder(
    targetProject.mods.flatMap((mod) => mod.header.dependencies),
  );

  return {
    contextRecords: referenceProject.inspectorRecords,
    contextTextRecords: referenceProject.textRecords,
    dependencies: uniqueDependencies,
    inspectorRecords: targetProject.inspectorRecords,
    missingReferencePaths: referenceCollection.missingPaths,
    mods: [...targetProject.mods, ...referenceProject.mods],
    sourceModName:
      targetProject.mods[0] ? path.parse(targetProject.mods[0].fileName).name : 'unknown',
    textRecords: targetProject.textRecords,
  };
};

const pathExists = async (target: string) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const registerIpc = () => {
  ipcMain.handle('dialog:pick-mod-files', async () => {
    const result = await dialog.showOpenDialog({
      filters: [
        {
          extensions: ['mod', 'base'],
          name: 'Kenshi mod/base ファイル',
        },
      ],
      properties: ['openFile', 'multiSelections'],
      title: 'mod / base ファイルを選択',
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

  ipcMain.handle('mods:load', async (event, rawInput) => {
    const input = loadModsRequestSchema.parse(rawInput);
    const sender = event.sender;
    return parseProject(input, (progress) => {
      if (!sender.isDestroyed()) {
        sender.send('mods:load-progress', progress);
      }
    });
  });

  ipcMain.handle('mods:copy-markdown', async (_event, rawInput) => {
    const input = exportModMarkdownRequestSchema.parse(rawInput);
    const markdown = renderProjectMarkdown(input.project);
    clipboard.writeText(markdown);
    return copyModMarkdownResponseSchema.parse({
      byteCount: Buffer.byteLength(markdown, 'utf-8'),
    });
  });

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
        byteCount: null,
        canceled: true,
        filePath: null,
      });
    }

    const markdown = renderProjectMarkdown(input.project);
    await writeFile(dialogResult.filePath, markdown, 'utf-8');

    return exportModMarkdownResponseSchema.parse({
      byteCount: Buffer.byteLength(markdown, 'utf-8'),
      canceled: false,
      filePath: dialogResult.filePath,
    });
  });

  ipcMain.handle('shell:show-item-in-folder', async (_event, filePath) => {
    const filePathValue = typeof filePath === 'string' ? filePath : '';
    if (filePathValue.length > 0) {
      shell.showItemInFolder(filePathValue);
    }
  });

  ipcMain.handle('settings:get-all', async () => {
    return loadAppSettings();
  });

  ipcMain.handle('settings:save-reference-paths', async (_event, rawInput) => {
    const paths = z.array(z.string()).parse(rawInput);
    await saveAppSettings({ referencePaths: paths });
  });

  ipcMain.handle(
    'settings:save-last-target-paths',
    async (_event, rawInput) => {
      const paths = z.array(z.string()).parse(rawInput);
      await saveAppSettings({ lastTargetPaths: paths });
    },
  );

  ipcMain.handle('settings:pick-and-save-vanilla-data-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title:
        'バニラ Kenshi の data フォルダを選択 (例: ...\\steamapps\\common\\Kenshi\\data)',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selectedPath = result.filePaths[0]!;
    const hasGamedata = await pathExists(
      path.join(selectedPath, 'gamedata.base'),
    );
    const saved = await saveAppSettings({ vanillaDataPath: selectedPath });
    return { hasGamedata, path: saved.vanillaDataPath ?? selectedPath };
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
