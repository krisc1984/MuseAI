import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { invoke } from '@tauri-apps/api/core';
import { BoldOutlined, ItalicOutlined, LinkOutlined, OrderedListOutlined, PictureOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Button, Input, Space, Spin, Tooltip, Typography } from 'antd';

interface MarkdownEditorProps {
  filePath: string | null;
  readOnly?: boolean;
}

type SaveStatus = 'saved' | 'saving' | 'error';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

const isImageFile = (path: string) => {
  const extension = path.split('.').pop()?.toLowerCase();
  return extension ? IMAGE_EXTENSIONS.includes(extension) : false;
};

const getDirectoryName = (path: string) => path.replace(/[\\/][^\\/]*$/, '');

const isExternalImageSrc = (src: string) => /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('#');

const normalizePath = (path: string) => {
  const absolute = path.startsWith('/');
  const parts = path.split('/').filter(Boolean);
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '.') {
      continue;
    }
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return `${absolute ? '/' : ''}${stack.join('/')}`;
};

const resolveImageSrc = async (src: string, markdownPath: string) => {
  if (isExternalImageSrc(src)) {
    return src;
  }
  const absolutePath = src.startsWith('/')
    ? src
    : normalizePath(`${getDirectoryName(markdownPath)}/${src}`);
  return invoke<string>('read_image_data_url', { path: absolutePath });
};

const safeMarkdownUrlTransform = (url: string) => {
  const normalized = url.trim().toLowerCase();
  if (normalized.startsWith('javascript:')) {
    return '';
  }
  if (normalized.startsWith('data:') && !normalized.startsWith('data:image/')) {
    return '';
  }
  return url;
};

class ImagePreviewWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly markdownPath: string,
  ) {
    super();
  }

  toDOM() {
    const figure = document.createElement('figure');
    figure.className = 'markdown-live-image';
    const image = document.createElement('img');
    image.alt = this.alt || '图片';
    figure.appendChild(image);
    resolveImageSrc(this.src, this.markdownPath)
      .then((resolvedSrc) => {
        image.src = safeMarkdownUrlTransform(resolvedSrc);
      })
      .catch((err) => {
        console.error('Error resolving markdown image:', err);
        image.src = safeMarkdownUrlTransform(this.src);
      });
    if (this.alt) {
      const caption = document.createElement('figcaption');
      caption.textContent = this.alt;
      figure.appendChild(caption);
    }
    return figure;
  }

  ignoreEvent() {
    return false;
  }
}

const selectionTouchesRange = (view: EditorView, from: number, to: number) => (
  view.state.selection.ranges.some((range) => range.from <= to && range.to >= from)
);

const overlapsRange = (ranges: Array<{ from: number; to: number }>, from: number, to: number) => (
  ranges.some((range) => from < range.to && to > range.from)
);

