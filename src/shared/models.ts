import { z } from 'zod';

export const dialogTextSchema = z.object({
  original: z.string(),
  textId: z.string(),
  translation: z.string(),
});

const baseRecordSchema = z.object({
  name: z.string(),
  stringId: z.string(),
  type: z.number().int(),
  wordswapMap: z.array(z.string()),
});

export const dialogRecordSchema = baseRecordSchema.extend({
  kind: z.literal('dialog'),
  texts: z.array(dialogTextSchema),
});

export const entityRecordSchema = baseRecordSchema.extend({
  description: z.string(),
  descriptionTranslation: z.string(),
  kind: z.literal('entity'),
  nameTranslation: z.string(),
});

export const translationRecordSchema = z.discriminatedUnion('kind', [
  dialogRecordSchema,
  entityRecordSchema,
]);

export const translationProjectSchema = z.object({
  dependencies: z.array(z.string()),
  records: z.array(translationRecordSchema),
  replaceWordSwap: z.boolean(),
  sourceModName: z.string(),
});

export const exportOptionsSchema = z.object({
  includeDescriptions: z.boolean(),
  includeDialogs: z.boolean(),
  includeNames: z.boolean(),
});

export type DialogRecord = z.infer<typeof dialogRecordSchema>;
export type DialogText = z.infer<typeof dialogTextSchema>;
export type EntityRecord = z.infer<typeof entityRecordSchema>;
export type ExportOptions = z.infer<typeof exportOptionsSchema>;
export type TranslationProject = z.infer<typeof translationProjectSchema>;
export type TranslationRecord = z.infer<typeof translationRecordSchema>;

