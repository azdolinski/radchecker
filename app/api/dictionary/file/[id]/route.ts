import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";

import { listBuiltin, listUserFiles } from "@/lib/radius/dictionarySources";
import {
  DictionaryParseError,
  parseFreeRadiusDictionary,
} from "@/lib/radius/parseFreeRadiusDictionary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const [builtin, user] = await Promise.all([listBuiltin(), listUserFiles()]);
  const info = [...builtin, ...user].find((f) => f.id === id);
  if (!info) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const content = await fs.readFile(info.path, "utf8");
  let parsed;
  try {
    const p = parseFreeRadiusDictionary(content);
    parsed = {
      attributes: p.attributes,
      vendors: p.vendors,
      valueCount: p.values.length,
    };
  } catch (err) {
    if (err instanceof DictionaryParseError) {
      return NextResponse.json(
        {
          id,
          source: info.source,
          path: info.path,
          content,
          error: { line: err.line, message: err.message },
        },
        { status: 200 },
      );
    }
    throw err;
  }

  return NextResponse.json({
    id,
    source: info.source,
    isLocal: info.isLocal,
    path: info.path,
    content,
    parsed,
  });
}
