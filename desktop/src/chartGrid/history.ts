import { acquireHistory, historyRequestKey } from '../services/api';
import type { HistoryResult } from '../types';

export const GRID_HISTORY_LIMIT = 2;
type Lease = { promise: Promise<HistoryResult>; release: () => void };
type Job = {
  path: string;
  key: string;
  users: number;
  lease?: Lease;
  result: Promise<HistoryResult>;
  resolve: (value: HistoryResult) => void;
  reject: (reason: unknown) => void;
};

// Keep the queue across workspace mounts so a rapid return cannot oversubscribe
// while requests from the previous view are still settling.
export class GridHistoryQueue {
  private readonly jobs = new Map<string, Job>();
  private active = 0;

  constructor(private readonly acquire = acquireHistory) {}

  request(path: string): Lease {
    const key = historyRequestKey(path);
    let job = this.jobs.get(key);
    if (!job) {
      let resolve!: Job['resolve'];
      let reject!: Job['reject'];
      const result = new Promise<HistoryResult>((ok, fail) => { resolve = ok; reject = fail; });
      job = { path, key, users: 0, result, resolve, reject };
      this.jobs.set(key, job);
    }
    const owned = job;
    owned.users++;
    this.start();
    let released = false;
    return {
      promise: owned.result,
      release: () => {
        if (released) return;
        released = true;
        if (--owned.users !== 0) return;
        this.remove(owned);
        owned.lease?.release();
        owned.reject(new DOMException('Chart history no longer needed.', 'AbortError'));
      },
    };
  }

  private remove(job: Job) {
    if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
  }

  private start() {
    for (const job of this.jobs.values()) {
      if (this.active >= GRID_HISTORY_LIMIT) break;
      if (job.lease) continue;
      this.active++;
      const lease = job.lease = this.acquire(job.path);
      void lease.promise.then(job.resolve, job.reject).finally(() => {
        this.remove(job);
        lease.release();
        this.active--;
        this.start();
      });
    }
  }
}

export const gridHistory = new GridHistoryQueue();
