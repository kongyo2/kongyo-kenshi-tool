// 読み込み順に並んだレコードを stringId ごとに合成する。
// 合成の規則は OpenConstructionSet の ContextBuilder と同じ:
// - 名前・種別・値はキーごとに後勝ち
// - 参照はカテゴリ + 参照先 ID ごとに追加 / 値の更新 / 削除 (v0〜v2 がすべて int.MaxValue)
// - インスタンスは ID ごとに追加 / 更新 / 削除 (参照先が空)
// - REMOVED フラグが立ったレコードは削除済み
import { isRemovedReference, removedItemFlagKeys } from "./mod-format.ts";
import type { InspectorRecord, ReferenceCategory } from "./models.ts";

export type RecordValueKind = "bool" | "file" | "float" | "int" | "string" | "vec3" | "vec4";

export interface RecordValueEntry {
  key: string;
  kind: RecordValueKind;
  value: boolean | number | string | readonly number[];
}

/** 値ブロックを (種類, キー, 値) の列として列挙する。 */
export const listRecordValues = (record: InspectorRecord): RecordValueEntry[] => {
  const entries: RecordValueEntry[] = [];
  for (const entry of record.values.bools) {
    entries.push({ key: entry.key, kind: "bool", value: entry.value });
  }
  for (const entry of record.values.ints) {
    entries.push({ key: entry.key, kind: "int", value: entry.value });
  }
  for (const entry of record.values.floats) {
    entries.push({ key: entry.key, kind: "float", value: entry.value });
  }
  for (const entry of record.values.vector3s) {
    entries.push({ key: entry.key, kind: "vec3", value: [entry.x, entry.y, entry.z] });
  }
  for (const entry of record.values.vector4s) {
    entries.push({ key: entry.key, kind: "vec4", value: [entry.x, entry.y, entry.z, entry.w] });
  }
  for (const entry of record.strings) {
    entries.push({ key: entry.key, kind: "string", value: entry.value });
  }
  for (const entry of record.values.files) {
    entries.push({ key: entry.key, kind: "file", value: entry.value });
  }
  return entries;
};

/** レコードから指定した種類・キーの値を探す。 */
export const findRecordValue = (
  record: InspectorRecord | undefined,
  kind: RecordValueKind,
  key: string,
): RecordValueEntry["value"] | undefined => {
  if (!record) {
    return undefined;
  }
  switch (kind) {
    case "bool":
      return record.values.bools.find((entry) => entry.key === key)?.value;
    case "int":
      return record.values.ints.find((entry) => entry.key === key)?.value;
    case "float":
      return record.values.floats.find((entry) => entry.key === key)?.value;
    case "string":
      return record.strings.find((entry) => entry.key === key)?.value;
    case "file":
      return record.values.files.find((entry) => entry.key === key)?.value;
    case "vec3": {
      const entry = record.values.vector3s.find((candidate) => candidate.key === key);
      return entry ? [entry.x, entry.y, entry.z] : undefined;
    }
    case "vec4": {
      const entry = record.values.vector4s.find((candidate) => candidate.key === key);
      return entry ? [entry.x, entry.y, entry.z, entry.w] : undefined;
    }
    default:
      return undefined;
  }
};

const mergeKeyed = <T extends { key: string }>(base: readonly T[], overlay: readonly T[]) => {
  if (overlay.length === 0) {
    return [...base];
  }
  const merged = new Map<string, T>();
  for (const entry of base) {
    merged.set(entry.key, entry);
  }
  for (const entry of overlay) {
    merged.set(entry.key, entry);
  }
  return [...merged.values()];
};

const mergeReferenceCategories = (
  base: readonly ReferenceCategory[],
  overlay: readonly ReferenceCategory[],
): ReferenceCategory[] => {
  const categories = new Map<string, Map<string, ReferenceCategory["references"][number]>>();
  for (const category of base) {
    categories.set(
      category.name,
      new Map(category.references.map((reference) => [reference.targetId, reference])),
    );
  }
  for (const category of overlay) {
    let references = categories.get(category.name);
    if (!references) {
      references = new Map();
      categories.set(category.name, references);
    }
    for (const reference of category.references) {
      if (isRemovedReference(reference)) {
        references.delete(reference.targetId);
      } else {
        references.set(reference.targetId, reference);
      }
    }
  }
  return [...categories.entries()]
    .map(([name, references]) => ({ name, references: [...references.values()] }))
    .filter((category) => category.references.length > 0);
};

