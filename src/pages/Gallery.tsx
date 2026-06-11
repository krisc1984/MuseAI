import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Alert, Button, Card, Empty, Input, InputNumber, Modal, Select, Space, Spin, Tabs, Tag, Typography, message } from 'antd';
import { BookOutlined, PictureOutlined, ReloadOutlined, UserOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { usePartnerStore, type CharacterVisualGalleryItem, type PartnerItem } from '../stores/usePartnerStore';
import { appendStoryIllustrationGalleryMeta, parseStoryIllustrationGallery, type StoryIllustrationGalleryItem } from '../utils/storyIllustrationGallery';
import { DEFAULT_VIDEO_MODEL, createAgnesVideoTask, queryAgnesVideoTask, type AgnesVideoAspectRatio, type AgnesVideoDuration } from '../utils/agnesVideoGeneration';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useGalleryVideoStore, type GalleryVideoTask } from '../stores/useGalleryVideoStore';

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
}

interface CharacterGalleryEntry {
  cardId: string;
  cardName: string;
  item: CharacterVisualGalleryItem;
  isPrimary: boolean;
}

interface StoryGalleryEntry {
  sourceFile: string;
  sourcePath: string;
  item: StoryIllustrationGalleryItem;
}

type VideoSource =
  | { kind: 'character'; cardId: string; itemId: string; title: string; image: string; publicImageUrl: string; saveDir: string; fileBaseName: string }
  | { kind: 'story'; sourcePath: string; itemId: string; title: string; image: string; publicImageUrl: string; saveDir: string; fileBaseName: string };

const getFileName = (path: string) => path.split(/[\\/]/).pop() || path;
const getDirectoryName = (path: string) => path.replace(/[\\/][^\\/]*$/, '');
const slugifyFileName = (input: string) => input.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'video';

