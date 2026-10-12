import { getItemTypeDefinition } from "./item-types.ts";
import type {
  DeleteRequest,
  DialogRecord,
  DialogText,
  EntityRecord,
  InspectorRecord,
  ItemSaveData,
  MergeEntry,
  ModHeader,
  Reference,
  ReferenceCategory,
  TextRecord,
} from "./models.ts";

// Kenshi のデータファイル (.mod / .base / .translation) の読み取り。
// レイアウトは OpenConstructionSet の OcsReader と同じだが、実ファイルの調査結果に合わせて
// 変更種別の解釈・削除フラグ・破損時の扱いを補強している。

const dialogTypeCode = 19;

/** 旧形式 (fileType 16) の mod。gamedata.base と Newwworld.mod がこの形式。 */
export const legacyModFileType = 16;
/** 現行形式 (fileType 17)。ヘッダ長とマージ情報を持つ。 */
export const mergeModFileType = 17;

/** value0〜value2 がすべてこの値の参照は、その mod が参照を削除したことを表す。 */
export const removedReferenceValue = 2_147_483_647;

const legacySaveDataFlag = 0x8000_0000;
const removedItemFlagKeys = new Set(["REMOVED", "DELETED"]);

export class ModParseError extends Error {
  readonly offset: number;

  constructor(message: string, offset: number) {
    super(message);
    this.name = "ModParseError";
    this.offset = offset;
  }
}

interface BinaryCursor {
  bytes: Uint8Array;
  position: number;
  view: DataView;
}

export interface ParsedMod {
  header: ModHeader;
  inspectorRecords: InspectorRecord[];
  textRecords: TextRecord[];
  warnings: string[];
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

const remainingBytes = (cursor: BinaryCursor) => cursor.view.byteLength - cursor.position;

const ensureAvailable = (cursor: BinaryCursor, size: number, what: string) => {
  if (size < 0 || size > remainingBytes(cursor)) {
    throw new ModParseError(
      `${what}を読み取れません (offset ${cursor.position}, 必要 ${size} バイト, 残り ${remainingBytes(cursor)} バイト)`,
      cursor.position,
    );
  }
};

const readInt = (cursor: BinaryCursor) => {
  ensureAvailable(cursor, 4, "int");
  const value = cursor.view.getInt32(cursor.position, true);
  cursor.position += 4;
  return value;
};

const readUInt = (cursor: BinaryCursor) => {
  ensureAvailable(cursor, 4, "uint");
  const value = cursor.view.getUint32(cursor.position, true);
  cursor.position += 4;
  return value;
};

const readUnsignedChar = (cursor: BinaryCursor) => {
  ensureAvailable(cursor, 1, "byte");
  const value = cursor.view.getUint8(cursor.position);
  cursor.position += 1;
  return value;
};

const readFloat = (cursor: BinaryCursor) => {
  ensureAvailable(cursor, 4, "float");
  const value = cursor.view.getFloat32(cursor.position, true);
  cursor.position += 4;
  return value;
};

const readBoolean = (cursor: BinaryCursor) => readUnsignedChar(cursor) !== 0;

// --- 文字列のデコード -------------------------------------------------------------

// Windows-1252 の 0x80〜0x9F に割り当てられた文字。未定義のバイトは WHATWG と同じく C1 制御文字にする。
const cp1252HighTable = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc,
  0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
] as const;

const cp1252ByteByCodePoint = new Map<number, number>();
cp1252HighTable.forEach((codePoint, index) => {
  cp1252ByteByCodePoint.set(codePoint, 0x80 + index);
});

const decodeCp1252 = (bytes: Uint8Array) => {
  let text = "";
  for (const byte of bytes) {
    text += String.fromCharCode(
      byte >= 0x80 && byte <= 0x9f ? cp1252HighTable[byte - 0x80]! : byte,
    );
  }
  return text;
};

const encodeCp1252 = (text: string): Uint8Array | null => {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const codePoint = text.charCodeAt(index);
    if (codePoint < 0x80 || (codePoint >= 0xa0 && codePoint <= 0xff)) {
      bytes[index] = codePoint;
      continue;
    }
    const mapped = cp1252ByteByCodePoint.get(codePoint);
    if (mapped === undefined) {
      return null;
    }
    bytes[index] = mapped;
  }
  return bytes;
};

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

