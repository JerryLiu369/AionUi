import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mocks that are referenced inside vi.mock factories
const { mockEmit, capturedCallbacks } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
  capturedCallbacks: {
    onAvailableCommandsUpdate: null as
      | ((commands: Array<{ name: string; description?: string; hint?: string }>) => void)
      | null,
    onStreamEvent: null as ((message: Record<string, unknown>) => void) | null,
    onSignalEvent: null as ((message: Record<string, unknown>) => void) | null,
  },
}));

// --- Module mocks ---

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: { isPackaged: () => false, getAppPath: () => null },
    worker: {
      fork: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        postMessage: vi.fn(),
        kill: vi.fn(),
      })),
    },
  }),
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({})),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: { responseStream: { emit: mockEmit } },
    conversation: {
      confirmation: {
        add: { emit: vi.fn() },
        update: { emit: vi.fn() },
        remove: { emit: vi.fn() },
      },
      responseStream: { emit: vi.fn() },
    },
  },
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emitAgentMessage: vi.fn() },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => ({ updateConversation: vi.fn() })),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn(async () => null), set: vi.fn(async () => {}) },
}));

vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  nextTickToLocalFinish: vi.fn(),
}));

vi.mock('@process/utils/previewUtils', () => ({
  handlePreviewOpenEvent: vi.fn(),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: vi.fn() },
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: { getInstance: () => ({ getAcpAdapters: () => [] }) },
}));

vi.mock('@/common/utils', () => ({
  parseError: vi.fn((e: unknown) => String(e)),
  uuid: vi.fn(() => 'mock-uuid'),
}));

vi.mock('@/common/chat/chatLib', () => ({
  transformMessage: vi.fn(() => null),
}));

vi.mock('@process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(),
  processCronInMessage: vi.fn(),
}));

vi.mock('@process/task/ThinkTagDetector', () => ({
  extractAndStripThinkTags: vi.fn((s: string) => ({ thinking: '', content: s })),
}));

vi.mock('@process/task/CronCommandDetector', () => ({
  hasCronCommands: vi.fn(() => false),
}));

vi.mock('@process/utils/initAgent', () => ({
  hasNativeSkillSupport: vi.fn(() => true),
  setupAssistantWorkspace: vi.fn(),
}));

vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: vi.fn(async (c: string) => c),
  buildSystemInstructions: vi.fn(async () => undefined),
}));

// Mock AcpAgent: capture callbacks and return a fully stubbed agent
vi.mock('@process/agent/acp', () => {
  const MockAcpAgent = vi.fn(function (this: Record<string, unknown>, config: Record<string, unknown>) {
    capturedCallbacks.onAvailableCommandsUpdate =
      config.onAvailableCommandsUpdate as typeof capturedCallbacks.onAvailableCommandsUpdate;
    capturedCallbacks.onStreamEvent = config.onStreamEvent as typeof capturedCallbacks.onStreamEvent;
    capturedCallbacks.onSignalEvent = config.onSignalEvent as typeof capturedCallbacks.onSignalEvent;
    this.sendMessage = vi.fn(async () => ({ success: true }));
    this.getModelInfo = vi.fn(() => null);
    this.getSessionState = vi.fn(() => null);
    this.start = vi.fn(async () => {});
    this.stop = vi.fn();
    this.kill = vi.fn();
    this.on = vi.fn().mockReturnThis();
  });
  return { AcpAgent: MockAcpAgent };
});

import AcpAgentManager from '@process/task/AcpAgentManager';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { hasCronCommands } from '@process/task/CronCommandDetector';
import { processCronInMessage } from '@process/task/MessageMiddleware';

function createManager(): InstanceType<typeof AcpAgentManager> {
  const data = {
    conversation_id: 'test-conv',
    backend: 'claude' as const,
    workspace: '/tmp/test-workspace',
  };
  // @ts-expect-error - backend type narrowing
  return new AcpAgentManager(data);
}