const Gallery: React.FC = () => {
  const { characterCards, updateItemFields } = usePartnerStore();
  const settings = useSettingsStore();
  const { tasks: videoTasks, upsertTask, removeTask } = useGalleryVideoStore();
  const [storyEntries, setStoryEntries] = useState<StoryGalleryEntry[]>([]);
  const [loadingStoryEntries, setLoadingStoryEntries] = useState(true);
  const [previewImage, setPreviewImage] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [referencesRoot, setReferencesRoot] = useState('');
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoAspectRatio, setVideoAspectRatio] = useState<AgnesVideoAspectRatio>('16:9');
  const [videoDuration, setVideoDuration] = useState<AgnesVideoDuration>(5);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoImageUrl, setVideoImageUrl] = useState('');
  const [videoNegativePrompt, setVideoNegativePrompt] = useState('');
  const [isUploadingTempImage, setIsUploadingTempImage] = useState(false);
  const [activeTab, setActiveTab] = useState('characters');
  const queryingTaskIdsRef = useRef<Set<string>>(new Set());

  const characterEntries = useMemo<CharacterGalleryEntry[]>(
    () => characterCards.flatMap((card) => (card.fields?.visualImageGallery || []).map((item) => ({
      cardId: card.id,
      cardName: card.fields?.name?.trim() || card.name,
      item,
      isPrimary: card.fields?.visualImage === item.image,
    }))),
    [characterCards],
  );

  const loadStoryEntries = useCallback(async () => {
    setLoadingStoryEntries(true);
    try {
      const articlesRoot = await invoke<string>('get_workspace_dir', { dirType: 'articles' });

      const collectMarkdownFiles = async (dirPath: string): Promise<string[]> => {
        const items = await invoke<FileNode[]>('list_dir', { path: dirPath });
        const nested = await Promise.all(items.map(async (item) => {
          if (item.is_dir) {
            return collectMarkdownFiles(item.path);
          }
          return /\.md$/i.test(item.name) ? [item.path] : [];
        }));
        return nested.flat();
      };

      const markdownFiles = await collectMarkdownFiles(articlesRoot);
      const entries: StoryGalleryEntry[] = [];

      for (const filePath of markdownFiles) {
        const content = await invoke<string>('read_file', { path: filePath });
        const gallery = parseStoryIllustrationGallery(content);
        gallery.forEach((item) => {
          entries.push({
            sourceFile: getFileName(filePath),
            sourcePath: filePath,
            item,
          });
        });
      }

      entries.sort((a, b) => b.item.createdAt - a.item.createdAt);
      setStoryEntries(entries);
    } catch (error) {
      console.error('加载剧情插图图库失败:', error);
      message.error('加载剧情插图图库失败');
    } finally {
      setLoadingStoryEntries(false);
    }
  }, []);

  useEffect(() => {
    void loadStoryEntries();
  }, [loadStoryEntries]);

  useEffect(() => {
    invoke<string>('get_workspace_dir', { dirType: 'references' })
      .then((dir) => setReferencesRoot(dir))
      .catch((error) => {
        console.error('加载图库参考目录失败:', error);
      });
  }, []);

  const handleSetCharacterPrimary = useCallback((card: PartnerItem, item: CharacterVisualGalleryItem) => {
    updateItemFields(card.id, 'character_card', {
      visualImage: item.image,
      visualImageType: item.type,
      visualImageStyle: item.style,
      visualImagePrompt: item.prompt,
      visualImageGallery: card.fields?.visualImageGallery || [],
    });
    message.success('已设为当前主图');
  }, [updateItemFields]);

  const handleDeleteCharacterImage = useCallback((card: PartnerItem, itemId: string) => {
    const gallery = card.fields?.visualImageGallery || [];
    const nextGallery = gallery.filter((entry) => entry.id !== itemId);
    const removedItem = gallery.find((entry) => entry.id === itemId);
    const nextPrimary = card.fields?.visualImage === removedItem?.image ? nextGallery[0] : undefined;

    updateItemFields(card.id, 'character_card', {
      visualImageGallery: nextGallery,
      visualImage: nextPrimary ? nextPrimary.image : card.fields?.visualImage === removedItem?.image ? '' : card.fields?.visualImage,
      visualImageType: nextPrimary ? nextPrimary.type : card.fields?.visualImage === removedItem?.image ? undefined : card.fields?.visualImageType,
      visualImageStyle: nextPrimary ? nextPrimary.style : card.fields?.visualImage === removedItem?.image ? '' : card.fields?.visualImageStyle,
      visualImagePrompt: nextPrimary ? nextPrimary.prompt : card.fields?.visualImage === removedItem?.image ? '' : card.fields?.visualImagePrompt,
    });
    message.success('已删除角色图');
  }, [updateItemFields]);

  const handleUpdateCharacterMeta = useCallback((card: PartnerItem, itemId: string, patch: Partial<Pick<CharacterVisualGalleryItem, 'title' | 'note'>>) => {
    const gallery = (card.fields?.visualImageGallery || []).map((entry) => entry.id === itemId ? { ...entry, ...patch } : entry);
    updateItemFields(card.id, 'character_card', { visualImageGallery: gallery });
  }, [updateItemFields]);

  const handleDeleteStoryEntry = useCallback(async (entry: StoryGalleryEntry) => {
    try {
      const content = await invoke<string>('read_file', { path: entry.sourcePath });
      const nextGallery = parseStoryIllustrationGallery(content).filter((item) => item.id !== entry.item.id);
      const nextContent = appendStoryIllustrationGalleryMeta(content, nextGallery);
      await invoke('write_file', { path: entry.sourcePath, content: nextContent });
      setStoryEntries((prev) => prev.filter((item) => !(item.sourcePath === entry.sourcePath && item.item.id === entry.item.id)));
      message.success('已从剧情插图库移除');
    } catch (error) {
      console.error('删除剧情插图失败:', error);
      message.error('删除剧情插图失败');
    }
  }, []);

  const openVideoModal = useCallback((source: VideoSource) => {
    setVideoSource(source);
    setVideoAspectRatio('16:9');
    setVideoDuration(5);
    setVideoImageUrl(source.publicImageUrl);
    setVideoNegativePrompt('blurry, low quality, flicker, distorted hands, extra limbs, identity drift, unstable face');
    setVideoPrompt(`请基于这张${source.kind === 'character' ? '角色' : '剧情'}图片生成一段高质量动态短视频。保持主体造型、服饰、构图和氛围一致，镜头运动自然，画面稳定，细节清晰，避免人物结构漂移和闪烁。`);
  }, []);

  const handleGenerateVideo = useCallback(async () => {
    if (!videoSource) {
      return;
    }
    if (!settings.videoModelApiKey) {
      message.warning('视频生成 API Key 尚未配置，请先在设置页配置。');
      return;
    }
    const prompt = videoPrompt.trim();
    if (!prompt) {
      message.warning('请先填写视频提示词。');
      return;
    }
    const imageUrl = videoImageUrl.trim();
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
      message.warning('请提供可公网访问的参考图 URL。');
      return;
    }

    const dimensionMap: Record<AgnesVideoAspectRatio, { width: number; height: number }> = {
      '16:9': { width: 1152, height: 768 },
      '9:16': { width: 768, height: 1152 },
      '1:1': { width: 960, height: 960 },
    };
    const frameRate = 24;
    const numFrames = videoDuration === 10 ? 241 : 121;
    const { width, height } = dimensionMap[videoAspectRatio];
    const localTaskId = `video-task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const baseTask: GalleryVideoTask = {
      id: localTaskId,
      sourceKind: videoSource.kind,
      sourceTitle: videoSource.title,
      sourceItemId: videoSource.itemId,
      sourcePath: videoSource.kind === 'story' ? videoSource.sourcePath : undefined,
      prompt,
      imageUrl,
      aspectRatio: videoAspectRatio,
      duration: videoDuration,
      saveDir: videoSource.kind === 'character' ? `${referencesRoot || videoSource.saveDir}/gallery-videos` : videoSource.saveDir,
      fileBaseName: videoSource.fileBaseName,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    upsertTask(baseTask);

    setIsGeneratingVideo(true);
    try {
      const result = await createAgnesVideoTask({
        apiKey: settings.videoModelApiKey,
        baseUrl: settings.videoModelBaseUrl,
        model: settings.videoModelName || DEFAULT_VIDEO_MODEL,
        prompt,
        image: imageUrl,
        width,
        height,
        numFrames,
        frameRate,
        negativePrompt: videoNegativePrompt,
      });

      if (result.videoUrl) {
        const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
        const resolvedSaveDir = (baseTask.saveDir || videoSource.saveDir).replace(/\/gallery-videos\/gallery-videos$/, '/gallery-videos');
        const outputPath = `${resolvedSaveDir}/${videoSource.fileBaseName}-${stamp}.mp4`;
        await invoke('write_media_asset', {
          path: outputPath,
          source: result.videoUrl,
        });

        upsertTask({
          ...baseTask,
          taskId: result.taskId,
          videoId: result.videoId,
          status: 'completed',
          videoUrl: result.videoUrl,
          savedPath: outputPath,
          updatedAt: Date.now(),
        });
        message.success('视频已生成并保存到工作区');
      } else {
        upsertTask({
          ...baseTask,
          taskId: result.taskId,
          videoId: result.videoId,
          status: 'pending',
          errorMessage: undefined,
          updatedAt: Date.now(),
        });
        message.success('视频任务已创建，可在图库的视频栏目查看进度。');
      }
      setVideoSource(null);
    } catch (error) {
      console.error('生成视频失败:', error);
      upsertTask({
        ...baseTask,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '生成视频失败',
        updatedAt: Date.now(),
      });
      message.error(error instanceof Error ? error.message : '生成视频失败');
    } finally {
      setIsGeneratingVideo(false);
    }
  }, [referencesRoot, settings.videoModelApiKey, settings.videoModelBaseUrl, settings.videoModelName, upsertTask, videoAspectRatio, videoDuration, videoImageUrl, videoNegativePrompt, videoPrompt, videoSource]);

  const handleQueryVideoTask = useCallback(async (task: GalleryVideoTask, options?: { silent?: boolean }) => {
    if (!task.taskId && !task.videoId) {
      if (!options?.silent) {
        message.warning('该视频任务没有可用的任务标识，暂时无法查询。');
      }
      return;
    }
    if (!settings.videoModelApiKey) {
      if (!options?.silent) {
        message.warning('视频生成 API Key 尚未配置，请先在设置页配置。');
      }
      return;
    }
    if (queryingTaskIdsRef.current.has(task.id)) {
      return;
    }
    queryingTaskIdsRef.current.add(task.id);
    try {
      const result = await queryAgnesVideoTask({
        apiKey: settings.videoModelApiKey,
        baseUrl: settings.videoModelBaseUrl,
      }, task.taskId || task.videoId || task.id, {
        videoId: task.videoId,
        modelName: settings.videoModelName || DEFAULT_VIDEO_MODEL,
      });
      if (!result.videoUrl) {
        upsertTask({
          ...task,
          taskId: result.taskId || task.taskId,
          videoId: result.videoId || task.videoId,
          status: 'pending',
          errorMessage: '任务仍在处理中，请稍后再查。',
          updatedAt: Date.now(),
        });
        if (!options?.silent) {
          message.info('任务仍在处理中，请稍后再查。');
        }
        return;
      }

      const fallbackStoryDir = task.sourcePath
        ? `${getDirectoryName(task.sourcePath)}/videos`
        : `${getDirectoryName(storyEntries.find((entry) => entry.item.id === task.sourceItemId)?.sourcePath || '')}/videos`;
      const saveDir = task.saveDir || (task.sourceKind === 'character'
        ? `${referencesRoot || '.'}/gallery-videos`
        : fallbackStoryDir);
      const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
      const outputPath = task.savedPath || `${saveDir}/${task.fileBaseName || slugifyFileName(task.sourceTitle)}-${stamp}.mp4`;
      await invoke('write_media_asset', {
        path: outputPath,
        source: result.videoUrl,
      });
      upsertTask({
        ...task,
        taskId: result.taskId || task.taskId,
        videoId: result.videoId || task.videoId,
        status: 'completed',
        videoUrl: result.videoUrl,
        savedPath: outputPath,
        errorMessage: undefined,
        updatedAt: Date.now(),
      });
      if (!options?.silent) {
        message.success('视频任务已查询成功并保存到工作区');
      }
    } catch (error) {
      upsertTask({
        ...task,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '查询视频任务失败',
        updatedAt: Date.now(),
      });
      if (!options?.silent) {
        message.error(error instanceof Error ? error.message : '查询视频任务失败');
      }
    } finally {
      queryingTaskIdsRef.current.delete(task.id);
    }
  }, [referencesRoot, settings.videoModelApiKey, settings.videoModelBaseUrl, storyEntries, upsertTask]);

  useEffect(() => {
    if (activeTab !== 'videos') {
      return;
    }
    const pendingTasks = videoTasks.filter((task) => task.status === 'pending' && (task.taskId || task.videoId));
    if (pendingTasks.length === 0) {
      return;
    }

    pendingTasks.forEach((task) => {
      void handleQueryVideoTask(task, { silent: true });
    });

    const timer = window.setInterval(() => {
      const latestPending = useGalleryVideoStore.getState().tasks.filter((task) => task.status === 'pending' && (task.taskId || task.videoId));
      latestPending.forEach((task) => {
        void handleQueryVideoTask(task, { silent: true });
      });
    }, 10000);

    return () => window.clearInterval(timer);
  }, [activeTab, handleQueryVideoTask, videoTasks]);

  const handleUploadTempImage = useCallback(async () => {
    if (!videoSource) {
      return;
    }
    setIsUploadingTempImage(true);
    try {
      const uploadedUrl = await invoke<string>('upload_temp_image', { source: videoSource.image });
      setVideoImageUrl(uploadedUrl);
      if (videoSource.kind === 'character') {
        const card = characterCards.find((item) => item.id === videoSource.cardId);
        if (card) {
          const nextGallery = (card.fields?.visualImageGallery || []).map((entry) =>
            entry.id === videoSource.itemId ? { ...entry, tempImageUrl: uploadedUrl } : entry
          );
          updateItemFields(card.id, 'character_card', { visualImageGallery: nextGallery });
        }
      } else {
        const content = await invoke<string>('read_file', { path: videoSource.sourcePath });
        const nextGallery = parseStoryIllustrationGallery(content).map((entry) =>
          entry.id === videoSource.itemId ? { ...entry, tempImageUrl: uploadedUrl } : entry
        );
        const nextContent = appendStoryIllustrationGalleryMeta(content, nextGallery);
        await invoke('write_file', { path: videoSource.sourcePath, content: nextContent });
        setStoryEntries((prev) => prev.map((entry) =>
          entry.sourcePath === videoSource.sourcePath && entry.item.id === videoSource.itemId
            ? { ...entry, item: { ...entry.item, tempImageUrl: uploadedUrl } }
            : entry
        ));
      }
      message.success('已上传到临时图床并自动回填 URL');
    } catch (error) {
      console.error('上传临时图床失败:', error);
      message.error(error instanceof Error ? error.message : '上传临时图床失败');
    } finally {
      setIsUploadingTempImage(false);
    }
  }, [characterCards, updateItemFields, videoSource]);

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>图库</Typography.Title>
          <Typography.Text type="secondary">统一查看和管理角色图、剧情插图。</Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void loadStoryEntries()}>
          刷新剧情插图
        </Button>
      </div>

      <Tabs
        defaultActiveKey="characters"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'characters',
            label: (
              <span>
                <UserOutlined /> 角色图
              </span>
            ),
            children: characterEntries.length === 0 ? (
              <Empty description="暂无角色图" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {characterEntries.map((entry) => {
                  const card = characterCards.find((item) => item.id === entry.cardId);
                  if (!card) return null;
                  return (
                    <Card
                      key={entry.item.id}
                      size="small"
                      title={
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span>{entry.cardName}</span>
                          {entry.isPrimary && <Tag color="gold">当前主图</Tag>}
                        </div>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewImage(entry.item.image);
                          setPreviewTitle(entry.item.title?.trim() || `${entry.cardName}角色图`);
                        }}
                        style={{ border: 'none', background: 'transparent', padding: 0, width: '100%', cursor: 'zoom-in' }}
                      >
                        <img src={entry.item.image} alt={`${entry.cardName}角色图`} style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 8, background: '#faf9f5' }} />
                      </button>
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Space wrap>
                          {entry.item.type && <Tag>{entry.item.type === 'portrait' ? '角色图' : entry.item.type === 'turnaround' ? '三视图' : '表情图'}</Tag>}
                          {entry.item.style && <Tag color="orange">{entry.item.style}</Tag>}
                          {entry.item.source && <Tag color="blue">{entry.item.source === 'uploaded' ? '上传' : '生成'}</Tag>}
                        </Space>
                        <Input
                          aria-label={`图库角色图名称-${entry.item.id}`}
                          placeholder="图片名称"
                          value={entry.item.title || ''}
                          onChange={(event) => handleUpdateCharacterMeta(card, entry.item.id, { title: event.target.value })}
                        />
                        <Input.TextArea
                          aria-label={`图库角色图备注-${entry.item.id}`}
                          placeholder="备注"
                          value={entry.item.note || ''}
                          autoSize={{ minRows: 2, maxRows: 4 }}
                          onChange={(event) => handleUpdateCharacterMeta(card, entry.item.id, { note: event.target.value })}
                        />
                        <Space wrap>
                          <Button size="small" onClick={() => handleSetCharacterPrimary(card, entry.item)} disabled={entry.isPrimary}>
                            设为主图
                          </Button>
                          <Button
                            size="small"
                            icon={<VideoCameraOutlined />}
                            onClick={() => openVideoModal({
                              kind: 'character',
                              cardId: card.id,
                              itemId: entry.item.id,
                              title: `${entry.cardName}角色图`,
                              image: entry.item.image,
                              publicImageUrl: entry.item.tempImageUrl || (/^https?:\/\//i.test(entry.item.image) ? entry.item.image : ''),
                              saveDir: referencesRoot || '.',
                              fileBaseName: slugifyFileName(`${entry.cardName}-character-video`),
                            })}
                          >
                            生成视频
                          </Button>
                          <Button size="small" danger onClick={() => handleDeleteCharacterImage(card, entry.item.id)}>
                            删除
                          </Button>
                        </Space>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ),
          },
          {
            key: 'stories',
            label: (
              <span>
                <PictureOutlined /> 剧情插图
              </span>
            ),
            children: loadingStoryEntries ? (
              <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
            ) : storyEntries.length === 0 ? (
              <Empty description="暂无剧情插图" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {storyEntries.map((entry) => (
                  <Card
                    key={`${entry.sourcePath}-${entry.item.id}`}
                    size="small"
                    title={
                      <Space size={8}>
                        <BookOutlined />
                        <span>{entry.sourceFile}</span>
                      </Space>
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewImage(entry.item.imageSource);
                        setPreviewTitle(`${entry.sourceFile} · 剧情插图`);
                      }}
                      style={{ border: 'none', background: 'transparent', padding: 0, width: '100%', cursor: 'zoom-in' }}
                    >
                      <img src={entry.item.imageSource} alt={`${entry.sourceFile}剧情插图`} style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 8, background: '#faf9f5' }} />
                    </button>
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Typography.Text type="secondary">
                        {new Date(entry.item.createdAt).toLocaleString('zh-CN')}
                      </Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0 }} ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}>
                        {entry.item.anchorText}
                      </Typography.Paragraph>
                      <Typography.Paragraph style={{ marginBottom: 0 }} ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}>
                        <strong>提示词：</strong>{entry.item.prompt}
                      </Typography.Paragraph>
                      <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>
                        {entry.item.imagePath}
                      </Typography.Text>
                      <Space wrap>
                        <Button
                          size="small"
                          icon={<VideoCameraOutlined />}
                          onClick={() => openVideoModal({
                            kind: 'story',
                            sourcePath: entry.sourcePath,
                            itemId: entry.item.id,
                            title: `${entry.sourceFile}剧情插图`,
                            image: entry.item.imageSource,
                            publicImageUrl: entry.item.tempImageUrl || (/^https?:\/\//i.test(entry.item.imageSource) ? entry.item.imageSource : ''),
                            saveDir: `${getDirectoryName(entry.sourcePath)}/videos`,
                            fileBaseName: slugifyFileName(`${getFileName(entry.sourcePath).replace(/\.md$/i, '')}-story-video`),
                          })}
                        >
                          生成视频
                        </Button>
                        <Button size="small" danger onClick={() => void handleDeleteStoryEntry(entry)}>
                          从图库移除
                        </Button>
                      </Space>
                    </div>
                  </Card>
                ))}
              </div>
            ),
          },
          {
            key: 'videos',
            label: (
              <span>
                <VideoCameraOutlined /> 视频
              </span>
            ),
            children: videoTasks.length === 0 ? (
              <Empty description="暂无视频任务" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                {videoTasks.map((task) => (
                  <Card
                    key={task.id}
                    size="small"
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span>{task.sourceTitle}</span>
                        <Tag color={task.status === 'completed' ? 'green' : task.status === 'pending' ? 'gold' : 'red'}>
                          {task.status === 'completed' ? '已生成' : task.status === 'pending' ? '生成中/待查询' : '失败'}
                        </Tag>
                      </div>
                    }
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Typography.Text type="secondary">
                        {new Date(task.updatedAt).toLocaleString('zh-CN')}
                      </Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0 }} ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}>
                        {task.prompt}
                      </Typography.Paragraph>
                      <Space wrap>
                        <Tag>{task.aspectRatio}</Tag>
                        <Tag>{task.duration}s</Tag>
                        {task.taskId && <Tag color="blue">任务ID: {task.taskId}</Tag>}
                        {task.videoId && <Tag color="purple">视频ID: {task.videoId}</Tag>}
                      </Space>
                      {task.videoUrl ? (
                        <video src={task.videoUrl} controls style={{ width: '100%', borderRadius: 8, background: '#000' }} />
                      ) : (
                        <div style={{ borderRadius: 8, background: '#faf9f5', padding: 16, color: '#8c8882' }}>
                          正在等待视频生成结果…
                        </div>
                      )}
                      {task.savedPath && (
                        <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>
                          已保存到：{task.savedPath}
                        </Typography.Text>
                      )}
                      {task.errorMessage && (
                        <Typography.Text type="danger">{task.errorMessage}</Typography.Text>
                      )}
                      <Space wrap>
                        {task.status !== 'completed' && (
                          <Button size="small" onClick={() => void handleQueryVideoTask(task)}>
                            查询视频任务
                          </Button>
                        )}
                        <Button size="small" danger onClick={() => removeTask(task.id)}>
                          删除记录
                        </Button>
                      </Space>
                    </div>
                  </Card>
                ))}
              </div>
            ),
          },
        ]}
      />

      <Modal
        title={previewTitle || '查看图片'}
        open={!!previewImage}
        footer={null}
        onCancel={() => {
          setPreviewImage('');
          setPreviewTitle('');
        }}
        width={960}
      >
        {previewImage && (
          <img
            src={previewImage}
            alt="图库放大预览"
            style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8, background: '#faf9f5' }}
          />
        )}
      </Modal>

      <Modal
        title={videoSource ? `生成视频：${videoSource.title}` : '生成视频'}
        open={!!videoSource}
        destroyOnHidden
        onCancel={() => {
          if (!isGeneratingVideo) {
            setVideoSource(null);
          }
        }}
        footer={[
          <Button key="cancel" onClick={() => setVideoSource(null)} disabled={isGeneratingVideo}>取消</Button>,
          <Button key="submit" type="primary" loading={isGeneratingVideo} onClick={() => void handleGenerateVideo()}>
            生成视频
          </Button>,
        ]}
        width={860}
      >
        {videoSource && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>
                <img src={videoSource.image} alt="视频生成参考图" style={{ width: '100%', borderRadius: 8, objectFit: 'cover', background: '#faf9f5' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Alert
                    type="info"
                    showIcon
                    message="Agnes Video V2.0 需要可公网访问的参考图 URL"
                    description="如果当前图库图片不是公网链接，请先把图片上传到可外链的图床/CDN，再把 URL 粘贴到这里。"
                  />
                  <div>
                    <Typography.Text type="secondary">参考图公网 URL</Typography.Text>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <Input
                        aria-label="参考图公网URL"
                        value={videoImageUrl}
                        onChange={(event) => setVideoImageUrl(event.target.value)}
                        placeholder="https://example.com/your-image.png"
                      />
                      <Button loading={isUploadingTempImage} onClick={() => void handleUploadTempImage()}>
                        上传并回填
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Typography.Text type="secondary">提示词预览</Typography.Text>
                    <Input.TextArea
                    aria-label="视频提示词"
                    value={videoPrompt}
                    onChange={(event) => setVideoPrompt(event.target.value)}
                    autoSize={{ minRows: 6, maxRows: 12 }}
                    placeholder="请先确认或编辑视频提示词。"
                    />
                  </div>
                  <div>
                    <Typography.Text type="secondary">负向提示词</Typography.Text>
                    <Input.TextArea
                      aria-label="视频负向提示词"
                      value={videoNegativePrompt}
                      onChange={(event) => setVideoNegativePrompt(event.target.value)}
                      autoSize={{ minRows: 2, maxRows: 6 }}
                      placeholder="可选：描述需要避免的内容。"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <Typography.Text type="secondary">画幅比例</Typography.Text>
                    <Select
                      aria-label="视频画幅比例"
                      value={videoAspectRatio}
                      onChange={(value) => setVideoAspectRatio(value)}
                      options={[
                        { value: '16:9', label: '16:9 横版' },
                        { value: '9:16', label: '9:16 竖版' },
                        { value: '1:1', label: '1:1 方版' },
                      ]}
                      style={{ width: '100%', marginTop: 6 }}
                    />
                  </div>
                  <div>
                    <Typography.Text type="secondary">时长（秒）</Typography.Text>
                    <InputNumber
                      aria-label="视频时长秒数"
                      min={5}
                      max={10}
                      step={5}
                      value={videoDuration}
                      onChange={(value) => setVideoDuration((value === 10 ? 10 : 5) as AgnesVideoDuration)}
                      style={{ width: '100%', marginTop: 6 }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Gallery;
