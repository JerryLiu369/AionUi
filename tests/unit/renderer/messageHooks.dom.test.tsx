import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MessageListProvider,
  useAddOrUpdateMessage,
  useMessageList,
  useMessageLstCache,
  useRemoveMessageByMsgId,
} from '@/renderer/pages/conversation/Messages/hooks';

const mockGetConversationMessagesInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessages: {
        invoke: (...args: unknown[]) => mockGetConversationMessagesInvoke(...args),
      },
    },
  },
}));

type TestMessage = {
  id: string;
  msg_id?: string;
  conversation_id: string;
  type: string;
  position?: string;
  content: {
    content: string;
  };
  createdAt?: number;
};

const CacheProbe = ({ conversationId }: { conversationId: string }) => {
  useMessageLstCache(conversationId);
  const messages = useMessageList();
  return <pre data-testid='messages'>{JSON.stringify(messages)}</pre>;
};

const MutationProbe = () => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const removeMessageByMsgId = useRemoveMessageByMsgId();
  const messages = useMessageList();

  return (
    <div>
      <button
        type='button'
        onClick={() =>
          addOrUpdateMessage(
            {
              id: 'msg-1',
              msg_id: 'msg-1',
              conversation_id: 'conv-1',
              type: 'text',
              position: 'right',
              content: { content: 'queued message' },
            },
            true
          )
        }
      >
        add-message
      </button>
      <button type='button' onClick={() => removeMessageByMsgId('msg-1')}>
        remove-message
      </button>
      <pre data-testid='mutated-messages'>{JSON.stringify(messages)}</pre>
    </div>
  );
};

describe('message hooks cache merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps same-conversation streaming messages while filtering out messages from the previous conversation', async () => {
    const dbMessages: TestMessage[] = [
      {
        id: 'db-1',
        msg_id: 'db-1',
        conversation_id: 'conv-1',
        type: 'text',
        content: { content: 'from db' },
      },
    ];

    mockGetConversationMessagesInvoke.mockResolvedValue(dbMessages);

    const initialMessages: TestMessage[] = [
      {
        id: 'stream-1',
        msg_id: 'stream-1',
        conversation_id: 'conv-1',
        type: 'text',
        content: { content: 'streaming current conversation' },
      },
      {
        id: 'stream-2',
        msg_id: 'stream-2',
        conversation_id: 'conv-2',
        type: 'text',
        content: { content: 'streaming stale conversation' },
      },
    ];

    render(
      <MessageListProvider value={initialMessages}>
        <CacheProbe conversationId='conv-1' />
      </MessageListProvider>
    );

    await waitFor(() => {
      const content = screen.getByTestId('messages').textContent;
      expect(content).toContain('db-1');
      expect(content).toContain('stream-1');
    });

    const merged = JSON.parse(screen.getByTestId('messages').textContent ?? '[]') as TestMessage[];

    expect(merged.map((message) => message.id)).toEqual(['db-1', 'stream-1']);
  });

  it('adds optimistic messages and removes them by msg id', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue([]);

    render(
      <MessageListProvider value={[]}>
        <MutationProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-message' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).toContain('msg-1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'remove-message' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).not.toContain('msg-1');
    });
  });
});

const InterleavedProbe = () => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const messages = useMessageList();

  return (
    <div>
      <button
        type='button'
        onClick={() => {
          addOrUpdateMessage({
            id: 'text-1',
            msg_id: 'text-A',
            conversation_id: 'conv-1',
            type: 'text',
            position: 'left',
            content: { content: 'Hello ' },
          } as any);
          addOrUpdateMessage({
            id: 'tool-1',
            msg_id: 'tool-1',
            conversation_id: 'conv-1',
            type: 'acp_tool_call',
            position: 'left',
            content: { update: { toolCallId: 'tc-1', status: 'executing' } },
          } as any);
          addOrUpdateMessage({
            id: 'text-2',
            msg_id: 'text-A',
            conversation_id: 'conv-1',
            type: 'text',
            position: 'left',
            content: { content: 'World' },
          } as any);
        }}
      >
        add-interleaved
      </button>
      <pre data-testid='interleaved-messages'>{JSON.stringify(messages)}</pre>
    </div>
  );
};

describe('composeMessageWithIndex - text segment boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not merge text chunks with same msg_id when a tool call appears between them', async () => {
    render(
      <MessageListProvider value={[]}>
        <InterleavedProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-interleaved' }));

    await waitFor(() => {
      const messages = JSON.parse(screen.getByTestId('interleaved-messages').textContent ?? '[]') as TestMessage[];
      expect(messages).toHaveLength(3);
    });

    const messages = JSON.parse(screen.getByTestId('interleaved-messages').textContent ?? '[]') as TestMessage[];
    expect(messages[0].type).toBe('text');
    expect(messages[0].content.content).toBe('Hello ');
    expect(messages[1].type).toBe('acp_tool_call');
    expect(messages[2].type).toBe('text');
    expect(messages[2].content.content).toBe('World');
  });

  it('still merges consecutive text chunks with the same msg_id when no tool call is between them', async () => {
    const ConsecutiveProbe = () => {
      const addOrUpdate = useAddOrUpdateMessage();
      const messages = useMessageList();
      return (
        <div>
          <button
            type='button'
            onClick={() => {
              addOrUpdate({
                id: 'c1',
                msg_id: 'text-B',
                conversation_id: 'conv-1',
                type: 'text',
                position: 'left',
                content: { content: 'Foo ' },
              } as any);
              addOrUpdate({
                id: 'c2',
                msg_id: 'text-B',
                conversation_id: 'conv-1',
                type: 'text',
                position: 'left',
                content: { content: 'Bar' },
              } as any);
            }}
          >
            add-consecutive
          </button>
          <pre data-testid='consecutive-messages'>{JSON.stringify(messages)}</pre>
        </div>
      );
    };

    render(
      <MessageListProvider value={[]}>
        <ConsecutiveProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-consecutive' }));

    await waitFor(() => {
      const messages = JSON.parse(screen.getByTestId('consecutive-messages').textContent ?? '[]') as TestMessage[];
      expect(messages).toHaveLength(1);
      expect(messages[0].content.content).toBe('Foo Bar');
    });
  });
});
