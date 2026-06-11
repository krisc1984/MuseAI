# Character Visual Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Chinese-only character visual generation flow in the role detail page, allowing one selected character card to generate a portrait, turnaround sheet, or expression sheet through an OpenAI-compatible image API and save the result back to the character card.

**Architecture:** Keep the feature frontend-only for the first slice. Add durable visual fields to the partner store, isolate prompt/API logic in utility modules, and add a focused modal inside `Background.tsx` that reads the selected character card and writes generated image metadata through the existing `updateItemFields` action.

**Tech Stack:** React 19, TypeScript, Ant Design 6, Zustand, Vitest, Tauri frontend runtime.

---

## Source Documents

- Design: `docs/designs/character-visual-generation.md`
- Main page: `src/pages/Background.tsx`
- Store: `src/stores/usePartnerStore.ts`
- Settings: `src/stores/useSettingsStore.ts`
- Test setup: `src/test/setup.ts`

## Constraints

- Follow repository UI rule: all user-visible text must be Chinese.
- Keep the default generation type single-select, with `角色图` selected by default.
- Do not implement batch generation.
- Do not implement mobile pages in this plan.
- Do not store base64 image data inside compiled Markdown content.
- Use TDD: write a failing test before implementation for each behavior slice.
- After code changes, run `npm run build`; if Rust files are not changed, `cargo test` is not required for this feature.

## Task 1: Add Character Visual Field Support In Partner Store

**Files:**
- Modify: `src/stores/usePartnerStore.ts`
- Test: `src/__tests__/partner-store-character-visual.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/partner-store-character-visual.test.ts`:

```ts
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
    } as PartnerItemFields);

    expect(fields.visualImage).toBe('data:image/png;base64,TEST');
    expect(fields.visualImagePrompt).toBe('请生成角色图');
    expect(fields.visualImageType).toBe('portrait');
    expect(fields.visualImageStyle).toBe('中式古风金缕风');
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
```

**Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- src/__tests__/partner-store-character-visual.test.ts
```

Expected: FAIL because the visual fields are not normalized or compiled yet.

**Step 3: Write minimal implementation**

In `src/stores/usePartnerStore.ts`, extend `PartnerItemFields`:

```ts
  visualImage?: string;
  visualImagePrompt?: string;
  visualImageType?: 'portrait' | 'turnaround' | 'expression';
  visualImageStyle?: string;
```

Add visual text fields to the `textFields` array inside `normalizePartnerFields`:

```ts
    'visualImage',
    'visualImagePrompt',
    'visualImageType',
    'visualImageStyle',
```

Add helpers near the existing Markdown helpers:

```ts
const VISUAL_IMAGE_TYPE_LABELS: Record<string, string> = {
  portrait: '角色图',
  turnaround: '角色三视图',
  expression: '角色表情图',
};

const buildCharacterVisualSection = (fields: PartnerItemFields) => {
  const lines = [
    formatFieldLine('图片类型', fields.visualImageType ? VISUAL_IMAGE_TYPE_LABELS[fields.visualImageType] || fields.visualImageType : ''),
    formatFieldLine('艺术风格', fields.visualImageStyle),
    formatFieldLine('图片提示词', fields.visualImagePrompt),
  ].filter(Boolean);

  if (lines.length === 0) return '';
  return `## 角色视觉图\n${lines.join('\n')}\n\n`;
};
```

In the character card branch of `compileItemToMarkdown`, include the visual section before custom fields:

```ts
const visual = buildCharacterVisualSection(fields);
return `# 角色卡：${name}\n\n${basic}${identity}${appearance}${personality}${skills}${background}${relationships}${speaking}${reactions}${memory}${events}${visual}${custom}`.trim() + '\n';
```

**Step 4: Run test to verify it passes**

Run:

```powershell
npm test -- src/__tests__/partner-store-character-visual.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/stores/usePartnerStore.ts src/__tests__/partner-store-character-visual.test.ts
git commit -m "feat: add character visual fields"
```

## Task 2: Add Image Generation API Utility

**Files:**
- Create: `src/utils/openaiImageGeneration.ts`
- Test: `src/__tests__/openai-image-generation.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/openai-image-generation.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateOpenAIImage, normalizeImageBaseUrl } from '../utils/openaiImageGeneration';

