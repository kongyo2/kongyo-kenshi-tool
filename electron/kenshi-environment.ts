// Kenshi のインストール環境 (Steam ライブラリ・Workshop・mods.cfg・mod の .info・アセットの所在) を扱う。
import { execFile } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  collectAssetCandidates,
  splitModAssetPath,
  type AssetCandidate,
} from "../src/shared/assets.ts";
import type { EnabledModsResult } from "../src/shared/ipc.ts";
import type { AssetReference, InspectorRecord, LoadedMod, ModInfo } from "../src/shared/models.ts";

const execFileAsync = promisify(execFile);

export const kenshiSteamAppId = "233860";

export const pathExists = async (target: string) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

/** 候補のうち、存在する最初のパス (候補の順序が優先順位)。 */
const findFirstExisting = async (candidates: readonly string[]) => {
  const exists = await Promise.all(candidates.map(pathExists));
  const index = exists.indexOf(true);
  return index >= 0 ? candidates[index]! : null;
};

/** .../Kenshi/data → .../Kenshi */
export const getKenshiRootFromDataPath = (dataPath: string) =>
  path.basename(dataPath).toLowerCase() === "data" ? path.dirname(dataPath) : dataPath;

/** パスに含まれる steamapps フォルダを返す (common/Kenshi や workshop/content 配下から辿る)。 */
export const findSteamappsRoot = (somePath: string) => {
  const match = /^(.*[\\/]steamapps)[\\/](?:common|workshop)[\\/]/i.exec(somePath);
  return match ? match[1]! : null;
};

const getWorkshopContentRoot = (steamappsRoot: string) =>
  path.join(steamappsRoot, "workshop", "content", kenshiSteamAppId);

// --- Steam ライブラリ ----------------------------------------------------------------

const readSteamPathFromRegistry = async () => {
  if (process.platform !== "win32") {
    return null;
  }
  try {
    const { stdout } = await execFileAsync("reg", [
      "query",
      "HKCU\\Software\\Valve\\Steam",
      "/v",
      "SteamPath",
    ]);
    const match = /SteamPath\s+REG_SZ\s+(.+)/i.exec(stdout);
    return match ? path.normalize(match[1]!.trim()) : null;
  } catch {
    return null;
  }
};

/** libraryfolders.vdf から Steam ライブラリのフォルダを列挙する。 */
const readSteamLibraryFolders = async (steamPath: string) => {
  const libraries = [steamPath];
  try {
    const vdf = await readFile(path.join(steamPath, "steamapps", "libraryfolders.vdf"), "utf-8");
    for (const match of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
      libraries.push(path.normalize(match[1]!.replace(/\\\\/g, "\\")));
    }
  } catch {
    // libraryfolders.vdf が無い古い Steam は既定のライブラリだけ
  }
  return [...new Set(libraries)];
};

export const detectVanillaDataPath = async () => {
  const candidates: string[] = [];
  const steamPath = await readSteamPathFromRegistry();
  if (steamPath) {
    for (const library of await readSteamLibraryFolders(steamPath)) {
      candidates.push(path.join(library, "steamapps", "common", "Kenshi", "data"));
    }
  }
  candidates.push(
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Kenshi\\data",
    "C:\\Program Files\\Steam\\steamapps\\common\\Kenshi\\data",
    "C:\\GOG Games\\Kenshi\\data",
    "C:\\Program Files (x86)\\GOG Galaxy\\Games\\Kenshi\\data",
  );

  const found = await findFirstExisting(
    candidates.map((candidate) => path.join(candidate, "gamedata.base")),
  );
  return found ? path.dirname(found) : null;
};

// --- mod の .info -------------------------------------------------------------------

const decodeXmlText = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

const readXmlElement = (xml: string, name: string) => {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return match ? decodeXmlText(match[1]!) : "";
};

/** mod の横にある `_<mod名>.info` (Workshop / FCS が書き出す XML) を読む。 */
export const readModInfo = async (modPath: string): Promise<ModInfo | null> => {
  const infoPath = path.join(path.dirname(modPath), `_${path.parse(modPath).name}.info`);
  let xml: string;
  try {
    xml = await readFile(infoPath, "utf-8");
  } catch {
    return null;
  }

  const tagsBlock = readXmlElement(xml, "tags");
  const tags = [...tagsBlock.matchAll(/<string>([\s\S]*?)<\/string>/gi)].map((match) =>
    decodeXmlText(match[1]!),
  );
  const visibility = Number(readXmlElement(xml, "visibility"));
  return {
    id: readXmlElement(xml, "id"),
    lastUpdate: readXmlElement(xml, "lastUpdate"),
    modName: readXmlElement(xml, "mod"),
    tags,
    title: readXmlElement(xml, "title"),
    visibility: Number.isInteger(visibility) ? visibility : 0,
  };
};

// --- Kenshi フォルダ -----------------------------------------------------------------

