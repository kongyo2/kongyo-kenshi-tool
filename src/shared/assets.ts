// レコードのファイルフィールドが参照するアセット (メッシュ・テクスチャ・物理データなど) を集める。
// パスは Kenshi フォルダからの相対パスで、"./data/..." がゲーム本体、"./mods/<mod名>/..." が mod フォルダを指す。
import type { InspectorRecord } from "./models.ts";

export interface AssetCandidate {
  fieldKeys: Set<string>;
  kind: string;
  /** 区切りを / に揃え、先頭の ./ を除いたパス */
  path: string;
  recordIds: Set<string>;
}

const assetKindsByExtension: Readonly<Record<string, string>> = {
  ".bod2": "character body",
  ".body": "character body",
  ".dds": "texture",
  ".jpg": "image",
  ".material": "Ogre material",
  ".mesh": "Ogre mesh",
  ".phs": "Scythe physics",
  ".png": "image / icon",
  ".skeleton": "Ogre skeleton",
  ".tga": "texture",
  ".xml": "PhysX collision",
};

export const getAssetKind = (assetPath: string) => {
  const dotIndex = assetPath.lastIndexOf(".");
  const extension = dotIndex >= 0 ? assetPath.slice(dotIndex).toLowerCase() : "";
  return assetKindsByExtension[extension] ?? (extension.length > 0 ? `${extension} file` : "file");
};

/** "./data\\items\\a.mesh" → "data/items/a.mesh" */
export const normalizeAssetPath = (value: string) =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^(?:\.\/)+/, "");

export const collectAssetCandidates = (records: readonly InspectorRecord[]) => {
  const candidates = new Map<string, AssetCandidate>();
  for (const record of records) {
    for (const entry of record.values.files) {
      if (entry.value.trim().length === 0) {
        continue;
      }
      const assetPath = normalizeAssetPath(entry.value);
      const key = assetPath.toLowerCase();
      let candidate = candidates.get(key);
      if (!candidate) {
        candidate = {
          fieldKeys: new Set(),
          kind: getAssetKind(assetPath),
          path: assetPath,
          recordIds: new Set(),
        };
        candidates.set(key, candidate);
      }
      candidate.fieldKeys.add(entry.key);
      candidate.recordIds.add(record.stringId);
    }
  }
  return [...candidates.values()];
};

/** "mods/<mod名>/..." 形式なら mod 名と残りのパスを返す。 */
export const splitModAssetPath = (assetPath: string) => {
  const match = /^mods\/([^/]+)\/(.+)$/i.exec(assetPath);
  return match ? { modName: match[1]!, rest: match[2]! } : null;
};
