import type {
  DialogRecord,
  DialogText,
  ExportOptions,
  TranslationProject,
  TranslationRecord,
} from './models.ts';

const editableTypeCodes = new Set([
  0, 1, 2, 3, 4, 7, 10, 13, 21, 46, 51, 62, 64, 76, 107, 111,
]);
const dialogTypeCode = 19;
const wordSwapMarkers = [
  '∩∩∩',
  '∪∪∪',
  '⊂⊂⊂',
  '⊃⊃⊃',
  '⊆⊆⊆',
  '⊇⊇⊇',
  '∈∈∈',
  '∋∋∋',
];

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

const createBinaryWriter = (initialSize = 1024): BinaryWriter => {
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
  const currentBytes = new Uint8Array(writer.buffer);
  new Uint8Array(nextBuffer).set(currentBytes);
  writer.buffer = nextBuffer;
  writer.view = new DataView(nextBuffer);
};

const readInt = (cursor: BinaryCursor) => {
  const value = cursor.view.getInt32(cursor.position, true);
  cursor.position += 4;
  return value;
};

const readChar = (cursor: BinaryCursor) => {
  const value = cursor.view.getInt8(cursor.position);
  cursor.position += 1;
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
  const value = cursor.view.getInt8(cursor.position);
  cursor.position += 1;
  return value;
};

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

const readString = (cursor: BinaryCursor) => {
  const length = readInt(cursor);
  const bytes = new Uint8Array(length);

  for (let index = 0; index < length; index += 1) {
    bytes[index] = readUnsignedChar(cursor);
  }

  return textDecoder.decode(bytes);
};

const writeInt = (writer: BinaryWriter, value: number) => {
  ensureWriterCapacity(writer, writer.position + 4);
  writer.view.setInt32(writer.position, value, true);
  writer.position += 4;
};

const writeUnsignedChar = (writer: BinaryWriter, value: number) => {
  ensureWriterCapacity(writer, writer.position + 1);
  writer.view.setUint8(writer.position, value);
  writer.position += 1;
};

const writeString = (writer: BinaryWriter, value: string) => {
  const encoded = textEncoder.encode(value);
  writeInt(writer, encoded.length);

  for (const currentByte of encoded) {
    writeUnsignedChar(writer, currentByte);
  }
};

const toArrayBuffer = (writer: BinaryWriter) =>
  writer.buffer.slice(0, writer.position);

