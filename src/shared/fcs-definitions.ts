// FCS (Forgotten Construction Set) の定義ファイル fcs.def / fcs_enums.def のパーサ。
// 定義ファイルはゲーム本体 (または Workshop の "Customized fcs def") に含まれるため、
// リポジトリには同梱せず、実行時にユーザーの環境から読み込む。

export type FcsFieldKind =
  | "bool"
  | "enum"
  | "file"
  | "float"
  | "int"
  | "reference"
  | "special"
  | "string";

export interface FcsFieldDefinition {
  defaultText: string;
  description: string;
  enumName: string | null;
  enumValue: string | null;
  fileFilter: string | null;
  group: string | null;
  kind: FcsFieldKind;
  name: string;
  /** OWNED: として宣言された参照 (サブアイテムとして親レコードに属する)。 */
  owned: boolean;
  /** 参照の既定値 (v0〜v2)。要素数が意味を持つ値の数。 */
  referenceDefaults: number[];
  referenceTarget: string | null;
}

export interface FcsEnumValue {
  description: string;
  name: string;
  /** shared 列挙は exe 側で番号が決まるため null。 */
  value: number | null;
}

export interface FcsEnumDefinition {
  name: string;
  /** `enum shared` は値の並びが実際の番号と一致しない (exe 側で定義)。 */
  shared: boolean;
  values: FcsEnumValue[];
}

export interface FcsSchema {
  enums: Map<string, FcsEnumDefinition>;
  /** FCS の型名 (例: AI_PACKAGE) → フィールド名 → 定義 */
  types: Map<string, Map<string, FcsFieldDefinition>>;
}

const sectionPattern = /^\[([^\]]+)\]\s*$/;
const enumTokenPattern = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]+)$/;
const typeTokenPattern = /^[A-Z][A-Z0-9_]*$/;
const intPattern = /^-?\d+$/;
const floatPattern = /^-?(?:\d+\.\d*|\.\d+)$/;

