import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE_MODEL, generateOpenAIImage } from '../utils/openaiImageGeneration';

const apiKey = import.meta.env.AGNES_IMAGE_API_KEY;
const runIfKey = apiKey ? it : it.skip;

describe('Agnes Image 真实调用', () => {
  runIfKey('使用 Agnes Image 2.1 Flash 生成图片', async () => {
    const result = await generateOpenAIImage({
      apiKey: apiKey!,
      baseUrl: 'https://apihub.agnes-ai.com/v1',
      model: DEFAULT_IMAGE_MODEL,
      prompt: '生成一张暖色调极简风的小说角色半身设定图，年轻男性，玄色锦袍，白底，无文字。',
      size: '1024x1024',
    });

    expect(result.imageDataUrl).toMatch(/^(data:image\/png;base64,|https?:\/\/)/);
  }, 120_000);
});