const markdownLivePreviewExtension = (markdownPath: string) => ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView) {
    const decorations = [];
    for (const visibleRange of view.visibleRanges) {
      let position = visibleRange.from;
      while (position <= visibleRange.to) {
        const line = view.state.doc.lineAt(position);
        const text = line.text;
        const headingMatch = text.match(/^(#{1,6})\s+/);
        if (headingMatch) {
          const level = Math.min(headingMatch[1].length, 6);
          decorations.push(Decoration.line({ class: `markdown-live-heading markdown-live-heading-${level}` }).range(line.from));
          const markerFrom = line.from;
          const markerTo = line.from + headingMatch[0].length;
          if (!selectionTouchesRange(view, markerFrom, markerTo)) {
            decorations.push(Decoration.replace({ class: 'markdown-live-hidden-marker' }).range(markerFrom, markerTo));
          }
        }

        const imageRanges: Array<{ from: number; to: number }> = [];
        const addImageDecoration = (from: number, to: number, src: string, alt: string) => {
          if (!selectionTouchesRange(view, from, to) && !overlapsRange(imageRanges, from, to)) {
            decorations.push(Decoration.replace({
              widget: new ImagePreviewWidget(src, alt || src, markdownPath),
            }).range(from, to));
            imageRanges.push({ from, to });
          }
        };

        for (const match of text.matchAll(/\[!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\]\([^)]+\)/g)) {
          const from = line.from + (match.index ?? 0);
          addImageDecoration(from, from + match[0].length, match[2], match[1]);
        }

        for (const match of text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
          const from = line.from + (match.index ?? 0);
          addImageDecoration(from, from + match[0].length, match[2], match[1]);
        }

        for (const match of text.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
          const from = line.from + (match.index ?? 0);
          const altMatch = match[0].match(/\balt=["']([^"']*)["']/i);
          addImageDecoration(from, from + match[0].length, match[1], altMatch?.[1] || match[1]);
        }

        for (const match of text.matchAll(/\*\*([^*\n]+)\*\*/g)) {
          const start = line.from + (match.index ?? 0);
          const contentFrom = start + 2;
          const contentTo = contentFrom + match[1].length;
          const end = contentTo + 2;
          if (!selectionTouchesRange(view, start, end)) {
            decorations.push(Decoration.replace({ class: 'markdown-live-hidden-marker' }).range(start, contentFrom));
            decorations.push(Decoration.mark({ class: 'markdown-live-bold' }).range(contentFrom, contentTo));
            decorations.push(Decoration.replace({ class: 'markdown-live-hidden-marker' }).range(contentTo, end));
          }
        }

        for (const match of text.matchAll(/(^|[^*])\*([^*\n]+)\*/g)) {
          const matchStart = line.from + (match.index ?? 0);
          const start = matchStart + match[1].length;
          const contentFrom = start + 1;
          const contentTo = contentFrom + match[2].length;
          const end = contentTo + 1;
          if (!selectionTouchesRange(view, start, end)) {
            decorations.push(Decoration.replace({ class: 'markdown-live-hidden-marker' }).range(start, contentFrom));
            decorations.push(Decoration.mark({ class: 'markdown-live-italic' }).range(contentFrom, contentTo));
            decorations.push(Decoration.replace({ class: 'markdown-live-hidden-marker' }).range(contentTo, end));
          }
        }

        if (line.to >= visibleRange.to) {
          break;
        }
        position = line.to + 1;
      }
    }
    return Decoration.set(decorations, true);
  }
}, {
  decorations: (plugin) => plugin.decorations,
});