const normaliseDescription = (value: string) =>
  value
    .replace(/\\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

interface ParsedValuePart {
  description: string;
  quotedDefault: string | null;
  referenceDefaults: number[];
  token: string;
}

const parseValuePart = (text: string): ParsedValuePart => {
  let rest = text.trim();
  let token = "";
  let quotedDefault: string | null = null;

  if (rest.startsWith('"')) {
    const end = rest.indexOf('"', 1);
    if (end < 0) {
      return { description: "", quotedDefault: rest.slice(1), referenceDefaults: [], token: "" };
    }
    quotedDefault = rest.slice(1, end);
    token = quotedDefault;
    rest = rest.slice(end + 1).trim();
  } else {
    const match = /^[^\s"(]+/.exec(rest);
    token = match ? match[0] : "";
    rest = rest.slice(token.length).trim();
  }

  let referenceDefaults: number[] = [];
  if (rest.startsWith("(")) {
    const end = rest.indexOf(")");
    const inner = end >= 0 ? rest.slice(1, end) : rest.slice(1);
    referenceDefaults = inner
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map(Number)
      .filter((value) => Number.isFinite(value));
    rest = end >= 0 ? rest.slice(end + 1).trim() : "";
  }

  // 残りは修飾子 (multiline looped など) と説明文 "..."
  const firstQuote = rest.indexOf('"');
  const lastQuote = rest.lastIndexOf('"');
  const description =
    firstQuote >= 0 && lastQuote > firstQuote
      ? normaliseDescription(rest.slice(firstQuote + 1, lastQuote))
      : "";

  return { description, quotedDefault, referenceDefaults, token };
};

const classifyField = (
  name: string,
  value: ParsedValuePart,
  group: string | null,
  owned: boolean,
): FcsFieldDefinition => {
  const base: FcsFieldDefinition = {
    defaultText: value.quotedDefault !== null ? `"${value.quotedDefault}"` : value.token,
    description: value.description,
    enumName: null,
    enumValue: null,
    fileFilter: null,
    group,
    kind: "special",
    name,
    owned,
    referenceDefaults: value.referenceDefaults,
    referenceTarget: null,
  };

  if (value.quotedDefault !== null) {
    const isFileFilter = value.quotedDefault.includes("|") && value.quotedDefault.includes("*.");
    return isFileFilter
      ? { ...base, fileFilter: value.quotedDefault, kind: "file" }
      : { ...base, kind: "string" };
  }

  const { token } = value;
  if (token === "True" || token === "False") {
    return { ...base, kind: "bool" };
  }
  if (intPattern.test(token)) {
    return { ...base, kind: "int" };
  }
  if (floatPattern.test(token)) {
    return { ...base, kind: "float" };
  }
  if (token.startsWith("TEXTURE_") || token === "ANIMATION_FILE") {
    return { ...base, fileFilter: token, kind: "file" };
  }

  const enumMatch = enumTokenPattern.exec(token);
  if (enumMatch) {
    return { ...base, enumName: enumMatch[1]!, enumValue: enumMatch[2]!, kind: "enum" };
  }

  if (typeTokenPattern.test(token)) {
    return { ...base, kind: "reference", referenceTarget: token };
  }

  return base;
};

/** fcs.def を解析する。同じ型のセクションが複数回現れた場合 (// Custom 追記など) は後勝ちで統合する。 */
export const parseFcsDef = (text: string) => {
  const types = new Map<string, Map<string, FcsFieldDefinition>>();
  let currentTypes: string[] = [];
  let group: string | null = null;

  const fieldsOf = (typeName: string) => {
    let fields = types.get(typeName);
    if (!fields) {
      fields = new Map();
      types.set(typeName, fields);
    }
    return fields;
  };

  const ownedFields = new Map<string, Set<string>>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("//")) {
      continue;
    }

    const section = sectionPattern.exec(line);
    if (section) {
      currentTypes = section[1]!
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      group = null;
      continue;
    }

    if (currentTypes.length === 0 || line.startsWith("condition ") || line === "CONDITIONS:") {
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex <= 0) {
      continue;
    }

    const name = line.slice(0, colonIndex).trim();
    const valueText = line.slice(colonIndex + 1).trim();

    if (name === "TRANSLATE") {
      continue;
    }

    if (name === "OWNED") {
      for (const typeName of currentTypes) {
        const owned = ownedFields.get(typeName) ?? new Set<string>();
        owned.add(valueText);
        ownedFields.set(typeName, owned);
        const existing = types.get(typeName)?.get(valueText);
        if (existing) {
          existing.owned = true;
        }
      }
      continue;
    }

    if (valueText.length === 0) {
      // 値の無い行は FCS のプロパティグリッド上の分類見出し (main:, hidden: など)
      group = name;
      continue;
    }

    const parsedValue = parseValuePart(valueText);
    for (const typeName of currentTypes) {
      const owned = ownedFields.get(typeName)?.has(name) ?? false;
      fieldsOf(typeName).set(name, classifyField(name, parsedValue, group, owned));
    }
  }

  return types;
};

const stripEnumComments = (body: string) => {
  const values: Array<{ description: string; token: string }> = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const commentIndex = rawLine.indexOf("//");
    const code = commentIndex >= 0 ? rawLine.slice(0, commentIndex) : rawLine;
    const comment = commentIndex >= 0 ? normaliseDescription(rawLine.slice(commentIndex + 2)) : "";
    const tokens = code
      .split(",")
      .flatMap((chunk) => (chunk.includes("=") ? [chunk] : chunk.split(/\s+/)))
      .map((token) => token.trim().replace(/\.$/, ""))
      .filter((token) => token.length > 0);
    tokens.forEach((token, index) => {
      // 行末コメントはその行の最後の値の説明とみなす
      values.push({ description: index === tokens.length - 1 ? comment : "", token });
    });
  }
  return values;
};

