import { getItemTypeDefinition } from './item-types.ts';
import type {
  DialogRecord,
  DialogText,
  EntityRecord,
  InspectorRecord,
  ModHeader,
  ReferenceCategory,
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
  return value !== 0;
};

const textDecoder = new TextDecoder('utf-8');

const repairCommonMojibake = (value: string) =>
  value
    .replace(/â€”|â€“/g, '-')
    .replace(/â€¦/g, '...')
    .replace(/â€˜|â€™/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/Â /g, ' ')
    .replace(/Â/g, '');

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

  return repairCommonMojibake(textDecoder.decode(bytes));
};

const readCommaList = (cursor: BinaryCursor) =>
  readString(cursor)
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

const getChangeTypeName = (changeType: number) => {
  switch (changeType) {
    case 0:
      return 'New';
    case 1:
      return 'Changed';
    case 2:
      return 'Renamed';
    default:
      return `Unknown(${changeType})`;
  }
};

const decodeSaveData = (rawValue: number) => {
  const raw = rawValue >>> 0;
  const changeType = raw & 0xf;

  return {
    changeType,
    changeTypeName: getChangeTypeName(changeType),
    raw,
    saveCount: raw >>> 4,
  };
};

const readBooleanBlock = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  const values: Array<{ key: string; value: boolean }> = [];
  for (let index = 0; index < count; index += 1) {
    const key = readString(cursor);
    const value = readBoolean(cursor);
    values.push({ key, value });
  }
  return values;
};

const readFloatBlock = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  const values: Array<{ key: string; value: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const key = readString(cursor);
    const value = readFloat(cursor);
    values.push({ key, value });
  }
  return values;
};

const readIntBlock = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  const values: Array<{ key: string; value: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const key = readString(cursor);
    const value = readInt(cursor);
    values.push({ key, value });
  }
  return values;
};

const readVector3Block = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  const values: Array<{ key: string; x: number; y: number; z: number }> = [];
  for (let index = 0; index < count; index += 1) {
    values.push({
      key: readString(cursor),
      x: readFloat(cursor),
      y: readFloat(cursor),
      z: readFloat(cursor),
    });
  }
  return values;
};

const readVector4Block = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  const values: Array<{
    key: string;
    w: number;
    x: number;
    y: number;
    z: number;
  }> = [];
  for (let index = 0; index < count; index += 1) {
    values.push({
      key: readString(cursor),
      x: readFloat(cursor),
      y: readFloat(cursor),
      z: readFloat(cursor),
      w: readFloat(cursor),
    });
  }
  return values;
};

const readFileBlock = (cursor: BinaryCursor) => {
  const count = readInt(cursor);
  const values: Array<{ key: string; value: string }> = [];
  for (let index = 0; index < count; index += 1) {
    values.push({
      key: readString(cursor),
      value: readString(cursor),
    });
  }
  return values;
};

const readReferenceCategories = (
  cursor: BinaryCursor,
): ReferenceCategory[] => {
  const categoryCount = readInt(cursor);
  const categories: ReferenceCategory[] = [];

  for (let index = 0; index < categoryCount; index += 1) {
    const name = readString(cursor);
    const referenceCount = readInt(cursor);
    const references: ReferenceCategory['references'] = [];

    for (let innerIndex = 0; innerIndex < referenceCount; innerIndex += 1) {
      references.push({
        targetId: readString(cursor),
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
  const count = readInt(cursor);
  const instances: Array<{
    key: string;
    states: string[];
    targetId: string;
    values: number[];
  }> = [];
  for (let index = 0; index < count; index += 1) {
    const key = readString(cursor);
    const targetId = readString(cursor);
    const values = [
      readFloat(cursor),
      readFloat(cursor),
      readFloat(cursor),
      readFloat(cursor),
      readFloat(cursor),
      readFloat(cursor),
      readFloat(cursor),
    ];

    const stateCount = readInt(cursor);
    const states: string[] = [];
    for (let innerIndex = 0; innerIndex < stateCount; innerIndex += 1) {
      states.push(readString(cursor));
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
    const saveData = decodeSaveData(dataType);

    const baseRecord = {
      modName,
      name,
      saveData,
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

    const boolValues = readBooleanBlock(cursor);
    const floatValues = readFloatBlock(cursor);
    const intValues = readIntBlock(cursor);
    const vector3Values = readVector3Block(cursor);
    const vector4Values = readVector4Block(cursor);

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

    const fileValues = readFileBlock(cursor);
    const referenceCategories = readReferenceCategories(cursor);
    const referenceCount = referenceCategories.reduce(
      (sum, category) => sum + category.references.length,
      0,
    );
    const instanceValues = readInstanceBlock(cursor);

    inspectorRecords.push({
      counts: {
        bools: boolValues.length,
        files: fileValues.length,
        floats: floatValues.length,
        instances: instanceValues.length,
        ints: intValues.length,
        referenceCategories: referenceCategories.length,
        references: referenceCount,
        strings: totalStrings,
        vector3s: vector3Values.length,
        vector4s: vector4Values.length,
      },
      modName,
      name,
      referenceCategories,
      saveData,
      stringId,
      strings,
      type,
      uid: `${uidPrefix}:${recordIndex}`,
      values: {
        bools: boolValues,
        files: fileValues,
        floats: floatValues,
        ints: intValues,
        instances: instanceValues,
        vector3s: vector3Values,
        vector4s: vector4Values,
      },
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
