import { randomUUID } from "node:crypto";
import { lstat, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } from "electron";
import { z } from "zod";

import {
  copyModMarkdownResponseSchema,
  measureModMarkdownResponseSchema,
  exportModMarkdownRequestSchema,
  exportModMarkdownResponseSchema,
  exportOptionsSchema,
  loadModsRequestSchema,
  projectRequestSchema,
  type ExportOptions,
  type LoadModsRequest,
  type LoadProgress,
} from "../src/shared/ipc.ts";
import { parseMod } from "../src/shared/mod-format.ts";
import { joinMarkdownSections, renderProjectMarkdownSections } from "../src/shared/mod-markdown.ts";
import type {
  FailedMod,
  InspectorRecord,
  LoadedMod,
  ModProject,
  TextRecord,
} from "../src/shared/models.ts";
import {
  checkAssetReferences,
  detectVanillaDataPath,
  findKenshiRoot,
  pathExists,
  readModInfo,
  resolveEnabledMods,
} from "./kenshi-environment.ts";
import { loadAppSettings, saveAppSettings } from "./settings.ts";

const electronRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(electronRoot, "..");
const rendererDist = path.join(appRoot, "dist");
const preloadPath = path.join(electronRoot, "preload.mjs");
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

const folderScanExtensions = new Set([".mod", ".base"]);
// .translation (locale フォルダの翻訳 mod) はファイルを直接選んだときだけ読む。
// フォルダ走査で拾うと全言語の翻訳が混ざるため。
const explicitFileExtensions = new Set([".mod", ".base", ".translation"]);

/** ゲームと OpenConstructionSet が使うバニラの読み込み順 */
const vanillaLoadOrder = ["gamedata.base", "newwworld.mod", "dialogue.mod", "rebirth.mod"];

const hasExtension = (filePath: string, extensions: ReadonlySet<string>) =>
  extensions.has(path.extname(filePath).toLowerCase());

const createWindow = async () => {
  const mainWindow = new BrowserWindow({
    width: 1520,
    height: 1000,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#16130f",
    show: false,
    title: "Kenshiツール",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(rendererDist, "index.html"));
  }
};

// --- ファイル収集 --------------------------------------------------------------------

const collectModPathsFromDirectory = async (directoryPath: string): Promise<string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const sortedEntries = [...entries].sort((left, right) =>
    left.name.localeCompare(right.name, "ja"),
  );
  // サブフォルダは並列に走査するが、結果の順序は名前順のまま保つ
  const nested = await Promise.all(
    sortedEntries.map(async (entry) => {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return collectModPathsFromDirectory(fullPath);
      }
      return entry.isFile() && hasExtension(entry.name, folderScanExtensions) ? [fullPath] : [];
    }),
  );
  return nested.flat();
};

const collectFromPath = async (currentPath: string) => {
  const stats = await lstat(currentPath);
  if (stats.isDirectory()) {
    return collectModPathsFromDirectory(currentPath);
  }
  return stats.isFile() && hasExtension(currentPath, explicitFileExtensions) ? [currentPath] : [];
};

