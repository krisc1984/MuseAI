import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OutlineAssessmentAgentChat from '../components/OutlineAssessmentAgentChat';
import type { Message } from '../stores/useAgentStore';

type StreamPayload = {
  runId: string;
  eventType: 'done';
};

let streamListener: ((event: { payload: StreamPayload }) => void) | null = null;
let runCounter = 0;

const invokeMock = vi.fn(async (command: string, _args?: unknown) => {
  if (command === 'get_workspace_dir') return '/Users/test/Documents/MuseAI/outline';
  if (command === 'build_full_system_prompt') return '完整系统提示词';
  if (command === 'start_chat_completion_stream') {
    runCounter += 1;
    return `run-${runCounter}`;
  }
  return undefined;
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown) => invokeMock(command, args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_event: string, handler: (event: { payload: StreamPayload }) => void) => {
    streamListener = handler;
    return () => {
      streamListener = null;
    };
  },
}));

function Harness({
  onBeforeStart,
  onDone,
}: {
  onBeforeStart: () => Promise<{ content: string; allowedWritePaths?: string[] }>;
  onDone: (lastAgentMessage: string) => string | void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeRun, setActiveRun] = useState<{ runId: string | null; messageId: string | null }>({
    runId: null,
    messageId: null,
  });
  const [isRunning, setIsRunning] = useState(false);

  return (
    <OutlineAssessmentAgentChat
      title="大纲评估 Agent"
      agentId="outlineAssessment"
      systemPrompt="系统提示词"
      allowedTools={['read']}
      startContent="开始评估"
      messages={messages}
      setMessages={setMessages}
      activeRun={activeRun}
      setActiveRun={setActiveRun}
      isRunning={isRunning}
      onRunningChange={setIsRunning}
      onBeforeStart={onBeforeStart}
      onDone={onDone}
    />
  );
}

describe('OutlineAssessmentAgentChat', () => {
  beforeEach(() => {
    streamListener = null;
    runCounter = 0;
    invokeMock.mockClear();
  });

  it('continues format-fix prompts without running onBeforeStart again', async () => {
    const onBeforeStart = vi.fn(async () => ({ content: '请分析大纲: outline.md' }));
    const onDone = vi.fn(() => '请重新输出合法 JSON');

    render(<Harness onBeforeStart={onBeforeStart} onDone={onDone} />);

    fireEvent.click(screen.getByRole('button', { name: '开始' }));

    await waitFor(() => {
      expect(onBeforeStart).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenCalledWith(
        'start_chat_completion_stream',
        expect.objectContaining({
          request: expect.objectContaining({
            messages: [expect.objectContaining({ content: '请分析大纲: outline.md' })],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(streamListener).not.toBeNull();
    });

    await act(async () => {
      streamListener?.({ payload: { runId: 'run-1', eventType: 'done' } });
    });

    await waitFor(() => {
      const startCalls = invokeMock.mock.calls.filter(([command]) => command === 'start_chat_completion_stream');
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onBeforeStart).toHaveBeenCalledTimes(1);
      expect(startCalls).toHaveLength(2);
      expect(startCalls[1]).toEqual([
        'start_chat_completion_stream',
        expect.objectContaining({
          request: expect.objectContaining({
            messages: [
              expect.objectContaining({ content: '请分析大纲: outline.md' }),
              expect.objectContaining({ role: 'agent' }),
              expect.objectContaining({ content: '请重新输出合法 JSON' }),
            ],
          }),
        }),
      ]);
    });
  });
});
