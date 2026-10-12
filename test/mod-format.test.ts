import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ModParseError,
  decodeModText,
  decodeSaveData,
  isRemovedReference,
  parseMod,
  removedReferenceValue,
  repairDoubleEncodedText,
} from "../src/shared/mod-format.ts";
import { writeTestMod } from "./helpers/mod-writer.ts";

const max = removedReferenceValue;

describe("parseMod header", () => {
  it("reads fileType 17 header, merge entries and OCS-style delete requests", () => {
    const parsed = parseMod(
      writeTestMod({
        author: "tester",
        deleteRequests: [{ items: "12-a.mod,13-a.mod", key: "other.mod", version: 4 }],
        dependencies: ["gamedata.base", "rebirth.mod"],
        description: "説明",
        fileType: 17,
        lastId: 42,
        mergeEntries: [{ key: "merged.mod", version1: 3, version2: 2 }],
        records: [],
        references: ["Newwworld.mod"],
        saveCount: 7,
        version: 5,
      }),
      "sample",
    );

    assert.equal(parsed.header.fileType, 17);
    assert.equal(parsed.header.version, 5);
    assert.equal(parsed.header.author, "tester");
    assert.equal(parsed.header.description, "説明");
    assert.deepEqual(parsed.header.dependencies, ["gamedata.base", "rebirth.mod"]);
    assert.deepEqual(parsed.header.references, ["Newwworld.mod"]);
    assert.equal(parsed.header.saveCount, 7);
    assert.equal(parsed.header.lastId, 42);
    assert.deepEqual(parsed.header.mergeEntries, [{ key: "merged.mod", version1: 3, version2: 2 }]);
    assert.deepEqual(parsed.header.deleteRequests, [
      { items: "12-a.mod,13-a.mod", key: "other.mod", version: 4 },
    ]);
    assert.deepEqual(parsed.warnings, []);
  });

  it("rejects files that are not mods", () => {
    const bytes = new Uint8Array([15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.throws(() => parseMod(bytes, "save"), ModParseError);
  });
});

describe("change types", () => {
  it("decodes fileType 16 saveData with the legacy high bit", () => {
    assert.deepEqual(decodeSaveData(0x8000_0002), {
      changeType: 2,
      changeTypeName: "New",
      legacy: true,
      raw: 0x8000_0002,
      saveCount: 0,
    });
    assert.equal(decodeSaveData(0x8000_0001).changeTypeName, "Changed");
    assert.equal(decodeSaveData(0x8000_0003).changeTypeName, "Renamed");
  });

  it("decodes fileType 17 change types including renamed (3)", () => {
    assert.equal(decodeSaveData(0x10).changeTypeName, "New");
    assert.equal(decodeSaveData(0x11).changeTypeName, "Changed");
    assert.equal(decodeSaveData(0x153).changeTypeName, "Renamed");
    assert.equal(decodeSaveData(0x153).saveCount, 21);
    // OCS が書き出した mod は改名を 2 で表す
    assert.equal(decodeSaveData(0x22).changeTypeName, "Renamed");
    assert.equal(decodeSaveData(0x17).changeTypeName, "Unknown(7)");
  });
});

describe("records", () => {
  const sample = writeTestMod({
    fileType: 17,
    records: [
      {
        bools: { "is robot": true },
        files: { mesh: "./mods/sample/blade.mesh" },
        floats: { weight: 2.5 },
        instances: [
          {
            id: "i1",
            position: [1, 2, 3],
            rotation: [1, 0, 0, 0],
            states: ["open"],
            targetId: "5-a.mod",
          },
          { id: "i2", targetId: "" },
        ],
        ints: { slot: 3 },
        name: "Blade",
        references: {
          ingredients: [
            { targetId: "1-a.mod", values: [100, 0, 0] },
            { targetId: "2-a.mod", values: [max, max, max] },
          ],
        },
        stringId: "10-sample.mod",
        strings: { description: "Sharp." },
        type: 2,
        vector3s: { offset: [1, 2, 3] },
        vector4s: { colour: [0.1, 0.2, 0.3, 0.4] },
      },
      {
        bools: { REMOVED: true },
        name: "Old bench",
        saveData: 0x11,
        stringId: "99-gamedata.base",
        type: 0,
      },
      {
        name: "Renamed town",
        saveData: 0x13,
        stringId: "42255-rebirth.mod",
        type: 13,
      },
      {
        name: "DIALOGUE_LINE",
        stringId: "11-sample.mod",
        strings: { text0: "Hello", text1: "" },
        type: 19,
      },
    ],
  });
  const parsed = parseMod(sample, "sample", "t0");

  it("reads every value block", () => {
    const [blade] = parsed.inspectorRecords;
    assert.ok(blade);
    assert.equal(blade.uid, "t0:0");
    assert.equal(blade.name, "Blade");
    assert.equal(blade.removed, false);
    assert.deepEqual(blade.values.bools, [{ key: "is robot", value: true }]);
    assert.deepEqual(blade.values.ints, [{ key: "slot", value: 3 }]);
    assert.equal(blade.values.floats[0]?.value, 2.5);
    assert.deepEqual(blade.values.files, [{ key: "mesh", value: "./mods/sample/blade.mesh" }]);
    assert.deepEqual(blade.strings, [{ key: "description", value: "Sharp." }]);
    assert.equal(blade.counts.references, 2);
    assert.deepEqual(blade.values.instances[0], {
      key: "i1",
      states: ["open"],
      targetId: "5-a.mod",
      values: [1, 2, 3, 1, 0, 0, 0],
    });
    assert.equal(blade.values.instances[1]?.targetId, "");
    const [kept, removed] = blade.referenceCategories[0]!.references;
    assert.equal(isRemovedReference(kept!), false);
    assert.equal(isRemovedReference(removed!), true);
  });

  it("marks REMOVED records and does not extract text from them", () => {
    const removed = parsed.inspectorRecords[1]!;
    assert.equal(removed.removed, true);
    assert.equal(removed.saveData.changeTypeName, "Changed");
    assert.equal(
      parsed.textRecords.some((record) => record.stringId === removed.stringId),
      false,
    );
  });

  it("extracts renamed records and dialogue text", () => {
    const renamed = parsed.textRecords.find((record) => record.stringId === "42255-rebirth.mod");
    assert.equal(renamed?.kind, "entity");
    assert.equal(renamed?.saveData.changeTypeName, "Renamed");
    const dialog = parsed.textRecords.find((record) => record.stringId === "11-sample.mod");
    assert.equal(dialog?.kind, "dialog");
    assert.deepEqual(dialog?.kind === "dialog" ? dialog.texts : [], [
      { original: "Hello", textId: "text0" },
      { original: "", textId: "text1" },
    ]);
  });

  it("has no warnings for well-formed data", () => {
    assert.deepEqual(parsed.warnings, []);
  });
});

describe("damaged data", () => {
  it("resyncs to the declared record length", () => {
    const parsed = parseMod(
      writeTestMod({
        fileType: 17,
        records: [
          { name: "A", stringId: "1-a.mod", trailingBytes: [0, 0, 0, 0], type: 4 },
          { name: "B", stringId: "2-a.mod", type: 4 },
        ],
      }),
      "a",
    );
    assert.deepEqual(
      parsed.inspectorRecords.map((record) => record.name),
      ["A", "B"],
    );
    assert.equal(parsed.warnings.length, 1);
    assert.match(parsed.warnings[0]!, /長さが宣言値と一致しません/);
  });

  it("skips a broken record when its length is declared", () => {
    const bytes = writeTestMod({
      fileType: 17,
      records: [
        { name: "Broken", stringId: "1-a.mod", type: 4 },
        { name: "Fine", stringId: "2-a.mod", type: 4 },
      ],
    });
    // 1 件目の name の長さを壊す (ヘッダ以降の最初のレコード: 長さ int + type + id の直後)
    const view = new DataView(bytes.buffer);
    const firstRecordOffset = findRecordOffset(bytes);
    view.setInt32(firstRecordOffset + 12, 0x7fff_ffff, true);
    const parsed = parseMod(bytes, "a");
    assert.deepEqual(
      parsed.inspectorRecords.map((record) => record.name),
      ["Fine"],
    );
    assert.match(parsed.warnings[0]!, /スキップしました/);
  });

  it("throws a descriptive error when the record length is unknown", () => {
    const bytes = writeTestMod({
      fileType: 16,
      records: [{ name: "Broken", stringId: "1-a.mod", type: 4 }],
    });
    const view = new DataView(bytes.buffer);
    view.setInt32(findRecordOffset(bytes) + 12, -5, true);
    assert.throws(() => parseMod(bytes, "a"), /レコード #0/);
  });

  it("reports trailing bytes", () => {
    const bytes = writeTestMod({ fileType: 17, records: [] });
    const parsed = parseMod(Uint8Array.from([...bytes, 1, 2, 3]), "a");
    assert.match(parsed.warnings[0]!, /3 バイト/);
  });
});

describe("text decoding", () => {
  it("repairs UTF-8 text that was double-encoded through Windows-1252", () => {
    assert.equal(
      repairDoubleEncodedText("pretty strong â€” especially"),
      "pretty strong — especially",
    );
    assert.equal(repairDoubleEncodedText("cafÃ©"), "café");
  });

  it("keeps legitimate Latin-1 and Japanese text", () => {
    assert.equal(repairDoubleEncodedText("Âge de pierre"), "Âge de pierre");
    assert.equal(repairDoubleEncodedText("ladrão"), "ladrão");
    assert.equal(repairDoubleEncodedText("金の卵 â€"), "金の卵 â€");
  });

  it("falls back to Windows-1252 for invalid UTF-8", () => {
    assert.equal(decodeModText(Uint8Array.from([0x93, 0x48, 0x69, 0x94, 0xe9])), "“Hi”é");
  });

  it("decodes invalid UTF-8 string values inside records", () => {
    const parsed = parseMod(
      writeTestMod({
        fileType: 17,
        records: [
          {
            name: "Old",
            stringId: "1-a.mod",
            strings: { description: Uint8Array.from([0x43, 0x61, 0x66, 0xe9]) },
            type: 4,
          },
        ],
      }),
      "a",
    );
    assert.equal(parsed.inspectorRecords[0]?.strings[0]?.value, "Café");
  });
});

/** ヘッダを読み飛ばして最初のレコードの開始位置を求める (テスト用の簡易実装)。 */
function findRecordOffset(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fileType = view.getInt32(0, true);
  let offset = 4;
  if (fileType === 17) {
    const headerLength = view.getInt32(offset, true);
    offset += 4 + headerLength;
  } else {
    offset += 4; // version
    for (let index = 0; index < 4; index += 1) {
      offset += 4 + view.getInt32(offset, true);
    }
  }
  return offset + 8; // lastId + record count
}
