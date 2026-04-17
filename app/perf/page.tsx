import { AppShell } from "@/components/app-shell";
import { PerfConsole } from "@/components/perf/perf-console";

export default function PerfPage() {
  return (
    <AppShell breadcrumb={["Perf Test"]}>
      <div className="h-full p-6">
        <PerfConsole />
      </div>
    </AppShell>
  );
}
