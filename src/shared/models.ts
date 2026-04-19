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

export const modHeaderSchema = z.object({
  author: z.string(),
  dependencies: z.array(z.string()),
  description: z.string(),
  fileType: z.number().int(),
  references: z.array(z.string()),
  version: z.number().int(),
});

export const recordCountsSchema = z.object({
  bools: z.number().int(),
  files: z.number().int(),
  floats: z.number().int(),
  instances: z.number().int(),
  ints: z.number().int(),
  referenceCategories: z.number().int(),
  references: z.number().int(),
  strings: z.number().int(),
  vector3s: z.number().int(),
  vector4s: z.number().int(),
});

export const inspectorRecordSchema = z.object({
  counts: recordCountsSchema,
  modName: z.string(),
  name: z.string(),
  stringId: z.string(),
  strings: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    }),
  ),
  type: z.number().int(),
  uid: z.string(),
});

export const loadedModSchema = z.object({
  fileName: z.string(),
  filePath: z.string(),
  header: modHeaderSchema,
  recordCount: z.number().int(),
});

export const translationProjectSchema = z.object({
  dependencies: z.array(z.string()),
  inspectorRecords: z.array(inspectorRecordSchema),
  mods: z.array(loadedModSchema),
  records: z.array(translationRecordSchema),
  sourceModName: z.string(),
});

export type DialogRecord = z.infer<typeof dialogRecordSchema>;
export type DialogText = z.infer<typeof dialogTextSchema>;
export type EntityRecord = z.infer<typeof entityRecordSchema>;
export type InspectorRecord = z.infer<typeof inspectorRecordSchema>;
export type LoadedMod = z.infer<typeof loadedModSchema>;
export type ModHeader = z.infer<typeof modHeaderSchema>;
export type RecordCounts = z.infer<typeof recordCountsSchema>;
export type TranslationProject = z.infer<typeof translationProjectSchema>;
export type TranslationRecord = z.infer<typeof translationRecordSchema>;
