import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { listJobs } from "@/lib/jobs/registry";
import { readAllCoAConfigs, writeCoA } from "@/lib/storage/yamlStore";
import { CoAConfigSchema } from "@/lib/storage/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const configs = await readAllCoAConfigs();
  configs.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ configs });
}

export async function POST(req: Request) {
  const running = listJobs().some(
    (j) =>
      j.kind === "coa-server" &&
      (j.status === "starting" || j.status === "running" || j.status === "stopping"),
  );
  if (running) {
    return NextResponse.json(
      {
        error: "server_running",
        message: "Stop the running CoA server before creating a new profile",
      },
      { status: 409 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const input = ensureId(body);
  const parsed = CoAConfigSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_config", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await writeCoA(parsed.data);
  return NextResponse.json({ config: parsed.data }, { status: 201 });
}

function ensureId(body: unknown): unknown {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    if (typeof obj.id !== "string" || obj.id.length === 0) {
      return { ...obj, id: randomUUID() };
    }
  }
  return body;
}
