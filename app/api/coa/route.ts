import { NextResponse } from "next/server";

import { createJob, jobSnapshot, setStatus } from "@/lib/jobs/registry";
import { startCoAServer, type StartedCoAServer } from "@/lib/radius/coaServer";
import { CoAConfigSchema } from "@/lib/storage/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = CoAConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_config", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const cfg = parsed.data;

  let handle: StartedCoAServer | null = null;
  const job = createJob({
    kind: "coa-server",
    name: cfg.name,
    config: cfg,
    stop: async () => {
      await handle?.stop();
    },
  });

  try {
    handle = await startCoAServer(cfg, job.bus);
    setStatus(job, "running");
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
