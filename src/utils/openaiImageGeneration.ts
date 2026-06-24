import { invoke } from '@tauri-apps/api/core';

export type OpenAIImageSize = '1024x1024' | '1024x1536' | '1536x1024';

export interface GenerateImageRequest {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  size?: OpenAIImageSize;
  image?: string | string[];
}

export interface GenerateImageResult {
  imageDataUrl: string;
}

export const DEFAULT_IMAGE_MODEL = 'agnes-image-2.1-flash';

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

const isRealTauriHost = () => {
  if (typeof window === 'undefined') return false;
  return (
    (window as any).__TAURI_INTERNALS__ !== undefined ||
    (window as any).__TAURI__ !== undefined ||
    (window as any).__TAURI_IPC__ !== undefined ||
    (typeof navigator !== 'undefined' && navigator.userAgent?.includes('Tauri'))
  );
};

const postImageCreate = async (url: string, apiKey: string, body: Record<string, unknown>) => {
  if (isRealTauriHost()) {
    try {
      return await invoke<any>('agnes_image_create', {
        url,
        apiKey,
        body,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`角色视觉图生成失败：${await readErrorMessage(response)}`);
  }

  return response.json();
};

export const generateOpenAIImage = async (request: GenerateImageRequest): Promise<GenerateImageResult> => {
  const apiKey = request.apiKey.trim();
  if (!apiKey) {
    throw new Error('图片生成 API Key 尚未配置，请先在设置页配置。');
  }

  const body: Record<string, unknown> = {
    model: request.model || DEFAULT_IMAGE_MODEL,
    prompt: request.prompt,
    size: request.size || '1024x1024',
  };

  const referenceImages = Array.isArray(request.image)
    ? request.image.filter(Boolean)
    : request.image
      ? [request.image]
      : [];

  if (referenceImages.length > 0) {
    body.tags = ['img2img'];
    body.extra_body = {
      image: referenceImages,
      response_format: 'url',
    };
  }

  const data = await postImageCreate(`${normalizeImageBaseUrl(request.baseUrl)}/images/generations`, apiKey, body);
  const imageBase64 = data?.data?.[0]?.b64_json;
  const imageUrl = data?.data?.[0]?.url;
  if (imageBase64) {
    return { imageDataUrl: `data:image/png;base64,${imageBase64}` };
  }
  if (imageUrl) {
    return { imageDataUrl: imageUrl };
  }
  throw new Error('角色视觉图生成失败：模型没有返回图片。');
};
