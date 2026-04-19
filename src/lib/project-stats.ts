import {
  getItemCategory,
  itemCategoryLabels,
  type ItemCategory,
} from '../shared/item-types.ts';
import type {
  InspectorRecord,
  TranslationProject,
} from '../shared/models.ts';

export interface ProjectStats {
  descriptionCount: number;
  descriptionTranslatedCount: number;
  dialogCount: number;
  dialogTranslatedCount: number;
  nameCount: number;
  nameTranslatedCount: number;
  recordCount: number;
  totalCount: number;
  translatedCount: number;
}

export interface CategoryBreakdown {
  category: ItemCategory;
  count: number;
  label: string;
}

export const countProjectStats = (
  project: TranslationProject,
): ProjectStats => {
  let dialogCount = 0;
  let dialogTranslatedCount = 0;
  let nameCount = 0;
  let nameTranslatedCount = 0;
  let descriptionCount = 0;
  let descriptionTranslatedCount = 0;

  for (const record of project.records) {
    if (record.kind === 'dialog') {
      dialogCount += record.texts.length;
      dialogTranslatedCount += record.texts.filter(
        (text) => text.translation.length > 0,
      ).length;
      continue;
    }

    nameCount += 1;
    if (record.nameTranslation.length > 0) {
      nameTranslatedCount += 1;
    }

    if (record.description.length > 0) {
      descriptionCount += 1;
      if (record.descriptionTranslation.length > 0) {
        descriptionTranslatedCount += 1;
      }
    }
  }

  const totalCount = dialogCount + nameCount + descriptionCount;
  const translatedCount =
    dialogTranslatedCount + nameTranslatedCount + descriptionTranslatedCount;

  return {
    descriptionCount,
    descriptionTranslatedCount,
    dialogCount,
    dialogTranslatedCount,
    nameCount,
    nameTranslatedCount,
    recordCount: project.records.length,
    totalCount,
    translatedCount,
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
