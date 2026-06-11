import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDiskStorage } from './diskStorage';

export type GalleryVideoSourceKind = 'character' | 'story';
export type GalleryVideoTaskStatus = 'pending' | 'completed' | 'failed';

export interface GalleryVideoTask {
  id: string;
  taskId?: string;
  videoId?: string;
  sourceKind: GalleryVideoSourceKind;
  sourceTitle: string;
  sourceItemId: string;
  sourcePath?: string;
  prompt: string;
  imageUrl: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  duration: 5 | 10;
  saveDir?: string;
  fileBaseName?: string;
  status: GalleryVideoTaskStatus;
  createdAt: number;
  updatedAt: number;
  videoUrl?: string;
  savedPath?: string;
  errorMessage?: string;
}

interface GalleryVideoState {
  tasks: GalleryVideoTask[];
  upsertTask: (task: GalleryVideoTask) => void;
  removeTask: (id: string) => void;
}

export const useGalleryVideoStore = create<GalleryVideoState>()(
  persist(
    (set) => ({
      tasks: [],
      upsertTask: (task) => set((state) => ({
        tasks: [task, ...state.tasks.filter((item) => item.id !== task.id)].sort((a, b) => b.createdAt - a.createdAt),
      })),
      removeTask: (id) => set((state) => ({
        tasks: state.tasks.filter((item) => item.id !== id),
      })),
    }),
    {
      name: 'museai-gallery-video-storage',
      storage: createJSONStorage(() => createDiskStorage('gallery-video-store', 'museai-gallery-video-storage')),
    },
  ),
);
