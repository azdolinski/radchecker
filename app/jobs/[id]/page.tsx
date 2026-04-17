import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { JobDetail } from "@/components/jobs/job-detail";
import { getJob, jobSnapshot } from "@/lib/jobs/registry";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) notFound();
  const snapshot = jobSnapshot(job);

  return (
    <AppShell breadcrumb={["Jobs", snapshot.name]}>
      <div className="h-full p-6">
        <JobDetail snapshot={snapshot} />
      </div>
    </AppShell>
  );
}
