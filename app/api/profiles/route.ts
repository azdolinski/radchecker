import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { readAllProfiles, writeProfile } from "@/lib/storage/yamlStore";
import { ClientProfileSchema } from "@/lib/storage/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const profiles = await readAllProfiles();
  profiles.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ profiles });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const input = ensureId(body);
  const parsed = ClientProfileSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_profile", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await writeProfile(parsed.data);
  return NextResponse.json({ profile: parsed.data }, { status: 201 });
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
