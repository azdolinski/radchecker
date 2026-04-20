import { NextResponse } from "next/server";

import { deleteCoA, readCoA, writeCoA } from "@/lib/storage/yamlStore";
import { CoAConfigSchema, NameSchema } from "@/lib/storage/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ name: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { name } = await params;
  const parsedName = NameSchema.safeParse(name);
  if (!parsedName.success) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  try {
    const config = await readCoA(parsedName.data);
    return NextResponse.json({ config });
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

  let stored: Awaited<ReturnType<typeof readCoA>>;
  try {
    stored = await readCoA(parsedName.data);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const bodyObj = (body as { id?: unknown } | null) ?? {};
  if (typeof bodyObj.id === "string" && bodyObj.id.length > 0 && bodyObj.id !== stored.id) {
    return NextResponse.json(
      { error: "id_mismatch", message: "id is immutable once assigned" },
      { status: 400 },
    );
  }
  const parsed = CoAConfigSchema.safeParse({
    ...(body as object),
    id: stored.id,
    name: parsedName.data,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_config", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await writeCoA(parsed.data);
  return NextResponse.json({ config: parsed.data });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { name } = await params;
  const parsedName = NameSchema.safeParse(name);
  if (!parsedName.success) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  await deleteCoA(parsedName.data);
  return NextResponse.json({ ok: true });
}
