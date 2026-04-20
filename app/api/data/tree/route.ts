import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { dataDir, RUNTIME_SUBDIRS } from "@/lib/storage/fsPaths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type TreeEntry =
  | { type: "dir"; name: string; path: string; children: TreeEntry[] }
  | { type: "file"; name: string; path: string; size: number; modified: number };

const RUNTIME_SET = new Set<string>(RUNTIME_SUBDIRS);

async function walkDir(absDir: string, relDir: string): Promise<TreeEntry[]> {
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const result: TreeEntry[] = [];
  for (const e of entries) {
    if (relDir === "" && RUNTIME_SET.has(e.name)) continue;
    const abs = path.join(absDir, e.name);
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      const children = await walkDir(abs, rel);
      result.push({ type: "dir", name: e.name, path: rel, children });
    } else if (e.isFile() && e.name.endsWith(".yaml")) {
      const stat = await fs.stat(abs);
      result.push({
        type: "file",
        name: e.name,
        path: rel,
        size: stat.size,
        modified: stat.mtimeMs,
      });
    }
  }

  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

export async function GET() {
  const tree = await walkDir(dataDir(), "");
  return NextResponse.json({ tree });
}
