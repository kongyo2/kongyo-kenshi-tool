import { getItemTypeDefinition } from './item-types.ts';
import type {
  DialogRecord,
  DialogText,
  InspectorRecord,
  ModHeader,
  TranslationProject,
  TranslationRecord,
} from './models.ts';

const dialogTypeCode = 19;

interface BinaryCursor {
  position: number;
  view: DataView;
}

interface BinaryWriter {
  buffer: ArrayBuffer;
  position: number;
  view: DataView;
}

interface ExportDialogRecord {
  kind: 'dialog';
  name: string;
  stringId: string;
  texts: Array<{
    textId: string;
    translation: string;
  }>;
  type: number;
}

interface ExportEntityRecord {
  descriptionTranslation: string;
  kind: 'entity';
  name: string;
  nameTranslation: string;
  stringId: string;
  type: number;
}

type ExportRecord = ExportDialogRecord | ExportEntityRecord;

export interface ParsedMod {
  header: ModHeader;
  inspectorRecords: InspectorRecord[];
  translationRecords: TranslationRecord[];
}

const createBinaryWriter = (initialSize = 4096): BinaryWriter => {
  const buffer = new ArrayBuffer(initialSize);
  return {
    buffer,
    position: 0,
    view: new DataView(buffer),
  };
};

const ensureWriterCapacity = (
  writer: BinaryWriter,
  requiredSize: number,
) => {
  if (requiredSize <= writer.buffer.byteLength) {
    return;
  }

  let nextSize = writer.buffer.byteLength * 2;
  while (nextSize < requiredSize) {
    nextSize *= 2;
  }

  const nextBuffer = new ArrayBuffer(nextSize);
  new Uint8Array(nextBuffer).set(new Uint8Array(writer.buffer));
  writer.buffer = nextBuffer;
  writer.view = new DataView(nextBuffer);
};

const readInt = (cursor: BinaryCursor) => {
  const value = cursor.view.getInt32(cursor.position, true);
  cursor.position += 4;
  return value;
};

const readUInt = (cursor: BinaryCursor) => {
  const value = cursor.view.getUint32(cursor.position, true);
  cursor.position += 4;
  return value;
};

const readUnsignedChar = (cursor: BinaryCursor) => {
  const value = cursor.view.getUint8(cursor.position);
  cursor.position += 1;
  return value;
};

const readFloat = (cursor: BinaryCursor) => {
  const value = cursor.view.getFloat32(cursor.position, true);
  cursor.position += 4;
  return value;
};

const readBoolean = (cursor: BinaryCursor) => {
  const value = cursor.view.getUint8(cursor.position);
  cursor.position += 1;
  return value;
};

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

const readString = (cursor: BinaryCursor) => {
  const length = readInt(cursor);
  if (length <= 0) {
    return '';
  }

  const bytes = new Uint8Array(
    cursor.view.buffer,
    cursor.view.byteOffset + cursor.position,
    length,
  );
  cursor.position += length;

  return textDecoder.decode(bytes);
};

const readCommaList = (cursor: BinaryCursor) =>
  readString(cursor)
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

const writeInt = (writer: BinaryWriter, value: number) => {
  ensureWriterCapacity(writer, writer.position + 4);
  writer.view.setInt32(writer.position, value, true);
  writer.position += 4;
};

const writeString = (writer: BinaryWriter, value: string) => {
  const encoded = textEncoder.encode(value);
  writeInt(writer, encoded.length);

  ensureWriterCapacity(writer, writer.position + encoded.length);
  new Uint8Array(writer.buffer, writer.position, encoded.length).set(encoded);
  writer.position += encoded.length;
};

const toArrayBuffer = (writer: BinaryWriter) =>
  writer.buffer.slice(0, writer.position);

const skipBooleanBlock = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  for (let index = 0; index < count; index += 1) {
    readString(cursor);
    readBoolean(cursor);
  }
  return count;
};

const skipFloatBlock = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  for (let index = 0; index < count; index += 1) {
    readString(cursor);
    readFloat(cursor);
  }
  return count;
};

const skipIntBlock = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  for (let index = 0; index < count; index += 1) {
    readString(cursor);
    readInt(cursor);
  }
  return count;
};

const skipVector3Block = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  for (let index = 0; index < count; index += 1) {
    readString(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
  }
  return count;
};

const skipVector4Block = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  for (let index = 0; index < count; index += 1) {
    readString(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
  }
  return count;
};

