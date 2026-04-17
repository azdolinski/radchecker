import { NextResponse } from "next/server";

import { getJob, jobSnapshot, removeJob } from "@/lib/jobs/registry";
import {
  findJobDirById,
  metaToSnapshot,
  readMeta,
  removeJobDir,
} from "@/lib/jobs/persistence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const job = getJob(id);
  if (job) return NextResponse.json({ job: jobSnapshot(job) });

  const dir = await findJobDirById(id);
  if (dir) {
    const meta = await readMeta(dir);
    if (meta) return NextResponse.json({ job: metaToSnapshot(meta) });
  }
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (removeJob(id)) return NextResponse.json({ ok: true });

  // Historical-only job: no in-memory entry, just an on-disk directory.
  const dir = await findJobDirById(id);
  if (!dir) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await removeJobDir(dir);
  return NextResponse.json({ ok: true });
}
