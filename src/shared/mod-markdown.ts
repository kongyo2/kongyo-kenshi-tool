import {
  getItemCategory,
  getItemTypeEnglishName,
  getItemTypeLabel,
  itemCategoryLabels,
  type ItemCategory,
} from './item-types.ts';
import type {
  DialogRecord,
  EntityRecord,
  InspectorRecord,
  LoadedMod,
  ModProject,
  Reference,
  ReferenceCategory,
} from './models.ts';

const formatNumber = (value: number) => value.toLocaleString('en-US');
const dialogueTypeCode = 18;
const dialogueLineTypeCode = 19;
const dialogActionTypeCode = 31;
const dialoguePackageTypeCode = 73;
const maxDialogLineRenderDepth = 24;

const formatFloatValue = (value: number) => {
  const rounded = Number(value.toFixed(6));
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
};

const integerValueLabels: Record<string, Record<number, string>> = {
  'repetition limit': {
    0: 'DialogRepetitionEnum.DR_NO_LIMIT',
  },
  speaker: {
    0: 'TalkerEnum.T_ME',
    1: 'TalkerEnum.T_TARGET',
    3: 'TalkerEnum.T_TARGET_WITH_RACE',
  },
  'target is type': {
    0: 'CharacterTypeEnum.OT_NONE',
  },
  who: {
    0: 'TalkerEnum.T_ME',
    1: 'TalkerEnum.T_TARGET',
  },
};

const formatIntegerValue = (key: string, value: number) => {
  const label = integerValueLabels[key]?.[value];
  return label ? `${value} (${label})` : String(value);
};

const referenceCategoryHints: Record<string, string> = {
  'AI contract': 'dialog effect: starts an AI package contract',
  'change AI': 'dialog effect: permanently changes AI package',
  construction: 'building construction ingredients or requirements',
  dialogs: 'dialogue package entries; values are event/priority data in FCS',
  effects: 'dialog actions that run after this line is selected or reached',
  'enable buildings': 'research unlocks these buildings',
  'enable research': 'research unlocks these research records',
  functionality: 'building functionality record used by a building',
  ingredients: 'crafting or production ingredients',
  inheritsFrom: 'dialogue package inheritance',
  items: 'item/vendor/placement list; value meaning depends on the FCS field',
  lines: 'dialogue line children or reply options',
  nests: 'biome or town spawn entries',
  parts: 'building visual parts; values commonly include group/chance data',
  produces: 'production output item',
  squad: 'fixed squad member entries',
  'trigger campaign': 'dialog effect that starts a faction campaign',
  'upgrades to': 'building upgrade targets',
  vendors: 'character or faction vendor list',
  weapons: 'character or placement weapon entries',
  'world state': 'world-state condition entry',
  'choosefrom list': 'random squad member pool',
};

const formatReferenceCategoryHint = (name: string) => {
  const hint = referenceCategoryHints[name];
  return hint ? ` - ${hint}` : '';
};

const uniquePreserveOrder = (items: readonly string[]) => {
  const result: string[] = [];
  const visited = new Set<string>();

  for (const item of items) {
    if (visited.has(item)) {
      continue;
    }

    visited.add(item);
    result.push(item);
  }

  return result;
};

const escapeTableCell = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');