const swapWordsInText = (value: string) => {
  const uniqueWords = Array.from(
    new Set(value.match(/\/.+?\//g) ?? []),
  ).slice(0, wordSwapMarkers.length);
  let swappedText = value;

  uniqueWords.forEach((currentWord, index) => {
    const escapedWord = currentWord.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
    swappedText = swappedText.replace(
      new RegExp(escapedWord, 'g'),
      wordSwapMarkers[index],
    );
  });

  return {
    swappedText,
    wordswapMap: uniqueWords,
  };
};

const restoreWordSwap = (value: string, wordswapMap: string[]) => {
  let restoredText = value;

  wordswapMap.forEach((currentWord, index) => {
    restoredText = restoredText.replace(
      new RegExp(wordSwapMarkers[index], 'g'),
      currentWord,
    );
  });

  return restoredText;
};

const swapWordsInDialogTexts = (texts: DialogText[]) => {
  const combinedText = texts.map((text) => text.original).join('\n');
  const uniqueWords = Array.from(
    new Set(combinedText.match(/\/.+?\//g) ?? []),
  ).slice(0, wordSwapMarkers.length);

  const swappedTexts = texts.map((text) => {
    let currentOriginal = text.original;
    uniqueWords.forEach((currentWord, index) => {
      const escapedWord = currentWord.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      );
      currentOriginal = currentOriginal.replace(
        new RegExp(escapedWord, 'g'),
        wordSwapMarkers[index],
      );
    });

    return {
      ...text,
      original: currentOriginal,
    };
  });

  return {
    swappedTexts,
    wordswapMap: uniqueWords,
  };
};

const skipBooleanBlock = (cursor: BinaryCursor) => {
  let count = readInt(cursor);

  while (count > 0) {
    readString(cursor);
    readBoolean(cursor);
    count -= 1;
  }
};

const skipFloatBlock = (cursor: BinaryCursor) => {
  let count = readInt(cursor);

  while (count > 0) {
    readString(cursor);
    readFloat(cursor);
    count -= 1;
  }
};

const skipLongBlock = (cursor: BinaryCursor) => {
  let count = readInt(cursor);

  while (count > 0) {
    readString(cursor);
    readInt(cursor);
    count -= 1;
  }
};

const skipVector3Block = (cursor: BinaryCursor) => {
  let count = readInt(cursor);

  while (count > 0) {
    readString(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
    count -= 1;
  }
};

const skipVector4Block = (cursor: BinaryCursor) => {
  let count = readInt(cursor);

  while (count > 0) {
    readString(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
    count -= 1;
  }
};

const skipPathStringBlock = (cursor: BinaryCursor) => {
  let count = readInt(cursor);

  while (count > 0) {
    readString(cursor);
    readString(cursor);
    count -= 1;
  }
};

const skipExtraDataBlock = (cursor: BinaryCursor) => {
  let count = readInt(cursor);

  while (count > 0) {
    readString(cursor);
    let nestedCount = readInt(cursor);

    while (nestedCount > 0) {
      readString(cursor);
      readInt(cursor);
      readInt(cursor);
      readInt(cursor);
      nestedCount -= 1;
    }

    count -= 1;
  }
};

const skipInstanceDataBlock = (cursor: BinaryCursor) => {
  let count = readInt(cursor);

  while (count > 0) {
    readString(cursor);
    readString(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);
    readFloat(cursor);

    let nestedCount = readInt(cursor);
    while (nestedCount > 0) {
      readString(cursor);
      nestedCount -= 1;
    }

    count -= 1;
  }
};

const readHeader = (cursor: BinaryCursor) => {
  const fileType = readInt(cursor);

  if (fileType === 16) {
    readInt(cursor);
    readString(cursor);
    readString(cursor);
    readString(cursor);
    readString(cursor);
    readInt(cursor);
    return readInt(cursor);
  }

  if (fileType === 17) {
    const headerLength = readInt(cursor);
    readInt(cursor);
    readString(cursor);
    readString(cursor);
    readString(cursor);
    readString(cursor);
    readInt(cursor);
    readInt(cursor);
    readChar(cursor);

    if (headerLength > 0) {
      cursor.position = headerLength + 8;
    }

    readInt(cursor);
    return readInt(cursor);
  }

  throw new Error('未対応のmod形式です。');
};

export const parseModBuffer = (
  buffer: ArrayBuffer,
  replaceWordSwap: boolean,
) => {
  const cursor: BinaryCursor = {
    position: 0,
    view: new DataView(buffer),
  };
  let recordCount = readHeader(cursor);
  const parsedRecords: TranslationRecord[] = [];

  while (recordCount > 0) {
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
      wordswapMap: [] as string[],
    };
    let shouldIncludeRecord = false;
    const canEditNameOrDescription =
      editableTypeCodes.has(type) && (dataType & 0b11) !== 1;
    let description = '';
    const dialogTexts: DialogText[] = [];

    if (canEditNameOrDescription) {
      shouldIncludeRecord = true;
    }

    skipBooleanBlock(cursor);
    skipFloatBlock(cursor);
    skipLongBlock(cursor);
    skipVector3Block(cursor);
    skipVector4Block(cursor);

    let stringCount = readInt(cursor);
    while (stringCount > 0) {
      const key = readString(cursor);
      const value = readString(cursor);

      if (key === 'description' && editableTypeCodes.has(type)) {
        if (replaceWordSwap) {
          const swappedDescription = swapWordsInText(value);
          description = swappedDescription.swappedText;
          baseRecord.wordswapMap = swappedDescription.wordswapMap;
        } else {
          description = value;
        }
        shouldIncludeRecord = true;
      }

      if (type === dialogTypeCode && key.startsWith('text')) {
        dialogTexts.push({
          original: value,
          textId: key,
          translation: '',
        });
        shouldIncludeRecord = true;
      }

      stringCount -= 1;
    }

    skipPathStringBlock(cursor);
    skipExtraDataBlock(cursor);
    skipInstanceDataBlock(cursor);

    if (type === dialogTypeCode) {
      if (replaceWordSwap && shouldIncludeRecord) {
        const swappedTexts = swapWordsInDialogTexts(dialogTexts);
        parsedRecords.push({
          ...baseRecord,
          kind: 'dialog',
          texts: swappedTexts.swappedTexts,
          wordswapMap: swappedTexts.wordswapMap,
        } satisfies DialogRecord);
      } else if (shouldIncludeRecord) {
        parsedRecords.push({
          ...baseRecord,
          kind: 'dialog',
          texts: dialogTexts,
        } satisfies DialogRecord);
      }
    } else if (shouldIncludeRecord) {
      parsedRecords.push({
        ...baseRecord,
        description,
        descriptionTranslation: '',
        kind: 'entity',
        nameTranslation: '',
      });
    }

    recordCount -= 1;
  }

  return parsedRecords;
};

const createExportRecords = (
  project: TranslationProject,
  exportOptions: ExportOptions,
) => {
  const exportRecords: ExportRecord[] = [];

  for (const record of project.records) {
    if (record.kind === 'dialog') {
      if (!exportOptions.includeDialogs) {
        continue;
      }

      const translatedTexts = record.texts
        .filter((text) => text.translation.length > 0)
        .map((text) => ({
          textId: text.textId,
          translation:
            record.wordswapMap.length > 0
              ? restoreWordSwap(text.translation, record.wordswapMap)
              : text.translation,
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

    const nameTranslation = exportOptions.includeNames
      ? record.nameTranslation
      : '';
    const descriptionTranslation = exportOptions.includeDescriptions
      ? record.descriptionTranslation
      : '';
    const restoredDescription =
      descriptionTranslation.length > 0 && record.wordswapMap.length > 0
        ? restoreWordSwap(descriptionTranslation, record.wordswapMap)
        : descriptionTranslation;

    if (
      nameTranslation.length === 0 &&
      restoredDescription.length === 0
    ) {
      continue;
    }

    exportRecords.push({
      descriptionTranslation: restoredDescription,
      kind: 'entity',
      name: record.name,
      nameTranslation,
      stringId: record.stringId,
      type: record.type,
    });
  }

  return exportRecords;
};

export const createTranslationModBuffer = (
  project: TranslationProject,
  exportOptions: ExportOptions,
) => {
  const exportRecords = createExportRecords(project, exportOptions);

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
    } else if (record.kind === 'entity' || record.kind === 'dialog') {
      writeString(writer, record.name);
    } else {
      writeString(writer, '');
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
