import { getItemTypeDefinition } from './item-types.ts';
import type {
  DialogRecord,
  DialogText,
  EntityRecord,
  InspectorRecord,
  ModHeader,
  TextRecord,
} from './models.ts';

const dialogTypeCode = 19;

interface BinaryCursor {
  position: number;
  view: DataView;
}

export interface ParsedMod {
  header: ModHeader;
  inspectorRecords: InspectorRecord[];
  textRecords: TextRecord[];
}

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
  data: ArrayBuffer | Uint8Array,
  modName: string,
  uidPrefix: string = modName,
): ParsedMod => {
  const cursor: BinaryCursor = {
    position: 0,
    view:
      data instanceof Uint8Array
        ? new DataView(data.buffer, data.byteOffset, data.byteLength)
        : new DataView(data),
  };

  const { header, recordCount } = readHeaderAndCount(cursor);

  const textRecords: TextRecord[] = [];
  const inspectorRecords: InspectorRecord[] = [];

  for (let recordIndex = 0; recordIndex < recordCount; recordIndex += 1) {
    readInt(cursor);
    const type = readInt(cursor);
    readInt(cursor);
    const name = readString(cursor);
    const stringId = readString(cursor);
    const dataType = readInt(cursor);

    const baseRecord = {
      modName,
      name,
      stringId,
      type,
    };

    const typeDefinition = getItemTypeDefinition(type);
    const isTypeTextRelevant = typeDefinition?.textRelevant ?? false;
    const isDialogType = type === dialogTypeCode;
    const canExtractNameOrDescription =
      isTypeTextRelevant && !isDialogType && (dataType & 0b11) !== 1;

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

      if (key === 'description' && isTypeTextRelevant && !isDialogType) {
        description = value;
      }

      if (isDialogType && key.startsWith('text')) {
        dialogTexts.push({
          original: value,
          textId: key,
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
      uid: `${uidPrefix}:${recordIndex}`,
    });

    if (isDialogType && dialogTexts.length > 0) {
      textRecords.push({
        ...baseRecord,
        kind: 'dialog',
        texts: dialogTexts,
      } satisfies DialogRecord);
      continue;
    }

    if (canExtractNameOrDescription || (isTypeTextRelevant && description.length > 0)) {
      textRecords.push({
        ...baseRecord,
        description,
        kind: 'entity',
      } satisfies EntityRecord);
    }
  }

  return {
    header,
    inspectorRecords,
    textRecords,
  };
};
