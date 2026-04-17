import { AppShell } from "@/components/app-shell";
import { TestConsole } from "@/components/tests/test-console";

export default function TestsPage() {
  return (
    <AppShell breadcrumb={["Tests"]}>
      <div className="h-full p-6">
        <TestConsole />
      </div>
    </AppShell>
  );
}