describe('图片生成 API 工具', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('规范化 OpenAI Base URL', () => {
    expect(normalizeImageBaseUrl('')).toBe('https://api.openai.com/v1');
    expect(normalizeImageBaseUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1');
    expect(normalizeImageBaseUrl('https://api.example.com/v1/chat/completions')).toBe('https://api.example.com/v1');
  });

  it('调用图片生成接口并返回 data URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'IMAGE_BASE64' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateOpenAIImage({
      apiKey: 'key',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-image-2',
      prompt: '请生成角色图',
      size: '1024x1024',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer key',
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(result.imageDataUrl).toBe('data:image/png;base64,IMAGE_BASE64');
  });

  it('接口失败时抛出中文错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'model not found' } }),
    }));

    await expect(generateOpenAIImage({
      apiKey: 'key',
      model: 'gpt-image-2',
      prompt: '请生成角色图',
    })).rejects.toThrow('角色视觉图生成失败：model not found');
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- src/__tests__/openai-image-generation.test.ts
```

Expected: FAIL because `openaiImageGeneration.ts` does not exist.

**Step 3: Write minimal implementation**

Create `src/utils/openaiImageGeneration.ts`:

```ts
export type OpenAIImageSize = '1024x1024' | '1024x1536' | '1536x1024';

export interface GenerateImageRequest {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  size?: OpenAIImageSize;
}

export interface GenerateImageResult {
  imageDataUrl: string;
}

export const DEFAULT_IMAGE_MODEL = 'gpt-image-2';

export const normalizeImageBaseUrl = (baseUrl?: string) => {
  const trimmed = (baseUrl || '').trim();
  if (!trimmed) return 'https://api.openai.com/v1';

  return trimmed
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/responses$/, '')
    .replace(/\/images\/generations$/, '');
};

const readErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

