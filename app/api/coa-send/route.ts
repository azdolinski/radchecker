import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { createJob, jobSnapshot, setStatus } from "@/lib/jobs/registry";
import { runCoASend } from "@/lib/radius/coaSend";
import { CoAPacketProfileSchema, type CoAPacketProfile } from "@/lib/storage/schemas";
import { readCoAPacketById } from "@/lib/storage/yamlStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SendBody =
  | { packetId: string; inline?: never }
  | { inline: CoAPacketProfile; packetId?: never };

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { packetId, inline } = (body ?? {}) as SendBody;

  let profile: CoAPacketProfile;
  if (typeof packetId === "string" && packetId.length > 0) {
    const loaded = await readCoAPacketById(packetId);
    if (!loaded) {
      return NextResponse.json(
        { error: "packet_not_found", message: `No packet profile with id "${packetId}"` },
        { status: 404 },
      );
    }
    profile = loaded;
  } else if (inline) {
    const input = ensureId(inline);
    const parsed = CoAPacketProfileSchema.safeParse(input);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_profile", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    profile = parsed.data;
  } else {
    return NextResponse.json(
      { error: "missing_target", message: "Provide either { packetId } or { inline }" },
      { status: 400 },
    );
  }

  const job = createJob({
    kind: "coa-send",
    name: profile.name,
    config: profile,
    stop: async () => {
      /* one-shot, no long-running resources to clean up */
    },
  });

  // fire-and-forget — status transitions happen asynchronously
  setStatus(job, "running");
  void runCoASend(profile, job.bus)
    .then(() => setStatus(job, "completed"))
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(job, "failed", msg);
    });

  return NextResponse.json({ job: jobSnapshot(job) }, { status: 201 });
}

function ensureId(body: unknown): unknown {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    if (typeof obj.id !== "string" || obj.id.length === 0) {
      return { ...obj, id: randomUUID() };
    }
  }
  return body;
}
