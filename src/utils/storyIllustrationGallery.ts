export interface StoryIllustrationGalleryItem {
  id: string;
  anchorText: string;
  prompt: string;
  imagePath: string;
  imageSource: string;
  characterIds: string[];
  createdAt: number;
  tempImageUrl?: string;
}

export const STORY_ILLUSTRATION_META_START = '<!-- MUSEAI_STORY_ILLUSTRATIONS';
export const STORY_ILLUSTRATION_META_END = 'MUSEAI_STORY_ILLUSTRATIONS -->';

export const parseStoryIllustrationGallery = (markdown: string): StoryIllustrationGalleryItem[] => {
  const match = markdown.match(/<!-- MUSEAI_STORY_ILLUSTRATIONS\s*([\s\S]*?)\s*MUSEAI_STORY_ILLUSTRATIONS -->/);
  if (!match?.[1]) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const stripStoryIllustrationGalleryMeta = (markdown: string) => (
  markdown.replace(/\n?<!-- MUSEAI_STORY_ILLUSTRATIONS[\s\S]*?MUSEAI_STORY_ILLUSTRATIONS -->\n?/g, '\n').trimEnd()
);

export const appendStoryIllustrationGalleryMeta = (markdown: string, gallery: StoryIllustrationGalleryItem[]) => {
  const body = stripStoryIllustrationGalleryMeta(markdown);
  if (gallery.length === 0) return body;
  return `${body}\n\n${STORY_ILLUSTRATION_META_START}\n${JSON.stringify(gallery, null, 2)}\n${STORY_ILLUSTRATION_META_END}\n`;
};
