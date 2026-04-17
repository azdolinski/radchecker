export type JobKind = "coa-server" | "client-session" | "test-run" | "perf-test";

export type JobStatus = "starting" | "running" | "stopping" | "completed" | "failed";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  message: string;
  /** Arbitrary structured payload to render alongside the line (packet attrs, stats snapshot, etc.) */
  data?: unknown;
}

/** Structured RADIUS packet log — attached as `data: { packet }` on LogEntry for rich UI rendering. */
export interface PacketLog {
  direction: "tx" | "rx";
  code: string;
  identifier: number;
  attributes: Array<[string, unknown]>;
  latencyMs?: number;
  attempts?: number;
  src?: string;
  dst?: string;
  step?: string;
}

export interface JobStats {
  /** Free-form stats bag, shape depends on JobKind. */
  [k: string]: unknown;
}

export interface JobSnapshot {
  id: string;
  kind: JobKind;
  name: string;
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  stats: JobStats;
  /** Free-form config echo for UI display */
  config: unknown;
}

export type LogBusEvent =
  | { type: "log"; entry: LogEntry }
  | { type: "stats"; stats: JobStats }
  | { type: "status"; status: JobStatus; error?: string };
