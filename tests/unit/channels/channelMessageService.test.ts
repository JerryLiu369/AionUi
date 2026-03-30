import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelMessageService } from '@process/channels/agent/ChannelMessageService';

describe('ChannelMessageService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
});