// UTF-8 のテキストを Windows-1252 として読んでから再度 UTF-8 で保存した二重エンコード
// (例: "—" が "â€”" になる) の典型パターン。
const doubleEncodedPattern = /[Â-ô][\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-‚“-„†-•…‰‹›€™]/;

/**
 * 二重エンコードされた文字列を元に戻す。文字列全体が Windows-1252 で表現でき、
 * かつそのバイト列が正しい UTF-8 として読める場合だけ置き換えるため、正規の "Â" などは壊さない。
 */
export const repairDoubleEncodedText = (text: string) => {
  if (!doubleEncodedPattern.test(text)) {
    return text;
  }

  const bytes = encodeCp1252(text);
  if (!bytes) {
    return text;
  }

  try {
    return utf8Decoder.decode(bytes);
  } catch {
    return text;
  }
};

/** UTF-8 として不正なバイト列は古い mod の Windows-1252 テキストとみなして読む。 */
export const decodeModText = (bytes: Uint8Array) => {
  let text: string;
  try {
    text = utf8Decoder.decode(bytes);
  } catch {
    return decodeCp1252(bytes);
  }
  return repairDoubleEncodedText(text);
};

const readString = (cursor: BinaryCursor, what = "文字列") => {
  const length = readInt(cursor);
  if (length <= 0) {
    if (length < 0) {
      throw new ModParseError(
        `${what}の長さが不正です (${length}, offset ${cursor.position - 4})`,
        cursor.position - 4,
      );
    }
    return "";
  }

  ensureAvailable(cursor, length, what);
  const bytes = cursor.bytes.subarray(cursor.position, cursor.position + length);
  cursor.position += length;
  return decodeModText(bytes);
};

const readCommaList = (cursor: BinaryCursor, what: string) =>
  readString(cursor, what)
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

/** 件数フィールドを読み、1 件あたりの最小バイト数から見て残りのデータに収まるか検証する。 */
const readCount = (cursor: BinaryCursor, what: string, minimumEntrySize: number) => {
  const offset = cursor.position;
  const count = readInt(cursor);
  if (count < 0 || count * minimumEntrySize > remainingBytes(cursor)) {
    throw new ModParseError(`${what}の件数が不正です (${count}, offset ${offset})`, offset);
  }
  return count;
};

// --- 変更種別 ---------------------------------------------------------------------

// 実ファイルの調査結果:
// - fileType 17: 0 = 新規, 1 = 変更, 3 = 変更 + 改名 (既存レコードの名前が変わっている)
// - fileType 16: saveData の最上位ビットが常に立ち、2 = 新規 (gamedata.base は全件 2)
// - OCS が書き出した mod は改名を 2 で表す
const getChangeTypeName = (changeType: number, legacy: boolean) => {
  switch (changeType) {
    case 0:
      return "New";
    case 1:
      return "Changed";
    case 2:
      return legacy ? "New" : "Renamed";
    case 3:
      return "Renamed";
    default:
      return `Unknown(${changeType})`;
  }
};

export const decodeSaveData = (rawValue: number): ItemSaveData => {
  const raw = rawValue >>> 0;
  const legacy = (raw & legacySaveDataFlag) !== 0;
  const changeType = raw & 0xf;

  return {
    changeType,
    changeTypeName: getChangeTypeName(changeType, legacy),
    legacy,
    raw,
    saveCount: (raw & ~legacySaveDataFlag) >>> 4,
  };
};

export const isRemovedReference = (reference: Pick<Reference, "value0" | "value1" | "value2">) =>
  reference.value0 === removedReferenceValue &&
  reference.value1 === removedReferenceValue &&
  reference.value2 === removedReferenceValue;

// --- 値ブロック -------------------------------------------------------------------

// 各ブロックの 1 件あたり最小サイズ (キー長 4 バイト + 値)。
const minimumKeySize = 4;

const readBooleanBlock = (cursor: BinaryCursor) => {
  const count = readCount(cursor, "bool 値", minimumKeySize + 1);
  const values: Array<{ key: string; value: boolean }> = [];
  for (let index = 0; index < count; index += 1) {
    const key = readString(cursor, "bool キー");
    const value = readBoolean(cursor);
    values.push({ key, value });
  }
  return values;
};

