import { z } from 'zod';

export const dialogTextSchema = z.object({
  original: z.string(),
  textId: z.string(),
});

export const itemSaveDataSchema = z.object({
  changeType: z.number().int(),
  changeTypeName: z.string(),
  raw: z.number().int(),
  saveCount: z.number().int(),
});

const baseTextRecordSchema = z.object({
  modName: z.string(),
  name: z.string(),
  saveData: itemSaveDataSchema,
  stringId: z.string(),
  type: z.number().int(),
});

export const dialogRecordSchema = baseTextRecordSchema.extend({
  kind: z.literal('dialog'),
  texts: z.array(dialogTextSchema),
});

export const entityRecordSchema = baseTextRecordSchema.extend({
  description: z.string(),
  kind: z.literal('entity'),
});

export const textRecordSchema = z.discriminatedUnion('kind', [
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

export const keyedBooleanValueSchema = z.object({
  key: z.string(),
  value: z.boolean(),
});

export const keyedNumberValueSchema = z.object({
  key: z.string(),
  value: z.number(),
});

export const keyedVector3ValueSchema = z.object({
  key: z.string(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const keyedVector4ValueSchema = keyedVector3ValueSchema.extend({
  w: z.number(),
});

export const keyedFileValueSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const instanceValueSchema = z.object({
  key: z.string(),
  states: z.array(z.string()),
  targetId: z.string(),
  values: z.array(z.number()),
});

export const recordValuesSchema = z.object({
  bools: z.array(keyedBooleanValueSchema),
  files: z.array(keyedFileValueSchema),
  floats: z.array(keyedNumberValueSchema),
  ints: z.array(keyedNumberValueSchema),
  instances: z.array(instanceValueSchema),
  vector3s: z.array(keyedVector3ValueSchema),
  vector4s: z.array(keyedVector4ValueSchema),
});

export const referenceSchema = z.object({
  targetId: z.string(),
  value0: z.number().int(),
  value1: z.number().int(),
  value2: z.number().int(),
});

export const referenceCategorySchema = z.object({
  name: z.string(),
  references: z.array(referenceSchema),
});

export const inspectorRecordSchema = z.object({
  counts: recordCountsSchema,
  modName: z.string(),
  name: z.string(),
  referenceCategories: z.array(referenceCategorySchema),
  saveData: itemSaveDataSchema,
  stringId: z.string(),
  strings: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    }),
  ),
  type: z.number().int(),
  uid: z.string(),
  values: recordValuesSchema,
});

export const loadedModSchema = z.object({
  fileName: z.string(),
  filePath: z.string(),
  header: modHeaderSchema,
  recordCount: z.number().int(),
  role: z.enum(['target', 'reference']),
});

export const modProjectSchema = z.object({
  contextRecords: z.array(inspectorRecordSchema).default([]),
  contextTextRecords: z.array(textRecordSchema).default([]),
  dependencies: z.array(z.string()),
  inspectorRecords: z.array(inspectorRecordSchema),
  mods: z.array(loadedModSchema),
  sourceModName: z.string(),
  textRecords: z.array(textRecordSchema),
});

export type DialogRecord = z.infer<typeof dialogRecordSchema>;
export type DialogText = z.infer<typeof dialogTextSchema>;
export type EntityRecord = z.infer<typeof entityRecordSchema>;
export type InstanceValue = z.infer<typeof instanceValueSchema>;
export type InspectorRecord = z.infer<typeof inspectorRecordSchema>;
export type ItemSaveData = z.infer<typeof itemSaveDataSchema>;
export type KeyedFileValue = z.infer<typeof keyedFileValueSchema>;
export type KeyedVector3Value = z.infer<typeof keyedVector3ValueSchema>;
export type KeyedVector4Value = z.infer<typeof keyedVector4ValueSchema>;
export type LoadedMod = z.infer<typeof loadedModSchema>;
export type ModHeader = z.infer<typeof modHeaderSchema>;
export type ModProject = z.infer<typeof modProjectSchema>;
export type RecordCounts = z.infer<typeof recordCountsSchema>;
export type RecordValues = z.infer<typeof recordValuesSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type ReferenceCategory = z.infer<typeof referenceCategorySchema>;
export type TextRecord = z.infer<typeof textRecordSchema>;