const skipFileBlock = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  for (let index = 0; index < count; index += 1) {
    readString(cursor);
    readString(cursor);
  }
  return count;
};

interface ReferenceCounts {
  categoryCount: number;
  totalReferences: number;
}

const skipReferenceCategories = (cursor: BinaryCursor): ReferenceCounts => {
  const categoryCount = readInt(cursor);
  let totalReferences = 0;

  for (let index = 0; index < categoryCount; index += 1) {
    readString(cursor);
    const referenceCount = readInt(cursor);
    totalReferences += referenceCount;
    for (let innerIndex = 0; innerIndex < referenceCount; innerIndex += 1) {
      readString(cursor);
      readInt(cursor);
      readInt(cursor);
      readInt(cursor);
    }
  }

  return { categoryCount, totalReferences };
};

const skipInstanceBlock = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  for (let index = 0; index < count; index += 1) {
    readString(cursor);
    readString(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);

    const stateCount = readInt(cursor);
    for (let innerIndex = 0; innerIndex < stateCount; innerIndex += 1) {
      readString(cursor);
    }
  }
  return count;
};

interface ParsedHeaderResult {
  header: ModHeader;
  recordCount: number;
}

const readHeaderAndCount = (cursor: BinaryCursor): ParsedHeaderResult => {
  const fileType = readInt(cursor);

  if (fileType === 16) {
    const version = readInt(cursor);
    const author = readString(cursor);
    const description = readString(cursor);
    const dependencies = readCommaList(cursor);
    const references = readCommaList(cursor);
    readInt(cursor);
    const recordCount = readInt(cursor);

    return {
      header: {
        author,
        dependencies,
        description,
        fileType,
        references,
        version,
      },
      recordCount,
    };
  }

  if (fileType === 17) {
    const headerLength = readInt(cursor);
    const headerEnd = cursor.position + headerLength;

    const version = readInt(cursor);
    const author = readString(cursor);
    const description = readString(cursor);
    const dependencies = readCommaList(cursor);
    const references = readCommaList(cursor);

    if (cursor.position < headerEnd) {
      readUInt(cursor);
      readUInt(cursor);

      const mergeEntryCount = readUnsignedChar(cursor);
      for (let index = 0; index < mergeEntryCount; index += 1) {
        readString(cursor);
        readUInt(cursor);
        readUInt(cursor);
      }
    }

    if (cursor.position < headerEnd) {
      const deleteRequestCount = readUnsignedChar(cursor);
      for (let index = 0; index < deleteRequestCount; index += 1) {
        readString(cursor);
        readUInt(cursor);
        const itemCount = readInt(cursor);
        for (let innerIndex = 0; innerIndex < itemCount; innerIndex += 1) {
          readString(cursor);
        }
      }
    }

    cursor.position = headerEnd;

    readInt(cursor);
    const recordCount = readInt(cursor);

    return {
      header: {
        author,
        dependencies,
        description,
        fileType,
        references,
        version,
      },
      recordCount,
    };
  }

  throw new Error(`未対応のmod形式です(fileType=${fileType})。`);
};

