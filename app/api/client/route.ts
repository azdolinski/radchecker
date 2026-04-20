import { NextResponse } from "next/server";
import { z } from "zod";

import { createJob, jobSnapshot, setStatus } from "@/lib/jobs/registry";
import { runSession } from "@/lib/radius/session";
import { readProfile, readServer } from "@/lib/storage/yamlStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  profiles: z.array(z.string().min(1)).min(1).max(50),
  server: z.string().min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let server;
  try {
    server = await readServer(parsed.data.server);
  } catch (err) {
    return NextResponse.json(
      { error: "server_not_found", message: (err as Error).message },
      { status: 404 },
    );
  }

  const snapshots = [];
  for (const profileName of parsed.data.profiles) {
    let profile;
    try {
      profile = await readProfile(profileName);
    } catch (err) {
      return NextResponse.json(
        { error: "profile_not_found", profile: profileName, message: (err as Error).message },
        { status: 404 },
      );
    }

    let stopRequested = false;
    const job = createJob({
      kind: "client-session",
      name: `${profile.name}@${server.name}`,
      config: { profile: profile.name, server: server.name, durationSeconds: profile.accounting.durationSeconds },
      stop: async () => {
        stopRequested = true;
      },
    });
    setStatus(job, "running");

    const profileRef = profile;
    void (async () => {
      try {
        const outcome = await runSession(profileRef, server, {
          shouldStop: () => stopRequested,
          onReply: (code, latencyMs) => {
            const prev = (job.stats.byReply as Record<string, number>) ?? {};
            const next = { ...prev, [code]: (prev[code] ?? 0) + 1 };
            job.bus.stats({
              ...(job.stats as Record<string, unknown>),
              byReply: next,
              lastLatencyMs: Math.round(latencyMs),
            });
          },
          onLog: (msg, data) => job.bus.info(msg, data),
          onStateChange: (state) => job.bus.info(`state → ${state}`),
          onPacket: (packet) => {
            const arrow = packet.direction === "tx" ? ">>>" : "<<<";
            const verb = packet.direction === "tx" ? "SENDING" : "RECEIVED";
            const lat =
              packet.latencyMs != null ? ` (${packet.latencyMs.toFixed(1)}ms)` : "";
            job.bus.info(
              `${arrow} ${verb} ${packet.code} Id=${packet.identifier} ${packet.src} → ${packet.dst}${lat}`,
              { packet },
            );
          },
        });
        if (outcome.ok) {
          job.bus.info(`session completed · ${outcome.packetsSent} packets`, {
            packetsSent: outcome.packetsSent,
            authCode: outcome.authCode,
          });
          setStatus(job, "completed");
        } else {
          job.bus.warn(
            outcome.error ?? outcome.reason ?? "session failed",
            { authCode: outcome.authCode },
          );
          setStatus(job, "failed", outcome.error ?? outcome.reason);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        job.bus.error(`crashed: ${msg}`);
        setStatus(job, "failed", msg);
      }
    })();

    snapshots.push(jobSnapshot(job));
  }

  return NextResponse.json({ jobs: snapshots }, { status: 201 });
}
