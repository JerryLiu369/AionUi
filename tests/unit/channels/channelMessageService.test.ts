import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelMessageService } from '@process/channels/agent/ChannelMessageService';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import * as databaseModule from '@process/services/database';

const flushMicrotasks = async (count = 5) => {
  for (let i = 0; i < count; i++) {
    await Promise.resolve();
  }
};

describe('ChannelMessageService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('waits for Gemini continuation after a tool-only finish', async () => {
    const service = new ChannelMessageService() as any;
    const callback = vi.fn();
    const resolve = vi.fn();
    const reject = vi.fn();

    service.activeStreams.set('conv-1', {
      msgId: 'msg-1',
      callback,
      buffer: '',
      resolve,
      reject,
      turnCount: 0,
      finishCount: 0,
      lastVisibleMessageType: undefined,
      finishTimer: undefined,
    });

    service.handleAgentMessage({ conversation_id: 'conv-1', type: 'start', msg_id: 'msg-1', data: '' });
    service.handleAgentMessage({
      conversation_id: 'conv-1',
      type: 'tool_group',
      msg_id: 'msg-1',
      data: [
        {
          callId: 'tool-1',
          description: 'Searching the web for: test',
          name: 'google_web_search',
          renderOutputAsMarkdown: false,
          status: 'Confirming',
        },
      ],
    });
    service.handleAgentMessage({ conversation_id: 'conv-1', type: 'finish', msg_id: 'msg-1', data: '' });

    await vi.advanceTimersByTimeAsync(14_000);
    expect(resolve).not.toHaveBeenCalled();

    service.handleAgentMessage({ conversation_id: 'conv-1', type: 'start', msg_id: 'msg-1', data: '' });
    service.handleAgentMessage({
      conversation_id: 'conv-1',
      type: 'content',
      msg_id: 'msg-1',
      data: 'Final answer from Gemini',
    });
    service.handleAgentMessage({ conversation_id: 'conv-1', type: 'finish', msg_id: 'msg-1', data: '' });

    expect(resolve).toHaveBeenCalledWith('msg-1');
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'text',
        content: expect.objectContaining({ content: 'Final answer from Gemini' }),
      }),
      true
    );
  });

  it('waits for ACP continuation after a tool-only finish', async () => {
    const service = new ChannelMessageService() as any;
    const callback = vi.fn();
    const resolve = vi.fn();
    const reject = vi.fn();

    service.activeStreams.set('conv-acp', {
      msgId: 'msg-acp',
      callback,
      buffer: '',
      resolve,
      reject,
      turnCount: 0,
      finishCount: 0,
      lastVisibleMessageType: undefined,
      finishTimer: undefined,
    });

    service.handleAgentMessage({ conversation_id: 'conv-acp', type: 'start', msg_id: 'msg-acp', data: '' });
    service.handleAgentMessage({
      conversation_id: 'conv-acp',
      type: 'acp_tool_call',
      msg_id: 'msg-acp',
      data: { update: { toolCallId: 'tool-acp', status: 'executing' } },
    });
    service.handleAgentMessage({ conversation_id: 'conv-acp', type: 'finish', msg_id: 'msg-acp', data: '' });

    await vi.advanceTimersByTimeAsync(14_000);
    expect(resolve).not.toHaveBeenCalled();

    service.handleAgentMessage({ conversation_id: 'conv-acp', type: 'start', msg_id: 'msg-acp', data: '' });
    service.handleAgentMessage({
      conversation_id: 'conv-acp',
      type: 'content',
      msg_id: 'msg-acp',
      data: 'Final answer from ACP',
    });
    service.handleAgentMessage({ conversation_id: 'conv-acp', type: 'finish', msg_id: 'msg-acp', data: '' });

    expect(resolve).toHaveBeenCalledWith('msg-acp');
  });

  it('waits for Codex continuation after a tool-only finish', async () => {
    const service = new ChannelMessageService() as any;
    const callback = vi.fn();
    const resolve = vi.fn();
    const reject = vi.fn();

    service.activeStreams.set('conv-codex', {
      msgId: 'msg-codex',
      callback,
      buffer: '',
      resolve,
      reject,
      turnCount: 0,
      finishCount: 0,
      lastVisibleMessageType: undefined,
      finishTimer: undefined,
    });

    service.handleAgentMessage({ conversation_id: 'conv-codex', type: 'start', msg_id: 'msg-codex', data: '' });
    service.handleAgentMessage({
      conversation_id: 'conv-codex',
      type: 'codex_tool_call',
      msg_id: 'msg-codex',
      data: { toolCallId: 'tool-codex', status: 'executing', kind: 'execute' },
    });
    service.handleAgentMessage({ conversation_id: 'conv-codex', type: 'finish', msg_id: 'msg-codex', data: '' });

    await vi.advanceTimersByTimeAsync(14_000);
    expect(resolve).not.toHaveBeenCalled();

    service.handleAgentMessage({ conversation_id: 'conv-codex', type: 'start', msg_id: 'msg-codex', data: '' });
    service.handleAgentMessage({
      conversation_id: 'conv-codex',
      type: 'content',
      msg_id: 'msg-codex',
      data: 'Final answer from Codex',
    });
    service.handleAgentMessage({ conversation_id: 'conv-codex', type: 'finish', msg_id: 'msg-codex', data: '' });

    expect(resolve).toHaveBeenCalledWith('msg-codex');
  });

  it('resolves a tool-only stream after the continuation wait expires', async () => {
    const service = new ChannelMessageService() as any;
    const callback = vi.fn();
    const resolve = vi.fn();
    const reject = vi.fn();

    service.activeStreams.set('conv-timeout', {
      msgId: 'msg-timeout',
      callback,
      buffer: '',
      resolve,
      reject,
      turnCount: 0,
      finishCount: 0,
      lastVisibleMessageType: undefined,
      finishTimer: undefined,
    });

    service.handleAgentMessage({ conversation_id: 'conv-timeout', type: 'start', msg_id: 'msg-timeout', data: '' });
    service.handleAgentMessage({
      conversation_id: 'conv-timeout',
      type: 'plan',
      msg_id: 'msg-timeout',
      data: { sessionId: 'session-1', entries: [] },
    });
    service.handleAgentMessage({ conversation_id: 'conv-timeout', type: 'finish', msg_id: 'msg-timeout', data: '' });

    await vi.advanceTimersByTimeAsync(14_999);
    expect(resolve).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(resolve).toHaveBeenCalledWith('msg-timeout');
  });

  it('still resolves immediately for plain text responses', () => {
    const service = new ChannelMessageService() as any;
    const callback = vi.fn();
    const resolve = vi.fn();
    const reject = vi.fn();

    service.activeStreams.set('conv-2', {
      msgId: 'msg-2',
      callback,
      buffer: '',
      resolve,
      reject,
      turnCount: 0,
      finishCount: 0,
      lastVisibleMessageType: undefined,
      finishTimer: undefined,
    });

    service.handleAgentMessage({ conversation_id: 'conv-2', type: 'start', msg_id: 'msg-2', data: '' });
    service.handleAgentMessage({
      conversation_id: 'conv-2',
      type: 'content',
      msg_id: 'msg-2',
      data: 'Plain reply',
    });
    service.handleAgentMessage({ conversation_id: 'conv-2', type: 'finish', msg_id: 'msg-2', data: '' });

    expect(resolve).toHaveBeenCalledWith('msg-2');
  });

  it('settles a waiting tool-only stream before replacing it with a new send', async () => {
    const service = new ChannelMessageService() as any;
    const oldResolve = vi.fn();
    const oldReject = vi.fn();

    service.activeStreams.set('conv-3', {
      msgId: 'old-msg',
      callback: vi.fn(),
      buffer: '',
      resolve: oldResolve,
      reject: oldReject,
      turnCount: 1,
      finishCount: 1,
      lastVisibleMessageType: 'tool_group',
      finishTimer: setTimeout(() => {}, 15_000),
    });

    vi.spyOn(databaseModule, 'getDatabase').mockResolvedValue({
      getConversation: () => ({ success: false }),
    } as any);

    const sendTaskMessage = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(workerTaskManager, 'getOrBuildTask').mockResolvedValue({
      type: 'gemini',
      sendMessage: sendTaskMessage,
    } as any);

    const newStreamPromise = service.sendMessage('session-1', 'conv-3', 'hello', vi.fn());
    await flushMicrotasks();

    expect(sendTaskMessage).toHaveBeenCalled();
    expect(oldResolve).toHaveBeenCalledWith('old-msg');
    expect(oldReject).not.toHaveBeenCalled();

    service.clearStreamByConversationId('conv-3');
    await expect(newStreamPromise).resolves.toContain('channel_msg_');
  });
});
