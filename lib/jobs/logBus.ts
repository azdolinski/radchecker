import { EventEmitter } from "node:events";

import type { JobStats, JobStatus, LogBusEvent, LogEntry, LogLevel } from "./types";

const RING_BUFFER_SIZE = 500;

/**
 * Per-job pub/sub for log lines + stats + status updates.
 *
 * Keeps a ring buffer of recent entries so that a newly-subscribed client
 * can replay context before switching to live mode.
 */
export class LogBus extends EventEmitter {
  private logs: LogEntry[] = [];
  private lastStats: JobStats = {};
  private lastStatus: JobStatus = "starting";
  private lastError?: string;

  constructor() {
    super();
    this.setMaxListeners(0);
  }

  log(level: LogLevel, message: string, data?: unknown) {
    const entry: LogEntry = { ts: Date.now(), level, message, data };
    this.logs.push(entry);
    if (this.logs.length > RING_BUFFER_SIZE) this.logs.shift();
    this.emit("event", { type: "log", entry } satisfies LogBusEvent);
  }

  info(message: string, data?: unknown) {
    this.log("info", message, data);
  }
  warn(message: string, data?: unknown) {
    this.log("warn", message, data);
  }
  error(message: string, data?: unknown) {
    this.log("error", message, data);
  }
  debug(message: string, data?: unknown) {
    this.log("debug", message, data);
  }

  stats(next: JobStats) {
    this.lastStats = next;
    this.emit("event", { type: "stats", stats: next } satisfies LogBusEvent);
  }

  status(status: JobStatus, error?: string) {
    this.lastStatus = status;
    this.lastError = error;
    this.emit("event", { type: "status", status, error } satisfies LogBusEvent);
  }

  /** Snapshot for SSE replay on subscribe. */
  replay(): { logs: LogEntry[]; stats: JobStats; status: JobStatus; error?: string } {
    return {
      logs: [...this.logs],
      stats: this.lastStats,
      status: this.lastStatus,
      error: this.lastError,
    };
  }
}
