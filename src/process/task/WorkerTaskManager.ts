/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IAgentFactory } from './IAgentFactory';
import type { AgentKillReason, IAgentManager } from './IAgentManager';
import type { IWorkerTaskManager } from './IWorkerTaskManager';
import type { BuildConversationOptions, AgentType } from './agentTypes';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import type { TChatConversation } from '@/common/config/storage';
import { ProcessConfig } from '@process/utils/initStorage';
import { mainLog } from '@process/utils/mainLogger';

/** CLI-backed agents (acp, codex) idle for longer than this are killed to reclaim memory. */
const AGENT_IDLE_TIMEOUT_DEFAULT_MS = 5 * 60 * 1000;
/** How often to scan for idle CLI-backed agents. */
const AGENT_IDLE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const MIN_AGENT_IDLE_TIMEOUT_SECONDS = 300;

export class WorkerTaskManager implements IWorkerTaskManager {
  private taskList: Array<{ id: string; task: IAgentManager }> = [];
  private idleCheckTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly factory: IAgentFactory,
    private readonly repo: IConversationRepository
  ) {
    this.idleCheckTimer = setInterval(() => this.killIdleCliAgents(), AGENT_IDLE_CHECK_INTERVAL_MS);
  }

  private getAgentIdleTimeoutMs(): number {
    const configuredSeconds = ProcessConfig.getSync('acp.idleCleanupTimeout');
    if (typeof configuredSeconds !== 'number' || !Number.isFinite(configuredSeconds) || configuredSeconds <= 0) {
      return AGENT_IDLE_TIMEOUT_DEFAULT_MS;
    }
    return Math.max(MIN_AGENT_IDLE_TIMEOUT_SECONDS, configuredSeconds) * 1000;
  }

  /**
   * ACP idle cleanup should honor both user-send time and the most recent
   * agent-originated response event. This prevents active streaming/tool turns
   * from being reaped based solely on an old send start timestamp.
   */
  private getLastAgentActivityAt(task: IAgentManager): number {
    return Math.max(task.lastActivityAt, task.lastResponseAt);
  }

  private killIdleCliAgents(): void {
    const now = Date.now();
    const idleTimeoutMs = this.getAgentIdleTimeoutMs();
    const idleTasks = this.taskList.filter(
      (item) =>
        item.task.type === 'acp' &&
        !item.task.isTurnInProgress &&
        now - this.getLastAgentActivityAt(item.task) > idleTimeoutMs
    );
    for (const item of idleTasks) {
      const lastAgentActivityAt = this.getLastAgentActivityAt(item.task);
      mainLog('[WorkerTaskManager]', 'Killing idle ACP agent', {
        conversationId: item.id,
        type: item.task.type,
        reason: 'idle_timeout',
        idleForMs: now - lastAgentActivityAt,
        lastActivityAt: new Date(item.task.lastActivityAt).toISOString(),
        ...(item.task.lastResponseAt > 0 ? { lastResponseAt: new Date(item.task.lastResponseAt).toISOString() } : {}),
        lastAgentActivityAt: new Date(lastAgentActivityAt).toISOString(),
      });
      this.kill(item.id, 'idle_timeout');
    }
  }

  getTask(id: string): IAgentManager | undefined {
    return this.taskList.find((item) => item.id === id)?.task;
  }

  async getOrBuildTask(id: string, options?: BuildConversationOptions): Promise<IAgentManager> {
    if (!options?.skipCache) {
      const existing = this.getTask(id);
      if (existing) return existing;
    }

    const conversation = await this.repo.getConversation(id);
    if (conversation) return this._buildAndCache(conversation, options);

    throw new Error(`Conversation not found: ${id}`);
  }

  private _buildAndCache(conversation: TChatConversation, options?: BuildConversationOptions): IAgentManager {
    const task = this.factory.create(conversation, options);
    this.addTask(conversation.id, task);
    return task;
  }

  addTask(id: string, task: IAgentManager): void {
    const existing = this.taskList.find((item) => item.id === id);
    if (existing) {
      existing.task = task;
    } else {
      this.taskList.push({ id, task });
    }
  }

  kill(id: string, reason?: AgentKillReason): void {
    const index = this.taskList.findIndex((item) => item.id === id);
    if (index === -1) return;
    this.taskList[index]?.task.kill(reason);
    this.taskList.splice(index, 1);
  }

  clear(): void {
    clearInterval(this.idleCheckTimer);
    this.idleCheckTimer = undefined;
    this.taskList.forEach((item) => item.task.kill());
    this.taskList = [];
  }

  listTasks(): Array<{ id: string; type: AgentType }> {
    return this.taskList.map((t) => ({ id: t.id, type: t.task.type }));
  }
}
