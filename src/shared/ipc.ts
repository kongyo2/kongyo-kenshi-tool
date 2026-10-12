import { z } from "zod";

import { inspectorRecordSchema, modProjectSchema } from "./models.ts";

export const exportOptionsSchema = z.object({
  /** 変更レコードに、参照コンテキスト上の元の値を併記する */
  includeBaseComparison: z.boolean().default(true),
  /** 出力に現れたフィールドの FCS 定義を巻末にまとめる */
  includeFieldGlossary: z.boolean().default(true),
});

export const loadModsRequestSchema = z.object({
  paths: z.array(z.string()).min(1),
  referencePaths: z.array(z.string()).default([]),
});

export const projectRequestSchema = z.object({
  projectId: z.string().min(1),
});

export const exportModMarkdownRequestSchema = projectRequestSchema.extend({
  options: exportOptionsSchema.prefault({}),
});

const markdownStatsSchema = z.object({
  byteCount: z.number().int().nonnegative(),
  characterCount: z.number().int().nonnegative(),
  /** 文字種から見積もった LLM のトークン数の目安 */
  estimatedTokens: z.number().int().nonnegative(),
});

export const exportModMarkdownResponseSchema = z.discriminatedUnion("canceled", [
  z.object({ canceled: z.literal(true) }),
  markdownStatsSchema.extend({ canceled: z.literal(false), filePath: z.string() }),
]);

export const copyModMarkdownResponseSchema = markdownStatsSchema;

export const measureModMarkdownResponseSchema = markdownStatsSchema.extend({
  sections: z.array(
    markdownStatsSchema.extend({
      anchor: z.string(),
      title: z.string(),
    }),
  ),
});

export const appSettingsSchema = z.object({
  exportOptions: exportOptionsSchema.prefault({}),
  lastTargetPaths: z.array(z.string()).default([]),
  referencePaths: z.array(z.string()).default([]),
  vanillaDataPath: z.string().nullable().default(null),
});

export const vanillaPickResultSchema = z.object({
  hasGamedata: z.boolean(),
  path: z.string(),
});

export const enabledModsResultSchema = z.object({
  /** mods.cfg の順に見つかった mod ファイル */
  found: z.array(z.string()),
  /** mods.cfg にあるが見つからなかった mod 名 */
  missing: z.array(z.string()),
  modsConfigPath: z.string(),
});

export const loadProgressSchema = z.object({
  current: z.number().int().nonnegative(),
  currentFile: z.string(),
  phase: z.enum(["target", "reference", "analysis"]),
  total: z.number().int().positive(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type CopyModMarkdownResponse = z.infer<typeof copyModMarkdownResponseSchema>;
export type MeasureModMarkdownResponse = z.infer<typeof measureModMarkdownResponseSchema>;
export type EnabledModsResult = z.infer<typeof enabledModsResultSchema>;
export type ExportModMarkdownRequest = z.input<typeof exportModMarkdownRequestSchema>;
export type ExportModMarkdownResponse = z.infer<typeof exportModMarkdownResponseSchema>;
export type ExportOptions = z.infer<typeof exportOptionsSchema>;
export type LoadModsRequest = z.infer<typeof loadModsRequestSchema>;
export type LoadProgress = z.infer<typeof loadProgressSchema>;
export type VanillaPickResult = z.infer<typeof vanillaPickResultSchema>;

export interface ElectronApi {
  closeProject: (projectId: string) => Promise<void>;
  copyModMarkdown: (input: ExportModMarkdownRequest) => Promise<CopyModMarkdownResponse>;
  /** Steam のライブラリから Kenshi の data フォルダを探す。見つからなければ null */
  detectVanillaDataPath: () => Promise<string | null>;
  exportModMarkdown: (input: ExportModMarkdownRequest) => Promise<ExportModMarkdownResponse>;
  getAppSettings: () => Promise<AppSettings>;
  /** 参照コンテキストのレコード。インスペクタで必要になったときだけ取得する */
  getContextRecords: (projectId: string) => Promise<z.infer<typeof inspectorRecordSchema>[]>;
  getPathForFile: (file: File) => string;
  loadMods: (input: LoadModsRequest) => Promise<z.infer<typeof modProjectSchema>>;
  /** 書き出し内容を生成して、全体とセクションごとのサイズ・トークン数の目安を返す */
  measureModMarkdown: (input: ExportModMarkdownRequest) => Promise<MeasureModMarkdownResponse>;
  onLoadProgress: (callback: (progress: LoadProgress) => void) => () => void;
  pickAndSaveVanillaDataPath: () => Promise<VanillaPickResult | null>;
  pickModFiles: () => Promise<string[]>;
  pickModFolders: () => Promise<string[]>;
  /** バニラ data フォルダの mods.cfg (ゲームで有効な mod と読み込み順) から mod ファイルを探す */
  resolveEnabledMods: () => Promise<EnabledModsResult | null>;
  revealFileInFolder: (filePath: string) => Promise<void>;
  saveExportOptions: (options: ExportOptions) => Promise<void>;
  saveLastTargetPaths: (paths: readonly string[]) => Promise<void>;
  saveReferencePaths: (paths: readonly string[]) => Promise<void>;
  saveVanillaDataPath: (dataPath: string) => Promise<VanillaPickResult>;
}