const editorTheme = EditorView.theme({
  '&': {
    minHeight: '100%',
    backgroundColor: 'transparent',
    color: '#4a4642',
    fontSize: '17px',
  },
  '.cm-scroller': {
    minHeight: 'calc(100vh - 210px)',
    paddingBottom: '48px',
    fontFamily: 'Lora, Merriweather, serif',
    lineHeight: '1.8',
  },
  '.cm-content': {
    padding: '18px 0 36px',
  },
  '.cm-line': {
    padding: '0 2px',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(217, 119, 87, 0.06)',
  },
  '.cm-cursor': {
    borderLeftColor: '#d97757',
  },
  '&.cm-focused': {
    outline: 'none',
  },
});

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ filePath, readOnly = false }) => {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [imagePreviewSrc, setImagePreviewSrc] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [readError, setReadError] = useState(false);
  const editorViewRef = useRef<EditorView | null>(null);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const latestContentRef = useRef(content);
  const savedContentRef = useRef(savedContent);
  const loadingRef = useRef(loading);
  const readErrorRef = useRef(readError);
  const lastKnownModifiedAtRef = useRef<number | null>(null);
  const fullSelectionIntentUntilRef = useRef(0);

  const extensions = useMemo<Extension[]>(() => [
    history(),
    markdown(),
    bracketMatching(),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.lineWrapping,
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    markdownLivePreviewExtension(filePath || ''),
    editorTheme,
  ], [filePath, readOnly]);

  useEffect(() => {
    latestContentRef.current = content;
  }, [content]);

  useEffect(() => {
    savedContentRef.current = savedContent;
  }, [savedContent]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    readErrorRef.current = readError;
  }, [readError]);

  useEffect(() => {
    let mounted = true;
    if (!filePath) {
      setContent('');
      setSavedContent('');
      setImagePreviewSrc('');
      lastKnownModifiedAtRef.current = null;
      return () => {
        mounted = false;
      };
    }

    if (isImageFile(filePath)) {
      setContent('');
      setSavedContent('');
      setImagePreviewSrc('');
      setSaveStatus('saved');
      setReadError(false);
      lastKnownModifiedAtRef.current = null;
      setLoading(true);
      invoke<string>('read_image_data_url', { path: filePath })
        .then((src) => {
          if (mounted) {
            setImagePreviewSrc(src);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error('Error reading image:', err);
          if (mounted) {
            setReadError(true);
            setContent(`**读取图片失败**: ${err}`);
            setLoading(false);
          }
        });
      return () => {
        mounted = false;
      };
    }

    setLoading(true);
    Promise.all([
      invoke<string>('read_file', { path: filePath }),
      invoke<number>('file_modified_at', { path: filePath }),
    ])
      .then(([text, modifiedAt]) => {
        if (mounted) {
          setContent(text);
          setSavedContent(text);
          lastKnownModifiedAtRef.current = modifiedAt;
          setSaveStatus('saved');
          setReadError(false);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Error reading file:', err);
        if (mounted) {
          setContent(`**读取文件失败**: ${err}`);
          setSavedContent('');
          setSaveStatus('error');
          setReadError(true);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [filePath]);

  useEffect(() => {
    if (!filePath || isImageFile(filePath)) {
      return;
    }

    const pollTimer = window.setInterval(() => {
      if (loadingRef.current || readErrorRef.current || latestContentRef.current !== savedContentRef.current) {
        return;
      }

      invoke<number>('file_modified_at', { path: filePath })
        .then((modifiedAt) => {
          if (lastKnownModifiedAtRef.current === null) {
            lastKnownModifiedAtRef.current = modifiedAt;
            return;
          }

          if (modifiedAt === lastKnownModifiedAtRef.current) {
            return;
          }

          return invoke<string>('read_file', { path: filePath }).then((text) => {
            if (latestContentRef.current !== savedContentRef.current) {
              return;
            }

            setContent(text);
            setSavedContent(text);
            lastKnownModifiedAtRef.current = modifiedAt;
            setSaveStatus('saved');
          });
        })
        .catch((err) => {
          console.error('Error checking file updates:', err);
        });
    }, 1200);

    return () => {
      window.clearInterval(pollTimer);
    };
  }, [filePath]);

  useEffect(() => {
    if (readOnly || !filePath || isImageFile(filePath) || loading || readError || content === savedContent) {
      return;
    }

    const pathToSave = filePath;
    const contentToSave = content;
    setSaveStatus('saving');

    const saveTimer = window.setTimeout(() => {
      invoke<number>('write_file', { path: pathToSave, content: contentToSave })
        .then((modifiedAt) => {
          setSavedContent(contentToSave);
          lastKnownModifiedAtRef.current = modifiedAt;
          if (latestContentRef.current === contentToSave) {
            setSaveStatus('saved');
          }
        })
        .catch((err) => {
          console.error('Error writing file:', err);
          setSaveStatus('error');
        });
    }, 800);

    return () => {
      window.clearTimeout(saveTimer);
    };
  }, [content, filePath, loading, readError, readOnly, savedContent]);

  const getSelectedSource = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) {
      return '';
    }
    const ranges: string[] = [];
    for (const range of view.state.selection.ranges) {
      if (!range.empty) {
        ranges.push(view.state.doc.sliceString(range.from, range.to));
      }
    }
    return ranges.join('\n');
  }, []);

  const handleCopy = useCallback((event: ClipboardEvent | React.ClipboardEvent<HTMLDivElement>) => {
    const editorShell = editorShellRef.current;
    const target = event.target as Node | null;
    if (!editorShell || (target && !editorShell.contains(target))) {
      return;
    }

    const selectedSource = getSelectedSource();
    const copiedAfterSelectAll = Date.now() <= fullSelectionIntentUntilRef.current;
    const textToCopy = copiedAfterSelectAll ? latestContentRef.current : selectedSource;
    fullSelectionIntentUntilRef.current = 0;
    if (!textToCopy) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if ('nativeEvent' in event) {
      event.nativeEvent.stopImmediatePropagation();
    } else {
      event.stopImmediatePropagation();
    }
    event.clipboardData?.setData('text/plain', textToCopy);
    event.clipboardData?.setData('text/markdown', textToCopy);
  }, [getSelectedSource]);

  const handleEditorKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    if (!target || !editorShellRef.current?.contains(target)) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      fullSelectionIntentUntilRef.current = Date.now() + 5000;
    }
  }, []);

  useEffect(() => {
    document.addEventListener('copy', handleCopy, true);
    return () => {
      document.removeEventListener('copy', handleCopy, true);
    };
  }, [handleCopy]);

  const insertMarkdown = useCallback((before: string, after = '', placeholder = '') => {
    const view = editorViewRef.current;
    if (!view || readOnly) {
      return;
    }
    const range = view.state.selection.main;
    const selected = view.state.doc.sliceString(range.from, range.to) || placeholder;
    const nextText = `${before}${selected}${after}`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: nextText },
      selection: { anchor: range.from + before.length, head: range.from + before.length + selected.length },
    });
    view.focus();
  }, [readOnly]);

  const insertList = useCallback((ordered: boolean) => {
    const view = editorViewRef.current;
    if (!view || readOnly) {
      return;
    }
    const range = view.state.selection.main;
    const selected = view.state.doc.sliceString(range.from, range.to) || '列表项';
    const lines = selected.split('\n');
    const nextText = lines.map((line, index) => `${ordered ? `${index + 1}.` : '-'} ${line.replace(/^(\s*(?:[-*+]|\d+\.)\s*)/, '')}`).join('\n');
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: nextText },
      selection: { anchor: range.from, head: range.from + nextText.length },
    });
    view.focus();
  }, [readOnly]);

  const insertLink = useCallback(() => {
    const url = window.prompt('请输入链接地址');
    if (!url) {
      return;
    }
    insertMarkdown('[', `](${url})`, '链接文字');
  }, [insertMarkdown]);

  const insertImage = useCallback(() => {
    const src = window.prompt('请输入图片地址，可以是本地路径或互联网地址');
    if (!src) {
      return;
    }
    insertMarkdown('![图片说明](', ')', src);
  }, [insertMarkdown]);

  const handleChange = useCallback((value: string, _viewUpdate: ViewUpdate) => {
    if (!readOnly) {
      setContent(value);
    }
  }, [readOnly]);

  const isTestMode = import.meta.env.MODE === 'test';

  const toolbar = (
    <div className="markdown-editor-toolbar" aria-label="Markdown编辑工具栏">
      <Space size={6} wrap>
        <Tooltip title="加粗">
          <Button aria-label="加粗" icon={<BoldOutlined />} size="small" onClick={() => insertMarkdown('**', '**', '加粗文字')} disabled={readOnly} />
        </Tooltip>
        <Tooltip title="斜体">
          <Button aria-label="斜体" icon={<ItalicOutlined />} size="small" onClick={() => insertMarkdown('*', '*', '斜体文字')} disabled={readOnly} />
        </Tooltip>
        <Tooltip title="无序列表">
          <Button aria-label="无序列表" icon={<UnorderedListOutlined />} size="small" onClick={() => insertList(false)} disabled={readOnly} />
        </Tooltip>
        <Tooltip title="有序列表">
          <Button aria-label="有序列表" icon={<OrderedListOutlined />} size="small" onClick={() => insertList(true)} disabled={readOnly} />
        </Tooltip>
        <Tooltip title="链接">
          <Button aria-label="链接" icon={<LinkOutlined />} size="small" onClick={insertLink} disabled={readOnly} />
        </Tooltip>
        <Tooltip title="图片">
          <Button aria-label="图片" icon={<PictureOutlined />} size="small" onClick={insertImage} disabled={readOnly} />
        </Tooltip>
      </Space>
    </div>
  );

  if (!filePath) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
        <Typography.Text type="secondary">选择左侧文件以开始阅读或编辑</Typography.Text>
      </div>
    );
  }

  if (isImageFile(filePath)) {
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: '32px 48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#faf9f5' }}>
        {loading ? (
          <Spin />
        ) : (
          <img
            src={imagePreviewSrc}
            alt={filePath.split(/[\\/]/).pop() || '图片预览'}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '32px 48px' }}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Spin />
        </div>
      ) : (
        <div
          className="markdown-editor-shell"
          ref={editorShellRef}
          onCopyCapture={handleCopy}
          onKeyDownCapture={handleEditorKeyDown}
        >
          <div className="markdown-save-status">
            {saveStatus === 'saving' ? '保存中' : saveStatus === 'error' ? '保存失败' : '已保存'}
          </div>
          {toolbar}
          <div className="markdown-editor-layout">
            <div className="markdown-source-panel" data-testid="markdown-live-editor">
              {isTestMode && (
                <Input.TextArea
                  value={content}
                  aria-label="Markdown源码编辑区"
                  className="markdown-editor-test-fallback"
                  readOnly={readOnly}
                  onChange={(event) => {
                    if (!readOnly) {
                      setContent(event.target.value);
                    }
                  }}
                />
              )}
              <CodeMirror
                value={content}
                aria-label="Markdown源码编辑区"
                className="muse-codemirror-editor"
                basicSetup={false}
                editable={!readOnly}
                readOnly={readOnly}
                extensions={extensions}
                placeholder="开始写作..."
                onChange={handleChange}
                onCreateEditor={(view) => {
                  editorViewRef.current = view;
                }}
                onUpdate={(viewUpdate) => {
                  if (viewUpdate.view) {
                    editorViewRef.current = viewUpdate.view;
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarkdownEditor;
