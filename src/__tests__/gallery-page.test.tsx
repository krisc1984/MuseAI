import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Gallery from '../pages/Gallery';
import { usePartnerStore } from '../stores/usePartnerStore';
import { useGalleryVideoStore } from '../stores/useGalleryVideoStore';
import { createAgnesVideoTask } from '../utils/agnesVideoGeneration';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../utils/agnesVideoGeneration', () => ({
  AGNES_VIDEO_DURATION_OPTIONS: {
    3: { numFrames: 81, frameRate: 24, label: '约 3 秒' },
    5: { numFrames: 121, frameRate: 24, label: '约 5 秒' },
    10: { numFrames: 241, frameRate: 24, label: '约 10 秒' },
    18: { numFrames: 441, frameRate: 24, label: '约 18 秒' },
  },
  DEFAULT_VIDEO_MODEL: 'agnes-video-v2.0',
  createAgnesVideoTask: vi.fn(async () => ({ taskId: 'task-1', videoId: 'video-1' })),
  AgnesVideoPendingError: class AgnesVideoPendingError extends Error {
    taskId?: string;
    constructor(message: string, taskId?: string) {
      super(message);
      this.taskId = taskId;
    }
  },
  queryAgnesVideoTask: vi.fn(async () => ({ taskId: 'task-pending', videoId: 'video-pending', videoUrl: 'https://cdn.example.com/queried.mp4', status: 'completed' })),
}));

const invokeMock = vi.mocked(invoke);
const createAgnesVideoTaskMock = vi.mocked(createAgnesVideoTask);

