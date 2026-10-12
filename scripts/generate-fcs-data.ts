// fcs.def / fcs_enums.def から、アプリに組み込む FCS 定義データ (src/shared/fcs-data.generated.ts) を生成する。
// ゲームや Customized fcs def が更新されたら、新しい定義フォルダを指定して再生成する。
//
//   node scripts/generate-fcs-data.ts "D:/steam/steamapps/workshop/content/233860/2909495250/v1.0.68" "Customized fcs def v1.0.68 (Steam Workshop 2909495250)"
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseFcsSchema, type FcsFieldDefinition } from "../src/shared/fcs-definitions.ts";

const [definitionFolder, sourceLabel] = process.argv.slice(2);
if (!definitionFolder || !sourceLabel) {
  console.error(
    'usage: node scripts/generate-fcs-data.ts <folder containing fcs.def> "<source label>"',
  );
  process.exit(2);
}

const schema = parseFcsSchema(
  readFileSync(path.join(definitionFolder, "fcs.def"), "utf-8"),
  readFileSync(path.join(definitionFolder, "fcs_enums.def"), "utf-8"),
);

// フィールド 1 件 = [名前, 種類, 既定値, 説明, 分類見出し, 種類別の追加情報]
const toFieldRow = (field: FcsFieldDefinition) => {
  let extra: unknown = null;
  if (field.kind === "enum") {
    extra = [field.enumName, field.enumValue];
  } else if (field.kind === "reference") {
    extra = [field.referenceTarget, field.referenceDefaults, field.owned ? 1 : 0];
  } else if (field.kind === "file") {
    extra = field.fileFilter;
  }
  return [field.name, field.kind, field.defaultText, field.description, field.group, extra];
};

const types = Object.fromEntries(
  [...schema.types.entries()]
    .sort((left, right) => left[0].localeCompare(right[0], "en"))
    .map(([typeName, fields]) => [typeName, [...fields.values()].map(toFieldRow)]),
);

// 列挙 1 件 = [shared か, [[名前, 番号 (shared は null), 説明], ...]]
const enums = Object.fromEntries(
  [...schema.enums.entries()]
    .sort((left, right) => left[0].localeCompare(right[0], "en"))
    .map(([enumName, definition]) => [
      enumName,
      [
        definition.shared ? 1 : 0,
        definition.values.map((value) => [value.name, value.value, value.description]),
      ],
    ]),
);

const output = `// このファイルは scripts/generate-fcs-data.ts が生成したもの。手で編集しないこと。
// 元データ: ${sourceLabel}
// fcs.def / fcs_enums.def の内容 (フィールドの種類・既定値・説明、列挙値) をアプリに組み込むためのデータ。
import type { FcsEnumRow, FcsFieldRow } from "./fcs-definitions.ts";

export const fcsDataSource = ${JSON.stringify(sourceLabel)};

export const fcsTypeRows: Readonly<Record<string, readonly FcsFieldRow[]>> = ${JSON.stringify(types)};

export const fcsEnumRows: Readonly<Record<string, FcsEnumRow>> = ${JSON.stringify(enums)};
`;

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(projectRoot, "src", "shared", "fcs-data.generated.ts");
writeFileSync(outputPath, output, "utf-8");
// リポジトリの整形ルール (oxfmt) に合わせておく
execFileSync(
  process.execPath,
  [path.join(projectRoot, "node_modules", "oxfmt", "bin", "oxfmt"), outputPath],
  {
    stdio: "inherit",
  },
);
console.log(
  `wrote ${outputPath}: ${schema.types.size} types, ${Object.values(types).reduce((sum, rows) => sum + rows.length, 0)} fields, ${schema.enums.size} enums, ${(Buffer.byteLength(output) / 1024).toFixed(0)} KB`,
);