const uniquePaths = (items: readonly string[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = path.resolve(item).toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const collectModPaths = async (pathsToScan: readonly string[]) =>
  uniquePaths((await Promise.all(pathsToScan.map(collectFromPath))).flat());

const collectModPathsLenient = async (pathsToScan: readonly string[]) => {
  const results = await Promise.all(
    pathsToScan.map(async (currentPath) => {
      try {
        return { missing: null, paths: await collectFromPath(currentPath) };
      } catch {
        return { missing: currentPath, paths: [] as string[] };
      }
    }),
  );
  return {
    missingPaths: results.flatMap((result) => (result.missing ? [result.missing] : [])),
    paths: uniquePaths(results.flatMap((result) => result.paths)),
  };
};

/** バニラのファイルを正しい読み込み順で先頭に並べ、それ以外は指定順を保つ。 */
const sortByLoadOrder = (modPaths: readonly string[]) => {
  const rank = (modPath: string) => {
    const index = vanillaLoadOrder.indexOf(path.basename(modPath).toLowerCase());
    return index < 0 ? vanillaLoadOrder.length : index;
  };
  return modPaths
    .map((modPath, index) => ({ index, modPath, rank: rank(modPath) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.modPath);
};

// --- 解析 ---------------------------------------------------------------------------

type ProgressReporter = (progress: LoadProgress) => void;

interface ParsedModFiles {
  failed: FailedMod[];
  inspectorRecords: InspectorRecord[];
  mods: LoadedMod[];
  textRecords: TextRecord[];
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

const parseModFiles = async (
  modPaths: readonly string[],
  role: LoadedMod["role"],
  reportProgress: ProgressReporter,
  totalFiles: number,
  startIndex: number,
): Promise<ParsedModFiles> => {
  const result: ParsedModFiles = { failed: [], inspectorRecords: [], mods: [], textRecords: [] };
  const uidPrefix = role === "target" ? "t" : "r";

  for (const [index, modPath] of modPaths.entries()) {
    reportProgress({
      current: startIndex + index + 1,
      currentFile: path.basename(modPath),
      phase: role,
      total: totalFiles,
    });

    try {
      // 進捗表示とメモリ使用量を抑えるため、ファイルは 1 つずつ順番に読む
      // oxlint-disable-next-line no-await-in-loop
      const [fileBuffer, info] = await Promise.all([readFile(modPath), readModInfo(modPath)]);
      const parsed = parseMod(fileBuffer, path.parse(modPath).name, `${uidPrefix}${index}`);
      for (const record of parsed.inspectorRecords) {
        result.inspectorRecords.push(record);
      }
      for (const record of parsed.textRecords) {
        result.textRecords.push(record);
      }
      result.mods.push({
        fileName: path.basename(modPath),
        filePath: modPath,
        header: parsed.header,
        info,
        loadOrder: index + 1,
        recordCount: parsed.inspectorRecords.length,
        role,
        warnings: parsed.warnings,
      });
    } catch (error) {
      result.failed.push({ error: describeError(error), filePath: modPath, role });
    }
  }

  return result;
};

interface ProjectSession {
  project: ModProject;
}

let currentSession: ProjectSession | null = null;

const parseProject = async (
  input: LoadModsRequest,
  reportProgress: ProgressReporter,
): Promise<ProjectSession> => {
  const modPaths = await collectModPaths(input.paths);
  if (modPaths.length === 0) {
    throw new Error("modファイルが見つかりませんでした。");
  }

  const referenceCollection = await collectModPathsLenient(input.referencePaths);
  const targetKeys = new Set(modPaths.map((modPath) => path.resolve(modPath).toLowerCase()));
  const referenceModPaths = sortByLoadOrder(
    referenceCollection.paths.filter(
      (modPath) => !targetKeys.has(path.resolve(modPath).toLowerCase()),
    ),
  );
  const totalFiles = modPaths.length + referenceModPaths.length + 1;

  const targets = await parseModFiles(modPaths, "target", reportProgress, totalFiles, 0);
  if (targets.mods.length === 0) {
    throw new Error(
      `modファイルを解析できませんでした: ${targets.failed.map((failed) => `${path.basename(failed.filePath)} (${failed.error})`).join(" / ")}`,
    );
  }
  const references = await parseModFiles(
    referenceModPaths,
    "reference",
    reportProgress,
    totalFiles,
    modPaths.length,
  );

  reportProgress({
    current: totalFiles,
    currentFile: "アセット参照",
    phase: "analysis",
    total: totalFiles,
  });
  const settings = await loadAppSettings();
  const knownPaths = [...modPaths, ...referenceModPaths];
  const kenshiRoot = await findKenshiRoot({
    knownPaths,
    vanillaDataPath: settings.vanillaDataPath,
  });
  const mods = [...targets.mods, ...references.mods];
  const assetReferences = await checkAssetReferences(targets.inspectorRecords, mods, kenshiRoot);

  const project: ModProject = {
    assetReferences,
    contextRecordCount: references.inspectorRecords.length,
    contextRecords: references.inspectorRecords,
    contextTextRecords: references.textRecords,
    dependencies: [...new Set(targets.mods.flatMap((mod) => mod.header.dependencies))],
    failedMods: [...targets.failed, ...references.failed],
    inspectorRecords: targets.inspectorRecords,
    missingReferencePaths: referenceCollection.missingPaths,
    mods,
    projectId: randomUUID(),
    sourceModName: path.parse(targets.mods[0]!.fileName).name,
    textRecords: targets.textRecords,
  };

  return { project };
};

/** レンダラへ返す内容。参照コンテキストは大きいので、インスペクタで必要になるまで送らない。 */
const toRendererProject = (project: ModProject): ModProject => ({
  ...project,
  contextRecords: [],
  contextTextRecords: [],
});

const requireSession = (projectId: string) => {
  if (!currentSession || currentSession.project.projectId !== projectId) {
    throw new Error("プロジェクトが見つかりません。modを読み込み直してください。");
  }
  return currentSession;
};

/** LLM のトークン数の目安 (英数字は約 4 文字、それ以外は約 1 文字で 1 トークン)。 */
const estimateTokens = (text: string) => {
  let ascii = 0;
  let other = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) < 0x80) {
      ascii += 1;
    } else {
      other += 1;
    }
  }
  return Math.round(ascii / 4 + other);
};

const measureText = (text: string) => ({
  byteCount: Buffer.byteLength(text, "utf-8"),
  characterCount: text.length,
  estimatedTokens: estimateTokens(text),
});

const renderSessionMarkdown = (session: ProjectSession, options: ExportOptions) => {
  const sections = renderProjectMarkdownSections(session.project, {
    includeBaseComparison: options.includeBaseComparison,
    includeFieldGlossary: options.includeFieldGlossary,
  });
  const markdown = joinMarkdownSections(sections);
  return { markdown, sections, stats: measureText(markdown) };
};

/** 書き込み途中で失敗しても既存のファイルを壊さないよう、同じフォルダの一時ファイルに書いてから置き換える。 */
const writeFileAtomically = async (filePath: string, content: string) => {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, content, "utf-8");
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
};

const toVanillaPickResult = async (dataPath: string) => {
  const saved = await saveAppSettings({ vanillaDataPath: dataPath });
  return {
    hasGamedata: await pathExists(path.join(dataPath, "gamedata.base")),
    path: saved.vanillaDataPath ?? dataPath,
  };
};

const registerIpc = () => {
  ipcMain.handle("dialog:pick-mod-files", async () => {
    const result = await dialog.showOpenDialog({
      filters: [
        { extensions: ["mod", "base"], name: "Kenshi mod/base ファイル" },
        { extensions: ["translation"], name: "Kenshi 翻訳ファイル" },
      ],
      properties: ["openFile", "multiSelections"],
      title: "mod / base ファイルを選択",
    });

    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("dialog:pick-mod-folders", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "multiSelections"],
      title: "modを含むフォルダを選択",
    });

    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("mods:load", async (event, rawInput) => {
    const input = loadModsRequestSchema.parse(rawInput);
    const sender = event.sender;
    // 読み込み中も前のプロジェクトを保持しておき、成功したら差し替える
    const session = await parseProject(input, (progress) => {
      if (!sender.isDestroyed()) {
        sender.send("mods:load-progress", progress);
      }
    });
    currentSession = session;
    return toRendererProject(session.project);
  });

  ipcMain.handle("mods:get-context-records", async (_event, rawInput) => {
    const { projectId } = projectRequestSchema.parse({ projectId: rawInput });
    return requireSession(projectId).project.contextRecords;
  });

  ipcMain.handle("mods:close", async (_event, rawInput) => {
    const { projectId } = projectRequestSchema.parse({ projectId: rawInput });
    if (currentSession?.project.projectId === projectId) {
      currentSession = null;
    }
  });

  ipcMain.handle("mods:measure-markdown", async (_event, rawInput) => {
    const input = exportModMarkdownRequestSchema.parse(rawInput);
    const { sections, stats } = renderSessionMarkdown(
      requireSession(input.projectId),
      input.options,
    );
    return measureModMarkdownResponseSchema.parse({
      ...stats,
      sections: sections.map((section) => ({
        anchor: section.anchor,
        title: section.title,
        ...measureText(section.content),
      })),
    });
  });

  ipcMain.handle("mods:copy-markdown", async (_event, rawInput) => {
    const input = exportModMarkdownRequestSchema.parse(rawInput);
    const { markdown, stats } = renderSessionMarkdown(
      requireSession(input.projectId),
      input.options,
    );
    clipboard.writeText(markdown);
    return copyModMarkdownResponseSchema.parse(stats);
  });

  ipcMain.handle("mods:export-markdown", async (_event, rawInput) => {
    const input = exportModMarkdownRequestSchema.parse(rawInput);
    const session = requireSession(input.projectId);
    const dialogResult = await dialog.showSaveDialog({
      defaultPath: path.join(
        app.getPath("downloads"),
        `${session.project.sourceModName}_mod_data.md`,
      ),
      filters: [{ extensions: ["md"], name: "Markdownファイル" }],
      title: "modデータのMarkdown書き出し先を選択",
    });

    if (dialogResult.canceled || !dialogResult.filePath) {
      return exportModMarkdownResponseSchema.parse({ canceled: true });
    }

    const { markdown, stats } = renderSessionMarkdown(session, input.options);
    await writeFileAtomically(dialogResult.filePath, markdown);

    return exportModMarkdownResponseSchema.parse({
      ...stats,
      canceled: false,
      filePath: dialogResult.filePath,
    });
  });

  ipcMain.handle("shell:show-item-in-folder", async (_event, filePath) => {
    const filePathValue = typeof filePath === "string" ? filePath : "";
    if (filePathValue.length > 0) {
      shell.showItemInFolder(filePathValue);
    }
  });

  ipcMain.handle("settings:get-all", async () => loadAppSettings());

  ipcMain.handle("settings:save-reference-paths", async (_event, rawInput) => {
    await saveAppSettings({ referencePaths: z.array(z.string()).parse(rawInput) });
  });

  ipcMain.handle("settings:save-last-target-paths", async (_event, rawInput) => {
    await saveAppSettings({ lastTargetPaths: z.array(z.string()).parse(rawInput) });
  });

  ipcMain.handle("settings:save-export-options", async (_event, rawInput) => {
    await saveAppSettings({ exportOptions: exportOptionsSchema.parse(rawInput) });
  });

  ipcMain.handle("settings:pick-and-save-vanilla-data-path", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "バニラ Kenshi の data フォルダを選択 (例: ...\\steamapps\\common\\Kenshi\\data)",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return toVanillaPickResult(result.filePaths[0]!);
  });

  ipcMain.handle("settings:save-vanilla-data-path", async (_event, rawInput) =>
    toVanillaPickResult(z.string().min(1).parse(rawInput)),
  );

  ipcMain.handle("kenshi:detect-vanilla-data-path", async () => detectVanillaDataPath());

  ipcMain.handle("kenshi:resolve-enabled-mods", async () => {
    const settings = await loadAppSettings();
    if (!settings.vanillaDataPath) {
      return null;
    }
    return resolveEnabledMods(settings.vanillaDataPath);
  });
};

process.on("message", (message) => {
  if (message !== "electron-vite&type=hot-reload") {
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

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });

  return undefined;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
