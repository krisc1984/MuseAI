# 角色视觉图生成设计方案

## 背景

用户希望在选中角色卡后，参考视觉风格面板的交互，调用图片生成 API 生成角色图、角色三视图或角色表情图。当前阶段先实现角色详情页入口，生成类型默认单选，生成结果写回当前角色卡，便于后续聊天、故事和角色管理复用。

## 目标

- 在角色详情页增加「生成角色图」按钮。
- 仅当当前选中项为角色卡时显示入口。
- 打开一个暖色调极简风的角色视觉生成弹窗。
- 默认单选生成类型，支持「角色图」「角色三视图」「角色表情图」三选一。
- 用户可选择预设艺术风格，也可输入自定义风格。
- 调用图片生成 API 后展示预览，并将结果保存到角色卡字段。
- 所有用户可见文案保持中文。

## 非目标

- 本阶段不做批量生成多个角色。
- 本阶段不做一次同时生成三种图片。
- 本阶段不接入移动端页面。
- 本阶段不做图片历史版本管理。
- 本阶段不把 base64 图片直接写进角色卡 Markdown 正文，避免内容膨胀。

## 入口设计

入口放在 `src/pages/Background.tsx` 的角色详情头部区域，也就是当前显示角色名、类型标签、编辑和预览切换的位置附近。

显示规则：

- `selectedItem.type === 'character_card'` 时显示「生成角色图」按钮。
- 当前选中世界书或没有选中项时不显示。

推荐布局：

```text
角色名
角色卡    [生成角色图] [表单编辑 / Markdown 预览]
```

按钮建议：

- 文案：`生成角色图`
- 图标：Ant Design 的 `PictureOutlined` 或 `BgColorsOutlined`
- 样式：沿用当前页面暖色调，强调色使用 `#d97757`

## 弹窗设计

弹窗标题：`生成角色视觉图`

整体风格遵循项目 AGENTS.md 约束：

- 背景：`#faf9f5`
- 强调色：`#d97757`
- 不使用深色边界
- 不做多层嵌套卡片
- 通过留白、浅色块和选中态表达层级

弹窗内容分为四块。

### 1. 选择艺术风格

横向展示预设风格，默认选中第一个。

预设项：

- `3D建模游戏CG风`
- `欧式暗黑华丽风`
- `中式古风金缕风`
- `古风水墨动态风`
- `赛博朋克废土风`
- `西方古典油画风`

选中态：

- 边框或描边使用 `#d97757`
- 背景使用浅暖色
- 不使用重阴影

### 2. 自定义风格

输入框用于覆盖或补充预设风格。

占位符：

```text
例如：紫调月夜、冷白光、细腻厚涂、东方玄幻...
```

规则：

- 如果用户填写自定义风格，最终 prompt 优先使用自定义风格。
- 如果自定义风格为空，使用当前预设风格。

### 3. 选择生成类型

使用 `Radio.Group`，默认单选 `角色图`。

选项：

- `角色图`
- `角色三视图`
- `角色表情图`

内部值建议：

```ts
type CharacterVisualImageType = 'portrait' | 'turnaround' | 'expression';
```

映射：

- `portrait` -> `角色图`
- `turnaround` -> `角色三视图`
- `expression` -> `角色表情图`

### 4. 生成结果

状态：

- 未生成：显示轻提示 `生成后将在这里预览角色视觉图`
- 生成中：显示 `正在生成角色视觉图...`
- 成功：显示图片预览
- 失败：显示中文错误提示，保留用户当前选择，方便重试

成功后操作：

- `重新生成`
- `保存到角色卡`
- `复制图片提示词`

如果希望减少一步操作，也可以在生成成功后自动写回角色卡，同时保留 `重新生成`。推荐第一版采用自动写回，减少用户心智负担。

## 数据设计

在 `src/stores/usePartnerStore.ts` 的 `PartnerItemFields` 中增加视觉字段：

```ts
visualImage?: string;
visualImagePrompt?: string;
visualImageType?: 'portrait' | 'turnaround' | 'expression';
visualImageStyle?: string;
```

字段含义：

- `visualImage`：图片 data URL，例如 `data:image/png;base64,...`
- `visualImagePrompt`：本次实际发送给图片模型的提示词
- `visualImageType`：生成类型
- `visualImageStyle`：选中的预设风格或自定义风格

保存方式：

- 使用现有 `updateItemFields(id, 'character_card', fields)` 写回。
- 保留原角色卡字段，不覆盖姓名、外貌、性格等已有设定。

Markdown 编译补充：

```markdown
## 角色视觉图
- **图片类型**：角色图
- **艺术风格**：中式古风金缕风
- **图片提示词**：...
```

图片 data URL 不直接写入 Markdown 正文。详情页可在表单模式单独展示预览。

## Prompt 设计

从角色卡字段中提取关键信息：

- 姓名
- 年龄
- 性别
- 种族
- 职业
- 社会阶层
- 身份标签
- 身高体型
- 标志性特征
- 衣着风格
- 整体气质
- 外在性格
- 内在性格
- 背景故事

基础 prompt 模板：

