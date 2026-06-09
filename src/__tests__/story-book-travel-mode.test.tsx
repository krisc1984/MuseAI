import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Story from '../pages/Story';
import { usePartnerStore } from '../stores/usePartnerStore';
import { useStoryStore } from '../stores/useStoryStore';
import { useBookTravelStore } from '../stores/useBookTravelStore';

const invokeMock = vi.fn(async (command: string, _args?: any) => {
  if (command === 'list_agent_sessions') return [];
  if (command === 'plan_book_travel_scene') {
    return JSON.stringify({
      stateChanges: { time: '第一夜', location: '沈府' },
      divergence: '无',
      storyProgress: 1,
      endingStatus: 'none',
      sceneGoals: ['调查替嫁真相'],
      entryBeatGuidance: '醒来在喜房',
      allowedCast: ['林晚', '沈霜'],
      writerInstructions: '渲染喜房红烛气氛'
    });
  }
  if (command === 'write_book_travel_change_scene') {
    return JSON.stringify({
      id: 'scene-1',
      title: '醒在婚宴',
      summary: '喜房苏醒',
      currentSituation: '红烛高照',
      time: '第一夜',
      location: '沈府喜房',
      activeCharacters: ['林晚'],
      beats: [
        {
          id: 'beat-1',
          content: '她在喜房里睁开眼。',
          choices: [
            {
              id: 'choice-1',
              label: '推门查看',
              effect: { type: 'advance-beat', targetBeatId: 'beat-2' }
            }
          ]
        }
      ],
      volatileMemoryPatch: { clue: '红头盖' }
    });
  }
  if (command === 'save_agent_session') return { id: 'story-session-test', title: '新故事', savedAt: Date.now(), sessionKind: 'bookTravel' };
  if (command === 'save_app_state' || command === 'load_app_state') return '';
  return undefined;
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: any) => invokeMock(command, args),
}));

vi.mock('@tauri-apps/api/event', () => {
  const handlers: Record<string, any[]> = {};
  (globalThis as any).eventHandlers = handlers;
  return {
    listen: async (eventName: string, handler: (event: any) => void) => {
      if (!handlers[eventName]) {
        handlers[eventName] = [];
      }
      handlers[eventName].push(handler);
      return () => {
        handlers[eventName] = handlers[eventName].filter(h => h !== handler);
      };
    },
  };
});

const worldBook = {
  id: 'wb-test',
  name: '云州世界书',
  type: 'world_book' as const,
  content: '世界书正文',
  fields: {},
};

const characterCard = {
  id: 'cc-test',
  name: '沈霜',
  type: 'character_card' as const,
  content: '角色卡正文',
  fields: {},
};

function resetStoryBookTravelStores() {
  usePartnerStore.setState({
    worldBooks: [worldBook],
    characterCards: [characterCard],
    selectedId: null,
    selectedType: null,
  });
  useStoryStore.setState({
    messages: [],
    selectedWorldBookId: null,
    selectedCharacterCardIds: [],
    initialPlot: '',
    isStreaming: false,
    dynamicRoleLoadingEnabled: false,
  });
  useBookTravelStore.getState().resetSession();
  useBookTravelStore.setState({ assembledMaterials: [], selectedMaterialId: null });
  invokeMock.mockClear();
}

function saveReadyMaterial() {
  return useBookTravelStore.getState().saveAssembledMaterial({
    title: '第一卷 · 云州入场',
    materials: {
      outline: { id: '/outline/第一卷.md', title: '第一卷.md', path: '/outline/第一卷.md', content: '大纲正文' },
      worldBook: { id: worldBook.id, title: worldBook.name, content: worldBook.content },
      characterCards: [{ id: characterCard.id, title: characterCard.name, content: characterCard.content }],
    },
    assembledWorldModel: { originalTimeline: ['原线开局'] },
    stableMemory: { worldRules: ['灵契不可违背'] },
    volatileMemory: { clues: [] },
    entryPoints: [
      {
        id: 'entry-1',
        title: '醒在婚宴',
        summary: '红烛未灭，宾客已散',
        timeAndLocation: '第一夜，沈府',
        situation: '红烛未灭，宾客已散',
        initialGoal: '查清替嫁真相',
        risk: '被沈家识破',
      },
    ],
    recommendedUserCharacters: [
      {
        name: '林晚',
        identity: '替嫁者',
        background: '从现代穿入原书',
        personality: '清醒谨慎',
        goal: '改写死局',
      },
    ],
  });
}

