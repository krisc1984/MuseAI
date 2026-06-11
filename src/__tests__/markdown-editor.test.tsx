import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarkdownEditor from '../components/MarkdownEditor';
import { usePartnerStore } from '../stores/usePartnerStore';
import { useSettingsStore } from '../stores/useSettingsStore';

vi.mock('../utils/openaiImageGeneration', () => ({
  DEFAULT_IMAGE_MODEL: 'gpt-image-2',
  generateOpenAIImage: vi.fn(async () => ({ imageDataUrl: 'data:image/png;base64,GENERATED' })),
}));

const invokeMock = vi.mocked(invoke);

describe('MarkdownEditor', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'read_file') return '# 标题\n\n正文';
      if (command === 'file_modified_at') return 1;
      if (command === 'write_file') return 2;
      if (command === 'write_image_asset') return 3;
      if (command === 'read_image_data_url') return 'data:image/png;base64,LOCAL';
      return undefined;
    });
    useSettingsStore.setState({
      imageModelApiKey: 'image-key',
      imageModelBaseUrl: 'https://api.example.com/v1',
      imageModelName: 'gpt-image-2',
    });
    usePartnerStore.setState({
      worldBooks: [],
      characterCards: [
        {
          id: 'char-1',
          name: '沈照夜',
          type: 'character_card',
          content: '',
          fields: { name: '沈照夜', visualImage: 'data:image/png;base64,REFERENCE' },
        },
      ],
      selectedId: null,
      selectedType: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads a large Markdown document into an editable CodeMirror source area', async () => {
    const largeMarkdown = Array.from({ length: 900 }, (_, index) => `## 第 ${index + 1} 节\n正文内容`).join('\n\n');
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'read_file') return largeMarkdown;
      if (command === 'file_modified_at') return 1;
      return undefined;
    });

    render(<MarkdownEditor filePath="/Users/test/Documents/MuseAI/articles/large.md" />);

    const editor = await screen.findByRole('textbox', { name: 'Markdown源码编辑区' });
    expect((editor as HTMLTextAreaElement).value).toContain('第 900 节');
    expect(screen.getByTestId('markdown-live-editor')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '预览' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '分屏' })).not.toBeInTheDocument();
  });

  it('autosaves writable edits but does not save in read-only mode', async () => {
    const { unmount } = render(<MarkdownEditor filePath="/Users/test/Documents/MuseAI/articles/a.md" />);

    const editor = await screen.findByRole('textbox', { name: 'Markdown源码编辑区' });
    fireEvent.change(editor, { target: { value: '# 新标题\n\n新正文' } });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 850));
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('write_file', {
        path: '/Users/test/Documents/MuseAI/articles/a.md',
        content: '# 新标题\n\n新正文',
      });
    });

    unmount();
    invokeMock.mockClear();
    render(<MarkdownEditor filePath="/Users/test/Documents/MuseAI/references/read-only.md" readOnly />);

    const readOnlyEditor = await screen.findByRole('textbox', { name: 'Markdown源码编辑区' });
    fireEvent.change(readOnlyEditor, { target: { value: '不应保存' } });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 850));
    });

    expect(invokeMock).not.toHaveBeenCalledWith('write_file', expect.anything());
  });

  it('refreshes from disk when the file changes without unsaved edits', async () => {
    let modifiedAt = 1;
    let fileContent = '# 初始内容';
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'read_file') return fileContent;
      if (command === 'file_modified_at') return modifiedAt;
      return undefined;
    });

    render(<MarkdownEditor filePath="/Users/test/Documents/MuseAI/articles/refresh.md" />);

    expect(await screen.findByDisplayValue('# 初始内容')).toBeInTheDocument();

    fileContent = '# 外部更新';
    modifiedAt = 2;

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1300));
    });

    expect(await screen.findByDisplayValue('# 外部更新')).toBeInTheDocument();
  });

  it('renders local and internet Markdown images inside the single editor without rewriting saved source', async () => {
    const markdown = [
      '# 图片段落',
      '',
      '![本地](./cover.png)',
      '',
      '<img src="preview.jpg" width="100%">',
      '',
      '[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://www.python.org/)',
    ].join('\n');
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'read_file') return markdown;
      if (command === 'file_modified_at') return 1;
      if (command === 'read_image_data_url') {
        return 'data:image/png;base64,LOCAL';
      }
      return undefined;
    });

    render(<MarkdownEditor filePath="/Users/test/Documents/MuseAI/articles/chapter.md" />);

    const liveEditor = await screen.findByTestId('markdown-live-editor');
    await waitFor(() => {
      expect(within(liveEditor).getByAltText('本地')).toHaveAttribute('src', 'data:image/png;base64,LOCAL');
      expect(within(liveEditor).getByAltText('preview.jpg')).toHaveAttribute('src', 'data:image/png;base64,LOCAL');
      expect(within(liveEditor).getByAltText('Python')).toHaveAttribute('src', 'https://img.shields.io/badge/Python-3.10%2B-blue');
    });
    const renderedEditor = liveEditor.querySelector('.cm-content');
    expect(renderedEditor).not.toHaveTextContent('<img src=');
    expect(renderedEditor).not.toHaveTextContent('](https://www.python.org/)');

    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown源码编辑区' }), {
      target: { value: `${markdown}\n\n新增` },
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 850));
    });

    expect(invokeMock).toHaveBeenCalledWith('write_file', {
      path: '/Users/test/Documents/MuseAI/articles/chapter.md',
      content: `${markdown}\n\n新增`,
    });
  });

  it('previews selected image files directly', async () => {
    render(<MarkdownEditor filePath="/Users/test/Documents/MuseAI/articles/cover.jpg" />);

    const image = await screen.findByAltText('cover.jpg');
    expect(image).toHaveAttribute('src', 'data:image/png;base64,LOCAL');
  });

  it('shows a right-click action for selected story text and inserts generated illustration markdown', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'read_file') return '沈照夜站在雨夜长街尽头。';
      if (command === 'file_modified_at') return 1;
      if (command === 'write_file') return 2;
      if (command === 'write_image_asset') return 3;
      return undefined;
    });

    render(<MarkdownEditor filePath="/Users/test/Documents/MuseAI/articles/chapter.md" />);

    const editor = await screen.findByRole('textbox', { name: 'Markdown源码编辑区' });
    fireEvent.select(editor, { target: { selectionStart: 0, selectionEnd: 12 } });
    fireEvent.contextMenu(editor);

    fireEvent.click(await screen.findByRole('button', { name: '生成剧情插图' }));

    expect(await screen.findByText('生成剧情插图')).toBeInTheDocument();
    expect(screen.getByText('沈照夜 · 已挂主图')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '生成图片' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'write_image_asset',
        expect.objectContaining({
          path: expect.stringContaining('/illustrations/chapter-illustration-'),
          source: 'data:image/png;base64,GENERATED',
        }),
      );
    });
  });

  it('shows story illustration gallery metadata and can regenerate the same text block', async () => {
    const markdown = [
      '原文段落。',
      '',
      '![剧情插图](illustrations/chapter-illustration-old.png)',
      '',
      '<!-- MUSEAI_STORY_ILLUSTRATIONS',
      JSON.stringify([
        {
          id: 'story-1',
          anchorText: '原文段落。',
          prompt: '旧提示词',
          imagePath: 'illustrations/chapter-illustration-old.png',
          imageSource: 'data:image/png;base64,OLD',
          characterIds: ['char-1'],
          createdAt: 1710000000000,
        },
      ], null, 2),
      'MUSEAI_STORY_ILLUSTRATIONS -->',
    ].join('\n');

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'read_file') return markdown;
      if (command === 'file_modified_at') return 1;
      if (command === 'write_file') return 2;
      if (command === 'write_image_asset') return 3;
      return undefined;
    });

    render(<MarkdownEditor filePath="/Users/test/Documents/MuseAI/articles/chapter.md" />);

    const editor = await screen.findByRole('textbox', { name: 'Markdown源码编辑区' });
    fireEvent.select(editor, { target: { selectionStart: 0, selectionEnd: 5 } });
    fireEvent.contextMenu(editor);
    fireEvent.click(await screen.findByRole('button', { name: '生成剧情插图' }));

    expect(await screen.findByText('剧情插图资料库')).toBeInTheDocument();
    expect(screen.getByAltText('剧情插图资料库第1张')).toHaveAttribute('src', 'data:image/png;base64,OLD');

    fireEvent.click(screen.getByRole('button', { name: '重新生成同段插图' }));

    await waitFor(() => {
      expect((screen.getByLabelText('剧情插图提示词') as HTMLTextAreaElement).value).toBe('旧提示词');
    });

    fireEvent.click(screen.getByRole('button', { name: '生成图片' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'write_image_asset',
        expect.objectContaining({
          source: 'data:image/png;base64,GENERATED',
        }),
      );
    });
  });

  it('点击剧情插图资料库图片可放大查看', async () => {
    const markdown = [
      '原文段落。',
      '',
      '![剧情插图](illustrations/chapter-illustration-old.png)',
      '',
      '<!-- MUSEAI_STORY_ILLUSTRATIONS',
      JSON.stringify([
        {
          id: 'story-1',
          anchorText: '原文段落。',
          prompt: '旧提示词',
          imagePath: 'illustrations/chapter-illustration-old.png',
          imageSource: 'data:image/png;base64,OLD',
          characterIds: ['char-1'],
          createdAt: 1710000000000,
        },
      ], null, 2),
      'MUSEAI_STORY_ILLUSTRATIONS -->',
    ].join('\n');

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'read_file') return markdown;
      if (command === 'file_modified_at') return 1;
      return undefined;
    });

    render(<MarkdownEditor filePath="/Users/test/Documents/MuseAI/articles/chapter.md" />);

    const editor = await screen.findByRole('textbox', { name: 'Markdown源码编辑区' });
    fireEvent.select(editor, { target: { selectionStart: 0, selectionEnd: 5 } });
    fireEvent.contextMenu(editor);
    fireEvent.click(await screen.findByRole('button', { name: '生成剧情插图' }));
    fireEvent.click(await screen.findByAltText('剧情插图资料库第1张'));

    expect(screen.getByAltText('剧情插图放大预览')).toHaveAttribute('src', 'data:image/png;base64,OLD');
  });
});
