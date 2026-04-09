/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/process/task/IAgentManager.ts

import type { IConfirmation } from '@/common/chat/chatLib';
import type { AgentType, AgentStatus } from './agentTypes';

export type AgentKillReason = 'idle_timeout';

export interface IAgentManager {
  readonly type: AgentType;
  /**
   * readonly on interface; the implementation class mutates its own this.status.
   */
  readonly status: AgentStatus | undefined;
  /** True while the current turn is still in progress. */
  readonly isTurnInProgress: boolean;
  readonly workspace: string;
  readonly conversation_id: string;
  /** Timestamp of the last sendMessage call. Used for idle-timeout cleanup. */
  readonly lastActivityAt: number;
  /**
   * Timestamp of the last agent-originated response event observed by the manager.
   * For ACP this is refreshed by stream/signal events such as content, tool calls,
   * permission requests, and finish/error signals.
   */
  readonly lastResponseAt: number;

  sendMessage(data: unknown): Promise<void>;
  stop(): Promise<void>;
  confirm(msgId: string, callId: string, data: unknown): void;
  getConfirmations(): IConfirmation[];
  kill(reason?: AgentKillReason): void;
}
