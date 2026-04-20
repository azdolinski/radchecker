import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import YAML from "yaml";

import { InvalidPathError, safeDataPath } from "@/lib/storage/fsPaths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getPathParam(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("path");
}

function badPath(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: "invalid_path", message: msg }, { status: 400 });
}

/* ---------- GET ---------- */
export async function GET(req: Request) {
  const rel = getPathParam(req);
  if (!rel) return NextResponse.json({ error: "missing_path" }, { status: 400 });
  try {
    const abs = safeDataPath(rel);
    const content = await fs.readFile(abs, "utf8");
    const stat = await fs.stat(abs);
    return NextResponse.json({
      path: rel,
      content,
      size: stat.size,
      modified: stat.mtimeMs,
    });
  } catch (err) {
    if (err instanceof InvalidPathError) return badPath(err);
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "read_failed", message: (err as Error).message }, { status: 500 });
  }
}

/* ---------- PUT (overwrite existing) ---------- */
export async function PUT(req: Request) {
  return upsert(req, { mustExist: true });
}

/* ---------- POST (create new) ---------- */
export async function POST(req: Request) {
  return upsert(req, { mustExist: false });
}

async function upsert(req: Request, { mustExist }: { mustExist: boolean }) {
  const rel = getPathParam(req);
  if (!rel) return NextResponse.json({ error: "missing_path" }, { status: 400 });
  let body: { content?: string };
  try {
    body = (await req.json()) as { content?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "missing_content" }, { status: 400 });
  }

  // sanity-check YAML parseability; refuse saves that cannot be parsed.
  // Non-yaml browsable files (dictionary/dictionary.*) skip this check — they
  // use FreeRADIUS dictionary syntax, not YAML.
  if (rel.endsWith(".yaml")) {
    try {
      YAML.parse(body.content);
    } catch (err) {
      return NextResponse.json(
        { error: "invalid_yaml", message: (err as Error).message },
        { status: 400 },
      );
    }
  }

  try {
    const abs = safeDataPath(rel);
    if (mustExist) {
      try {
        await fs.access(abs);
      } catch {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
    } else {
      // POST — must not exist
      try {
        await fs.access(abs);
        return NextResponse.json({ error: "already_exists" }, { status: 409 });
      } catch {
        /* OK, does not exist */
      }
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body.content, "utf8");
    const stat = await fs.stat(abs);
    return NextResponse.json(
      { path: rel, size: stat.size, modified: stat.mtimeMs },
      { status: mustExist ? 200 : 201 },
    );
  } catch (err) {
    if (err instanceof InvalidPathError) return badPath(err);
    return NextResponse.json({ error: "write_failed", message: (err as Error).message }, { status: 500 });
  }
}

/* ---------- DELETE ---------- */
export async function DELETE(req: Request) {
  const rel = getPathParam(req);
  if (!rel) return NextResponse.json({ error: "missing_path" }, { status: 400 });
  try {
    const abs = safeDataPath(rel);
    try {
      await fs.unlink(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      throw err;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InvalidPathError) return badPath(err);
    return NextResponse.json({ error: "delete_failed", message: (err as Error).message }, { status: 500 });
  }
}