describe('Story book-travel mode', () => {
  beforeEach(() => {
    resetStoryBookTravelStores();
  });

  it('shows assembled material selection before book-travel can start', () => {
    render(<Story />);

    fireEvent.click(screen.getByLabelText('穿书'));

    expect(screen.getByText('选择穿书素材')).toBeInTheDocument();
    expect(screen.getByText('暂无已装配素材，请先到素材页完成装配。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /开始装配穿书素材/ })).not.toBeInTheDocument();
  });

  it('loads selected assembled material and shows entry setup with recommended identity', async () => {
    saveReadyMaterial();
    render(<Story />);

    fireEvent.click(screen.getByLabelText('穿书'));
    fireEvent.mouseDown(screen.getByLabelText('选择已装配素材'));
    fireEvent.click(await screen.findByText('第一卷 · 云州入场'));

    expect(await screen.findByText('入场设置')).toBeInTheDocument();
    expect(screen.getByText('醒在婚宴')).toBeInTheDocument();
    expect(screen.getByText('林晚')).toBeInTheDocument();

    fireEvent.click(screen.getByText('林晚'));

    expect(useBookTravelStore.getState().selectedOutline?.content).toBe('大纲正文');
    expect(useBookTravelStore.getState().entryPoints[0].id).toBe('entry-1');
    expect(useBookTravelStore.getState().userCharacter?.name).toBe('林晚');
    expect(invokeMock).not.toHaveBeenCalledWith('start_assemble_book_travel_materials_stream', expect.any(Object));
    expect(invokeMock).not.toHaveBeenCalledWith('start_generate_book_travel_entry_setup_stream', expect.any(Object));
  });

  it('renders active scene, advances beat locally, and saves book-travel state', async () => {
    useBookTravelStore.setState({
      selectedEntryPointId: 'entry-1',
      userCharacter: { name: '林晚', identity: '替嫁者', goal: '改写死局' },
      currentState: { time: '第一夜', location: '沈府' },
      scenes: [{
        id: 'scene-1',
        title: '沈府婚宴',
        summary: '主角醒来',
        currentSituation: '红烛未灭',
        beats: [
          {
            id: 'beat-1',
            content: '她在喜房里睁开眼。',
            choices: [{ id: 'choice-1', label: '推门查看', effect: { type: 'advance-beat', targetBeatId: 'beat-2' } }],
          },
          {
            id: 'beat-2',
            content: '门外长廊空无一人。',
            choices: [],
          },
        ],
        currentSceneId: 'scene-1',
        currentBeatId: 'beat-1',
      } as any],
      currentSceneId: 'scene-1',
      currentBeatId: 'beat-1',
    });

    render(<Story />);

    fireEvent.click(screen.getByLabelText('穿书'));

    expect(screen.getByText('沈府婚宴')).toBeInTheDocument();
    expect(screen.getByText('她在喜房里睁开眼。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '推门查看' }));

    expect(screen.getByText('门外长廊空无一人。')).toBeInTheDocument();
    expect(useBookTravelStore.getState().currentBeatId).toBe('beat-2');
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'save_agent_session',
        expect.objectContaining({
          session: expect.objectContaining({
            sessionKind: 'bookTravel',
            bookTravelState: expect.objectContaining({
              currentSceneId: 'scene-1',
              currentBeatId: 'beat-2',
            }),
          }),
        }),
      );
    });
  });

  it('shows completed ending and blocks book-travel turn submission', () => {
    useBookTravelStore.setState({
      isCompleted: true,
      ending: {
        finalEnding: '林晚改写婚宴死局。',
        worldlineName: '红烛未灭线',
        divergenceScore: 42,
      },
    });

    render(<Story />);

    fireEvent.click(screen.getByLabelText('穿书'));

    expect(screen.getByText('红烛未灭线')).toBeInTheDocument();
    expect(screen.getByText('林晚改写婚宴死局。')).toBeInTheDocument();
    expect(screen.getByText('本次穿书已结束，不能继续提交剧情行动。')).toBeInTheDocument();
  });

  it('starts book-travel adventure when clicking start button', async () => {
    saveReadyMaterial();
    render(<Story />);

    fireEvent.click(screen.getByLabelText('穿书'));
    fireEvent.mouseDown(screen.getByLabelText('选择已装配素材'));
    fireEvent.click(await screen.findByText('第一卷 · 云州入场'));

    expect(await screen.findByText('入场设置')).toBeInTheDocument();

    // Select entry point and character
    fireEvent.click(screen.getByText('林晚'));

    const startBtn = screen.getByRole('button', { name: /确认入场设置并开始穿书/ });
    expect(startBtn).toBeEnabled();
    
    fireEvent.click(startBtn);

    // Verify it calls planner and writer APIs
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('plan_book_travel_scene', expect.any(Object));
      expect(invokeMock).toHaveBeenCalledWith('write_book_travel_change_scene', expect.any(Object));
    });

    // Check that the active scene is now rendered
    expect(await screen.findByText('醒在婚宴')).toBeInTheDocument();
    expect(screen.getByText('她在喜房里睁开眼。')).toBeInTheDocument();
  });
});
