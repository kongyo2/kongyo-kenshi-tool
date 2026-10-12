// 手元の Kenshi データ (.mod / .base / .translation) を一括で解析し、パーサの退行を確認するスクリプト。
// ゲームや mod のファイルはリポジトリに含めず、パスを引数で渡す。
//
//   node scripts/verify-corpus.ts "D:/steam/steamapps/common/Kenshi/data" "D:/steam/steamapps/workshop/content/233860"
//
// 解析エラー・警告・未知の変更種別があれば終了コード 1 で終わる。
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { parseMod } from "../src/shared/mod-format.ts";

const modFilePattern = /\.(mod|base|translation)$/i;

const collectFiles = (target: string, files: string[]) => {
  const stats = statSync(target);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(target).sort()) {
      collectFiles(path.join(target, entry), files);
    }
    return files;
  }
  if (modFilePattern.test(target)) {
    files.push(target);
  }
  return files;
};

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("usage: node scripts/verify-corpus.ts <file-or-folder> [...]");
  process.exit(2);
}

const files = targets.flatMap((target) => collectFiles(target, []));
let problemCount = 0;

for (const file of files) {
  const started = performance.now();
  try {
    const parsed = parseMod(readFileSync(file), path.parse(file).name);
    const changeTypes = new Map<string, number>();
    let removedRecords = 0;
    for (const record of parsed.inspectorRecords) {
      changeTypes.set(
        record.saveData.changeTypeName,
        (changeTypes.get(record.saveData.changeTypeName) ?? 0) + 1,
      );
      if (record.removed) {
        removedRecords += 1;
      }
    }
    const unknownTypes = [...changeTypes.keys()].filter((name) => name.startsWith("Unknown"));
    const summary = [...changeTypes.entries()].map(([name, count]) => `${name}=${count}`).join(" ");
    const elapsed = Math.round(performance.now() - started);
    console.log(
      `ok   ${path.basename(file)} fileType=${parsed.header.fileType} records=${parsed.inspectorRecords.length} text=${parsed.textRecords.length} removed=${removedRecords} ${summary} (${elapsed}ms)`,
    );
    for (const warning of parsed.warnings) {
      console.log(`  warn ${warning}`);
    }
    if (parsed.warnings.length > 0 || unknownTypes.length > 0) {
      problemCount += 1;
    }
  } catch (error) {
    problemCount += 1;
    console.log(
      `FAIL ${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

console.log(`${files.length} files, ${problemCount} with problems`);
process.exit(problemCount === 0 ? 0 : 1);
