import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_IMAGE_MODEL, generateOpenAIImage, normalizeImageBaseUrl } from '../utils/openaiImageGeneration';

describe('图片生成 API 工具', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('规范化 OpenAI Base URL', () => {
    expect(normalizeImageBaseUrl('')).toBe('https://api.openai.com/v1');
    expect(normalizeImageBaseUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1');
    expect(normalizeImageBaseUrl('https://api.example.com/v1/chat/completions')).toBe('https://api.example.com/v1');
    expect(normalizeImageBaseUrl('https://apihub.agnes-ai.com/v1/images/generations')).toBe('https://apihub.agnes-ai.com/v1');
  });

  it('默认使用 Agnes Image 2.1 Flash 模型', () => {
    expect(DEFAULT_IMAGE_MODEL).toBe('agnes-image-2.1-flash');
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
      model: 'agnes-image-2.1-flash',
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

  it('上传示例图时把图片传给生成接口', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'IMAGE_BASE64' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateOpenAIImage({
      apiKey: 'key',
      baseUrl: 'https://api.example.com/v1',
      model: 'agnes-image-2.1-flash',
      prompt: '请参考示例图生成角色图',
      image: 'data:image/png;base64,REFERENCE',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual(expect.objectContaining({
      prompt: '请参考示例图生成角色图',
      tags: ['img2img'],
      extra_body: {
        image: ['data:image/png;base64,REFERENCE'],
        response_format: 'url',
      },
    }));
  });

  it('支持一次传入多张角色参考图', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'IMAGE_BASE64' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateOpenAIImage({
      apiKey: 'key',
      baseUrl: 'https://api.example.com/v1',
      model: 'agnes-image-2.1-flash',
      prompt: '请根据角色参考图生成剧情插图',
      image: ['data:image/png;base64,REF1', 'data:image/png;base64,REF2'],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.extra_body).toEqual({
      image: ['data:image/png;base64,REF1', 'data:image/png;base64,REF2'],
      response_format: 'url',
    });
  });

  it('兼容返回图片 URL 的图像接口', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ url: 'https://img.example.com/result.png' }] }),
    }));

    const result = await generateOpenAIImage({
      apiKey: 'key',
      baseUrl: 'https://apihub.agnes-ai.com/v1',
      model: 'agnes-image-2.1-flash',
      prompt: '请生成角色图',
    });

    expect(result.imageDataUrl).toBe('https://img.example.com/result.png');
  });

  it('接口失败时抛出中文错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'model not found' } }),
    }));

    await expect(generateOpenAIImage({
      apiKey: 'key',
      model: 'agnes-image-2.1-flash',
      prompt: '请生成角色图',
    })).rejects.toThrow('角色视觉图生成失败：model not found');
  });
});
