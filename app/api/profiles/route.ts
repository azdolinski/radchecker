import { NextResponse } from "next/server";

import { listProfiles, readProfile, writeProfile } from "@/lib/storage/yamlStore";
import { ClientProfileSchema } from "@/lib/storage/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const names = await listProfiles();
  const items = await Promise.all(
    names.map(async (name) => {
      try {
        return await readProfile(name);
      } catch {
        return null;
      }
    }),
  );
  return NextResponse.json({ profiles: items.filter(Boolean) });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = ClientProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_profile", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await writeProfile(parsed.data);
  return NextResponse.json({ profile: parsed.data }, { status: 201 });
}
