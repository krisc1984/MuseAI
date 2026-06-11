import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_MODEL, createAgnesVideoTask, generateAgnesVideo, normalizeVideoBaseUrl, queryAgnesVideoTask } from '../utils/agnesVideoGeneration';

const fetchMock = vi.fn();

describe('agnes video generation', () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('normalizes known Agnes video base urls', () => {
    expect(normalizeVideoBaseUrl('https://apihub.agnes-ai.com/v1/video/generations')).toBe('https://apihub.agnes-ai.com/v1');
    expect(DEFAULT_VIDEO_MODEL).toBe('agnes-video-v2.0');
  });

  it('returns direct video url when the api responds synchronously', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ url: 'https://cdn.example.com/video.mp4' }] }),
    });

    const result = await generateAgnesVideo({
      apiKey: 'video-key',
      baseUrl: 'https://apihub.agnes-ai.com/v1',
      model: 'agnes-video-v2.0',
      prompt: '角色轻轻回头',
      image: 'data:image/png;base64,ROLE',
      width: 1152,
      height: 768,
      numFrames: 121,
      frameRate: 24,
    });

    expect(result.videoUrl).toBe('https://cdn.example.com/video.mp4');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://apihub.agnes-ai.com/v1/videos',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('keeps both task id and video id from create response', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'task_123',
        task_id: 'task_123',
        video_id: 'video_456',
        status: 'queued',
      }),
    });

    const result = await createAgnesVideoTask({
      apiKey: 'video-key',
      baseUrl: 'https://apihub.agnes-ai.com/v1',
      model: 'agnes-video-v2.0',
      prompt: '角色轻轻回头',
      image: 'https://cdn.example.com/role.png',
      width: 1152,
      height: 768,
      numFrames: 121,
      frameRate: 24,
    });

    expect(result).toMatchObject({
      taskId: 'task_123',
      videoId: 'video_456',
    });
  });

  it('queries Agnes result with recommended video_id endpoint first', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'task_123',
        video_id: 'video_456',
        status: 'completed',
        remixed_from_video_id: 'https://cdn.example.com/video.mp4',
      }),
    });

    const result = await queryAgnesVideoTask(
      {
        apiKey: 'video-key',
        baseUrl: 'https://apihub.agnes-ai.com/v1',
      },
      'task_123',
      {
        videoId: 'video_456',
        modelName: 'agnes-video-v2.0',
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://apihub.agnes-ai.com/agnesapi?video_id=video_456&model_name=agnes-video-v2.0',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toMatchObject({
      taskId: 'task_123',
      videoId: 'video_456',
      status: 'completed',
    });
  });
});
