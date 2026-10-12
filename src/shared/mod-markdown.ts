import { builtinFcsSource, getBuiltinFcsSchema } from "./fcs-builtin.ts";
import {
  getFcsEnumLabels,
  getFcsField,
  type FcsFieldDefinition,
  type FcsSchema,
} from "./fcs-definitions.ts";
import {
  builtinEnumLabels,
  describeConditionSubject,
  dialogActionLabels,
  dialogConditionLabels,
  dialogEffectValueMeanings,
  eventTriggerDescriptions,
  eventTriggerDisplayNames,
  eventTriggerLabels,
  getDialogConditionKind,
  getDialogConditionTagEnumName,
  getFallbackFieldEnumName,
  isAtLeastCondition,
  repetitionLimitDurations,
  talkerLabels,
} from "./fcs-enums.ts";
import {
  getItemCategory,
  getItemTypeEnglishName,
  getItemTypeFcsName,
  getItemTypeLabel,
  itemCategoryLabels,
  type ItemCategory,
} from "./item-types.ts";
import { isRemovedReference, removedItemFlagKeys } from "./mod-format.ts";
import {
  buildRecordIndexes,
  findRecordValue,
  listRecordValues,
  type RecordValueEntry,
  type RecordValueKind,
} from "./mod-merge.ts";
import type {
  AssetReference,
  DialogRecord,
  EntityRecord,
  InspectorRecord,
  LoadedMod,
  ModProject,
  Reference,
} from "./models.ts";

export interface MarkdownRenderOptions {
  /** 対象 mod が変更したレコードについて、参照コンテキスト上の元の値を併記する。 */
  includeBaseComparison?: boolean;
  /** 出力に現れたフィールドの FCS 定義 (説明・既定値) を巻末にまとめる。 */
  includeFieldGlossary?: boolean;
  /** FCS 定義。省略時はアプリに組み込んだ定義を使う。null なら内蔵の列挙表だけで推定する。 */
  schema?: FcsSchema | null;
  /** 定義の出典 (出力に記載する表示用の文字列)。 */
  schemaSource?: string | null;
}

const dialogueTypeCode = 18;
const dialogueLineTypeCode = 19;
const dialogActionTypeCode = 31;
const dialoguePackageTypeCode = 73;
const wordSwapsTypeCode = 84;
const dialogRecordTypes = new Set([
  dialogueTypeCode,
  dialogueLineTypeCode,
  dialogActionTypeCode,
  dialoguePackageTypeCode,
  wordSwapsTypeCode,
]);
const maxDialogLineRenderDepth = 40;

/** ゲーム本体が置き換えるワードスワップ (WORD_SWAPS レコードではない)。 */
const engineWordSwapTokens: Readonly<Record<string, string>> = {
  COST: "the value of DA_GIVE_MONEY / DA_TAKE_MONEY / DC_PLAYERMONEY on the same line (0 if none)",
  MYNAME: "speaker name",
  PLAYERFACTION: "player faction name",
  TARGETFACTION: "target faction name",
  YOURNAME: "target name (does not work on target lines)",
};

const wordSwapTokenPattern = /\/([A-Z_][A-Z0-9_]*)\//g;

// --- 基本的な整形 -----------------------------------------------------------------

const formatNumber = (value: number) => value.toLocaleString("en-US");

const formatFloatValue = (value: number) => {
  const rounded = Number(value.toFixed(6));
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
};

const pluralSuffix = (label: string, count: number) =>
  `${formatNumber(count)} ${label}${count === 1 ? "" : "s"}`;

const uniquePreserveOrder = (items: readonly string[]) => [...new Set(items)];

const escapeTableCell = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** 表以外の箇条書き・見出し用。改行だけを空白にする。 */
const escapeInline = (value: string) => value.replace(/\r?\n/g, " ");

/** インラインコード。パスの \ はそのまま残し、バッククォートだけを置き換える。 */
const formatCode = (value: string) => `\`${escapeInline(value).replace(/`/g, "'")}\``;

/** 表のセル内のインラインコード (| だけをエスケープする)。 */
const formatCodeInTable = (value: string) => formatCode(value).replace(/\|/g, "\\|");

const escapeFenced = (value: string) => value.replace(/```/g, "``​`");

const formatMultiline = (value: string) => {
  if (value.length === 0) {
    return "(empty)";
  }

  return "```text\n" + escapeFenced(value) + "\n```";
};

const pushIndentedBlock = (lines: string[], indent: string, block: string) => {
  for (const line of block.split("\n")) {
    lines.push(`${indent}${line}`);
  }
};

const isInlineText = (value: string) => !/[\r\n]/.test(value) && value.length <= 600;

/** 1 行で収まるテキストは箇条書きの値として、複数行ならコードブロックとして出力する。 */
const pushTextValue = (lines: string[], indent: string, label: string, value: string) => {
  if (value.length === 0) {
    lines.push(`${indent}- ${label}: (empty)`);
    return;
  }
  if (isInlineText(value)) {
    lines.push(`${indent}- ${label}: ${value}`);
    return;
  }
  lines.push(`${indent}- ${label}:`);
  pushIndentedBlock(lines, `${indent}  `, formatMultiline(value));
};

const normalizeModName = (value: string) => value.replace(/\.(mod|base|translation)$/i, "");

const inferReferenceSource = (targetId: string) => {
  const separatorIndex = targetId.indexOf("-");
  if (separatorIndex < 0 || separatorIndex === targetId.length - 1) {
    return "";
  }

  return targetId.slice(separatorIndex + 1);
};

const formatSigned = (value: number) => (value > 0 ? `+${value}` : String(value));

// --- レコードの基本情報 -----------------------------------------------------------

type HeadingRecord = Pick<InspectorRecord, "name" | "stringId" | "type">;

const isGenericDialogTitle = (value: string) => /^DIALOGUE_LINE\d*$/i.test(value);

const renderBaseRecordHeading = (record: HeadingRecord) => {
  const trimmedName = record.name.trim();

  if (
    record.type === dialogueLineTypeCode &&
    (trimmedName.length === 0 || isGenericDialogTitle(trimmedName))
  ) {
    return record.stringId;
  }

  if (trimmedName.length > 0) {
    return trimmedName;
  }

  if (record.stringId.length > 0) {
    return record.stringId;
  }

  return "(unnamed)";
};

const renderInspectorHeading = (record: HeadingRecord) => renderBaseRecordHeading(record);

const renderTypeDescriptor = (type: number) =>
  `${type} · ${getItemTypeEnglishName(type)} · ${getItemTypeLabel(type)}`;

/** 表示用の状態。REMOVED フラグが立っていれば保存上の変更種別より優先する。 */
const getRecordStatus = (record: Pick<InspectorRecord, "removed" | "saveData">) =>
  record.removed ? "Removed" : record.saveData.changeTypeName;

const getReferences = (record: InspectorRecord | undefined, name: string) =>
  record?.referenceCategories.find((category) => category.name === name)?.references ?? [];

const getStringValue = (record: InspectorRecord, key: string) =>
  record.strings.find((entry) => entry.key === key)?.value ?? "";

const getIntValue = (record: InspectorRecord | undefined, key: string) =>
  record?.values.ints.find((entry) => entry.key === key)?.value;

const getFloatValue = (record: InspectorRecord | undefined, key: string) =>
  record?.values.floats.find((entry) => entry.key === key)?.value;

const getBoolValue = (record: InspectorRecord | undefined, key: string) =>
  record?.values.bools.find((entry) => entry.key === key)?.value;

const getVisibleStringEntries = (record: Pick<InspectorRecord, "strings">) =>
  record.strings.filter((entry) => entry.value.length > 0);

const getVisibleDialogTexts = (record: DialogRecord) =>
  record.texts.filter((text) => text.original.length > 0);

const hasReferenceDetails = (record: InspectorRecord) =>
  record.referenceCategories.some((category) => category.references.length > 0);

const isDialogRelevantRecord = (record: Pick<InspectorRecord, "type">) =>
  dialogRecordTypes.has(record.type);

/** ダイアログ・パッケージは名前に "Unfinished" を含むとゲーム側で無効になる。 */
const isUnfinishedDialog = (record: InspectorRecord) =>
  (record.type === dialogueTypeCode || record.type === dialoguePackageTypeCode) &&
  record.name.includes("Unfinished");

const getTargetMods = (project: ModProject) => project.mods.filter((mod) => mod.role === "target");

const getReferenceMods = (project: ModProject) =>
  project.mods.filter((mod) => mod.role === "reference");

const collectDeclaredDependencies = (mods: readonly LoadedMod[]) =>
  uniquePreserveOrder(mods.flatMap((mod) => mod.header.dependencies));

const collectDeclaredReferences = (mods: readonly LoadedMod[]) =>
  uniquePreserveOrder(mods.flatMap((mod) => mod.header.references));

const groupByMod = <T extends { modName: string }>(records: readonly T[]) => {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const modName = normalizeModName(record.modName);
    const existing = groups.get(modName);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(modName, [record]);
    }
  }
  return groups;
};

// --- 描画コンテキスト -------------------------------------------------------------

interface RenderContext {
  /** 参照コンテキストのみを合成した、対象 mod 適用前のレコード */
  baseById: ReadonlyMap<string, InspectorRecord>;
  /** 参照コンテキスト + 対象 mod を合成した、ゲーム内での実際のレコード */
  effectiveById: ReadonlyMap<string, InspectorRecord>;
  includeBaseComparison: boolean;
  project: ModProject;
  /** 描画済みのダイアログ行 stringId → 最初に描画した場所 */
  renderedLineLocations: Map<string, string>;
  renderedRecordUids: Set<string>;
  schema: FcsSchema | null;
  sourcesById: ReadonlyMap<string, readonly string[]>;
  /** 対象 mod のレコード (差分そのもの) */
  targetById: ReadonlyMap<string, InspectorRecord>;
  /** 出力に現れた FCS 型名 → フィールド名 (用語集用) */
  usedFields: Map<string, Set<string>>;
  wordSwapTokens: Map<string, number>;
}

const createRenderContext = (
  project: ModProject,
  options: MarkdownRenderOptions,
): RenderContext => {
  const indexes = buildRecordIndexes(project.contextRecords, project.inspectorRecords);
  const targetById = new Map<string, InspectorRecord>();
  for (const record of project.inspectorRecords) {
    targetById.set(record.stringId, record);
  }

  return {
    baseById: indexes.base,
    effectiveById: indexes.effective,
    targetById,
    includeBaseComparison: options.includeBaseComparison ?? true,
    project,
    renderedLineLocations: new Map(),
    renderedRecordUids: new Set(),
    schema: options.schema === undefined ? getBuiltinFcsSchema() : options.schema,
    sourcesById: indexes.sources,
    usedFields: new Map(),
    wordSwapTokens: new Map(),
  };
};

const noteUsedField = (ctx: RenderContext, recordType: number, fieldName: string) => {
  const fcsType = getItemTypeFcsName(recordType);
  let fields = ctx.usedFields.get(fcsType);
  if (!fields) {
    fields = new Set();
    ctx.usedFields.set(fcsType, fields);
  }
  fields.add(fieldName);
};

const getFieldDefinition = (ctx: RenderContext, recordType: number, fieldName: string) =>
  getFcsField(ctx.schema, getItemTypeFcsName(recordType), fieldName);

const noteWordSwapTokens = (ctx: RenderContext, text: string) => {
  for (const match of text.matchAll(wordSwapTokenPattern)) {
    const token = match[1]!;
    ctx.wordSwapTokens.set(token, (ctx.wordSwapTokens.get(token) ?? 0) + 1);
  }
};

// --- 値の表示 ---------------------------------------------------------------------

const getEnumNameForField = (ctx: RenderContext, recordType: number, key: string) => {
  const field = getFieldDefinition(ctx, recordType, key);
  if (field) {
    return field.kind === "enum" ? (field.enumName ?? undefined) : undefined;
  }
  return getFallbackFieldEnumName(key, recordType);
};

const getEnumLabels = (ctx: RenderContext, enumName: string) =>
  getFcsEnumLabels(ctx.schema, enumName) ?? builtinEnumLabels[enumName];

const formatItemTypeValue = (value: number) =>
  `${value} (itemType.${getItemTypeEnglishName(value)}: ${getItemTypeLabel(value)})`;

