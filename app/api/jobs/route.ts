import { NextResponse } from "next/server";

import { jobSnapshot, listJobs } from "@/lib/jobs/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = listJobs().map(jobSnapshot);
  return NextResponse.json({ jobs });
}
