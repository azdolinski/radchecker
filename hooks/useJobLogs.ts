"use client";

import { useEffect, useRef, useState } from "react";

import type { JobStats, JobStatus, LogEntry } from "@/lib/jobs/types";

export interface UseJobLogsState {
  logs: LogEntry[];
  stats: JobStats;
  status: JobStatus | "disconnected";
  error?: string;
}

const INITIAL: UseJobLogsState = {
  logs: [],
  stats: {},
  status: "disconnected",
};

/** Subscribe to an SSE endpoint and expose the latest state as React state. */
export function useJobLogs(jobId: string | null | undefined): UseJobLogsState {
  const [state, setState] = useState<UseJobLogsState>(INITIAL);
  const ref = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) {
      setState(INITIAL);
      return;
    }
    const es = new EventSource(`/api/jobs/${jobId}/logs`);
    ref.current = es;

    es.addEventListener("log", (evt) => {
      const entry = JSON.parse((evt as MessageEvent).data) as LogEntry;
      setState((prev) => ({ ...prev, logs: [...prev.logs, entry].slice(-1000) }));
    });

    es.addEventListener("stats", (evt) => {
      const stats = JSON.parse((evt as MessageEvent).data) as JobStats;
      setState((prev) => ({ ...prev, stats }));
    });

    es.addEventListener("status", (evt) => {
      const { status, error } = JSON.parse((evt as MessageEvent).data) as {
        status: JobStatus;
        error?: string;
      };
      setState((prev) => ({ ...prev, status, error }));
    });

    es.onerror = () => {
      setState((prev) => ({ ...prev, status: "disconnected" }));
    };

    return () => {
      es.close();
      ref.current = null;
    };
  }, [jobId]);

  return state;
}
