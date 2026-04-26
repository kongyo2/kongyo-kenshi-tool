import {
  getItemCategory,
  getItemTypeEnglishName,
  getItemTypeLabel,
  itemCategoryLabels,
  type ItemCategory,
} from './item-types.ts';
import type {
  DialogRecord,
  EntityRecord,
  InspectorRecord,
  LoadedMod,
  ModProject,
  Reference,
  ReferenceCategory,
} from './models.ts';

const formatNumber = (value: number) => value.toLocaleString('en-US');
const dialogueTypeCode = 18;
const dialogueLineTypeCode = 19;
const dialogActionTypeCode = 31;
const dialoguePackageTypeCode = 73;
const maxDialogLineRenderDepth = 24;

const formatFloatValue = (value: number) => {
  const rounded = Number(value.toFixed(6));
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
};

const dialogActionLabels: Record<number, string> = {
  0: 'DialogActionEnum.DA_NONE',
  1: 'DialogActionEnum.DA_TRADE',
  2: 'DialogActionEnum.DA_TALK_TO_LEADER',
  3: 'DialogActionEnum.DA_JOIN_SQUAD_WITH_EDIT',
  4: 'DialogActionEnum.DA_AFFECT_RELATIONS',
  5: 'DialogActionEnum.DA_AFFECT_REPUTATION',
  6: 'DialogActionEnum.DA_ATTACK_CHASE_FOREVER',
  7: 'DialogActionEnum.DA_GO_HOME',
  8: 'DialogActionEnum.DA_TAKE_MONEY',
  9: 'DialogActionEnum.DA_GIVE_MONEY',
  10: 'DialogActionEnum.DA_PAY_BOUNTY',
  11: 'DialogActionEnum.DA_CHARACTER_EDITOR',
  12: 'DialogActionEnum.DA_FORCE_SPEECH_TIMER',
  13: 'DialogActionEnum.DA_DECLARE_WAR',
  14: 'DialogActionEnum.DA_END_WAR',
  15: 'DialogActionEnum.DA_CLEAR_AI',
  16: 'DialogActionEnum.DA_FOLLOW_WHILE_TALKING',
  17: 'DialogActionEnum.DA_THUG_HUNTER',
  18: 'DialogActionEnum.DA_JOIN_SQUAD_FAST',
  19: 'DialogActionEnum.DA_REMEMBER_CHARACTER',
  20: 'DialogActionEnum.DA_FLAG_TEMP_ALLY',
  21: 'DialogActionEnum.DA_FLAG_TEMP_ENEMY',
  22: 'DialogActionEnum.DA_MATES_KILL_ME',
  23: 'DialogActionEnum.DA_MAKE_TARGET_RUN_FASTER',
  24: 'DialogActionEnum.DA_GIVE_TARGET_MY_SLAVES',
  25: 'DialogActionEnum.DA_TAG_ESCAPED_SLAVE',
  26: 'DialogActionEnum.DA_FREE_TARGET_SLAVE',
  27: 'DialogActionEnum.DA_MERGE_WITH_SIMILAR_SQUADS',
  28: 'DialogActionEnum.DA_SEPARATE_TO_MY_OWN_SQUAD',
  29: 'DialogActionEnum.DA_ARREST_TARGET',
  30: 'DialogActionEnum.DA_ARREST_TARGETS_CARRIED_PERSON',
  31: 'DialogActionEnum.DA_ATTACK_TOWN',
  32: 'DialogActionEnum.DA_ASSIGN_BOUNTY',
  33: 'DialogActionEnum.DA_CRIME_ALARM',
  34: 'DialogActionEnum.DA_RUN_AWAY',
  35: 'DialogActionEnum.DA_INCREASE_FACTION_RANK',
  36: 'DialogActionEnum.DA_LOCK_THIS_DIALOG',
  37: 'DialogActionEnum.DA_ASSAULT_PHASE',
  38: 'DialogActionEnum.DA_RETREAT_PHASE',
  39: 'DialogActionEnum.DA_VICTORY_PHASE',
  40: 'DialogActionEnum.DA_ENSLAVE_TARGETS_CARRIED_PERSON',
  41: 'DialogActionEnum.CHOOSE_SLAVES_SELLING',
  42: 'DialogActionEnum.CHOOSE_SLAVES_BUYING',
  43: 'DialogActionEnum.CHOOSE_PRISONER_BAIL',
  44: 'DialogActionEnum.CHOOSE_CONSCRIPTION',
  45: 'DialogActionEnum.CHOOSE_RECRUITING',
  46: 'DialogActionEnum.CHOOSE_HIRING_CONTRACT',
  47: 'DialogActionEnum.SURRENDER_NON_HUMANS',
  48: 'DialogActionEnum.CHOOSE_ANIMALS_BUYING',
  49: 'DialogActionEnum.DA_CLEAR_BOUNTY',
  50: 'DialogActionEnum.DA_PLAYER_SELL_PRISONERS',
  51: 'DialogActionEnum.DA_PLAYER_SURRENDER_MEMBER_DIFFERENT_RACE',
  52: 'DialogActionEnum.DA_SUMMON_MY_SQUAD',
  53: 'DialogActionEnum.DA_REMOVE_SLAVE_STATUS',
  54: 'DialogActionEnum.DA_OPEN_NEAREST_GATE',
  55: 'DialogActionEnum.DA_ATTACK_STAY_NEAR_HOME',
  56: 'DialogActionEnum.DA_MASSIVE_ALARM',
  57: 'DialogActionEnum.DA_ATTACK_IF_NO_COEXIST',
  58: 'DialogActionEnum.DA_KNOCKOUT',
  59: 'DialogActionEnum.DA_END',
};

const dialogConditionLabels: Record<number, string> = {
  0: 'DialogConditionEnum.DC_NONE',
  1: 'DialogConditionEnum.DC_RELATIONS',
  2: 'DialogConditionEnum.DC_PLAYERMONEY',
  3: 'DialogConditionEnum.DC_REPUTATION',
  4: 'DialogConditionEnum.DC_CARRYING_BOUNTY_ALIVE',
  5: 'DialogConditionEnum.DC_CARRYING_BOUNTY_DEAD',
  6: 'DialogConditionEnum.DC_FACTION_VARIABLE',
  7: 'DialogConditionEnum.DC_IMPRISONED_BY_TARGET',
  8: 'DialogConditionEnum.DC_IMPRISONED_BY_OTHER',
  9: 'DialogConditionEnum.DC_IS_A_TRADER',
  10: 'DialogConditionEnum.DC_FACTION_RANK',
  11: 'DialogConditionEnum.DC_BUILDING_IS_CLOSED_AND_SECURED',
  12: 'DialogConditionEnum.DC_PLAYER_TECH_LEVEL',
  13: 'DialogConditionEnum.DC_NUM_DIALOG_EVENT_REPEATS',
  14: 'DialogConditionEnum.DC_IS_IMPRISONED',
  15: 'DialogConditionEnum.DC_IMPRISONMENT_IS_DEATHROW',
  16: 'DialogConditionEnum.DC_TARGET_IN_TALKING_RANGE',
  17: 'DialogConditionEnum.DC_IN_MY_BUILDING',
  18: 'DialogConditionEnum.DC_TARGET_LAST_SEEN_X_HOURS_AGO',
  19: 'DialogConditionEnum.DC_IS_LEADER',
  20: 'DialogConditionEnum.DC_MET_TARGET_BEFORE',
  21: 'DialogConditionEnum.DC_WEAKER_THAN_ME',
  22: 'DialogConditionEnum.DC_STRONGER_THAN_ME',
  23: 'DialogConditionEnum.DC_HAS_TAG',
  24: 'DialogConditionEnum.DC_IS_ALLY',
  25: 'DialogConditionEnum.DC_IS_ENEMY',
  26: 'DialogConditionEnum.DC_PERSONALITY_TAG',
  27: 'DialogConditionEnum.DC_BROKEN_LEG',
  28: 'DialogConditionEnum.DC_BROKEN_ARM',
  29: 'DialogConditionEnum.DC_DAMAGED_HEAD',
  30: 'DialogConditionEnum.DC_NEARLY_KO',
  31: 'DialogConditionEnum.DC_IN_A_NON_PLAYER_TOWN',
  32: 'DialogConditionEnum.DC_IS_RUNNING',
  33: 'DialogConditionEnum.DC_COPS_AROUND',
  34: 'DialogConditionEnum.NULL_NULL_____DC_TARGET_SQUAD_SIZE',
  35: 'DialogConditionEnum.DC_SQUAD_SIZE',
  36: 'DialogConditionEnum.DC_IS_PLAYER',
  37: 'DialogConditionEnum.DC_NUM_BACKPACKS',
  38: 'DialogConditionEnum.DC_SQUAD_ONLY_ANIMALS',
  39: 'DialogConditionEnum.DC_IS_OUTNUMBERED',
  40: 'DialogConditionEnum.DC_BOUNTY_AMOUNT_PERCEIVED',
  41: 'DialogConditionEnum.DC_IS_KO',
  42: 'DialogConditionEnum.DC_IS_NEARLY_KO',
  43: 'DialogConditionEnum.DC_SQUAD_IS_DOWN',
  44: 'DialogConditionEnum.DC_IS_DEAD',
  45: 'DialogConditionEnum.DC_IS_FEMALE',
  46: 'DialogConditionEnum.DC_CARRYING_SOMEONE_TO_ENSLAVE',
  47: 'DialogConditionEnum.DC_BOUNTY_AMOUNT_ACTUAL',
  48: 'DialogConditionEnum.DC_IM_UNARMED',
  49: 'DialogConditionEnum.DC_TOWN_HAS_FORTIFICATIONS_WALLS',
  50: 'DialogConditionEnum.DC_TARGET_IS_MY_MISSION_TARGET',
  51: 'DialogConditionEnum.DC_MY_MISSION_IS_FRIENDLY',
  52: 'DialogConditionEnum.DC_I_LOVE_THIS_GUY',
  53: 'DialogConditionEnum.DC_I_HATE_THIS_GUY',
  54: 'DialogConditionEnum.DC_I_SHOULD_SCREW_THIS_GUY_OVER',
  55: 'DialogConditionEnum.DC_I_SHOULD_HELP_THIS_GUY',
  56: 'DialogConditionEnum.DC_IN_COMBAT',
  57: 'DialogConditionEnum.DC_WITHIN_TOWN_WALLS',
  58: 'DialogConditionEnum.DC_TOWN_WALLS_LOCKED_UP',
  59: 'DialogConditionEnum.DC_IS_SLAVE',
  60: 'DialogConditionEnum.DC_HAS_A_BASE_NEARBY',
  61: 'DialogConditionEnum.DC_TARGET_IS_SLAVE_OF_MY_FACTION',
  62: 'DialogConditionEnum.DC_IS_ESCAPED_SLAVE',
  63: 'DialogConditionEnum.DC_IS_IN_LOCKED_CAGE',
  64: 'DialogConditionEnum.DC_WEARING_LOCKED_SHACKLES',
  65: 'DialogConditionEnum.DC_IS_SAME_RACE_AS_ME',
  66: 'DialogConditionEnum.DC_CAN_AFFORD_BOUNTY',
  67: 'DialogConditionEnum.DC_IS_SNEAKING',
  68: 'DialogConditionEnum.DC_IS_INDOORS',
  69: 'DialogConditionEnum.DC_HAS_ILLEGAL_ITEM',
  70: 'DialogConditionEnum.DC_USING_MY_TRAINING_EQUIPMENT',
  71: 'DialogConditionEnum.DC_STARVING',
  72: 'DialogConditionEnum.DC_MIXED_GENDER_GROUP',
  73: 'DialogConditionEnum.DC_TOWN_LEVEL_CURRENT_LOCATION',
  74: 'DialogConditionEnum.DC_PLAYERS_BEST_TOWN_LEVEL',
  75: 'DialogConditionEnum.DC_IN_A_PLAYER_TOWN',
  76: 'DialogConditionEnum.DC_TARGET_CHARACTER_EXISTS',
  77: 'DialogConditionEnum.DC_IS_RECRUITABLE',
  78: 'DialogConditionEnum.DC_HAS_AI_CONTRACT',
  79: 'DialogConditionEnum.DC_HAS_ROBOT_LIMBS',
  80: 'DialogConditionEnum.DC_END',
};

