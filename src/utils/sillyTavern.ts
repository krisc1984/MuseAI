import type { PartnerItem, PartnerItemFields } from '../stores/usePartnerStore';

export interface SillyTavernCharacterCard {
  spec: 'chara_card_v2';
  spec_version: '2.0';
  data: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    creator_notes: string;
    system_prompt: string;
    post_history_instructions: string;
    alternate_greetings: string[];
    tags: string[];
    creator: string;
    character_version: string;
    extensions: Record<string, unknown>;
  };
}

export interface SillyTavernWorldbookEntry {
  uid: number;
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  constant: boolean;
  vectorized: boolean;
  selective: boolean;
  selectiveLogic: number;
  addMemo: boolean;
  order: number;
  position: number;
  disable: boolean;
  ignoreBudget: boolean;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  matchPersonaDescription: boolean;
  matchCharacterDescription: boolean;
  matchCharacterPersonality: boolean;
  matchCharacterDepthPrompt: boolean;
  matchScenario: boolean;
  matchCreatorNotes: boolean;
  delayUntilRecursion: number;
  probability: number;
  useProbability: boolean;
  depth: number;
  outletName: string;
  group: string;
  groupOverride: boolean;
  groupWeight: number;
  scanDepth: null;
  caseSensitive: null;
  matchWholeWords: null;
  useGroupScoring: null;
  automationId: string;
  role: number;
  sticky: null;
  cooldown: null;
  delay: null;
  triggers: string[];
}

export interface SillyTavernWorldbook {
  entries: Record<string, SillyTavernWorldbookEntry>;
}

export interface SillyTavernUserPersonaExport {
  name: string;
  description: string;
  user_persona: string;
  fields: PartnerItemFields;
}

const CREATOR = 'MuseAI';

const trim = (value?: string) => (value || '').trim();

const pickLines = (...values: Array<string | undefined>) =>
  values.map(trim).filter(Boolean);

const pushSection = (sections: string[], title: string, lines: string[]) => {
  if (lines.length === 0) return;
  sections.push(`[${title}]`);
  sections.push(lines.join('\n'));
};

const splitKeywords = (value: string) =>
  value
    .split(/[\n,，、；;：: ]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

const unique = <T,>(items: T[]) => [...new Set(items)];

const summarizeCharacterDescription = (name: string, fields: PartnerItemFields) => {
  const sections: string[] = [];
  pushSection(sections, '人物底色', pickLines(
    `姓名：${name}`,
    trim(fields.age) && `年龄：${trim(fields.age)}`,
    trim(fields.gender) && `性别：${trim(fields.gender)}`,
    trim(fields.race) && `种族：${trim(fields.race)}`,
    trim(fields.heightBuild) && `身高体型：${trim(fields.heightBuild)}`,
    trim(fields.iconicFeatures) && `标志特征：${trim(fields.iconicFeatures)}`,
  ));
  pushSection(sections, '当下处境', pickLines(
    trim(fields.occupation) && `职业身份：${trim(fields.occupation)}`,
    trim(fields.socialClass) && `社会阶层：${trim(fields.socialClass)}`,
    trim(fields.birthplace) && `出生地：${trim(fields.birthplace)}`,
    trim(fields.backgroundStory),
  ));
  pushSection(sections, '关系结构', pickLines(
    trim(fields.relationships),
    trim(fields.userRelationType) && `与用户关系：${trim(fields.userRelationType)}`,
    trim(fields.userInteractionModel) && `相处模式：${trim(fields.userInteractionModel)}`,
    trim(fields.userRelationBottomLine) && `关系底线：${trim(fields.userRelationBottomLine)}`,
  ));
  pushSection(sections, '说话与反应', pickLines(
    trim(fields.speakingStyle),
    trim(fields.typicalReactions),
    trim(fields.keyEvents),
  ));
  pushSection(sections, '能力补充', pickLines(
    trim(fields.skills),
    trim(fields.clothingStyle) && `衣着风格：${trim(fields.clothingStyle)}`,
    trim(fields.overallVibe) && `整体气质：${trim(fields.overallVibe)}`,
  ));
  return sections.join('\n\n');
};

const summarizeCharacterPersonality = (fields: PartnerItemFields) =>
  pickLines(
    trim(fields.externalPersonality),
    trim(fields.internalPersonality),
    trim(fields.coreDesire) && `核心欲望：${trim(fields.coreDesire)}`,
    trim(fields.fearWeakness) && `恐惧与弱点：${trim(fields.fearWeakness)}`,
    trim(fields.moralValues) && `道德观念：${trim(fields.moralValues)}`,
    trim(fields.quirk) && `怪癖：${trim(fields.quirk)}`,
  ).join('\n');

const summarizeCharacterScenario = (fields: PartnerItemFields, worldName?: string) =>
  pickLines(
    trim(worldName) && `世界背景：${trim(worldName)}`,
    trim(fields.userRelationType) && `你与 {{user}} 的初始关系是：${trim(fields.userRelationType)}`,
    trim(fields.userInteractionModel) && `通常互动模式：${trim(fields.userInteractionModel)}`,
  ).join('\n');

const buildWorldbookEntry = (
  uid: number,
  comment: string,
  content: string,
  keys: string[],
  constant = false,
): SillyTavernWorldbookEntry => ({
  uid,
  key: unique(keys).slice(0, 8),
  keysecondary: [],
  comment,
  content,
  constant,
  vectorized: false,
  selective: false,
  selectiveLogic: 0,
  addMemo: true,
  order: 100,
  position: 0,
  disable: false,
  ignoreBudget: false,
  excludeRecursion: false,
  preventRecursion: false,
  matchPersonaDescription: false,
  matchCharacterDescription: false,
  matchCharacterPersonality: false,
  matchCharacterDepthPrompt: false,
  matchScenario: false,
  matchCreatorNotes: false,
  delayUntilRecursion: 0,
  probability: 100,
  useProbability: true,
  depth: 4,
  outletName: '',
  group: '',
  groupOverride: false,
  groupWeight: 100,
  scanDepth: null,
  caseSensitive: null,
  matchWholeWords: null,
  useGroupScoring: null,
  automationId: '',
  role: 0,
  sticky: null,
  cooldown: null,
  delay: null,
  triggers: [],
});

export const buildSillyTavernCharacterCard = (
  item: PartnerItem,
  worldName = '',
): SillyTavernCharacterCard => {
  const fields = item.fields || {};
  const tags = unique([...(fields.identityTags || []), trim(fields.occupation), trim(fields.race)].filter(Boolean));
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: item.name,
      description: summarizeCharacterDescription(item.name, fields),
      personality: summarizeCharacterPersonality(fields),
      scenario: summarizeCharacterScenario(fields, worldName),
      first_mes: trim(fields.speakingStyle)
        ? `（${item.name}打量着{{user}}，语气${trim(fields.speakingStyle)}）`
        : '',
      mes_example: '',
      creator_notes: trim(fields.backgroundStory) || trim(fields.keyEvents),
      system_prompt: '',
      post_history_instructions: '',
      alternate_greetings: [],
      tags,
      creator: CREATOR,
      character_version: 'v1.0',
      extensions: worldName ? { world: worldName } : {},
    },
  };
};

