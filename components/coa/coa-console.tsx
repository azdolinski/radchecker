"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Square, Play, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/jobs/status-badge";
import { PacketCard } from "@/components/coa/packet-card";
import { useJobLogs } from "@/hooks/useJobLogs";
import type { CoAConfig } from "@/lib/storage/schemas";
import type { PacketLog } from "@/lib/radius/coaServer";
import type { JobSnapshot, LogEntry } from "@/lib/jobs/types";

const ACTIVE_STATUSES = new Set(["starting", "running", "stopping"]);

const INITIAL_CONFIG: CoAConfig = {
  name: "default",
  bind: "0.0.0.0",
  port: 3799,
  secret: "testing123",
  policy: "always-ack",
};

function isPacketLog(data: unknown): data is PacketLog {
  return Boolean(
    data && typeof data === "object" && "direction" in data && "code" in data && "attributes" in data,
  );
}

export function CoAConsole() {
  const [cfg, setCfg] = useState<CoAConfig>(INITIAL_CONFIG);
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const live = useJobLogs(jobId);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Re-attach to an already-running CoA server job after navigation/refresh.
  // Without this, jobId would reset to null every time the route remounts
  // and the user could spawn a duplicate that fights for the same port.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/jobs");
        if (!res.ok) return;
        const data = (await res.json()) as { jobs?: JobSnapshot[] };
        const active = (data.jobs ?? [])
          .filter((j) => j.kind === "coa-server" && ACTIVE_STATUSES.has(j.status))
          .sort((a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt))[0];
        if (!cancelled && active) {
          setJobId(active.id);
          const restored = active.config as CoAConfig | undefined;
          if (restored) setCfg(restored);
        }
      } catch {
        // network error — stay disconnected; user can retry manually
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const packets = useMemo(
    () =>
      live.logs
        .filter((log): log is LogEntry & { data: PacketLog } => isPacketLog(log.data))
        .slice(-200),
    [live.logs],
  );

  const effectiveStatus = jobId ? live.status : ("disconnected" as const);
  const stats = live.stats as {
    received?: number;
    sent?: number;
    errors?: number;
    byCode?: Record<string, number>;
    listeningOn?: string;
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [packets.length]);

  const onStart = useCallback(async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/coa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const body = (await res.json()) as {
        job?: { id: string };
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(body.message ?? body.error ?? "Start failed");
        return;
      }
      if (body.job?.id) {
        setJobId(body.job.id);
        toast.success(`CoA server started on :${cfg.port}`);
      }
    } catch (err) {
      toast.error(`Network error: ${(err as Error).message}`);
    } finally {
      setStarting(false);
    }
  }, [cfg]);

  const onStop = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}/stop`, { method: "POST" });
      if (!res.ok) {
        toast.error("Stop failed");
        return;
      }
      toast.info("Stopping server…");
    } catch (err) {
      toast.error(`Network error: ${(err as Error).message}`);
    }
  }, [jobId]);

  return (
    <div className="grid h-full min-h-0 gap-4 md:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>CoA Server</CardTitle>
            <StatusBadge status={effectiveStatus} />
          </div>
          <CardDescription>
            Listen on UDP and auto-ACK/NAK CoA-Request (43) + Disconnect-Request (40).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="coa-name">Name</Label>
            <Input
              id="coa-name"
              value={cfg.name}
              onChange={(e) => setCfg({ ...cfg, name: e.target.value })}
              disabled={!!jobId}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="coa-bind">Bind</Label>
              <Input
                id="coa-bind"
                value={cfg.bind}
                onChange={(e) => setCfg({ ...cfg, bind: e.target.value })}
                disabled={!!jobId}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coa-port">Port</Label>
              <Input
                id="coa-port"
                type="number"
                value={cfg.port}
                onChange={(e) => setCfg({ ...cfg, port: Number(e.target.value) || 0 })}
                disabled={!!jobId}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coa-secret">Shared secret</Label>
            <Input
              id="coa-secret"
              value={cfg.secret}
              onChange={(e) => setCfg({ ...cfg, secret: e.target.value })}
              disabled={!!jobId}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coa-policy">Policy</Label>
            <select
              id="coa-policy"
              className="flex h-9 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-1 text-sm"
              value={cfg.policy}
              onChange={(e) =>
                setCfg({ ...cfg, policy: e.target.value as CoAConfig["policy"] })
              }
              disabled={!!jobId}
            >
              <option value="always-ack">always-ack</option>
              <option value="always-nak">always-nak</option>
              <option value="random">random (70% ACK)</option>
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            {!jobId ? (
              <Button onClick={onStart} disabled={starting}>
                <Play className="h-3.5 w-3.5" />
                {starting ? "Starting…" : "Start server"}
              </Button>
            ) : (
              <>
                <Button variant="destructive" onClick={onStop}>
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setJobId(null);
                    toast.info("Detached from job (still running on server)");
                  }}
                >
                  Detach
                </Button>
              </>
            )}
          </div>

          {live.error ? (
            <div className="flex items-start gap-2 rounded-md bg-red-500/10 p-2 text-[11px] text-red-600 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {live.error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="grid grid-cols-4 gap-3">
          <Kpi label="Received" value={stats.received ?? 0} />
          <Kpi label="Sent" value={stats.sent ?? 0} />
          <Kpi label="Errors" value={stats.errors ?? 0} />
          <Kpi label="Listening" value={stats.listeningOn ?? "—"} />
        </div>
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="py-3">
            <CardTitle>Live packets</CardTitle>
            <CardDescription>
              {packets.length === 0
                ? "Waiting for packets — send a CoA-Request to start seeing traffic here."
                : `Last ${packets.length} packets`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto pt-0">
            <div className="space-y-2">
              {packets.map((p, i) => (
                <PacketCard key={`${p.ts}-${i}`} packet={p.data} />
              ))}
              <div ref={endRef} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] text-[color:var(--color-muted-foreground)]">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
    </Card>
  );
}