const talkerLabels: Record<number, string> = {
  0: 'TalkerEnum.T_ME',
  1: 'TalkerEnum.T_TARGET',
  2: 'TalkerEnum.T_TARGET_IF_PLAYER',
  3: 'TalkerEnum.T_INTERJECTOR1',
  4: 'TalkerEnum.T_INTERJECTOR2',
  5: 'TalkerEnum.T_INTERJECTOR3',
  6: 'TalkerEnum.T_WHOLE_SQUAD',
  7: 'TalkerEnum.T_TARGET_WITH_RACE',
};

const eventTriggerLabels: Record<number, string> = {
  0: 'EventTriggerEnum.EV_NONE',
  1: 'EventTriggerEnum.EV_PLAYER_TALK_TO_ME',
  2: 'EventTriggerEnum.EV_ANNOUNCEMENT',
  3: 'EventTriggerEnum.EV_I_SEE_NEUTRAL_SQUAD',
  4: 'EventTriggerEnum.EV_I_SEE_RAGDOLL',
  6: 'EventTriggerEnum.EV_SOUND_THE_ALARM',
  8: 'EventTriggerEnum.EV_THIEF_CAUGHT_STEALING_FROM_ME',
  9: 'EventTriggerEnum.EV_SHOO_FROM_MY_BUILDING',
  10: 'EventTriggerEnum.EV_MARKED_FOR_DEATH',
  11: 'EventTriggerEnum.EV_SCREAMING_TORTURE',
  12: 'EventTriggerEnum.EV_BAR_TALK',
  13: 'EventTriggerEnum.EV_UNLOCK_MY_CAGE_OR_SHACKLES',
  14: 'EventTriggerEnum.EV_UNLOCK_MY_CAGE_ATTEMPT',
  15: 'EventTriggerEnum.EV_I_DEFEATED_SQUAD',
  16: 'EventTriggerEnum.EV_LAUNCH_ATTACK',
  17: 'EventTriggerEnum.EV_INTRUDER_FOUND',
  18: 'EventTriggerEnum.EV_HEALING_OTHER_START',
  19: 'EventTriggerEnum.EV_BEING_HEALED_START',
  20: 'EventTriggerEnum.EV_HEALING_OTHER_FINISHED',
  21: 'EventTriggerEnum.EV_BEING_HEALED_FINISHED',
  22: 'EventTriggerEnum.EV_FIRSTAID_KIT_EMPTY',
  23: 'EventTriggerEnum.EV_GET_UP_PEACE',
  24: 'EventTriggerEnum.EV_GET_UP_FIGHT',
  25: 'EventTriggerEnum.EV_GET_UP_UNNECCESSARY_FIGHT',
  26: 'EventTriggerEnum.EV_HARRASSMENT_SHOUTS',
  27: 'EventTriggerEnum.EV_I_SEE_ANIMAL_SQUAD',
  28: 'EventTriggerEnum.EV_SPEECH_INTERRUPTED_ATTACKED_BY_TARGET',
  29: 'EventTriggerEnum.EV_SPEECH_INTERRUPTED_ATTACKED_BY_STRANGERS',
  30: 'EventTriggerEnum.EV_CONTRACT_JOB_ENDED',
  31: 'EventTriggerEnum.EV_BETRAYAL',
  32: 'EventTriggerEnum.EV_LOOTING_WEAPON_ONLY',
  33: 'EventTriggerEnum.EV_LOOTING_EVERYTHING',
  34: 'EventTriggerEnum.EV_I_SEE_UNIFORM_IMPOSTER',
  35: 'EventTriggerEnum.EV_INTRODUCING_NEW_SLAVE',
  36: 'EventTriggerEnum.EV_ESCAPING_SLAVE_SPOTTED',
  37: 'EventTriggerEnum.EV_RECAPTURED_A_SLAVE',
  38: 'EventTriggerEnum.EV_SHOUT_AT_SLAVE_WORKER',
  39: 'EventTriggerEnum.EV_SLAVE_DELIVERY',
  40: 'EventTriggerEnum.EV_ESCAPED_EX_SLAVE_SPOTTED',
  41: 'EventTriggerEnum.EV_WITNESS_GENERIC_ASSAULT',
  42: 'EventTriggerEnum.EV_WITNESS_LOOTING_ALLY',
  43: 'EventTriggerEnum.EV_WITNESS_THIEF_OR_LOCKPICK',
  44: 'EventTriggerEnum.EV_BOUNTY_SPOTTED',
  45: 'EventTriggerEnum.EV_ESCAPED_PRISONER_SPOTTED',
  46: 'EventTriggerEnum.EV_PRISONER_FREE_TO_GO',
  47: 'EventTriggerEnum.EV_ALMOST_WOKE_UP',
  48: 'EventTriggerEnum.EV_ENTER_BIOME',
  49: 'EventTriggerEnum.EV_ENTER_TOWN',
  50: 'EventTriggerEnum.EV_SQUAD_BROKEN',
  51: 'EventTriggerEnum.EV_BOUGHT_ME_FROM_SLAVERY',
  52: 'EventTriggerEnum.EV_EATING_SOMETHING_SOUNDS',
  53: 'EventTriggerEnum.EV_WORSHIPING_SOMETHING',
  54: 'EventTriggerEnum.EV_SLAVE_ESCAPE_OPPORTUNITY_SAVIOR',
  55: 'EventTriggerEnum.EV_SLAVE_ESCAPE_OPPORTUNITY_ALONE',
  56: 'EventTriggerEnum.EV_ASSASSINATION_FAILED',
  57: 'EventTriggerEnum.EV_EATING_MY_CROPS',
  58: 'EventTriggerEnum.EV_KIDNAPPING_MY_ALLY',
  59: 'EventTriggerEnum.EV_USING_MY_TRAINING_EQUIPMENT',
  60: 'EventTriggerEnum.EV_GIVE_UP_CHASE',
  61: 'EventTriggerEnum.EV_ACID_FEET',
  62: 'EventTriggerEnum.EV_ACID_RAIN',
  63: 'EventTriggerEnum.EV_ACID_WATER',
  64: 'EventTriggerEnum.EV_WINDY',
  65: 'EventTriggerEnum.EV_POISON_GAS',
  66: 'EventTriggerEnum.EV_I_SEE_ENEMY_PLAYER',
  67: 'EventTriggerEnum.EV_I_SEE_ALLY_PLAYER',
  68: 'EventTriggerEnum.EV_I_SEE_ILLEGAL_PLAYER_BUILDING',
  69: 'EventTriggerEnum.EV_BURNING',
  70: 'EventTriggerEnum.EV_LOST_LEG',
  71: 'EventTriggerEnum.EV_LOST_ARM',
  72: 'EventTriggerEnum.EV_I_SEE_PLAYER_NICE_BUILDING',
  73: 'EventTriggerEnum.EV_TAKEN_OVER_PLAYER_TOWN',
  74: 'EventTriggerEnum.EV_CROWD_TRIGGERED',
  75: 'EventTriggerEnum.EV_MAX',
};

