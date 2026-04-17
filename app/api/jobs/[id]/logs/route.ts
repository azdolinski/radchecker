import { NextResponse } from "next/server";

import { getJob } from "@/lib/jobs/registry";
import type { LogBusEvent } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

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

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
