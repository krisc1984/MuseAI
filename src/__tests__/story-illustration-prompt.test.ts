import { describe, expect, it } from 'vitest';
import { buildStoryIllustrationPrompt, detectStoryCharactersFromText } from '../utils/storyIllustrationPrompt';

describe('story illustration prompt helpers', () => {
  it('detects mentioned characters from selected text', () => {
    const characters = detectStoryCharactersFromText('沈照夜抬手拦住了林溪。', [
      {
        id: 'char-1',
        name: '沈照夜（男主）',
        type: 'character_card',
        content: '',
        fields: { name: '沈照夜', visualImage: 'data:image/png;base64,AAA' },
      },
      {
        id: 'char-2',
        name: '林溪',
        type: 'character_card',
        content: '',
        fields: {},
      },
    ]);

    expect(characters).toEqual([
      expect.objectContaining({ id: 'char-1', name: '沈照夜', visualImage: 'data:image/png;base64,AAA' }),
      expect.objectContaining({ id: 'char-2', name: '林溪' }),
    ]);
  });

  it('builds a story illustration prompt with matched characters', () => {
    const prompt = buildStoryIllustrationPrompt({
      selectedText: '沈照夜站在雨夜长街尽头。',
      matchedCharacters: [{ id: 'char-1', name: '沈照夜', aliases: ['沈照夜'], visualImage: 'data:image/png;base64,AAA' }],
    });

    expect(prompt).toContain('请根据以下小说片段生成一张高完成度的剧情插图');
    expect(prompt).toContain('沈照夜站在雨夜长街尽头');
    expect(prompt).toContain('涉及角色：沈照夜');
  });
});