// Paraphrased from the FCS enum comments. Numeric keys follow the real FCS executable enum values.
const eventTriggerDescriptions: Record<number, string> = {
  0: 'no event trigger',
  1: 'player starts an NPC conversation; target is the player character',
  2: 'announcement event; marked unused in FCS comments',
  3: 'speaker sees a neutral NPC squad; repeats often',
  4: 'speaker sees a knocked-out or ragdoll target; repeats often',
  6: 'alarm event; marked unused in FCS comments',
  8: 'speaker personally catches a thief stealing',
  9: 'speaker tells target to leave their building',
  10: 'speaker is marked for death; no dialogue target',
  11: 'speaker is being tortured; no dialogue target',
  12: 'bar talk event; marked unused in FCS comments',
  13: 'non-captor unlocks speaker cage or shackles; target is rescuer',
  14: 'failed lockpick attempt on speaker cage; target is helper',
  15: 'speaker defeated the target squad',
  16: 'launch attack event; marked unused in FCS comments',
  17: 'speaker finds target inside a locked or private building',
  18: 'speaker starts healing the target',
  19: 'target starts healing the speaker',
  20: 'speaker finishes healing the target',
  21: 'target finishes healing the speaker',
  22: 'speaker runs out of medkits while healing',
  23: 'speaker gets up after a KO when fighting is over; no target',
  24: 'speaker gets up after a KO while fighting continues; target is opponent',
  25: 'speaker is pushed back into a lost fight after playing dead',
  26: 'thug hunter harassment shout while following the target',
  27: 'speaker sees an animal squad; repeats often',
  28: 'speech is interrupted because the target attacks',
  29: 'speech is interrupted by an outside attacker; target is attacker',
  30: 'AI contract or job ends; target is employer',
  31: 'an ally unexpectedly attacks the speaker',
  32: 'speaker loots only the target weapon',
  33: 'speaker loots everything from the victim',
  34: 'speaker sees a uniform impostor in looted faction gear',
  35: 'slaver introduces a newly captured slave',
  36: 'escaping slave is spotted',
  37: 'escaped slave is recaptured',
  38: 'slaver shouts at a slave worker',
  39: 'fresh slaves are delivered to a slaver colleague',
  40: 'escaped ex-slave or fugitive is spotted',
  41: 'generic assault is witnessed; target is criminal',
  42: 'looting of an ally is witnessed; target is criminal',
  43: 'theft, lockpicking, or slave freeing is witnessed',
  44: 'wanted bounty target is spotted',
  45: 'escaped prisoner is spotted outside their cage',
  46: 'prisoner sentence has ended; target is prisoner',
  47: 'sleeping speaker almost wakes up; no target',
  48: 'enter biome event; marked unused in FCS comments',
  49: 'enter town event; marked unused in FCS comments',
  50: 'squad broken event; marked unused in FCS comments',
  51: 'speaker is bought from slavery; target is new owner',
  52: 'speaker makes loud eating sounds; no target',
  53: 'speaker worships an object or deity; no target',
  54: 'slave sees masters KO and a rescuer exists',
  55: 'slave sees masters KO while alone',
  56: 'assassination or knockout attempt fails',
  57: 'pests eat crops; target is hungry pest',
  58: 'kidnapping of an ally is witnessed; target is kidnapper',
  59: 'speaker sees target using training equipment',
  60: 'speaker gives up a chase',
  61: 'acidic ground burns speaker feet; no target',
  62: 'acid rain affects the speaker; no target',
  63: 'acid water affects the swimming speaker; no target',
  64: 'wind or dust visibility event',
  65: 'poison gas affects the speaker; no target',
  66: 'speaker sees an enemy player squad; repeats often',
  67: 'speaker sees an allied player squad; repeats often',
  68: 'illegal player building is seen; marked unused in FCS comments',
  69: 'speaker is burning; no target',
  70: 'speaker loses a leg; no target',
  71: 'speaker loses an arm; no target',
  72: 'nice player building is seen; marked unused in FCS comments',
  73: 'speaker takes over a player town; no target',
  74: 'crowd event is triggered; marked unused in FCS comments',
  75: 'sentinel value, not a playable trigger',
};

const integerValueLabels: Record<string, Record<number, string>> = {
  'action name': dialogActionLabels,
  'compare by': {
    0: 'ComparisonEnum.CE_EQUALS',
    1: 'ComparisonEnum.CE_LESS_THAN',
    2: 'ComparisonEnum.CE_MORE_THAN',
  },
  'condition name': dialogConditionLabels,
  'repetition limit': {
    0: 'DialogRepetitionEnum.DR_NO_LIMIT',
    1: 'DialogRepetitionEnum.DR_SHORT_2',
    2: 'DialogRepetitionEnum.DR_MEDIUM_6',
    3: 'DialogRepetitionEnum.DR_LONG_48',
    4: 'DialogRepetitionEnum.DR_LONG_1WEEK',
    5: 'DialogRepetitionEnum.DR_ONCE_ONLY',
    6: 'DialogRepetitionEnum.DR_VSHORT_020',
  },
  speaker: talkerLabels,
  'target is type': {
    0: 'CharacterTypeEnum.OT_NONE',
    1: 'CharacterTypeEnum.OT_LAW_ENFORCEMENT',
    2: 'CharacterTypeEnum.OT_MILITARY',
    3: 'CharacterTypeEnum.OT_TRADER',
    4: 'CharacterTypeEnum.OT_CIVILIAN',
    5: 'CharacterTypeEnum.OT_DIPLOMAT',
    6: 'CharacterTypeEnum.OT_SLAVE',
    7: 'CharacterTypeEnum.OT_SLAVER',
    8: 'CharacterTypeEnum.OT_BANDIT',
    9: 'CharacterTypeEnum.OT_ADVENTURER',
    10: 'CharacterTypeEnum.OT_END',
  },
  who: talkerLabels,
};

const formatIntegerValue = (key: string, value: number) => {
  const label = integerValueLabels[key]?.[value];
  return label ? `${value} (${label})` : String(value);
};

const formatEventTriggerValue = (value: number) => {
  const label = eventTriggerLabels[value];
  const description = eventTriggerDescriptions[value];

  if (label && description) {
    return `${value} (${label}: ${description})`;
  }

  if (label) {
    return `${value} (${label})`;
  }

  return String(value);
};

const referenceCategoryHints: Record<string, string> = {
  'AI contract': 'dialog effect: starts an AI package contract',
  'change AI': 'dialog effect: permanently changes AI package',
  construction: 'building construction ingredients or requirements',
  dialogs: 'dialogue package entries; v0 is the FCS event trigger when known',
  effects: 'dialog actions that run after this line is selected or reached',
  'enable buildings': 'research unlocks these buildings',
  'enable research': 'research unlocks these research records',
  functionality: 'building functionality record used by a building',
  ingredients: 'crafting or production ingredients',
  inheritsFrom: 'dialogue package inheritance',
  items: 'item/vendor/placement list; value meaning depends on the FCS field',
  lines: 'dialogue line children or reply options',
  nests: 'biome or town spawn entries',
  parts: 'building visual parts; values commonly include group/chance data',
  produces: 'production output item',
  squad: 'fixed squad member entries',
  'trigger campaign': 'dialog effect that starts a faction campaign',
  'upgrades to': 'building upgrade targets',
  vendors: 'character or faction vendor list',
  weapons: 'character or placement weapon entries',
  'world state': 'world-state condition entry',
  'choosefrom list': 'random squad member pool',
};

const formatReferenceCategoryHint = (name: string) => {
  const hint = referenceCategoryHints[name];
  return hint ? ` - ${hint}` : '';
};

const uniquePreserveOrder = (items: readonly string[]) => {
  const result: string[] = [];
  const visited = new Set<string>();

  for (const item of items) {
    if (visited.has(item)) {
      continue;
    }

    visited.add(item);
    result.push(item);
  }

  return result;
};

const escapeTableCell = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');

