import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@/lib/jobs/types";

const LABEL: Record<JobStatus | "disconnected", string> = {
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  completed: "Completed",
  failed: "Failed",
  disconnected: "Disconnected",
};

const TONE: Record<JobStatus | "disconnected", "running" | "stopped" | "failed" | "pending" | "neutral"> = {
  starting: "pending",
  running: "running",
  stopping: "pending",
  completed: "stopped",
  failed: "failed",
  disconnected: "neutral",
};

export function StatusBadge({ status }: { status: JobStatus | "disconnected" }) {
  return (
    <Badge tone={TONE[status]}>
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80"
        aria-hidden
      />
      {LABEL[status]}
    </Badge>
  );
}