/** 2 つのレコード (前 → 後) を合成した新しいレコードを返す。入力は変更しない。 */
export const mergeTwoRecords = (
  base: InspectorRecord,
  overlay: InspectorRecord,
): InspectorRecord => {
  const referenceCategories = mergeReferenceCategories(
    base.referenceCategories,
    overlay.referenceCategories,
  );
  const instances = new Map(base.values.instances.map((instance) => [instance.key, instance]));
  for (const instance of overlay.values.instances) {
    if (instance.targetId.length === 0) {
      instances.delete(instance.key);
    } else {
      instances.set(instance.key, instance);
    }
  }

  const values = {
    bools: mergeKeyed(base.values.bools, overlay.values.bools),
    files: mergeKeyed(base.values.files, overlay.values.files),
    floats: mergeKeyed(base.values.floats, overlay.values.floats),
    instances: [...instances.values()],
    ints: mergeKeyed(base.values.ints, overlay.values.ints),
    vector3s: mergeKeyed(base.values.vector3s, overlay.values.vector3s),
    vector4s: mergeKeyed(base.values.vector4s, overlay.values.vector4s),
  };
  const strings = mergeKeyed(base.strings, overlay.strings);

  return {
    counts: {
      bools: values.bools.length,
      files: values.files.length,
      floats: values.floats.length,
      instances: values.instances.length,
      ints: values.ints.length,
      referenceCategories: referenceCategories.length,
      references: referenceCategories.reduce(
        (sum, category) => sum + category.references.length,
        0,
      ),
      strings: strings.length,
      vector3s: values.vector3s.length,
      vector4s: values.vector4s.length,
    },
    modName: overlay.modName,
    name: overlay.name,
    referenceCategories,
    // 後の層が REMOVED=false を書いて復元することもあるので、合成後の値から決める
    removed: values.bools.some((entry) => entry.value && removedItemFlagKeys.has(entry.key)),
    saveData: overlay.saveData,
    stringId: overlay.stringId,
    strings,
    type: overlay.type,
    uid: overlay.uid,
    values,
  };
};

/** 同じ stringId のレコード群 (読み込み順) を合成する。1 件ならそのまま返す。 */
export const mergeRecordHistory = (records: readonly InspectorRecord[]) => {
  const [first, ...rest] = records;
  if (!first) {
    return undefined;
  }
  return rest.reduce(mergeTwoRecords, first);
};

export interface RecordIndexes {
  /** 参照コンテキストだけを合成した、対象 mod が手を加える前の状態 */
  base: Map<string, InspectorRecord>;
  /** 参照コンテキストに対象 mod を重ねた、ゲーム内での実際の状態 */
  effective: Map<string, InspectorRecord>;
  /** stringId → そのレコードに手を加えた mod 名 (読み込み順) */
  sources: Map<string, string[]>;
}

const groupByStringId = (records: readonly InspectorRecord[]) => {
  const groups = new Map<string, InspectorRecord[]>();
  for (const record of records) {
    if (record.stringId.length === 0) {
      continue;
    }
    const group = groups.get(record.stringId);
    if (group) {
      group.push(record);
    } else {
      groups.set(record.stringId, [record]);
    }
  }
  return groups;
};

/**
 * contextRecords と targetRecords (どちらも読み込み順) から、合成済みのレコード索引を作る。
 * 重複している stringId だけを合成するので、大きなバニラデータでも負荷は小さい。
 */
export const buildRecordIndexes = (
  contextRecords: readonly InspectorRecord[],
  targetRecords: readonly InspectorRecord[],
): RecordIndexes => {
  const base = new Map<string, InspectorRecord>();
  const sources = new Map<string, string[]>();

  for (const [stringId, group] of groupByStringId(contextRecords)) {
    base.set(stringId, mergeRecordHistory(group)!);
    sources.set(
      stringId,
      group.map((record) => record.modName),
    );
  }

  const effective = new Map(base);
  for (const [stringId, group] of groupByStringId(targetRecords)) {
    const prior = base.get(stringId);
    const isNewRecord = group[0]!.saveData.changeTypeName === "New";
    effective.set(
      stringId,
      prior && !isNewRecord ? mergeRecordHistory([prior, ...group])! : mergeRecordHistory(group)!,
    );
    sources.set(stringId, [
      ...(isNewRecord ? [] : (sources.get(stringId) ?? [])),
      ...group.map((record) => record.modName),
    ]);
  }

  return { base, effective, sources };
};
