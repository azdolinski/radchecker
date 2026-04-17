import { NextResponse } from "next/server";

import { getJob } from "@/lib/jobs/registry";
import { findJobDirById, readMeta, streamLogs } from "@/lib/jobs/persistence";
import type { LogBusEvent } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return streamHistorical(id);

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let listener: ((ev: LogBusEvent) => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseLine(event, data)));
      };

      // 1. Replay buffer
      const replay = job.bus.replay();
      for (const entry of replay.logs) send("log", entry);
      send("stats", replay.stats);
      send("status", { status: replay.status, error: replay.error });

      // 2. Live subscription
      listener = (ev) => {
        if (ev.type === "log") send("log", ev.entry);
        else if (ev.type === "stats") send("stats", ev.stats);
        else if (ev.type === "status") send("status", { status: ev.status, error: ev.error });
      };
      job.bus.on("event", listener);

      // 3. Heartbeat every 15s (keeps intermediaries from killing the connection)
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15000);

      // 4. Close on client abort
      req.signal.addEventListener("abort", () => {
        if (listener) job.bus.off("event", listener);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (listener) job.bus.off("event", listener);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return sseResponse(stream);
}

/**
 * Replay logs for a historical (persisted but no longer in-memory) job.
 * Streams logs.jsonl line-by-line as `event: log` frames, then emits the
 * final status from meta.json and closes. No live subscription — the job's
 * bus is long gone.
 */
async function streamHistorical(id: string): Promise<Response> {
  const dir = await findJobDirById(id);
  if (!dir) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const meta = await readMeta(dir);
  if (!meta) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseLine(event, data)));
      await streamLogs(dir, (entry) => send("log", entry));
      send("stats", meta.stats ?? {});
      send("status", { status: meta.status, error: meta.error });
      controller.close();
    },
  });
  return sseResponse(stream);
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
