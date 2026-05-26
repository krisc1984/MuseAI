import React, { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Typography, Spin } from 'antd';
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  headingsPlugin,
  imagePlugin,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  type MDXEditorMethods,
  quotePlugin,
  Separator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';

interface MarkdownEditorProps {
  filePath: string | null;
}

type SaveStatus = 'saved' | 'saving' | 'error';

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ filePath }) => {
  const [content, setContent] = useState<string>('');
  const [savedContent, setSavedContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [readError, setReadError] = useState(false);
  const editorRef = useRef<MDXEditorMethods>(null);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollRestoreFrameRef = useRef<number | null>(null);
  const latestContentRef = useRef(content);
  const savedContentRef = useRef(savedContent);
  const loadingRef = useRef(loading);
  const readErrorRef = useRef(readError);
  const lastKnownModifiedAtRef = useRef<number | null>(null);
  const editorPlugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      imagePlugin(),
      tablePlugin(),
      thematicBreakPlugin(),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <BoldItalicUnderlineToggles />
            <ListsToggle />
            <Separator />
            <CreateLink />
            <InsertImage />
            <InsertTable />
            <InsertThematicBreak />
          </>
        ),
      }),
    ],
    []
  );

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
    if (!filePath) {
      setContent('');
      setSavedContent('');
      lastKnownModifiedAtRef.current = null;
      return;
    }
    let mounted = true;
    setLoading(true);
    Promise.all([
      invoke<string>('read_file', { path: filePath }),
      invoke<number>('file_modified_at', { path: filePath }),
    ])
      .then(([text, modifiedAt]) => {
        if (mounted) {
          setContent(text);
          setSavedContent(text);
          editorRef.current?.setMarkdown(text);
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
    if (!filePath) {
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
            editorRef.current?.setMarkdown(text);
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
    const handleCopy = (event: ClipboardEvent) => {
      const editorShell = editorShellRef.current;
      const selection = document.getSelection();
      if (!editorShell || !selection || selection.isCollapsed) {
        return;
      }

      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      const selectionStartsInEditor = anchorNode ? editorShell.contains(anchorNode) : false;
      const selectionEndsInEditor = focusNode ? editorShell.contains(focusNode) : false;
      if (!selectionStartsInEditor && !selectionEndsInEditor) {
        return;
      }

      const selectedMarkdown = editorRef.current?.getSelectionMarkdown();
      const editorText = editorShell.querySelector('.muse-mdx-content')?.textContent?.trim();
      const selectedText = selection.toString().trim();
      const markdownToCopy = selectedMarkdown || (editorText && selectedText === editorText ? editorRef.current?.getMarkdown() : '');

      if (!markdownToCopy) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      event.clipboardData?.setData('text/plain', markdownToCopy);
      event.clipboardData?.setData('text/markdown', markdownToCopy);
    };

    const handleToolbarPointer = (event: Event) => {
      const target = event.target as Element | null;
      if (!target?.closest('.mdxeditor-toolbar, .mdxeditor-popup-container')) {
        return;
      }

      const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
      restoreScrollPosition(scrollTop);
    };

    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('pointerdown', handleToolbarPointer, true);
    document.addEventListener('click', handleToolbarPointer, true);

    return () => {
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('pointerdown', handleToolbarPointer, true);
      document.removeEventListener('click', handleToolbarPointer, true);
      if (scrollRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollRestoreFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!filePath || loading || readError || content === savedContent) {
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
  }, [content, filePath, loading, readError, savedContent]);

  const restoreScrollPosition = (scrollTop: number) => {
    const restoreUntil = Date.now() + 1200;

    if (scrollRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollRestoreFrameRef.current);
    }

    const restore = () => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollTop;
      }

      if (Date.now() < restoreUntil) {
        scrollRestoreFrameRef.current = window.requestAnimationFrame(restore);
      } else {
        scrollRestoreFrameRef.current = null;
      }
    };

    restore();
  };

  if (!filePath) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
        <Typography.Text type="secondary">选择左侧文件以开始阅读或编辑</Typography.Text>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} style={{ height: '100%', overflowY: 'auto', padding: '32px 48px' }}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Spin />
        </div>
      ) : (
        <div
          className="markdown-editor-shell"
          ref={editorShellRef}
        >
          <div className="markdown-save-status">
            {saveStatus === 'saving' ? '保存中' : saveStatus === 'error' ? '保存失败' : '已保存'}
          </div>
          <MDXEditor
            ref={editorRef}
            className="muse-mdx-editor"
            contentEditableClassName="muse-mdx-content"
            markdown={content}
            onChange={(markdown) => setContent(markdown)}
            placeholder="开始写作..."
            spellCheck={false}
            plugins={editorPlugins}
          />
        </div>
      )}
    </div>
  );
};

export default MarkdownEditor;
