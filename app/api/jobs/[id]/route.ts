import { NextResponse } from "next/server";

import { getJob, jobSnapshot, removeJob } from "@/lib/jobs/registry";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ job: jobSnapshot(job) });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const ok = removeJob(id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
