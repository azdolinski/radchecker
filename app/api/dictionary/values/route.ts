import { NextResponse } from "next/server";

import {
  getActiveValuesByAttribute,
  getActivationReport,
  getRevision,
  initDictionaries,
} from "@/lib/radius/dictionaryIndex";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const report = getActivationReport();
  if (report.builtin.length === 0 && report.user.length === 0) {
    await initDictionaries();
  }
  return NextResponse.json(
    { values: getActiveValuesByAttribute(), revision: getRevision() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
