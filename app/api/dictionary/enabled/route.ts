import { NextResponse } from "next/server";
import { z } from "zod";

import { DictionaryConfigSchema } from "@/lib/storage/schemas";
import { writeDictionaryConfig } from "@/lib/storage/yamlStore";
import { listBuiltin } from "@/lib/radius/dictionarySources";
import {
  getRevision,
  rebuildIndex,
} from "@/lib/radius/dictionaryIndex";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = DictionaryConfigSchema;

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const builtin = await listBuiltin();
  const known = new Set(builtin.map((b) => b.id));
  const unknown = parsed.data.enabled.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: "unknown_dictionary", ids: unknown },
      { status: 400 },
    );
  }

  await writeDictionaryConfig(parsed.data);
  const report = await rebuildIndex();
  return NextResponse.json({ ...report, revision: getRevision() });
}
