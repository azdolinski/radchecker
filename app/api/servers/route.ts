import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { readAllServers, writeServer } from "@/lib/storage/yamlStore";
import { ServerConfigSchema } from "@/lib/storage/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const servers = await readAllServers();
  servers.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ servers });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const input = ensureId(body);
  const parsed = ServerConfigSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_server", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await writeServer(parsed.data);
  return NextResponse.json({ server: parsed.data }, { status: 201 });
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
