import { randomUUID } from "node:crypto";

import { LogBus } from "./logBus";
import type { JobKind, JobSnapshot, JobStatus } from "./types";

export interface Job {
  id: string;
  kind: JobKind;
  name: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  status: JobStatus;
  error?: string;
  /** Config echo for UI */
  config: unknown;
  /** Latest snapshot of aggregated stats (also kept in LogBus.lastStats) */
  stats: Record<string, unknown>;
  bus: LogBus;
  /** Implementation-provided cleanup — must be idempotent. */
  stop: () => Promise<void>;
}

/**
 * Module-level singleton store. In Next.js dev, `globalThis` cache survives
 * HMR reloads so running jobs are not orphaned between edits.
 */
const g = globalThis as unknown as { __radJobs?: Map<string, Job> };
const store: Map<string, Job> = g.__radJobs ?? new Map();
g.__radJobs = store;

export interface CreateJobOptions {
  kind: JobKind;
  name: string;
  config: unknown;
  stop: (job: Job) => Promise<void>;
}

export function createJob({ kind, name, config, stop }: CreateJobOptions): Job {
  const id = randomUUID();
  const bus = new LogBus();
  const job: Job = {
    id,
    kind,
    name,
    createdAt: Date.now(),
    status: "starting",
    config,
    stats: {},
    bus,
    stop: async () => {},
  };
  job.stop = async () => {
    if (job.status === "completed" || job.status === "failed") return;
    setStatus(job, "stopping");
    try {
      await stop(job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(job, "failed", msg);
      return;
    }
    setStatus(job, "completed");
  };

  // Bus tracks stats too — reflect on job object
  bus.on("event", (ev: { type: string; stats?: Record<string, unknown> }) => {
    if (ev.type === "stats" && ev.stats) job.stats = ev.stats;
  });

  store.set(id, job);
  return job;
}

export function setStatus(job: Job, status: JobStatus, error?: string) {
  job.status = status;
  job.error = error;
  if (status === "running" && !job.startedAt) job.startedAt = Date.now();
  if (status === "completed" || status === "failed") job.endedAt = Date.now();
  job.bus.status(status, error);
}

export function getJob(id: string): Job | undefined {
  return store.get(id);
}

export function listJobs(): Job[] {
  return [...store.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function removeJob(id: string): boolean {
  const job = store.get(id);
  if (!job) return false;
  if (job.status === "running" || job.status === "starting" || job.status === "stopping") {
    void job.stop();
  }
  store.delete(id);
  return true;
}

export async function stopJob(id: string): Promise<boolean> {
  const job = store.get(id);
  if (!job) return false;
  await job.stop();
  return true;
}

/**
 * Strip keys that start with `_` — by convention these are internal
 * bag-of-handles (e.g. `_server`, `_runner`, `_pool`) that hold function
 * references used by the stop() callback. They cannot be serialised as
 * RSC props, JSON responses, or SSE payloads.
 */
function stripInternalKeys(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith("_")) continue;
    out[k] = v;
  }
  return out;
}

export function jobSnapshot(job: Job): JobSnapshot {
  return {
    id: job.id,
    kind: job.kind,
    name: job.name,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    error: job.error,
    stats: stripInternalKeys(job.stats) as JobSnapshot["stats"],
    config: stripInternalKeys(job.config),
  };
}

/** Purge completed/failed jobs older than `maxAgeMs`. */
export function gcCompleted(maxAgeMs = 60 * 60 * 1000) {
  const now = Date.now();
  for (const [id, job] of store) {
    if ((job.status === "completed" || job.status === "failed") && job.endedAt && now - job.endedAt > maxAgeMs) {
      store.delete(id);
    }
  }
}