const readFloatBlock = (cursor: BinaryCursor) => {
  const count = readCount(cursor, "float 値", minimumKeySize + 4);
  const values: Array<{ key: string; value: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const key = readString(cursor, "float キー");
    const value = readFloat(cursor);
    values.push({ key, value });
  }
  return values;
};

const readIntBlock = (cursor: BinaryCursor) => {
  const count = readCount(cursor, "int 値", minimumKeySize + 4);
  const values: Array<{ key: string; value: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const key = readString(cursor, "int キー");
    const value = readInt(cursor);
    values.push({ key, value });
  }
  return values;
};

const readVector3Block = (cursor: BinaryCursor) => {
  const count = readCount(cursor, "vec3 値", minimumKeySize + 12);
  const values: Array<{ key: string; x: number; y: number; z: number }> = [];
  for (let index = 0; index < count; index += 1) {
    values.push({
      key: readString(cursor, "vec3 キー"),
      x: readFloat(cursor),
      y: readFloat(cursor),
      z: readFloat(cursor),
    });
  }
  return values;
};

const readVector4Block = (cursor: BinaryCursor) => {
  const count = readCount(cursor, "vec4 値", minimumKeySize + 16);
  const values: Array<{
    key: string;
    w: number;
    x: number;
    y: number;
    z: number;
  }> = [];
  for (let index = 0; index < count; index += 1) {
    values.push({
      key: readString(cursor, "vec4 キー"),
      x: readFloat(cursor),
      y: readFloat(cursor),
      z: readFloat(cursor),
      w: readFloat(cursor),
    });
  }
  return values;
};

const readKeyedStringBlock = (cursor: BinaryCursor, what: string) => {
  const count = readCount(cursor, what, minimumKeySize * 2);
  const values: Array<{ key: string; value: string }> = [];
  for (let index = 0; index < count; index += 1) {
    values.push({
      key: readString(cursor, `${what}のキー`),
      value: readString(cursor, `${what}の値`),
    });
  }
  return values;
};

const readReferenceCategories = (cursor: BinaryCursor): ReferenceCategory[] => {
  const categoryCount = readCount(cursor, "参照カテゴリ", minimumKeySize * 2);
  const categories: ReferenceCategory[] = [];

  for (let index = 0; index < categoryCount; index += 1) {
    const name = readString(cursor, "参照カテゴリ名");
    const referenceCount = readCount(cursor, "参照", minimumKeySize + 12);
    const references: ReferenceCategory["references"] = [];

    for (let innerIndex = 0; innerIndex < referenceCount; innerIndex += 1) {
      references.push({
        targetId: readString(cursor, "参照先 ID"),
        value0: readInt(cursor),
        value1: readInt(cursor),
        value2: readInt(cursor),
      });
    }

    categories.push({ name, references });
  }

  return categories;
};

const readInstanceBlock = (cursor: BinaryCursor) => {
  const count = readCount(cursor, "インスタンス", minimumKeySize * 2 + 28 + 4);
  const instances: Array<{
    key: string;
    states: string[];
    targetId: string;
    values: number[];
  }> = [];
  for (let index = 0; index < count; index += 1) {
    const key = readString(cursor, "インスタンス ID");
    const targetId = readString(cursor, "インスタンス参照先");
    // position(x, y, z) と rotation(w, x, y, z)。OCS の ReadVector3 / ReadVector4(wFirst) と同じ順。
    const values = [
      readFloat(cursor),
      readFloat(cursor),
      readFloat(cursor),
      readFloat(cursor),
      readFloat(cursor),
      readFloat(cursor),
      readFloat(cursor),
    ];

    const stateCount = readCount(cursor, "インスタンス状態", minimumKeySize);
    const states: string[] = [];
    for (let innerIndex = 0; innerIndex < stateCount; innerIndex += 1) {
      states.push(readString(cursor, "インスタンス状態"));
    }

    instances.push({
      key,
      states,
      targetId,
      values,
    });
  }
  return instances;
};

// --- ヘッダ -----------------------------------------------------------------------

interface ParsedHeaderResult {
  header: ModHeader;
  recordCount: number;
}