const escapeFenced = (value: string) => value.replace(/```/g, '``\u200b`');

const formatMultiline = (value: string) => {
  if (value.length === 0) {
    return '(empty)';
  }

  return '```text\n' + escapeFenced(value) + '\n```';
};

const pushIndentedBlock = (
  lines: string[],
  indent: string,
  block: string,
) => {
  for (const line of block.split('\n')) {
    lines.push(`${indent}${line}`);
  }
};

const getReferenceCategory = (
  record: InspectorRecord,
  name: string,
): ReferenceCategory | undefined =>
  record.referenceCategories.find((category) => category.name === name);

const getReferences = (record: InspectorRecord, name: string) =>
  getReferenceCategory(record, name)?.references ?? [];

const getStringValue = (record: InspectorRecord, key: string) =>
  record.strings.find((entry) => entry.key === key)?.value ?? '';

const getDialogRelevantRecords = (records: readonly InspectorRecord[]) =>
  records.filter((record) =>
    [
      dialogueTypeCode,
      dialogueLineTypeCode,
      dialogActionTypeCode,
      dialoguePackageTypeCode,
    ].includes(record.type),
  );

const isDialogRelevantRecord = (record: Pick<InspectorRecord, 'type'>) =>
  [
    dialogueTypeCode,
    dialogueLineTypeCode,
    dialogActionTypeCode,
    dialoguePackageTypeCode,
    84,
  ].includes(record.type);

const hasReferenceDetails = (record: InspectorRecord) =>
  record.referenceCategories.some(
    (category) => category.references.length > 0,
  );

const buildRecordIndex = (records: readonly InspectorRecord[]) => {
  const byId = new Map<string, InspectorRecord>();
  for (const record of records) {
    if (record.stringId.length > 0) {
      byId.set(record.stringId, record);
    }
  }
  return byId;
};

const formatPrimitiveFields = (
  record: InspectorRecord,
  preferredOrder: readonly string[] = [],
) => {
  const preferredIndex = new Map<string, number>();
  preferredOrder.forEach((key, index) => {
    preferredIndex.set(key, index);
  });

  const entries = [
    ...record.values.bools.map((entry) => ({
      key: entry.key,
      sortGroup: 'bool',
      value: entry.value ? 'true' : 'false',
    })),
    ...record.values.ints.map((entry) => ({
      key: entry.key,
      sortGroup: 'int',
      value: formatIntegerValue(entry.key, entry.value),
    })),
    ...record.values.floats.map((entry) => ({
      key: entry.key,
      sortGroup: 'float',
      value: formatFloatValue(entry.value),
    })),
  ].sort((left, right) => {
    const leftPreferred = preferredIndex.get(left.key);
    const rightPreferred = preferredIndex.get(right.key);

    if (leftPreferred !== undefined || rightPreferred !== undefined) {
      return (leftPreferred ?? 10_000) - (rightPreferred ?? 10_000);
    }

    const groupCompare = left.sortGroup.localeCompare(right.sortGroup);
    if (groupCompare !== 0) {
      return groupCompare;
    }

    return left.key.localeCompare(right.key, 'ja');
  });

  return entries
    .map((entry) => `\`${escapeTableCell(entry.key)}\`=${entry.value}`)
    .join(' · ');
};

const formatFocusedPrimitiveFields = (record: InspectorRecord) => {
  const entries = [
    ...record.values.bools
      .filter((entry) => entry.value)
      .map((entry) => ({
        key: entry.key,
        sortGroup: 'bool',
        value: 'true',
      })),
    ...record.values.ints
      .filter((entry) => entry.value !== 0)
      .map((entry) => ({
        key: entry.key,
        sortGroup: 'int',
        value: formatIntegerValue(entry.key, entry.value),
      })),
    ...record.values.floats
      .filter((entry) => Math.abs(entry.value) > Number.EPSILON)
      .map((entry) => ({
        key: entry.key,
        sortGroup: 'float',
        value: formatFloatValue(entry.value),
      })),
  ].sort((left, right) => {
    const groupCompare = left.sortGroup.localeCompare(right.sortGroup);
    if (groupCompare !== 0) {
      return groupCompare;
    }

    return left.key.localeCompare(right.key, 'ja');
  });

  return entries
    .map((entry) => `\`${escapeTableCell(entry.key)}\`=${entry.value}`)
    .join(' · ');
};

const formatReferenceValue = (
  key: 'v0' | 'v1' | 'v2',
  value: number,
  categoryName?: string,
) => {
  if (categoryName === 'dialogs' && key === 'v0') {
    return `${key}=${formatEventTriggerValue(value)}`;
  }

  return `${key}=${value}`;
};

const formatReferenceValues = (reference: Reference, categoryName?: string) => {
  const values = [
    ['v0', reference.value0],
    ['v1', reference.value1],
    ['v2', reference.value2],
  ] as const;

  return values
    .map(([key, value]) => formatReferenceValue(key, value, categoryName))
    .join(', ');
};

const inferReferenceSource = (targetId: string) => {
  const separatorIndex = targetId.indexOf('-');
  if (separatorIndex < 0 || separatorIndex === targetId.length - 1) {
    return '';
  }

  return targetId.slice(separatorIndex + 1);
};

const getRecordLineageParts = (
  record: Pick<InspectorRecord, 'modName' | 'saveData' | 'stringId'>,
) => {
  const parts: string[] = [];
  const idSource = inferReferenceSource(record.stringId);

  if (
    idSource.length > 0 &&
    normalizeModName(idSource) !== normalizeModName(record.modName)
  ) {
    parts.push(`ID source: ${escapeTableCell(idSource)}`);
  }

  parts.push(`Change: ${record.saveData.changeTypeName}`);

  if (record.saveData.saveCount > 0) {
    parts.push(`Save count: ${formatNumber(record.saveData.saveCount)}`);
  }

  if (record.saveData.changeTypeName.startsWith('Unknown')) {
    parts.push(`Raw saveData: ${record.saveData.raw}`);
  }

  return parts;
};

const formatResolvedReference = (
  reference: Reference,
  recordById: ReadonlyMap<string, InspectorRecord>,
  categoryName?: string,
) => {
  const targetRecord = recordById.get(reference.targetId);
  const values = formatReferenceValues(reference, categoryName);

  if (!targetRecord) {
    const source = inferReferenceSource(reference.targetId);
    const sourcePart =
      source.length > 0 ? ` · source: ${escapeTableCell(source)}` : '';

    return `\`${escapeTableCell(reference.targetId)}\` · unresolved/unloaded${sourcePart} (${values})`;
  }

  const heading = renderInspectorHeading(targetRecord);
  const idPart =
    heading === targetRecord.stringId
      ? ''
      : ` · \`${escapeTableCell(targetRecord.stringId)}\``;

  return `${escapeTableCell(heading)}${idPart} · ${renderTypeDescriptor(targetRecord.type)} (${values})`;
};

const renderGenericReferenceCategories = (
  lines: string[],
  record: InspectorRecord,
  recordById: ReadonlyMap<string, InspectorRecord>,
  omittedCategoryNames: readonly string[],
  indent = '',
) => {
  const omitted = new Set(omittedCategoryNames);
  const categories = record.referenceCategories.filter(
    (category) =>
      category.references.length > 0 && !omitted.has(category.name),
  );

  if (categories.length === 0) {
    return;
  }

  for (const category of categories) {
    lines.push(
      `${indent}- \`${escapeTableCell(category.name)}\`: ${pluralSuffix('reference', category.references.length)}${formatReferenceCategoryHint(category.name)}`,
    );
    for (const reference of category.references) {
      lines.push(
        `${indent}  - ${formatResolvedReference(reference, recordById, category.name)}`,
      );
    }
  }
};

const renderDialogActionReferences = (
  lines: string[],
  label: string,
  references: readonly Reference[],
  recordById: ReadonlyMap<string, InspectorRecord>,
  indent = '',
) => {
  if (references.length === 0) {
    return;
  }

  lines.push(`${indent}- ${label}: ${pluralSuffix('action', references.length)}`);

  for (const reference of references) {
    const actionRecord = recordById.get(reference.targetId);
    lines.push(
      `${indent}  - ${formatResolvedReference(reference, recordById)}`,
    );

    if (!actionRecord) {
      continue;
    }

    const fields = formatPrimitiveFields(actionRecord);
    if (fields.length > 0) {
      lines.push(`${indent}    - Fields: ${fields}`);
    }

    const actionStrings = getVisibleStringEntries(actionRecord);
    for (const entry of actionStrings) {
      lines.push(
        `${indent}    - \`${escapeTableCell(entry.key)}\`: ${escapeTableCell(entry.value)}`,
      );
    }

    renderGenericReferenceCategories(
      lines,
      actionRecord,
      recordById,
      [],
      `${indent}    `,
    );
  }
};

const renderNonDialogRecordSupplement = (
  lines: string[],
  record: InspectorRecord,
  recordById: ReadonlyMap<string, InspectorRecord>,
) => {
  if (isDialogRelevantRecord(record)) {
    return;
  }

  const focusedFields = formatFocusedPrimitiveFields(record);
  if (focusedFields.length > 0) {
    lines.push('- Primitive values shown: false bools and numeric zeroes omitted for readability.');
    lines.push(`  - ${focusedFields}`);
    lines.push('');
  }

  if (hasReferenceDetails(record)) {
    lines.push('- References:');
    renderGenericReferenceCategories(lines, record, recordById, [], '  ');
    lines.push('');
  }
};

const pluralSuffix = (label: string, count: number) =>
  `${formatNumber(count)} ${label}${count === 1 ? '' : 's'}`;

const collectDeclaredDependencies = (mods: readonly LoadedMod[]) =>
  uniquePreserveOrder(mods.flatMap((mod) => mod.header.dependencies));

const collectDeclaredReferences = (mods: readonly LoadedMod[]) =>
  uniquePreserveOrder(mods.flatMap((mod) => mod.header.references));

const normalizeModName = (value: string) => value.replace(/\.mod$/i, '');

const getVisibleStringEntries = (record: Pick<InspectorRecord, 'strings'>) =>
  record.strings.filter((entry) => entry.value.length > 0);

const getVisibleDialogTexts = (record: DialogRecord) =>
  record.texts.filter((text) => text.original.length > 0);

type StringRenderStats = {
  emptyOnlyRecordCount: number;
  omittedNoStringRecordCount: number;
  renderedFieldCount: number;
  renderedRecordCount: number;
  totalFieldCount: number;
  totalRecordCount: number;
};

type DialogRenderStats = {
  omittedEmptyRecordCount: number;
  omittedEmptyTextCount: number;
  renderedRecordCount: number;
  renderedTextCount: number;
  totalRecordCount: number;
  totalTextCount: number;
};

const summarizeStringRecords = (
  records: readonly InspectorRecord[],
): StringRenderStats => {
  let emptyOnlyRecordCount = 0;
  let omittedNoStringRecordCount = 0;
  let renderedFieldCount = 0;
  let renderedRecordCount = 0;
  let totalFieldCount = 0;
  let totalRecordCount = 0;

  for (const record of records) {
    if (record.strings.length === 0) {
      omittedNoStringRecordCount += 1;
      continue;
    }

    totalRecordCount += 1;
    totalFieldCount += record.strings.length;

    const visibleStringCount = getVisibleStringEntries(record).length;
    if (visibleStringCount === 0) {
      emptyOnlyRecordCount += 1;
      continue;
    }

    renderedRecordCount += 1;
    renderedFieldCount += visibleStringCount;
  }

  return {
    emptyOnlyRecordCount,
    omittedNoStringRecordCount,
    renderedFieldCount,
    renderedRecordCount,
    totalFieldCount,
    totalRecordCount,
  };
};

const summarizeDialogRecords = (
  records: readonly DialogRecord[],
): DialogRenderStats => {
  let omittedEmptyRecordCount = 0;
  let omittedEmptyTextCount = 0;
  let renderedRecordCount = 0;
  let renderedTextCount = 0;
  let totalRecordCount = 0;
  let totalTextCount = 0;

  for (const record of records) {
    totalRecordCount += 1;
    totalTextCount += record.texts.length;

    const visibleTextCount = getVisibleDialogTexts(record).length;
    omittedEmptyTextCount += record.texts.length - visibleTextCount;

    if (visibleTextCount === 0) {
      omittedEmptyRecordCount += 1;
      continue;
    }

    renderedRecordCount += 1;
    renderedTextCount += visibleTextCount;
  }

  return {
    omittedEmptyRecordCount,
    omittedEmptyTextCount,
    renderedRecordCount,
    renderedTextCount,
    totalRecordCount,
    totalTextCount,
  };
};

const countCategories = (records: readonly InspectorRecord[]) => {
  const counts = new Map<ItemCategory, number>();
  for (const record of records) {
    const category = getItemCategory(record.type);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
};

const countTypes = (records: readonly InspectorRecord[]) => {
  const counts = new Map<number, number>();
  for (const record of records) {
    counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
};

const countChangeTypes = (records: readonly InspectorRecord[]) => {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(
      record.saveData.changeTypeName,
      (counts.get(record.saveData.changeTypeName) ?? 0) + 1,
    );
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
};

const countIdSources = (records: readonly InspectorRecord[]) => {
  const counts = new Map<string, number>();
  for (const record of records) {
    const source = inferReferenceSource(record.stringId) || '(unknown)';
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
};

const renderHeader = (project: ModProject) => {
  const totalRecords = project.inspectorRecords.length;
  const stringStats = summarizeStringRecords(project.inspectorRecords);
  const dialogRecords = project.textRecords.filter(
    (record): record is DialogRecord => record.kind === 'dialog',
  );
  const dialogStats = summarizeDialogRecords(dialogRecords);
  const referenceOnlyRecords = getReferenceOnlyRecords(project.inspectorRecords);
  const changeCounts = new Map(countChangeTypes(project.inspectorRecords));
  const entityRecordCount = project.textRecords.length - dialogRecords.length;
  const visibleTextRecordCount =
    dialogStats.renderedRecordCount + entityRecordCount;

  const lines: string[] = [];
  lines.push('# Kenshi Mod Markdown Export');
  lines.push('');
  lines.push(
    'This file is a merged Markdown dump of all loaded Kenshi `.mod` files,',
  );
  lines.push(
    'formatted for human review and LLM ingestion.',
  );
  lines.push('');
  lines.push('## File Summary');
  lines.push('');
  lines.push('### Purpose');
  lines.push(
    'Provide a complete and prompt-friendly snapshot of the selected mods,',
  );
  lines.push(
    'including metadata, record inventory, non-empty string fields, and extracted',
  );
  lines.push('dialog or description-heavy records.');
  lines.push('');
  lines.push('### Usage Guidelines');
  lines.push(
    '- Start with `Extracted Text Records` when reviewing lore, dialogue, or',
  );
  lines.push('  text that is likely to matter to an LLM task.');
  lines.push(
    '- In dialog sections, read `Dialog Structures` before the flat text list; it resolves packages, dialogue roots, line/reply links, conditions, effects, and raw reference values.',
  );
  lines.push(
    '- Use `String-bearing Records` when you need the raw non-empty string payload and exact keys',
  );
  lines.push('  from the source mod data.');
  lines.push(
    '- Records with no string fields are omitted from the raw dump, while',
  );
  lines.push('  their counts still contribute to the summary tables.');
  lines.push(
    '- Non-string fields are summarized globally, while dialog-relevant primitive fields and references are preserved in detail.',
  );
  lines.push(
    '- Empty string values are omitted from dialog and raw sections to reduce prompt noise.',
  );
  lines.push('');
  lines.push('### Metrics');
  lines.push(`- Source project: **${project.sourceModName}**`);
  lines.push(`- Loaded mods: **${formatNumber(project.mods.length)}**`);
  lines.push(`- Total records: **${formatNumber(totalRecords)}**`);
  lines.push(`- New records: **${formatNumber(changeCounts.get('New') ?? 0)}**`);
  lines.push(
    `- Changed records: **${formatNumber(changeCounts.get('Changed') ?? 0)}**`,
  );
  lines.push(
    `- Rendered string-bearing records: **${formatNumber(stringStats.renderedRecordCount)}**`,
  );
  lines.push(
    `- Rendered string fields: **${formatNumber(stringStats.renderedFieldCount)}**`,
  );
  lines.push(
    `- Omitted empty string fields: **${formatNumber(stringStats.totalFieldCount - stringStats.renderedFieldCount)}**`,
  );
  lines.push(
    `- Extracted text records: **${formatNumber(visibleTextRecordCount)}**`,
  );
  lines.push(
    `- Extracted dialog lines: **${formatNumber(dialogStats.renderedTextCount)}**`,
  );
  lines.push(
    `- Reference-bearing records without visible strings: **${formatNumber(referenceOnlyRecords.length)}**`,
  );
  lines.push(
    `- Omitted empty dialog variants: **${formatNumber(dialogStats.omittedEmptyTextCount)}**`,
  );
  lines.push(
    `- Declared dependencies: **${formatNumber(collectDeclaredDependencies(project.mods).length)}**`,
  );
  lines.push('');

  return lines.join('\n');
};

const renderNavigation = (project: ModProject) => {
  const lines: string[] = [];
  lines.push('## Navigation');
  lines.push('');
  lines.push('- [Directory Structure](#directory-structure)');

  if (collectDeclaredDependencies(project.mods).length > 0) {
    lines.push('- [Declared Dependencies](#declared-dependencies)');
  }

  if (collectDeclaredReferences(project.mods).length > 0) {
    lines.push('- [Declared References](#declared-references)');
  }

  lines.push('- [Category Breakdown](#category-breakdown)');
  lines.push('- [Item Type Breakdown](#item-type-breakdown)');
  lines.push('- [Record Change Breakdown](#record-change-breakdown)');
  lines.push('- [Mods](#mods)');

  if (project.textRecords.length > 0) {
    lines.push('- [Extracted Text Records](#extracted-text-records)');
  }

  if (project.inspectorRecords.some((record) => record.strings.length > 0)) {
    lines.push('- [String-bearing Records](#string-bearing-records)');
  }

  if (getReferenceOnlyRecords(project.inspectorRecords).length > 0) {
    lines.push(
      '- [Reference-bearing Records Without Visible Strings](#reference-bearing-records-without-visible-strings)',
    );
  }

  lines.push('');
  return lines.join('\n');
};

const renderStructure = (project: ModProject) => {
  const lines: string[] = [];
  lines.push('## Directory Structure');
  lines.push('');
  lines.push('```text');
  lines.push(`${project.sourceModName}/`);
  for (const mod of project.mods) {
    lines.push(
      `  ${mod.fileName}  (${pluralSuffix('record', mod.recordCount)})`,
    );
  }
  lines.push('```');
  lines.push('');
  return lines.join('\n');
};

const renderDependencies = (mods: readonly LoadedMod[]) => {
  const dependencies = collectDeclaredDependencies(mods);
  const references = collectDeclaredReferences(mods);
  const lines: string[] = [];

  if (dependencies.length > 0) {
    lines.push('## Declared Dependencies');
    lines.push('');
    for (const dependency of dependencies) {
      lines.push(`- ${dependency}`);
    }
    lines.push('');
  }

  if (references.length > 0) {
    lines.push('## Declared References');
    lines.push('');
    for (const reference of references) {
      lines.push(`- ${reference}`);
    }
    lines.push('');
  }

  return lines.join('\n');
};

const renderCategoryBreakdown = (records: readonly InspectorRecord[]) => {
  const counts = countCategories(records);
  if (counts.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Category Breakdown');
  lines.push('');
  lines.push('| Category | Records |');
  lines.push('| --- | ---: |');
  for (const [category, count] of counts) {
    lines.push(
      `| ${itemCategoryLabels[category]} (${category}) | ${formatNumber(count)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
};

const renderTypeBreakdown = (records: readonly InspectorRecord[]) => {
  const counts = countTypes(records);
  if (counts.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## Item Type Breakdown');
  lines.push('');
  lines.push('| Type Code | English | Label | Records |');
  lines.push('| ---: | --- | --- | ---: |');
  for (const [type, count] of counts) {
    lines.push(
      `| ${type} | ${getItemTypeEnglishName(type)} | ${getItemTypeLabel(type)} | ${formatNumber(count)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
};

const renderRecordChangeBreakdown = (
  project: ModProject,
) => {
  if (project.inspectorRecords.length === 0) {
    return '';
  }

  const loadedModNames = new Set(
    project.mods.map((mod) => normalizeModName(mod.fileName)),
  );
  const changeCounts = countChangeTypes(project.inspectorRecords);
  const sourceCounts = countIdSources(project.inspectorRecords);
  const lines: string[] = [];

  lines.push('## Record Change Breakdown');
  lines.push('');
  lines.push(
    'Change type comes from Kenshi item save data: `New` means added by the active mod, `Changed` means an existing record was edited, and `Renamed` means the active mod changed the record name.',
  );
  lines.push('');
  lines.push('| Change type | Records |');
  lines.push('| --- | ---: |');
  for (const [changeType, count] of changeCounts) {
    lines.push(`| ${escapeTableCell(changeType)} | ${formatNumber(count)} |`);
  }
  lines.push('');
  lines.push('### ID Source Breakdown');
  lines.push('');
  lines.push(
    'The ID source is inferred from the part after the first hyphen in `stringId`. External sources usually indicate records that originated in another mod, base game file, or an earlier file name.',
  );
  lines.push('');
  lines.push('| ID source | Records | Relation to loaded mod |');
  lines.push('| --- | ---: | --- |');
  for (const [source, count] of sourceCounts) {
    const relation = loadedModNames.has(normalizeModName(source))
      ? 'loaded mod'
      : 'external/base/renamed source';
    lines.push(
      `| ${escapeTableCell(source)} | ${formatNumber(count)} | ${relation} |`,
    );
  }
  lines.push('');

  return lines.join('\n');
};

const renderMods = (mods: readonly LoadedMod[]) => {
  const lines: string[] = [];
  lines.push('## Mods');
  lines.push('');

  for (const mod of mods) {
    lines.push(`### ${mod.fileName}`);
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('| --- | --- |');
    lines.push(`| File type | ${mod.header.fileType} |`);
    lines.push(`| Version | ${mod.header.version} |`);
    lines.push(
      `| Author | ${
        mod.header.author.length > 0
          ? escapeTableCell(mod.header.author)
          : '(unknown)'
      } |`,
    );
    lines.push(`| Record count | ${formatNumber(mod.recordCount)} |`);
    lines.push(
      `| Dependencies | ${
        mod.header.dependencies.length === 0
          ? '—'
          : mod.header.dependencies.map(escapeTableCell).join(', ')
      } |`,
    );
    lines.push(
      `| References | ${
        mod.header.references.length === 0
          ? '—'
          : mod.header.references.map(escapeTableCell).join(', ')
      } |`,
    );
    lines.push('');

    if (mod.header.description.length > 0) {
      lines.push('**Description**');
      lines.push('');
      lines.push(formatMultiline(mod.header.description));
      lines.push('');
    }
  }

  return lines.join('\n');
};

const renderOtherFieldCounts = (counts: InspectorRecord['counts']) => {
  const parts: string[] = [];
  const entries: Array<[string, number]> = [
    ['bools', counts.bools],
    ['floats', counts.floats],
    ['ints', counts.ints],
    ['vec3', counts.vector3s],
    ['vec4', counts.vector4s],
    ['files', counts.files],
    ['refs', counts.references],
    ['refCats', counts.referenceCategories],
    ['instances', counts.instances],
  ];

  for (const [label, count] of entries) {
    if (count > 0) {
      parts.push(`${label}=${formatNumber(count)}`);
    }
  }

  if (parts.length === 0) {
    return '';
  }

  return parts.join(', ');
};

const renderTypeDescriptor = (type: number) =>
  `${type} · ${getItemTypeEnglishName(type)} · ${getItemTypeLabel(type)}`;

const renderStringBearingRecords = (records: readonly InspectorRecord[]) => {
  const stringStats = summarizeStringRecords(records);
  const stringRecords = records.filter((record) => record.strings.length > 0);
  const recordById = buildRecordIndex(records);
  const lines: string[] = [];
  lines.push('## String-bearing Records');
  lines.push('');
  lines.push(
    'This section preserves original string keys while omitting empty values and records that contain only empty strings. For non-dialog records it also includes loaded references and useful primitive values so item, building, vendor, squad, and world records remain understandable when exported one mod at a time.',
  );
  lines.push('');
  lines.push(
    `Rendered: ${formatNumber(stringStats.renderedRecordCount)} records / ${formatNumber(stringStats.renderedFieldCount)} non-empty string fields`,
  );
  lines.push(
    `Omitted: ${formatNumber(stringStats.omittedNoStringRecordCount)} records with no string fields`,
  );
  if (stringStats.emptyOnlyRecordCount > 0) {
    lines.push(
      `Omitted: ${formatNumber(stringStats.emptyOnlyRecordCount)} records whose string fields are all empty`,
    );
  }
  if (stringStats.totalFieldCount > stringStats.renderedFieldCount) {
    lines.push(
      `Empty string fields omitted: ${formatNumber(stringStats.totalFieldCount - stringStats.renderedFieldCount)}`,
    );
  }
  lines.push('');

  const byMod = new Map<string, InspectorRecord[]>();
  for (const record of stringRecords) {
    const modName = normalizeModName(record.modName);
    const existing = byMod.get(modName);
    if (existing) {
      existing.push(record);
    } else {
      byMod.set(modName, [record]);
    }
  }

  for (const [modName, modRecords] of byMod) {
    const modStats = summarizeStringRecords(modRecords);
    if (modStats.renderedRecordCount === 0) {
      continue;
    }

    lines.push(`### String-bearing Records · ${modName}`);
    lines.push('');
    lines.push(
      `${pluralSuffix('record', modStats.renderedRecordCount)} / ${pluralSuffix('field', modStats.renderedFieldCount)} shown from \`${modName}\`.`,
    );
    if (modStats.emptyOnlyRecordCount > 0) {
      lines.push(
        `${pluralSuffix('record', modStats.emptyOnlyRecordCount)} with only empty strings omitted.`,
      );
    }
    lines.push('');

    for (const record of modRecords) {
      const visibleStrings = getVisibleStringEntries(record);
      if (visibleStrings.length === 0) {
        continue;
      }

      const heading = renderInspectorHeading(record);
      const metaParts: string[] = [];
      const otherFieldCounts = renderOtherFieldCounts(record.counts);
      const omittedEmptyCount = record.strings.length - visibleStrings.length;

      if (heading !== record.stringId) {
        metaParts.push(`ID: \`${escapeTableCell(record.stringId)}\``);
      }

      metaParts.push(`Type: ${renderTypeDescriptor(record.type)}`);
      metaParts.push(...getRecordLineageParts(record));

      if (otherFieldCounts.length > 0) {
        metaParts.push(`Other fields: ${otherFieldCounts}`);
      }

      if (omittedEmptyCount > 0) {
        metaParts.push(`${formatNumber(omittedEmptyCount)} empty omitted`);
      }

      lines.push(`#### ${escapeTableCell(heading)}`);
      lines.push('');
      lines.push(`- ${metaParts.join(' · ')}`);
      lines.push('');
      for (const entry of visibleStrings) {
        lines.push(`- \`${escapeTableCell(entry.key)}\``);
        lines.push('');
        lines.push(formatMultiline(entry.value));
        lines.push('');
      }

      renderNonDialogRecordSupplement(lines, record, recordById);
    }
  }

  return lines.join('\n');
};

const getReferenceOnlyRecords = (records: readonly InspectorRecord[]) =>
  records.filter(
    (record) =>
      !isDialogRelevantRecord(record) &&
      hasReferenceDetails(record) &&
      getVisibleStringEntries(record).length === 0,
  );

const renderReferenceBearingRecords = (
  records: readonly InspectorRecord[],
) => {
  const referenceOnlyRecords = getReferenceOnlyRecords(records);
  if (referenceOnlyRecords.length === 0) {
    return '';
  }

  const recordById = buildRecordIndex(records);
  const byMod = new Map<string, InspectorRecord[]>();
  for (const record of referenceOnlyRecords) {
    const modName = normalizeModName(record.modName);
    const existing = byMod.get(modName);
    if (existing) {
      existing.push(record);
    } else {
      byMod.set(modName, [record]);
    }
  }

  const totalReferences = referenceOnlyRecords.reduce(
    (sum, record) => sum + record.counts.references,
    0,
  );
  const lines: string[] = [];

  lines.push('## Reference-bearing Records Without Visible Strings');
  lines.push('');
  lines.push(
    'These non-dialog records have no non-empty string fields, but their references define concrete mod behavior. This section is important for single-mod exports because it preserves relationships such as vendor inventory, squad members, building parts, crafting inputs/outputs, biome links, and faction/world-state wiring.',
  );
  lines.push('');
  lines.push(
    `Rendered: ${pluralSuffix('record', referenceOnlyRecords.length)} / ${pluralSuffix('reference', totalReferences)}`,
  );
  lines.push('');

  for (const [modName, modRecords] of byMod) {
    const modReferenceCount = modRecords.reduce(
      (sum, record) => sum + record.counts.references,
      0,
    );

    lines.push(`### Reference-bearing Records · ${escapeTableCell(modName)}`);
    lines.push('');
    lines.push(
      `${pluralSuffix('record', modRecords.length)} / ${pluralSuffix('reference', modReferenceCount)} shown from \`${modName}\`.`,
    );
    lines.push('');

    for (const record of modRecords) {
      const heading = renderInspectorHeading(record);
      const metaParts: string[] = [];
      const otherFieldCounts = renderOtherFieldCounts(record.counts);

      if (heading !== record.stringId) {
        metaParts.push(`ID: \`${escapeTableCell(record.stringId)}\``);
      }

      metaParts.push(`Type: ${renderTypeDescriptor(record.type)}`);
      metaParts.push(...getRecordLineageParts(record));

      if (otherFieldCounts.length > 0) {
        metaParts.push(`Other fields: ${otherFieldCounts}`);
      }

      lines.push(`#### ${escapeTableCell(heading)}`);
      lines.push('');
      lines.push(`- ${metaParts.join(' · ')}`);
      lines.push('');
      renderNonDialogRecordSupplement(lines, record, recordById);
    }
  }

  return lines.join('\n');
};

const groupTextRecordsByMod = <T extends DialogRecord | EntityRecord>(
  records: readonly T[],
) => {
  const groups = new Map<string, T[]>();

  for (const record of records) {
    const modName = normalizeModName(record.modName);
    const existing = groups.get(modName);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(modName, [record]);
    }
  }

  return groups;
};

const isGenericDialogTitle = (value: string) =>
  /^DIALOGUE_LINE(?:\d+)?$/i.test(value) || value === 'DIALOGUE_LINE';

type HeadingRecord = Pick<InspectorRecord, 'name' | 'stringId' | 'type'>;

const renderBaseRecordHeading = (record: HeadingRecord) => {
  const trimmedName = record.name.trim();

  if (
    record.type === 19 &&
    (trimmedName.length === 0 || isGenericDialogTitle(trimmedName))
  ) {
    return record.stringId;
  }

  if (trimmedName.length > 0) {
    return trimmedName;
  }

  if (record.stringId.length > 0) {
    return record.stringId;
  }

  return '(unnamed)';
};

const renderDialogHeading = (record: DialogRecord) => {
  const heading = renderBaseRecordHeading(record);
  if (heading === record.stringId) {
    return record.stringId;
  }

  return `${heading} · ${record.stringId}`;
};

const renderEntityHeading = (record: EntityRecord) => renderBaseRecordHeading(record);

const renderInspectorHeading = (record: InspectorRecord) =>
  renderBaseRecordHeading(record);

const groupInspectorRecordsByMod = (records: readonly InspectorRecord[]) => {
  const groups = new Map<string, InspectorRecord[]>();

  for (const record of records) {
    const modName = normalizeModName(record.modName);
    const existing = groups.get(modName);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(modName, [record]);
    }
  }

  return groups;
};

const collectReferencedDialogLineIds = (
  records: readonly InspectorRecord[],
) => {
  const referencedIds = new Set<string>();

  for (const record of records) {
    if (record.type !== dialogueTypeCode && record.type !== dialogueLineTypeCode) {
      continue;
    }

    for (const reference of getReferences(record, 'lines')) {
      referencedIds.add(reference.targetId);
    }
  }

  return referencedIds;
};

const renderLineTexts = (
  lines: string[],
  dialogText: DialogRecord | undefined,
  indent: string,
) => {
  const visibleTexts = dialogText ? getVisibleDialogTexts(dialogText) : [];

  if (visibleTexts.length === 0) {
    lines.push(`${indent}- Text: (no non-empty text variants)`);
    return;
  }

  if (visibleTexts.length === 1) {
    const [text] = visibleTexts;
    const label = text.textId === 'text0' ? 'Text' : `Text \`${text.textId}\``;
    lines.push(`${indent}- ${label}:`);
    pushIndentedBlock(lines, `${indent}  `, formatMultiline(text.original));
    return;
  }

  lines.push(`${indent}- Text variants: ${formatNumber(visibleTexts.length)}`);
  for (const text of visibleTexts) {
    lines.push(`${indent}  - \`${escapeTableCell(text.textId)}\``);
    pushIndentedBlock(lines, `${indent}    `, formatMultiline(text.original));
  }
};

const renderDialogueLineNode = (
  lines: string[],
  reference: Reference,
  recordById: ReadonlyMap<string, InspectorRecord>,
  dialogTextById: ReadonlyMap<string, DialogRecord>,
  visitedLineIds: ReadonlySet<string>,
  depth: number,
) => {
  const indent = '  '.repeat(depth);
  const lineRecord = recordById.get(reference.targetId);
  const dialogText = dialogTextById.get(reference.targetId);

  if (!lineRecord) {
    lines.push(
      `${indent}- Missing line reference: \`${escapeTableCell(reference.targetId)}\` (${formatReferenceValues(reference)})`,
    );
    return;
  }

  const heading = renderInspectorHeading(lineRecord);
  const idPart =
    heading === lineRecord.stringId
      ? ''
      : ` · \`${escapeTableCell(lineRecord.stringId)}\``;

  lines.push(
    `${indent}- Line: ${escapeTableCell(heading)}${idPart} (${formatReferenceValues(reference)})`,
  );

  const lineFields = formatPrimitiveFields(lineRecord, [
    'speaker',
    'chance permanent',
    'chance temporary',
    'repetition limit',
    'score bonus',
    'target is type',
    'interjection',
  ]);
  if (lineFields.length > 0) {
    lines.push(`${indent}  - Fields: ${lineFields}`);
  }

  lines.push(
    `${indent}  - Lineage: ${getRecordLineageParts(lineRecord).join(' · ')}`,
  );

  renderLineTexts(lines, dialogText, `${indent}  `);

  renderDialogActionReferences(
    lines,
    'Conditions',
    getReferences(lineRecord, 'conditions'),
    recordById,
    `${indent}  `,
  );
  renderDialogActionReferences(
    lines,
    'Effects',
    getReferences(lineRecord, 'effects'),
    recordById,
    `${indent}  `,
  );

  renderGenericReferenceCategories(
    lines,
    lineRecord,
    recordById,
    ['conditions', 'effects', 'lines'],
    `${indent}  `,
  );

  const childLineReferences = getReferences(lineRecord, 'lines');
  if (childLineReferences.length === 0) {
    return;
  }

  if (visitedLineIds.has(lineRecord.stringId)) {
    lines.push(`${indent}  - Replies: cycle detected; nested lines omitted.`);
    return;
  }

  if (depth >= maxDialogLineRenderDepth) {
    lines.push(`${indent}  - Replies: depth limit reached.`);
    return;
  }

  const nextVisited = new Set(visitedLineIds);
  nextVisited.add(lineRecord.stringId);

  lines.push(`${indent}  - Replies: ${pluralSuffix('line', childLineReferences.length)}`);
  for (const childReference of childLineReferences) {
    renderDialogueLineNode(
      lines,
      childReference,
      recordById,
      dialogTextById,
      nextVisited,
      depth + 2,
    );
  }
};

const renderDialogueRecord = (
  lines: string[],
  record: InspectorRecord,
  recordById: ReadonlyMap<string, InspectorRecord>,
  dialogTextById: ReadonlyMap<string, DialogRecord>,
) => {
  const heading = renderInspectorHeading(record);
  const lineReferences = getReferences(record, 'lines');
  const tag = getStringValue(record, 'tag');
  const fields = formatPrimitiveFields(record, [
    'monologue',
    'for enemies',
    'locked',
    'one at a time',
    'chance permanent',
    'chance temporary',
    'repetition limit',
    'score bonus',
    'target is type',
  ]);

  lines.push(`##### ${escapeTableCell(heading)}`);
  lines.push('');
  lines.push(`- ID: \`${escapeTableCell(record.stringId)}\``);
  lines.push(`- Type: ${renderTypeDescriptor(record.type)}`);
  lines.push(`- Lineage: ${getRecordLineageParts(record).join(' · ')}`);

  if (tag.length > 0) {
    lines.push(`- Tag: ${escapeTableCell(tag)}`);
  }

  if (fields.length > 0) {
    lines.push(`- Fields: ${fields}`);
  }

  renderDialogActionReferences(
    lines,
    'Conditions',
    getReferences(record, 'conditions'),
    recordById,
  );
  renderGenericReferenceCategories(
    lines,
    record,
    recordById,
    ['conditions', 'lines'],
  );

  if (lineReferences.length === 0) {
    lines.push('- Lines: none');
    lines.push('');
    return;
  }

  lines.push(`- Root lines: ${pluralSuffix('line', lineReferences.length)}`);
  lines.push('');
  for (const reference of lineReferences) {
    renderDialogueLineNode(
      lines,
      reference,
      recordById,
      dialogTextById,
      new Set<string>(),
      0,
    );
  }
  lines.push('');
};

const renderStandaloneDialogLine = (
  lines: string[],
  record: InspectorRecord,
  recordById: ReadonlyMap<string, InspectorRecord>,
  dialogTextById: ReadonlyMap<string, DialogRecord>,
) => {
  const reference: Reference = {
    targetId: record.stringId,
    value0: 0,
    value1: 0,
    value2: 0,
  };
  renderDialogueLineNode(
    lines,
    reference,
    recordById,
    dialogTextById,
    new Set<string>(),
    0,
  );
};

const renderDialogStructures = (
  project: ModProject,
  dialogRecords: readonly DialogRecord[],
) => {
  const dialogRelevantRecords = getDialogRelevantRecords(project.inspectorRecords);
  if (dialogRelevantRecords.length === 0) {
    return '';
  }

  const recordById = buildRecordIndex(project.inspectorRecords);
  const dialogTextById = new Map<string, DialogRecord>();
  for (const record of dialogRecords) {
    dialogTextById.set(record.stringId, record);
  }

  const referencedLineIds = collectReferencedDialogLineIds(project.inspectorRecords);
  const byMod = groupInspectorRecordsByMod(dialogRelevantRecords);
  const lines: string[] = [];

  lines.push('### Dialog Structures');
  lines.push('');
  lines.push(
    'FCS dialog model used here: `DIALOGUE_PACKAGE.dialogs` points to dialogue roots; `DIALOGUE.lines` and `DIALOGUE_LINE.lines` point to spoken lines and replies; `conditions` and `effects` point to `DIALOG_ACTION` records. Reference values are preserved as `v0/v1/v2`, with known FCS enum labels added where the source field is understood.',
  );
  lines.push('');

  for (const mod of project.mods) {
    const modName = normalizeModName(mod.fileName);
    const modRecords = byMod.get(modName) ?? [];
    if (modRecords.length === 0) {
      continue;
    }

    const packages = modRecords.filter(
      (record) => record.type === dialoguePackageTypeCode,
    );
    const dialogues = modRecords.filter(
      (record) => record.type === dialogueTypeCode,
    );
    const standaloneLines = modRecords.filter(
      (record) =>
        record.type === dialogueLineTypeCode &&
        !referencedLineIds.has(record.stringId),
    );

    if (
      packages.length === 0 &&
      dialogues.length === 0 &&
      standaloneLines.length === 0
    ) {
      continue;
    }

    lines.push(`#### Dialog Structures · ${escapeTableCell(modName)}`);
    lines.push('');
    lines.push(
      `${pluralSuffix('package', packages.length)} · ${pluralSuffix('dialogue', dialogues.length)} · ${pluralSuffix('standalone line', standaloneLines.length)}`,
    );
    lines.push('');

    if (packages.length > 0) {
      lines.push('##### Dialogue Packages');
      lines.push('');
      for (const record of packages) {
        const heading = renderInspectorHeading(record);
        const tag = getStringValue(record, 'tag');
        const dialogReferences = getReferences(record, 'dialogs');
        const inheritedReferences = getReferences(record, 'inheritsFrom');

        lines.push(`- ${escapeTableCell(heading)} · \`${escapeTableCell(record.stringId)}\``);
        lines.push(`  - Lineage: ${getRecordLineageParts(record).join(' · ')}`);
        if (tag.length > 0) {
          lines.push(`  - Tag: ${escapeTableCell(tag)}`);
        }
        if (dialogReferences.length > 0) {
          lines.push(
            `  - Dialogs: ${pluralSuffix('reference', dialogReferences.length)}${formatReferenceCategoryHint('dialogs')}`,
          );
          for (const reference of dialogReferences) {
            lines.push(
              `    - ${formatResolvedReference(reference, recordById, 'dialogs')}`,
            );
          }
        }
        if (inheritedReferences.length > 0) {
          lines.push(
            `  - Inherits from: ${pluralSuffix('package', inheritedReferences.length)}${formatReferenceCategoryHint('inheritsFrom')}`,
          );
          for (const reference of inheritedReferences) {
            lines.push(
              `    - ${formatResolvedReference(reference, recordById)}`,
            );
          }
        }
      }
      lines.push('');
    }

    if (dialogues.length > 0) {
      lines.push('##### Dialogue Trees');
      lines.push('');
      for (const record of dialogues) {
        renderDialogueRecord(lines, record, recordById, dialogTextById);
      }
    }

    if (standaloneLines.length > 0) {
      lines.push('##### Standalone Dialogue Lines');
      lines.push('');
      lines.push(
        'These `DIALOGUE_LINE` records were not reached from any loaded `DIALOGUE.lines` reference, but they still contain text or dialog metadata.',
      );
      lines.push('');
      for (const record of standaloneLines) {
        renderStandaloneDialogLine(lines, record, recordById, dialogTextById);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
};

const renderExtractedTextRecords = (project: ModProject) => {
  const dialogRecords: DialogRecord[] = [];
  const describedEntityRecords: EntityRecord[] = [];
  const nameOnlyEntityRecords: EntityRecord[] = [];

  for (const record of project.textRecords) {
    if (record.kind === 'dialog') {
      dialogRecords.push(record);
    } else {
      if (record.description.length > 0) {
        describedEntityRecords.push(record);
      } else {
        nameOnlyEntityRecords.push(record);
      }
    }
  }

  if (
    dialogRecords.length === 0 &&
    describedEntityRecords.length === 0 &&
    nameOnlyEntityRecords.length === 0
  ) {
    return '';
  }

  const dialogByMod = groupTextRecordsByMod(dialogRecords);
  const describedEntitiesByMod = groupTextRecordsByMod(describedEntityRecords);
  const nameOnlyEntitiesByMod = groupTextRecordsByMod(nameOnlyEntityRecords);
  const dialogStats = summarizeDialogRecords(dialogRecords);
  const lines: string[] = [];
  lines.push('## Extracted Text Records');
  lines.push('');
  lines.push(
    `Dialog records: ${formatNumber(dialogStats.renderedRecordCount)} shown · Dialog lines: ${formatNumber(dialogStats.renderedTextCount)} shown · Described entities: ${formatNumber(describedEntityRecords.length)} · Name-only entities: ${formatNumber(nameOnlyEntityRecords.length)}`,
  );
  if (dialogStats.omittedEmptyRecordCount > 0 || dialogStats.omittedEmptyTextCount > 0) {
    lines.push('');
    lines.push(
      `Empty-only dialog records omitted: ${formatNumber(dialogStats.omittedEmptyRecordCount)} · Empty dialog variants omitted: ${formatNumber(dialogStats.omittedEmptyTextCount)}`,
    );
  }
  lines.push('');

  lines.push('### Mod Breakdown');
  lines.push('');
  lines.push('| Mod | Dialog records | Dialog lines | Empty-only dialogs omitted | Described entities | Name-only entities |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const mod of project.mods) {
    const modName = normalizeModName(mod.fileName);
    const modDialogRecords = dialogByMod.get(modName) ?? [];
    const modDescribedEntities = describedEntitiesByMod.get(modName) ?? [];
    const modNameOnlyEntities = nameOnlyEntitiesByMod.get(modName) ?? [];
    const modDialogStats = summarizeDialogRecords(modDialogRecords);
    lines.push(
      `| ${escapeTableCell(modName)} | ${formatNumber(modDialogStats.renderedRecordCount)} | ${formatNumber(modDialogStats.renderedTextCount)} | ${formatNumber(modDialogStats.omittedEmptyRecordCount)} | ${formatNumber(modDescribedEntities.length)} | ${formatNumber(modNameOnlyEntities.length)} |`,
    );
  }
  lines.push('');

  const dialogStructureSection = renderDialogStructures(project, dialogRecords);
  if (dialogStructureSection.length > 0) {
    lines.push(dialogStructureSection);
    lines.push('');
  }

  if (describedEntityRecords.length > 0) {
    lines.push('### Entity Descriptions');
    lines.push('');
    for (const [modName, records] of describedEntitiesByMod) {
      lines.push(`#### ${escapeTableCell(modName)}`);
      lines.push('');
      lines.push(`${pluralSuffix('record', records.length)} with descriptions.`);
      lines.push('');
      for (const record of records) {
        const heading = renderEntityHeading(record);
        const metaParts: string[] = [];

        if (heading !== record.stringId) {
          metaParts.push(`ID: \`${escapeTableCell(record.stringId)}\``);
        }

        metaParts.push(`Type: ${renderTypeDescriptor(record.type)}`);
        metaParts.push(...getRecordLineageParts(record));

        lines.push(`##### ${escapeTableCell(heading)}`);
        lines.push('');
        lines.push(`- ${metaParts.join(' · ')}`);
        lines.push('');
        lines.push(formatMultiline(record.description));
        lines.push('');
      }
    }
  }

  if (nameOnlyEntityRecords.length > 0) {
    lines.push('### Name-only Entities');
    lines.push('');
    lines.push(
      'These records were extracted because their names are text-relevant, but they do not carry a description field.',
    );
    lines.push('');
    for (const [modName, records] of nameOnlyEntitiesByMod) {
      lines.push(`#### ${escapeTableCell(modName)}`);
      lines.push('');
      lines.push('| Name | stringId | Type | Change | ID source |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const record of records) {
        const idSource = inferReferenceSource(record.stringId);
        const sourceLabel =
          idSource.length === 0 ? '—' : escapeTableCell(idSource);
        lines.push(
          `| ${escapeTableCell(record.name || '(unnamed)')} | \`${escapeTableCell(record.stringId)}\` | ${record.type} · ${getItemTypeEnglishName(record.type)} | ${escapeTableCell(record.saveData.changeTypeName)} | ${sourceLabel} |`,
        );
      }
      lines.push('');
    }
  }

  if (dialogRecords.length > 0) {
    lines.push('### Dialog Text');
    lines.push('');
    for (const [modName, records] of dialogByMod) {
      const modDialogStats = summarizeDialogRecords(records);
      if (modDialogStats.renderedRecordCount === 0) {
        continue;
      }

      lines.push(`#### ${escapeTableCell(modName)}`);
      lines.push('');
      lines.push(
        `${pluralSuffix('record', modDialogStats.renderedRecordCount)} / ${pluralSuffix('line', modDialogStats.renderedTextCount)} shown.`,
      );
      if (modDialogStats.omittedEmptyRecordCount > 0) {
        lines.push(
          `${pluralSuffix('record', modDialogStats.omittedEmptyRecordCount)} with only empty dialog variants omitted.`,
        );
      }
      lines.push('');
      for (const record of records) {
        const visibleTexts = getVisibleDialogTexts(record);
        if (visibleTexts.length === 0) {
          continue;
        }

        const heading = renderDialogHeading(record);
        const singleText = visibleTexts[0];
        const omittedTextCount = record.texts.length - visibleTexts.length;

        lines.push(`##### ${escapeTableCell(heading)}`);
        lines.push('');

        if (visibleTexts.length === 1 && singleText) {
          const metaParts: string[] = [];

          if (singleText.textId !== 'text0') {
            metaParts.push(`Field: \`${escapeTableCell(singleText.textId)}\``);
          }

          if (omittedTextCount > 0) {
            metaParts.push(`${formatNumber(omittedTextCount)} empty omitted`);
          }

          if (metaParts.length > 0) {
            lines.push(`- ${metaParts.join(' · ')}`);
            lines.push('');
          }

          lines.push(formatMultiline(singleText.original));
          lines.push('');
          continue;
        }

        if (visibleTexts.length > 1) {
          const variationParts = [
            `Variations: ${formatNumber(visibleTexts.length)} shown`,
          ];

          if (omittedTextCount > 0) {
            variationParts.push(`${formatNumber(omittedTextCount)} empty omitted`);
          }

          lines.push(`- ${variationParts.join(' · ')}`);
          lines.push('');
        }

        for (const text of visibleTexts) {
          lines.push(`- \`${escapeTableCell(text.textId)}\``);
          lines.push('');
          lines.push(formatMultiline(text.original));
          lines.push('');
        }
      }
    }
  }

  return lines.join('\n');
};

export const renderProjectMarkdown = (project: ModProject): string => {
  const sections: string[] = [
    renderHeader(project),
    renderNavigation(project),
    renderStructure(project),
    renderDependencies(project.mods),
    renderCategoryBreakdown(project.inspectorRecords),
    renderTypeBreakdown(project.inspectorRecords),
    renderRecordChangeBreakdown(project),
    renderMods(project.mods),
    renderExtractedTextRecords(project),
    renderStringBearingRecords(project.inspectorRecords),
    renderReferenceBearingRecords(project.inspectorRecords),
  ];

  return sections.filter((section) => section.length > 0).join('\n') + '\n';
};
