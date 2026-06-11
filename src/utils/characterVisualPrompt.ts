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

const valueOrDefault = (value: string | undefined, fallback: string) => {
  const text = (value || '').trim();
  return text || fallback;
};

const joinDetails = (values: Array<string | undefined>, fallback: string) => {
  const text = values.map((value) => (value || '').trim()).filter(Boolean).join('，');
  return text || fallback;
};

const buildTurnaroundPrompt = ({
  name,
  fields,
  style,
}: {
  name: string;
  fields: PartnerItemFields;
  style: string;
}) => {
  const occupation = valueOrDefault(fields.occupation, '角色职业');
  const appearance = joinDetails([fields.iconicFeatures, fields.heightBuild], '发型/发色/五官特征/体型');
  const vibe = valueOrDefault(fields.overallVibe, '优雅/冷静/锋利/温柔/神秘/高贵/叛逆/理性');
  const clothing = valueOrDefault(fields.clothingStyle, '服装描述');
  const primaryColor = '参考服装设定';

  return [
    '请生成一张高端人物角色设定卡。',
    `主角：【${name}】`,
    `角色设定：【${occupation}】，年龄22岁，身高170cm；`,
    `外貌特征：【${appearance}】；`,
    `气质关键词：【${vibe}】；`,
    `服装设定：【${clothing}】，主色调：【${primaryColor}】。`,
    '',
    '版式要求：3:4竖版构图，纯白底色，大面积干净留白，杂志级精致排版，官方角色档案页样式。页面分区完整：顶部放置超大号角色名称标题+一句角色标语；中间区域展示角色正面、侧面、背面标准三视图；右侧排列6个面部表情头像（平静、微笑、眨眼、认真、惊讶、思考）；左侧设置角色基础信息分栏；底部依次排布服装拆解图、配件拆解图、服饰局部细节特写、标准色板、角色简介、关键词标签、签名区域。全页使用细分割线分区，精致衬线字体排版，高端时尚画册版式。',
    '',
    `画面风格：semi-realistic anime character design, premium artbook page, elegant editorial layout, luxury fashion catalog style。艺术风格：${style}。全页面所有视角、表情、服饰细节角色形象高度统一，脸型、发型、服装结构无偏差；柔和影棚灯光，五官精致细腻，画质高清锐利，材质质感细腻，整体极简高级，收藏品级角色设定页。`,
    '',
    '文字要求：文字以设定集排版风格为主，优先保证版面完整、分区清晰、视觉美观。',
  ].join('\n');
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

  if (imageType === 'turnaround') {
    return buildTurnaroundPrompt({ name, fields, style });
  }

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
