import { randomUUID } from "node:crypto";
import { promises as fs, createReadStream, mkdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { jobsDir } from "@/lib/storage/fsPaths";
import type { Job } from "./registry";
import type { JobKind, JobSnapshot, JobStatus, LogEntry } from "./types";

/**
 * Persistence layer for jobs. Each job gets a directory
 *   data/jobs/<createdAt>-<uuid>/
 *     meta.json    — small metadata file, atomically rewritten on each update
 *     logs.jsonl   — append-only stream of LogEntry (one JSON per line)
 *
 * Crash-safety:
 *   - meta is written to `.tmp` then renamed (atomic on POSIX). Partial
 *     `.tmp` leftovers are cleaned up during rehydration.
 *   - logs are append-only; losing the last line on a hard kill is acceptable.
 */

export const META_VERSION = 1;

export interface JobMeta {
  version: typeof META_VERSION;
  id: string;
  kind: JobKind;
  name: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  status: JobStatus;
  error?: string;
  config: unknown;
  stats: unknown;
  updatedAt: number;
}

function dirNameFor(job: Pick<Job, "id" | "createdAt">): string {
  return `${job.createdAt}-${job.id}`;
}

export function jobDir(job: Pick<Job, "id" | "createdAt">): string {
  return path.join(jobsDir(), dirNameFor(job));
}

/** Find a job directory by id regardless of the `createdAt` prefix. */
export async function findJobDirById(id: string): Promise<string | null> {
  const entries = await fs.readdir(jobsDir()).catch(() => [] as string[]);
  const suffix = `-${id}`;
  const match = entries.find((e) => e.endsWith(suffix));
  return match ? path.join(jobsDir(), match) : null;
}

export function ensureJobDirSync(job: Pick<Job, "id" | "createdAt">): string {
  const dir = jobDir(job);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function toMeta(job: Job): JobMeta {
  return {
    version: META_VERSION,
    id: job.id,
    kind: job.kind,
    name: job.name,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    status: job.status,
    error: job.error,
    config: stripInternalKeys(job.config),
    stats: stripInternalKeys(job.stats),
    updatedAt: Date.now(),
  };
}

export function metaToSnapshot(meta: JobMeta): JobSnapshot {
  return {
    id: meta.id,
    kind: meta.kind,
    name: meta.name,
    status: meta.status,
    createdAt: meta.createdAt,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    error: meta.error,
    stats: (meta.stats ?? {}) as JobSnapshot["stats"],
    config: meta.config,
  };
}

export async function writeMeta(dir: string, meta: JobMeta): Promise<void> {
  const target = path.join(dir, "meta.json");
  const tmp = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(meta, null, 2), "utf8");
  await fs.rename(tmp, target);
}

export async function readMeta(dir: string): Promise<JobMeta | null> {
  try {
    const text = await fs.readFile(path.join(dir, "meta.json"), "utf8");
    const parsed = JSON.parse(text) as JobMeta;
    if (!parsed || typeof parsed !== "object" || parsed.version !== META_VERSION) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function appendLogEntry(dir: string, entry: LogEntry): Promise<void> {
  await fs.appendFile(path.join(dir, "logs.jsonl"), JSON.stringify(entry) + "\n", "utf8");
}

/**
 * Stream `logs.jsonl` line-by-line. Invalid JSON lines are skipped. Returns
 * `false` if the file doesn't exist (no logs yet or missing directory).
 */
export async function streamLogs(
  dir: string,
  onEntry: (entry: LogEntry) => void,
): Promise<boolean> {
  const file = path.join(dir, "logs.jsonl");
  try {
    await fs.access(file);
  } catch {
    return false;
  }
  const rl = readline.createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line) continue;
    try {
      onEntry(JSON.parse(line) as LogEntry);
    } catch {
      /* skip malformed */
    }
  }
  return true;
}

/** Enumerate all persisted jobs (historical + currently running). */
export async function listPersistedJobs(): Promise<JobMeta[]> {
  const entries = await fs.readdir(jobsDir()).catch(() => [] as string[]);
  const metas: JobMeta[] = [];
  await Promise.all(
    entries.map(async (name) => {
      const meta = await readMeta(path.join(jobsDir(), name));
      if (meta) metas.push(meta);
    }),
  );
  return metas;
}

export async function removeJobDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * On startup: clean leftover `.tmp` files and mark orphaned jobs as failed.
 * A job is orphaned when its meta says `starting|running|stopping` but the
 * process that owned it is gone — we can't resume (UDP sockets, timers,
 * send-wait loops are all dead).
 */
export async function rehydrateJobs(): Promise<void> {
  const root = jobsDir();
  const entries = await fs.readdir(root).catch(() => [] as string[]);

  for (const name of entries) {
    const dir = path.join(root, name);

    // Cleanup stray `.tmp` writes from a crash mid-rename
    try {
      const stray = await fs.readdir(dir);
      await Promise.all(
        stray
          .filter((f) => f.endsWith(".tmp"))
          .map((f) => fs.rm(path.join(dir, f), { force: true })),
      );
    } catch {
      /* ignore unreadable dirs */
    }

    const meta = await readMeta(dir);
    if (!meta) continue;
    if (
      meta.status === "starting" ||
      meta.status === "running" ||
      meta.status === "stopping"
    ) {
      const now = Date.now();
      const updated: JobMeta = {
        ...meta,
        status: "failed",
        error: meta.error ?? "orphaned on restart",
        endedAt: meta.endedAt ?? now,
        updatedAt: now,
      };
      await writeMeta(dir, updated);
      await appendLogEntry(dir, {
        ts: now,
        level: "error",
        message: "=== server restarted — job orphaned ===",
      });
    }
  }
}

function stripInternalKeys(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith("_")) continue;
    out[k] = v;
  }
  return out;
}