const escapeFenced = (value: string) => value.replace(/```/g, '``\u200b`');

const formatMultiline = (value: string) => {
  if (value.length === 0) {
    return '(empty)';
  }

  return '```text\n' + escapeFenced(value) + '\n```';
};

const pushIndentedBlock = (
  lines: string[],
  indent: string,
  block: string,
) => {
  for (const line of block.split('\n')) {
    lines.push(`${indent}${line}`);
  }
};

const getReferenceCategory = (
  record: InspectorRecord,
  name: string,
): ReferenceCategory | undefined =>
  record.referenceCategories.find((category) => category.name === name);

const getReferences = (record: InspectorRecord, name: string) =>
  getReferenceCategory(record, name)?.references ?? [];

const getStringValue = (record: InspectorRecord, key: string) =>
  record.strings.find((entry) => entry.key === key)?.value ?? '';

const getDialogRelevantRecords = (records: readonly InspectorRecord[]) =>
  records.filter((record) =>
    [
      dialogueTypeCode,
      dialogueLineTypeCode,
      dialogActionTypeCode,
      dialoguePackageTypeCode,
    ].includes(record.type),
  );

const isDialogRelevantRecord = (record: Pick<InspectorRecord, 'type'>) =>
  [
    dialogueTypeCode,
    dialogueLineTypeCode,
    dialogActionTypeCode,
    dialoguePackageTypeCode,
    84,
  ].includes(record.type);

const hasReferenceDetails = (record: InspectorRecord) =>
  record.referenceCategories.some(
    (category) => category.references.length > 0,
  );

const buildRecordIndex = (records: readonly InspectorRecord[]) => {
  const byId = new Map<string, InspectorRecord>();
  for (const record of records) {
    if (record.stringId.length > 0) {
      byId.set(record.stringId, record);
    }
  }
  return byId;
};

const formatPrimitiveFields = (
  record: InspectorRecord,
  preferredOrder: readonly string[] = [],
) => {
  const preferredIndex = new Map<string, number>();
  preferredOrder.forEach((key, index) => {
    preferredIndex.set(key, index);
  });

  const entries = [
    ...record.values.bools.map((entry) => ({
      key: entry.key,
      sortGroup: 'bool',
      value: entry.value ? 'true' : 'false',
    })),
    ...record.values.ints.map((entry) => ({
      key: entry.key,
      sortGroup: 'int',
      value: formatIntegerValue(entry.key, entry.value),
    })),
    ...record.values.floats.map((entry) => ({
      key: entry.key,
      sortGroup: 'float',
      value: formatFloatValue(entry.value),
    })),
  ].sort((left, right) => {
    const leftPreferred = preferredIndex.get(left.key);
    const rightPreferred = preferredIndex.get(right.key);

    if (leftPreferred !== undefined || rightPreferred !== undefined) {
      return (leftPreferred ?? 10_000) - (rightPreferred ?? 10_000);
    }

    const groupCompare = left.sortGroup.localeCompare(right.sortGroup);
    if (groupCompare !== 0) {
      return groupCompare;
    }

    return left.key.localeCompare(right.key, 'ja');
  });

  return entries
    .map((entry) => `\`${escapeTableCell(entry.key)}\`=${entry.value}`)
    .join(' · ');
};

const formatFocusedPrimitiveFields = (record: InspectorRecord) => {
  const entries = [
    ...record.values.bools
      .filter((entry) => entry.value)
      .map((entry) => ({
        key: entry.key,
        sortGroup: 'bool',
        value: 'true',
      })),
    ...record.values.ints
      .filter((entry) => entry.value !== 0)
      .map((entry) => ({
        key: entry.key,
        sortGroup: 'int',
        value: formatIntegerValue(entry.key, entry.value),
      })),
    ...record.values.floats
      .filter((entry) => Math.abs(entry.value) > Number.EPSILON)
      .map((entry) => ({
        key: entry.key,
        sortGroup: 'float',
        value: formatFloatValue(entry.value),
      })),
  ].sort((left, right) => {
    const groupCompare = left.sortGroup.localeCompare(right.sortGroup);
    if (groupCompare !== 0) {
      return groupCompare;
    }

    return left.key.localeCompare(right.key, 'ja');
  });

  return entries
    .map((entry) => `\`${escapeTableCell(entry.key)}\`=${entry.value}`)
    .join(' · ');
};

const formatReferenceValues = (reference: Reference) => {
  const values = [
    ['v0', reference.value0],
    ['v1', reference.value1],
    ['v2', reference.value2],
  ] as const;

  return values.map(([key, value]) => `${key}=${value}`).join(', ');
};

const inferReferenceSource = (targetId: string) => {
  const separatorIndex = targetId.indexOf('-');
  if (separatorIndex < 0 || separatorIndex === targetId.length - 1) {
    return '';
  }

  return targetId.slice(separatorIndex + 1);
};

const getRecordLineageParts = (
  record: Pick<InspectorRecord, 'modName' | 'saveData' | 'stringId'>,
) => {
  const parts: string[] = [];
  const idSource = inferReferenceSource(record.stringId);

  if (
    idSource.length > 0 &&
    normalizeModName(idSource) !== normalizeModName(record.modName)
  ) {
    parts.push(`ID source: ${escapeTableCell(idSource)}`);
  }

  parts.push(`Change: ${record.saveData.changeTypeName}`);

  if (record.saveData.saveCount > 0) {
    parts.push(`Save count: ${formatNumber(record.saveData.saveCount)}`);
  }

  if (record.saveData.changeTypeName.startsWith('Unknown')) {
    parts.push(`Raw saveData: ${record.saveData.raw}`);
  }

  return parts;
};

const formatResolvedReference = (
  reference: Reference,
  recordById: ReadonlyMap<string, InspectorRecord>,
) => {
  const targetRecord = recordById.get(reference.targetId);
  const values = formatReferenceValues(reference);

  if (!targetRecord) {
    const source = inferReferenceSource(reference.targetId);
    const sourcePart =
      source.length > 0 ? ` · source: ${escapeTableCell(source)}` : '';

    return `\`${escapeTableCell(reference.targetId)}\` · unresolved/unloaded${sourcePart} (${values})`;
  }

  const heading = renderInspectorHeading(targetRecord);
  const idPart =
    heading === targetRecord.stringId
      ? ''
      : ` · \`${escapeTableCell(targetRecord.stringId)}\``;

  return `${escapeTableCell(heading)}${idPart} · ${renderTypeDescriptor(targetRecord.type)} (${values})`;
};

const renderGenericReferenceCategories = (
  lines: string[],
  record: InspectorRecord,
  recordById: ReadonlyMap<string, InspectorRecord>,
  omittedCategoryNames: readonly string[],
  indent = '',
) => {
  const omitted = new Set(omittedCategoryNames);
  const categories = record.referenceCategories.filter(
    (category) =>
      category.references.length > 0 && !omitted.has(category.name),
  );

  if (categories.length === 0) {
    return;
  }

  for (const category of categories) {
    lines.push(
      `${indent}- \`${escapeTableCell(category.name)}\`: ${pluralSuffix('reference', category.references.length)}${formatReferenceCategoryHint(category.name)}`,
    );
    for (const reference of category.references) {
      lines.push(
        `${indent}  - ${formatResolvedReference(reference, recordById)}`,
      );
    }
  }
};

const renderDialogActionReferences = (
  lines: string[],
  label: string,
  references: readonly Reference[],
  recordById: ReadonlyMap<string, InspectorRecord>,
  indent = '',
) => {
  if (references.length === 0) {
    return;
  }

  lines.push(`${indent}- ${label}: ${pluralSuffix('action', references.length)}`);

  for (const reference of references) {
    const actionRecord = recordById.get(reference.targetId);
    lines.push(
      `${indent}  - ${formatResolvedReference(reference, recordById)}`,
    );

    if (!actionRecord) {
      continue;
    }

    const fields = formatPrimitiveFields(actionRecord);
    if (fields.length > 0) {
      lines.push(`${indent}    - Fields: ${fields}`);
    }

    const actionStrings = getVisibleStringEntries(actionRecord);
    for (const entry of actionStrings) {
      lines.push(
        `${indent}    - \`${escapeTableCell(entry.key)}\`: ${escapeTableCell(entry.value)}`,
      );
    }

    renderGenericReferenceCategories(
      lines,
      actionRecord,
      recordById,
      [],
      `${indent}    `,
    );
  }
};

const renderNonDialogRecordSupplement = (
  lines: string[],
  record: InspectorRecord,
  recordById: ReadonlyMap<string, InspectorRecord>,
) => {
  if (isDialogRelevantRecord(record)) {
    return;
  }

  const focusedFields = formatFocusedPrimitiveFields(record);
  if (focusedFields.length > 0) {
    lines.push('- Primitive values shown: false bools and numeric zeroes omitted for readability.');
    lines.push(`  - ${focusedFields}`);
    lines.push('');
  }

  if (hasReferenceDetails(record)) {
    lines.push('- References:');
    renderGenericReferenceCategories(lines, record, recordById, [], '  ');
    lines.push('');
  }
};

const pluralSuffix = (label: string, count: number) =>
  `${formatNumber(count)} ${label}${count === 1 ? '' : 's'}`;

const collectDeclaredDependencies = (mods: readonly LoadedMod[]) =>
  uniquePreserveOrder(mods.flatMap((mod) => mod.header.dependencies));

const collectDeclaredReferences = (mods: readonly LoadedMod[]) =>
  uniquePreserveOrder(mods.flatMap((mod) => mod.header.references));

const normalizeModName = (value: string) => value.replace(/\.mod$/i, '');

const getVisibleStringEntries = (record: Pick<InspectorRecord, 'strings'>) =>
  record.strings.filter((entry) => entry.value.length > 0);

const getVisibleDialogTexts = (record: DialogRecord) =>
  record.texts.filter((text) => text.original.length > 0);

type StringRenderStats = {
  emptyOnlyRecordCount: number;
  omittedNoStringRecordCount: number;
  renderedFieldCount: number;
  renderedRecordCount: number;
  totalFieldCount: number;
  totalRecordCount: number;
};

type DialogRenderStats = {
  omittedEmptyRecordCount: number;
  omittedEmptyTextCount: number;
  renderedRecordCount: number;
  renderedTextCount: number;
  totalRecordCount: number;
  totalTextCount: number;
};

const summarizeStringRecords = (
  records: readonly InspectorRecord[],
): StringRenderStats => {
  let emptyOnlyRecordCount = 0;
  let omittedNoStringRecordCount = 0;
  let renderedFieldCount = 0;
  let renderedRecordCount = 0;
  let totalFieldCount = 0;
  let totalRecordCount = 0;

  for (const record of records) {
    if (record.strings.length === 0) {
      omittedNoStringRecordCount += 1;
      continue;
    }

    totalRecordCount += 1;
    totalFieldCount += record.strings.length;

    const visibleStringCount = getVisibleStringEntries(record).length;
    if (visibleStringCount === 0) {
      emptyOnlyRecordCount += 1;
      continue;
    }

    renderedRecordCount += 1;
    renderedFieldCount += visibleStringCount;
  }

  return {
    emptyOnlyRecordCount,
    omittedNoStringRecordCount,
    renderedFieldCount,
    renderedRecordCount,
    totalFieldCount,
    totalRecordCount,
  };
};

const summarizeDialogRecords = (
  records: readonly DialogRecord[],
): DialogRenderStats => {
  let omittedEmptyRecordCount = 0;
  let omittedEmptyTextCount = 0;
  let renderedRecordCount = 0;
  let renderedTextCount = 0;
  let totalRecordCount = 0;
  let totalTextCount = 0;

  for (const record of records) {
    totalRecordCount += 1;
    totalTextCount += record.texts.length;

    const visibleTextCount = getVisibleDialogTexts(record).length;
    omittedEmptyTextCount += record.texts.length - visibleTextCount;

    if (visibleTextCount === 0) {
      omittedEmptyRecordCount += 1;
      continue;
    }

    renderedRecordCount += 1;
    renderedTextCount += visibleTextCount;
  }

  return {
    omittedEmptyRecordCount,
    omittedEmptyTextCount,
    renderedRecordCount,
    renderedTextCount,
    totalRecordCount,
    totalTextCount,
  };
};

const countCategories = (records: readonly InspectorRecord[]) => {
  const counts = new Map<ItemCategory, number>();
  for (const record of records) {
    const category = getItemCategory(record.type);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
};

const countTypes = (records: readonly InspectorRecord[]) => {
  const counts = new Map<number, number>();
  for (const record of records) {
    counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
};

const countChangeTypes = (records: readonly InspectorRecord[]) => {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(
      record.saveData.changeTypeName,
      (counts.get(record.saveData.changeTypeName) ?? 0) + 1,
    );
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
};

const countIdSources = (records: readonly InspectorRecord[]) => {
  const counts = new Map<string, number>();
  for (const record of records) {
    const source = inferReferenceSource(record.stringId) || '(unknown)';
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
};

const renderHeader = (project: ModProject) => {
  const totalRecords = project.inspectorRecords.length;
  const stringStats = summarizeStringRecords(project.inspectorRecords);
  const dialogRecords = project.textRecords.filter(
    (record): record is DialogRecord => record.kind === 'dialog',
  );
  const dialogStats = summarizeDialogRecords(dialogRecords);
  const referenceOnlyRecords = getReferenceOnlyRecords(project.inspectorRecords);
  const changeCounts = new Map(countChangeTypes(project.inspectorRecords));
  const entityRecordCount = project.textRecords.length - dialogRecords.length;
  const visibleTextRecordCount =
    dialogStats.renderedRecordCount + entityRecordCount;

  const lines: string[] = [];
  lines.push('# Kenshi Mod Markdown Export');
  lines.push('');
  lines.push(
    'This file is a merged Markdown dump of all loaded Kenshi `.mod` files,',
  );
  lines.push(
    'formatted for human review and LLM ingestion.',
  );
  lines.push('');
  lines.push('## File Summary');
  lines.push('');
  lines.push('### Purpose');
  lines.push(
    'Provide a complete and prompt-friendly snapshot of the selected mods,',
  );
  lines.push(
    'including metadata, record inventory, non-empty string fields, and extracted',
  );
  lines.push('dialog or description-heavy records.');
  lines.push('');
  lines.push('### Usage Guidelines');
  lines.push(
    '- Start with `Extracted Text Records` when reviewing lore, dialogue, or',
  );
  lines.push('  text that is likely to matter to an LLM task.');
  lines.push(
    '- In dialog sections, read `Dialog Structures` before the flat text list; it resolves packages, dialogue roots, line/reply links, conditions, effects, and raw reference values.',
  );
  lines.push(
    '- Use `String-bearing Records` when you need the raw non-empty string payload and exact keys',
  );
  lines.push('  from the source mod data.');
  lines.push(
    '- Records with no string fields are omitted from the raw dump, while',
  );
  lines.push('  their counts still contribute to the summary tables.');
  lines.push(
    '- Non-string fields are summarized globally, while dialog-relevant primitive fields and references are preserved in detail.',
  );
  lines.push(
    '- Empty string values are omitted from dialog and raw sections to reduce prompt noise.',
  );
  lines.push('');
  lines.push('### Metrics');
  lines.push(`- Source project: **${project.sourceModName}**`);
  lines.push(`- Loaded mods: **${formatNumber(project.mods.length)}**`);
  lines.push(`- Total records: **${formatNumber(totalRecords)}**`);
  lines.push(`- New records: **${formatNumber(changeCounts.get('New') ?? 0)}**`);
  lines.push(
    `- Changed records: **${formatNumber(changeCounts.get('Changed') ?? 0)}**`,
  );
  lines.push(
    `- Rendered string-bearing records: **${formatNumber(stringStats.renderedRecordCount)}**`,
  );
  lines.push(
    `- Rendered string fields: **${formatNumber(stringStats.renderedFieldCount)}**`,
  );
  lines.push(
    `- Omitted empty string fields: **${formatNumber(stringStats.totalFieldCount - stringStats.renderedFieldCount)}**`,
  );
  lines.push(
    `- Extracted text records: **${formatNumber(visibleTextRecordCount)}**`,
  );
  lines.push(
    `- Extracted dialog lines: **${formatNumber(dialogStats.renderedTextCount)}**`,
  );
  lines.push(
    `- Reference-bearing records without visible strings: **${formatNumber(referenceOnlyRecords.length)}**`,
  );
  lines.push(
    `- Omitted empty dialog variants: **${formatNumber(dialogStats.omittedEmptyTextCount)}**`,
  );
  lines.push(
    `- Declared dependencies: **${formatNumber(collectDeclaredDependencies(project.mods).length)}**`,
  );
  lines.push('');

  return lines.join('\n');
};

const renderNavigation = (project: ModProject) => {
  const lines: string[] = [];
  lines.push('## Navigation');
  lines.push('');
  lines.push('- [Directory Structure](#directory-structure)');

  if (collectDeclaredDependencies(project.mods).length > 0) {
    lines.push('- [Declared Dependencies](#declared-dependencies)');
  }

  if (collectDeclaredReferences(project.mods).length > 0) {
    lines.push('- [Declared References](#declared-references)');
  }

  lines.push('- [Category Breakdown](#category-breakdown)');
  lines.push('- [Item Type Breakdown](#item-type-breakdown)');
  lines.push('- [Record Change Breakdown](#record-change-breakdown)');
  lines.push('- [Mods](#mods)');

  if (project.textRecords.length > 0) {
    lines.push('- [Extracted Text Records](#extracted-text-records)');
  }

  if (project.inspectorRecords.some((record) => record.strings.length > 0)) {
    lines.push('- [String-bearing Records](#string-bearing-records)');
  }

  if (getReferenceOnlyRecords(project.inspectorRecords).length > 0) {
    lines.push(
      '- [Reference-bearing Records Without Visible Strings](#reference-bearing-records-without-visible-strings)',
    );
  }

  lines.push('');
  return lines.join('\n');
};

const renderStructure = (project: ModProject) => {
  const lines: string[] = [];
  lines.push('## Directory Structure');
  lines.push('');
  lines.push('```text');
  lines.push(`${project.sourceModName}/`);
  for (const mod of project.mods) {
    lines.push(
      `  ${mod.fileName}  (${pluralSuffix('record', mod.recordCount)})`,
    );
  }
  lines.push('```');
  lines.push('');
  return lines.join('\n');
};

const renderDependencies = (mods: readonly LoadedMod[]) => {
  const dependencies = collectDeclaredDependencies(mods);
  const references = collectDeclaredReferences(mods);
  const lines: string[] = [];

  if (dependencies.length > 0) {
    lines.push('## Declared Dependencies');
    lines.push('');
    for (const dependency of dependencies) {
      lines.push(`- ${dependency}`);
    }
    lines.push('');
  }

  if (references.length > 0) {
    lines.push('## Declared References');
    lines.push('');
    for (const reference of references) {
      lines.push(`- ${reference}`);
    }
    lines.push('');
  }

  return lines.join('\n');
};

const renderCategoryBreakdown = (records: readonly InspectorRecord[]) => {
  const counts = countCategories(records);
  if (counts.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Category Breakdown');
  lines.push('');
  lines.push('| Category | Records |');
  lines.push('| --- | ---: |');
  for (const [category, count] of counts) {
    lines.push(
      `| ${itemCategoryLabels[category]} (${category}) | ${formatNumber(count)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
};

const renderTypeBreakdown = (records: readonly InspectorRecord[]) => {
  const counts = countTypes(records);
  if (counts.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Item Type Breakdown');
  lines.push('');
  lines.push('| Type Code | English | Label | Records |');
  lines.push('| ---: | --- | --- | ---: |');
  for (const [type, count] of counts) {
    lines.push(
      `| ${type} | ${getItemTypeEnglishName(type)} | ${getItemTypeLabel(type)} | ${formatNumber(count)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
};

const renderRecordChangeBreakdown = (
  project: ModProject,
) => {
  if (project.inspectorRecords.length === 0) {
    return '';
  }

  const loadedModNames = new Set(
    project.mods.map((mod) => normalizeModName(mod.fileName)),
  );
  const changeCounts = countChangeTypes(project.inspectorRecords);
  const sourceCounts = countIdSources(project.inspectorRecords);
  const lines: string[] = [];

  lines.push('## Record Change Breakdown');
  lines.push('');
  lines.push(
    'Change type comes from Kenshi item save data: `New` means added by the active mod, `Changed` means an existing record was edited, and `Renamed` means the active mod changed the record name.',
  );
  lines.push('');
  lines.push('| Change type | Records |');
  lines.push('| --- | ---: |');
  for (const [changeType, count] of changeCounts) {
    lines.push(`| ${escapeTableCell(changeType)} | ${formatNumber(count)} |`);
  }
  lines.push('');
  lines.push('### ID Source Breakdown');
  lines.push('');
  lines.push(
    'The ID source is inferred from the part after the first hyphen in `stringId`. External sources usually indicate records that originated in another mod, base game file, or an earlier file name.',
  );
  lines.push('');
  lines.push('| ID source | Records | Relation to loaded mod |');
  lines.push('| --- | ---: | --- |');
  for (const [source, count] of sourceCounts) {
    const relation = loadedModNames.has(normalizeModName(source))
      ? 'loaded mod'
      : 'external/base/renamed source';
    lines.push(
      `| ${escapeTableCell(source)} | ${formatNumber(count)} | ${relation} |`,
    );
  }
  lines.push('');

  return lines.join('\n');
};

const renderMods = (mods: readonly LoadedMod[]) => {
  const lines: string[] = [];
  lines.push('## Mods');
  lines.push('');

  for (const mod of mods) {
    lines.push(`### ${mod.fileName}`);
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('| --- | --- |');
    lines.push(`| File type | ${mod.header.fileType} |`);
    lines.push(`| Version | ${mod.header.version} |`);
    lines.push(
      `| Author | ${
        mod.header.author.length > 0
          ? escapeTableCell(mod.header.author)
          : '(unknown)'
      } |`,
    );
    lines.push(`| Record count | ${formatNumber(mod.recordCount)} |`);
    lines.push(
      `| Dependencies | ${
        mod.header.dependencies.length === 0
          ? '—'
          : mod.header.dependencies.map(escapeTableCell).join(', ')
      } |`,
    );
    lines.push(
      `| References | ${
        mod.header.references.length === 0
          ? '—'
          : mod.header.references.map(escapeTableCell).join(', ')
      } |`,
    );
    lines.push('');

    if (mod.header.description.length > 0) {
      lines.push('**Description**');
      lines.push('');
      lines.push(formatMultiline(mod.header.description));
      lines.push('');
    }
  }

  return lines.join('\n');
};

const renderOtherFieldCounts = (counts: InspectorRecord['counts']) => {
  const parts: string[] = [];
  const entries: Array<[string, number]> = [
    ['bools', counts.bools],
    ['floats', counts.floats],
    ['ints', counts.ints],
    ['vec3', counts.vector3s],
    ['vec4', counts.vector4s],
    ['files', counts.files],
    ['refs', counts.references],
    ['refCats', counts.referenceCategories],
    ['instances', counts.instances],
  ];

  for (const [label, count] of entries) {
    if (count > 0) {
      parts.push(`${label}=${formatNumber(count)}`);
    }
  }

  if (parts.length === 0) {
    return '';
  }

  return parts.join(', ');
};

const renderTypeDescriptor = (type: number) =>
  `${type} · ${getItemTypeEnglishName(type)} · ${getItemTypeLabel(type)}`;

const renderStringBearingRecords = (records: readonly InspectorRecord[]) => {
  const stringStats = summarizeStringRecords(records);
  const stringRecords = records.filter((record) => record.strings.length > 0);
  const recordById = buildRecordIndex(records);
  const lines: string[] = [];
  lines.push('## String-bearing Records');
  lines.push('');
  lines.push(
    'This section preserves original string keys while omitting empty values and records that contain only empty strings. For non-dialog records it also includes loaded references and useful primitive values so item, building, vendor, squad, and world records remain understandable when exported one mod at a time.',
  );
  lines.push('');
  lines.push(
    `Rendered: ${formatNumber(stringStats.renderedRecordCount)} records / ${formatNumber(stringStats.renderedFieldCount)} non-empty string fields`,
  );
  lines.push(
    `Omitted: ${formatNumber(stringStats.omittedNoStringRecordCount)} records with no string fields`,
  );
  if (stringStats.emptyOnlyRecordCount > 0) {
    lines.push(
      `Omitted: ${formatNumber(stringStats.emptyOnlyRecordCount)} records whose string fields are all empty`,
    );
  }
  if (stringStats.totalFieldCount > stringStats.renderedFieldCount) {
    lines.push(
      `Empty string fields omitted: ${formatNumber(stringStats.totalFieldCount - stringStats.renderedFieldCount)}`,
    );
  }
  lines.push('');

  const byMod = new Map<string, InspectorRecord[]>();
  for (const record of stringRecords) {
    const modName = normalizeModName(record.modName);
    const existing = byMod.get(modName);
    if (existing) {
      existing.push(record);
    } else {
      byMod.set(modName, [record]);
    }
  }

  for (const [modName, modRecords] of byMod) {
    const modStats = summarizeStringRecords(modRecords);
    if (modStats.renderedRecordCount === 0) {
      continue;
    }

    lines.push(`### String-bearing Records · ${modName}`);
    lines.push('');
    lines.push(
      `${pluralSuffix('record', modStats.renderedRecordCount)} / ${pluralSuffix('field', modStats.renderedFieldCount)} shown from \`${modName}\`.`,
    );
    if (modStats.emptyOnlyRecordCount > 0) {
      lines.push(
        `${pluralSuffix('record', modStats.emptyOnlyRecordCount)} with only empty strings omitted.`,
      );
    }
    lines.push('');

    for (const record of modRecords) {
      const visibleStrings = getVisibleStringEntries(record);
      if (visibleStrings.length === 0) {
        continue;
      }

      const heading = renderInspectorHeading(record);
      const metaParts: string[] = [];
      const otherFieldCounts = renderOtherFieldCounts(record.counts);
      const omittedEmptyCount = record.strings.length - visibleStrings.length;

      if (heading !== record.stringId) {
        metaParts.push(`ID: \`${escapeTableCell(record.stringId)}\``);
      }

      metaParts.push(`Type: ${renderTypeDescriptor(record.type)}`);
      metaParts.push(...getRecordLineageParts(record));

      if (otherFieldCounts.length > 0) {
        metaParts.push(`Other fields: ${otherFieldCounts}`);
      }

      if (omittedEmptyCount > 0) {
        metaParts.push(`${formatNumber(omittedEmptyCount)} empty omitted`);
      }

      lines.push(`#### ${escapeTableCell(heading)}`);
      lines.push('');
      lines.push(`- ${metaParts.join(' · ')}`);
      lines.push('');
      for (const entry of visibleStrings) {
        lines.push(`- \`${escapeTableCell(entry.key)}\``);
        lines.push('');
        lines.push(formatMultiline(entry.value));
        lines.push('');
      }

      renderNonDialogRecordSupplement(lines, record, recordById);
    }
  }

  return lines.join('\n');
};

const getReferenceOnlyRecords = (records: readonly InspectorRecord[]) =>
  records.filter(
    (record) =>
      !isDialogRelevantRecord(record) &&
      hasReferenceDetails(record) &&
      getVisibleStringEntries(record).length === 0,
  );

const renderReferenceBearingRecords = (
  records: readonly InspectorRecord[],
) => {
  const referenceOnlyRecords = getReferenceOnlyRecords(records);
  if (referenceOnlyRecords.length === 0) {
    return '';
  }

  const recordById = buildRecordIndex(records);
  const byMod = new Map<string, InspectorRecord[]>();
  for (const record of referenceOnlyRecords) {
    const modName = normalizeModName(record.modName);
    const existing = byMod.get(modName);
    if (existing) {
      existing.push(record);
    } else {
      byMod.set(modName, [record]);
    }
  }

  const totalReferences = referenceOnlyRecords.reduce(
    (sum, record) => sum + record.counts.references,
    0,
  );
  const lines: string[] = [];

  lines.push('## Reference-bearing Records Without Visible Strings');
  lines.push('');
  lines.push(
    'These non-dialog records have no non-empty string fields, but their references define concrete mod behavior. This section is important for single-mod exports because it preserves relationships such as vendor inventory, squad members, building parts, crafting inputs/outputs, biome links, and faction/world-state wiring.',
  );
  lines.push('');
  lines.push(
    `Rendered: ${pluralSuffix('record', referenceOnlyRecords.length)} / ${pluralSuffix('reference', totalReferences)}`,
  );
  lines.push('');

  for (const [modName, modRecords] of byMod) {
    const modReferenceCount = modRecords.reduce(
      (sum, record) => sum + record.counts.references,
      0,
    );

    lines.push(`### Reference-bearing Records · ${escapeTableCell(modName)}`);
    lines.push('');
    lines.push(
      `${pluralSuffix('record', modRecords.length)} / ${pluralSuffix('reference', modReferenceCount)} shown from \`${modName}\`.`,
    );
    lines.push('');

    for (const record of modRecords) {
      const heading = renderInspectorHeading(record);
      const metaParts: string[] = [];
      const otherFieldCounts = renderOtherFieldCounts(record.counts);

      if (heading !== record.stringId) {
        metaParts.push(`ID: \`${escapeTableCell(record.stringId)}\``);
      }

      metaParts.push(`Type: ${renderTypeDescriptor(record.type)}`);
      metaParts.push(...getRecordLineageParts(record));

      if (otherFieldCounts.length > 0) {
        metaParts.push(`Other fields: ${otherFieldCounts}`);
      }

      lines.push(`#### ${escapeTableCell(heading)}`);
      lines.push('');
      lines.push(`- ${metaParts.join(' · ')}`);
      lines.push('');
      renderNonDialogRecordSupplement(lines, record, recordById);
    }
  }

  return lines.join('\n');
};

const groupTextRecordsByMod = <T extends DialogRecord | EntityRecord>(
  records: readonly T[],
) => {
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

const isGenericDialogTitle = (value: string) =>
  /^DIALOGUE_LINE(?:\d+)?$/i.test(value) || value === 'DIALOGUE_LINE';

type HeadingRecord = Pick<InspectorRecord, 'name' | 'stringId' | 'type'>;

const renderBaseRecordHeading = (record: HeadingRecord) => {
  const trimmedName = record.name.trim();

  if (
    record.type === 19 &&
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

  return '(unnamed)';
};

const renderDialogHeading = (record: DialogRecord) => {
  const heading = renderBaseRecordHeading(record);
  if (heading === record.stringId) {
    return record.stringId;
  }

  return `${heading} · ${record.stringId}`;
};

const renderEntityHeading = (record: EntityRecord) => renderBaseRecordHeading(record);

const renderInspectorHeading = (record: InspectorRecord) =>
  renderBaseRecordHeading(record);

const groupInspectorRecordsByMod = (records: readonly InspectorRecord[]) => {
  const groups = new Map<string, InspectorRecord[]>();

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

const collectReferencedDialogLineIds = (
  records: readonly InspectorRecord[],
) => {
  const referencedIds = new Set<string>();

  for (const record of records) {
    if (record.type !== dialogueTypeCode && record.type !== dialogueLineTypeCode) {
      continue;
    }

    for (const reference of getReferences(record, 'lines')) {
      referencedIds.add(reference.targetId);
    }
  }

  return referencedIds;
};

const renderLineTexts = (
  lines: string[],
  dialogText: DialogRecord | undefined,
  indent: string,
) => {
  const visibleTexts = dialogText ? getVisibleDialogTexts(dialogText) : [];

  if (visibleTexts.length === 0) {
    lines.push(`${indent}- Text: (no non-empty text variants)`);
    return;
  }

  if (visibleTexts.length === 1) {
    const [text] = visibleTexts;
    const label = text.textId === 'text0' ? 'Text' : `Text \`${text.textId}\``;
    lines.push(`${indent}- ${label}:`);
    pushIndentedBlock(lines, `${indent}  `, formatMultiline(text.original));
    return;
  }

  lines.push(`${indent}- Text variants: ${formatNumber(visibleTexts.length)}`);
  for (const text of visibleTexts) {
    lines.push(`${indent}  - \`${escapeTableCell(text.textId)}\``);
    pushIndentedBlock(lines, `${indent}    `, formatMultiline(text.original));
  }
};

const renderDialogueLineNode = (
  lines: string[],
  reference: Reference,
  recordById: ReadonlyMap<string, InspectorRecord>,
  dialogTextById: ReadonlyMap<string, DialogRecord>,
  visitedLineIds: ReadonlySet<string>,
  depth: number,
) => {
  const indent = '  '.repeat(depth);
  const lineRecord = recordById.get(reference.targetId);
  const dialogText = dialogTextById.get(reference.targetId);

  if (!lineRecord) {
    lines.push(
      `${indent}- Missing line reference: \`${escapeTableCell(reference.targetId)}\` (${formatReferenceValues(reference)})`,
    );
    return;
  }

  const heading = renderInspectorHeading(lineRecord);
  const idPart =
    heading === lineRecord.stringId
      ? ''
      : ` · \`${escapeTableCell(lineRecord.stringId)}\``;

  lines.push(
    `${indent}- Line: ${escapeTableCell(heading)}${idPart} (${formatReferenceValues(reference)})`,
  );

  const lineFields = formatPrimitiveFields(lineRecord, [
    'speaker',
    'chance permanent',
    'chance temporary',
    'repetition limit',
    'score bonus',
    'target is type',
    'interjection',
  ]);
  if (lineFields.length > 0) {
    lines.push(`${indent}  - Fields: ${lineFields}`);
  }

  lines.push(
    `${indent}  - Lineage: ${getRecordLineageParts(lineRecord).join(' · ')}`,
  );

  renderLineTexts(lines, dialogText, `${indent}  `);

  renderDialogActionReferences(
    lines,
    'Conditions',
    getReferences(lineRecord, 'conditions'),
    recordById,
    `${indent}  `,
  );
  renderDialogActionReferences(
    lines,
    'Effects',
    getReferences(lineRecord, 'effects'),
    recordById,
    `${indent}  `,
  );

  renderGenericReferenceCategories(
    lines,
    lineRecord,
    recordById,
    ['conditions', 'effects', 'lines'],
    `${indent}  `,
  );

  const childLineReferences = getReferences(lineRecord, 'lines');
  if (childLineReferences.length === 0) {
    return;
  }

  if (visitedLineIds.has(lineRecord.stringId)) {
    lines.push(`${indent}  - Replies: cycle detected; nested lines omitted.`);
    return;
  }

  if (depth >= maxDialogLineRenderDepth) {
    lines.push(`${indent}  - Replies: depth limit reached.`);
    return;
  }

  const nextVisited = new Set(visitedLineIds);
  nextVisited.add(lineRecord.stringId);

  lines.push(`${indent}  - Replies: ${pluralSuffix('line', childLineReferences.length)}`);
  for (const childReference of childLineReferences) {
    renderDialogueLineNode(
      lines,
      childReference,
      recordById,
      dialogTextById,
      nextVisited,
      depth + 2,
    );
  }
};

const renderDialogueRecord = (
  lines: string[],
  record: InspectorRecord,
  recordById: ReadonlyMap<string, InspectorRecord>,
  dialogTextById: ReadonlyMap<string, DialogRecord>,
) => {
  const heading = renderInspectorHeading(record);
  const lineReferences = getReferences(record, 'lines');
  const tag = getStringValue(record, 'tag');
  const fields = formatPrimitiveFields(record, [
    'monologue',
    'for enemies',
    'locked',
    'one at a time',
    'chance permanent',
    'chance temporary',
    'repetition limit',
    'score bonus',
    'target is type',
  ]);

  lines.push(`##### ${escapeTableCell(heading)}`);
  lines.push('');
  lines.push(`- ID: \`${escapeTableCell(record.stringId)}\``);
  lines.push(`- Type: ${renderTypeDescriptor(record.type)}`);
  lines.push(`- Lineage: ${getRecordLineageParts(record).join(' · ')}`);

  if (tag.length > 0) {
    lines.push(`- Tag: ${escapeTableCell(tag)}`);
  }

  if (fields.length > 0) {
    lines.push(`- Fields: ${fields}`);
  }

  renderDialogActionReferences(
    lines,
    'Conditions',
    getReferences(record, 'conditions'),
    recordById,
  );
  renderGenericReferenceCategories(
    lines,
    record,
    recordById,
    ['conditions', 'lines'],
  );

  if (lineReferences.length === 0) {
    lines.push('- Lines: none');
    lines.push('');
    return;
  }

  lines.push(`- Root lines: ${pluralSuffix('line', lineReferences.length)}`);
  lines.push('');
  for (const reference of lineReferences) {
    renderDialogueLineNode(
      lines,
      reference,
      recordById,
      dialogTextById,
      new Set<string>(),
      0,
    );
  }
  lines.push('');
};

const renderStandaloneDialogLine = (
  lines: string[],
  record: InspectorRecord,
  recordById: ReadonlyMap<string, InspectorRecord>,
  dialogTextById: ReadonlyMap<string, DialogRecord>,
) => {
  const reference: Reference = {
    targetId: record.stringId,
    value0: 0,
    value1: 0,
    value2: 0,
  };
  renderDialogueLineNode(
    lines,
    reference,
    recordById,
    dialogTextById,
    new Set<string>(),
    0,
  );
};

const renderDialogStructures = (
  project: ModProject,
  dialogRecords: readonly DialogRecord[],
) => {
  const dialogRelevantRecords = getDialogRelevantRecords(project.inspectorRecords);
  if (dialogRelevantRecords.length === 0) {
    return '';
  }

  const recordById = buildRecordIndex(project.inspectorRecords);
  const dialogTextById = new Map<string, DialogRecord>();
  for (const record of dialogRecords) {
    dialogTextById.set(record.stringId, record);
  }

  const referencedLineIds = collectReferencedDialogLineIds(project.inspectorRecords);
  const byMod = groupInspectorRecordsByMod(dialogRelevantRecords);
  const lines: string[] = [];

  lines.push('### Dialog Structures');
  lines.push('');
  lines.push(
    'FCS dialog model used here: `DIALOGUE_PACKAGE.dialogs` points to dialogue roots; `DIALOGUE.lines` and `DIALOGUE_LINE.lines` point to spoken lines and replies; `conditions` and `effects` point to `DIALOG_ACTION` records. Reference values are preserved as raw `v0/v1/v2` because their meaning depends on the source FCS field.',
  );
  lines.push('');

  for (const mod of project.mods) {
    const modName = normalizeModName(mod.fileName);
    const modRecords = byMod.get(modName) ?? [];
    if (modRecords.length === 0) {
      continue;
    }

    const packages = modRecords.filter(
      (record) => record.type === dialoguePackageTypeCode,
    );
    const dialogues = modRecords.filter(
      (record) => record.type === dialogueTypeCode,
    );
    const standaloneLines = modRecords.filter(
      (record) =>
        record.type === dialogueLineTypeCode &&
        !referencedLineIds.has(record.stringId),
    );

    if (
      packages.length === 0 &&
      dialogues.length === 0 &&
      standaloneLines.length === 0
    ) {
      continue;
    }

    lines.push(`#### Dialog Structures · ${escapeTableCell(modName)}`);
    lines.push('');
    lines.push(
      `${pluralSuffix('package', packages.length)} · ${pluralSuffix('dialogue', dialogues.length)} · ${pluralSuffix('standalone line', standaloneLines.length)}`,
    );
    lines.push('');

    if (packages.length > 0) {
      lines.push('##### Dialogue Packages');
      lines.push('');
      for (const record of packages) {
        const heading = renderInspectorHeading(record);
        const tag = getStringValue(record, 'tag');
        const dialogReferences = getReferences(record, 'dialogs');
        const inheritedReferences = getReferences(record, 'inheritsFrom');

        lines.push(`- ${escapeTableCell(heading)} · \`${escapeTableCell(record.stringId)}\``);
        lines.push(`  - Lineage: ${getRecordLineageParts(record).join(' · ')}`);
        if (tag.length > 0) {
          lines.push(`  - Tag: ${escapeTableCell(tag)}`);
        }
        if (dialogReferences.length > 0) {
          lines.push(
            `  - Dialogs: ${pluralSuffix('reference', dialogReferences.length)}${formatReferenceCategoryHint('dialogs')}`,
          );
          for (const reference of dialogReferences) {
            lines.push(
              `    - ${formatResolvedReference(reference, recordById)}`,
            );
          }
        }
        if (inheritedReferences.length > 0) {
          lines.push(
            `  - Inherits from: ${pluralSuffix('package', inheritedReferences.length)}${formatReferenceCategoryHint('inheritsFrom')}`,
          );
          for (const reference of inheritedReferences) {
            lines.push(
              `    - ${formatResolvedReference(reference, recordById)}`,
            );
          }
        }
      }
      lines.push('');
    }

    if (dialogues.length > 0) {
      lines.push('##### Dialogue Trees');
      lines.push('');
      for (const record of dialogues) {
        renderDialogueRecord(lines, record, recordById, dialogTextById);
      }
    }

    if (standaloneLines.length > 0) {
      lines.push('##### Standalone Dialogue Lines');
      lines.push('');
      lines.push(
        'These `DIALOGUE_LINE` records were not reached from any loaded `DIALOGUE.lines` reference, but they still contain text or dialog metadata.',
      );
      lines.push('');
      for (const record of standaloneLines) {
        renderStandaloneDialogLine(lines, record, recordById, dialogTextById);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
};

const renderExtractedTextRecords = (project: ModProject) => {
  const dialogRecords: DialogRecord[] = [];
  const describedEntityRecords: EntityRecord[] = [];
  const nameOnlyEntityRecords: EntityRecord[] = [];

  for (const record of project.textRecords) {
    if (record.kind === 'dialog') {
      dialogRecords.push(record);
    } else {
      if (record.description.length > 0) {
        describedEntityRecords.push(record);
      } else {
        nameOnlyEntityRecords.push(record);
      }
    }
  }

  if (
    dialogRecords.length === 0 &&
    describedEntityRecords.length === 0 &&
    nameOnlyEntityRecords.length === 0
  ) {
    return '';
  }

  const dialogByMod = groupTextRecordsByMod(dialogRecords);
  const describedEntitiesByMod = groupTextRecordsByMod(describedEntityRecords);
  const nameOnlyEntitiesByMod = groupTextRecordsByMod(nameOnlyEntityRecords);
  const dialogStats = summarizeDialogRecords(dialogRecords);
  const lines: string[] = [];
  lines.push('## Extracted Text Records');
  lines.push('');
  lines.push(
    `Dialog records: ${formatNumber(dialogStats.renderedRecordCount)} shown · Dialog lines: ${formatNumber(dialogStats.renderedTextCount)} shown · Described entities: ${formatNumber(describedEntityRecords.length)} · Name-only entities: ${formatNumber(nameOnlyEntityRecords.length)}`,
  );
  if (dialogStats.omittedEmptyRecordCount > 0 || dialogStats.omittedEmptyTextCount > 0) {
    lines.push('');
    lines.push(
      `Empty-only dialog records omitted: ${formatNumber(dialogStats.omittedEmptyRecordCount)} · Empty dialog variants omitted: ${formatNumber(dialogStats.omittedEmptyTextCount)}`,
    );
  }
  lines.push('');

  lines.push('### Mod Breakdown');
  lines.push('');
  lines.push('| Mod | Dialog records | Dialog lines | Empty-only dialogs omitted | Described entities | Name-only entities |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const mod of project.mods) {
    const modName = normalizeModName(mod.fileName);
    const modDialogRecords = dialogByMod.get(modName) ?? [];
    const modDescribedEntities = describedEntitiesByMod.get(modName) ?? [];
    const modNameOnlyEntities = nameOnlyEntitiesByMod.get(modName) ?? [];
    const modDialogStats = summarizeDialogRecords(modDialogRecords);
    lines.push(
      `| ${escapeTableCell(modName)} | ${formatNumber(modDialogStats.renderedRecordCount)} | ${formatNumber(modDialogStats.renderedTextCount)} | ${formatNumber(modDialogStats.omittedEmptyRecordCount)} | ${formatNumber(modDescribedEntities.length)} | ${formatNumber(modNameOnlyEntities.length)} |`,
    );
  }
  lines.push('');

  const dialogStructureSection = renderDialogStructures(project, dialogRecords);
  if (dialogStructureSection.length > 0) {
    lines.push(dialogStructureSection);
    lines.push('');
  }

  if (describedEntityRecords.length > 0) {
    lines.push('### Entity Descriptions');
    lines.push('');
    for (const [modName, records] of describedEntitiesByMod) {
      lines.push(`#### ${escapeTableCell(modName)}`);
      lines.push('');
      lines.push(`${pluralSuffix('record', records.length)} with descriptions.`);
      lines.push('');
      for (const record of records) {
        const heading = renderEntityHeading(record);
        const metaParts: string[] = [];

        if (heading !== record.stringId) {
          metaParts.push(`ID: \`${escapeTableCell(record.stringId)}\``);
        }

        metaParts.push(`Type: ${renderTypeDescriptor(record.type)}`);
        metaParts.push(...getRecordLineageParts(record));

        lines.push(`##### ${escapeTableCell(heading)}`);
        lines.push('');
        lines.push(`- ${metaParts.join(' · ')}`);
        lines.push('');
        lines.push(formatMultiline(record.description));
        lines.push('');
      }
    }
  }

  if (nameOnlyEntityRecords.length > 0) {
    lines.push('### Name-only Entities');
    lines.push('');
    lines.push(
      'These records were extracted because their names are text-relevant, but they do not carry a description field.',
    );
    lines.push('');
    for (const [modName, records] of nameOnlyEntitiesByMod) {
      lines.push(`#### ${escapeTableCell(modName)}`);
      lines.push('');
      lines.push('| Name | stringId | Type | Change | ID source |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const record of records) {
        const idSource = inferReferenceSource(record.stringId);
        const sourceLabel =
          idSource.length === 0 ? '—' : escapeTableCell(idSource);
        lines.push(
          `| ${escapeTableCell(record.name || '(unnamed)')} | \`${escapeTableCell(record.stringId)}\` | ${record.type} · ${getItemTypeEnglishName(record.type)} | ${escapeTableCell(record.saveData.changeTypeName)} | ${sourceLabel} |`,
        );
      }
      lines.push('');
    }
  }

  if (dialogRecords.length > 0) {
    lines.push('### Dialog Text');
    lines.push('');
    for (const [modName, records] of dialogByMod) {
      const modDialogStats = summarizeDialogRecords(records);
      if (modDialogStats.renderedRecordCount === 0) {
        continue;
      }

      lines.push(`#### ${escapeTableCell(modName)}`);
      lines.push('');
      lines.push(
        `${pluralSuffix('record', modDialogStats.renderedRecordCount)} / ${pluralSuffix('line', modDialogStats.renderedTextCount)} shown.`,
      );
      if (modDialogStats.omittedEmptyRecordCount > 0) {
        lines.push(
          `${pluralSuffix('record', modDialogStats.omittedEmptyRecordCount)} with only empty dialog variants omitted.`,
        );
      }
      lines.push('');
      for (const record of records) {
        const visibleTexts = getVisibleDialogTexts(record);
        if (visibleTexts.length === 0) {
          continue;
        }

        const heading = renderDialogHeading(record);
        const singleText = visibleTexts[0];
        const omittedTextCount = record.texts.length - visibleTexts.length;

        lines.push(`##### ${escapeTableCell(heading)}`);
        lines.push('');

        if (visibleTexts.length === 1 && singleText) {
          const metaParts: string[] = [];

          if (singleText.textId !== 'text0') {
            metaParts.push(`Field: \`${escapeTableCell(singleText.textId)}\``);
          }

          if (omittedTextCount > 0) {
            metaParts.push(`${formatNumber(omittedTextCount)} empty omitted`);
          }

          if (metaParts.length > 0) {
            lines.push(`- ${metaParts.join(' · ')}`);
            lines.push('');
          }

          lines.push(formatMultiline(singleText.original));
          lines.push('');
          continue;
        }

        if (visibleTexts.length > 1) {
          const variationParts = [
            `Variations: ${formatNumber(visibleTexts.length)} shown`,
          ];

          if (omittedTextCount > 0) {
            variationParts.push(`${formatNumber(omittedTextCount)} empty omitted`);
          }

          lines.push(`- ${variationParts.join(' · ')}`);
          lines.push('');
        }

        for (const text of visibleTexts) {
          lines.push(`- \`${escapeTableCell(text.textId)}\``);
          lines.push('');
          lines.push(formatMultiline(text.original));
          lines.push('');
        }
      }
    }
  }

  return lines.join('\n');
};

export const renderProjectMarkdown = (project: ModProject): string => {
  const sections: string[] = [
    renderHeader(project),
    renderNavigation(project),
    renderStructure(project),
    renderDependencies(project.mods),
    renderCategoryBreakdown(project.inspectorRecords),
    renderTypeBreakdown(project.inspectorRecords),
    renderRecordChangeBreakdown(project),
    renderMods(project.mods),
    renderExtractedTextRecords(project),
    renderStringBearingRecords(project.inspectorRecords),
    renderReferenceBearingRecords(project.inspectorRecords),
  ];

  return sections.filter((section) => section.length > 0).join('\n') + '\n';
};