export const generateOpenAIImage = async (request: GenerateImageRequest): Promise<GenerateImageResult> => {
  const apiKey = request.apiKey.trim();
  if (!apiKey) {
    throw new Error('图片生成 API Key 尚未配置，请先在设置页配置。');
  }

  const response = await fetch(`${normalizeImageBaseUrl(request.baseUrl)}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model || DEFAULT_IMAGE_MODEL,
      prompt: request.prompt,
      size: request.size || '1024x1024',
    }),
  });

  if (!response.ok) {
    throw new Error(`角色视觉图生成失败：${await readErrorMessage(response)}`);
  }

  const data = await response.json();
  const imageBase64 = data?.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error('角色视觉图生成失败：模型没有返回图片。');
  }

  return { imageDataUrl: `data:image/png;base64,${imageBase64}` };
};
```

**Step 4: Run test to verify it passes**

Run:

```powershell
npm test -- src/__tests__/openai-image-generation.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/utils/openaiImageGeneration.ts src/__tests__/openai-image-generation.test.ts
git commit -m "feat: add OpenAI image generation utility"
```

## Task 3: Add Prompt Builder For Character Visuals

**Files:**
- Create: `src/utils/characterVisualPrompt.ts`
- Test: `src/__tests__/character-visual-prompt.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/character-visual-prompt.test.ts`:

```ts
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

  it('生成三视图时包含正面侧面背面要求', () => {
    const prompt = buildCharacterVisualPrompt({
      characterName: '沈照夜',
      fields,
      imageType: 'turnaround',
      style: '古风水墨动态风',
    });

    expect(prompt).toContain('生成角色三视图');
    expect(prompt).toContain('正面、侧面、背面');
    expect(prompt).toContain('同一服装、同一发型、同一体型');
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
```

**Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- src/__tests__/character-visual-prompt.test.ts
```

Expected: FAIL because `characterVisualPrompt.ts` does not exist.

**Step 3: Write minimal implementation**

Create `src/utils/characterVisualPrompt.ts`:

```ts
import { PartnerItemFields } from '../stores/usePartnerStore';

export type CharacterVisualImageType = 'portrait' | 'turnaround' | 'expression';

export const CHARACTER_VISUAL_TYPE_LABELS: Record<CharacterVisualImageType, string> = {
  portrait: '角色图',
  turnaround: '角色三视图',
  expression: '角色表情图',
};

const TYPE_REQUIREMENTS: Record<CharacterVisualImageType, string> = {
  portrait: '生成单人角色主视觉，可以是半身或全身构图，突出角色气质、服装、姿态和标志性特征。',
  turnaround: '生成同一角色的三视图，包含正面、侧面、背面。同一服装、同一发型、同一体型，浅色或白色背景，适合角色设定参考。',
  expression: '生成同一角色的表情设定图，九宫格或多格构图，包含喜悦、愤怒、悲伤、惊讶、害羞、冷漠、警惕、温柔、崩溃等表情。同一发型、同一服装、同一脸部特征。',
};

const line = (label: string, value?: string | string[]) => {
  const text = Array.isArray(value) ? value.filter(Boolean).join('、') : (value || '').trim();
  return text ? `${label}：${text}` : '';
};

export const buildCharacterVisualPrompt = ({
  characterName,
  fields,
  imageType,
  style,
}: {
  characterName: string;
  fields: PartnerItemFields;
  imageType: CharacterVisualImageType;
  style: string;
}) => {
  const name = characterName || fields.name || '未命名角色';
  const details = [
    line('姓名', name),
    line('年龄', fields.age),
    line('性别', fields.gender),
    line('种族', fields.race),
    line('职业', fields.occupation),
    line('身份标签', fields.identityTags),
    line('身高体型', fields.heightBuild),
    line('标志性特征', fields.iconicFeatures),
    line('衣着风格', fields.clothingStyle),
    line('整体气质', fields.overallVibe),
    line('外在性格', fields.externalPersonality),
    line('内在性格', fields.internalPersonality),
    line('背景故事', fields.backgroundStory),
  ].filter(Boolean).join('\n');

  return [
    `请为小说角色「${name}」生成${CHARACTER_VISUAL_TYPE_LABELS[imageType]}。`,
    '',
    '角色设定：',
    details || `姓名：${name}`,
    '',
    `艺术风格：${style}`,
    '',
    '画面要求：',
    '清晰角色设计，完整可读的服装与轮廓，避免文字、水印、畸形手指、重复面部。',
    TYPE_REQUIREMENTS[imageType],
  ].join('\n');
};
```

**Step 4: Run test to verify it passes**

Run:

```powershell
npm test -- src/__tests__/character-visual-prompt.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/utils/characterVisualPrompt.ts src/__tests__/character-visual-prompt.test.ts
git commit -m "feat: add character visual prompt builder"
```

## Task 4: Add Role Detail Button And Modal Shell

**Files:**
- Modify: `src/pages/Background.tsx`
- Test: `src/__tests__/character-visual-generation.test.tsx`

**Step 1: Write the failing test**

Create `src/__tests__/character-visual-generation.test.tsx` with only the first UI behavior:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Background from '../pages/Background';
import { usePartnerStore } from '../stores/usePartnerStore';
import { useSettingsStore } from '../stores/useSettingsStore';

describe('角色视觉图生成入口', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      llmApiKey: 'key',
      llmBaseUrl: 'https://api.example.com/v1',
      llmModel: 'gpt-4.1',
    });
    usePartnerStore.setState({
      worldBooks: [{ id: 'world-1', name: '世界', type: 'world_book', content: '', fields: { theme: '玄幻' } }],
      characterCards: [{ id: 'char-1', name: '沈照夜', type: 'character_card', content: '', fields: { name: '沈照夜', clothingStyle: '玄色锦袍' } }],
      selectedId: 'char-1',
      selectedType: 'character_card',
    });
  });

  it('选中角色卡时显示生成角色图按钮并打开弹窗', () => {
    render(<Background />);

    fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));

    expect(screen.getByText('生成角色视觉图')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '角色图' })).toBeChecked();
    expect(screen.getByText('角色三视图')).toBeInTheDocument();
    expect(screen.getByText('角色表情图')).toBeInTheDocument();
  });

  it('选中世界书时不显示生成角色图按钮', () => {
    usePartnerStore.setState({ selectedId: 'world-1', selectedType: 'world_book' });

    render(<Background />);

    expect(screen.queryByRole('button', { name: /生成角色图/ })).not.toBeInTheDocument();
  });
});
```

If this test is too noisy because `Background.tsx` has many existing side effects, keep this as the target behavior but add only the minimal mocks required by the current test setup.

**Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- src/__tests__/character-visual-generation.test.tsx
```

Expected: FAIL because no button or modal exists.

**Step 3: Write minimal implementation**

In `src/pages/Background.tsx`:

1. Add imports:

```ts
import { PictureOutlined } from '@ant-design/icons';
import type { CharacterVisualImageType } from '../utils/characterVisualPrompt';
```

2. Add constants near the top:

```ts
const CHARACTER_VISUAL_STYLES = [
  '3D建模游戏CG风',
  '欧式暗黑华丽风',
  '中式古风金缕风',
  '古风水墨动态风',
  '赛博朋克废土风',
  '西方古典油画风',
];
```

3. Add state inside `Background`:

```ts
const [isVisualModalOpen, setIsVisualModalOpen] = useState(false);
const [visualStyle, setVisualStyle] = useState(CHARACTER_VISUAL_STYLES[0]);
const [customVisualStyle, setCustomVisualStyle] = useState('');
const [visualImageType, setVisualImageType] = useState<CharacterVisualImageType>('portrait');
```

4. Add a button in the selected item header where existing action buttons live:

```tsx
{selectedItem.type === 'character_card' && (
  <Button
    icon={<PictureOutlined />}
    onClick={() => setIsVisualModalOpen(true)}
    style={{ borderColor: '#d97757', color: '#d97757' }}
  >
    生成角色图
  </Button>
)}
```

5. Add a minimal modal near the other modals:

```tsx
<Modal
  title="生成角色视觉图"
  open={isVisualModalOpen}
  onCancel={() => setIsVisualModalOpen(false)}
  footer={null}
  width={860}
>
  <div>
    <h3>选择艺术风格</h3>
    <Radio.Group value={visualStyle} onChange={(event) => setVisualStyle(event.target.value)}>
      {CHARACTER_VISUAL_STYLES.map((style) => (
        <Radio.Button key={style} value={style}>{style}</Radio.Button>
      ))}
    </Radio.Group>
    <h3>自定义风格</h3>
    <Input
      value={customVisualStyle}
      onChange={(event) => setCustomVisualStyle(event.target.value)}
      placeholder="例如：紫调月夜、冷白光、细腻厚涂、东方玄幻..."
    />
    <h3>选择生成类型</h3>
    <Radio.Group value={visualImageType} onChange={(event) => setVisualImageType(event.target.value)}>
      <Radio value="portrait">角色图</Radio>
      <Radio value="turnaround">角色三视图</Radio>
      <Radio value="expression">角色表情图</Radio>
    </Radio.Group>
    <div>生成后将在这里预览角色视觉图</div>
  </div>
</Modal>
```

**Step 4: Run test to verify it passes**

Run:

```powershell
npm test -- src/__tests__/character-visual-generation.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/pages/Background.tsx src/__tests__/character-visual-generation.test.tsx
git commit -m "feat: add character visual modal shell"
```

## Task 5: Wire Modal To Prompt Builder And Image API

**Files:**
- Modify: `src/pages/Background.tsx`
- Test: `src/__tests__/character-visual-generation.test.tsx`

**Step 1: Extend the failing test**

In `src/__tests__/character-visual-generation.test.tsx`, mock the API utility and add generation behavior:

```tsx
import { waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { generateOpenAIImage } from '../utils/openaiImageGeneration';

vi.mock('../utils/openaiImageGeneration', () => ({
  DEFAULT_IMAGE_MODEL: 'gpt-image-2',
  generateOpenAIImage: vi.fn(),
}));

it('生成成功后把图片写回当前角色卡', async () => {
  vi.mocked(generateOpenAIImage).mockResolvedValue({
    imageDataUrl: 'data:image/png;base64,IMAGE',
  });

  render(<Background />);

  fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));
  fireEvent.click(screen.getByRole('radio', { name: '角色三视图' }));
  fireEvent.change(screen.getByPlaceholderText('例如：紫调月夜、冷白光、细腻厚涂、东方玄幻...'), {
    target: { value: '冷白月光厚涂' },
  });
  fireEvent.click(screen.getByRole('button', { name: '开始生成' }));

  await waitFor(() => {
    expect(generateOpenAIImage).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'key',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-image-2',
    }));
  });

  const prompt = vi.mocked(generateOpenAIImage).mock.calls[0][0].prompt;
  expect(prompt).toContain('生成角色三视图');
  expect(prompt).toContain('冷白月光厚涂');

  await waitFor(() => {
    const card = usePartnerStore.getState().characterCards.find((item) => item.id === 'char-1');
    expect(card?.fields?.visualImage).toBe('data:image/png;base64,IMAGE');
    expect(card?.fields?.visualImageType).toBe('turnaround');
    expect(card?.fields?.visualImageStyle).toBe('冷白月光厚涂');
  });
});

