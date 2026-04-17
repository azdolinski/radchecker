import type { LogEntry, PacketLog } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

export interface LogLineProps {
  log: LogEntry;
  /** Optional profile tag shown in front of the message (e.g. `[azdolinski]`). */
  profile?: string;
}

/**
 * Shared log renderer for Client Emulator and Job Detail views. Renders:
 *   - HH:MM:SS.mmm timestamp (explicit time parts — omitting `hour`/`minute`/
 *     `second` in `toLocaleTimeString` options triggers a V8 bug where only
 *     fractional seconds are emitted).
 *   - Optional profile tag.
 *   - Level-coloured message; cyan + bold for `=== Step ... ===` headers.
 *   - Indented AVP block when `log.data.packet` is present (RADIUS TX/RX
 *     lines). Buffer values arrive from SSE JSON as
 *     `{ type: "Buffer", data: number[] }` — rendered as `0x<hex>`.
 */
export function LogLine({ log, profile }: LogLineProps) {
  const packet = (log.data as { packet?: PacketLog } | undefined)?.packet;
  const isHeader = log.message.startsWith("===");
  return (
    <div className="py-0.5">
      <div className="flex gap-2">
        <span className="shrink-0 text-[color:var(--color-muted-foreground)]">
          {new Date(log.ts).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            fractionalSecondDigits: 3,
          })}
        </span>
        {profile ? (
          <span className="shrink-0 font-semibold text-[color:var(--color-primary)]">
            [{profile}]
          </span>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 break-all",
            log.level === "error" && "text-red-500",
            log.level === "warn" && "text-amber-500",
            log.level === "debug" && "text-[color:var(--color-muted-foreground)]",
            isHeader && "font-semibold text-cyan-600 dark:text-cyan-400",
          )}
        >
          {log.message}
        </span>
      </div>
      {packet && packet.attributes.length > 0 ? (
        <div className="ml-[13ch] mt-0.5 border-l-2 border-[color:var(--color-border)] pl-3 text-[color:var(--color-muted-foreground)]">
          {packet.attributes.map(([k, v], j) => (
            <div key={j}>
              <span className="text-[color:var(--color-foreground)]/70">{k}</span>
              : {formatAttr(v)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Render a RADIUS attribute value. Node `Buffer`s arrive via SSE JSON as
 * `{ type: "Buffer", data: number[] }` — render as `0x<hex>` rather than the
 * unreadable JSON shape. Strings/numbers pass through.
 */
export function formatAttr(v: unknown): string {
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (
    v &&
    typeof v === "object" &&
    (v as { type?: string }).type === "Buffer" &&
    Array.isArray((v as { data?: unknown }).data)
  ) {
    const bytes = (v as { data: number[] }).data;
    return "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
