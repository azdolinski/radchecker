import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { DATA_SUBDIRS, dataDir, type DataSubdir } from "@/lib/storage/fsPaths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function listFiles(subdir: DataSubdir) {
  const dir = path.join(dataDir(), subdir);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.endsWith(".yaml"))
        .map(async (e) => {
          const full = path.join(dir, e.name);
          const stat = await fs.stat(full);
          return {
            name: e.name,
            path: `${subdir}/${e.name}`,
            size: stat.size,
            modified: stat.mtimeMs,
          };
        }),
    );
    return files.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function GET() {
  const tree = await Promise.all(
    DATA_SUBDIRS.map(async (subdir) => ({
      subdir,
      files: await listFiles(subdir),
    })),
  );
  return NextResponse.json({ tree });
}
