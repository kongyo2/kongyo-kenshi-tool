import { z } from 'zod';
import { translationProjectSchema } from './models.ts';

export const loadModsRequestSchema = z.object({
  paths: z.array(z.string()).min(1),
});

export const saveTranslationModRequestSchema = z.object({
  project: translationProjectSchema,
});

export const saveTranslationModResponseSchema = z.object({
  canceled: z.boolean(),
  filePath: z.string().nullable(),
});

export const importTranslationJsonResponseSchema = z.object({
  canceled: z.boolean(),
  payload: z.string().nullable(),
});

export const exportTranslationJsonRequestSchema = z.object({
  fileName: z.string(),
  payload: z.string(),
});

export const exportTranslationJsonResponseSchema = z.object({
  canceled: z.boolean(),
  filePath: z.string().nullable(),
});

export type ExportTranslationJsonRequest = z.infer<
  typeof exportTranslationJsonRequestSchema
>;
export type ExportTranslationJsonResponse = z.infer<
  typeof exportTranslationJsonResponseSchema
>;
export type ImportTranslationJsonResponse = z.infer<
  typeof importTranslationJsonResponseSchema
>;
export type LoadModsRequest = z.infer<typeof loadModsRequestSchema>;
export type SaveTranslationModRequest = z.infer<
  typeof saveTranslationModRequestSchema
>;
export type SaveTranslationModResponse = z.infer<
  typeof saveTranslationModResponseSchema
>;

export interface ElectronApi {
  exportTranslationJson: (
    input: ExportTranslationJsonRequest,
  ) => Promise<ExportTranslationJsonResponse>;
  getPathForFile: (file: File) => string;
  importTranslationJson: () => Promise<ImportTranslationJsonResponse>;
  loadMods: (
    input: LoadModsRequest,
  ) => Promise<z.infer<typeof translationProjectSchema>>;
  pickModFiles: () => Promise<string[]>;
  pickModFolders: () => Promise<string[]>;
  revealFileInFolder: (filePath: string) => Promise<void>;
  saveTranslationMod: (
    input: SaveTranslationModRequest,
  ) => Promise<SaveTranslationModResponse>;
}
