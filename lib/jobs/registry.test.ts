import { describe, expect, it, vi } from "vitest";

import {
  createJob,
  getJob,
  listJobs,
  removeJob,
  setStatus,
  stopJob,
  jobSnapshot,
} from "./registry";
import type { LogBusEvent } from "./types";

describe("registry + logBus", () => {
  it("createJob returns starting status and is discoverable", () => {
    const job = createJob({
      kind: "coa-server",
      name: "unit-1",
      config: { port: 3799 },
      stop: async () => {},
    });
    expect(job.status).toBe("starting");
    expect(getJob(job.id)?.id).toBe(job.id);
    expect(listJobs().some((j) => j.id === job.id)).toBe(true);
    removeJob(job.id);
  });

  it("setStatus transitions to running and timestamps startedAt", () => {
    const job = createJob({
      kind: "coa-server",
      name: "unit-2",
      config: {},
      stop: async () => {},
    });
    setStatus(job, "running");
    expect(job.status).toBe("running");
    expect(job.startedAt).toBeGreaterThan(0);
    removeJob(job.id);
  });

  it("stop transitions: running -> stopping -> completed", async () => {
    const stopFn = vi.fn().mockResolvedValue(undefined);
    const job = createJob({
      kind: "coa-server",
      name: "unit-3",
      config: {},
      stop: stopFn,
    });
    setStatus(job, "running");
    await stopJob(job.id);
    expect(job.status).toBe("completed");
    expect(job.endedAt).toBeGreaterThan(0);
    expect(stopFn).toHaveBeenCalledOnce();
    removeJob(job.id);
  });

  it("stop failure marks job as failed with error message", async () => {
    const job = createJob({
      kind: "coa-server",
      name: "unit-4",
      config: {},
      stop: async () => {
        throw new Error("socket in use");
      },
    });
    setStatus(job, "running");
    await stopJob(job.id);
    expect(job.status).toBe("failed");
    expect(job.error).toBe("socket in use");
    removeJob(job.id);
  });

  it("logBus replay returns buffered logs + latest stats/status", () => {
    const job = createJob({ kind: "test-run", name: "unit-5", config: {}, stop: async () => {} });
    job.bus.info("first");
    job.bus.warn("second");
    job.bus.stats({ sent: 2, failed: 0 });
    setStatus(job, "running");

    const replay = job.bus.replay();
    expect(replay.logs).toHaveLength(2);
    expect(replay.logs[0].message).toBe("first");
    expect(replay.stats).toEqual({ sent: 2, failed: 0 });
    expect(replay.status).toBe("running");
    removeJob(job.id);
  });

  it("logBus emits events to subscribers", () => {
    const job = createJob({ kind: "test-run", name: "unit-6", config: {}, stop: async () => {} });
    const received: LogBusEvent[] = [];
    job.bus.on("event", (ev) => received.push(ev));

    job.bus.info("hello");
    job.bus.stats({ ok: true });
    job.bus.status("running");

    expect(received).toHaveLength(3);
    expect(received[0]).toMatchObject({ type: "log", entry: { message: "hello" } });
    expect(received[1]).toMatchObject({ type: "stats", stats: { ok: true } });
    expect(received[2]).toMatchObject({ type: "status", status: "running" });
    removeJob(job.id);
  });

  it("ring buffer caps stored log entries", () => {
    const job = createJob({ kind: "test-run", name: "unit-7", config: {}, stop: async () => {} });
    for (let i = 0; i < 600; i++) job.bus.info(`line-${i}`);
    expect(job.bus.replay().logs).toHaveLength(500);
    expect(job.bus.replay().logs[0].message).toBe("line-100");
    removeJob(job.id);
  });

  it("jobSnapshot echoes config and omits functions", () => {
    const job = createJob({
      kind: "coa-server",
      name: "unit-8",
      config: { port: 3799, secret: "abc" },
      stop: async () => {},
    });
    const snap = jobSnapshot(job);
    expect(snap.kind).toBe("coa-server");
    expect(snap.config).toEqual({ port: 3799, secret: "abc" });
    expect((snap as unknown as { stop?: unknown }).stop).toBeUndefined();
    removeJob(job.id);
  });
});
