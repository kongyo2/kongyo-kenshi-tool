// テスト用に Kenshi の mod バイナリを組み立てる。レイアウトは OpenConstructionSet の OcsWriter と同じ。

export interface TestReference {
  targetId: string;
  values?: [number, number, number];
}

export interface TestInstance {
  id: string;
  position?: [number, number, number];
  /** w, x, y, z の順 */
  rotation?: [number, number, number, number];
  states?: string[];
  targetId: string;
}

export interface TestRecord {
  bools?: Record<string, boolean>;
  files?: Record<string, string>;
  floats?: Record<string, number>;
  id?: number;
  instances?: TestInstance[];
  ints?: Record<string, number>;
  name: string;
  references?: Record<string, TestReference[]>;
  /** saveData の生値。省略時は新規 (保存回数 1)。 */
  saveData?: number;
  stringId: string;
  /** Uint8Array を渡すとそのバイト列をそのまま書き込む (不正な UTF-8 のテスト用)。 */
  strings?: Record<string, string | Uint8Array>;
  type: number;
  vector3s?: Record<string, [number, number, number]>;
  vector4s?: Record<string, [number, number, number, number]>;
  /** レコード先頭の長さフィールド。省略時は fileType 17 なら実際の長さ、16 なら 0。 */
  declaredLength?: number | "actual";
  /** 末尾に付け足す余分なバイト (レコード長の検証テスト用)。 */
  trailingBytes?: number[];
}

export interface TestModFile {
  author?: string;
  deleteRequests?: Array<{ items: string; key: string; version: number }>;
  dependencies?: string[];
  description?: string;
  fileType: 16 | 17;
  lastId?: number;
  lastMerge?: number;
  mergeEntries?: Array<{ key: string; version1: number; version2: number }>;
  records: TestRecord[];
  references?: string[];
  saveCount?: number;
  version?: number;
}

class ByteWriter {
  private readonly bytes: number[] = [];

  get length() {
    return this.bytes.length;
  }

  raw(values: ArrayLike<number>) {
    for (let index = 0; index < values.length; index += 1) {
      this.bytes.push(values[index]!);
    }
  }

  byte(value: number) {
    this.bytes.push(value & 0xff);
  }

  int(value: number) {
    const buffer = new DataView(new ArrayBuffer(4));
    buffer.setInt32(0, value, true);
    this.raw(new Uint8Array(buffer.buffer));
  }

  uint(value: number) {
    const buffer = new DataView(new ArrayBuffer(4));
    buffer.setUint32(0, value >>> 0, true);
    this.raw(new Uint8Array(buffer.buffer));
  }

  float(value: number) {
    const buffer = new DataView(new ArrayBuffer(4));
    buffer.setFloat32(0, value, true);
    this.raw(new Uint8Array(buffer.buffer));
  }

  string(value: string | Uint8Array) {
    const encoded = typeof value === "string" ? new TextEncoder().encode(value) : value;
    this.int(encoded.length);
    this.raw(encoded);
  }

  patchInt(offset: number, value: number) {
    const buffer = new DataView(new ArrayBuffer(4));
    buffer.setInt32(0, value, true);
    for (let index = 0; index < 4; index += 1) {
      this.bytes[offset + index] = buffer.getUint8(index);
    }
  }

  toUint8Array() {
    return Uint8Array.from(this.bytes);
  }
}

const writeEntries = <T>(
  writer: ByteWriter,
  entries: Record<string, T> | undefined,
  writeValue: (value: T) => void,
) => {
  const list = Object.entries(entries ?? {});
  writer.int(list.length);
  for (const [key, value] of list) {
    writer.string(key);
    writeValue(value);
  }
};

const writeRecord = (writer: ByteWriter, record: TestRecord, fileType: 16 | 17) => {
  const start = writer.length;
  writer.int(0);
  writer.int(record.type);
  writer.int(record.id ?? 0);
  writer.string(record.name);
  writer.string(record.stringId);
  writer.uint(record.saveData ?? 0x10);

  writeEntries(writer, record.bools, (value) => writer.byte(value ? 1 : 0));
  writeEntries(writer, record.floats, (value) => writer.float(value));
  writeEntries(writer, record.ints, (value) => writer.int(value));
  writeEntries(writer, record.vector3s, (value) => value.forEach((part) => writer.float(part)));
  writeEntries(writer, record.vector4s, (value) => value.forEach((part) => writer.float(part)));
  writeEntries(writer, record.strings, (value) => writer.string(value));
  writeEntries(writer, record.files, (value) => writer.string(value));

  const categories = Object.entries(record.references ?? {});
  writer.int(categories.length);
  for (const [name, references] of categories) {
    writer.string(name);
    writer.int(references.length);
    for (const reference of references) {
      writer.string(reference.targetId);
      for (const value of reference.values ?? [0, 0, 0]) {
        writer.int(value);
      }
    }
  }

  const instances = record.instances ?? [];
  writer.int(instances.length);
  for (const instance of instances) {
    writer.string(instance.id);
    writer.string(instance.targetId);
    for (const value of instance.position ?? [0, 0, 0]) {
      writer.float(value);
    }
    for (const value of instance.rotation ?? [1, 0, 0, 0]) {
      writer.float(value);
    }
    const states = instance.states ?? [];
    writer.int(states.length);
    for (const state of states) {
      writer.string(state);
    }
  }

  if (record.trailingBytes) {
    writer.raw(record.trailingBytes);
  }

  const declared = record.declaredLength ?? (fileType === 17 ? "actual" : 0);
  writer.patchInt(start, declared === "actual" ? writer.length - start : declared);
};

export const writeTestMod = (file: TestModFile): Uint8Array => {
  const writer = new ByteWriter();
  writer.int(file.fileType);

  let headerStart = 0;
  if (file.fileType === 17) {
    writer.int(0);
    headerStart = writer.length;
  }

  writer.int(file.version ?? 1);
  writer.string(file.author ?? "");
  writer.string(file.description ?? "");
  writer.string((file.dependencies ?? []).join(","));
  writer.string((file.references ?? []).join(","));

  if (file.fileType === 17) {
    writer.uint(file.saveCount ?? 1);
    writer.uint(file.lastMerge ?? 0);
    const mergeEntries = file.mergeEntries ?? [];
    writer.byte(mergeEntries.length);
    for (const entry of mergeEntries) {
      writer.string(entry.key);
      writer.uint(entry.version1);
      writer.uint(entry.version2);
    }
    const deleteRequests = file.deleteRequests ?? [];
    writer.byte(deleteRequests.length);
    for (const request of deleteRequests) {
      writer.string(request.key);
      writer.uint(request.version);
      writer.string(request.items);
    }
    writer.patchInt(headerStart - 4, writer.length - headerStart);
  }

  writer.int(file.lastId ?? 0);
  writer.int(file.records.length);
  for (const record of file.records) {
    writeRecord(writer, record, file.fileType);
  }

  return writer.toUint8Array();
};
