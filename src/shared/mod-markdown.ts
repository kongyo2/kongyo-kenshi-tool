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
} from './models.ts';

const formatNumber = (value: number) => value.toLocaleString('en-US');

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

const renderHeader = (project: ModProject) => {
  const totalRecords = project.inspectorRecords.length;
  const stringStats = summarizeStringRecords(project.inspectorRecords);
  const dialogRecords = project.textRecords.filter(
    (record): record is DialogRecord => record.kind === 'dialog',
  );
  const dialogStats = summarizeDialogRecords(dialogRecords);
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
    '- Use `String-bearing Records` when you need the raw non-empty string payload and exact keys',
  );
  lines.push('  from the source mod data.');
  lines.push(
    '- Records with no string fields are omitted from the raw dump, while',
  );
  lines.push('  their counts still contribute to the summary tables.');
  lines.push(
    '- Non-string fields are summarized as counts so the dump stays compact enough',
  );
  lines.push('  for prompt construction.');
  lines.push(
    '- Empty string values are omitted from dialog and raw sections to reduce prompt noise.',
  );
  lines.push('');
  lines.push('### Metrics');
  lines.push(`- Source project: **${project.sourceModName}**`);
  lines.push(`- Loaded mods: **${formatNumber(project.mods.length)}**`);
  lines.push(`- Total records: **${formatNumber(totalRecords)}**`);
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
  lines.push('- [Mods](#mods)');

  if (project.textRecords.length > 0) {
    lines.push('- [Extracted Text Records](#extracted-text-records)');
  }

  if (project.inspectorRecords.some((record) => record.strings.length > 0)) {
    lines.push('- [String-bearing Records](#string-bearing-records)');
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
  const lines: string[] = [];
  lines.push('## String-bearing Records');
  lines.push('');
  lines.push(
    'This section preserves original string keys while omitting empty values and records that contain only empty strings.',
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
      lines.push('| Name | stringId | Type |');
      lines.push('| --- | --- | --- |');
      for (const record of records) {
        lines.push(
          `| ${escapeTableCell(record.name || '(unnamed)')} | \`${escapeTableCell(record.stringId)}\` | ${record.type} · ${getItemTypeEnglishName(record.type)} |`,
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
    renderMods(project.mods),
    renderExtractedTextRecords(project),
    renderStringBearingRecords(project.inspectorRecords),
  ];

  return sections.filter((section) => section.length > 0).join('\n') + '\n';
};
