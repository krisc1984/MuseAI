import { describe, expect, it } from 'vitest';
import { compileItemToMarkdown, normalizePartnerFields, PartnerItemFields } from '../stores/usePartnerStore';

describe('角色视觉图字段', () => {
  it('规范化并保留角色视觉图字段', () => {
    const fields = normalizePartnerFields({
      name: '沈照夜',
      visualImage: 'data:image/png;base64,TEST',
      visualImagePrompt: '请生成角色图',
      visualImageType: 'portrait',
      visualImageStyle: '中式古风金缕风',
      visualImageGallery: [
        {
          id: 'gallery-1',
          image: 'data:image/png;base64,GALLERY',
          type: 'portrait',
          style: '中式古风金缕风',
          title: '正面设定',
          note: '适合作为角色主图',
          source: 'generated',
        },
      ],
    } as PartnerItemFields);

    expect(fields.visualImage).toBe('data:image/png;base64,TEST');
    expect(fields.visualImagePrompt).toBe('请生成角色图');
    expect(fields.visualImageType).toBe('portrait');
    expect(fields.visualImageStyle).toBe('中式古风金缕风');
    expect(fields.visualImageGallery).toEqual([
      expect.objectContaining({
        id: 'gallery-1',
        image: 'data:image/png;base64,GALLERY',
        type: 'portrait',
        style: '中式古风金缕风',
        title: '正面设定',
        note: '适合作为角色主图',
        source: 'generated',
      }),
    ]);
  });

  it('编译角色卡 Markdown 时写入视觉图元信息但不写入 base64 图片', () => {
    const markdown = compileItemToMarkdown('沈照夜', 'character_card', {
      name: '沈照夜',
      visualImage: 'data:image/png;base64,TEST',
      visualImagePrompt: '请生成角色图',
      visualImageType: 'turnaround',
      visualImageStyle: '古风水墨动态风',
    } as PartnerItemFields);

    expect(markdown).toContain('## 角色视觉图');
    expect(markdown).toContain('**图片类型**：角色三视图');
    expect(markdown).toContain('**艺术风格**：古风水墨动态风');
    expect(markdown).toContain('**图片提示词**：请生成角色图');
    expect(markdown).not.toContain('data:image/png;base64,TEST');
  });
});