export const buildSillyTavernWorldbook = (item: PartnerItem): SillyTavernWorldbook => {
  const fields = item.fields || {};
  const entries = [
    {
      comment: '世界总览',
      content: pickLines(
        trim(fields.theme) && `该世界的核心主题是：${trim(fields.theme)}`,
        trim(fields.era) && `时代背景：${trim(fields.era)}`,
        trim(fields.techLevel) && `科技水平：${trim(fields.techLevel)}`,
        trim(fields.magicLevel) && `魔法水平：${trim(fields.magicLevel)}`,
      ).join('\n'),
      keys: unique([item.name, ...splitKeywords(`${fields.theme || ''} ${fields.era || ''}`)].filter(Boolean)),
      constant: true,
    },
    {
      comment: '地理格局',
      content: trim(fields.geography),
      keys: splitKeywords(`${item.name} ${fields.geography || ''}`),
    },
    {
      comment: '关键场景',
      content: trim(fields.keyScenes),
      keys: splitKeywords(fields.keyScenes || ''),
    },
    {
      comment: '文化特色',
      content: trim(fields.culturalFeatures),
      keys: splitKeywords(fields.culturalFeatures || ''),
    },
    {
      comment: '历史事件',
      content: trim(fields.history),
      keys: splitKeywords(fields.history || ''),
    },
    {
      comment: '核心矛盾',
      content: trim(fields.conflict),
      keys: splitKeywords(fields.conflict || ''),
    },
  ]
    .filter((entry) => trim(entry.content))
    .concat(
      (fields.customFields || [])
        .filter((field) => trim(field.value))
        .map((field) => ({
          comment: trim(field.label) || '补充设定',
          content: trim(field.value),
          keys: splitKeywords(`${field.label} ${field.value}`),
          constant: false,
        })),
    );

  return {
    entries: Object.fromEntries(
      entries.map((entry, index) => [
        String(index),
        buildWorldbookEntry(index, entry.comment, entry.content, entry.keys, entry.constant),
      ]),
    ),
  };
};

export const buildSillyTavernUserPersona = (
  fields: PartnerItemFields,
): SillyTavernUserPersonaExport => {
  const name = trim(fields.name) || '未命名用户';
  const description = trim(fields.personaDescription) || pickLines(
    trim(fields.backgroundStory),
    trim(fields.externalPersonality) && `外在气质：${trim(fields.externalPersonality)}`,
    trim(fields.internalPersonality) && `内在倾向：${trim(fields.internalPersonality)}`,
  ).join('\n');

  return {
    name,
    description,
    user_persona: description,
    fields,
  };
};

export const mergeUserPersonaFields = (
  primary?: Partial<PartnerItemFields>,
  fallback?: Partial<PartnerItemFields>,
): PartnerItemFields => {
  const merged = {
    ...(fallback || {}),
    ...(primary || {}),
  } as PartnerItemFields;

  if ((!merged.identityTags || merged.identityTags.length === 0) && fallback?.identityTags?.length) {
    merged.identityTags = fallback.identityTags;
  }

  if ((!merged.customFields || merged.customFields.length === 0) && fallback?.customFields?.length) {
    merged.customFields = fallback.customFields;
  }

  if ((!merged.visualImageGallery || merged.visualImageGallery.length === 0) && fallback?.visualImageGallery?.length) {
    merged.visualImageGallery = fallback.visualImageGallery;
  }

  return merged;
};