/** fcs_enums.def を解析する。 */
export const parseFcsEnums = (text: string) => {
  const enums = new Map<string, FcsEnumDefinition>();
  const enumPattern = /enum\s+(shared\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]*)\}/g;

  for (const match of text.matchAll(enumPattern)) {
    const shared = Boolean(match[1]);
    const name = match[2]!;
    let nextValue = 0;
    const values: FcsEnumValue[] = [];

    for (const { description, token } of stripEnumComments(match[3]!)) {
      const [rawName, rawValue] = token.split("=").map((part) => part.trim());
      if (!rawName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(rawName)) {
        continue;
      }
      let value: number | null = null;
      if (!shared) {
        value = rawValue !== undefined && intPattern.test(rawValue) ? Number(rawValue) : nextValue;
        nextValue = value + 1;
      }
      values.push({ description, name: rawName, value });
    }

    enums.set(name, { name, shared, values });
  }

  return enums;
};

export const parseFcsSchema = (defText: string, enumsText: string | null): FcsSchema => ({
  enums: enumsText ? parseFcsEnums(enumsText) : new Map(),
  types: parseFcsDef(defText),
});

// --- 組み込みデータ (fcs-data.generated.ts) の形式 ----------------------------------

/** 種類別の追加情報: enum は [列挙型, 既定値], reference は [参照先型, 既定の v0〜v2, owned], file はフィルタ */
export type FcsFieldExtra =
  | readonly [string, string]
  | readonly [string, readonly number[], number]
  | string
  | null;

/** [名前, 種類, 既定値, 説明, 分類見出し, 追加情報] */
export type FcsFieldRow = readonly [string, string, string, string, string | null, FcsFieldExtra];

/** [shared なら 1, [[名前, 番号 (shared は null), 説明], ...]] */
export type FcsEnumRow = readonly [number, ReadonlyArray<readonly [string, number | null, string]>];

const toFieldDefinition = (row: FcsFieldRow): FcsFieldDefinition => {
  const [name, kind, defaultText, description, group, extra] = row;
  const definition: FcsFieldDefinition = {
    defaultText,
    description,
    enumName: null,
    enumValue: null,
    fileFilter: null,
    group,
    kind: kind as FcsFieldKind,
    name,
    owned: false,
    referenceDefaults: [],
    referenceTarget: null,
  };
  if (kind === "enum" && Array.isArray(extra)) {
    definition.enumName = String(extra[0]);
    definition.enumValue = String(extra[1]);
  } else if (kind === "reference" && Array.isArray(extra)) {
    definition.referenceTarget = String(extra[0]);
    definition.referenceDefaults = [...(extra[1] as readonly number[])];
    definition.owned = extra[2] === 1;
  } else if (kind === "file" && typeof extra === "string") {
    definition.fileFilter = extra;
  }
  return definition;
};

export const buildFcsSchemaFromRows = (
  typeRows: Readonly<Record<string, readonly FcsFieldRow[]>>,
  enumRows: Readonly<Record<string, FcsEnumRow>>,
): FcsSchema => ({
  enums: new Map(
    Object.entries(enumRows).map(([name, [shared, values]]) => [
      name,
      {
        name,
        shared: shared === 1,
        values: values.map(([valueName, value, description]) => ({
          description,
          name: valueName,
          value,
        })),
      },
    ]),
  ),
  types: new Map(
    Object.entries(typeRows).map(([typeName, rows]) => [
      typeName,
      new Map(rows.map((row) => [row[0], toFieldDefinition(row)])),
    ]),
  ),
});

export const getFcsField = (
  schema: FcsSchema | null | undefined,
  fcsTypeName: string,
  fieldName: string,
) => schema?.types.get(fcsTypeName)?.get(fieldName);

/** 番号が確定している (shared ではない) 列挙の 値 → 名前 の表。 */
export const getFcsEnumLabels = (schema: FcsSchema | null | undefined, enumName: string) => {
  const definition = schema?.enums.get(enumName);
  if (!definition || definition.shared) {
    return undefined;
  }
  const labels: Record<number, string> = {};
  for (const value of definition.values) {
    if (value.value !== null) {
      labels[value.value] = `${enumName}.${value.name}`;
    }
  }
  return labels;
};

/** shared 列挙も含め、値の名前から説明コメントを引く。 */
export const getFcsEnumValueDescription = (
  schema: FcsSchema | null | undefined,
  enumName: string,
  valueName: string,
) => schema?.enums.get(enumName)?.values.find((value) => value.name === valueName)?.description;
