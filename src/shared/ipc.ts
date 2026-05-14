import { z } from 'zod';
import { modProjectSchema } from './models.ts';

export const loadModsRequestSchema = z.object({
  paths: z.array(z.string()).min(1),
  referencePaths: z.array(z.string()).default([]),
});

export const exportModMarkdownRequestSchema = z.object({
  project: modProjectSchema,
});

export const exportModMarkdownResponseSchema = z.object({
  byteCount: z.number().int().nonnegative().nullable(),
  canceled: z.boolean(),
  filePath: z.string().nullable(),
});

export const appSettingsSchema = z.object({
  referencePaths: z.array(z.string()).default([]),
  vanillaDataPath: z.string().nullable().default(null),
});

export const vanillaPickResultSchema = z.object({
  hasGamedata: z.boolean(),
  path: z.string(),
});

export const loadProgressSchema = z.object({
  current: z.number().int().nonnegative(),
  currentFile: z.string(),
  phase: z.enum(['target', 'reference']),
  total: z.number().int().positive(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type ExportModMarkdownRequest = z.infer<
  typeof exportModMarkdownRequestSchema
>;
export type ExportModMarkdownResponse = z.infer<
  typeof exportModMarkdownResponseSchema
>;
export type LoadModsRequest = z.infer<typeof loadModsRequestSchema>;
export type LoadProgress = z.infer<typeof loadProgressSchema>;
export type VanillaPickResult = z.infer<typeof vanillaPickResultSchema>;

export interface ElectronApi {
  exportModMarkdown: (
    input: ExportModMarkdownRequest,
  ) => Promise<ExportModMarkdownResponse>;
  getAppSettings: () => Promise<AppSettings>;
  getPathForFile: (file: File) => string;
  loadMods: (input: LoadModsRequest) => Promise<z.infer<typeof modProjectSchema>>;
  onLoadProgress: (callback: (progress: LoadProgress) => void) => () => void;
  pickAndSaveVanillaDataPath: () => Promise<VanillaPickResult | null>;
  pickModFiles: () => Promise<string[]>;
  pickModFolders: () => Promise<string[]>;
  revealFileInFolder: (filePath: string) => Promise<void>;
  saveReferencePaths: (paths: readonly string[]) => Promise<void>;
}