describe('Gallery page', () => {
  beforeEach(async () => {
    invokeMock.mockReset();
    createAgnesVideoTaskMock.mockClear();
    useGalleryVideoStore.setState({ tasks: [] });
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      const args = (payload ?? {}) as Record<string, unknown>;
      if (command === 'get_workspace_dir' && args.dirType === 'articles') return '/workspace/articles';
      if (command === 'get_workspace_dir' && args.dirType === 'references') return '/workspace/references';
      if (command === 'list_dir' && args.path === '/workspace/articles') {
        return [{ name: 'chapter-1.md', path: '/workspace/articles/chapter-1.md', is_dir: false }];
      }
      if (command === 'read_file') {
        return [
          '原文段落',
          '',
          '<!-- MUSEAI_STORY_ILLUSTRATIONS',
          JSON.stringify([
            {
              id: 'story-1',
              anchorText: '原文段落',
              prompt: '旧提示词',
              imagePath: 'illustrations/chapter-1.png',
              imageSource: 'data:image/png;base64,STORY',
              characterIds: ['char-1'],
              createdAt: 1710000000000,
            },
          ], null, 2),
          'MUSEAI_STORY_ILLUSTRATIONS -->',
        ].join('\n');
      }
      if (command === 'write_file') return 1;
      if (command === 'write_media_asset') return 2;
      if (command === 'upload_temp_image') return 'https://litter.catbox.moe/example-role.png';
      return undefined;
    });

    usePartnerStore.setState({
      worldBooks: [],
      selectedId: null,
      selectedType: null,
      characterCards: [{
        id: 'char-1',
        name: '沈照夜',
        type: 'character_card',
        content: '',
        fields: {
          name: '沈照夜',
          visualImage: 'data:image/png;base64,ROLE',
          visualImageGallery: [{
            id: 'gallery-1',
            image: 'data:image/png;base64,ROLE',
            type: 'portrait',
            style: '中式古风金缕风',
            source: 'generated',
            title: '主视觉',
            note: '保留',
          }],
        },
      }],
    });
    const { useSettingsStore } = await import('../stores/useSettingsStore');
    useSettingsStore.setState({
      videoModelApiKey: 'video-key',
      videoModelBaseUrl: 'https://apihub.agnes-ai.com/v1',
      videoModelName: 'agnes-video-v2.0',
    });
  });

  it('shows and manages character images and story illustrations', async () => {
    render(<Gallery />);

    expect(screen.getByText('图库')).toBeInTheDocument();
    expect(screen.getByAltText('沈照夜角色图')).toBeInTheDocument();

    fireEvent.click(screen.getByAltText('沈照夜角色图'));
    expect(screen.getByAltText('图库放大预览')).toHaveAttribute('src', 'data:image/png;base64,ROLE');

    fireEvent.click(screen.getByRole('tab', { name: /剧情插图/ }));
    expect(await screen.findByAltText('chapter-1.md剧情插图')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '从图库移除' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('write_file', expect.objectContaining({
        path: '/workspace/articles/chapter-1.md',
      }));
    });
  });

  it('closes the modal after creating a video task and later saves in the video tab', async () => {
    render(<Gallery />);

    fireEvent.click(screen.getByRole('button', { name: /生成视频/ }));
    expect(await screen.findByText(/生成视频：沈照夜角色图/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('参考图公网URL'), {
      target: { value: 'https://cdn.example.com/role.png' },
    });
    fireEvent.change(screen.getByLabelText('视频提示词'), {
      target: { value: '让角色轻轻回头，衣摆和发丝自然摆动。' },
    });
    const videoButtons = screen.getAllByRole('button', { name: /生成视频/ });
    fireEvent.click(videoButtons[videoButtons.length - 1]);

    await waitFor(() => {
      expect(useGalleryVideoStore.getState().tasks[0]).toMatchObject({
        taskId: 'task-1',
        videoId: 'video-1',
        status: 'pending',
        sourceTitle: '沈照夜角色图',
      });
    });

    fireEvent.click(screen.getByRole('tab', { name: /视频/ }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('write_media_asset', expect.objectContaining({
        path: expect.stringContaining('/workspace/references/gallery-videos/'),
        source: 'https://cdn.example.com/queried.mp4',
      }));
    });

    expect(await screen.findByText(/已保存到：/)).toBeInTheDocument();
  });

  it('can upload the current image to temp hosting and autofill the public url', async () => {
    render(<Gallery />);

    fireEvent.click(screen.getByRole('button', { name: /生成视频/ }));
    expect(await screen.findByText(/生成视频：沈照夜角色图/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '上传并回填' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('upload_temp_image', {
        source: 'data:image/png;base64,ROLE',
      });
    });

    expect(screen.getByLabelText('参考图公网URL')).toHaveValue('https://litter.catbox.moe/example-role.png');
  });

  it('can add uploaded reference images and submit multiple images for video generation', async () => {
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      const args = (payload ?? {}) as Record<string, unknown>;
      if (command === 'get_workspace_dir' && args.dirType === 'articles') return '/workspace/articles';
      if (command === 'get_workspace_dir' && args.dirType === 'references') return '/workspace/references';
      if (command === 'list_dir' && args.path === '/workspace/articles') return [];
      if (command === 'upload_temp_image') return 'https://litter.catbox.moe/extra-reference.png';
      return undefined;
    });
    render(<Gallery />);

    fireEvent.click(screen.getByRole('button', { name: /生成视频/ }));
    expect(await screen.findByText(/生成视频：沈照夜角色图/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('参考图公网URL'), {
      target: { value: 'https://cdn.example.com/role.png' },
    });

    const file = new File(['extra-image'], 'extra.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('添加多图参考'), {
      target: { files: [file] },
    });

    expect(await screen.findByLabelText('参考图公网URL-2')).toHaveValue('https://litter.catbox.moe/extra-reference.png');

    const videoButtons = screen.getAllByRole('button', { name: /生成视频/ });
    fireEvent.click(videoButtons[videoButtons.length - 1]);

    await waitFor(() => {
      expect(createAgnesVideoTaskMock).toHaveBeenCalledWith(expect.objectContaining({
        image: ['https://cdn.example.com/role.png', 'https://litter.catbox.moe/extra-reference.png'],
      }));
    });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /视频/ })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('沈照夜角色图')).toBeInTheDocument();
    });
  });

  it('moves to the video tab as soon as Agnes accepts a multi-image video request', async () => {
    let finishWriteMediaAsset: (() => void) | undefined;
    createAgnesVideoTaskMock.mockResolvedValueOnce({
      taskId: 'task-direct',
      videoId: 'video-direct',
      videoUrl: 'https://cdn.example.com/direct.mp4',
    });
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      const args = (payload ?? {}) as Record<string, unknown>;
      if (command === 'get_workspace_dir' && args.dirType === 'articles') return '/workspace/articles';
      if (command === 'get_workspace_dir' && args.dirType === 'references') return '/workspace/references';
      if (command === 'list_dir' && args.path === '/workspace/articles') return [];
      if (command === 'upload_temp_image') return 'https://litter.catbox.moe/extra-reference.png';
      if (command === 'write_media_asset') {
        return new Promise((resolve) => {
          finishWriteMediaAsset = () => resolve(2);
        });
      }
      return undefined;
    });
    render(<Gallery />);

    fireEvent.click(screen.getByRole('button', { name: /生成视频/ }));
    await screen.findByText(/生成视频：沈照夜角色图/);
    fireEvent.change(screen.getByLabelText('参考图公网URL'), {
      target: { value: 'https://cdn.example.com/role.png' },
    });
    fireEvent.change(screen.getByLabelText('添加多图参考'), {
      target: { files: [new File(['extra-image'], 'extra.png', { type: 'image/png' })] },
    });
    expect(await screen.findByLabelText('参考图公网URL-2')).toHaveValue('https://litter.catbox.moe/extra-reference.png');

    const videoButtons = screen.getAllByRole('button', { name: /生成视频/ });
    fireEvent.click(videoButtons[videoButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /视频/ })).toHaveAttribute('aria-selected', 'true');
    });
    finishWriteMediaAsset?.();
  });

  it('keeps the video modal open with a visible error when task creation fails', async () => {
    createAgnesVideoTaskMock.mockRejectedValueOnce(new Error('视频生成失败：Invalid image'));
    render(<Gallery />);

    fireEvent.click(screen.getByRole('button', { name: /生成视频/ }));
    await screen.findByText(/生成视频：沈照夜角色图/);
    fireEvent.change(screen.getByLabelText('参考图公网URL'), {
      target: { value: 'https://cdn.example.com/role.png' },
    });
    const videoButtons = screen.getAllByRole('button', { name: /生成视频/ });
    fireEvent.click(videoButtons[videoButtons.length - 1]);

    expect(await screen.findByText('视频任务创建失败')).toBeInTheDocument();
    expect(screen.getByText('视频生成失败：Invalid image')).toBeInTheDocument();
    expect(useGalleryVideoStore.getState().tasks).toEqual([]);
  });

  it('reuses cached temp image url when reopening the same character image', async () => {
    usePartnerStore.setState({
      worldBooks: [],
      selectedId: null,
      selectedType: null,
      characterCards: [{
        id: 'char-1',
        name: '沈照夜',
        type: 'character_card',
        content: '',
        fields: {
          name: '沈照夜',
          visualImage: 'data:image/png;base64,ROLE',
          visualImageGallery: [{
            id: 'gallery-1',
            image: 'data:image/png;base64,ROLE',
            type: 'portrait',
            source: 'generated',
            tempImageUrl: 'https://litter.catbox.moe/cached-role.png',
          }],
        },
      }],
    });

    render(<Gallery />);
    fireEvent.click(screen.getByRole('button', { name: /生成视频/ }));

    expect(await screen.findByText(/生成视频：沈照夜角色图/)).toBeInTheDocument();
    expect(screen.getByLabelText('参考图公网URL')).toHaveValue('https://litter.catbox.moe/cached-role.png');
  });

  it('shows generated videos in the video tab', async () => {
    render(<Gallery />);
    fireEvent.click(screen.getByRole('button', { name: /生成视频/ }));
    await screen.findByText(/生成视频：沈照夜角色图/);
    fireEvent.change(screen.getByLabelText('参考图公网URL'), {
      target: { value: 'https://cdn.example.com/role.png' },
    });
    const videoButtons = screen.getAllByRole('button', { name: /生成视频/ });
    fireEvent.click(videoButtons[videoButtons.length - 1]);

    fireEvent.click(screen.getByRole('tab', { name: /视频/ }));
    expect(await screen.findByText('已生成')).toBeInTheDocument();
    expect(screen.queryByText(/任务ID:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/视频ID:/)).not.toBeInTheDocument();
    expect(useGalleryVideoStore.getState().tasks[0]).toMatchObject({
      taskId: 'task-pending',
      videoId: 'video-pending',
    });
  });

  it('can query a pending video task from the video tab', async () => {
    useGalleryVideoStore.setState({
      tasks: [{
        id: 'pending-1',
        taskId: 'task-pending',
        videoId: 'video-pending',
        sourceKind: 'character',
        sourceTitle: '沈照夜角色图',
        sourceItemId: 'gallery-1',
        saveDir: '/workspace/references/gallery-videos',
        fileBaseName: 'shenzhaoye-character-video',
        prompt: '等待查询',
        imageUrl: 'https://cdn.example.com/role.png',
        aspectRatio: '16:9',
        duration: 5,
        status: 'pending',
        createdAt: 1710000000000,
        updatedAt: 1710000000000,
      }],
    });

    render(<Gallery />);
    fireEvent.click(screen.getByRole('tab', { name: /视频/ }));
    fireEvent.click(await screen.findByRole('button', { name: '查询视频任务' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('write_media_asset', expect.objectContaining({
        source: 'https://cdn.example.com/queried.mp4',
      }));
    });
  });
});
