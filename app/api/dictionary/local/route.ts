import { NextResponse } from "next/server";

import { readLocalDict, writeLocalDict } from "@/lib/storage/yamlStore";
import {
  DictionaryParseError,
  parseFreeRadiusDictionary,
} from "@/lib/radius/parseFreeRadiusDictionary";
import {
  getRevision,
  rebuildIndex,
} from "@/lib/radius/dictionaryIndex";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const content = await readLocalDict();
  return NextResponse.json({ content });
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const content =
    body && typeof body === "object" && "content" in body
      ? (body as { content: unknown }).content
      : undefined;
  if (typeof content !== "string") {
    return NextResponse.json(
      { error: "invalid_payload", message: "body.content must be a string" },
      { status: 400 },
    );
  }

  try {
    parseFreeRadiusDictionary(content);
  } catch (err) {
    if (err instanceof DictionaryParseError) {
      return NextResponse.json(
        { error: "parse_error", line: err.line, message: err.message },
        { status: 400 },
      );
    }
    throw err;
  }

  await writeLocalDict(content);
  const report = await rebuildIndex();
  return NextResponse.json({ ok: true, report, revision: getRevision() });
}
