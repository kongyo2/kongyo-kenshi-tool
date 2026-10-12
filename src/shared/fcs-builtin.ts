// アプリに組み込んだ FCS 定義 (fcs.def / fcs_enums.def) を使えるようにする。
import { fcsDataSource, fcsEnumRows, fcsTypeRows } from "./fcs-data.generated.ts";
import { buildFcsSchemaFromRows, type FcsSchema } from "./fcs-definitions.ts";

let builtinSchema: FcsSchema | null = null;

/** 組み込みの FCS 定義。初回呼び出し時に一度だけ組み立てる。 */
export const getBuiltinFcsSchema = () => {
  builtinSchema ??= buildFcsSchemaFromRows(fcsTypeRows, fcsEnumRows);
  return builtinSchema;
};

export const builtinFcsSource = fcsDataSource;
