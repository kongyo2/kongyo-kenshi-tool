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
  canceled: z.boolean(),
  filePath: z.string().nullable(),
});

export const appSettingsSchema = z.object({
  vanillaDataPath: z.string().nullable().default(null),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type ExportModMarkdownRequest = z.infer<
  typeof exportModMarkdownRequestSchema
>;
export type ExportModMarkdownResponse = z.infer<
  typeof exportModMarkdownResponseSchema
>;
export type LoadModsRequest = z.infer<typeof loadModsRequestSchema>;

export interface ElectronApi {
  exportModMarkdown: (
    input: ExportModMarkdownRequest,
  ) => Promise<ExportModMarkdownResponse>;
  getPathForFile: (file: File) => string;
  getVanillaDataPath: () => Promise<string | null>;
  loadMods: (input: LoadModsRequest) => Promise<z.infer<typeof modProjectSchema>>;
  pickModFiles: () => Promise<string[]>;
  pickModFolders: () => Promise<string[]>;
  pickAndSaveVanillaDataPath: () => Promise<string | null>;
  revealFileInFolder: (filePath: string) => Promise<void>;
}