describe('AcpAgentManager — slash_commands_updated event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallbacks.onAvailableCommandsUpdate = null;
    capturedCallbacks.onStreamEvent = null;
    capturedCallbacks.onSignalEvent = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits slash_commands_updated when onAvailableCommandsUpdate fires', async () => {
    const manager = createManager();

    // initAgent is async — start it and let it create the AcpAgent
    const initPromise = manager.initAgent();

    // Wait for AcpAgent constructor to be called (happens synchronously within initAgent)
    await vi.waitFor(() => {
      expect(capturedCallbacks.onAvailableCommandsUpdate).not.toBeNull();
    });

    // Simulate the CLI sending available_commands_update
    capturedCallbacks.onAvailableCommandsUpdate!([
      { name: 'resume', description: 'Resume a conversation' },
      { name: 'loop', description: 'Run a loop' },
    ]);

    // Verify slash_commands_updated was emitted via IPC
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'slash_commands_updated',
        conversation_id: 'test-conv',
      })
    );

    // Verify commands were stored correctly
    const commands = manager.getAcpSlashCommands();
    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({
      name: 'resume',
      description: 'Resume a conversation',
      kind: 'template',
      source: 'acp',
    });
    expect(commands[1]).toMatchObject({
      name: 'loop',
      description: 'Run a loop',
      kind: 'template',
      source: 'acp',
    });

    // Clean up
    await initPromise.catch(() => {});
  });

  it('deduplicates commands by name', async () => {
    const manager = createManager();
    void manager.initAgent();

    await vi.waitFor(() => {
      expect(capturedCallbacks.onAvailableCommandsUpdate).not.toBeNull();
    });

    capturedCallbacks.onAvailableCommandsUpdate!([
      { name: 'resume', description: 'First' },
      { name: 'resume', description: 'Duplicate' },
    ]);

    const commands = manager.getAcpSlashCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0].description).toBe('First');
  });

  it('skips commands with empty or whitespace-only names', async () => {
    const manager = createManager();
    void manager.initAgent();

    await vi.waitFor(() => {
      expect(capturedCallbacks.onAvailableCommandsUpdate).not.toBeNull();
    });

    capturedCallbacks.onAvailableCommandsUpdate!([
      { name: '', description: 'No name' },
      { name: '  ', description: 'Whitespace name' },
      { name: 'valid', description: 'Valid command' },
    ]);

    const commands = manager.getAcpSlashCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('valid');
  });

  it('refreshes lastResponseAt when ACP emits a stream event after bootstrap', async () => {
    vi.useFakeTimers();
    const manager = createManager();
    await manager.initAgent();

    await vi.waitFor(() => {
      expect(capturedCallbacks.onStreamEvent).not.toBeNull();
    });

    vi.setSystemTime(new Date('2026-04-09T04:10:11Z'));
    capturedCallbacks.onStreamEvent!({
      type: 'content',
      conversation_id: 'test-conv',
      msg_id: 'stream-1',
      data: 'hello',
    });

    expect(manager.lastResponseAt).toBe(Date.parse('2026-04-09T04:10:11Z'));
  });

  it('refreshes lastResponseAt when ACP emits a signal event after bootstrap', async () => {
    vi.useFakeTimers();
    const manager = createManager();
    await manager.initAgent();

    await vi.waitFor(() => {
      expect(capturedCallbacks.onSignalEvent).not.toBeNull();
    });

    vi.setSystemTime(new Date('2026-04-09T04:20:21Z'));
    capturedCallbacks.onSignalEvent!({
      type: 'finish',
      conversation_id: 'test-conv',
      msg_id: 'finish-1',
      data: null,
    });

    expect(manager.lastResponseAt).toBe(Date.parse('2026-04-09T04:20:21Z'));
  });

  it('keeps the turn alive across cron follow-up continuation', async () => {
    vi.useFakeTimers();
    const manager = createManager();
    await manager.initAgent();

    await vi.waitFor(() => {
      expect(capturedCallbacks.onSignalEvent).not.toBeNull();
    });

    const mockHasCronCommands = vi.mocked(hasCronCommands);
    const mockProcessCronInMessage = vi.mocked(processCronInMessage);
    const mockSetProcessing = vi.mocked(cronBusyGuard.setProcessing);
    mockHasCronCommands.mockReturnValue(true);
    mockProcessCronInMessage.mockImplementation(async (_conversationId, _backend, _message, onSystemMessage) => {
      onSystemMessage('cron ok');
    });

    await manager.sendMessage({ content: 'schedule it' });
    const agent = (manager as unknown as { agent: { sendMessage: ReturnType<typeof vi.fn> } }).agent;
    agent.sendMessage.mockClear();
    mockEmit.mockClear();
    mockSetProcessing.mockClear();

    (manager as unknown as { currentMsgId: string | null; currentMsgContent: string }).currentMsgId = 'msg-1';
    (manager as unknown as { currentMsgContent: string }).currentMsgContent = '[CRON_CREATE]';

    vi.setSystemTime(new Date('2026-04-09T05:00:00Z'));
    await capturedCallbacks.onSignalEvent!({
      type: 'finish',
      conversation_id: 'test-conv',
      msg_id: 'finish-1',
      data: null,
    });

    expect(manager.isTurnInProgress).toBe(true);
    expect(manager.status).toBe('running');
    expect(manager.lastActivityAt).toBe(Date.parse('2026-04-09T05:00:00Z'));
    expect(mockSetProcessing).toHaveBeenCalledWith('test-conv', true);
    expect(agent.sendMessage).toHaveBeenCalledWith({ content: '[System Response]\ncron ok' });
    expect(mockEmit).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'finish',
        conversation_id: 'test-conv',
      })
    );
  });
});