const formatIntegerValue = (ctx: RenderContext, key: string, value: number, recordType: number) => {
  if (key === "itemtype limit") {
    return formatItemTypeValue(value);
  }

  const enumName = getEnumNameForField(ctx, recordType, key);
  const label = enumName ? getEnumLabels(ctx, enumName)?.[value] : undefined;
  if (!label) {
    return String(value);
  }
  if (enumName === "DialogRepetitionEnum") {
    const duration = repetitionLimitDurations[value];
    return duration ? `${value} (${label}: ${duration})` : `${value} (${label})`;
  }
  return `${value} (${label})`;
};

const formatVector = (values: readonly number[]) => {
  const names = ["x", "y", "z", "w"];
  return values.map((value, index) => `${names[index]}=${formatFloatValue(value)}`).join(", ");
};

const formatValueEntry = (ctx: RenderContext, recordType: number, entry: RecordValueEntry) => {
  switch (entry.kind) {
    case "bool":
      return entry.value ? "true" : "false";
    case "int":
      return formatIntegerValue(ctx, entry.key, entry.value as number, recordType);
    case "float":
      return formatFloatValue(entry.value as number);
    case "vec3":
    case "vec4":
      return formatVector(entry.value as readonly number[]);
    case "file":
      return formatCode(entry.value as string);
    default:
      return escapeTableCell(String(entry.value));
  }
};

const valuesEqual = (
  left: RecordValueEntry["value"] | undefined,
  right: RecordValueEntry["value"],
) => {
  if (left === undefined) {
    return false;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => Math.abs(value - right[index]!) < 1e-6)
    );
  }
  if (typeof left === "number" && typeof right === "number") {
    return Math.abs(left - right) < 1e-6;
  }
  return left === right;
};

const unquote = (value: string) =>
  value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;

const getEnumValueNumber = (ctx: RenderContext, enumName: string, valueName: string) => {
  const labels = getEnumLabels(ctx, enumName);
  if (!labels) {
    return undefined;
  }
  for (const [value, label] of Object.entries(labels)) {
    if (label.endsWith(`.${valueName}`)) {
      return Number(value);
    }
  }
  return undefined;
};

/** 新規レコードで省略してよい既定値か。fcs.def があればその既定値、無ければ false / 0 / 空文字。 */
const isDefaultValue = (ctx: RenderContext, recordType: number, entry: RecordValueEntry) => {
  const { kind, value } = entry;
  if ((kind === "string" || kind === "file") && value === "") {
    return true;
  }

  if (!ctx.schema) {
    return (
      (kind === "bool" && value === false) ||
      ((kind === "int" || kind === "float") && Math.abs(value as number) <= Number.EPSILON)
    );
  }

  const field = getFieldDefinition(ctx, recordType, entry.key);
  if (!field) {
    return false;
  }
  return isFieldDefaultValue(ctx, field, kind, value);
};

const isFieldDefaultValue = (
  ctx: RenderContext,
  field: FcsFieldDefinition,
  kind: RecordValueKind,
  value: RecordValueEntry["value"],
) => {
  switch (field.kind) {
    case "bool":
      return kind === "bool" && value === (field.defaultText === "True");
    case "int":
      return kind === "int" && value === Number(field.defaultText);
    case "float":
      return (
        (kind === "float" || kind === "int") &&
        Math.abs((value as number) - Number(field.defaultText)) < 1e-6
      );
    case "enum":
      return (
        kind === "int" &&
        field.enumName !== null &&
        field.enumValue !== null &&
        value === getEnumValueNumber(ctx, field.enumName, field.enumValue)
      );
    case "string":
      return kind === "string" && value === unquote(field.defaultText);
    default:
      return false;
  }
};

/**
 * レコードの値 (文字列以外) を 1 行にまとめる。
 * - 新規レコード: 既定値を省略
 * - 変更レコード: 書き込まれている値はすべて上書きなので省略せず、元の値があれば併記
 */
interface RecordValueOptions {
  base?: InspectorRecord;
  omitKeys?: ReadonlySet<string>;
  preferredOrder?: readonly string[];
  /** 省略時はレコードの変更種別から判断する (新規以外は上書きとして全値を表示)。 */
  treatAsOverride?: boolean;
}

const formatRecordValues = (
  ctx: RenderContext,
  record: InspectorRecord,
  options: RecordValueOptions = {},
) => {
  const isOverride = options.treatAsOverride ?? record.saveData.changeTypeName !== "New";
  const preferredIndex = new Map((options.preferredOrder ?? []).map((key, index) => [key, index]));
  let omittedDefaults = 0;

  const entries = listRecordValues(record).filter((entry) => {
    if (entry.kind === "string" || entry.kind === "file") {
      return false;
    }
    if (
      options.omitKeys?.has(entry.key) ||
      (entry.kind === "bool" && removedItemFlagKeys.has(entry.key))
    ) {
      return false;
    }
    if (!isOverride && isDefaultValue(ctx, record.type, entry)) {
      omittedDefaults += 1;
      return false;
    }
    return true;
  });

  entries.sort((left, right) => {
    const leftPreferred = preferredIndex.get(left.key);
    const rightPreferred = preferredIndex.get(right.key);
    if (leftPreferred !== undefined || rightPreferred !== undefined) {
      return (leftPreferred ?? 10_000) - (rightPreferred ?? 10_000);
    }
    return left.key.localeCompare(right.key, "en");
  });

  const parts = entries.map((entry) => {
    noteUsedField(ctx, record.type, entry.key);
    const formatted = `\`${escapeTableCell(entry.key)}\`=${formatValueEntry(ctx, record.type, entry)}`;
    if (!options.base) {
      return formatted;
    }
    const before = findRecordValue(options.base, entry.kind, entry.key);
    if (before === undefined) {
      return `${formatted} (new field)`;
    }
    if (valuesEqual(before, entry.value)) {
      return `${formatted} (same as base)`;
    }
    return `${formatted} (base ${formatValueEntry(ctx, record.type, { ...entry, value: before })})`;
  });

  return { omittedDefaults, text: parts.join(" · ") };
};

/**
 * ダイアログ系レコードの設定値。既存レコードを変更する mod なら、その mod が書き込んだ値だけを
 * (参照コンテキストがあれば元の値付きで) 示す。ベースから引き継いだ値をこの mod の設定として出さない。
 * それ以外 (新規レコード、参照コンテキストの行) は合成済みの値から既定値を省いて示す。
 */
const formatDialogSettings = (
  ctx: RenderContext,
  effective: InspectorRecord,
  diff: InspectorRecord | undefined,
  base: InspectorRecord | undefined,
  options: Omit<RecordValueOptions, "base" | "treatAsOverride">,
) => {
  if (diff && diff.saveData.changeTypeName !== "New") {
    return {
      ...formatRecordValues(ctx, diff, { ...options, base }),
      label: "Settings changed by this mod",
    };
  }
  return {
    ...formatRecordValues(ctx, effective, { ...options, treatAsOverride: false }),
    label: "Settings",
  };
};

// --- 参照 -------------------------------------------------------------------------

const referenceCategoryHints: Readonly<Record<string, string>> = {
  "AI contract": "dialog effect: starts an AI package as a contract job",
  "change AI": "dialog effect: permanently changes the AI package",
  "change relations": "dialog effect: changes relations with the faction",
  "choosefrom list": "random squad member pool",
  construction: "building construction ingredients or requirements",
  "crowd trigger": "dialog effect: starts the dialogue on other squad members",
  dialogs: "dialogue package entries; v0 is the event trigger",
  effects: "dialog actions that run after this line is selected or reached",
  "enable buildings": "research unlocks these buildings",
  "enable research": "research unlocks these research records",
  functionality: "building functionality record used by a building",
  "give item": "dialog effect: gives the item to the target",
  "has package": "condition: speaker has this dialogue package",
  ingredients: "crafting or production ingredients",
  inheritsFrom: "dialogue package inheritance",
  interrupt: "dialog effect: replaces the speaker's player-talk dialogue temporarily",
  "in town of": "condition: speaker is in a town of the faction",
  "is character": "condition: speaker is this character",
  items: "item/vendor/placement list; value meaning depends on the FCS field",
  lines: "dialogue line children or reply options",
  locks: "dialog effect: locks the dialogue",
  "my faction": "condition: speaker belongs to the faction",
  "my race": "condition: speaker race group",
  "my subrace": "condition: speaker exact race",
  nests: "biome or town spawn entries",
  "no target race": "condition: target squad has none of these races",
  parts: "building visual parts; values commonly include group/chance data",
  produces: "production output item",
  squad: "fixed squad member entries",
  "target carrying character": "condition: target carries this character",
  "target faction": "condition: target belongs to the faction",
  "target has item": "condition: target squad has one of these items",
  "target has item type": "condition: target squad has an item with the same item function",
  "target race": "condition: target squad has a member of these race groups",
  "trigger campaign": "dialog effect that starts a faction campaign",
  "unlock but keep me": "dialog effect: unlocks the dialogue without locking this one",
  unlocks: "dialog effect: unlocks the dialogue and locks this one",
  "upgrades to": "building upgrade targets",
  vendors: "character or faction vendor list",
  weapons: "character or placement weapon entries",
  "world state": "world-state condition entry",
};

const formatReferenceCategoryHint = (name: string) => {
  const hint = referenceCategoryHints[name];
  return hint ? ` - ${hint}` : "";
};

const formatEventTriggerName = (value: number) => {
  const label = eventTriggerLabels[value];
  return label ? label.replace(/^EventTriggerEnum\./, "") : `EV(${value})`;
};

const formatEventTriggerValue = (value: number) => {
  const label = eventTriggerLabels[value];
  const displayName = eventTriggerDisplayNames[value];
  const description = eventTriggerDescriptions[value];
  const labelPart = label && displayName ? `${displayName} / ${label}` : (label ?? displayName);

  if (labelPart && description) {
    return `${value} (${labelPart}: ${description})`;
  }

  if (labelPart) {
    return `${value} (${labelPart})`;
  }

  return String(value);
};

const trimTrailingZeroValues = (values: readonly number[]) => {
  const result = [...values];
  while (result.length > 0 && result.at(-1) === 0) {
    result.pop();
  }
  return result;
};

/** 参照の v0〜v2 を、分かっている範囲で意味のある形にする。表示不要なら空文字。 */
const formatReferenceValues = (
  ctx: RenderContext,
  reference: Reference,
  categoryName: string,
  ownerType: number,
) => {
  if (isRemovedReference(reference)) {
    return "removed by this mod";
  }

  const { value0: v0, value1: v1, value2: v2 } = reference;
  switch (categoryName) {
    case "dialogs":
      return `event ${formatEventTriggerName(v0)}`;
    case "lines":
      return v0 === 0 ? "" : `link value ${v0}`;
    case "AI contract":
      return `${v0} hours`;
    case "trigger campaign":
    case "victory trigger":
    case "loss trigger":
      return `starts after ${v0}-${v1} hours, ${v2}% chance`;
    case "give item":
      return v0 >= 50 ? `quantity ${v0} (treated as 1)` : `quantity ${v0}`;
    case "crowd trigger":
      return `${v0}% of squad members`;
    case "world state":
      return v0 === 1 ? "must be true" : v0 === 0 ? "must be false" : `state ${v0}`;
    case "change relations":
      return `relations ${formatSigned(v0)}`;
    case "Leader AI Goals":
    case "Squad AI Goals":
    case "Squad2 AI Goals":
    case "Slave AI Goals":
      return `hours ${v0}-${v1}, weight ${v2}`;
    default:
      break;
  }

  const field = getFieldDefinition(ctx, ownerType, categoryName);
  const meaningfulCount = field?.kind === "reference" ? field.referenceDefaults.length : undefined;
  const values =
    meaningfulCount === undefined
      ? trimTrailingZeroValues([v0, v1, v2])
      : [v0, v1, v2].slice(0, meaningfulCount);
  if (meaningfulCount === 0 && (v0 !== 0 || v1 !== 0 || v2 !== 0)) {
    return `v0=${v0}, v1=${v1}, v2=${v2}`;
  }
  return values.map((value, index) => `v${index}=${value}`).join(", ");
};

