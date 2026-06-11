import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Background from '../pages/Background';
import { usePartnerStore } from '../stores/usePartnerStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { generateOpenAIImage } from '../utils/openaiImageGeneration';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock('../utils/openaiImageGeneration', () => ({
  DEFAULT_IMAGE_MODEL: 'gpt-image-2',
  generateOpenAIImage: vi.fn(),
}));

describe('角色视觉图生成入口', () => {
  beforeEach(() => {
    vi.mocked(generateOpenAIImage).mockReset();
    useSettingsStore.setState({
      llmApiKey: 'key',
      llmBaseUrl: 'https://api.example.com/v1',
      llmModel: 'gpt-4.1',
      imageModelApiKey: 'image-key',
      imageModelBaseUrl: 'https://apihub.agnes-ai.com/v1',
      imageModelName: 'agnes-image-2.1-flash',
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
    expect(screen.getByAltText('3D建模游戏CG风示例图')).toBeInTheDocument();
    expect(screen.getByAltText('中式古风金缕风示例图')).toBeInTheDocument();
  });

  it('选中世界书时不显示生成角色图按钮', () => {
    usePartnerStore.setState({ selectedId: 'world-1', selectedType: 'world_book' });

    render(<Background />);

    expect(screen.queryByRole('button', { name: /生成角色图/ })).not.toBeInTheDocument();
  });

  it('生成成功后把图片写回当前角色卡', async () => {
    vi.mocked(generateOpenAIImage).mockResolvedValue({
      imageDataUrl: 'data:image/png;base64,IMAGE',
    });

    render(<Background />);

    fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));
    fireEvent.click(screen.getByRole('radio', { name: '角色三视图' }));
    fireEvent.mouseDown(screen.getByLabelText('角色视觉图尺寸'));
    fireEvent.click(screen.getByText('16:9 横图'));
    fireEvent.change(screen.getByPlaceholderText('例如：紫调月夜、冷白光、细腻厚涂、东方玄幻...'), {
      target: { value: '冷白月光厚涂' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成提示词' }));

    expect(generateOpenAIImage).not.toHaveBeenCalled();
    const promptEditor = screen.getByLabelText('角色视觉图提示词');
    expect((promptEditor as HTMLTextAreaElement).value).toContain('请生成一张高端人物角色设定卡');
    fireEvent.change(promptEditor, {
      target: { value: `${String((promptEditor as HTMLTextAreaElement).value)}\n追加镜头要求。` },
    });
    await waitFor(() => {
      expect((promptEditor as HTMLTextAreaElement).value).toContain('追加镜头要求。');
    });

    fireEvent.click(screen.getByRole('button', { name: '生成图片' }));

    await waitFor(() => {
      expect(generateOpenAIImage).toHaveBeenCalledWith(expect.objectContaining({
        apiKey: 'image-key',
        baseUrl: 'https://apihub.agnes-ai.com/v1',
        model: 'agnes-image-2.1-flash',
        size: '1536x1024',
      }));
    });

    const prompt = vi.mocked(generateOpenAIImage).mock.calls[0][0].prompt;
    expect(prompt).toContain('请生成一张高端人物角色设定卡');
    expect(prompt).toContain('中间区域展示角色正面、侧面、背面标准三视图');
    expect(prompt).toContain('冷白月光厚涂');
    expect(prompt).toContain('追加镜头要求。');

    await waitFor(() => {
      const card = usePartnerStore.getState().characterCards.find((item) => item.id === 'char-1');
      expect(card?.fields?.visualImage).toBe('data:image/png;base64,IMAGE');
      expect(card?.fields?.visualImageType).toBe('turnaround');
      expect(card?.fields?.visualImageStyle).toBe('冷白月光厚涂');
      expect(card?.fields?.visualImageGallery).toEqual([
        expect.objectContaining({
          image: 'data:image/png;base64,IMAGE',
          type: 'turnaround',
          style: '冷白月光厚涂',
          source: 'generated',
        }),
      ]);
    });
  });

  it('API Key 缺失时不发送请求', async () => {
    useSettingsStore.setState({ imageModelApiKey: '' });

    render(<Background />);

    fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成图片' }));

    expect(generateOpenAIImage).not.toHaveBeenCalled();
    expect(await screen.findByText('图片生成 API Key 尚未配置，请先在设置页配置。')).toBeInTheDocument();
  });

  it('上传示例图后生成图片时携带参考图', async () => {
    vi.mocked(generateOpenAIImage).mockResolvedValue({
      imageDataUrl: 'data:image/png;base64,IMAGE',
    });

    const readAsDataURL = vi.fn(function readAsDataURL(this: FileReader) {
      Object.defineProperty(this, 'result', {
        configurable: true,
        value: 'data:image/png;base64,REFERENCE',
      });
      this.onload?.({} as ProgressEvent<FileReader>);
    });
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(readAsDataURL);

    render(<Background />);

    fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));
    fireEvent.change(screen.getByLabelText('上传示例图'), {
      target: { files: [new File(['reference'], 'reference.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成提示词' }));
    expect((screen.getByLabelText('角色视觉图提示词') as HTMLTextAreaElement).value).toContain('请严格参考上传示例图中的角色脸型、发型、发饰、服装结构与整体配色关系');
    fireEvent.click(screen.getByRole('button', { name: '生成图片' }));

    await waitFor(() => {
      expect(generateOpenAIImage).toHaveBeenCalledWith(expect.objectContaining({
        image: 'data:image/png;base64,REFERENCE',
      }));
    });
  });

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
          visualImageGallery: [{
            id: 'gallery-1',
            image: 'data:image/png;base64,SAVED',
            type: 'portrait',
            style: '中式古风金缕风',
            source: 'generated',
          }],
        },
      }],
      selectedId: 'char-1',
      selectedType: 'character_card',
    });

    render(<Background />);

    fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));

    expect(screen.getByAltText('角色视觉图预览')).toHaveAttribute('src', 'data:image/png;base64,SAVED');
    expect(screen.getByText('角色图资料库')).toBeInTheDocument();
    expect(screen.getByAltText('角色图资料库第1张')).toHaveAttribute('src', 'data:image/png;base64,SAVED');
  });

  it('点击角色图可放大查看', () => {
    usePartnerStore.setState({
      characterCards: [{
        id: 'char-1',
        name: '沈照夜',
        type: 'character_card',
        content: '',
        fields: {
          name: '沈照夜',
          visualImage: 'data:image/png;base64,SAVED',
          visualImageGallery: [{
            id: 'gallery-1',
            image: 'data:image/png;base64,SAVED',
            type: 'portrait',
            style: '中式古风金缕风',
            source: 'generated',
          }],
        },
      }],
      selectedId: 'char-1',
      selectedType: 'character_card',
    });

    render(<Background />);

    fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));
    fireEvent.click(screen.getByAltText('角色视觉图预览'));

    expect(screen.getByAltText('放大查看图片')).toHaveAttribute('src', 'data:image/png;base64,SAVED');
  });

  it('直接上传角色图后可保存到角色图资料库', async () => {
    const readAsDataURL = vi.fn(function readAsDataURL(this: FileReader) {
      Object.defineProperty(this, 'result', {
        configurable: true,
        value: 'data:image/png;base64,MANUAL',
      });
      this.onload?.({} as ProgressEvent<FileReader>);
    });
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(readAsDataURL);

    render(<Background />);

    fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));
    fireEvent.change(screen.getByLabelText('上传角色图'), {
      target: { files: [new File(['manual'], 'manual.png', { type: 'image/png' })] },
    });

    await waitFor(() => {
      const card = usePartnerStore.getState().characterCards.find((item) => item.id === 'char-1');
      expect(card?.fields?.visualImage).toBe('data:image/png;base64,MANUAL');
      expect(card?.fields?.visualImageGallery).toEqual([
        expect.objectContaining({
          image: 'data:image/png;base64,MANUAL',
          source: 'uploaded',
        }),
      ]);
    });

    expect(screen.getByAltText('角色视觉图预览')).toHaveAttribute('src', 'data:image/png;base64,MANUAL');
  });

  it('可以将资料库图片设为当前主图', async () => {
    usePartnerStore.setState({
      characterCards: [{
        id: 'char-1',
        name: '沈照夜',
        type: 'character_card',
        content: '',
        fields: {
          name: '沈照夜',
          visualImage: 'data:image/png;base64,FIRST',
          visualImageType: 'portrait',
          visualImageStyle: '中式古风金缕风',
          visualImageGallery: [
            {
              id: 'gallery-1',
              image: 'data:image/png;base64,FIRST',
              type: 'portrait',
              style: '中式古风金缕风',
              source: 'generated',
            },
            {
              id: 'gallery-2',
              image: 'data:image/png;base64,SECOND',
              type: 'turnaround',
              style: '古风水墨动态风',
              source: 'uploaded',
            },
          ],
        },
      }],
      selectedId: 'char-1',
      selectedType: 'character_card',
    });

    render(<Background />);

    fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));
    fireEvent.click(screen.getByRole('button', { name: '设为主图-2' }));

    await waitFor(() => {
      const card = usePartnerStore.getState().characterCards.find((item) => item.id === 'char-1');
      expect(card?.fields?.visualImage).toBe('data:image/png;base64,SECOND');
      expect(card?.fields?.visualImageType).toBe('turnaround');
      expect(card?.fields?.visualImageStyle).toBe('古风水墨动态风');
    });

    expect(screen.getByAltText('角色视觉图预览')).toHaveAttribute('src', 'data:image/png;base64,SECOND');
  });

  it('可以删除资料库图片并在删除当前主图时自动切换', async () => {
    usePartnerStore.setState({
      characterCards: [{
        id: 'char-1',
        name: '沈照夜',
        type: 'character_card',
        content: '',
        fields: {
          name: '沈照夜',
          visualImage: 'data:image/png;base64,FIRST',
          visualImageType: 'portrait',
          visualImageStyle: '中式古风金缕风',
          visualImageGallery: [
            {
              id: 'gallery-1',
              image: 'data:image/png;base64,FIRST',
              type: 'portrait',
              style: '中式古风金缕风',
              source: 'generated',
            },
            {
              id: 'gallery-2',
              image: 'data:image/png;base64,SECOND',
              type: 'turnaround',
              style: '古风水墨动态风',
              source: 'uploaded',
            },
          ],
        },
      }],
      selectedId: 'char-1',
      selectedType: 'character_card',
    });

    render(<Background />);

    fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));
    fireEvent.click(screen.getByRole('button', { name: '删除资料-1' }));

    await waitFor(() => {
      const card = usePartnerStore.getState().characterCards.find((item) => item.id === 'char-1');
      expect(card?.fields?.visualImage).toBe('data:image/png;base64,SECOND');
      expect(card?.fields?.visualImageGallery).toEqual([
        expect.objectContaining({
          id: 'gallery-2',
          image: 'data:image/png;base64,SECOND',
        }),
      ]);
    });

    expect(screen.queryByAltText('角色图资料库第2张')).not.toBeInTheDocument();
    expect(screen.getByAltText('角色视觉图预览')).toHaveAttribute('src', 'data:image/png;base64,SECOND');
  });

  it('可以编辑资料库图片的名称和备注', async () => {
    usePartnerStore.setState({
      characterCards: [{
        id: 'char-1',
        name: '沈照夜',
        type: 'character_card',
        content: '',
        fields: {
          name: '沈照夜',
          visualImage: 'data:image/png;base64,FIRST',
          visualImageGallery: [
            {
              id: 'gallery-1',
              image: 'data:image/png;base64,FIRST',
              type: 'portrait',
              style: '中式古风金缕风',
              source: 'generated',
            },
          ],
        },
      }],
      selectedId: 'char-1',
      selectedType: 'character_card',
    });

    render(<Background />);

    fireEvent.click(screen.getByRole('button', { name: /生成角色图/ }));
    fireEvent.change(screen.getByLabelText('角色图名称-1'), {
      target: { value: '角色正面主视觉' },
    });
    fireEvent.change(screen.getByLabelText('角色图备注-1'), {
      target: { value: '这一版保留作为最终封面候选。' },
    });

    await waitFor(() => {
      const card = usePartnerStore.getState().characterCards.find((item) => item.id === 'char-1');
      expect(card?.fields?.visualImageGallery).toEqual([
        expect.objectContaining({
          id: 'gallery-1',
          title: '角色正面主视觉',
          note: '这一版保留作为最终封面候选。',
        }),
      ]);
    });
  });
});