export const parseMod = (
  buffer: ArrayBuffer,
  modName: string,
): ParsedMod => {
  const cursor: BinaryCursor = {
    position: 0,
    view: new DataView(buffer),
  };

  const { header, recordCount } = readHeaderAndCount(cursor);

  const translationRecords: TranslationRecord[] = [];
  const inspectorRecords: InspectorRecord[] = [];

  for (let recordIndex = 0; recordIndex < recordCount; recordIndex += 1) {
    readInt(cursor);
    const type = readInt(cursor);
    readInt(cursor);
    const name = readString(cursor);
    const stringId = readString(cursor);
    const dataType = readInt(cursor);

    const baseRecord = {
      name,
      stringId,
      type,
    };

    const typeDefinition = getItemTypeDefinition(type);
    const canEditEntityFields =
      (typeDefinition?.translatable ?? false) &&
      type !== dialogTypeCode &&
      (dataType & 0b11) !== 1;
    const isDialogType = type === dialogTypeCode;

    let description = '';
    const dialogTexts: DialogText[] = [];

    const boolCount = skipBooleanBlock(cursor);
    const floatCount = skipFloatBlock(cursor);
    const intCount = skipIntBlock(cursor);
    const vector3Count = skipVector3Block(cursor);
    const vector4Count = skipVector4Block(cursor);

    const strings: Array<{ key: string; value: string }> = [];
    let stringCount = readInt(cursor);
    const totalStrings = stringCount;

    while (stringCount > 0) {
      const key = readString(cursor);
      const value = readString(cursor);
      strings.push({ key, value });

      if (key === 'description' && canEditEntityFields) {
        description = value;
      }

      if (isDialogType && key.startsWith('text')) {
        dialogTexts.push({
          original: value,
          textId: key,
          translation: '',
        });
      }

      stringCount -= 1;
    }

    const fileCount = skipFileBlock(cursor);
    const referenceCounts = skipReferenceCategories(cursor);
    const instanceCount = skipInstanceBlock(cursor);

    inspectorRecords.push({
      counts: {
        bools: boolCount,
        files: fileCount,
        floats: floatCount,
        instances: instanceCount,
        ints: intCount,
        referenceCategories: referenceCounts.categoryCount,
        references: referenceCounts.totalReferences,
        strings: totalStrings,
        vector3s: vector3Count,
        vector4s: vector4Count,
      },
      modName,
      name,
      stringId,
      strings,
      type,
    });

    if (isDialogType && dialogTexts.length > 0) {
      translationRecords.push({
        ...baseRecord,
        kind: 'dialog',
        texts: dialogTexts,
      } satisfies DialogRecord);
      continue;
    }

    if (canEditEntityFields) {
      translationRecords.push({
        ...baseRecord,
        description,
        descriptionTranslation: '',
        kind: 'entity',
        nameTranslation: '',
      });
    }
  }

  return {
    header,
    inspectorRecords,
    translationRecords,
  };
};

export const createTranslationModBuffer = (
  project: TranslationProject,
) => {
  const exportRecords: ExportRecord[] = [];

  for (const record of project.records) {
    if (record.kind === 'dialog') {
      const translatedTexts = record.texts
        .filter((text) => text.translation.length > 0)
        .map((text) => ({
          textId: text.textId,
          translation: text.translation,
        }));

      if (translatedTexts.length > 0) {
        exportRecords.push({
          kind: 'dialog',
          name: record.name,
          stringId: record.stringId,
          texts: translatedTexts,
          type: record.type,
        });
      }

      continue;
    }

    if (
      record.nameTranslation.length === 0 &&
      record.descriptionTranslation.length === 0
    ) {
      continue;
    }

    exportRecords.push({
      descriptionTranslation: record.descriptionTranslation,
      kind: 'entity',
      name: record.name,
      nameTranslation: record.nameTranslation,
      stringId: record.stringId,
      type: record.type,
    });
  }

  if (exportRecords.length === 0) {
    throw new Error(
      '翻訳済みの項目がありません。翻訳を入力してから保存してください。',
    );
  }

  const dependencyList = project.dependencies
    .map((dependency) => `${dependency}.mod`)
    .join(',');
  const writer = createBinaryWriter();

  writeInt(writer, 16);
  writeInt(writer, 1);
  writeString(writer, '');
  writeString(writer, `${dependencyList} の翻訳`);
  writeString(writer, dependencyList);
  writeString(writer, '');
  writeInt(writer, 0x004c67a6);
  writeInt(writer, exportRecords.length);

  for (const record of exportRecords) {
    writeInt(writer, 0);
    writeInt(writer, record.type);
    writeInt(writer, 0);

    const hasNameTranslation =
      record.kind === 'entity' && record.nameTranslation.length > 0;

    if (record.kind === 'entity' && hasNameTranslation) {
      writeString(writer, record.nameTranslation);
    } else {
      writeString(writer, record.name);
    }

    writeString(writer, record.stringId);
    writeInt(
      writer,
      hasNameTranslation ? -2147483645 : -2147483647,
    );
    writeInt(writer, 0);
    writeInt(writer, 0);
    writeInt(writer, 0);
    writeInt(writer, 0);
    writeInt(writer, 0);

    if (record.kind === 'dialog') {
      writeInt(writer, record.texts.length);
      record.texts.forEach((text) => {
        writeString(writer, text.textId);
        writeString(writer, text.translation);
      });
    } else if (record.descriptionTranslation.length > 0) {
      writeInt(writer, 1);
      writeString(writer, 'description');
      writeString(writer, record.descriptionTranslation);
    } else {
      writeInt(writer, 0);
    }

    writeInt(writer, 0);
    writeInt(writer, 0);
    writeInt(writer, 0);
  }

  return toArrayBuffer(writer);
};
