import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Chat from '../pages/Chat';
import { usePartnerChatStore } from '../stores/usePartnerChatStore';
import { usePartnerStore } from '../stores/usePartnerStore';
import { useSettingsStore } from '../stores/useSettingsStore';

const invokeMock = vi.fn(async (command: string, _args?: unknown) => {
  if (command === 'start_chat_completion_stream') return 'run-1';
  if (command === 'summarize_text') return '测试标题';
  if (command === 'save_agent_session') return { id: 'chat-session-test', title: '测试标题', savedAt: Date.now() };
  if (command === 'list_agent_sessions') return [];
  return undefined;
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown) => invokeMock(command, args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: async () => () => {},
}));

describe('Chat page request payload', () => {
  beforeEach(() => {
    invokeMock.mockClear();
    usePartnerStore.setState({
      worldBooks: [{ id: 'wb-1', name: '世界', type: 'world_book', content: '# 世界', fields: {} }],
      characterCards: [{ id: 'cc-1', name: '伴侣', type: 'character_card', content: '# 角色卡：伴侣', fields: {} }],
      selectedId: null,
      selectedType: null,
    });
    usePartnerChatStore.setState({
      messages: [],
      input: '你好',
      selectedCharacterCardId: 'cc-1',
      selectedWorldBookId: 'wb-1',
      activeRun: { runId: null, messageId: null },
      isSessionArchived: false,
      sessionId: 'chat-session-test',
      sessionTitle: '新对话',
      userInfo: {},
      sessions: [],
      contextCompaction: null,
    });
    useSettingsStore.setState({
      modelInterface: 'OpenAI-compatible',
      llmApiKey: 'key',
      llmBaseUrl: 'https://api.example.com/v1',
      llmModel: 'agnes-2.0-flash',
      partnerChatPrompt: '你是伴侣。',
      agentConfigs: {
        ...useSettingsStore.getState().agentConfigs,
        partnerChat: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          maxContextTokens: 8000,
          thinkingDepth: 'off',
        },
      },
    });
  });

  it('does not send an empty allowedTools array for companion chat', async () => {
    render(<Chat />);

    fireEvent.click(screen.getByRole('button', { name: 'play-circle' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'start_chat_completion_stream',
        expect.objectContaining({
          request: expect.objectContaining({
            allowedTools: undefined,
          }),
        }),
      );
    });
  });

  it('prefers selected user character card content for chat prompt', async () => {
    usePartnerStore.setState({
      worldBooks: [{ id: 'wb-1', name: '世界', type: 'world_book', content: '# 世界', fields: {} }],
      characterCards: [
        { id: 'cc-1', name: '伴侣', type: 'character_card', content: '# 角色卡：伴侣', fields: {} },
        { id: 'cc-user', name: '顾迟', type: 'character_card', content: '# 角色卡：顾迟\n顾迟角色卡正文', fields: {} },
      ],
      selectedId: null,
      selectedType: null,
    });
    usePartnerChatStore.setState({
      messages: [],
      input: '你好',
      isStreaming: false,
      selectedCharacterCardId: 'cc-1',
      selectedUserCharacterCardId: 'cc-user',
      userInfo: { skills: '风系魔法' },
    });

    render(<Chat />);
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'start_chat_completion_stream',
        expect.objectContaining({
          request: expect.objectContaining({
            systemPrompt: expect.stringContaining('顾迟角色卡正文'),
          }),
        }),
      );
    });

    const startCall = invokeMock.mock.calls.find(([command]) => command === 'start_chat_completion_stream');
    expect(startCall?.[1]).toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          systemPrompt: expect.not.stringContaining('风系魔法'),
        }),
      }),
    );
  });
});
