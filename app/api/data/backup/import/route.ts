import { NextResponse } from "next/server";

import {
  applyBundle,
  BundleParseError,
  parseBundle,
  type ImportStrategy,
} from "@/lib/storage/backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isStrategy(v: unknown): v is ImportStrategy {
  return v === "replace" || v === "merge";
}

export async function POST(req: Request) {
  let body: { bundle?: unknown; strategy?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.bundle !== "string" || body.bundle.length === 0) {
    return NextResponse.json({ error: "missing_bundle" }, { status: 400 });
  }
  if (!isStrategy(body.strategy)) {
    return NextResponse.json(
      { error: "invalid_strategy", message: "expected replace|merge" },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = parseBundle(body.bundle);
  } catch (err) {
    if (err instanceof BundleParseError) {
      return NextResponse.json({ error: "invalid_bundle", message: err.message }, { status: 400 });
    }
    throw err;
  }

  const report = await applyBundle(parsed, body.strategy);
  return NextResponse.json(report);
}