const formatResolvedTarget = (ctx: RenderContext, targetId: string) => {
  const target = ctx.effectiveById.get(targetId);
  if (!target) {
    const source = inferReferenceSource(targetId);
    return `\`${escapeTableCell(targetId)}\` · unresolved${source.length > 0 ? ` (ID from ${escapeTableCell(source)})` : ""}`;
  }

  const heading = renderInspectorHeading(target);
  const idPart = heading === target.stringId ? "" : ` · \`${escapeTableCell(target.stringId)}\``;
  const removedPart = target.removed ? " · removed record" : "";
  return `${escapeTableCell(heading)}${idPart} · ${getItemTypeEnglishName(target.type)}${removedPart}`;
};

type ReferenceChange = "added" | "changed" | "removed" | "removed-missing" | "same" | null;

const classifyReferenceChange = (
  reference: Reference,
  categoryName: string,
  base: InspectorRecord | undefined,
): ReferenceChange => {
  if (!base) {
    return isRemovedReference(reference) ? "removed-missing" : null;
  }
  const before = getReferences(base, categoryName).find(
    (candidate) => candidate.targetId === reference.targetId,
  );
  if (isRemovedReference(reference)) {
    return before ? "removed" : "removed-missing";
  }
  if (!before) {
    return "added";
  }
  return before.value0 === reference.value0 &&
    before.value1 === reference.value1 &&
    before.value2 === reference.value2
    ? "same"
    : "changed";
};

const formatReferenceChangeTag = (
  change: ReferenceChange,
  ctx: RenderContext,
  reference: Reference,
  categoryName: string,
  ownerType: number,
  base: InspectorRecord | undefined,
) => {
  switch (change) {
    case "added":
      return " [added]";
    case "same":
      return " [unchanged]";
    case "removed":
      return " [removed]";
    case "removed-missing":
      return " [removed; not present in loaded base data]";
    case "changed": {
      const before = getReferences(base, categoryName).find(
        (candidate) => candidate.targetId === reference.targetId,
      );
      const beforeText = before ? formatReferenceValues(ctx, before, categoryName, ownerType) : "";
      return beforeText.length > 0 ? ` [changed; base ${beforeText}]` : " [changed]";
    }
    default:
      return "";
  }
};

interface DisplayReference {
  change: ReferenceChange;
  reference: Reference;
}

interface DisplayCategory {
  entries: DisplayReference[];
  name: string;
}

/** 対象 mod のレコード (差分) が持つ参照を、ベースに対する変化付きでそのまま並べる。 */
const getDiffCategories = (record: InspectorRecord, base: InspectorRecord | undefined) =>
  record.referenceCategories
    .filter((category) => category.references.length > 0)
    .map((category): DisplayCategory => ({
      entries: category.references.map((reference) => ({
        change: classifyReferenceChange(reference, category.name, base),
        reference,
      })),
      name: category.name,
    }));

/**
 * ゲーム内での参照一覧 (ベース + 対象 mod の追加・変更・削除) を並べる。
 * 対象 mod が触れていないベースの参照には変化を付けない。削除された参照も [removed] として残す。
 */
const mergeDisplayReferences = (
  diff: InspectorRecord,
  base: InspectorRecord | undefined,
  categoryName: string,
): DisplayReference[] => {
  const own = getReferences(diff, categoryName);
  if (!base) {
    return own.map((reference) => ({
      change: isRemovedReference(reference) ? "removed-missing" : null,
      reference,
    }));
  }

  const result: DisplayReference[] = [];
  const ownByTarget = new Map(own.map((reference) => [reference.targetId, reference]));
  for (const reference of getReferences(base, categoryName)) {
    const override = ownByTarget.get(reference.targetId);
    if (!override) {
      result.push({ change: null, reference });
      continue;
    }
    ownByTarget.delete(reference.targetId);
    const change = classifyReferenceChange(override, categoryName, base);
    result.push({
      change: change === "same" ? null : change,
      reference: isRemovedReference(override) ? reference : override,
    });
  }
  for (const reference of ownByTarget.values()) {
    result.push({ change: classifyReferenceChange(reference, categoryName, base), reference });
  }
  return result;
};

const getEffectiveCategories = (
  effective: InspectorRecord,
  diff: InspectorRecord | undefined,
  base: InspectorRecord | undefined,
): DisplayCategory[] => {
  if (!diff || !base) {
    return getDiffCategories(effective, undefined);
  }
  const names = uniquePreserveOrder([
    ...base.referenceCategories.map((category) => category.name),
    ...diff.referenceCategories.map((category) => category.name),
  ]);
  return names
    .map((name) => ({ entries: mergeDisplayReferences(diff, base, name), name }))
    .filter((category) => category.entries.length > 0);
};

const renderReferenceCategories = (
  lines: string[],
  ctx: RenderContext,
  ownerType: number,
  categories: readonly DisplayCategory[],
  options: { base?: InspectorRecord; indent?: string; omit?: ReadonlySet<string> } = {},
) => {
  const indent = options.indent ?? "";
  for (const category of categories) {
    if (category.entries.length === 0 || options.omit?.has(category.name)) {
      continue;
    }
    noteUsedField(ctx, ownerType, category.name);
    lines.push(
      `${indent}- \`${escapeTableCell(category.name)}\`: ${pluralSuffix("reference", category.entries.length)}${formatReferenceCategoryHint(category.name)}`,
    );
    for (const { change, reference } of category.entries) {
      const isRemoval = change === "removed" || change === "removed-missing";
      const values = isRemoval
        ? ""
        : formatReferenceValues(ctx, reference, category.name, ownerType);
      const valuePart = values.length > 0 ? ` (${values})` : "";
      lines.push(
        `${indent}  - ${formatResolvedTarget(ctx, reference.targetId)}${valuePart}${formatReferenceChangeTag(change, ctx, reference, category.name, ownerType, options.base)}`,
      );
    }
  }
};

// --- ファイル・ベクトル・インスタンス ----------------------------------------------

const renderFileFields = (
  lines: string[],
  ctx: RenderContext,
  record: InspectorRecord,
  base: InspectorRecord | undefined,
) => {
  const isOverride = record.saveData.changeTypeName !== "New";
  const files = record.values.files.filter((entry) => isOverride || entry.value.length > 0);
  if (files.length === 0) {
    return;
  }

  lines.push("- Files:");
  for (const entry of files) {
    noteUsedField(ctx, record.type, entry.key);
    const before = base ? findRecordValue(base, "file", entry.key) : undefined;
    const basePart =
      before === undefined || before === entry.value ? "" : ` (base ${formatCode(String(before))})`;
    lines.push(
      `  - \`${escapeTableCell(entry.key)}\`: ${entry.value.length > 0 ? formatCode(entry.value) : "(cleared)"}${basePart}`,
    );
  }
};

const renderInstanceFields = (lines: string[], ctx: RenderContext, record: InspectorRecord) => {
  if (record.values.instances.length === 0) {
    return;
  }

  lines.push(
    `- Instances (placed objects; position x/y/z in decimetres, rotation as quaternion w/x/y/z): ${formatNumber(record.values.instances.length)}`,
  );
  for (const entry of record.values.instances) {
    if (entry.targetId.length === 0) {
      lines.push(`  - \`${escapeTableCell(entry.key)}\` · removed by this mod`);
      continue;
    }
    const [x = 0, y = 0, z = 0, w = 1, qx = 0, qy = 0, qz = 0] = entry.values;
    const statePart =
      entry.states.length === 0 ? "" : ` · states: ${entry.states.map(escapeTableCell).join(", ")}`;
    lines.push(
      `  - \`${escapeTableCell(entry.key)}\` → ${formatResolvedTarget(ctx, entry.targetId)} · position ${formatVector([x, y, z])} · rotation w=${formatFloatValue(w)}, x=${formatFloatValue(qx)}, y=${formatFloatValue(qy)}, z=${formatFloatValue(qz)}${statePart}`,
    );
  }
};

// --- レコード詳細 (ダイアログ以外) ---------------------------------------------------

const getRecordLineageParts = (ctx: RenderContext, record: InspectorRecord) => {
  const parts: string[] = [];
  const idSource = inferReferenceSource(record.stringId);

  if (idSource.length > 0 && normalizeModName(idSource) !== normalizeModName(record.modName)) {
    parts.push(`ID source: ${escapeTableCell(idSource)}`);
  }

  parts.push(`Change: ${getRecordStatus(record)}`);

  if (record.saveData.changeTypeName.startsWith("Unknown")) {
    parts.push(`Raw saveData: 0x${record.saveData.raw.toString(16)}`);
  }

  if (record.saveData.changeTypeName !== "New") {
    const baseSources = (ctx.sourcesById.get(record.stringId) ?? []).filter(
      (source) => normalizeModName(source) !== normalizeModName(record.modName),
    );
    if (baseSources.length > 0) {
      parts.push(`Base from: ${uniquePreserveOrder(baseSources).map(escapeTableCell).join(" → ")}`);
    } else if (ctx.project.contextRecords.length > 0) {
      parts.push("Base record not in loaded reference context");
    }
  }

  return parts;
};

const getComparisonBase = (ctx: RenderContext, record: InspectorRecord) =>
  ctx.includeBaseComparison && record.saveData.changeTypeName !== "New"
    ? ctx.baseById.get(record.stringId)
    : undefined;

/** 文字列・値・ファイル・参照・インスタンスを含むレコード 1 件分の詳細。 */
const renderRecordDetail = (
  lines: string[],
  ctx: RenderContext,
  record: InspectorRecord,
  options: { describedElsewhere?: ReadonlySet<string> } = {},
) => {
  ctx.renderedRecordUids.add(record.uid);
  const heading = renderInspectorHeading(record);
  const base = getComparisonBase(ctx, record);
  const metaParts: string[] = [];

  if (heading !== record.stringId) {
    metaParts.push(`ID: \`${escapeTableCell(record.stringId)}\``);
  }
  metaParts.push(`Type: ${renderTypeDescriptor(record.type)}`);
  metaParts.push(...getRecordLineageParts(ctx, record));

  lines.push(`#### ${escapeTableCell(heading)}`);
  lines.push("");
  lines.push(`- ${metaParts.join(" · ")}`);

  if (base && base.name !== record.name && record.name.length > 0) {
    lines.push(`- Renamed from: ${escapeTableCell(base.name)}`);
  }
  if (record.removed) {
    lines.push(
      base
        ? `- Removed by this mod: deletes the base record "${escapeTableCell(base.name)}" (${getItemTypeEnglishName(base.type)}).`
        : "- Removed by this mod (REMOVED flag): the record is deleted from the game.",
    );
  }

  const isOverride = record.saveData.changeTypeName !== "New";
  const strings = isOverride ? record.strings : getVisibleStringEntries(record);
  for (const entry of strings) {
    noteUsedField(ctx, record.type, entry.key);
    if (entry.key === "description" && options.describedElsewhere?.has(record.uid)) {
      lines.push("- `description`: shown in Entity Descriptions above");
      continue;
    }
    const before = base ? findRecordValue(base, "string", entry.key) : undefined;
    pushTextValue(lines, "", `\`${escapeTableCell(entry.key)}\``, entry.value);
    if (typeof before === "string" && before !== entry.value) {
      pushTextValue(lines, "  ", "base value", before);
    }
  }

  const values = formatRecordValues(ctx, record, { base });
  if (values.text.length > 0) {
    lines.push(`- Values: ${values.text}`);
  }
  if (values.omittedDefaults > 0) {
    lines.push(
      `- Default values omitted: ${formatNumber(values.omittedDefaults)}${ctx.schema ? " (equal to the fcs.def default)" : " (false / 0)"}`,
    );
  }

  renderFileFields(lines, ctx, record, base);
  renderInstanceFields(lines, ctx, record);

  if (hasReferenceDetails(record)) {
    lines.push("- References:");
    renderReferenceCategories(lines, ctx, record.type, getDiffCategories(record, base), {
      base,
      indent: "  ",
    });
  }

  lines.push("");
};

// --- 集計 -------------------------------------------------------------------------

const countBy = <T, K>(items: readonly T[], getKey: (item: T) => K) => {
  const counts = new Map<K, number>();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
};

