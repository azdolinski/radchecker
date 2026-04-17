import { NextResponse } from "next/server";
import { z } from "zod";

import { createJob, jobSnapshot, setStatus } from "@/lib/jobs/registry";
import { startPerfTest, type StartedPerfTest } from "@/lib/radius/perfTest";
import { readServer } from "@/lib/storage/yamlStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  server: z.string().min(1),
  users: z.number().int().min(1).max(100_000).default(1000),
  duration: z.number().int().min(1).max(3600).default(30),
  concurrency: z.number().int().min(1).max(5000).default(100),
  timeoutMs: z.number().int().min(100).max(60_000).default(5000),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let server;
  try {
    server = await readServer(parsed.data.server);
  } catch (err) {
    return NextResponse.json(
      { error: "server_not_found", message: (err as Error).message },
      { status: 404 },
    );
  }

  const cfg = {
    users: parsed.data.users,
    duration: parsed.data.duration,
    concurrency: parsed.data.concurrency,
    timeoutMs: parsed.data.timeoutMs,
  };

  let runner: StartedPerfTest | null = null;
  const job = createJob({
    kind: "perf-test",
    name: `${server.name} · ${cfg.users}u × ${cfg.duration}s`,
    config: { server: server.name, ...cfg },
    stop: async () => {
      await runner?.stop();
    },
  });

  try {
    runner = startPerfTest(server, cfg, job.bus);
    setStatus(job, "running");

    // When the worker pool drains naturally (deadline reached), mark completed.
    void runner.promise.then(() => {
      if (job.status === "running" || job.status === "starting") {
        setStatus(job, "completed");
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(job, "failed", msg);
    return NextResponse.json(
      { error: "start_failed", message: msg, job: jobSnapshot(job) },
      { status: 500 },
    );
  }

  return NextResponse.json({ job: jobSnapshot(job) }, { status: 201 });
}
