import { NextResponse } from "next/server";

import {
  getActivationReport,
  initDictionaries,
  getRevision,
} from "@/lib/radius/dictionaryIndex";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let report = getActivationReport();
  // Cold process (e.g. first request after a dev HMR reload) — lazily init.
  if (report.builtin.length === 0 && report.user.length === 0) {
    report = await initDictionaries();
  }
  return NextResponse.json({ ...report, revision: getRevision() });
}
