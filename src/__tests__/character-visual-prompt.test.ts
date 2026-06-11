import { describe, expect, it } from 'vitest';
import { buildCharacterVisualPrompt } from '../utils/characterVisualPrompt';

const fields = {
  name: '沈照夜',
  age: '二十岁',
  gender: '男',
  occupation: '镇妖司指挥使',
  identityTags: ['冷面权臣', '旧伤未愈'],
  heightBuild: '高挑清瘦',
  iconicFeatures: '左眼下有一颗小痣',
  clothingStyle: '玄色锦袍，银线暗纹',
  overallVibe: '克制、危险、疏离',
  externalPersonality: '寡言冷淡',
  internalPersonality: '隐忍深情',
  backgroundStory: '年少时被卷入宫变。',
};

describe('角色视觉图 Prompt', () => {
  it('默认生成角色图提示词', () => {
    const prompt = buildCharacterVisualPrompt({
      characterName: '沈照夜',
      fields,
      imageType: 'portrait',
      style: '中式古风金缕风',
    });

    expect(prompt).toContain('请为小说角色「沈照夜」生成角色图');
    expect(prompt).toContain('身份标签：冷面权臣、旧伤未愈');
    expect(prompt).toContain('艺术风格：中式古风金缕风');
    expect(prompt).toContain('生成单人角色主视觉');
  });

  it('生成三视图时使用高端角色设定卡模板', () => {
    const prompt = buildCharacterVisualPrompt({
      characterName: '沈照夜',
      fields,
      imageType: 'turnaround',
      style: '古风水墨动态风',
    });

    expect(prompt).toContain('请生成一张高端人物角色设定卡');
    expect(prompt).toContain('主角：【沈照夜】');
    expect(prompt).toContain('角色设定：【镇妖司指挥使】，年龄22岁，身高170cm；');
    expect(prompt).toContain('外貌特征：【左眼下有一颗小痣，高挑清瘦】；');
    expect(prompt).toContain('中间区域展示角色正面、侧面、背面标准三视图');
    expect(prompt).toContain('右侧排列6个面部表情头像（平静、微笑、眨眼、认真、惊讶、思考）');
    expect(prompt).toContain('全页面所有视角、表情、服饰细节角色形象高度统一');
  });

  it('生成表情图时包含多表情要求', () => {
    const prompt = buildCharacterVisualPrompt({
      characterName: '沈照夜',
      fields,
      imageType: 'expression',
      style: '欧式暗黑华丽风',
    });

    expect(prompt).toContain('生成角色表情图');
    expect(prompt).toContain('喜悦、愤怒、悲伤、惊讶');
  });
});
