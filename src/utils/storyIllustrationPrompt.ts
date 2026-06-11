import type { PartnerItem } from '../stores/usePartnerStore';

export interface MatchedStoryCharacter {
  id: string;
  name: string;
  aliases: string[];
  visualImage?: string;
}

const splitCharacterAliases = (card: PartnerItem): string[] => {
  const raw = [card.name, card.fields?.name]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .flatMap((value) => value.split(/[（(]/))
    .map((value) => value.replace(/[）)]/g, '').trim())
    .filter(Boolean);

  return Array.from(new Set(raw));
};

export const detectStoryCharactersFromText = (
  selectedText: string,
  characterCards: PartnerItem[],
): MatchedStoryCharacter[] => {
  const text = selectedText.trim();
  if (!text) return [];

  return characterCards
    .filter((card) => card.type === 'character_card')
    .map((card) => {
      const aliases = splitCharacterAliases(card);
      return {
        id: card.id,
        name: card.fields?.name?.trim() || card.name,
        aliases,
        visualImage: card.fields?.visualImage,
      };
    })
    .filter((card) => card.aliases.some((alias) => alias && text.includes(alias)));
};

export const buildStoryIllustrationPrompt = ({
  selectedText,
  matchedCharacters,
}: {
  selectedText: string;
  matchedCharacters: MatchedStoryCharacter[];
}) => {
  const trimmed = selectedText.trim();
  const characterLine = matchedCharacters.length > 0
    ? `涉及角色：${matchedCharacters.map((character) => character.name).join('、')}。请保持角色外观、服装结构、年龄感和氛围一致。`
    : '如果原文中有人物，请根据文本自行提炼角色形象，避免脸部崩坏与服装错乱。';

  return [
    '请根据以下小说片段生成一张高完成度的剧情插图。',
    '',
    '片段内容：',
    trimmed,
    '',
    characterLine,
    '画面要求： cinematic story illustration, cohesive composition, clear subject focus, polished lighting, rich atmosphere, high detail, no text, no watermark.',
    '构图要求：优先展现片段中最有戏剧张力的瞬间，突出角色关系、动作和场景环境；如果是多人场景，确保角色之间的站位和视线关系清晰。',
    '风格要求：画面精致统一，适合作为网文章节剧情插图，人物比例自然，环境与情绪呼应文本。',
  ].join('\n');
};