it('API Key 缺失时不发送请求', async () => {
  useSettingsStore.setState({ llmApiKey: '' });

  render(<Background />);

  fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));
  fireEvent.click(screen.getByRole('button', { name: '开始生成' }));

  expect(generateOpenAIImage).not.toHaveBeenCalled();
  expect(await screen.findByText('图片生成 API Key 尚未配置，请先在设置页配置。')).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- src/__tests__/character-visual-generation.test.tsx
```

Expected: FAIL because generation is not wired.

**Step 3: Write minimal implementation**

In `src/pages/Background.tsx`:

1. Import utilities:

```ts
import { buildCharacterVisualPrompt } from '../utils/characterVisualPrompt';
import { DEFAULT_IMAGE_MODEL, generateOpenAIImage } from '../utils/openaiImageGeneration';
```

2. Add state:

```ts
const [isVisualGenerating, setIsVisualGenerating] = useState(false);
const [visualPreview, setVisualPreview] = useState('');
const [visualError, setVisualError] = useState('');
```

3. Add handler:

```ts
const handleGenerateCharacterVisual = async () => {
  if (!selectedItem || selectedItem.type !== 'character_card') {
    message.warning('请先选择一个角色卡。');
    return;
  }
  if (!settings.llmApiKey) {
    setVisualError('图片生成 API Key 尚未配置，请先在设置页配置。');
    return;
  }

  const style = customVisualStyle.trim() || visualStyle;
  const prompt = buildCharacterVisualPrompt({
    characterName: selectedItem.name,
    fields: selectedItem.fields || {},
    imageType: visualImageType,
    style,
  });

  setIsVisualGenerating(true);
  setVisualError('');

  try {
    const result = await generateOpenAIImage({
      apiKey: settings.llmApiKey,
      baseUrl: settings.llmBaseUrl,
      model: DEFAULT_IMAGE_MODEL,
      prompt,
      size: '1024x1024',
    });

    setVisualPreview(result.imageDataUrl);
    updateItemFields(selectedItem.id, 'character_card', {
      ...(selectedItem.fields || {}),
      visualImage: result.imageDataUrl,
      visualImagePrompt: prompt,
      visualImageType,
      visualImageStyle: style,
    });
    message.success('角色视觉图已生成并保存到角色卡');
  } catch (error) {
    const text = error instanceof Error ? error.message : '角色视觉图生成失败，请检查模型、Base URL 或 API Key 后重试。';
    setVisualError(text);
    message.error(text);
  } finally {
    setIsVisualGenerating(false);
  }
};
```

4. Add footer action:

```tsx
<Button
  type="primary"
  loading={isVisualGenerating}
  onClick={handleGenerateCharacterVisual}
