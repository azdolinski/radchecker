import { NextResponse } from "next/server";

import { listServers, readServer, writeServer } from "@/lib/storage/yamlStore";
import { ServerConfigSchema } from "@/lib/storage/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const names = await listServers();
  const items = await Promise.all(
    names.map(async (name) => {
      try {
        return await readServer(name);
      } catch {
        return null;
      }
    }),
  );
  return NextResponse.json({ servers: items.filter(Boolean) });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = ServerConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_server", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await writeServer(parsed.data);
  return NextResponse.json({ server: parsed.data }, { status: 201 });
}
