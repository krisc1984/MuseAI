import { invoke } from '@tauri-apps/api/core';

export type AgnesVideoAspectRatio = '16:9' | '9:16' | '1:1';
export type AgnesVideoDuration = 3 | 5 | 10 | 18;

export const AGNES_VIDEO_DURATION_OPTIONS: Record<AgnesVideoDuration, { numFrames: number; frameRate: number; label: string }> = {
  3: { numFrames: 81, frameRate: 24, label: '约 3 秒' },
  5: { numFrames: 121, frameRate: 24, label: '约 5 秒' },
  10: { numFrames: 241, frameRate: 24, label: '约 10 秒' },
  18: { numFrames: 441, frameRate: 24, label: '约 18 秒' },
};

export interface GenerateAgnesVideoRequest {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  image?: string | string[];
  width: number;
  height: number;
  numFrames: number;
  frameRate: number;
  negativePrompt?: string;
  mode?: string;
}

export interface GenerateAgnesVideoResult {
  taskId?: string;
  videoId?: string;
  videoUrl: string;
  rawResponse?: unknown;
}

export interface CreateAgnesVideoTaskResult {
  taskId?: string;
  videoId?: string;
  videoUrl?: string;
  rawResponse?: unknown;
}

export class AgnesVideoPendingError extends Error {
  taskId?: string;

  constructor(message: string, taskId?: string) {
    super(message);
    this.name = 'AgnesVideoPendingError';
    this.taskId = taskId;
  }
}

