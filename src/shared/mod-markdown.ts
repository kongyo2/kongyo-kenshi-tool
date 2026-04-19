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
  TranslationProject,
} from './models.ts';

const formatNumber = (value: number) => value.toLocaleString('en-US');

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

const buildRecordAnchor = (uid: string, sequence: number) => {
  const asciiSlug = uid
    .toLowerCase()
    .replace(/[^a-z0-9\-_:]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  return `rec-${sequence}${asciiSlug.length > 0 ? `-${asciiSlug}` : ''}`;
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

const renderHeader = (project: TranslationProject) => {
  const totalRecords = project.inspectorRecords.length;
  const totalStrings = project.inspectorRecords.reduce(
    (sum, record) => sum + record.strings.length,
    0,
  );
  const totalTranslationRecords = project.records.length;

  const lines: string[] = [];
  lines.push('# Kenshi Mod Data Export');
  lines.push('');
  lines.push(
    'This file is a merged representation of all loaded Kenshi mod data,',
  );
  lines.push(
    'formatted as Markdown for ingestion by LLMs. It is structured like',
  );
  lines.push(
    '[repomix](https://github.com/yamadashy/repomix) output but for `.mod`',
  );
  lines.push('files parsed via the OpenConstructionSet binary format.');
  lines.push('');
  lines.push('## File Summary');
  lines.push('');
  lines.push('### Purpose');
  lines.push(
    'Provide a complete, human and LLM readable dump of every record,',
  );
  lines.push('string field, dependency and meta information contained in');
  lines.push('the selected mods.');
  lines.push('');
  lines.push('### Usage Guidelines');
  lines.push('- The `Mods` section lists each loaded `.mod` file and its header.');
  lines.push(
    '- The `Records` section contains every inspector record with all',
  );
  lines.push('  string key/value pairs and counts for non-string fields.');
  lines.push(
    '- Record headings use the form `modName :: stringId` so they can be',
  );
  lines.push('  referenced uniquely.');
  lines.push('- Empty string values are shown as `(empty)`.');
  lines.push('');
  lines.push('### Notes');
  lines.push(
    '- Only string fields are dumped verbatim; booleans / floats / ints /',
  );
  lines.push(
    '  vectors / files / references / instances are summarised as counts',
  );
  lines.push('  since they rarely matter for translation / narrative review.');
  lines.push('- Translation entries (dialog / entity) are included in a');
  lines.push('  dedicated section when any translation progress exists.');
  lines.push('');
  lines.push('### Metrics');
  lines.push(
    `- Source project: **${project.sourceModName}**`,
  );
  lines.push(`- Loaded mods: **${formatNumber(project.mods.length)}**`);
  lines.push(`- Total records: **${formatNumber(totalRecords)}**`);
  lines.push(
    `- Total string fields: **${formatNumber(totalStrings)}**`,
  );
  lines.push(
    `- Translation records: **${formatNumber(totalTranslationRecords)}**`,
  );
  lines.push(
    `- Dependencies: **${formatNumber(project.dependencies.length)}**`,
  );
  lines.push('');

  return lines.join('\n');
};

const renderStructure = (project: TranslationProject) => {
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

const renderDependencies = (project: TranslationProject) => {
  if (project.dependencies.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Dependencies');
  lines.push('');
  for (const dependency of project.dependencies) {
    lines.push(`- ${dependency}`);
  }
  lines.push('');
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
    lines.push(`| File | \`${escapeTableCell(mod.filePath)}\` |`);
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

const renderRecordCounts = (counts: InspectorRecord['counts']) => {
  const parts: string[] = [];
  const entries: Array<[string, number]> = [
    ['strings', counts.strings],
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
    return '(no sub-fields)';
  }

  return parts.join(', ');
};

const renderRecords = (records: readonly InspectorRecord[]) => {
  const lines: string[] = [];
  lines.push('## Records');
  lines.push('');
  lines.push(`Total: ${formatNumber(records.length)} records`);
  lines.push('');

  const byMod = new Map<string, InspectorRecord[]>();
  for (const record of records) {
    const existing = byMod.get(record.modName);
    if (existing) {
      existing.push(record);
    } else {
      byMod.set(record.modName, [record]);
    }
  }

  let globalSequence = 0;

  for (const [modName, modRecords] of byMod) {
    lines.push(`### Records · ${modName}`);
    lines.push('');
    lines.push(
      `${pluralSuffix('record', modRecords.length)} from \`${modName}\`.`,
    );
    lines.push('');

    for (const record of modRecords) {
      const category = getItemCategory(record.type);
      const typeLabel = getItemTypeLabel(record.type);
      const typeEnglish = getItemTypeEnglishName(record.type);
      const displayName =
        record.name.length === 0 ? '(unnamed)' : record.name;
      const anchor = buildRecordAnchor(record.uid, globalSequence);
      globalSequence += 1;

      lines.push(
        `#### <a id="${anchor}"></a>${escapeTableCell(displayName)}`,
      );
      lines.push('');
      lines.push('| Field | Value |');
      lines.push('| --- | --- |');
      lines.push(`| UID | \`${escapeTableCell(record.uid)}\` |`);
      lines.push(`| stringId | \`${escapeTableCell(record.stringId)}\` |`);
      lines.push(`| Mod | ${escapeTableCell(modName)} |`);
      lines.push(
        `| Type | ${record.type} · ${typeEnglish} · ${typeLabel} |`,
      );
      lines.push(
        `| Category | ${itemCategoryLabels[category]} (${category}) |`,
      );
      lines.push(`| Field counts | ${renderRecordCounts(record.counts)} |`);
      lines.push('');

      if (record.strings.length === 0) {
        lines.push('_No string fields._');
        lines.push('');
        continue;
      }

      lines.push('**String fields**');
      lines.push('');
      for (const entry of record.strings) {
        lines.push(`- **${escapeTableCell(entry.key)}**`);
        lines.push('');
        lines.push(formatMultiline(entry.value));
        lines.push('');
      }
    }
  }

  return lines.join('\n');
};

const renderTranslations = (project: TranslationProject) => {
  const dialogRecords: DialogRecord[] = [];
  const entityRecords: EntityRecord[] = [];

  for (const record of project.records) {
    if (record.kind === 'dialog') {
      dialogRecords.push(record);
    } else {
      entityRecords.push(record);
    }
  }

  if (dialogRecords.length === 0 && entityRecords.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Translation Records');
  lines.push('');
  lines.push(
    `Dialog records: ${formatNumber(dialogRecords.length)} · Entity records: ${formatNumber(entityRecords.length)}`,
  );
  lines.push('');

  if (entityRecords.length > 0) {
    lines.push('### Entity Translations');
    lines.push('');
    for (const record of entityRecords) {
      lines.push(`#### ${escapeTableCell(record.name || '(unnamed)')}`);
      lines.push('');
      lines.push(`- stringId: \`${escapeTableCell(record.stringId)}\``);
      lines.push(
        `- Type: ${record.type} · ${getItemTypeEnglishName(record.type)}`,
      );
      if (record.nameTranslation.length > 0) {
        lines.push(`- Name translation: ${escapeTableCell(record.nameTranslation)}`);
      }
      lines.push('');
      lines.push('**Description (original)**');
      lines.push('');
      lines.push(formatMultiline(record.description));
      lines.push('');
      if (record.descriptionTranslation.length > 0) {
        lines.push('**Description (translation)**');
        lines.push('');
        lines.push(formatMultiline(record.descriptionTranslation));
        lines.push('');
      }
    }
  }

  if (dialogRecords.length > 0) {
    lines.push('### Dialog Translations');
    lines.push('');
    for (const record of dialogRecords) {
      lines.push(`#### ${escapeTableCell(record.name || '(unnamed)')}`);
      lines.push('');
      lines.push(`- stringId: \`${escapeTableCell(record.stringId)}\``);
      lines.push(
        `- Type: ${record.type} · ${getItemTypeEnglishName(record.type)}`,
      );
      lines.push(`- Lines: ${formatNumber(record.texts.length)}`);
      lines.push('');
      for (const text of record.texts) {
        lines.push(`- \`${escapeTableCell(text.textId)}\``);
        lines.push('');
        lines.push('  **Original**');
        lines.push('');
        lines.push(formatMultiline(text.original));
        lines.push('');
        if (text.translation.length > 0) {
          lines.push('  **Translation**');
          lines.push('');
          lines.push(formatMultiline(text.translation));
          lines.push('');
        }
      }
    }
  }

  return lines.join('\n');
};

export const renderProjectMarkdown = (
  project: TranslationProject,
): string => {
  const sections: string[] = [
    renderHeader(project),
    renderStructure(project),
    renderDependencies(project),
    renderCategoryBreakdown(project.inspectorRecords),
    renderTypeBreakdown(project.inspectorRecords),
    renderMods(project.mods),
    renderRecords(project.inspectorRecords),
    renderTranslations(project),
  ];

  return sections.filter((section) => section.length > 0).join('\n') + '\n';
};