```text
请为小说角色「{name}」生成{imageTypeLabel}。

角色设定：
姓名：{name}
年龄：{age}
性别：{gender}
种族：{race}
职业：{occupation}
身份标签：{identityTags}
身高体型：{heightBuild}
标志性特征：{iconicFeatures}
衣着风格：{clothingStyle}
整体气质：{overallVibe}
外在性格：{externalPersonality}
内在性格：{internalPersonality}
背景故事：{backgroundStory}

艺术风格：{style}

画面要求：
清晰角色设计，完整可读的服装与轮廓，避免文字、水印、畸形手指、重复面部。
```

按生成类型追加约束：

### 角色图

```text
生成单人角色主视觉，可以是半身或全身构图，突出角色气质、服装、姿态和标志性特征。
```

### 角色三视图

```text
生成同一角色的三视图，包含正面、侧面、背面。同一服装、同一发型、同一体型，浅色或白色背景，适合角色设定参考。
```

### 角色表情图

```text
生成同一角色的表情设定图，九宫格或多格构图，包含喜悦、愤怒、悲伤、惊讶、害羞、冷漠、警惕、温柔、崩溃等表情。同一发型、同一服装、同一脸部特征。
```

## API 设计

新增前端工具函数：

```text
src/utils/openaiImageGeneration.ts
```

职责：

- 接收图片生成配置和 prompt。
- 调用图片生成 API。
- 解析 `b64_json`。
- 返回 `data:image/png;base64,...`。

建议接口：

```ts
export interface GenerateImageRequest {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  size?: '1024x1024' | '1024x1536' | '1536x1024';
}

export interface GenerateImageResult {
  imageDataUrl: string;
}

export async function generateOpenAIImage(request: GenerateImageRequest): Promise<GenerateImageResult>;
```

请求：

```http
POST {baseUrl}/images/generations
Authorization: Bearer {apiKey}
Content-Type: application/json
```

请求体：

```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "size": "1024x1024"
}
```

模型说明：

- 用户明确希望调用 `gpt-image-2`。
- 当前实现将图片模型作为常量或设置项保留，不把模型名分散到多个组件。
- 若 API 返回模型不存在，后续可在设置页扩展为可配置图片模型，例如切换到官方可用的 GPT Image 模型。

Base URL 规则：

- 优先使用设置中的 `settings.llmBaseUrl`。
- 如果为空，默认 `https://api.openai.com/v1`。
- 如果用户填写的 base URL 末尾包含 `/chat/completions`，实现时需要规范化为根路径，避免拼出错误 URL。

API Key 规则：

- 复用 `settings.llmApiKey`。
- 如果缺失，按钮点击后提示：`图片生成 API Key 尚未配置，请先在设置页配置。`

## 错误处理

错误提示必须中文。

常见情况：

- API Key 缺失：`图片生成 API Key 尚未配置，请先在设置页配置。`
- 当前未选角色卡：`请先选择一个角色卡。`
- 角色信息过少：`当前角色设定较少，建议先补充外貌、服装或气质后再生成。`
- 网络或 API 失败：`角色视觉图生成失败，请检查模型、Base URL 或 API Key 后重试。`

失败时不清空弹窗选择和自定义风格。

## 测试方案

遵循项目 TDD 规范，先写测试，再实现。

测试文件建议：

```text
src/__tests__/character-visual-generation.test.tsx
```

关键测试：

1. 选中角色卡时显示 `生成角色图` 按钮。
2. 选中世界书时不显示 `生成角色图` 按钮。
3. 打开弹窗后默认选中 `角色图`。
4. 选择 `角色三视图` 后，生成 prompt 包含三视图要求。
5. 自定义风格不为空时，prompt 使用自定义风格。
6. API Key 缺失时显示中文提示，且不发送请求。
7. 生成成功后写回当前角色卡的 `visualImage`、`visualImagePrompt`、`visualImageType`、`visualImageStyle`。
8. 生成失败时显示中文错误，保留用户当前选择。

建议同时给 `openaiImageGeneration.ts` 写单元测试：

- 能正确拼接 base URL。
- 能解析 `b64_json`。
- API 错误时抛出可读错误。

## 实施步骤

1. 在 `PartnerItemFields` 增加视觉字段，并更新 Markdown 编译。
2. 新增 `src/utils/openaiImageGeneration.ts` 及对应测试。
3. 在 `Background.tsx` 增加角色详情页入口按钮。
4. 在 `Background.tsx` 增加角色视觉生成弹窗状态与 UI。
5. 实现 prompt 组装函数。
6. 接入图片生成 API。
7. 生成成功后写回角色卡并展示预览。
8. 运行 `npm run build`。
9. 按项目要求运行相关 Vitest；若涉及后端再运行 `cargo test`。

## 验收标准

- 选中角色卡后能看到「生成角色图」按钮。
- 点击后弹窗正常打开。
- 默认生成类型为「角色图」。
- 用户可以切换到「角色三视图」或「角色表情图」。
- 用户可以选择预设风格或输入自定义风格。
- API Key 缺失时不会发请求，并显示中文提示。
- 生成成功后能看到图片预览。
- 生成结果能保存到当前角色卡。
- 重新打开该角色卡时仍能看到已保存的视觉图信息。
- 前端构建通过。

