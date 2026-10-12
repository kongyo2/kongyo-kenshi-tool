import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseMod } from "../src/shared/mod-format.ts";
import { renderProjectMarkdown } from "../src/shared/mod-markdown.ts";
import { mergeRecordHistory } from "../src/shared/mod-merge.ts";
import type { InspectorRecord, LoadedMod, ModProject } from "../src/shared/models.ts";
import { writeTestMod, type TestModFile } from "./helpers/mod-writer.ts";

const parse = (modName: string, file: TestModFile) =>
  parseMod(writeTestMod(file), modName, modName);

const loadedMod = (
  modName: string,
  role: LoadedMod["role"],
  records: readonly InspectorRecord[],
): LoadedMod => ({
  fileName: `${modName}.mod`,
  filePath: `${modName}.mod`,
  header: parse(modName, { fileType: 17, records: [] }).header,
  info: null,
  loadOrder: 0,
  recordCount: records.length,
  role,
  warnings: [],
});

const createProject = (
  target: readonly InspectorRecord[],
  context: readonly InspectorRecord[] = [],
): ModProject => ({
  assetReferences: [],
  contextRecordCount: context.length,
  contextRecords: [...context],
  contextTextRecords: [],
  dependencies: [],
  failedMods: [],
  inspectorRecords: [...target],
  missingReferencePaths: [],
  mods: [
    loadedMod("target", "target", target),
    ...(context.length > 0 ? [loadedMod("base", "reference", context)] : []),
  ],
  projectId: "test",
  sourceModName: "target",
  textRecords: [],
});

describe("record merging", () => {
  const record = (modName: string, bools: Record<string, boolean>, saveData = 0x11) =>
    parse(modName, {
      fileType: 17,
      records: [{ bools, name: "Bench", saveData, stringId: "1-a.mod", type: 0 }],
    }).inspectorRecords[0]!;

  it("treats a later REMOVED=false as restoring the record", () => {
    const base = record("a", {}, 0x10);
    const removal = record("b", { REMOVED: true });
    const restore = record("c", { REMOVED: false });
    assert.equal(mergeRecordHistory([base, removal])!.removed, true);
    assert.equal(mergeRecordHistory([base, removal, restore])!.removed, false);
  });
});

describe("dialogue rendering", () => {
  it("expands a shared reply once instead of once per path", () => {
    const branches = Array.from({ length: 12 }, (_, index) => ({
      name: "DIALOGUE_LINE",
      references: { lines: [{ targetId: "99-target.mod" }] },
      stringId: `${index + 1}-target.mod`,
      strings: { text0: `branch ${index + 1}` },
      type: 19,
    }));
    const records = parse("target", {
      fileType: 17,
      records: [
        {
          name: "Greeting",
          references: { lines: branches.map((branch) => ({ targetId: branch.stringId })) },
          stringId: "50-target.mod",
          type: 18,
        },
        ...branches,
        {
          name: "DIALOGUE_LINE",
          strings: { text0: "SHARED REPLY TEXT" },
          stringId: "99-target.mod",
          type: 19,
        },
      ],
    }).inspectorRecords;

    const markdown = renderProjectMarkdown(createProject(records));
    assert.equal(markdown.split("SHARED REPLY TEXT").length - 1, 1);
    const pointerLines = markdown
      .split("\n")
      .filter((line) => /^\s*- \[[A-Z_ ]+\] Line `99-target\.mod`.*↪ shown above/.test(line));
    assert.equal(pointerLines.length, branches.length - 1);
  });

  it("reports only the settings a changed dialogue actually writes", () => {
    const base = parse("base", {
      fileType: 17,
      records: [
        {
          bools: { monologue: false, "once only": true },
          ints: { "score bonus": 0, speaker: 0 },
          name: "Greeting",
          stringId: "10-base.mod",
          type: 18,
        },
      ],
    }).inspectorRecords;
    const target = parse("target", {
      fileType: 17,
      records: [
        {
          ints: { "score bonus": 5 },
          name: "Greeting",
          saveData: 0x11,
          stringId: "10-base.mod",
          type: 18,
        },
      ],
    }).inspectorRecords;

    const markdown = renderProjectMarkdown(createProject(target, base));
    const settingsLine = markdown
      .split("\n")
      .find((line) => line.startsWith("- Settings changed by this mod:"));
    assert.ok(settingsLine, "changed dialogue should list its own settings");
    assert.match(settingsLine, /`score bonus`=5 \(base 0\)/);
    assert.doesNotMatch(settingsLine, /once only|monologue|speaker/);
  });

  it("marks references deleted by the mod instead of showing their marker values", () => {
    const max = 2_147_483_647;
    const records = parse("target", {
      fileType: 17,
      records: [
        {
          name: "Trader",
          references: { vendors: [{ targetId: "7-gamedata.base", values: [max, max, max] }] },
          saveData: 0x11,
          stringId: "5-gamedata.base",
          type: 1,
        },
      ],
    }).inspectorRecords;

    const markdown = renderProjectMarkdown(createProject(records));
    assert.match(markdown, /`7-gamedata\.base` · unresolved .*\[removed/);
    assert.doesNotMatch(markdown, /2147483647\)/);
  });
});