const readMergeData = (cursor: BinaryCursor, headerEnd: number) => {
  let saveCount = 0;
  let lastMerge = 0;
  const mergeEntries: MergeEntry[] = [];
  const deleteRequests: DeleteRequest[] = [];

  if (cursor.position < headerEnd) {
    saveCount = readUInt(cursor);
    lastMerge = readUInt(cursor);

    const mergeEntryCount = readUnsignedChar(cursor);
    for (let index = 0; index < mergeEntryCount; index += 1) {
      mergeEntries.push({
        key: readString(cursor, "マージ元"),
        version1: readUInt(cursor),
        version2: readUInt(cursor),
      });
    }
  }

  // OCS の OcsReader.ReadDeleteRequests と同じく キー / バージョン / 対象 (1 つの文字列)。
  if (cursor.position < headerEnd) {
    const deleteRequestCount = readUnsignedChar(cursor);
    for (let index = 0; index < deleteRequestCount; index += 1) {
      deleteRequests.push({
        key: readString(cursor, "削除リクエスト"),
        version: readUInt(cursor),
        items: readString(cursor, "削除リクエスト対象"),
      });
    }
  }

  return { deleteRequests, lastMerge, mergeEntries, saveCount };
};

const readHeaderAndCount = (cursor: BinaryCursor, warnings: string[]): ParsedHeaderResult => {
  const fileType = readInt(cursor);

  if (fileType !== legacyModFileType && fileType !== mergeModFileType) {
    throw new ModParseError(
      `未対応のファイル形式です (fileType=${fileType})。Kenshi の .mod / .base ではない可能性があります。`,
      0,
    );
  }

  let headerEnd = 0;
  if (fileType === mergeModFileType) {
    const headerLength = readInt(cursor);
    headerEnd = cursor.position + headerLength;
    if (headerLength < 0 || headerEnd > cursor.view.byteLength) {
      throw new ModParseError(`ヘッダ長が不正です (${headerLength})`, cursor.position - 4);
    }
  }

  const version = readInt(cursor);
  const author = readString(cursor, "作者");
  const description = readString(cursor, "説明");
  const dependencies = readCommaList(cursor, "依存 mod");
  const references = readCommaList(cursor, "参照 mod");

  let mergeData: ReturnType<typeof readMergeData> = {
    deleteRequests: [],
    lastMerge: 0,
    mergeEntries: [],
    saveCount: 0,
  };

  if (fileType === mergeModFileType) {
    try {
      mergeData = readMergeData(cursor, headerEnd);
    } catch (error) {
      // マージ情報は表示用なので、読めなくてもヘッダ長に従ってレコードの読み取りを続ける。
      warnings.push(`ヘッダのマージ情報を読み取れませんでした: ${describeError(error)}`);
    }
    cursor.position = headerEnd;
  }

  const lastId = readInt(cursor);
  const recordCount = readCount(cursor, "レコード", 24);

  return {
    header: {
      author,
      deleteRequests: mergeData.deleteRequests,
      dependencies,
      description,
      fileType,
      lastId,
      lastMerge: mergeData.lastMerge,
      mergeEntries: mergeData.mergeEntries,
      references,
      saveCount: mergeData.saveCount,
      version,
    },
    recordCount,
  };
};

// --- レコード ---------------------------------------------------------------------

interface ParsedRecord {
  inspectorRecord: InspectorRecord;
  textRecord: TextRecord | null;
}

const readRecord = (cursor: BinaryCursor, modName: string, uid: string): ParsedRecord => {
  const type = readInt(cursor);
  readInt(cursor); // 数値 ID (FCS 内部用。stringId が実際の識別子)
  const name = readString(cursor, "レコード名");
  const stringId = readString(cursor, "stringId");
  const saveData = decodeSaveData(readUInt(cursor));

  const boolValues = readBooleanBlock(cursor);
  const floatValues = readFloatBlock(cursor);
  const intValues = readIntBlock(cursor);
  const vector3Values = readVector3Block(cursor);
  const vector4Values = readVector4Block(cursor);
  const strings = readKeyedStringBlock(cursor, "文字列");
  const fileValues = readKeyedStringBlock(cursor, "ファイル");
  const referenceCategories = readReferenceCategories(cursor);
  const instanceValues = readInstanceBlock(cursor);

  const referenceCount = referenceCategories.reduce(
    (sum, category) => sum + category.references.length,
    0,
  );
  const removed = boolValues.some((entry) => entry.value && removedItemFlagKeys.has(entry.key));

  const inspectorRecord: InspectorRecord = {
    counts: {
      bools: boolValues.length,
      files: fileValues.length,
      floats: floatValues.length,
      instances: instanceValues.length,
      ints: intValues.length,
      referenceCategories: referenceCategories.length,
      references: referenceCount,
      strings: strings.length,
      vector3s: vector3Values.length,
      vector4s: vector4Values.length,
    },
    modName,
    name,
    referenceCategories,
    removed,
    saveData,
    stringId,
    strings,
    type,
    uid,
    values: {
      bools: boolValues,
      files: fileValues,
      floats: floatValues,
      ints: intValues,
      instances: instanceValues,
      vector3s: vector3Values,
      vector4s: vector4Values,
    },
  };

  return {
    inspectorRecord,
    textRecord: extractTextRecord(inspectorRecord),
  };
};

