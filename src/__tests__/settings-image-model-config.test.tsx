import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Settings from '../pages/Settings';
import { useSettingsStore } from '../stores/useSettingsStore';

describe('设置页生图大模型配置', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      imageModelProvider: 'Agnes',
      imageModelBaseUrl: 'https://apihub.agnes-ai.com/v1',
      imageModelApiKey: '',
      imageModelName: 'agnes-image-2.1-flash',
      videoModelProvider: 'Agnes',
      videoModelBaseUrl: 'https://apihub.agnes-ai.com/v1',
      videoModelApiKey: '',
      videoModelName: 'agnes-video-v2.0',
    });
  });

  it('渲染并保存生图大模型配置', async () => {
    render(<Settings />);

    expect(screen.getByText('生图大模型配置')).toBeInTheDocument();
    expect(screen.getByLabelText('生图服务商')).toHaveValue('Agnes');
    expect(screen.getByLabelText('生图接口地址')).toHaveValue('https://apihub.agnes-ai.com/v1');
    expect(screen.getByLabelText('生图模型名称')).toHaveValue('agnes-image-2.1-flash');

    fireEvent.change(screen.getByLabelText('生图服务商'), {
      target: { value: '自定义生图' },
    });
    fireEvent.change(screen.getByLabelText('生图接口地址'), {
      target: { value: 'https://image.example.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('生图模型名称'), {
      target: { value: 'custom-image-model' },
    });
    fireEvent.change(screen.getByLabelText('生图 API Key'), {
      target: { value: 'image-key' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '保存生图配置' }).closest('form')!);

    await waitFor(() => {
      const state = useSettingsStore.getState();
      expect(state.imageModelProvider).toBe('自定义生图');
      expect(state.imageModelBaseUrl).toBe('https://image.example.com/v1');
      expect(state.imageModelName).toBe('custom-image-model');
      expect(state.imageModelApiKey).toBe('image-key');
    });
  }, 15_000);

  it('渲染并保存生视频大模型配置', async () => {
    render(<Settings />);

    expect(screen.getByText('生视频大模型配置')).toBeInTheDocument();
    expect(screen.getByLabelText('生视频模型名称')).toHaveValue('agnes-video-v2.0');

    fireEvent.change(screen.getByLabelText('生视频服务商'), {
      target: { value: '自定义生视频' },
    });
    fireEvent.change(screen.getByLabelText('生视频接口地址'), {
      target: { value: 'https://video.example.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('生视频模型名称'), {
      target: { value: 'custom-video-model' },
    });
    fireEvent.change(screen.getByLabelText('生视频 API Key'), {
      target: { value: 'video-key' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '保存生视频配置' }).closest('form')!);

    await waitFor(() => {
      const state = useSettingsStore.getState();
      expect(state.videoModelProvider).toBe('自定义生视频');
      expect(state.videoModelBaseUrl).toBe('https://video.example.com/v1');
      expect(state.videoModelName).toBe('custom-video-model');
      expect(state.videoModelApiKey).toBe('video-key');
    });
  }, 15_000);
});
