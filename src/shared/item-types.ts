export interface ItemTypeDefinition {
  category: ItemCategory;
  code: number;
  englishName: string;
  label: string;
  textRelevant: boolean;
}

export type ItemCategory =
  | 'ai'
  | 'character'
  | 'dialog'
  | 'equipment'
  | 'faction'
  | 'gamestate'
  | 'item'
  | 'other'
  | 'research'
  | 'ui'
  | 'visual'
  | 'world';

export const itemCategoryLabels: Record<ItemCategory, string> = {
  ai: 'AI',
  character: 'キャラクター',
  dialog: 'ダイアログ',
  equipment: '装備',
  faction: '派閥',
  gamestate: 'ゲーム状態',
  item: 'アイテム',
  other: 'その他',
  research: '研究',
  ui: 'UI',
  visual: 'ビジュアル',
  world: 'ワールド',
};

export const itemTypeDefinitions: readonly ItemTypeDefinition[] = [
  { category: 'world', code: 0, englishName: 'Building', label: '建物', textRelevant: true },
  { category: 'character', code: 1, englishName: 'Character', label: 'キャラクター', textRelevant: true },
  { category: 'equipment', code: 2, englishName: 'Weapon', label: '武器', textRelevant: true },
  { category: 'equipment', code: 3, englishName: 'Armour', label: '防具', textRelevant: true },
  { category: 'item', code: 4, englishName: 'Item', label: 'アイテム', textRelevant: true },
  { category: 'visual', code: 5, englishName: 'AnimalAnimation', label: '動物アニメ', textRelevant: false },
  { category: 'equipment', code: 6, englishName: 'Attachment', label: 'アタッチメント', textRelevant: false },
  { category: 'character', code: 7, englishName: 'Race', label: '種族', textRelevant: true },
  { category: 'world', code: 8, englishName: 'Location', label: 'ロケーション', textRelevant: false },
  { category: 'gamestate', code: 9, englishName: 'WarSavestate', label: '戦争状態', textRelevant: false },
  { category: 'faction', code: 10, englishName: 'Faction', label: '派閥', textRelevant: true },
  { category: 'other', code: 11, englishName: 'NullItem', label: '未使用', textRelevant: false },
  { category: 'world', code: 12, englishName: 'ZoneMap', label: 'ゾーンマップ', textRelevant: false },
  { category: 'world', code: 13, englishName: 'Town', label: '街', textRelevant: true },
  { category: 'world', code: 14, englishName: 'WorldmapCharacter', label: 'マップキャラ', textRelevant: false },
  { category: 'visual', code: 15, englishName: 'CharacterAppearanceOld', label: '旧外観', textRelevant: false },
  { category: 'character', code: 16, englishName: 'LocationalDamage', label: '部位ダメージ', textRelevant: false },
  { category: 'character', code: 17, englishName: 'CombatTechnique', label: '戦闘技術', textRelevant: false },
  { category: 'dialog', code: 18, englishName: 'Dialogue', label: 'ダイアログ親', textRelevant: false },
  { category: 'dialog', code: 19, englishName: 'DialogueLine', label: 'セリフ', textRelevant: true },
  { category: 'research', code: 20, englishName: 'Techtree', label: '技術ツリー', textRelevant: false },
  { category: 'research', code: 21, englishName: 'Research', label: '研究', textRelevant: true },
  { category: 'ai', code: 22, englishName: 'AiTask', label: 'AIタスク', textRelevant: false },
  { category: 'ai', code: 23, englishName: 'AiState', label: 'AI状態', textRelevant: false },
  { category: 'visual', code: 24, englishName: 'Animation', label: 'アニメーション', textRelevant: false },
  { category: 'character', code: 25, englishName: 'Stats', label: 'ステータス', textRelevant: false },
  { category: 'character', code: 26, englishName: 'Personality', label: '性格', textRelevant: false },
  { category: 'other', code: 27, englishName: 'Constants', label: '定数', textRelevant: false },
  { category: 'world', code: 28, englishName: 'Biomes', label: 'バイオーム', textRelevant: false },
  { category: 'world', code: 29, englishName: 'BuildingPart', label: '建物パーツ', textRelevant: false },
  { category: 'world', code: 30, englishName: 'InstanceCollection', label: 'インスタンス群', textRelevant: false },
  { category: 'dialog', code: 31, englishName: 'DialogAction', label: 'ダイアログ操作', textRelevant: false },
  { category: 'other', code: 32, englishName: 'TemporaryInfo', label: '一時情報', textRelevant: false },
  { category: 'other', code: 33, englishName: 'ModFilename', label: 'modファイル名', textRelevant: false },
  { category: 'faction', code: 34, englishName: 'Platoon', label: '小隊', textRelevant: false },
  { category: 'gamestate', code: 35, englishName: 'GamestateBuilding', label: '建物状態', textRelevant: false },
  { category: 'gamestate', code: 36, englishName: 'GamestateCharacter', label: 'キャラ状態', textRelevant: false },
  { category: 'gamestate', code: 37, englishName: 'GamestateFaction', label: '派閥状態', textRelevant: false },
  { category: 'gamestate', code: 38, englishName: 'GamestateTownInstanceList', label: '街状態リスト', textRelevant: false },
  { category: 'gamestate', code: 39, englishName: 'State', label: '状態', textRelevant: false },
  { category: 'gamestate', code: 40, englishName: 'SavedState', label: '保存状態', textRelevant: false },
  { category: 'gamestate', code: 41, englishName: 'InventoryState', label: 'インベントリ状態', textRelevant: false },
  { category: 'gamestate', code: 42, englishName: 'InventoryItemState', label: 'アイテム状態', textRelevant: false },
  { category: 'world', code: 43, englishName: 'RepeatableBuildingPartSlot', label: '反復建物パーツ', textRelevant: false },
  { category: 'item', code: 44, englishName: 'MaterialSpec', label: '素材仕様', textRelevant: false },
  { category: 'item', code: 45, englishName: 'MaterialSpecsCollection', label: '素材仕様群', textRelevant: false },
  { category: 'item', code: 46, englishName: 'Container', label: 'コンテナ', textRelevant: true },
  { category: 'equipment', code: 47, englishName: 'MaterialSpecsClothing', label: '衣服素材仕様', textRelevant: false },
  { category: 'gamestate', code: 48, englishName: 'GamestateBuildingInterior', label: '建物内部状態', textRelevant: false },
  { category: 'item', code: 49, englishName: 'VendorList', label: '業者リスト', textRelevant: false },
  { category: 'equipment', code: 50, englishName: 'MaterialSpecsWeapon', label: '武器素材仕様', textRelevant: false },
  { category: 'equipment', code: 51, englishName: 'WeaponManufacturer', label: '武器製造元', textRelevant: true },
  { category: 'faction', code: 52, englishName: 'SquadTemplate', label: '分隊テンプレ', textRelevant: false },
  { category: 'world', code: 53, englishName: 'Road', label: '道路', textRelevant: false },
  { category: 'world', code: 54, englishName: 'LocationNode', label: 'ロケーションノード', textRelevant: false },
  { category: 'visual', code: 55, englishName: 'ColorData', label: '色データ', textRelevant: false },
  { category: 'visual', code: 56, englishName: 'Camera', label: 'カメラ', textRelevant: false },
  { category: 'character', code: 57, englishName: 'MedicalState', label: '医療状態', textRelevant: false },
  { category: 'character', code: 58, englishName: 'MedicalPartState', label: '部位医療状態', textRelevant: false },
  { category: 'world', code: 59, englishName: 'FoliageLayer', label: '植生レイヤ', textRelevant: false },
  { category: 'world', code: 60, englishName: 'FoliageMesh', label: '植生メッシュ', textRelevant: false },
  { category: 'world', code: 61, englishName: 'Grass', label: '草', textRelevant: false },
  { category: 'world', code: 62, englishName: 'BuildingFunctionality', label: '建物機能', textRelevant: true },
  { category: 'ai', code: 63, englishName: 'DaySchedule', label: '日中スケジュール', textRelevant: false },
  { category: 'other', code: 64, englishName: 'NewGameStartoff', label: 'ゲーム開始設定', textRelevant: true },
  { category: 'gamestate', code: 65, englishName: 'GamestateCrafting', label: 'クラフト状態', textRelevant: false },
  { category: 'visual', code: 66, englishName: 'CharacterAppearance', label: '外観', textRelevant: false },
  { category: 'gamestate', code: 67, englishName: 'GamestateAi', label: 'AI状態', textRelevant: false },
  { category: 'world', code: 68, englishName: 'WildlifeBirds', label: '野生鳥類', textRelevant: false },
  { category: 'world', code: 69, englishName: 'MapFeatures', label: '地図特徴', textRelevant: false },
  { category: 'faction', code: 70, englishName: 'DiplomaticAssaults', label: '外交攻撃群', textRelevant: false },
  { category: 'faction', code: 71, englishName: 'SingleDiplomaticAssault', label: '外交攻撃', textRelevant: false },
  { category: 'ai', code: 72, englishName: 'AiPackage', label: 'AIパッケージ', textRelevant: false },
  { category: 'dialog', code: 73, englishName: 'DialoguePackage', label: 'ダイアログパッケージ', textRelevant: false },
  { category: 'equipment', code: 74, englishName: 'GunData', label: '銃データ', textRelevant: false },
  { category: 'character', code: 75, englishName: 'HumanCharacter', label: '人間キャラ', textRelevant: false },
  { category: 'character', code: 76, englishName: 'AnimalCharacter', label: '動物キャラ', textRelevant: true },
  { category: 'faction', code: 77, englishName: 'UniqueSquadTemplate', label: '固有分隊テンプレ', textRelevant: false },
  { category: 'faction', code: 78, englishName: 'FactionTemplate', label: '派閥テンプレ', textRelevant: false },
  { category: 'ai', code: 79, englishName: 'AiSchedule', label: 'AIスケジュール', textRelevant: false },
  { category: 'world', code: 80, englishName: 'Weather', label: '天候', textRelevant: false },
  { category: 'world', code: 81, englishName: 'Season', label: '季節', textRelevant: false },
  { category: 'visual', code: 82, englishName: 'Effect', label: 'エフェクト', textRelevant: false },
  { category: 'item', code: 83, englishName: 'ItemPlacementGroup', label: 'アイテム配置群', textRelevant: false },
  { category: 'dialog', code: 84, englishName: 'WordSwaps', label: '単語置換', textRelevant: false },
  { category: 'world', code: 85, englishName: 'Nest', label: '巣', textRelevant: false },
  { category: 'world', code: 86, englishName: 'NestItem', label: '巣アイテム', textRelevant: false },
  { category: 'character', code: 87, englishName: 'CharacterPhysicsAttachment', label: '物理アタッチ', textRelevant: false },
  { category: 'visual', code: 88, englishName: 'Light', label: '光源', textRelevant: false },
  { category: 'character', code: 89, englishName: 'Head', label: '頭部', textRelevant: false },
  { category: 'world', code: 90, englishName: 'Blueprint', label: '設計図', textRelevant: false },
  { category: 'faction', code: 91, englishName: 'ShopTraderClass', label: '商人クラス', textRelevant: false },
  { category: 'world', code: 92, englishName: 'FoliageBuilding', label: '植生建物', textRelevant: false },
  { category: 'faction', code: 93, englishName: 'FactionCampaign', label: '派閥キャンペーン', textRelevant: false },
  { category: 'gamestate', code: 94, englishName: 'GamestateTown', label: '街状態', textRelevant: false },
  { category: 'world', code: 95, englishName: 'BiomeGroup', label: 'バイオーム群', textRelevant: false },
  { category: 'visual', code: 96, englishName: 'EffectFogVolume', label: '霧エフェクト', textRelevant: false },
  { category: 'world', code: 97, englishName: 'FarmData', label: '農場データ', textRelevant: false },
  { category: 'world', code: 98, englishName: 'FarmPart', label: '農場パーツ', textRelevant: false },
  { category: 'world', code: 99, englishName: 'EnvironmentResources', label: '環境資源', textRelevant: false },
  { category: 'character', code: 100, englishName: 'RaceGroup', label: '種族グループ', textRelevant: false },
  { category: 'item', code: 101, englishName: 'Artifacts', label: 'アーティファクト', textRelevant: false },
  { category: 'world', code: 102, englishName: 'MapItem', label: '地図アイテム', textRelevant: false },
  { category: 'world', code: 103, englishName: 'BuildingsSwap', label: '建物スワップ', textRelevant: false },
  { category: 'item', code: 104, englishName: 'ItemsCulture', label: 'アイテム文化', textRelevant: false },
  { category: 'visual', code: 105, englishName: 'AnimationEvent', label: 'アニメイベント', textRelevant: false },
  { category: 'ui', code: 106, englishName: 'Tutorial', label: 'チュートリアル', textRelevant: false },
  { category: 'equipment', code: 107, englishName: 'Crossbow', label: 'クロスボウ', textRelevant: true },
  { category: 'world', code: 108, englishName: 'TerrainDecals', label: '地形デカール', textRelevant: false },
  { category: 'world', code: 109, englishName: 'AmbientSound', label: '環境音', textRelevant: false },
  { category: 'gamestate', code: 110, englishName: 'WorldEventState', label: 'ワールドイベント状態', textRelevant: false },
  { category: 'equipment', code: 111, englishName: 'LimbReplacement', label: '義肢', textRelevant: true },
  { category: 'visual', code: 112, englishName: 'AnimationFile', label: 'アニメファイル', textRelevant: false },
  { category: 'equipment', code: 113, englishName: 'Boat', label: 'ボート', textRelevant: false },
  { category: 'gamestate', code: 114, englishName: 'GamestateBoat', label: 'ボート状態', textRelevant: false },
  { category: 'world', code: 115, englishName: 'BuildGrid', label: '建築グリッド', textRelevant: false },
  { category: 'world', code: 116, englishName: 'BuildingShell', label: '建物外殻', textRelevant: false },
];

const itemTypeByCode = new Map<number, ItemTypeDefinition>();
for (const definition of itemTypeDefinitions) {
  itemTypeByCode.set(definition.code, definition);
}

export const getItemTypeDefinition = (
  code: number,
): ItemTypeDefinition | undefined => itemTypeByCode.get(code);

export const getItemTypeLabel = (code: number) => {
  const definition = itemTypeByCode.get(code);
  return definition ? definition.label : `未知の種別(${code})`;
};

export const getItemTypeEnglishName = (code: number) => {
  const definition = itemTypeByCode.get(code);
  return definition ? definition.englishName : `Unknown(${code})`;
};

export const isTextRelevantItemType = (code: number) => {
  const definition = itemTypeByCode.get(code);
  return definition ? definition.textRelevant : false;
};

export const getItemCategory = (code: number): ItemCategory => {
  const definition = itemTypeByCode.get(code);
  return definition ? definition.category : 'other';
};