>
  开始生成
</Button>
```

5. Add preview/error display:

```tsx
{visualError && <div role="alert">{visualError}</div>}
{visualPreview || selectedItem?.fields?.visualImage ? (
  <img src={visualPreview || selectedItem?.fields?.visualImage} alt="角色视觉图预览" />
) : (
  <div>生成后将在这里预览角色视觉图</div>
)}
```

**Step 4: Run test to verify it passes**

Run:

```powershell
npm test -- src/__tests__/character-visual-generation.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/pages/Background.tsx src/__tests__/character-visual-generation.test.tsx
git commit -m "feat: generate character visuals from role cards"
```

## Task 6: Polish Modal Layout And Existing Preview

**Files:**
- Modify: `src/pages/Background.tsx`
- Modify: `src/App.css`
- Test: `src/__tests__/character-visual-generation.test.tsx`

**Step 1: Write the failing test**

Extend the UI test:

```tsx
it('已有视觉图时在弹窗中显示预览', () => {
  usePartnerStore.setState({
    characterCards: [{
      id: 'char-1',
      name: '沈照夜',
      type: 'character_card',
      content: '',
      fields: {
        name: '沈照夜',
        visualImage: 'data:image/png;base64,SAVED',
        visualImageType: 'portrait',
        visualImageStyle: '中式古风金缕风',
      },
    }],
    selectedId: 'char-1',
    selectedType: 'character_card',
  });

  render(<Background />);

  fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));

  expect(screen.getByAltText('角色视觉图预览')).toHaveAttribute('src', 'data:image/png;base64,SAVED');
});
```

**Step 2: Run test to verify it fails if preview is not stable**

Run:

```powershell
npm test -- src/__tests__/character-visual-generation.test.tsx
```

Expected: FAIL if saved previews are not displayed.

**Step 3: Write minimal implementation and styling**

In `Background.tsx`, add class names around modal sections:

```tsx
<div className="character-visual-modal">
  <section className="character-visual-section">...</section>
  <section className="character-visual-section">...</section>
  <section className="character-visual-preview">...</section>
