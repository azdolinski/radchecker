import { AppShell } from "@/components/app-shell";
import { DashboardFeatureCards } from "@/components/dashboard/feature-cards";
import { JobsList } from "@/components/jobs/jobs-list";

export default function DashboardPage() {
  return (
    <AppShell breadcrumb={["Dashboard"]}>
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">radchecker</h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
            Lightweight FreeRADIUS testing toolkit — no database, no auth, everything local.
          </p>
        </div>

        <DashboardFeatureCards />

        <div className="mt-10 space-y-3">
          <h3 className="text-sm font-medium">Jobs</h3>
          <JobsList />
        </div>
      </div>
    </AppShell>
  );
}
