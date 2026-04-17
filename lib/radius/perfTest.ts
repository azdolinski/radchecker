import type { AttributeTuple } from "radius";

import type { LogBus } from "@/lib/jobs/logBus";
import type { ServerConfig } from "@/lib/storage/schemas";
import { encodeChap } from "./chap";
import { RadiusTimeoutError, sendRadiusPacket } from "./client";

export interface PerfTestConfig {
  users: number;
  duration: number; // seconds
  concurrency: number;
  timeoutMs: number;
}

export interface PerfTestStats {
  startedAt: number;
  elapsedMs: number;
  durationMs: number;
  sent: number;
  accept: number;
  reject: number;
  timeout: number;
  errors: number;
  rpsRolling: number;
  latency: {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  [key: string]: unknown;
}

export interface StartedPerfTest {
  stop: () => Promise<void>;
  promise: Promise<void>;
}

const LATENCY_RING = 5000;
const RPS_BUCKETS = 10; // 100 ms each, last 1 s
const BUCKET_MS = 100;
const PASSWORD = "perfpass";

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[idx];
}

/**
 * Start a performance test against `server`. Runs `concurrency` workers in a
 * tight loop; each sends Access-Request with CHAP auth until `duration`
 * elapses or `stop()` is called.
 */
export function startPerfTest(
  server: ServerConfig,
  cfg: PerfTestConfig,
  bus: LogBus,
): StartedPerfTest {
  const users = Array.from({ length: cfg.users }, (_, i) =>
    `perfuser-${String(i + 1).padStart(4, "0")}`,
  );
  const startedAt = Date.now();
  const deadline = startedAt + cfg.duration * 1000;

  let stopped = false;
  let idx = 0;

  const counters = { sent: 0, accept: 0, reject: 0, timeout: 0, errors: 0 };
  const latencyRing: number[] = [];
  const rpsBuckets = new Uint32Array(RPS_BUCKETS);
  let lastLogTick = 0;

  const currentBucket = () =>
    Math.floor((Date.now() - startedAt) / BUCKET_MS) % RPS_BUCKETS;

  const oneRequest = async (username: string) => {
    const chap = encodeChap(PASSWORD);
    const attrs: AttributeTuple[] = [
      ["User-Name", username],
      ["CHAP-Password", chap.password],
      ["CHAP-Challenge", chap.challenge],
      ["NAS-IP-Address", "127.0.0.1"],
      ["Service-Type", "Framed-User"],
      ["Framed-Protocol", "PPP"],
    ];

    counters.sent += 1;
    rpsBuckets[currentBucket()] += 1;

    try {
      const { reply, latencyMs } = await sendRadiusPacket({
        code: "Access-Request",
        host: server.host,
        port: server.authPort,
        secret: server.secret,
        attributes: attrs,
        timeoutMs: cfg.timeoutMs,
        retries: 0,
      });
      latencyRing.push(latencyMs);
      if (latencyRing.length > LATENCY_RING) latencyRing.shift();

      if (reply.code === "Access-Accept") counters.accept += 1;
      else if (reply.code === "Access-Reject") counters.reject += 1;
      else counters.errors += 1;
    } catch (err) {
      if (err instanceof RadiusTimeoutError) {
        counters.timeout += 1;
        latencyRing.push(err.latencyMs);
      } else {
        counters.errors += 1;
      }
    }
  };

  const buildStats = (): PerfTestStats => {
    let latency = { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    if (latencyRing.length > 0) {
      const sorted = [...latencyRing].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      latency = {
        count: sorted.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: sum / sorted.length,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
      };
    }
    const rpsRolling =
      [...rpsBuckets].reduce((a, b) => a + b, 0) * (1000 / (RPS_BUCKETS * BUCKET_MS));
    return {
      startedAt,
      elapsedMs: Date.now() - startedAt,
      durationMs: cfg.duration * 1000,
      ...counters,
      rpsRolling: Math.round(rpsRolling),
      latency,
    };
  };

  const statsInterval = setInterval(() => {
    const s = buildStats();
    bus.stats(s);
    // clear the bucket one ahead — acts as rolling window
    rpsBuckets[(currentBucket() + 1) % RPS_BUCKETS] = 0;
    const now = Date.now();
    if (now - lastLogTick >= 1000) {
      lastLogTick = now;
      bus.info(
        `RPS ${s.rpsRolling} · accept ${s.accept} · reject ${s.reject} · timeout ${s.timeout} · p95 ${Math.round(s.latency.p95)}ms`,
      );
    }
  }, 500);

  const workers = Array.from({ length: cfg.concurrency }, async () => {
    while (!stopped && Date.now() < deadline) {
      const u = users[idx++ % users.length];
      await oneRequest(u);
    }
  });

  const promise = (async () => {
    try {
      await Promise.all(workers);
    } finally {
      clearInterval(statsInterval);
      bus.stats(buildStats());
      bus.info(
        `completed · sent ${counters.sent} · accept ${counters.accept} · reject ${counters.reject} · timeout ${counters.timeout} · errors ${counters.errors}`,
      );
    }
  })();

  bus.info(
    `starting ${cfg.concurrency} workers × ${cfg.duration}s · ${users.length} users · ${server.host}:${server.authPort}`,
  );
  bus.stats(buildStats());

  return {
    stop: async () => {
      stopped = true;
      await promise;
    },
    promise,
  };
}

export const __internal = { percentile };
