"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PacketLog } from "@/lib/radius/coaServer";

function formatTs(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export function PacketCard({ packet }: { packet: PacketLog }) {
  const incoming = packet.direction === "RECV";
  const Icon = incoming ? ArrowDownLeft : ArrowUpRight;

  return (
    <div
      className={cn(
        "rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-3 text-xs",
        incoming ? "border-l-2 border-l-emerald-500" : "border-l-2 border-l-sky-500",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5", incoming ? "text-emerald-500" : "text-sky-500")} />
        <span className="font-mono text-[10px] text-[color:var(--color-muted-foreground)]">
          {formatTs(packet.ts)}
        </span>
        <Badge tone={incoming ? "running" : "primary"}>
          {packet.direction} · {packet.code}
        </Badge>
        <span className="text-[color:var(--color-muted-foreground)]">
          id={packet.identifier} · len={packet.length}B
        </span>
        <span className="ml-auto font-mono text-[10px] text-[color:var(--color-muted-foreground)]">
          {packet.remote}
        </span>
      </div>
      {Object.keys(packet.attributes).length > 0 ? (
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
          {Object.entries(packet.attributes).map(([k, v]) => (
            <div key={k} className="contents">
              <span className="text-[color:var(--color-muted-foreground)]">{k}</span>
              <span className="break-all text-[color:var(--color-foreground)]">
                {Array.isArray(v) ? v.join(", ") : String(v)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
