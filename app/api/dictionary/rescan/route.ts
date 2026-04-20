import { NextResponse } from "next/server";

import { getRevision, rebuildIndex } from "@/lib/radius/dictionaryIndex";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const report = await rebuildIndex();
  return NextResponse.json({ ...report, revision: getRevision() });
}
