import {
  getItemCategory,
  itemCategoryLabels,
  type ItemCategory,
} from '../shared/item-types.ts';
import type { InspectorRecord, ModProject } from '../shared/models.ts';

export interface ProjectStats {
  dialogLineCount: number;
  dialogRecordCount: number;
  entityRecordCount: number;
  recordCount: number;
  stringFieldCount: number;
  textRecordCount: number;
}

export interface CategoryBreakdown {
  category: ItemCategory;
  count: number;
  label: string;
}

export const countProjectStats = (project: ModProject): ProjectStats => {
  let dialogLineCount = 0;
  let dialogRecordCount = 0;
  let entityRecordCount = 0;

  for (const record of project.textRecords) {
    if (record.kind === 'dialog') {
      dialogRecordCount += 1;
      dialogLineCount += record.texts.length;
      continue;
    }

    entityRecordCount += 1;
  }

  const stringFieldCount = project.inspectorRecords.reduce(
    (sum, record) => sum + record.counts.strings,
    0,
  );

  return {
    dialogLineCount,
    dialogRecordCount,
    entityRecordCount,
    recordCount: project.inspectorRecords.length,
    stringFieldCount,
    textRecordCount: project.textRecords.length,
  };
};

export const buildCategoryBreakdown = (
  inspectorRecords: readonly InspectorRecord[],
): CategoryBreakdown[] => {
  const counters = new Map<ItemCategory, number>();

  for (const record of inspectorRecords) {
    const category = getItemCategory(record.type);
    counters.set(category, (counters.get(category) ?? 0) + 1);
  }

  return Array.from(counters.entries())
    .map(([category, count]) => ({
      category,
      count,
      label: itemCategoryLabels[category],
    }))
    .sort((left, right) => right.count - left.count);
};
