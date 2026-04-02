import { fork as cpFork, type ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import type { IPlatformServices, IWorkerProcess } from './IPlatformServices';

class NodeWorkerProcess implements IWorkerProcess {
  constructor(private readonly cp: ChildProcess) {}

  postMessage(message: unknown): void {
    this.cp.send(message as Parameters<ChildProcess['send']>[0]);
  }

  on(event: string, handler: (...args: unknown[]) => void): this {
    this.cp.on(event, handler as (...args: unknown[]) => void);
    return this;
  }

  kill(): void {
    this.cp.kill();
  }
}

// Derive the app root from this module's location so it is independent of
// the process working directory. In the bundled server (dist-server/server.mjs)
// import.meta.url points to the bundle file, so one level up is the app root.
const _appRoot = (() => {
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  } catch {
    return process.cwd();
  }
})();

// Read name + version from package.json once at module load.
const _pkg = (() => {
  try {
    return JSON.parse(readFileSync(path.join(_appRoot, 'package.json'), 'utf8')) as {
      name?: string;
      version?: string;
    };
  } catch {
    return { name: 'aionui', version: '0.0.0' };
  }
})();

export class NodePlatformServices implements IPlatformServices {
  paths = {
    getDataDir: () => process.env.DATA_DIR ?? path.join(os.homedir(), '.aionui-server'),
    getTempDir: () => os.tmpdir(),
    getHomeDir: () => os.homedir(),
    getLogsDir: () => process.env.LOGS_DIR ?? path.join(os.homedir(), '.aionui-server', 'logs'),
    getAppPath: (): string | null => _appRoot,
    isPackaged: () => process.env.IS_PACKAGED === 'true',
    getSystemPath: (_name: 'desktop' | 'home' | 'downloads'): string | null => null,
    getName: () => _pkg.name ?? 'aionui',
    getVersion: () => _pkg.version ?? '0.0.0',
    needsCliSafeSymlinks: () => false,
  };

  worker = {
    fork: (modulePath: string, args: string[], opts: { cwd?: string; env?: Record<string, string> }): IWorkerProcess =>
      new NodeWorkerProcess(
        cpFork(modulePath, args, {
          cwd: opts.cwd,
          env: opts.env,
          // Enables V8 structured clone (supports Buffer, Map, Set).
          // ArrayBuffer ownership transfer is not supported — acceptable
          // because current IForkData messages contain no Transferables.
          serialization: 'advanced',
        })
      ),
  };

  power = {
    preventSleep: (): number | null => null,
    allowSleep: (_id: number | null): void => {},
  };

  notification = {
    send: (_opts: { title: string; body: string; icon?: string }): void => {},
  };
}