</div>
```

In `src/App.css`, add restrained styles:

```css
.character-visual-modal {
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: #faf9f5;
}

.character-visual-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.character-visual-style-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 10px;
}

.character-visual-style-option {
  min-height: 54px;
  border: 1px solid rgba(217, 119, 87, 0.24);
  background: rgba(255, 255, 255, 0.72);
  color: #4f4640;
}

.character-visual-style-option.is-active {
  border-color: #d97757;
  color: #9f4f35;
  background: rgba(217, 119, 87, 0.1);
}

.character-visual-preview {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.62);
  border-radius: 8px;
  overflow: hidden;
}

.character-visual-preview img {
  max-width: 100%;
  max-height: 420px;
  object-fit: contain;
}
```

Keep text compact and Chinese-only.

**Step 4: Run test to verify it passes**

Run:

```powershell
npm test -- src/__tests__/character-visual-generation.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/pages/Background.tsx src/App.css src/__tests__/character-visual-generation.test.tsx
git commit -m "style: polish character visual modal"
```

## Task 7: Final Verification

**Files:**
- No new files expected.

**Step 1: Run focused tests**

Run:

```powershell
npm test -- src/__tests__/partner-store-character-visual.test.ts src/__tests__/openai-image-generation.test.ts src/__tests__/character-visual-prompt.test.ts src/__tests__/character-visual-generation.test.tsx
```

Expected: PASS.

**Step 2: Run full frontend test suite**

Run:

```powershell
npm test
```

Expected: PASS. If unrelated existing tests fail, record the failing test names and inspect whether this feature caused them.

**Step 3: Run TypeScript and Vite build**

Run:

```powershell
npm run build
```

Expected: PASS.

**Step 4: Start the app for manual verification**

Run:

```powershell
npm run tauri dev
```

Manual checks:

- Select a role card in the background page.
- Confirm `生成角色图` appears.
- Open the modal.
- Confirm `角色图` is selected by default.
- Select `角色三视图`.
- Enter a custom style.
- With no API Key, confirm Chinese error text appears.
- With a valid API Key, generate an image and confirm it writes back to the selected character card.

**Step 5: Commit verification-only fixes if needed**

Only commit if the verification step required code changes.

```powershell
git add <changed-files>
git commit -m "fix: stabilize character visual generation"
```

## Task 8: Optional Follow-Up Issues

Do not implement these in this plan unless explicitly requested.

- Add an image model field in Settings.
- Add generated image history and version selection.
- Add mobile role visual generation.
- Add support for reference images.
- Move API call into a Rust Tauri command if stricter API key isolation becomes required.