interface ProjectSummary {
  dialogLineRecordCount: number;
  noStringRecordCount: number;
  removedCount: number;
  renamedCount: number;
  stringRecordCount: number;
  statusCounts: Map<string, number>;
}

const summarizeProject = (project: ModProject): ProjectSummary => {
  let noStringRecordCount = 0;
  let stringRecordCount = 0;
  let dialogLineRecordCount = 0;
  for (const record of project.inspectorRecords) {
    if (record.type === dialogueLineTypeCode) {
      dialogLineRecordCount += 1;
    }
    if (isDialogRelevantRecord(record)) {
      continue;
    }
    if (getVisibleStringEntries(record).length > 0) {
      stringRecordCount += 1;
    } else if (!hasReferenceDetails(record)) {
      noStringRecordCount += 1;
    }
  }
  const statusCounts = new Map(countBy(project.inspectorRecords, getRecordStatus));
  return {
    dialogLineRecordCount,
    noStringRecordCount,
    removedCount: statusCounts.get("Removed") ?? 0,
    renamedCount: statusCounts.get("Renamed") ?? 0,
    statusCounts,
    stringRecordCount,
  };
};

// --- 各セクション -----------------------------------------------------------------

const renderHeader = (ctx: RenderContext, summary: ProjectSummary, schemaSource: string | null) => {
  const { project } = ctx;
  const targetMods = getTargetMods(project);
  const referenceMods = getReferenceMods(project);
  const lines: string[] = [];

  lines.push("# Kenshi Mod Markdown Export");
  lines.push("");
  if (referenceMods.length > 0) {
    lines.push(
      "This file is a target-focused Markdown dump of the selected Kenshi `.mod` / `.base` files,",
    );
    lines.push(
      "with reference context loaded only for resolving names, dialogue links, base values, and cross-mod relationships.",
    );
  } else {
    lines.push("This file is a merged Markdown dump of all loaded Kenshi `.mod` / `.base` files,");
    lines.push("formatted for human review and LLM ingestion.");
  }
  lines.push("");
  lines.push("## File Summary");
  lines.push("");
  lines.push("### Purpose");
  lines.push(
    "Provide a complete and prompt-friendly snapshot of the selected mods: metadata, record inventory, every record the mod adds, changes, renames or removes, extracted text, dialogue structure, and referenced asset files.",
  );
  lines.push("");
  lines.push("### Reading Guide");
  lines.push(
    "- Each record has a `Change` status: `New` (added by the mod), `Changed` (overrides only the fields listed), `Renamed` (changed and renamed), or `Removed` (the mod deletes the record via the FCS `REMOVED` flag).",
  );
  lines.push(
    "- In `Changed` / `Renamed` records every listed value is an override. `(base X)` shows the value before this mod when the reference context contains the original record; `(same as base)` means the override does not change anything.",
  );
  lines.push(
    "- References tagged `[added]`, `[changed]` or `[removed]` describe how the mod edits a list inherited from the base record. A reference whose values are all 2147483647 is the FCS marker for deleting that entry.",
  );
  lines.push(
    `- Values equal to the default are omitted from \`New\` records${schemaSource ? " (defaults come from fcs.def; see the Field Glossary)" : " (false / 0)"}. Empty strings are omitted.`,
  );
  lines.push(
    "- `Dialog Structures` shows packages → dialogues → lines → replies. Every line is expanded once; later appearances point back with `↪ shown above`. Conditions and effects are written as readable expressions, and `score≈N` is the selection score estimated with the community-documented formula (higher scores are tried first).",
  );
  lines.push(
    "- `Records Without Strings or References` lists records that only change numbers, rename something, or remove a record; they are easy to miss but change gameplay.",
  );
  lines.push("");
  lines.push("### Metrics");
  lines.push(`- Source project: **${escapeTableCell(project.sourceModName)}**`);
  lines.push(`- Target mods: **${formatNumber(targetMods.length)}**`);
  if (referenceMods.length > 0) {
    lines.push(`- Reference mods: **${formatNumber(referenceMods.length)}**`);
    lines.push(
      `- Reference records available for resolution: **${formatNumber(project.contextRecords.length)}**`,
    );
  }
  lines.push(`- Target records: **${formatNumber(project.inspectorRecords.length)}**`);
  for (const status of ["New", "Changed", "Renamed", "Removed"]) {
    lines.push(`- ${status} records: **${formatNumber(summary.statusCounts.get(status) ?? 0)}**`);
  }
  for (const [status, count] of summary.statusCounts) {
    if (!["New", "Changed", "Renamed", "Removed"].includes(status)) {
      lines.push(`- ${escapeTableCell(status)} records: **${formatNumber(count)}**`);
    }
  }
  lines.push(`- Non-dialogue records with strings: **${formatNumber(summary.stringRecordCount)}**`);
  lines.push(
    `- Records without strings or references: **${formatNumber(summary.noStringRecordCount)}**`,
  );
  lines.push(`- Dialogue line records: **${formatNumber(summary.dialogLineRecordCount)}**`);
  lines.push(
    `- Declared dependencies: **${formatNumber(collectDeclaredDependencies(targetMods).length)}**`,
  );
  if (project.assetReferences.length > 0) {
    const missing = project.assetReferences.filter((asset) => asset.status === "missing").length;
    lines.push(
      `- Referenced asset files: **${formatNumber(project.assetReferences.length)}** (missing: **${formatNumber(missing)}**)`,
    );
  }
  lines.push(
    `- Field semantics: ${schemaSource ? `FCS definitions (fcs.def / fcs_enums.def) from ${escapeInline(schemaSource)}` : "built-in enum tables only"}`,
  );
  lines.push("");

  return lines.join("\n");
};

const renderNavigation = (
  sections: ReadonlyArray<{ anchor: string; content: string; title: string }>,
) => {
  const lines: string[] = ["## Navigation", ""];
  for (const section of sections) {
    if (section.content.length > 0) {
      lines.push(`- [${section.title}](#${section.anchor})`);
    }
  }
  lines.push("");
  return lines.join("\n");
};

const renderStructure = (project: ModProject) => {
  const targetMods = getTargetMods(project);
  const referenceMods = getReferenceMods(project);
  const lines: string[] = [];
  lines.push("## Directory Structure");
  lines.push("");
  lines.push("```text");
  lines.push(`${project.sourceModName}/`);
  lines.push("  target/");
  for (const mod of targetMods) {
    lines.push(`    ${mod.fileName}  (${pluralSuffix("record", mod.recordCount)})`);
  }
  if (referenceMods.length > 0) {
    lines.push("  reference-context/  (load order)");
    for (const mod of referenceMods) {
      lines.push(`    ${mod.fileName}  (${pluralSuffix("record", mod.recordCount)})`);
    }
  }
  lines.push("```");
  lines.push("");
  return lines.join("\n");
};