/** Kenshi フォルダの候補 (バニラ data の親、または steamapps/common/Kenshi)。 */
export const findKenshiRoot = async (hints: {
  /** 環境の手掛かりになるパス (読み込んだ mod など) */
  knownPaths: readonly string[];
  vanillaDataPath: string | null;
}) => {
  const candidates: string[] = [];
  if (hints.vanillaDataPath) {
    candidates.push(getKenshiRootFromDataPath(hints.vanillaDataPath));
  }
  for (const knownPath of hints.knownPaths) {
    const steamappsRoot = findSteamappsRoot(knownPath);
    if (steamappsRoot) {
      candidates.push(path.join(steamappsRoot, "common", "Kenshi"));
    }
  }
  const found = await findFirstExisting(
    candidates.map((candidate) => path.join(candidate, "data")),
  );
  return found ? path.dirname(found) : null;
};

// --- mods.cfg -----------------------------------------------------------------------

/** Workshop / mods フォルダから、mods.cfg に書かれた mod ファイルを探す。 */
export const resolveEnabledMods = async (vanillaDataPath: string): Promise<EnabledModsResult> => {
  const kenshiRoot = getKenshiRootFromDataPath(vanillaDataPath);
  const modsConfigPath = path.join(vanillaDataPath, "mods.cfg");
  const enabled = (await readFile(modsConfigPath, "utf-8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const workshopFiles = new Map<string, string>();
  const steamappsRoot = findSteamappsRoot(kenshiRoot);
  if (steamappsRoot) {
    const contentRoot = getWorkshopContentRoot(steamappsRoot);
    const items = await readdir(contentRoot).catch(() => [] as string[]);
    const listings = await Promise.all(
      items.map(async (item) => ({
        files: await readdir(path.join(contentRoot, item)).catch(() => [] as string[]),
        item,
      })),
    );
    for (const { files, item } of listings) {
      for (const file of files) {
        if (file.toLowerCase().endsWith(".mod") && !workshopFiles.has(file.toLowerCase())) {
          workshopFiles.set(file.toLowerCase(), path.join(contentRoot, item, file));
        }
      }
    }
  }

  // ゲームと同じく data → mods → Workshop の順に探す
  const resolved = await Promise.all(
    enabled.map(
      async (fileName) =>
        (await findFirstExisting([
          path.join(vanillaDataPath, fileName),
          path.join(kenshiRoot, "mods", path.parse(fileName).name, fileName),
        ])) ?? workshopFiles.get(fileName.toLowerCase()),
    ),
  );
  const found: string[] = [];
  const missing: string[] = [];
  resolved.forEach((modPath, index) => {
    if (modPath) {
      found.push(modPath);
    } else {
      missing.push(enabled[index]!);
    }
  });

  return { found, missing, modsConfigPath };
};

// --- アセット -----------------------------------------------------------------------

const resolveAsset = async (
  candidate: AssetCandidate,
  targetMods: readonly LoadedMod[],
  referenceMods: readonly LoadedMod[],
  kenshiRoot: string | null,
): Promise<Pick<AssetReference, "resolvedPath" | "status">> => {
  const modAsset = splitModAssetPath(candidate.path);
  if (modAsset) {
    const modNameKey = modAsset.modName.toLowerCase();
    const sameName = (mod: LoadedMod) => path.parse(mod.fileName).name.toLowerCase() === modNameKey;
    const owner = targetMods.find(sameName) ?? referenceMods.find(sameName);
    const isTargetAsset = targetMods.some(sameName);
    const locations = [
      ...(owner ? [path.join(path.dirname(owner.filePath), modAsset.rest)] : []),
      ...(kenshiRoot ? [path.join(kenshiRoot, "mods", modAsset.modName, modAsset.rest)] : []),
    ];
    const location = await findFirstExisting(locations);
    if (location) {
      return { resolvedPath: location, status: isTargetAsset ? "mod" : "dependency" };
    }
    return {
      resolvedPath: null,
      status: owner || isTargetAsset || kenshiRoot ? "missing" : "unchecked",
    };
  }

  // ./data/... は mod フォルダ内の同じ構成で上書きされることがあるので、先に mod フォルダを見る
  const modLocation = await findFirstExisting(
    targetMods.map((mod) => path.join(path.dirname(mod.filePath), candidate.path)),
  );
  if (modLocation) {
    return { resolvedPath: modLocation, status: "mod" };
  }
  if (kenshiRoot) {
    const gameLocation = await findFirstExisting([path.join(kenshiRoot, candidate.path)]);
    return gameLocation
      ? { resolvedPath: gameLocation, status: "game" }
      : { resolvedPath: null, status: "missing" };
  }
  return { resolvedPath: null, status: "unchecked" };
};

export const checkAssetReferences = async (
  targetRecords: readonly InspectorRecord[],
  mods: readonly LoadedMod[],
  kenshiRoot: string | null,
): Promise<AssetReference[]> => {
  const targetMods = mods.filter((mod) => mod.role === "target");
  const referenceMods = mods.filter((mod) => mod.role === "reference");
  const candidates = collectAssetCandidates(targetRecords);
  return Promise.all(
    candidates.map(async (candidate) => ({
      fieldKeys: [...candidate.fieldKeys].sort(),
      kind: candidate.kind,
      path: candidate.path,
      recordCount: candidate.recordIds.size,
      ...(await resolveAsset(candidate, targetMods, referenceMods, kenshiRoot)),
    })),
  );
};
