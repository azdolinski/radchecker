import { NextResponse } from "next/server";

import { jobSnapshot, listJobs } from "@/lib/jobs/registry";
import { listPersistedJobs, metaToSnapshot } from "@/lib/jobs/persistence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const live = listJobs().map(jobSnapshot);
  const liveIds = new Set(live.map((j) => j.id));
  const historical = (await listPersistedJobs())
    .filter((m) => !liveIds.has(m.id))
    .map(metaToSnapshot);
  const jobs = [...live, ...historical].sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ jobs });
}
