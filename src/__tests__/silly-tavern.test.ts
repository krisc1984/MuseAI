import { describe, expect, it } from 'vitest';
import type { PartnerItem } from '../stores/usePartnerStore';
import {
  buildSillyTavernCharacterCard,
  buildSillyTavernUserPersona,
  buildSillyTavernWorldbook,
  mergeUserPersonaFields,
} from '../utils/sillyTavern';

describe('SillyTavern exporters', () => {
  const character: PartnerItem = {
    id: 'cc-1',
    name: '陆雪莹',
    type: 'character_card',
    content: '',
    fields: {
      age: '22岁',
      gender: '女',
      race: '人类',
      occupation: '研究员',
      externalPersonality: '冷静克制',
      internalPersonality: '内心炽热',
      speakingStyle: '语速偏快，术语很多',
      backgroundStory: '她在废墟中长大，后来进入浮空城学院。',
      userRelationType: '并肩作战的伙伴',
      userInteractionModel: '先试探，后信任',
      identityTags: ['研究员', '理想主义者'],
    },
  };

  it('builds a valid v2 character card payload', () => {
    const payload = buildSillyTavernCharacterCard(character, '以太纪元');

    expect(payload.spec).toBe('chara_card_v2');
    expect(payload.spec_version).toBe('2.0');
    expect(payload.data.name).toBe('陆雪莹');
    expect(payload.data.personality).toContain('冷静克制');
    expect(payload.data.scenario).toContain('以太纪元');
    expect(payload.data.tags).toContain('研究员');
  });

  it('builds a worldbook with structured entries', () => {
    const payload = buildSillyTavernWorldbook({
      id: 'wb-1',
      name: '以太纪元',
      type: 'world_book',
      content: '',
      fields: {
        theme: '魔法与科技碰撞',
        era: '新历312年',
        geography: '中央浮空城与外围废土',
        conflict: '晶石枯竭引发内战',
      },
    });

    expect(Object.keys(payload.entries).length).toBeGreaterThan(1);
    expect(payload.entries['0'].constant).toBe(true);
    expect(payload.entries['0'].content).toContain('魔法与科技碰撞');
  });

  it('builds a portable user persona export', () => {
    const payload = buildSillyTavernUserPersona({
      name: '顾迟',
      backgroundStory: '来自边境的小镇调查员',
      externalPersonality: '沉稳寡言',
      personaDescription: '[身份与处境]\n边境调查员\n\n[与角色相关的气质]\n冷静克制',
    });

    expect(payload.name).toBe('顾迟');
    expect(payload.user_persona).toContain('[身份与处境]');
    expect(payload.fields.personaDescription).toContain('冷静克制');
  });

  it('merges selected character card fields with fallback user info', () => {
    const fields = mergeUserPersonaFields(
      {
        name: '顾迟',
        occupation: '调查员',
      },
      {
        name: '备用姓名',
        personaDescription: '[身份与处境]\n边境调查员',
        externalPersonality: '沉稳冷静',
      },
    );

    expect(fields.name).toBe('顾迟');
    expect(fields.occupation).toBe('调查员');
    expect(fields.personaDescription).toContain('边境调查员');
    expect(fields.externalPersonality).toBe('沉稳冷静');
  });
});
