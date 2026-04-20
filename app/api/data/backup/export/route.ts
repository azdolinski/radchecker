import { NextResponse } from "next/server";
import YAML from "yaml";

import { buildBundle, type BackupScope } from "@/lib/storage/backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isScope(v: string | null): v is BackupScope {
  return v === "all" || v === "profiles" || v === "tests";
}

function stamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`
  );
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("scope") ?? "all";
  if (!isScope(raw)) {
    return NextResponse.json(
      { error: "invalid_scope", message: `expected all|profiles|tests, got "${raw}"` },
      { status: 400 },
    );
  }

  const bundle = await buildBundle(raw);
  const yamlText = YAML.stringify(bundle);
  const filename = `radchecker-backup-${raw}-${stamp()}.yaml`;

  return new NextResponse(yamlText, {
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