export const DEFAULT_VIDEO_MODEL = 'agnes-video-v2.0';

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const normalizeVideoBaseUrl = (baseUrl?: string) => {
  const trimmed = (baseUrl || '').trim();
  if (!trimmed) return 'https://apihub.agnes-ai.com/v1';

  return trimmed
    .replace(/\/+$/, '')
    .replace(/\/video\/generations$/, '')
    .replace(/\/videos$/, '')
    .replace(/\/tasks$/, '')
    .replace(/\/agnesapi$/, '');
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

const postAgnesVideoCreate = async (url: string, apiKey: string, body: Record<string, unknown>) => {
  if (isRealTauriHost()) {
    try {
      return await invoke<unknown>('agnes_video_create', {
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
    throw new Error(`视频生成失败：${await readErrorMessage(response)}`);
  }

  return response.json();
};

const pickVideoUrl = (payload: any): string | null => {
  return payload?.data?.[0]?.url
    || payload?.data?.[0]?.video_url
    || payload?.data?.url
    || payload?.data?.video_url
    || payload?.output?.video_url
    || payload?.output?.url
    || payload?.remixed_from_video_id
    || payload?.video_url
    || payload?.url
    || null;
};

const pickTaskId = (payload: any): string | null => {
  return payload?.task_id || payload?.id || payload?.data?.task_id || payload?.data?.id || null;
};

const pickVideoId = (payload: any): string | null => {
  return payload?.video_id || payload?.data?.video_id || null;
};

const pickStatus = (payload: any): string => {
  return String(payload?.status || payload?.data?.status || payload?.task_status || '').toLowerCase();
};

export const queryAgnesVideoTask = async (
  request: Pick<GenerateAgnesVideoRequest, 'apiKey' | 'baseUrl'>,
  id: string,
  options?: {
    videoId?: string;
    modelName?: string;
  },
) => {
  const headers = {
    Authorization: `Bearer ${request.apiKey.trim()}`,
    'Content-Type': 'application/json',
  };

  const rootBaseUrl = normalizeVideoBaseUrl(request.baseUrl).replace(/\/v1$/, '');
  const apiBaseUrl = normalizeVideoBaseUrl(request.baseUrl);
  const videoId = options?.videoId?.trim();
  const modelName = options?.modelName?.trim();
  const candidateUrls = videoId
    ? [
      `${rootBaseUrl}/agnesapi?video_id=${encodeURIComponent(videoId)}`,
      ...(modelName ? [`${rootBaseUrl}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(modelName)}`] : []),
      `${apiBaseUrl}/videos/${encodeURIComponent(id)}`,
    ]
    : [
      `${apiBaseUrl}/videos/${encodeURIComponent(id)}`,
    ];

  let lastPayload: unknown = null;

  for (const url of candidateUrls) {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      continue;
    }
    const data = await response.json();
    lastPayload = data;
    const videoUrl = pickVideoUrl(data);
    const resolvedTaskId = pickTaskId(data) || id;
    const resolvedVideoId = pickVideoId(data) || videoId || undefined;
    if (videoUrl) {
      return { taskId: resolvedTaskId, videoId: resolvedVideoId, videoUrl, rawResponse: data, status: 'completed' as const };
    }
    const status = pickStatus(data);
    if (status.includes('fail') || status.includes('error')) {
      throw new Error(data?.error?.message || data?.message || '视频生成失败');
    }
    return { taskId: resolvedTaskId, videoId: resolvedVideoId, rawResponse: data, status: status || 'processing' };
  }

  throw new Error(`视频任务查询失败。${lastPayload ? '请稍后重试。' : ''}`);
};

export const createAgnesVideoTask = async (request: GenerateAgnesVideoRequest): Promise<CreateAgnesVideoTaskResult> => {
  const apiKey = request.apiKey.trim();
  if (!apiKey) {
    throw new Error('视频生成 API Key 尚未配置，请先在设置页配置。');
  }

  const isMultiImageRequest = Array.isArray(request.image) && request.image.length > 1;
  const body = {
    model: request.model || DEFAULT_VIDEO_MODEL,
    prompt: request.prompt,
    ...(Array.isArray(request.image)
      ? request.image.length === 1
        ? { image: request.image[0] }
        : { extra_body: { image: request.image } }
      : request.image
        ? { image: request.image }
        : {}),
    num_frames: request.numFrames,
    frame_rate: request.frameRate,
    ...(isMultiImageRequest ? {} : { width: request.width, height: request.height }),
    ...(!isMultiImageRequest && request.negativePrompt?.trim() ? { negative_prompt: request.negativePrompt.trim() } : {}),
    ...(!isMultiImageRequest && request.mode?.trim() ? { mode: request.mode.trim() } : {}),
  };

  const data = await postAgnesVideoCreate(`${normalizeVideoBaseUrl(request.baseUrl)}/videos`, apiKey, body);
  const directVideoUrl = pickVideoUrl(data);
  const taskId = pickTaskId(data);
  const videoId = pickVideoId(data);

  if (directVideoUrl || taskId || videoId) {
    return { taskId: taskId || undefined, videoId: videoId || undefined, videoUrl: directVideoUrl || undefined, rawResponse: data };
  }

  throw new Error('视频生成失败：模型没有返回视频地址或任务 ID。');
};

const pollVideoTask = async (request: GenerateAgnesVideoRequest, taskId: string, videoId?: string) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await queryAgnesVideoTask(request, taskId, { videoId, modelName: request.model });
    if (result.videoUrl) {
      return { taskId: result.taskId || taskId, videoId: result.videoId || videoId, videoUrl: result.videoUrl, rawResponse: result.rawResponse };
    }
    await sleep(3000);
  }

  throw new AgnesVideoPendingError('视频生成超时，任务仍在处理中，可稍后在图库中继续查询。', taskId);
};

export const generateAgnesVideo = async (request: GenerateAgnesVideoRequest): Promise<GenerateAgnesVideoResult> => {
  const created = await createAgnesVideoTask(request);
  if (created.videoUrl) {
    return { taskId: created.taskId, videoId: created.videoId, videoUrl: created.videoUrl, rawResponse: created.rawResponse };
  }
  if (created.taskId || created.videoId) {
    return pollVideoTask(request, created.taskId || created.videoId || '', created.videoId);
  }
  throw new Error('视频生成失败：模型没有返回视频地址或任务 ID。');
};