const renderReferenceContext = (project: ModProject) => {
  const referenceMods = getReferenceMods(project);
  if (referenceMods.length === 0 && project.failedMods.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push("## Reference Context");
  lines.push("");
  if (referenceMods.length > 0) {
    lines.push(
      "Reference mods are not rendered as target content. They are merged in load order (vanilla base files first, the same rule the game and OpenConstructionSet use) so references from the selected mod resolve to readable names, base values, dialogue text, conditions, and effects.",
    );
    lines.push("");
    const textCounts = new Map(
      countBy(project.contextTextRecords, (record) => normalizeModName(record.modName)),
    );
    lines.push("| Order | Mod | Records | Text records | Dependencies |");
    lines.push("| ---: | --- | ---: | ---: | --- |");
    referenceMods.forEach((mod, index) => {
      lines.push(
        `| ${index + 1} | ${escapeTableCell(mod.fileName)} | ${formatNumber(mod.recordCount)} | ${formatNumber(textCounts.get(normalizeModName(mod.fileName)) ?? 0)} | ${
          mod.header.dependencies.length === 0
            ? "—"
            : mod.header.dependencies.map(escapeTableCell).join(", ")
        } |`,
      );
    });
    lines.push("");
  }
  if (project.failedMods.length > 0) {
    lines.push("### Files That Could Not Be Parsed");
    lines.push("");
    for (const failed of project.failedMods) {
      lines.push(
        `- \`${escapeTableCell(failed.filePath)}\` (${failed.role}): ${escapeTableCell(failed.error)}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
};

const renderDependencies = (mods: readonly LoadedMod[]) => {
  const dependencies = collectDeclaredDependencies(mods);
  const references = collectDeclaredReferences(mods);
  const lines: string[] = [];

  if (dependencies.length > 0) {
    lines.push("## Declared Dependencies");
    lines.push("");
    for (const dependency of dependencies) {
      lines.push(`- ${escapeTableCell(dependency)}`);
    }
    lines.push("");
  }

  if (references.length > 0) {
    lines.push("## Declared References");
    lines.push("");
    for (const reference of references) {
      lines.push(`- ${escapeTableCell(reference)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
};

const renderCategoryBreakdown = (records: readonly InspectorRecord[]) => {
  const counts = countBy(records, (record) => getItemCategory(record.type));
  if (counts.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push("## Category Breakdown");
  lines.push("");
  lines.push("| Category | Records |");
  lines.push("| --- | ---: |");
  for (const [category, count] of counts as Array<[ItemCategory, number]>) {
    lines.push(`| ${itemCategoryLabels[category]} (${category}) | ${formatNumber(count)} |`);
  }
  lines.push("");
  return lines.join("\n");
};

const renderTypeBreakdown = (records: readonly InspectorRecord[]) => {
  const counts = countBy(records, (record) => record.type);
  if (counts.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push("## Item Type Breakdown");
  lines.push("");
  lines.push("| Type Code | English | Label | Records |");
  lines.push("| ---: | --- | --- | ---: |");
  for (const [type, count] of counts) {
    lines.push(
      `| ${type} | ${getItemTypeEnglishName(type)} | ${getItemTypeLabel(type)} | ${formatNumber(count)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
};

const renderRecordChangeBreakdown = (project: ModProject) => {
  if (project.inspectorRecords.length === 0) {
    return "";
  }

  const loadedModNames = new Set(
    getTargetMods(project).map((mod) => normalizeModName(mod.fileName)),
  );
  const referenceModNames = new Set(
    getReferenceMods(project).map((mod) => normalizeModName(mod.fileName)),
  );
  const lines: string[] = [];

  lines.push("## Record Change Breakdown");
  lines.push("");
  lines.push(
    "Change type comes from the item save data written by the FCS: `New` = added by the mod, `Changed` = an existing record is edited (only the stored fields are overridden), `Renamed` = edited and renamed, `Removed` = deleted by the mod (`REMOVED` flag).",
  );
  lines.push("");
  lines.push("| Change type | Records |");
  lines.push("| --- | ---: |");
  for (const [changeType, count] of countBy(project.inspectorRecords, getRecordStatus)) {
    lines.push(`| ${escapeTableCell(changeType)} | ${formatNumber(count)} |`);
  }
  lines.push("");
  lines.push("### ID Source Breakdown");
  lines.push("");
  lines.push(
    "The ID source is inferred from the part after the first hyphen in `stringId`. External sources usually indicate records that originated in another mod, base game file, or an earlier file name.",
  );
  lines.push("");
  lines.push("| ID source | Records | Relation to loaded mod |");
  lines.push("| --- | ---: | --- |");
  for (const [source, count] of countBy(
    project.inspectorRecords,
    (record) => inferReferenceSource(record.stringId) || "(unknown)",
  )) {
    const normalizedSource = normalizeModName(source);
    const relation = loadedModNames.has(normalizedSource)
      ? "target mod"
      : referenceModNames.has(normalizedSource)
        ? "reference context"
        : "external/base/renamed source";
    lines.push(`| ${escapeTableCell(source)} | ${formatNumber(count)} | ${relation} |`);
  }
  lines.push("");

  return lines.join("\n");
};

const renderMods = (mods: readonly LoadedMod[]) => {
  const lines: string[] = [];
  lines.push("## Mods");
  lines.push("");

  for (const mod of mods) {
    lines.push(`### ${escapeTableCell(mod.fileName)}`);
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("| --- | --- |");
    lines.push(
      `| Role | ${mod.role === "target" ? "target export" : `reference context (load order ${mod.loadOrder})`} |`,
    );
    if (mod.info) {
      if (mod.info.title.length > 0) {
        lines.push(`| Title | ${escapeTableCell(mod.info.title)} |`);
      }
      if (mod.info.id.length > 0 && mod.info.id !== "0") {
        lines.push(`| Workshop ID | ${escapeTableCell(mod.info.id)} |`);
      }
      if (mod.info.tags.length > 0) {
        lines.push(`| Tags | ${mod.info.tags.map(escapeTableCell).join(", ")} |`);
      }
      if (mod.info.lastUpdate.length > 0) {
        lines.push(`| Last update | ${escapeTableCell(mod.info.lastUpdate)} |`);
      }
    }
    lines.push(
      `| File type | ${mod.header.fileType}${mod.header.fileType === 16 ? " (legacy format)" : ""} |`,
    );
    lines.push(`| Version | ${mod.header.version} |`);
    lines.push(
      `| Author | ${mod.header.author.length > 0 ? escapeTableCell(mod.header.author) : "(unknown)"} |`,
    );
    lines.push(`| Record count | ${formatNumber(mod.recordCount)} |`);
    if (mod.header.saveCount > 0) {
      lines.push(`| FCS save count | ${formatNumber(mod.header.saveCount)} |`);
    }
    lines.push(
      `| Dependencies | ${
        mod.header.dependencies.length === 0
          ? "—"
          : mod.header.dependencies.map(escapeTableCell).join(", ")
      } |`,
    );
    lines.push(
      `| References | ${
        mod.header.references.length === 0
          ? "—"
          : mod.header.references.map(escapeTableCell).join(", ")
      } |`,
    );
    if (mod.header.mergeEntries.length > 0) {
      lines.push(
        `| Merged from | ${mod.header.mergeEntries.map((entry) => `${escapeTableCell(entry.key)} (${entry.version1}/${entry.version2})`).join(", ")} |`,
      );
    }
    if (mod.header.deleteRequests.length > 0) {
      lines.push(
        `| Delete requests | ${mod.header.deleteRequests.map((entry) => `${escapeTableCell(entry.key)}: ${escapeTableCell(entry.items)}`).join("; ")} |`,
      );
    }
    lines.push("");

    if (mod.warnings.length > 0) {
      lines.push("**Parser warnings**");
      lines.push("");
      for (const warning of mod.warnings) {
        lines.push(`- ${escapeTableCell(warning)}`);
      }
      lines.push("");
    }

    if (mod.header.description.length > 0) {
      lines.push("**Description**");
      lines.push("");
      lines.push(formatMultiline(mod.header.description));
      lines.push("");
    }
  }

  return lines.join("\n");
};

// --- ダイアログ -------------------------------------------------------------------

const speakerShortLabels: Readonly<Record<number, string>> = {
  0: "ME",
  1: "TARGET",
  2: "TARGET_IF_PLAYER",
  3: "INTERJECTOR1",
  4: "INTERJECTOR2",
  5: "INTERJECTOR3",
  6: "WHOLE_SQUAD",
  7: "TARGET_WITH_RACE",
};

const speakerScoreBonus: Readonly<Record<number, number>> = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 2,
  6: 2,
  7: 1,
};

/** 1 件あれば +2 されるカテゴリ */
const flatScoreCategories = [
  "give item",
  "has package",
  "in town of",
  "is character",
  "my faction",
  "my race",
  "my subrace",
  "target carrying character",
  "target faction",
  "target has item type",
];

/**
 * ダイアログ / ダイアログ行の選択スコアを推定する (Steam ガイドで検証された式)。
 * スコアの高い行から判定され、成立した行より低いスコアの行は判定されない。
 */
const estimateDialogScore = (ctx: RenderContext, record: InspectorRecord) => {
  let score = getIntValue(record, "score bonus") ?? 0;
  score += speakerScoreBonus[getIntValue(record, "speaker") ?? 0] ?? 0;
  if (getBoolValue(record, "interjection")) {
    score += 2;
  }
  if ((getFloatValue(record, "chance permanent") ?? 100) < 99) {
    score += 1;
  }
  if (getBoolValue(record, "locked")) {
    score += 2;
  }
  if ((getIntValue(record, "target is type") ?? 0) !== 0) {
    score += 1;
  }

  for (const reference of getReferences(record, "conditions")) {
    score += 1;
    const action = ctx.effectiveById.get(reference.targetId);
    const conditionName = getIntValue(action, "condition name");
    if (
      conditionName !== undefined &&
      getDialogConditionKind(conditionName) === "tag" &&
      reference.value0 === 1
    ) {
      score += 1;
    }
  }

  for (const category of flatScoreCategories) {
    if (getReferences(record, category).length > 0) {
      score += 2;
    }
  }
  score += 2 * getReferences(record, "target has item").length;
  score += 2 * getReferences(record, "world state").length;
  if (getReferences(record, "target race").length > 0) {
    score += 4;
  }
  return score;
};

const getLabelName = (labels: Readonly<Record<number, string>>, value: number, fallback: string) =>
  labels[value]?.replace(/^[A-Za-z]+\./, "") ?? `${fallback}(${value})`;

const formatCondition = (ctx: RenderContext, reference: Reference) => {
  if (isRemovedReference(reference)) {
    return `\`${escapeTableCell(reference.targetId)}\` [removed by this mod]`;
  }

  const action = ctx.effectiveById.get(reference.targetId);
  const conditionName = getIntValue(action, "condition name");
  if (!action || conditionName === undefined) {
    return `\`${escapeTableCell(reference.targetId)}\` · ${action ? "not a condition record" : "unresolved"} (value ${reference.value0})`;
  }
  ctx.renderedRecordUids.add(action.uid);

  const name = getLabelName(dialogConditionLabels, conditionName, "DC");
  const who = getIntValue(action, "who") ?? 0;
  const subject = `${name}(${describeConditionSubject(who)})`;
  const value = reference.value0;
  const parts: string[] = [];

  switch (getDialogConditionKind(conditionName)) {
    case "always":
      parts.push(`${name}: always true (not evaluated, only adds score)`);
      break;
    case "bool":
      parts.push(`${subject} is ${value > 0 ? "true" : "false"}`);
      break;
    case "tag": {
      const tag = getIntValue(action, "tag") ?? -1;
      const enumName = getDialogConditionTagEnumName(conditionName) ?? "";
      const tagLabel = getLabelName(getEnumLabels(ctx, enumName) ?? {}, tag, "tag");
      parts.push(
        value === 1
          ? `${subject} has tag ${tagLabel} (allow list)`
          : `${subject} does not have tag ${tagLabel} (deny list)`,
      );
      break;
    }
    case "int": {
      const compareBy = getIntValue(action, "compare by") ?? 0;
      if (isAtLeastCondition(conditionName) && compareBy !== 1) {
        parts.push(`${subject} >= ${value}`);
      } else {
        parts.push(`${subject} ${compareBy === 1 ? "<" : compareBy === 2 ? ">" : "=="} ${value}`);
      }
      break;
    }
  }

  const stringVar = getStringValue(action, "stringvar");
  if (stringVar.length > 0) {
    parts.push(`string "${escapeTableCell(stringVar)}"`);
  }
  if (action.removed) {
    parts.push("[condition record removed]");
  }
  return parts.join(" · ");
};

const formatEffect = (ctx: RenderContext, reference: Reference) => {
  if (isRemovedReference(reference)) {
    return `\`${escapeTableCell(reference.targetId)}\` [removed by this mod]`;
  }

  const action = ctx.effectiveById.get(reference.targetId);
  const actionName = getIntValue(action, "action name");
  if (!action || actionName === undefined) {
    return `\`${escapeTableCell(reference.targetId)}\` · ${action ? "not an effect record" : "unresolved"} (value ${reference.value0})`;
  }
  ctx.renderedRecordUids.add(action.uid);

  const parts = [getLabelName(dialogActionLabels, actionName, "DA")];
  const meaning = dialogEffectValueMeanings[actionName];
  if (meaning) {
    parts.push(`${reference.value0} (${meaning})`);
  } else if (reference.value0 !== 0) {
    parts.push(`value ${reference.value0}`);
  }
  const legacyValue = getIntValue(action, "action value");
  if (legacyValue !== undefined && legacyValue !== 0) {
    parts.push(`action value field ${legacyValue}`);
  }
  if (action.removed) {
    parts.push("[effect record removed]");
  }
  return parts.join(" ");
};

const formatChangeSuffix = (change: ReferenceChange | undefined) => {
  switch (change) {
    case "added":
      return " [added]";
    case "changed":
      return " [changed]";
    case "removed":
    case "removed-missing":
      return " [removed]";
    default:
      return "";
  }
};

const renderConditionsAndEffects = (
  lines: string[],
  ctx: RenderContext,
  ownerType: number,
  categories: readonly DisplayCategory[],
  indent: string,
) => {
  for (const [categoryName, label, format] of [
    ["conditions", "Conditions", formatCondition],
    ["effects", "Effects", formatEffect],
  ] as const) {
    const category = categories.find((candidate) => candidate.name === categoryName);
    if (!category || category.entries.length === 0) {
      continue;
    }
    noteUsedField(ctx, ownerType, categoryName);
    lines.push(`${indent}- ${label}:`);
    for (const { change, reference } of category.entries) {
      lines.push(`${indent}  - ${format(ctx, reference)}${formatChangeSuffix(change)}`);
    }
  }
};

const dialogSettingOrder = [
  "speaker",
  "monologue",
  "for enemies",
  "locked",
  "one at a time",
  "once only",
  "interjection",
  "chance permanent",
  "chance temporary",
  "repetition limit",
  "score bonus",
  "target is type",
];

/** 合成済みレコードのテキスト (text0, text1, ...)。変更レコードでもベースの他の候補が残る。 */
const getDialogTexts = (record: InspectorRecord) =>
  record.strings
    .filter((entry) => entry.key.startsWith("text") && entry.value.length > 0)
    .map((entry) => ({ original: entry.value, textId: entry.key }));

const formatTextSnippet = (record: InspectorRecord) => {
  const [first] = getDialogTexts(record);
  if (!first) {
    return "";
  }
  const flat = first.original.replace(/\s+/g, " ").trim();
  return ` — "${escapeTableCell(flat.length > 100 ? `${flat.slice(0, 100)}…` : flat)}"`;
};

const renderLineTexts = (
  lines: string[],
  ctx: RenderContext,
  record: InspectorRecord,
  indent: string,
) => {
  const texts = getDialogTexts(record);
  if (texts.length === 0) {
    return;
  }
  for (const text of texts) {
    noteWordSwapTokens(ctx, text.original);
  }
  if (texts.length === 1) {
    const [text] = texts;
    pushTextValue(
      lines,
      indent,
      text!.textId === "text0" ? "Text" : `Text \`${text!.textId}\``,
      text!.original,
    );
    return;
  }
  lines.push(`${indent}- Text variants (one is chosen at random): ${formatNumber(texts.length)}`);
  for (const text of texts) {
    pushTextValue(lines, `${indent}  `, `\`${text.textId}\``, text.original);
  }
};

interface LineNodeOptions {
  change?: ReferenceChange;
  /** false なら 1 行の要約だけを出す (この mod が手を加えていない既存の行) */
  expand?: boolean;
}

const renderDialogueLineNode = (
  lines: string[],
  ctx: RenderContext,
  reference: Reference,
  location: string,
  depth: number,
  options: LineNodeOptions = {},
) => {
  const indent = "  ".repeat(depth);
  const changeSuffix = formatChangeSuffix(options.change);
  if (isRemovedReference(reference)) {
    lines.push(
      `${indent}- Line \`${escapeTableCell(reference.targetId)}\`${changeSuffix.length > 0 ? changeSuffix : " [removed]"}`,
    );
    return;
  }

  const lineRecord = ctx.effectiveById.get(reference.targetId);
  if (!lineRecord) {
    lines.push(
      `${indent}- Missing line reference: \`${escapeTableCell(reference.targetId)}\`${changeSuffix}`,
    );
    return;
  }

  const lineId = lineRecord.stringId;
  const speaker = speakerShortLabels[getIntValue(lineRecord, "speaker") ?? 0] ?? "?";
  const role = getBoolValue(lineRecord, "interjection") ? "INTERJECTION NODE" : speaker;
  const heading = renderInspectorHeading(lineRecord);
  const namePart = heading === lineId ? "" : ` "${escapeTableCell(heading)}"`;
  const linkPart = reference.value0 !== 0 ? ` · link value ${reference.value0}` : "";
  const label = `${indent}- [${role}] Line \`${escapeTableCell(lineId)}\`${namePart}`;

  if (options.change === "removed" || options.change === "removed-missing") {
    lines.push(`${label}${changeSuffix}${formatTextSnippet(lineRecord)}`);
    return;
  }

  const previous = ctx.renderedLineLocations.get(lineId);
  if (previous !== undefined) {
    lines.push(
      `${label}${linkPart}${changeSuffix} ↪ shown above${previous === location ? "" : ` (in ${previous})`}`,
    );
    return;
  }

  const targetRecord = ctx.targetById.get(lineId);
  if (options.expand === false && !targetRecord) {
    lines.push(`${label}${linkPart} · unchanged base line${formatTextSnippet(lineRecord)}`);
    return;
  }

  ctx.renderedLineLocations.set(lineId, location);
  if (targetRecord) {
    ctx.renderedRecordUids.add(targetRecord.uid);
  }
  const status = !targetRecord
    ? " · from reference context"
    : targetRecord.saveData.changeTypeName !== "New" || targetRecord.removed
      ? ` · ${getRecordStatus(targetRecord)} by this mod`
      : "";
  lines.push(
    `${label} · score≈${estimateDialogScore(ctx, lineRecord)}${linkPart}${status}${changeSuffix}`,
  );

  const childIndent = `${indent}  `;
  if (lineRecord.removed) {
    lines.push(`${childIndent}- Removed by this mod (the line no longer exists in game).`);
    return;
  }

  renderLineTexts(lines, ctx, lineRecord, childIndent);
  const base = targetRecord ? getComparisonBase(ctx, targetRecord) : undefined;
  const settings = formatDialogSettings(ctx, lineRecord, targetRecord, base, {
    omitKeys: new Set(["speaker", "interjection", "owner"]),
    preferredOrder: dialogSettingOrder,
  });
  if (settings.text.length > 0) {
    lines.push(`${childIndent}- ${settings.label}: ${settings.text}`);
  }

  const categories = getEffectiveCategories(lineRecord, targetRecord, base);
  renderConditionsAndEffects(lines, ctx, lineRecord.type, categories, childIndent);
  renderReferenceCategories(lines, ctx, lineRecord.type, categories, {
    base,
    indent: childIndent,
    omit: new Set(["conditions", "effects", "lines"]),
  });

  const children = categories.find((category) => category.name === "lines")?.entries ?? [];
  if (children.length === 0) {
    return;
  }
  noteUsedField(ctx, lineRecord.type, "lines");
  if (!targetRecord) {
    // 参照コンテキストの行は、この mod の会話から入る先として本文だけを示し、続きは展開しない
    lines.push(
      `${childIndent}- Replies / next lines: ${formatNumber(children.length)} in the base dialogue (not expanded)`,
    );
    return;
  }
  if (depth >= maxDialogLineRenderDepth) {
    lines.push(
      `${childIndent}- Replies: depth limit reached (${pluralSuffix("line", children.length)} not expanded).`,
    );
    return;
  }
  lines.push(`${childIndent}- Replies / next lines: ${formatNumber(children.length)}`);
  for (const { change, reference: childReference } of children) {
    // 既存の行を編集している場合、手を加えていない返答は要約だけにする
    renderDialogueLineNode(lines, ctx, childReference, location, depth + 2, {
      change,
      expand: !base || change !== null,
    });
  }
};

const renderDialogueRecord = (lines: string[], ctx: RenderContext, record: InspectorRecord) => {
  ctx.renderedRecordUids.add(record.uid);
  const effective = ctx.effectiveById.get(record.stringId) ?? record;
  const base = getComparisonBase(ctx, record);
  const heading = renderInspectorHeading(record);
  const location = `dialogue "${heading}"`;

  lines.push(`###### ${escapeTableCell(heading)}`);
  lines.push("");
  const metaParts = [
    `ID: \`${escapeTableCell(record.stringId)}\``,
    ...getRecordLineageParts(ctx, record),
    `score≈${estimateDialogScore(ctx, effective)}`,
  ];
  lines.push(`- ${metaParts.join(" · ")}`);
  if (isUnfinishedDialog(effective)) {
    lines.push('- Disabled in game: the name contains "Unfinished".');
  }
  if (record.removed) {
    lines.push("- Removed by this mod.");
    lines.push("");
    return;
  }

  const tag = getStringValue(effective, "tag");
  if (tag.length > 0) {
    lines.push(`- Tag: ${escapeTableCell(tag)}`);
  }
  const settings = formatDialogSettings(ctx, effective, record, base, {
    omitKeys: new Set(["owner"]),
    preferredOrder: dialogSettingOrder,
  });
  if (settings.text.length > 0) {
    lines.push(`- ${settings.label}: ${settings.text}`);
  }
  if (base) {
    lines.push(
      "- This mod edits an existing dialogue: entries tagged [added] / [changed] / [removed] are its edits; untagged lines come from the base dialogue and are only summarised.",
    );
  }

  const categories = getEffectiveCategories(effective, record, base);
  renderConditionsAndEffects(lines, ctx, record.type, categories, "");
  renderReferenceCategories(lines, ctx, record.type, categories, {
    base,
    omit: new Set(["conditions", "effects", "lines"]),
  });

  const rootLines = categories.find((category) => category.name === "lines")?.entries ?? [];
  if (rootLines.length === 0) {
    lines.push("- Lines: none");
    lines.push("");
    return;
  }

  noteUsedField(ctx, record.type, "lines");
  lines.push(`- Root lines: ${formatNumber(rootLines.length)}`);
  for (const { change, reference } of rootLines) {
    renderDialogueLineNode(lines, ctx, reference, location, 1, {
      change,
      expand: !base || change !== null,
    });
  }
  lines.push("");
};

const renderDialoguePackage = (lines: string[], ctx: RenderContext, record: InspectorRecord) => {
  ctx.renderedRecordUids.add(record.uid);
  const heading = renderInspectorHeading(record);
  const base = getComparisonBase(ctx, record);
  const effective = ctx.effectiveById.get(record.stringId) ?? record;

  lines.push(
    `- ${escapeTableCell(heading)} · \`${escapeTableCell(record.stringId)}\` · ${getRecordLineageParts(ctx, record).join(" · ")}`,
  );
  if (isUnfinishedDialog(record)) {
    lines.push('  - Disabled in game: the name contains "Unfinished".');
  }
  if (record.removed) {
    lines.push("  - Removed by this mod.");
    return;
  }
  const tag = getStringValue(effective, "tag");
  if (tag.length > 0) {
    lines.push(`  - Tag: ${escapeTableCell(tag)}`);
  }

  const inherited = getReferences(effective, "inheritsFrom");
  if (inherited.length > 0) {
    noteUsedField(ctx, record.type, "inheritsFrom");
    lines.push(
      `  - Inherits from (dialogs of these packages are added recursively): ${inherited.map((reference) => formatResolvedTarget(ctx, reference.targetId)).join("; ")}`,
    );
  }

  const dialogs = mergeDisplayReferences(record, base, "dialogs");
  if (dialogs.length === 0) {
    return;
  }
  noteUsedField(ctx, record.type, "dialogs");
  const byEvent = new Map<number, typeof dialogs>();
  for (const entry of dialogs) {
    const list = byEvent.get(entry.reference.value0) ?? [];
    list.push(entry);
    byEvent.set(entry.reference.value0, list);
  }
  lines.push(
    `  - Dialogs: ${formatNumber(dialogs.length)}${base ? " (entries tagged [added] / [changed] / [removed] are this mod's edits)" : ""}`,
  );
  for (const [event, entries] of [...byEvent.entries()].sort((left, right) => left[0] - right[0])) {
    lines.push(`    - ${formatEventTriggerName(event)}:`);
    for (const { change, reference } of entries) {
      lines.push(
        `      - ${formatResolvedTarget(ctx, reference.targetId)}${formatChangeSuffix(change)}`,
      );
    }
  }
};

const renderWordSwap = (lines: string[], ctx: RenderContext, record: InspectorRecord) => {
  ctx.renderedRecordUids.add(record.uid);
  const effective = ctx.effectiveById.get(record.stringId) ?? record;
  const location = `word swap /${record.name}/`;
  lines.push(
    `- /${escapeTableCell(record.name)}/ · \`${escapeTableCell(record.stringId)}\` · ${getRecordLineageParts(ctx, record).join(" · ")}`,
  );
  if (record.removed) {
    lines.push("  - Removed by this mod.");
    return;
  }
  const base = getComparisonBase(ctx, record);
  const settings = formatDialogSettings(ctx, effective, record, base, {
    omitKeys: new Set(["owner"]),
  });
  if (settings.text.length > 0) {
    lines.push(`  - ${settings.label}: ${settings.text}`);
  }
  const categories = getEffectiveCategories(effective, record, base);
  renderConditionsAndEffects(lines, ctx, record.type, categories, "  ");
  const alternatives = categories.find((category) => category.name === "lines")?.entries ?? [];
  lines.push(`  - Alternatives: ${formatNumber(alternatives.length)}`);
  for (const { change, reference } of alternatives) {
    renderDialogueLineNode(lines, ctx, reference, location, 2, {
      change,
      expand: !base || change !== null,
    });
  }
};

const renderDialogMechanicsSummary = (ctx: RenderContext, records: readonly InspectorRecord[]) => {
  const eventCounts = new Map<number, { packages: Set<string>; references: number }>();
  for (const record of records) {
    if (record.type !== dialoguePackageTypeCode) {
      continue;
    }
    for (const reference of getReferences(record, "dialogs")) {
      if (isRemovedReference(reference)) {
        continue;
      }
      const entry = eventCounts.get(reference.value0) ?? {
        packages: new Set<string>(),
        references: 0,
      };
      entry.references += 1;
      entry.packages.add(record.stringId);
      eventCounts.set(reference.value0, entry);
    }
  }

  const speakerCounts = countBy(
    records.filter(
      (record) =>
        record.type === dialogueLineTypeCode && getIntValue(record, "speaker") !== undefined,
    ),
    (record) => getIntValue(record, "speaker")!,
  );
  const repetitionCounts = countBy(
    records.filter(
      (record) =>
        record.type === dialogueLineTypeCode &&
        getIntValue(record, "repetition limit") !== undefined,
    ),
    (record) => getIntValue(record, "repetition limit")!,
  );
  const lines: string[] = [];

  if (eventCounts.size > 0) {
    lines.push("#### Event Trigger Breakdown");
    lines.push("");
    lines.push("| Event | Package refs | Packages |");
    lines.push("| --- | ---: | ---: |");
    for (const [eventValue, count] of [...eventCounts.entries()].sort(
      (left, right) => right[1].references - left[1].references || left[0] - right[0],
    )) {
      lines.push(
        `| ${escapeTableCell(formatEventTriggerValue(eventValue))} | ${formatNumber(count.references)} | ${formatNumber(count.packages.size)} |`,
      );
    }
    lines.push("");
  }

  if (speakerCounts.length > 0) {
    lines.push("#### Dialogue Line Speakers");
    lines.push("");
    lines.push("| Speaker | Lines |");
    lines.push("| --- | ---: |");
    for (const [speaker, count] of speakerCounts) {
      lines.push(
        `| ${escapeTableCell(`${speaker} (${talkerLabels[speaker] ?? "?"})`)} | ${formatNumber(count)} |`,
      );
    }
    lines.push("");
  }

  if (repetitionCounts.length > 0) {
    lines.push("#### Repetition Limits");
    lines.push("");
    lines.push("| Limit | Lines |");
    lines.push("| --- | ---: |");
    for (const [limit, count] of repetitionCounts) {
      lines.push(
        `| ${escapeTableCell(formatIntegerValue(ctx, "repetition limit", limit, dialogueLineTypeCode))} | ${formatNumber(count)} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
};

/** 親 (lines 参照元) の索引。対象 mod の行がどの既存ダイアログから使われているかを示すために使う。 */
const buildLineParentIndex = (ctx: RenderContext, wanted: ReadonlySet<string>) => {
  const parents = new Map<string, InspectorRecord[]>();
  if (wanted.size === 0) {
    return parents;
  }
  for (const record of ctx.effectiveById.values()) {
    if (
      record.type !== dialogueTypeCode &&
      record.type !== dialogueLineTypeCode &&
      record.type !== wordSwapsTypeCode
    ) {
      continue;
    }
    for (const reference of getReferences(record, "lines")) {
      if (!wanted.has(reference.targetId)) {
        continue;
      }
      const list = parents.get(reference.targetId) ?? [];
      if (list.length < 5) {
        list.push(record);
      }
      parents.set(reference.targetId, list);
    }
  }
  return parents;
};

const renderWordSwapTokenSummary = (ctx: RenderContext) => {
  if (ctx.wordSwapTokens.size === 0) {
    return "";
  }

  const swapsByName = new Map<string, InspectorRecord>();
  for (const record of ctx.effectiveById.values()) {
    if (record.type === wordSwapsTypeCode && !record.removed) {
      swapsByName.set(record.name, record);
    }
  }

  const lines: string[] = [];
  lines.push("#### Word Swap Tokens Used");
  lines.push("");
  lines.push(
    "`/TOKEN/` in dialogue text is replaced in game by one of the alternatives of the WORD_SWAPS record with that name (alternatives can have their own conditions). Engine tokens are filled in by the game itself.",
  );
  lines.push("");
  for (const [token, count] of [...ctx.wordSwapTokens.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )) {
    const engine = engineWordSwapTokens[token];
    if (engine) {
      lines.push(`- /${token}/ (${pluralSuffix("use", count)}): engine token → ${engine}`);
      continue;
    }
    const swap = swapsByName.get(token);
    if (!swap) {
      lines.push(
        `- /${token}/ (${pluralSuffix("use", count)}): no WORD_SWAPS record with this name is loaded`,
      );
      continue;
    }
    const samples = getReferences(swap, "lines")
      .flatMap((reference) => {
        const line = ctx.effectiveById.get(reference.targetId);
        return line ? getDialogTexts(line).map((text) => text.original) : [];
      })
      .filter((text) => text.length > 0);
    const uniqueSamples = uniquePreserveOrder(samples);
    const shown = uniqueSamples
      .slice(0, 8)
      .map((text) => `"${escapeTableCell(text)}"`)
      .join(", ");
    const more = uniqueSamples.length > 8 ? ` … (+${uniqueSamples.length - 8})` : "";
    lines.push(
      `- /${token}/ (${pluralSuffix("use", count)}): \`${escapeTableCell(swap.stringId)}\` from ${escapeTableCell(normalizeModName(swap.modName))} → ${shown.length > 0 ? `${shown}${more}` : "(no text alternatives loaded)"}`,
    );
  }
  lines.push("");
  return lines.join("\n");
};

const renderDialogStructures = (ctx: RenderContext) => {
  const dialogRecords = ctx.project.inspectorRecords.filter(isDialogRelevantRecord);
  if (dialogRecords.length === 0) {
    return "";
  }

  const byMod = groupByMod(dialogRecords);
  const lines: string[] = [];

  lines.push("### Dialog Structures");
  lines.push("");
  lines.push(
    "FCS dialog model: `DIALOGUE_PACKAGE.dialogs` lists dialogues per event trigger; `DIALOGUE.lines` are the opening lines; `DIALOGUE_LINE.lines` are replies / next lines; `conditions` and `effects` point to `DIALOG_ACTION` records. Lines tagged `[TARGET]` are the player's choices in a player conversation. `(speaker)` / `(target)` after a condition tells whose state is checked. Effects apply to the speaker, except in `EV_PLAYER_TALK_TO_ME` where they apply to the NPC being talked to.",
  );
  lines.push("");

  const mechanicsSummary = renderDialogMechanicsSummary(ctx, dialogRecords);
  if (mechanicsSummary.length > 0) {
    lines.push(mechanicsSummary);
  }

  for (const mod of getTargetMods(ctx.project)) {
    const modName = normalizeModName(mod.fileName);
    const modRecords = byMod.get(modName) ?? [];
    if (modRecords.length === 0) {
      continue;
    }

    const packages = modRecords.filter((record) => record.type === dialoguePackageTypeCode);
    const dialogues = modRecords.filter((record) => record.type === dialogueTypeCode);
    const wordSwaps = modRecords.filter((record) => record.type === wordSwapsTypeCode);

    lines.push(`#### Dialog Structures · ${escapeTableCell(modName)}`);
    lines.push("");
    lines.push(
      `${pluralSuffix("package", packages.length)} · ${pluralSuffix("dialogue", dialogues.length)} · ${pluralSuffix("word swap", wordSwaps.length)} · ${pluralSuffix("line record", modRecords.filter((record) => record.type === dialogueLineTypeCode).length)}`,
    );
    lines.push("");

    if (packages.length > 0) {
      lines.push("##### Dialogue Packages");
      lines.push("");
      for (const record of packages) {
        renderDialoguePackage(lines, ctx, record);
      }
      lines.push("");
    }

    if (dialogues.length > 0) {
      lines.push("##### Dialogue Trees");
      lines.push("");
      for (const record of dialogues) {
        renderDialogueRecord(lines, ctx, record);
      }
    }

    if (wordSwaps.length > 0) {
      lines.push("##### Word Swaps");
      lines.push("");
      for (const record of wordSwaps) {
        renderWordSwap(lines, ctx, record);
      }
      lines.push("");
    }

    const remainingLines = modRecords.filter(
      (record) =>
        record.type === dialogueLineTypeCode && !ctx.renderedLineLocations.has(record.stringId),
    );
    if (remainingLines.length > 0) {
      const parents = buildLineParentIndex(
        ctx,
        new Set(remainingLines.map((record) => record.stringId)),
      );
      lines.push("##### Other Dialogue Lines");
      lines.push("");
      lines.push(
        "Line records of this mod that are not reached from its own dialogues — typically edits to lines of existing (base or other-mod) dialogues, or unused lines.",
      );
      lines.push("");
      for (const record of remainingLines) {
        const parentList = parents.get(record.stringId) ?? [];
        const parentText =
          parentList.length > 0
            ? `used by ${parentList.map((parent) => `${getItemTypeEnglishName(parent.type)} ${formatResolvedTarget(ctx, parent.stringId)}`).join("; ")}`
            : "not referenced by any loaded dialogue";
        lines.push(`- ${parentText}:`);
        renderDialogueLineNode(
          lines,
          ctx,
          { targetId: record.stringId, value0: 0, value1: 0, value2: 0 },
          `line \`${record.stringId}\``,
          1,
        );
      }
      lines.push("");
    }

    const remainingActions = modRecords.filter(
      (record) => record.type === dialogActionTypeCode && !ctx.renderedRecordUids.has(record.uid),
    );
    if (remainingActions.length > 0) {
      lines.push("##### Other Dialog Actions");
      lines.push("");
      lines.push(
        "Condition / effect records of this mod that are not used by the lines shown above (edits of existing records, or unused).",
      );
      lines.push("");
      for (const record of remainingActions) {
        const fakeReference: Reference = {
          targetId: record.stringId,
          value0: 0,
          value1: 0,
          value2: 0,
        };
        const effective = ctx.effectiveById.get(record.stringId) ?? record;
        const description =
          getIntValue(effective, "condition name") !== undefined
            ? formatCondition(ctx, fakeReference)
            : getIntValue(effective, "action name") !== undefined
              ? formatEffect(ctx, fakeReference)
              : "(no condition or action fields)";
        lines.push(
          `- \`${escapeTableCell(record.stringId)}\` · ${getRecordStatus(record)} · ${description}`,
        );
      }
      lines.push("");
    }
  }

  const tokenSummary = renderWordSwapTokenSummary(ctx);
  if (tokenSummary.length > 0) {
    lines.push(tokenSummary);
  }

  return lines.join("\n");
};

// --- 抽出テキスト -----------------------------------------------------------------

const renderExtractedTextRecords = (ctx: RenderContext, describedUids: Set<string>) => {
  const { project } = ctx;
  const dialogRecords = project.textRecords.filter(
    (record): record is DialogRecord => record.kind === "dialog",
  );
  const entityRecords = project.textRecords.filter(
    (record): record is EntityRecord => record.kind === "entity",
  );
  const describedEntityRecords = entityRecords.filter((record) => record.description.length > 0);
  const nameOnlyEntityRecords = entityRecords.filter((record) => record.description.length === 0);

  const dialogStructureSection = renderDialogStructures(ctx);
  if (
    dialogStructureSection.length === 0 &&
    entityRecords.length === 0 &&
    dialogRecords.length === 0
  ) {
    return "";
  }

  const lines: string[] = [];
  lines.push("## Extracted Text Records");
  lines.push("");
  lines.push(
    `Dialogue line records with text: ${formatNumber(dialogRecords.filter((record) => getVisibleDialogTexts(record).length > 0).length)} · Described entities: ${formatNumber(describedEntityRecords.length)} · Name-only entities: ${formatNumber(nameOnlyEntityRecords.length)}`,
  );
  lines.push("");

  lines.push("### Mod Breakdown");
  lines.push("");
  lines.push(
    "| Mod | Dialogue lines with text | Text variants | Described entities | Name-only entities |",
  );
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  const dialogByMod = groupByMod(dialogRecords);
  const describedByMod = groupByMod(describedEntityRecords);
  const nameOnlyByMod = groupByMod(nameOnlyEntityRecords);
  for (const mod of getTargetMods(project)) {
    const modName = normalizeModName(mod.fileName);
    const modDialogs = (dialogByMod.get(modName) ?? []).filter(
      (record) => getVisibleDialogTexts(record).length > 0,
    );
    const variantCount = modDialogs.reduce(
      (sum, record) => sum + getVisibleDialogTexts(record).length,
      0,
    );
    lines.push(
      `| ${escapeTableCell(modName)} | ${formatNumber(modDialogs.length)} | ${formatNumber(variantCount)} | ${formatNumber((describedByMod.get(modName) ?? []).length)} | ${formatNumber((nameOnlyByMod.get(modName) ?? []).length)} |`,
    );
  }
  lines.push("");

  if (dialogStructureSection.length > 0) {
    lines.push(dialogStructureSection);
  }

  if (describedEntityRecords.length > 0) {
    lines.push("### Entity Descriptions");
    lines.push("");
    const uidByKey = new Map(
      project.inspectorRecords.map((record) => [
        `${record.modName}\u0000${record.stringId}`,
        record.uid,
      ]),
    );
    for (const [modName, records] of describedByMod) {
      lines.push(`#### ${escapeTableCell(modName)}`);
      lines.push("");
      lines.push(`${pluralSuffix("record", records.length)} with descriptions.`);
      lines.push("");
      for (const record of records) {
        const uid = uidByKey.get(`${record.modName}\u0000${record.stringId}`);
        if (uid) {
          describedUids.add(uid);
        }
        const heading = renderBaseRecordHeading(record);
        const metaParts: string[] = [];
        if (heading !== record.stringId) {
          metaParts.push(`ID: \`${escapeTableCell(record.stringId)}\``);
        }
        metaParts.push(`Type: ${renderTypeDescriptor(record.type)}`);
        metaParts.push(`Change: ${record.saveData.changeTypeName}`);

        lines.push(`##### ${escapeTableCell(heading)}`);
        lines.push("");
        lines.push(`- ${metaParts.join(" · ")}`);
        lines.push("");
        lines.push(formatMultiline(record.description));
        lines.push("");
      }
    }
  }

  if (nameOnlyEntityRecords.length > 0) {
    lines.push("### Name-only Entities");
    lines.push("");
    lines.push(
      "These records were extracted because their names are text-relevant, but they do not carry a description field.",
    );
    lines.push("");
    for (const [modName, records] of nameOnlyByMod) {
      lines.push(`#### ${escapeTableCell(modName)}`);
      lines.push("");
      lines.push("| Name | stringId | Type | Change |");
      lines.push("| --- | --- | --- | --- |");
      for (const record of records) {
        const base = ctx.baseById.get(record.stringId);
        const renamed =
          base && base.name !== record.name ? ` (renamed from ${escapeTableCell(base.name)})` : "";
        lines.push(
          `| ${escapeTableCell(record.name || "(unnamed)")}${renamed} | \`${escapeTableCell(record.stringId)}\` | ${record.type} · ${getItemTypeEnglishName(record.type)} | ${escapeTableCell(record.saveData.changeTypeName)} |`,
        );
      }
      lines.push("");
    }
  }

  // ダイアログ構造で表示しきれなかった行 (通常は無い) のテキストだけを平坦に出す
  const unrenderedDialogs = dialogRecords.filter(
    (record) =>
      getVisibleDialogTexts(record).length > 0 && !ctx.renderedLineLocations.has(record.stringId),
  );
  if (unrenderedDialogs.length > 0) {
    lines.push("### Dialog Text");
    lines.push("");
    lines.push("Dialogue text that does not appear in the dialog structures above.");
    lines.push("");
    for (const record of unrenderedDialogs) {
      lines.push(`- \`${escapeTableCell(record.stringId)}\``);
      for (const text of getVisibleDialogTexts(record)) {
        noteWordSwapTokens(ctx, text.original);
        pushTextValue(lines, "  ", `\`${text.textId}\``, text.original);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
};

// --- レコード一覧 -----------------------------------------------------------------

const renderStringBearingRecords = (ctx: RenderContext, describedUids: ReadonlySet<string>) => {
  const records = ctx.project.inspectorRecords.filter(
    (record) => !isDialogRelevantRecord(record) && getVisibleStringEntries(record).length > 0,
  );
  if (records.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push("## String-bearing Records");
  lines.push("");
  lines.push(
    "Non-dialogue records that carry text. Each record lists its strings, non-default values, files, and references so items, buildings, characters, squads, and world records are understandable on their own. Dialogue records are shown in Dialog Structures instead.",
  );
  lines.push("");

  for (const [modName, modRecords] of groupByMod(records)) {
    lines.push(`### String-bearing Records · ${escapeTableCell(modName)}`);
    lines.push("");
    lines.push(
      `${pluralSuffix("record", modRecords.length)} from \`${escapeTableCell(modName)}\`.`,
    );
    lines.push("");
    for (const record of modRecords) {
      renderRecordDetail(lines, ctx, record, { describedElsewhere: describedUids });
    }
  }

  return lines.join("\n");
};

const renderReferenceBearingRecords = (ctx: RenderContext) => {
  const records = ctx.project.inspectorRecords.filter(
    (record) =>
      !isDialogRelevantRecord(record) &&
      getVisibleStringEntries(record).length === 0 &&
      hasReferenceDetails(record),
  );
  if (records.length === 0) {
    return "";
  }

  const totalReferences = records.reduce((sum, record) => sum + record.counts.references, 0);
  const lines: string[] = [];
  lines.push("## Reference-bearing Records Without Visible Strings");
  lines.push("");
  lines.push(
    "These non-dialog records have no non-empty string fields, but their references define concrete mod behavior such as vendor inventory, squad members, building parts, crafting inputs/outputs, biome links, and faction/world-state wiring.",
  );
  lines.push("");
  lines.push(
    `Rendered: ${pluralSuffix("record", records.length)} / ${pluralSuffix("reference", totalReferences)}`,
  );
  lines.push("");

  for (const [modName, modRecords] of groupByMod(records)) {
    lines.push(`### Reference-bearing Records · ${escapeTableCell(modName)}`);
    lines.push("");
    for (const record of modRecords) {
      renderRecordDetail(lines, ctx, record);
    }
  }

  return lines.join("\n");
};

const renderRecordsWithoutStringsOrReferences = (ctx: RenderContext) => {
  const records = ctx.project.inspectorRecords.filter(
    (record) =>
      !isDialogRelevantRecord(record) &&
      getVisibleStringEntries(record).length === 0 &&
      !hasReferenceDetails(record),
  );
  if (records.length === 0) {
    return "";
  }

  const removed = records.filter((record) => record.removed);
  const others = records.filter((record) => !record.removed);
  const lines: string[] = [];
  lines.push("## Records Without Strings or References");
  lines.push("");
  lines.push(
    "Records that only remove something, rename something, or change numeric / flag / file values. They have no text, but they change gameplay.",
  );
  lines.push("");

  if (removed.length > 0) {
    lines.push("### Removed Records");
    lines.push("");
    lines.push("| Record | stringId | Type | Defined by |");
    lines.push("| --- | --- | --- | --- |");
    for (const record of removed) {
      ctx.renderedRecordUids.add(record.uid);
      const base = ctx.baseById.get(record.stringId);
      const sources = (ctx.sourcesById.get(record.stringId) ?? []).filter(
        (source) => normalizeModName(source) !== normalizeModName(record.modName),
      );
      lines.push(
        `| ${escapeTableCell(base?.name ?? renderInspectorHeading(record))} | \`${escapeTableCell(record.stringId)}\` | ${getItemTypeEnglishName(base?.type ?? record.type)} | ${sources.length > 0 ? uniquePreserveOrder(sources).map(escapeTableCell).join(" → ") : escapeTableCell(inferReferenceSource(record.stringId) || "(not loaded)")} |`,
      );
    }
    lines.push("");
  }

  if (others.length > 0) {
    for (const [modName, modRecords] of groupByMod(others)) {
      lines.push(`### Value-only and Rename-only Records · ${escapeTableCell(modName)}`);
      lines.push("");
      for (const record of modRecords) {
        renderRecordDetail(lines, ctx, record);
      }
    }
  }

  return lines.join("\n");
};

// --- アセット ---------------------------------------------------------------------

const assetStatusLabels: Readonly<Record<AssetReference["status"], string>> = {
  dependency: "found in another loaded mod",
  game: "found in game data",
  missing: "missing",
  mod: "found in the mod folder",
  unchecked: "not checked (location unknown)",
};

const renderAssetReferences = (project: ModProject) => {
  if (project.assetReferences.length === 0) {
    return "";
  }

  const statusOrder: AssetReference["status"][] = [
    "missing",
    "unchecked",
    "mod",
    "dependency",
    "game",
  ];
  const lines: string[] = [];
  lines.push("## Asset Files");
  lines.push("");
  lines.push(
    "Files referenced by file fields of the target records. Paths are relative to the Kenshi folder (`./data/...` = game data, `./mods/<mod>/...` = a mod folder). `.mesh` / `.skeleton` are Ogre meshes / skeletons, `.xml` are PhysX collision objects, `.phs` are Scythe physics (ragdolls), `.dds` / `.png` are textures and icons.",
  );
  lines.push("");
  lines.push("| Status | Kind | Path | Fields | Records |");
  lines.push("| --- | --- | --- | --- | ---: |");
  const sorted = [...project.assetReferences].sort(
    (left, right) =>
      statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) ||
      left.path.localeCompare(right.path, "en"),
  );
  for (const asset of sorted) {
    lines.push(
      `| ${assetStatusLabels[asset.status]} | ${escapeTableCell(asset.kind)} | ${formatCodeInTable(asset.path)} | ${asset.fieldKeys.map(formatCodeInTable).join(", ")} | ${formatNumber(asset.recordCount)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
};

// --- フィールド用語集 -------------------------------------------------------------

const describeFieldKind = (field: FcsFieldDefinition) => {
  switch (field.kind) {
    case "enum":
      return `enum ${field.enumName}, default ${field.enumValue}`;
    case "reference": {
      const values =
        field.referenceDefaults.length > 0 ? ` (values ${field.referenceDefaults.join(", ")})` : "";
      return `reference → ${field.referenceTarget}${values}${field.owned ? ", owned sub-items" : ""}`;
    }
    case "file":
      return `file ${field.fileFilter ?? ""}`.trim();
    case "string":
      return `string, default ${field.defaultText}`;
    default:
      return `${field.kind}, default ${field.defaultText}`;
  }
};

const renderFieldGlossary = (ctx: RenderContext) => {
  if (!ctx.schema || ctx.usedFields.size === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push("## Field Glossary");
  lines.push("");
  lines.push(
    "FCS definitions (type, default, description) of every field that appears above, grouped by record type. Fields marked `not in fcs.def` are not defined for that type by the FCS and may be ignored by the game.",
  );
  lines.push("");

  const typeEntries = [...ctx.usedFields.entries()].sort((left, right) =>
    left[0].localeCompare(right[0], "en"),
  );
  for (const [fcsType, fieldNames] of typeEntries) {
    const definitions = ctx.schema.types.get(fcsType);
    lines.push(`### ${fcsType}`);
    lines.push("");
    for (const fieldName of [...fieldNames].sort((left, right) =>
      left.localeCompare(right, "en"),
    )) {
      const field = definitions?.get(fieldName);
      if (!field) {
        lines.push(`- \`${escapeTableCell(fieldName)}\`: not in fcs.def`);
        continue;
      }
      const description =
        field.description.length > 0 ? ` — ${escapeInline(field.description)}` : "";
      lines.push(
        `- ${formatCode(fieldName)} (${escapeInline(describeFieldKind(field))})${description}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
};

// --- 全体 -------------------------------------------------------------------------

export interface MarkdownSection {
  anchor: string;
  content: string;
  title: string;
}

/** Markdown をセクションごとに組み立てる (書き出し画面の構成表示にも使う)。空のセクションは含めない。 */
export const renderProjectMarkdownSections = (
  project: ModProject,
  options: MarkdownRenderOptions = {},
): MarkdownSection[] => {
  const ctx = createRenderContext(project, options);
  const summary = summarizeProject(project);
  const targetMods = getTargetMods(project);
  const schemaSource = ctx.schema
    ? (options.schemaSource ?? (options.schema === undefined ? builtinFcsSource : "fcs.def"))
    : null;
  const describedUids = new Set<string>();

  // 用語集は他のセクションで使われたフィールドを集計するため、本文を先に描画する。
  const extractedText = renderExtractedTextRecords(ctx, describedUids);
  const stringRecords = renderStringBearingRecords(ctx, describedUids);
  const referenceRecords = renderReferenceBearingRecords(ctx);
  const otherRecords = renderRecordsWithoutStringsOrReferences(ctx);
  const assets = renderAssetReferences(project);
  const glossary = options.includeFieldGlossary === false ? "" : renderFieldGlossary(ctx);

  const sections: MarkdownSection[] = [
    {
      anchor: "directory-structure",
      content: renderStructure(project),
      title: "Directory Structure",
    },
    {
      anchor: "reference-context",
      content: renderReferenceContext(project),
      title: "Reference Context",
    },
    {
      anchor: "declared-dependencies",
      content: renderDependencies(targetMods),
      title: "Declared Dependencies / References",
    },
    {
      anchor: "category-breakdown",
      content: renderCategoryBreakdown(project.inspectorRecords),
      title: "Category Breakdown",
    },
    {
      anchor: "item-type-breakdown",
      content: renderTypeBreakdown(project.inspectorRecords),
      title: "Item Type Breakdown",
    },
    {
      anchor: "record-change-breakdown",
      content: renderRecordChangeBreakdown(project),
      title: "Record Change Breakdown",
    },
    { anchor: "mods", content: renderMods(project.mods), title: "Mods" },
    { anchor: "extracted-text-records", content: extractedText, title: "Extracted Text Records" },
    { anchor: "string-bearing-records", content: stringRecords, title: "String-bearing Records" },
    {
      anchor: "reference-bearing-records-without-visible-strings",
      content: referenceRecords,
      title: "Reference-bearing Records Without Visible Strings",
    },
    {
      anchor: "records-without-strings-or-references",
      content: otherRecords,
      title: "Records Without Strings or References",
    },
    { anchor: "asset-files", content: assets, title: "Asset Files" },
    { anchor: "field-glossary", content: glossary, title: "Field Glossary" },
  ].filter((section) => section.content.length > 0);

  return [
    {
      anchor: "file-summary",
      content: renderHeader(ctx, summary, schemaSource),
      title: "File Summary",
    },
    { anchor: "navigation", content: renderNavigation(sections), title: "Navigation" },
    ...sections,
  ];
};

export const joinMarkdownSections = (sections: readonly MarkdownSection[]) =>
  sections.map((section) => section.content).join("\n") + "\n";

export const renderProjectMarkdown = (
  project: ModProject,
  options: MarkdownRenderOptions = {},
): string => joinMarkdownSections(renderProjectMarkdownSections(project, options));