const extractTextRecord = (record: InspectorRecord): TextRecord | null => {
  if (record.removed) {
    return null;
  }

  const baseRecord = {
    modName: record.modName,
    name: record.name,
    saveData: record.saveData,
    stringId: record.stringId,
    type: record.type,
  };

  if (record.type === dialogTypeCode) {
    const texts: DialogText[] = record.strings
      .filter((entry) => entry.key.startsWith("text"))
      .map((entry) => ({ original: entry.value, textId: entry.key }));

    if (texts.length === 0) {
      return null;
    }

    return {
      ...baseRecord,
      kind: "dialog",
      texts,
    } satisfies DialogRecord;
  }

  if (!(getItemTypeDefinition(record.type)?.textRelevant ?? false)) {
    return null;
  }

  const description = record.strings.find((entry) => entry.key === "description")?.value ?? "";
  // 名前を変えていない変更レコードは、説明文が無ければテキストとして抽出する意味がない。
  if (record.saveData.changeTypeName === "Changed" && description.length === 0) {
    return null;
  }

  return {
    ...baseRecord,
    description,
    kind: "entity",
  } satisfies EntityRecord;
};

export const parseMod = (
  data: ArrayBuffer | Uint8Array,
  modName: string,
  uidPrefix: string = modName,
): ParsedMod => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const cursor: BinaryCursor = {
    bytes,
    position: 0,
    view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  };
  const warnings: string[] = [];

  const { header, recordCount } = readHeaderAndCount(cursor, warnings);

  const textRecords: TextRecord[] = [];
  const inspectorRecords: InspectorRecord[] = [];

  for (let recordIndex = 0; recordIndex < recordCount; recordIndex += 1) {
    const recordStart = cursor.position;
    // 新しい FCS はレコード長 (この int 自身を含む) を書き込む。古いファイルや一部のツールは 0。
    const declaredLength = readInt(cursor);
    const declaredEnd = declaredLength > 0 ? recordStart + declaredLength : null;
    const canResync = declaredEnd !== null && declaredEnd <= cursor.view.byteLength;

    let parsed: ParsedRecord;
    try {
      parsed = readRecord(cursor, modName, `${uidPrefix}:${recordIndex}`);
    } catch (error) {
      if (!canResync) {
        throw new ModParseError(
          `レコード #${recordIndex} (offset ${recordStart}) の解析に失敗しました: ${describeError(error)}`,
          recordStart,
        );
      }
      warnings.push(
        `レコード #${recordIndex} (offset ${recordStart}) を解析できなかったためスキップしました: ${describeError(error)}`,
      );
      cursor.position = declaredEnd;
      continue;
    }

    if (canResync && cursor.position !== declaredEnd) {
      warnings.push(
        `レコード #${recordIndex} (${parsed.inspectorRecord.stringId}) の長さが宣言値と一致しません (宣言 ${declaredLength} / 実際 ${cursor.position - recordStart} バイト)。宣言値に合わせて読み進めました。`,
      );
      cursor.position = declaredEnd;
    }

    inspectorRecords.push(parsed.inspectorRecord);
    if (parsed.textRecord) {
      textRecords.push(parsed.textRecord);
    }
  }

  if (cursor.position !== cursor.view.byteLength) {
    warnings.push(
      `ファイル末尾に解析されていない ${cursor.view.byteLength - cursor.position} バイトがあります。`,
    );
  }

  return {
    header,
    inspectorRecords,
    textRecords,
    warnings,
  };
};
