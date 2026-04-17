import { NextResponse } from "next/server";

import { deleteProfile, readProfile, writeProfile } from "@/lib/storage/yamlStore";
import { ClientProfileSchema, NameSchema } from "@/lib/storage/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ name: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { name } = await params;
  const parsedName = NameSchema.safeParse(name);
  if (!parsedName.success) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  try {
    const profile = await readProfile(parsedName.data);
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { name } = await params;
  const parsedName = NameSchema.safeParse(name);
  if (!parsedName.success) return NextResponse.json({ error: "invalid_name" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = ClientProfileSchema.safeParse({ ...(body as object), name: parsedName.data });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_profile", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await writeProfile(parsed.data);
  return NextResponse.json({ profile: parsed.data });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { name } = await params;
  const parsedName = NameSchema.safeParse(name);
  if (!parsedName.success) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  await deleteProfile(parsedName.data);
  return NextResponse.json({ ok: true });
}
