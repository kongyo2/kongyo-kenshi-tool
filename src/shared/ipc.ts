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

export type LoadModsRequest = z.infer<typeof loadModsRequestSchema>;
export type SaveTranslationModRequest = z.infer<
  typeof saveTranslationModRequestSchema
>;
export type SaveTranslationModResponse = z.infer<
  typeof saveTranslationModResponseSchema
>;

export interface ElectronApi {
  pickModFiles: () => Promise<string[]>;
  pickModFolders: () => Promise<string[]>;
  loadMods: (
    input: LoadModsRequest,
  ) => Promise<z.infer<typeof translationProjectSchema>>;
  saveTranslationMod: (
    input: SaveTranslationModRequest,
  ) => Promise<SaveTranslationModResponse>;
  revealFileInFolder: (filePath: string) => Promise<void>;
}
