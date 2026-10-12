import { getItemCategory, itemCategoryLabels, type ItemCategory } from "../shared/item-types.ts";
import type { InspectorRecord, ModProject } from "../shared/models.ts";

export type RecordStatus = "Changed" | "New" | "Removed" | "Renamed" | "Unknown";

export const recordStatusLabels: Record<RecordStatus, string> = {
  Changed: "変更",
  New: "新規",
  Removed: "削除",
  Renamed: "改名",
  Unknown: "不明",
};

export const recordStatusOrder: readonly RecordStatus[] = [
  "New",
  "Changed",
  "Renamed",
  "Removed",
  "Unknown",
];

/** REMOVED フラグを最優先し、保存上の変更種別を表示用の状態にまとめる。 */
export const getRecordStatus = (
  record: Pick<InspectorRecord, "removed" | "saveData">,
): RecordStatus => {
  if (record.removed) {
    return "Removed";
  }
  switch (record.saveData.changeTypeName) {
    case "New":
    case "Changed":
    case "Renamed":
      return record.saveData.changeTypeName;
    default:
      return "Unknown";
  }
};

export interface ProjectSummary {
  assetMissingCount: number;
  dialogLineCount: number;
  entityTextCount: number;
  recordCount: number;
  statusCounts: Record<RecordStatus, number>;
  warningCount: number;
}

export const summarizeProject = (project: ModProject): ProjectSummary => {
  const statusCounts: Record<RecordStatus, number> = {
    Changed: 0,
    New: 0,
    Removed: 0,
    Renamed: 0,
    Unknown: 0,
  };
  for (const record of project.inspectorRecords) {
    statusCounts[getRecordStatus(record)] += 1;
  }

  let dialogLineCount = 0;
  let entityTextCount = 0;
  for (const record of project.textRecords) {
    if (record.kind === "dialog") {
      dialogLineCount += 1;
    } else {
      entityTextCount += 1;
    }
  }

  return {
    assetMissingCount: project.assetReferences.filter((asset) => asset.status === "missing").length,
    dialogLineCount,
    entityTextCount,
    recordCount: project.inspectorRecords.length,
    statusCounts,
    warningCount:
      project.failedMods.length +
      project.missingReferencePaths.length +
      project.mods.reduce((sum, mod) => sum + mod.warnings.length, 0),
  };
};

export interface CategoryBreakdown {
  category: ItemCategory;
  count: number;
  label: string;
}

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
