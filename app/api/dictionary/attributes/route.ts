import { NextResponse } from "next/server";

import {
  getActiveAttributes,
  getActivationReport,
  getRevision,
  initDictionaries,
} from "@/lib/radius/dictionaryIndex";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  // Cold start — lazily init so /coa-sender works without visiting /settings first.
  const report = getActivationReport();
  if (report.builtin.length === 0 && report.user.length === 0) {
    await initDictionaries();
  }
  return NextResponse.json(
    { attributes: getActiveAttributes(), revision: getRevision() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
