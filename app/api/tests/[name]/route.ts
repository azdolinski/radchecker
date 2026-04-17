import { NextResponse } from "next/server";

import {
  deleteTest,
  readRawTestYaml,
  writeRawTestYaml,
} from "@/lib/storage/yamlStore";
import { NameSchema } from "@/lib/storage/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ name: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { name } = await params;
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  try {
    const yaml = await readRawTestYaml(parsed.data);
    return NextResponse.json({ name: parsed.data, yaml });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { name } = await params;
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  let body: { yaml?: string };
  try {
    body = (await req.json()) as { yaml?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.yaml !== "string") {
    return NextResponse.json({ error: "missing_yaml" }, { status: 400 });
  }
  await writeRawTestYaml(parsed.data, body.yaml);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { name } = await params;
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  await deleteTest(parsed.data);
  return NextResponse.json({ ok: true });
}
